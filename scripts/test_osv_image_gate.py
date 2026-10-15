#!/usr/bin/env python3
"""Unit tests for the fail-closed OSV container-image admission gate."""

import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("osv-image-gate.py")
SPEC = importlib.util.spec_from_file_location("osv_image_gate", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("could not load osv-image-gate.py")
GATE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GATE)


def report(*, groups=None):
    package = {
        "package": {
            "name": "nodejs",
            "version": "24.21.0-1.azl3",
            "ecosystem": "Azure Linux:3.0",
            "purl": "pkg:rpm/azurelinux/nodejs@24.21.0-1.azl3?arch=x86_64",
        }
    }
    if groups is not None:
        package["groups"] = groups
    return {
        "results": [
            {
                "source": {"path": "/var/lib/rpm/rpmdb.sqlite", "type": "os"},
                "packages": [package],
            }
        ],
        "image_metadata": {"os": "Microsoft Azure Linux 3.0", "layer_metadata": []},
    }


class ImageReferenceTests(unittest.TestCase):
    def test_requires_exact_sha256_digest(self):
        exact = "ghcr.io/kerberosmansour/hulumi-controller@sha256:" + "a" * 64
        self.assertEqual(GATE.validate_image_reference(exact), exact)
        for rejected in [
            "ghcr.io/kerberosmansour/hulumi-controller:latest",
            "ghcr.io/kerberosmansour/hulumi-controller@sha256:" + "A" * 64,
            "https://ghcr.io/controller@sha256:" + "a" * 64,
            "controller@sha256:" + "a" * 63,
        ]:
            with self.subTest(rejected=rejected), self.assertRaises(ValueError):
                GATE.validate_image_reference(rejected)


class ReportTests(unittest.TestCase):
    def test_accepts_complete_inventory_without_advisories(self):
        package_count, advisory_ids = GATE.validate_report(report())
        self.assertEqual(package_count, 1)
        self.assertEqual(advisory_ids, set())
        self.assertEqual(GATE.scan_exit_status(0, advisory_ids), 0)

    def test_rejects_every_advisory_without_severity_threshold(self):
        groups = [{"ids": ["CVE-2026-1234"], "aliases": ["GHSA-aaaa-bbbb-cccc"]}]
        package_count, advisory_ids = GATE.validate_report(report(groups=groups))
        self.assertEqual(package_count, 1)
        self.assertEqual(advisory_ids, {"CVE-2026-1234", "GHSA-aaaa-bbbb-cccc"})
        self.assertEqual(GATE.scan_exit_status(1, advisory_ids), 1)

    def test_malicious_package_identifier_can_never_be_accepted(self):
        groups = [{"ids": ["MAL-2026-9999"], "aliases": []}]
        _, advisory_ids = GATE.validate_report(report(groups=groups))
        self.assertIn("MAL-2026-9999", advisory_ids)
        self.assertEqual(GATE.scan_exit_status(1, advisory_ids), 1)

    def test_empty_or_malformed_inventory_fails_closed(self):
        for malformed in [
            {},
            {"results": [], "image_metadata": {}},
            {"results": [{"source": {}, "packages": []}], "image_metadata": {"os": "x"}},
            report(groups=[{"ids": [], "aliases": []}]),
        ]:
            with self.subTest(malformed=malformed), self.assertRaises(ValueError):
                GATE.validate_report(malformed)

    def test_scanner_status_and_report_must_agree(self):
        with self.assertRaises(ValueError):
            GATE.scan_exit_status(0, {"CVE-2026-1234"})
        with self.assertRaises(ValueError):
            GATE.scan_exit_status(1, set())
        with self.assertRaises(ValueError):
            GATE.scan_exit_status(2, set())

    def test_validates_the_exact_embedded_runtime_sbom_inventory(self):
        dependency_report = {
            "results": [
                {
                    "source": {"path": "/tmp/runtime-dependencies.cdx.json", "type": "sbom"},
                    "packages": [
                        {
                            "package": {
                                "name": "@aws-sdk/client-eks",
                                "version": "3.1149.0",
                                "ecosystem": "npm",
                            }
                        }
                    ],
                }
            ]
        }
        count, advisory_ids = GATE.validate_dependency_report(
            dependency_report, Path("/tmp/runtime-dependencies.cdx.json")
        )
        self.assertEqual(count, 1)
        self.assertEqual(advisory_ids, set())


