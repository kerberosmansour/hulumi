"""Local feedback CLI acceptance tests. Synthetic input only; no network."""
# Copyright 2026 Sherif Mansour and contributors.
# SPDX-License-Identifier: Apache-2.0
import ast
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "skills/sunlit-upstream-feedback/scripts/draft.py"


def report():
    return {
        "repository": "hulumi", "package": "@hulumi/baseline", "version": "3.0.0",
        "kind": "docs", "outcome": "workaround", "features": [],
        "task": "Create a synthetic sandbox bucket",
        "expected": "Find the supported example", "observed": "Example needed clarification",
        "reproduction": "Use synthetic names only; no deployment performed",
        "checks": ["Source inspection; no cloud test executed"],
        "documentation": ["Published 3.0.0 usage reference"],
        "duplicate_search": "Reviewed existing public issues; no matching report found",
        "privacy_reviewed": True,
    }


class FeedbackTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(SCRIPT.is_file(), "Local feedback command is not implemented yet")
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "input.json"
        self.output = self.root / "draft.md"

    def run_cli(self, data=None, raw=None):
        self.source.write_text(raw if raw is not None else json.dumps(data or report()))
        return subprocess.run([sys.executable, str(SCRIPT), "--input", str(self.source),
                               "--output", str(self.output)], capture_output=True, text=True,
                              timeout=5)

    def test_valid_draft_is_private_and_has_no_send_claim(self):
        result = self.run_cli()
        self.assertEqual(result.returncode, 0, result.stderr)
        text = self.output.read_text()
        self.assertIn("Fingerprint:", text)
        self.assertIn("not submitted", text)
        self.assertIn("Example needed clarification", text)
        if os.name != "nt":
            self.assertEqual(stat.S_IMODE(self.output.stat().st_mode), 0o600)

    def test_success_uses_discussions(self):
        data = report(); data.update(kind="success", outcome="succeeded")
        self.assertEqual(self.run_cli(data).returncode, 0)
        self.assertIn("/hulumi/discussions", self.output.read_text())
        self.assertNotIn("/issues/new", self.output.read_text())

    def test_duplicate_routes_to_existing_issue(self):
        data = report(); data["duplicate_of"] = 12
        self.assertEqual(self.run_cli(data).returncode, 0)
        self.assertIn("/hulumi/issues/12", self.output.read_text())

    def test_rust_package_identity(self):
        data = report(); data.update(repository="sunlitsecuritylibraries", package="secure_data", version="0.4.0")
        self.assertEqual(self.run_cli(data).returncode, 0)
        self.assertIn("SunLitSecurityLibraries", self.output.read_text())

    def test_security_report_never_renders_public_body(self):
        data = report(); data["kind"] = "security"
        result = self.run_cli(data)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.output.exists())
        self.assertNotIn(data["observed"], result.stdout + result.stderr)

    def test_canary_and_secret_are_rejected_without_echo(self):
        # Synthetic sentinels only; assemble the header so tree scanners do not
        # mistake a fixture for leaked key material. No actual key is present.
        for fixture in ["SUNLIT_TEST_SECRET_do_not_send", "ghp_" + "A" * 36,
                       "password=synthetic-value", "-----BEGIN " + "PRIVATE KEY-----"]:
            with self.subTest(fixture_type=fixture[:5]):
                data = report(); data["observed"] = fixture
                result = self.run_cli(data)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn(fixture, result.stdout + result.stderr)
                self.assertFalse(self.output.exists())

    def test_invalid_identity_version_keys_and_review(self):
        for field, value in [("package", "unexpected"), ("version", "*"),
                             ("privacy_reviewed", False), ("duplicate_of", True),
                             ("unexpected", "field"), ("checks", []), ("task", "")]:
            with self.subTest(field=field):
                data = report(); data[field] = value
                self.assertNotEqual(self.run_cli(data).returncode, 0)
                self.assertFalse(self.output.exists())

    def test_bounds_malformed_and_duplicate_json_keys(self):
        for raw in ["", "{", '{"repository":"hulumi","repository":"rust"}', " " * 32769]:
            self.assertNotEqual(self.run_cli(raw=raw).returncode, 0)
            self.assertFalse(self.output.exists())
        data = report(); data["observed"] = "x" * 4001
        self.assertNotEqual(self.run_cli(data).returncode, 0)

    def test_invalid_semver_identifiers_are_rejected(self):
        for version in ["1.2.3-.", "1.2.3-01", "1.2.3+.."]:
            data = report(); data["version"] = version
            self.assertNotEqual(self.run_cli(data).returncode, 0)
            self.assertFalse(self.output.exists())

    def test_existing_output_remains_unchanged(self):
        self.output.write_text("existing")
        self.assertNotEqual(self.run_cli().returncode, 0)
        self.assertEqual(self.output.read_text(), "existing")

    @unittest.skipIf(os.name == "nt", "Windows runner symlink privilege is not assumed")
    def test_symlink_output_and_input_are_rejected(self):
        target = self.root / "target"; target.write_text("existing")
        self.output.symlink_to(target)
        self.assertNotEqual(self.run_cli().returncode, 0)
        self.assertEqual(target.read_text(), "existing")
        self.output.unlink(); self.source.unlink()
        target.write_text(json.dumps(report())); self.source.symlink_to(target)
        result = subprocess.run([sys.executable, str(SCRIPT), "--input", str(self.source),
                                 "--output", str(self.output)], capture_output=True, timeout=5)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.output.exists())

    def test_report_text_cannot_create_executable_markup_or_run_commands(self):
        data = report(); data["observed"] = '<script>alert(1)</script>\n![image](https://invalid.example/pixel)\n`touch NEVER_CREATE`'
        self.assertEqual(self.run_cli(data).returncode, 0)
        text = self.output.read_text()
        self.assertNotIn("<script>", text)
        self.assertNotIn("![image]", text)
        self.assertFalse((self.root / "NEVER_CREATE").exists())

    def test_no_network_or_process_capability_in_helper(self):
        tree = ast.parse(SCRIPT.read_text())
        imports = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import): imports.update(x.name.split('.')[0] for x in node.names)
            if isinstance(node, ast.ImportFrom): imports.add(node.module.split('.')[0])
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                self.assertNotIn(node.func.id, {"eval", "exec", "__import__"})
        self.assertLessEqual(imports, {"argparse", "hashlib", "html", "json", "os", "pathlib", "re", "stat", "sys"})


if __name__ == "__main__":
    unittest.main()
