#!/usr/bin/env python3
"""Fail-closed admission scan for an exact container image or single-platform archive.

The gate bootstraps only Google's official checksum-pinned OSV-Scanner binary,
requests the complete package/advisory inventory, and refuses empty, malformed,
partial or contradictory results. It never installs packages or executes image
content. A finding at any severity, including every MAL-* advisory, is blocking.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from urllib.parse import quote
import uuid


VERSION = "v2.7.0"
# Official release asset digests, independently matched to SHA256SUMS.
ASSETS = {
    ("Darwin", "arm64"): (
        "osv-scanner_darwin_arm64",
        "d4926ef8da134332543be276dff157e4c170f99ad91fc48e89448a8816bdf70b",
    ),
    ("Darwin", "x86_64"): (
        "osv-scanner_darwin_amd64",
        "e82c5df7ab0a42dff29a1cd0660711447b56b4c0483ff66ad8634df10fd81a45",
    ),
    ("Linux", "x86_64"): (
        "osv-scanner_linux_amd64",
        "160c6253e2922e9e0a6a9771c5c4c40a4b3c6090b34a3cdd5e80c96cc2e4218b",
    ),
    ("Linux", "arm64"): (
        "osv-scanner_linux_arm64",
        "4061ef4c021ed3c47f203b818f337e351336cc5cd67c0274fc36bd1dfc728dd7",
    ),
    ("Windows", "x86_64"): (
        "osv-scanner_windows_amd64.exe",
        "9964ed64ec9a387391eb4cc006ad5c531154821aef29b793e02c448de4686438",
    ),
    ("Windows", "arm64"): (
        "osv-scanner_windows_arm64.exe",
        "3e630381c1f1fd3c9c4d447e6ff2ef6c737083371722773db8337eead0f97962",
    ),
}
ROOT = Path(__file__).resolve().parents[1]
MAX_BINARY = 64 * 1024 * 1024
MAX_ARCHIVE = 8 * 1024 * 1024 * 1024
MAX_JSON_MEMBER = 4 * 1024 * 1024
IMAGE_REFERENCE = re.compile(r"^[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$")
PLATFORMS = {"linux/amd64", "linux/arm64"}


class HttpsRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        if not new_url.startswith("https://"):
            raise ValueError("scanner download attempted a non-HTTPS redirect")
        return super().redirect_request(request, response, code, message, headers, new_url)


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_binary(path, expected):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_BINARY:
        raise ValueError("scanner path is invalid")
    if sha256(path) != expected:
        raise ValueError("scanner checksum mismatch; refusing execution")


def scanner():
    machine = platform.machine().lower()
    arch = (
        "arm64"
        if machine in {"arm64", "aarch64"}
        else "x86_64"
        if machine in {"amd64", "x86_64"}
        else machine
    )
    try:
        asset, expected = ASSETS[(platform.system(), arch)]
    except KeyError as error:
        raise ValueError("OSV-Scanner has no admitted asset for this platform") from error
    cache_root = Path(os.environ.get("RUNNER_TEMP", tempfile.gettempdir())).resolve()
    cache = cache_root / "hulumi-osv-image-gate" / VERSION
    cache.mkdir(parents=True, exist_ok=True)
    if any(parent.is_symlink() for parent in (cache, cache.parent, cache.parent.parent)):
        raise ValueError("scanner cache directories must not be symlinks")
    binary = cache / asset
    if not binary.exists():
        request = urllib.request.Request(
            f"https://github.com/google/osv-scanner/releases/download/{VERSION}/{asset}",
            headers={"User-Agent": "Hulumi-OSV-image-gate"},
        )
        opener = urllib.request.build_opener(HttpsRedirect())
        with opener.open(request, timeout=60) as response:
            data = response.read(MAX_BINARY + 1)
        if len(data) > MAX_BINARY or hashlib.sha256(data).hexdigest() != expected:
            raise ValueError("scanner download failed size/checksum verification")
        with tempfile.NamedTemporaryFile(dir=cache, delete=False) as staged:
            staged.write(data)
            temporary = Path(staged.name)
        try:
            temporary.chmod(0o755)
            temporary.replace(binary)
        finally:
            temporary.unlink(missing_ok=True)
    verify_binary(binary, expected)
    return binary


def validate_image_reference(value):
    if not IMAGE_REFERENCE.fullmatch(value) or "//" in value or value.startswith("/"):
        raise ValueError("image must be a lowercase registry/repository@sha256 digest reference")
    return value


def _json_member(bundle, members, name):
    member = members.get(name)
    if member is None or not member.isfile() or member.size <= 0 or member.size > MAX_JSON_MEMBER:
        raise ValueError(f"container archive is missing bounded regular JSON member {name}")
    stream = bundle.extractfile(member)
    if stream is None:
        raise ValueError(f"container archive member {name} is unreadable")
    value = json.loads(stream.read().decode("utf-8"))
    if not isinstance(value, (dict, list)):
        raise ValueError(f"container archive member {name} has an invalid JSON shape")
    return value


def _digest_member(digest):
    if not isinstance(digest, str) or not re.fullmatch(r"sha256:[a-f0-9]{64}", digest):
        raise ValueError("OCI archive contains an invalid descriptor digest")
    return "blobs/sha256/" + digest.removeprefix("sha256:")


def archive_platform(path):
    if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= MAX_ARCHIVE:
        raise ValueError("container archive must be a bounded regular file")
    with tarfile.open(path, "r:*") as bundle:
        members_list = bundle.getmembers()
        if not members_list or len(members_list) > 100_000:
            raise ValueError("container archive has an invalid member count")
        if any(member.name.startswith("/") or ".." in Path(member.name).parts for member in members_list):
            raise ValueError("container archive contains an unsafe member name")
        members = {member.name.lstrip("./"): member for member in members_list}
        if len(members) != len(members_list):
            raise ValueError("container archive contains duplicate member names")

        if "manifest.json" in members:
            manifest = _json_member(bundle, members, "manifest.json")
            if not isinstance(manifest, list) or len(manifest) != 1:
                raise ValueError("Docker archive must contain exactly one image")
            entry = manifest[0]
            if not isinstance(entry, dict) or not isinstance(entry.get("Config"), str):
                raise ValueError("Docker archive manifest has no exact config")
            config = _json_member(bundle, members, entry["Config"])
        elif "index.json" in members and "oci-layout" in members:
            index = _json_member(bundle, members, "index.json")
            descriptors = index.get("manifests") if isinstance(index, dict) else None
            if not isinstance(descriptors, list) or len(descriptors) != 1:
                raise ValueError("OCI archive must contain exactly one image manifest")
            descriptor = descriptors[0]
            if not isinstance(descriptor, dict):
                raise ValueError("OCI archive manifest descriptor is invalid")
            manifest = _json_member(bundle, members, _digest_member(descriptor.get("digest")))
            config_descriptor = manifest.get("config") if isinstance(manifest, dict) else None
            if not isinstance(config_descriptor, dict):
                raise ValueError("OCI archive manifest has no exact config descriptor")
            config = _json_member(
                bundle,
                members,
                _digest_member(config_descriptor.get("digest")),
            )
        else:
            raise ValueError("unsupported container archive layout")

        if not isinstance(config, dict):
            raise ValueError("container archive config is invalid")
        image_platform = f"{config.get('os')}/{config.get('architecture')}"
        if image_platform not in PLATFORMS:
            raise ValueError("container archive is not an admitted linux/amd64 or linux/arm64 image")
        return image_platform


def archive_file_sha256(path, absolute_name):
    """Hash one regular file as resolved across a Docker/OCI archive's layers."""
    target = absolute_name.lstrip("/")
    if not target or ".." in Path(target).parts:
        raise ValueError("embedded archive target is invalid")
    with tarfile.open(path, "r:*") as bundle:
        members_list = bundle.getmembers()
        members = {member.name.lstrip("./"): member for member in members_list}
        if len(members) != len(members_list):
            raise ValueError("container archive contains duplicate member names")
        if "manifest.json" in members:
            manifest = _json_member(bundle, members, "manifest.json")
            if not isinstance(manifest, list) or len(manifest) != 1:
                raise ValueError("Docker archive must contain exactly one image")
            layers = manifest[0].get("Layers") if isinstance(manifest[0], dict) else None
            if not isinstance(layers, list) or not layers or any(
                not isinstance(layer, str) or not layer for layer in layers
            ):
                raise ValueError("Docker archive has no exact layer list")
            layer_names = layers
        elif "index.json" in members and "oci-layout" in members:
            index = _json_member(bundle, members, "index.json")
            descriptors = index.get("manifests") if isinstance(index, dict) else None
            if not isinstance(descriptors, list) or len(descriptors) != 1:
                raise ValueError("OCI archive must contain exactly one image manifest")
            descriptor = descriptors[0]
            if not isinstance(descriptor, dict):
                raise ValueError("OCI archive manifest descriptor is invalid")
            manifest = _json_member(bundle, members, _digest_member(descriptor.get("digest")))
            layers = manifest.get("layers") if isinstance(manifest, dict) else None
            if not isinstance(layers, list) or not layers:
                raise ValueError("OCI archive has no exact layer list")
            layer_names = [
                _digest_member(layer.get("digest"))
                if isinstance(layer, dict)
                else (_ for _ in ()).throw(ValueError("OCI layer descriptor is invalid"))
                for layer in layers
            ]
        else:
            raise ValueError("unsupported container archive layout")

        resolved_digest = None
        parent = str(Path(target).parent)
        base = Path(target).name
        for layer_name in layer_names:
            outer = members.get(layer_name.lstrip("./"))
            if outer is None or not outer.isfile() or outer.size <= 0 or outer.size > MAX_ARCHIVE:
                raise ValueError("container archive layer is missing or invalid")
            stream = bundle.extractfile(outer)
            if stream is None:
                raise ValueError("container archive layer is unreadable")
            with tarfile.open(fileobj=stream, mode="r:*") as layer:
                for member in layer:
                    name = member.name.lstrip("./")
                    if name.startswith("/") or ".." in Path(name).parts:
                        raise ValueError("container layer contains an unsafe member name")
                    if name in {f"{parent}/.wh.{base}", f"{parent}/.wh..wh..opq"}:
                        resolved_digest = None
                    if name != target:
                        continue
                    if not member.isfile() or member.size <= 0 or member.size > MAX_JSON_MEMBER:
                        raise ValueError("embedded runtime lock must be a bounded regular file")
                    embedded = layer.extractfile(member)
                    if embedded is None:
                        raise ValueError("embedded runtime lock is unreadable")
                    resolved_digest = hashlib.sha256(embedded.read()).hexdigest()
        if resolved_digest is None:
            raise ValueError(f"container archive omitted {absolute_name}")
        return resolved_digest


