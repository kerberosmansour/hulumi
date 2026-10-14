"""Release inventory integrity checks using generated tarballs only."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("sboms", Path(__file__).with_name("generate-release-sboms.py"))
sboms = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sboms)

class ReleaseInventoryTests(unittest.TestCase):
    def fixture(self, root):
        (root / "pnpm-lock.yaml").write_text("generated lock")
        artifacts = root / "artifacts"
        artifacts.mkdir()
        for name in sboms.PACKAGES:
            package = {"name": "@hulumi/" + name, "version": "3.0.0"}
            directory = root / "packages" / name
            directory.mkdir(parents=True)
            (directory / "package.json").write_text(json.dumps(package))
            content = json.dumps(package).encode()
            with tarfile.open(artifacts / f"hulumi-{name}-3.0.0.tgz", "w:gz") as archive:
                member = tarfile.TarInfo("package/package.json")
                member.size = len(content)
                archive.addfile(member, io.BytesIO(content))
        report = root / "osv.json"
        report.write_text(json.dumps({"results": [{"source": {"path": "/producer/pnpm-lock.yaml"}, "packages": [{"package": {"name": "@scope/library", "version": "1.2.3", "ecosystem": "npm"}}]}]}))
        receipt = root / "osv.receipt.json"
        receipt.write_text(json.dumps({"admissionExitCode": 0, "scannerVersion": "v2.7.0", "reportSHA256": hashlib.sha256(report.read_bytes()).hexdigest(), "lockfiles": [{"path": "pnpm-lock.yaml", "sourcePath": "/producer/pnpm-lock.yaml", "sha256": hashlib.sha256((root / "pnpm-lock.yaml").read_bytes()).hexdigest()}]}))
        return report, receipt, artifacts

    def test_six_inventory_sboms_bind_actual_archive_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            report, receipt, artifacts = self.fixture(root)
            with patch.object(sboms, "ROOT", root), patch.object(sboms.subprocess, "check_output", return_value="a" * 40):
                self.assertEqual(sboms.generate(report, receipt, artifacts), 1)
            for name in sboms.PACKAGES:
                bom = json.loads((artifacts / f"sbom-{name}.cdx.json").read_text())
                self.assertEqual(bom["specVersion"], "1.6")
                self.assertEqual(bom["metadata"]["component"]["hashes"][0]["content"], hashlib.sha256((artifacts / f"hulumi-{name}-3.0.0.tgz").read_bytes()).hexdigest())
                self.assertEqual(bom["components"][0]["purl"], "pkg:npm/%40scope/library@1.2.3")
                self.assertNotIn("dependencies", bom)

    def test_changed_scan_report_or_lock_cannot_be_used_for_release(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            report, receipt, artifacts = self.fixture(root)
            report.write_text(report.read_text() + " ")
            with patch.object(sboms, "ROOT", root), self.assertRaisesRegex(ValueError, "unchanged"):
                sboms.generate(report, receipt, artifacts)
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            report, receipt, artifacts = self.fixture(root)
            (root / "pnpm-lock.yaml").write_text("changed candidate")
            with patch.object(sboms, "ROOT", root), self.assertRaisesRegex(ValueError, "differs"):
                sboms.generate(report, receipt, artifacts)

    def test_failed_admission_cannot_generate_release_inventory(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            report, receipt, artifacts = self.fixture(root)
            record = json.loads(receipt.read_text());record["admissionExitCode"] = 1
            receipt.write_text(json.dumps(record))
            with patch.object(sboms, "ROOT", root), self.assertRaises(ValueError):
                sboms.generate(report, receipt, artifacts)

if __name__ == "__main__":
    unittest.main()
