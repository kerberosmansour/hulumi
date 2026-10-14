#!/usr/bin/env python3
"""CycloneDX 1.6 release inventory from the already-admitted OSV graph.

No package installation, lifecycle scripts, native helpers or dependency builds.
The inventory is a workspace superset, not a runtime-only dependency graph.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
PACKAGES = ("baseline", "policies", "drift", "k8s-baseline", "cloudflare-baseline", "platform-patterns")


def generate(report_path, receipt_path, artifacts):
    report_bytes = report_path.read_bytes()
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    if receipt["admissionExitCode"] != 0 or receipt["reportSHA256"] != hashlib.sha256(report_bytes).hexdigest():
        raise ValueError("Release inventory must come from successful unchanged OSV admission")
    locks = [item for item in receipt["lockfiles"] if item["path"] == "pnpm-lock.yaml"]
    if len(locks) != 1 or locks[0]["sha256"] != hashlib.sha256((ROOT / "pnpm-lock.yaml").read_bytes()).hexdigest():
        raise ValueError("Release workspace lock differs from scanned candidate")
    report = json.loads(report_bytes)
    inventories = [item for item in report["results"] if item["source"]["path"] == locks[0]["sourcePath"]]
    if len(inventories) != 1 or not inventories[0]["packages"]:
        raise ValueError("Release dependency inventory is absent or ambiguous")
    components = {}
    for item in inventories[0]["packages"]:
        package = item["package"]
        if package["ecosystem"] != "npm":
            raise ValueError("Unexpected ecosystem in pnpm workspace inventory")
        ref = "pkg:npm/" + quote(package["name"], safe="/") + "@" + quote(package["version"], safe="")
        components[ref] = {"type": "library", "bom-ref": ref, "name": package["name"], "version": package["version"], "purl": ref}
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    for name in PACKAGES:
        package = json.loads((ROOT / "packages" / name / "package.json").read_text(encoding="utf-8"))
        archive = artifacts / f"hulumi-{name}-{package['version']}.tgz"
        data = archive.read_bytes()
        if len(data) > 16 * 1024 * 1024:
            raise ValueError("Release archive exceeds bound")
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
            manifests = [member for member in tar.getmembers() if member.name == "package/package.json" and member.isfile()]
            if len(manifests) != 1 or manifests[0].size > 1024 * 1024:
                raise ValueError("Release archive manifest is absent/ambiguous/oversized")
            packed = json.loads(tar.extractfile(manifests[0]).read())
        if (packed["name"], packed["version"]) != (package["name"], package["version"]):
            raise ValueError("Packed package identity/version does not match release source")
        ref = "pkg:npm/" + quote(package["name"], safe="/") + "@" + quote(package["version"], safe="")
        bom = {"$schema": "https://cyclonedx.org/schema/bom-1.6.schema.json", "bomFormat": "CycloneDX", "specVersion": "1.6", "version": 1,
            "metadata": {"component": {"type": "library", "bom-ref": ref, "name": package["name"], "version": package["version"], "purl": ref, "hashes": [{"alg": "SHA-256", "content": hashlib.sha256(data).hexdigest()}]},
                "properties": [{"name": "hulumi:source-commit", "value": commit}, {"name": "hulumi:inventory-scope", "value": "Resolved workspace superset includes development, peer and optional packages; target runtime membership and dependency relationships are not inferred"}, {"name": "hulumi:osv-scanner-version", "value": receipt["scannerVersion"]}]},
            "components": [component for identity, component in sorted(components.items()) if identity != ref]}
        (artifacts / f"sbom-{name}.cdx.json").write_text(json.dumps(bom, indent=2) + "\n", encoding="utf-8")
    return len(components)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--artifacts", type=Path, required=True)
    args = parser.parse_args()
    print(f"Generated six CycloneDX SBOM inventories from {generate(args.report, args.receipt, args.artifacts)} admitted workspace packages")