def _identity_list(value, label):
    if not isinstance(value, list) or not value or any(
        not isinstance(item, str) or not item for item in value
    ):
        raise ValueError(f"malformed {label} advisory identity list")
    return set(value)


def validate_report(report):
    if not isinstance(report, dict) or not isinstance(report.get("results"), list):
        raise ValueError("scanner did not return a valid image inventory")
    metadata = report.get("image_metadata")
    if not isinstance(metadata, dict) or not isinstance(metadata.get("os"), str) or not metadata["os"]:
        raise ValueError("scanner omitted image operating-system metadata")
    if not report["results"]:
        raise ValueError("scanner returned an empty image inventory")

    package_count = 0
    advisory_ids = set()
    sources = set()
    for result in report["results"]:
        if not isinstance(result, dict):
            raise ValueError("malformed scanner result")
        source = result.get("source")
        packages = result.get("packages")
        if not isinstance(source, dict) or not all(
            isinstance(source.get(key), str) and source[key] for key in ("path", "type")
        ):
            raise ValueError("scanner result has no exact package source")
        source_identity = (source["path"], source["type"])
        if source_identity in sources:
            raise ValueError("scanner returned a duplicate package source")
        sources.add(source_identity)
        if not isinstance(packages, list) or not packages:
            raise ValueError("scanner returned an empty package source")
        for item in packages:
            package = item.get("package") if isinstance(item, dict) else None
            if not isinstance(package, dict) or not all(
                isinstance(package.get(key), str) and package[key]
                for key in ("name", "version", "ecosystem")
            ):
                raise ValueError("scanner returned a malformed package identity")
            package_count += 1
            groups = item.get("groups", [])
            vulnerabilities = item.get("vulnerabilities", [])
            if not isinstance(groups, list) or not isinstance(vulnerabilities, list):
                raise ValueError("scanner returned a malformed advisory list")
            for group in groups:
                if not isinstance(group, dict):
                    raise ValueError("scanner returned a malformed advisory group")
                advisory_ids.update(_identity_list(group.get("ids"), "group"))
                aliases = group.get("aliases", [])
                if not isinstance(aliases, list) or any(
                    not isinstance(alias, str) or not alias for alias in aliases
                ):
                    raise ValueError("scanner returned malformed advisory aliases")
                advisory_ids.update(aliases)
            for vulnerability in vulnerabilities:
                if not isinstance(vulnerability, dict) or not isinstance(
                    vulnerability.get("id"), str
                ) or not vulnerability["id"]:
                    raise ValueError("scanner returned a malformed vulnerability")
                advisory_ids.add(vulnerability["id"])
                aliases = vulnerability.get("aliases", [])
                if not isinstance(aliases, list) or any(
                    not isinstance(alias, str) or not alias for alias in aliases
                ):
                    raise ValueError("scanner returned malformed vulnerability aliases")
                advisory_ids.update(aliases)
    if package_count == 0:
        raise ValueError("scanner returned no packages")
    return package_count, advisory_ids


