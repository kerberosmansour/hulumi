#!/usr/bin/env python3
"""Security regressions for maintenance workflow authority boundaries."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]

class WorkflowAuthorityTests(unittest.TestCase):
    def test_sca_scan_cannot_checkout_or_merge_prs_with_write_credentials(self):
        source = (ROOT / ".github/workflows/sca-emergency.yml").read_text()
        for forbidden in ("gh pr checkout", "gh pr merge", "private-key:", "id-token: write", "contents: write", "persist-credentials: true"):
            self.assertNotIn(forbidden, source)
        self.assertIn("persist-credentials: false", source)

    def test_dependency_updates_require_maintainer_review(self):
        source = (ROOT / ".github/workflows/dependabot-automerge.yml").read_text()
        self.assertNotIn("gh pr merge", source)
        self.assertNotIn("contents: write", source)
        self.assertNotIn("pull-requests: write", source)

    def test_drill_has_no_remote_agent_or_repository_write_authority(self):
        source = (ROOT / ".github/workflows/sca-review-loop-drill.yml").read_text()
        for forbidden in ("contents: write", "pull-requests: write", "id-token: write", "claude-code-action", "gh pr create", "git push"):
            self.assertNotIn(forbidden, source)

    def test_hidden_release_artifacts_are_uploaded_or_fail(self):
        source = (ROOT / ".github/workflows/ci.yml").read_text()
        block = source.split("name: ci-release-tarballs", 1)[1].split("  attestation-dry-run:", 1)[0]
        self.assertIn("include-hidden-files: true", block)
        self.assertIn("if-no-files-found: error", block)

    def test_sca_has_bounded_daily_schedule(self):
        source = (ROOT / ".github/workflows/sca-emergency.yml").read_text()
        self.assertNotIn("*/15", source)
        self.assertRegex(source, r'cron: "[0-9]+ [0-9]+ \* \* \*"')
        self.assertIn("timeout-minutes:", source)

if __name__ == "__main__":
    unittest.main()
