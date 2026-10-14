"""Dependency admission regressions; synthetic files only, no package install."""
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("osv_gate", Path(__file__).with_name("osv-dependency-gate.py"))
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

class AdmissionTests(unittest.TestCase):
    def test_python_inventory_normalizes_names_and_rejects_unpinned_inputs(self):
        with tempfile.TemporaryDirectory() as folder:
            lock = Path(folder) / "requirements.txt"
            lock.write_text("Py_JWT==2.15.1 --hash=sha256:" + "a" * 64 + "\n")
            self.assertEqual(gate.expected_inventory(lock), {("py-jwt", "2.15.1")})
            for text in ("package>=1\n", "package==1\n", "--extra-index-url https://example.invalid\n"):
                lock.write_text(text)
                with self.assertRaisesRegex(ValueError, "hash-pinned"):
                    gate.expected_inventory(lock)

    def test_clean_rust_scan_requires_native_guard_before_admission(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            report = {"results": [{"source": {"path": str(root / "Cargo.lock")}, "packages": [{"package": {"name": "synthetic", "version": "1.0.0", "ecosystem": "crates.io"}}]}]}
            with self.assertRaisesRegex(ValueError, "native dependency guard"):
                self.run_with_report(root, report)
            self.assertFalse((root / "result.receipt.json").exists())

    def test_cargo_scan_cannot_accept_wrong_ecosystem(self):
        report = {"results": [{"source": {"path": "/repo/Cargo.lock"}, "packages": [{"package": {"name": "synthetic", "version": "1", "ecosystem": "npm"}}]}]}
        with self.assertRaisesRegex(ValueError, "ecosystem"):
            gate.validate_inventory(report, [Path("/repo/Cargo.lock")])

    def test_wrong_ecosystem_cannot_inherit_root_advisory_exception(self):
        item = {"_admission_source": "/repo/Cargo.lock", "package": {"name": "rsa", "version": "0.9.10", "ecosystem": "npm"}, "vulnerabilities": [{"id": "GHSA-test"}]}
        exception = {"package": "rsa", "version": "0.9.10", "advisory": "GHSA-test"}
        with patch.object(gate, "ROOT", Path("/repo")):
            self.assertTrue(gate.unaccepted_findings([item], [exception]))

    def test_scanner_findings_exit_without_represented_advisories_fails_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder).resolve()
            for extra in ({}, {"vulnerabilities": []}):
                report={"results":[{"source":{"path":str(root/"Cargo.lock")},"packages":[dict({"package":{"name":"synthetic","version":"1.0.0","ecosystem":"crates.io"}},**extra)]}]}
                with self.assertRaisesRegex(ValueError,"findings exit"):
                    self.run_with_report(root,report,1)

    def test_modified_binary_cannot_execute(self):
        with tempfile.TemporaryDirectory() as folder:
            binary = Path(folder) / "scanner"
            binary.write_bytes(b"changed executable")
            with self.assertRaisesRegex(ValueError, "checksum"):
                gate.verify(binary, "0" * 64)

    def test_symlink_binary_rejected_even_with_matching_digest(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "real"
            target.write_bytes(b"known")
            link = Path(folder) / "link"
            try:
                link.symlink_to(target)
            except OSError:
                self.skipTest("host does not permit symlink creation")
            with self.assertRaisesRegex(ValueError, "invalid"):
                gate.verify(link, gate.hashlib.sha256(b"known").hexdigest())

    def test_nested_toolchain_included_and_fixture_excluded(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            files = ("Cargo.lock", "tools/sca/package-lock.json", "tests/fixtures/package-lock.json")
            for name in files:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("synthetic")
            with patch.object(gate, "ROOT", root), patch.object(gate.subprocess, "check_output", return_value=("\0".join(files)+"\0").encode()):
                self.assertEqual(gate.lockfiles(), [root / files[0], root / files[1]])

    def test_no_locks_is_failure(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(gate, "ROOT", Path(folder)), patch.object(gate.subprocess, "check_output", return_value=b""):
            with self.assertRaisesRegex(ValueError, "empty scan"):
                gate.lockfiles()

    def run_with_report(self, root, report, code=0):
        output = root / "result.json"
        (root / "Cargo.lock").write_text('version = 3\n[[package]]\nname = "synthetic"\nversion = "1.0.0"\n')
        def fake_run(command, **kwargs):
            self.assertIn("--no-call-analysis=rust", command)
            self.assertIn("--all-packages", command)
            kwargs["stdout"].write(json.dumps(report).encode())
            return subprocess.CompletedProcess(command, code)
        with patch.object(gate, "ROOT", root), patch.object(gate, "lockfiles", return_value=[root / "Cargo.lock"]), patch.object(gate, "scanner", return_value=root / "verified-scanner"), patch.object(gate.subprocess, "run", side_effect=fake_run), patch("sys.argv", ["gate", "--output", str(output)]):
            return gate.main()

    def test_partial_or_empty_inventory_cannot_pass(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            for report in ({"results": []}, {"results": [{"source": {"path": str(root / "Cargo.lock")}, "packages": []}]}):
                with self.assertRaises(ValueError):
                    self.run_with_report(root, report)

    def test_findings_and_network_error_remain_failures(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            report = {"results": [{"source": {"path": str(root / "Cargo.lock")}, "packages": [{"package": {"name": "synthetic", "version": "1.0.0", "ecosystem": "crates.io"}, "vulnerabilities": [{"id": "MAL-TEST-1"}]}]}]}
            for code in (0, 1, 2):
                self.assertEqual(self.run_with_report(root, report, code), code or 1)

    def test_malware_ignore_forbidden_before_bootstrap(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            (root / "osv-scanner.toml").write_text('[[IgnoredVulns]]\nid = "MAL-TEST-1"\nignoreUntil = 2027-01-01\nreason = "not permitted"\n')
            with patch.object(gate, "ROOT", root), patch.object(gate, "lockfiles", return_value=[root / "Cargo.lock"]), patch.object(gate, "scanner") as scanner, patch("sys.argv", ["gate"]):
                with self.assertRaisesRegex(ValueError, "malicious"):
                    gate.main()
                scanner.assert_not_called()

    def test_one_empty_nested_lock_cannot_hide_behind_populated_root(self):
        paths = [Path("/repo/Cargo.lock"), Path("/repo/tools/package-lock.json")]
        package = {"package": {"name": "synthetic", "version": "1", "ecosystem": "crates.io"}}
        report = {"results": [{"source": {"path": str(paths[0])}, "packages": [package]}, {"source": {"path": str(paths[1])}, "packages": []}]}
        with self.assertRaisesRegex(ValueError, "Empty"):
            gate.validate_inventory(report, paths)

    def test_alias_of_malware_cannot_use_legitimate_advisory_exception(self):
        packages = [{"package": {"name": "synthetic", "version": "1", "ecosystem": "crates.io"}, "vulnerabilities": [{"id": "GHSA-test", "aliases": ["MAL-TEST-1"]}]}]
        exceptions = [{"package": "synthetic", "version": "1", "advisory": "GHSA-test"}]
        self.assertTrue(gate.unaccepted_findings(packages, exceptions))

    def test_root_exception_does_not_suppress_toolchain_vulnerabilities(self):
        packages = [{"_admission_source": "/repo/tools/Cargo.lock", "package": {"name": "rsa", "version": "0.9.10", "ecosystem": "crates.io"}, "vulnerabilities": [{"id": "GHSA-test"}]}]
        exceptions = [{"package": "rsa", "version": "0.9.10", "advisory": "GHSA-test"}]
        with patch.object(gate, "ROOT", Path("/repo")):
            self.assertTrue(gate.unaccepted_findings(packages, exceptions))
            packages[0]["_admission_source"] = "/repo/Cargo.lock"
            self.assertFalse(gate.unaccepted_findings(packages, exceptions))

    def test_exception_version_change_is_rejected_before_builds(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            directory = root / "supply-chain"
            directory.mkdir()
            record = {"package": "synthetic", "version": "1", "owner": "maintainer", "expires": "2099-01-01", "reason": "specific unreachable API", "kind": "unreachable", "advisory": "GHSA-test"}
            (directory / "maintenance-exceptions.json").write_text(json.dumps({"exceptions": [record]}))
            with patch.object(gate, "ROOT", root):
                with self.assertRaisesRegex(ValueError, "changed version"):
                    gate.reviewed_exceptions([{"package": {"name": "synthetic", "version": "2"}}])

    def test_real_package_override_schema_cannot_suppress_scanning(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            (root / "osv-scanner.toml").write_text('[[PackageOverrides]]\nname = "synthetic"\nignore = true\n')
            with patch.object(gate, "ROOT", root), patch.object(gate, "lockfiles", return_value=[root / "Cargo.lock"]), patch.object(gate, "scanner") as scanner, patch("sys.argv", ["gate"]):
                with self.assertRaisesRegex(ValueError, "Package-wide"):
                    gate.main()
                scanner.assert_not_called()

    def test_malformed_nested_schema_is_typed_failure(self):
        for report in ({"results": [None]}, {"results": [{"source": None, "packages": []}]}, {"results": [{"source": {"path": "/repo/Cargo.lock"}, "packages": [None]}]}):
            with self.assertRaises(ValueError):
                gate.validate_inventory(report, [Path("/repo/Cargo.lock")])

    def test_required_ci_jobs_fail_instead_of_skipping_on_scan_failure(self):
        source = (Path(__file__).resolve().parents[1] / ".github/workflows/ci.yml").read_text()
        jobs = re.split(r"(?m)^  ([A-Za-z0-9_-]+):\s*$", source.split("jobs:\n", 1)[1])
        checked = 0
        for index in range(1, len(jobs), 2):
            body = jobs[index + 1]
            if re.search(r"(?m)^    needs:.*dependency-admission", body):
                self.assertIn("if: always() && !cancelled()", body)
                self.assertIn("if: needs.dependency-admission.result != 'success'", body)
                self.assertLess(body.index("run: exit 1"), body.index("actions/checkout@"))
                checked += 1
        self.assertGreater(checked, 0)

    def test_dependency_execution_jobs_wait_for_shared_gate(self):
        workflows = Path(__file__).resolve().parents[1] / ".github/workflows"
        checked = 0
        for path in workflows.glob("*.yml"):
            source = path.read_text()
            if path.name == "osv-dependency-gate.yml" or "jobs:\n" not in source:
                continue
            jobs = source.split("jobs:\n", 1)[1]
            blocks = re.split(r"(?m)^  ([A-Za-z0-9_-]+):\s*$", jobs)
            for index in range(1, len(blocks), 2):
                name, body = blocks[index:index+2]
                executes = bool(re.search(r"pnpm install|npm ci|python -m pip install|cargo (?:build|test|check|clippy|doc|package|run|kani)", body))
                executes |= path.name == "codeql.yml" and "build-mode:" in body
                if executes:
                    self.assertRegex(body, r"(?m)^    needs:.*dependency-admission", f"{path.name}:{name} executes dependencies without OSV admission")
                    checked += 1
        self.assertGreater(checked, 0)

if __name__ == "__main__":
    unittest.main()