def validate_dependency_report(report, lockfile):
    if not isinstance(report, dict) or not isinstance(report.get("results"), list):
        raise ValueError("scanner did not return a valid runtime dependency inventory")
    if len(report["results"]) != 1:
        raise ValueError("scanner must return exactly one runtime dependency source")
    result = report["results"][0]
    source = result.get("source") if isinstance(result, dict) else None
    packages = result.get("packages") if isinstance(result, dict) else None
    if (
        not isinstance(source, dict)
        or source.get("type") != "sbom"
        or not isinstance(source.get("path"), str)
        or Path(source["path"]).resolve() != lockfile.resolve()
    ):
        raise ValueError("scanner runtime dependency source differs from the requested SBOM")
    if not isinstance(packages, list) or not packages:
        raise ValueError("scanner returned an empty runtime dependency inventory")
    advisory_ids = set()
    for item in packages:
        package = item.get("package") if isinstance(item, dict) else None
        if not isinstance(package, dict) or not all(
            isinstance(package.get(key), str) and package[key]
            for key in ("name", "version", "ecosystem")
        ):
            raise ValueError("scanner returned a malformed runtime package identity")
        if package["ecosystem"] != "npm":
            raise ValueError("runtime dependency inventory contains a non-npm package")
        groups = item.get("groups", [])
        vulnerabilities = item.get("vulnerabilities", [])
        if not isinstance(groups, list) or not isinstance(vulnerabilities, list):
            raise ValueError("scanner returned a malformed runtime advisory list")
        for group in groups:
            if not isinstance(group, dict):
                raise ValueError("scanner returned a malformed runtime advisory group")
            advisory_ids.update(_identity_list(group.get("ids"), "runtime group"))
            aliases = group.get("aliases", [])
            if not isinstance(aliases, list) or any(
                not isinstance(alias, str) or not alias for alias in aliases
            ):
                raise ValueError("scanner returned malformed runtime advisory aliases")
            advisory_ids.update(aliases)
        for vulnerability in vulnerabilities:
            if not isinstance(vulnerability, dict) or not isinstance(
                vulnerability.get("id"), str
            ) or not vulnerability["id"]:
                raise ValueError("scanner returned a malformed runtime vulnerability")
            advisory_ids.add(vulnerability["id"])
            aliases = vulnerability.get("aliases", [])
            if not isinstance(aliases, list) or any(
                not isinstance(alias, str) or not alias for alias in aliases
            ):
                raise ValueError("scanner returned malformed runtime vulnerability aliases")
            advisory_ids.update(aliases)
    return len(packages), advisory_ids