class ArchiveTests(unittest.TestCase):
    def test_reads_one_docker_archive_platform_from_config(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "image.tar"
            config_name = "a" * 64 + ".json"
            config = json.dumps({"architecture": "amd64", "os": "linux"}).encode()
            manifest = json.dumps(
                [{"Config": config_name, "RepoTags": [], "Layers": ["layer.tar"]}]
            ).encode()
            with tarfile.open(archive, "w") as bundle:
                for name, data in [("manifest.json", manifest), (config_name, config)]:
                    info = tarfile.TarInfo(name)
                    info.size = len(data)
                    bundle.addfile(info, io.BytesIO(data))
            self.assertEqual(GATE.archive_platform(archive), "linux/amd64")

    def test_rejects_multi_image_or_non_linux_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "image.tar"
            manifest = json.dumps(
                [
                    {"Config": "one.json", "RepoTags": [], "Layers": []},
                    {"Config": "two.json", "RepoTags": [], "Layers": []},
                ]
            ).encode()
            with tarfile.open(archive, "w") as bundle:
                info = tarfile.TarInfo("manifest.json")
                info.size = len(manifest)
                bundle.addfile(info, io.BytesIO(manifest))
            with self.assertRaises(ValueError):
                GATE.archive_platform(archive)

    def test_binds_the_scanned_runtime_sbom_to_the_image_layer(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "image.tar"
            config_name = "a" * 64 + ".json"
            sbom = b'{"bomFormat":"CycloneDX","specVersion":"1.6","components":[]}\n'
            layer_stream = io.BytesIO()
            with tarfile.open(fileobj=layer_stream, mode="w") as layer:
                info = tarfile.TarInfo("app/runtime-dependencies.cdx.json")
                info.size = len(sbom)
                layer.addfile(info, io.BytesIO(sbom))
            layer_bytes = layer_stream.getvalue()
            config = json.dumps({"architecture": "arm64", "os": "linux"}).encode()
            manifest = json.dumps(
                [{"Config": config_name, "RepoTags": [], "Layers": ["layer.tar"]}]
            ).encode()
            with tarfile.open(archive, "w") as bundle:
                for name, data in [
                    ("manifest.json", manifest),
                    (config_name, config),
                    ("layer.tar", layer_bytes),
                ]:
                    info = tarfile.TarInfo(name)
                    info.size = len(data)
                    bundle.addfile(info, io.BytesIO(data))
            self.assertEqual(
                GATE.archive_file_sha256(archive, "/app/runtime-dependencies.cdx.json"),
                GATE.hashlib.sha256(sbom).hexdigest(),
            )

    def test_generates_a_deterministic_runtime_sbom_from_deployed_packages(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime = Path(directory)
            package_dir = runtime / "node_modules/.pnpm/foo@1.2.3/node_modules/foo"
            package_dir.mkdir(parents=True)
            (package_dir / "package.json").write_text(
                json.dumps({"name": "foo", "version": "1.2.3"}), encoding="utf-8"
            )
            (runtime / "package.json").write_text(
                json.dumps({"name": "@hulumi/k8s-baseline", "version": "3.0.0"}),
                encoding="utf-8",
            )
            output = runtime / "runtime-dependencies.cdx.json"
            count = GATE.generate_runtime_sbom(runtime, output)
            generated = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(count, 1)
            self.assertEqual(generated["specVersion"], "1.6")
            self.assertEqual(generated["components"][0]["purl"], "pkg:npm/foo@1.2.3")


if __name__ == "__main__":
    unittest.main()