def generate_runtime_sbom(runtime, output):
    runtime = runtime.resolve()
    output = output.resolve()
    virtual_store = runtime / "node_modules" / ".pnpm"
    if (
        runtime.is_symlink()
        or not runtime.is_dir()
        or virtual_store.is_symlink()
        or not virtual_store.is_dir()
        or output.parent != runtime
        or output.name != "runtime-dependencies.cdx.json"
    ):
        raise ValueError("runtime SBOM requires a real pnpm deploy directory and fixed output name")
    pairs = set()
    for directory, subdirs, files in os.walk(virtual_store, followlinks=False):
        subdirs[:] = [
            name for name in subdirs if not (Path(directory) / name).is_symlink()
        ]
        if "package.json" not in files:
            continue
        package_path = Path(directory) / "package.json"
        relative_parts = package_path.relative_to(virtual_store).parts
        if not (
            len(relative_parts) == 4
            and relative_parts[1] == "node_modules"
            or len(relative_parts) == 5
            and relative_parts[1] == "node_modules"
            and relative_parts[2].startswith("@")
        ):
            continue
        if (
            package_path.is_symlink()
            or not package_path.is_file()
            or package_path.stat().st_size > MAX_JSON_MEMBER
        ):
            raise ValueError("runtime package manifest must be a bounded regular file")
        package = json.loads(package_path.read_text(encoding="utf-8"))
        name = package.get("name") if isinstance(package, dict) else None
        version = package.get("version") if isinstance(package, dict) else None
        if not isinstance(name, str) or not name or not isinstance(version, str) or not version:
            raise ValueError("runtime package manifest is missing an exact identity")
        if any(character.isspace() for character in name + version):
            raise ValueError("runtime package identity contains whitespace")
        pairs.add((name, version))
    if not 1 <= len(pairs) <= 2_000:
        raise ValueError("runtime dependency inventory is empty or unbounded")
    root_manifest = runtime / "package.json"
    if root_manifest.is_symlink() or not root_manifest.is_file():
        raise ValueError("runtime deployment omitted its root package manifest")
    root_package = json.loads(root_manifest.read_text(encoding="utf-8"))
    root_name = root_package.get("name") if isinstance(root_package, dict) else None
    root_version = root_package.get("version") if isinstance(root_package, dict) else None
    if not isinstance(root_name, str) or not root_name or not isinstance(root_version, str) or not root_version:
        raise ValueError("runtime root package manifest is missing an exact identity")
    components = []
    for name, version in sorted(pairs):
        purl = f"pkg:npm/{quote(name, safe='/')}@{quote(version, safe='.-_~')}"
        components.append(
            {
                "type": "library",
                "name": name,
                "version": version,
                "purl": purl,
                "bom-ref": purl,
            }
        )
    identity = "\n".join(f"{name}@{version}" for name, version in sorted(pairs))
    root_ref = f"pkg:npm/{quote(root_name, safe='/')}@{quote(root_version, safe='.-_~')}"
    sbom = {
        "$schema": "https://cyclonedx.org/schema/bom-1.6.schema.json",
        "bomFormat": "CycloneDX",
        "specVersion": "1.6",
        "serialNumber": "urn:uuid:" + str(uuid.uuid5(uuid.NAMESPACE_URL, identity)),
        "version": 1,
        "metadata": {
            "component": {
                "type": "application",
                "name": root_name + "-controller",
                "version": root_version,
                "bom-ref": root_ref,
            }
        },
        "components": components,
        "dependencies": [
            {"ref": root_ref, "dependsOn": [component["bom-ref"] for component in components]}
        ],
    }
    output.write_text(json.dumps(sbom, indent=2) + "\n", encoding="utf-8")
    return len(components)


def scan_exit_status(returncode, advisory_ids):
    if returncode not in (0, 1):
        raise ValueError(f"OSV-Scanner failed with exit code {returncode}")
    if returncode == 0 and advisory_ids:
        raise ValueError("scanner reported advisories with a success exit code")
    if returncode == 1 and not advisory_ids:
        raise ValueError("scanner findings exit has no represented advisories")
    return 1 if advisory_ids else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--image")
    target.add_argument("--archive", type=Path)
    target.add_argument("--prepare-runtime-sbom", type=Path)
    parser.add_argument("--sbom", type=Path)
    parser.add_argument("--expected-platform", choices=sorted(PLATFORMS))
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    if args.prepare_runtime_sbom is not None:
        if args.expected_platform is not None or args.sbom is not None:
            raise ValueError("runtime SBOM preparation does not accept scan-only options")
        count = generate_runtime_sbom(args.prepare_runtime_sbom, args.output)
        print(f"Generated CycloneDX 1.6 runtime inventory for {count} deployed packages")
        return 0

    image = validate_image_reference(args.image) if args.image else None
    archive = args.archive.resolve() if args.archive else None
    archive_digest = None
    lock_digest = None
    actual_platform = None
    if archive is not None:
        actual_platform = archive_platform(archive)
        if args.expected_platform is None:
            raise ValueError("--expected-platform is required for an archive scan")
        if actual_platform != args.expected_platform:
            raise ValueError(
                f"archive platform {actual_platform} differs from {args.expected_platform}"
            )
        archive_digest = sha256(archive)
        if args.sbom is None:
            raise ValueError("--sbom is required for a final archive scan")
        lockfile = args.sbom.resolve()
        if (
            lockfile.name != "runtime-dependencies.cdx.json"
            or lockfile.is_symlink()
            or not lockfile.is_file()
        ):
            raise ValueError("runtime inventory must be a regular runtime-dependencies.cdx.json")
        lock_digest = sha256(lockfile)
        if archive_file_sha256(archive, "/app/runtime-dependencies.cdx.json") != lock_digest:
            raise ValueError("scanned runtime SBOM differs from the SBOM embedded in the image")
    elif args.expected_platform is not None:
        raise ValueError("--expected-platform is valid only with --archive")
    elif args.sbom is not None:
        raise ValueError("--sbom is valid only with --archive")

    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.is_symlink() or any(parent.is_symlink() for parent in (output.parent,)):
        raise ValueError("report path must not be a symlink")
    scanner_binary = scanner()
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".toml", dir=output.parent, delete=False
    ) as config:
        config.write("# Admission deliberately scans without scanner suppressions.\n")
        config_path = Path(config.name)
    command = [
        str(scanner_binary),
        "scan",
        "image",
        "--format=json",
        "--all-packages",
        "--all-vulns",
        "--no-call-analysis=rust",
        "--no-call-analysis=go",
        "--config=" + str(config_path),
    ]
    command.extend(["--archive", str(archive)] if archive is not None else [image])
    diagnostics = output.with_suffix(".stderr.txt")
    try:
        with output.open("wb") as report_stream, diagnostics.open("wb") as diagnostic_stream:
            result = subprocess.run(
                command,
                cwd=ROOT,
                stdout=report_stream,
                stderr=diagnostic_stream,
                timeout=900,
                shell=False,
            )  # nosemgrep: python.lang.security.audit.dangerous-subprocess-use-tainted-env-args.dangerous-subprocess-use-tainted-env-args
    finally:
        config_path.unlink(missing_ok=True)

    report = json.loads(output.read_text(encoding="utf-8"))
    package_count, advisory_ids = validate_report(report)
    if archive is not None and sha256(archive) != archive_digest:
        raise ValueError("container archive changed during scanning")
    image_code = scan_exit_status(result.returncode, advisory_ids)
    dependency_count = None
    dependency_ids = set()
    dependency_report_path = None
    dependency_report_digest = None
    if archive is not None:
        dependency_report_path = output.with_name(output.stem + ".dependencies.json")
        dependency_diagnostics = output.with_name(output.stem + ".dependencies.stderr.txt")
        dependency_command = [
            str(scanner_binary),
            "scan",
            "source",
            "--format=json",
            "--all-packages",
            "--all-vulns",
            "--no-call-analysis=rust",
            "--no-call-analysis=go",
            "--config=/dev/null",
            "--sbom=" + str(lockfile),
        ]
        with dependency_report_path.open("wb") as report_stream, dependency_diagnostics.open(
            "wb"
        ) as diagnostic_stream:
            dependency_result = subprocess.run(
                dependency_command,
                cwd=ROOT,
                stdout=report_stream,
                stderr=diagnostic_stream,
                timeout=900,
                shell=False,
            )  # nosemgrep: python.lang.security.audit.dangerous-subprocess-use-tainted-env-args.dangerous-subprocess-use-tainted-env-args
        dependency_report = json.loads(dependency_report_path.read_text(encoding="utf-8"))
        dependency_count, dependency_ids = validate_dependency_report(
            dependency_report, lockfile
        )
        dependency_code = scan_exit_status(dependency_result.returncode, dependency_ids)
        dependency_report_digest = sha256(dependency_report_path)
    else:
        dependency_code = 0
    code = 1 if image_code == 1 or dependency_code == 1 else 0
    receipt = {
        "scannerVersion": VERSION,
        "target": image if image is not None else str(archive),
        "platform": actual_platform,
        "archiveSHA256": archive_digest,
        "reportSHA256": sha256(output),
        "packageCount": package_count,
        "runtimeSBOMSHA256": lock_digest,
        "runtimeDependencyPackageCount": dependency_count,
        "runtimeDependencyReportSHA256": dependency_report_digest,
        "advisoryIds": sorted(advisory_ids),
        "runtimeDependencyAdvisoryIds": sorted(dependency_ids),
        "admissionExitCode": code,
    }
    output.with_suffix(".receipt.json").write_text(
        json.dumps(receipt, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"OSV {VERSION}: scanned {package_count} image packages and "
        f"{dependency_count or 0} runtime dependency packages; "
        f"{len(advisory_ids | dependency_ids)} advisory identifiers; "
        f"exit {code}; report: {output}"
    )
    return code


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, json.JSONDecodeError, tarfile.TarError, subprocess.SubprocessError) as error:
        print(f"OSV image gate failed: {error}", file=sys.stderr)
        sys.exit(2)
