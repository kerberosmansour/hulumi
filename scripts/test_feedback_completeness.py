"""Exercise the real workflow checker with untrusted synthetic issue events."""
# Copyright 2026 Sherif Mansour and contributors.
# SPDX-License-Identifier: Apache-2.0
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import textwrap
import unittest

WORKFLOW = Path(__file__).resolve().parents[1] / ".github/workflows/integration-feedback.yml"
REQUIRED = (
    "Package and exact version", "What were you trying to do?", "Integration outcome",
    "How did you find the package?", "Expected behavior", "Checks actually executed and their results",
    "Documentation consulted, including its version", "Existing issue search and matching report, if any",
    "Observed behavior and minimal synthetic reproduction", "Public report acknowledgement",
)
ACK = "- [X] I understand this is public, have removed sensitive information, and authorize submitting this report."


def complete():
    return "\n\n".join("### " + name + "\n\n" + (ACK if name == REQUIRED[-1] else "Synthetic evidence") for name in REQUIRED)


class CompletenessTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(WORKFLOW.is_file(), "Feedback workflow is not implemented")
        source = WORKFLOW.read_text().split("# feedback-check:start\n", 1)[1].split("# feedback-check:end", 1)[0]
        self.code = textwrap.dedent(source)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def run_check(self, body, title="[Integration feedback]: synthetic"):
        event = self.root / "event.json"
        summary = self.root / "summary.md"
        event.write_text(json.dumps({"issue": {"title": title, "body": body}}))
        env = dict(os.environ, GITHUB_EVENT_PATH=str(event), GITHUB_STEP_SUMMARY=str(summary))
        result = subprocess.run([sys.executable, "-c", self.code], env=env, cwd=self.root,
                                capture_output=True, text=True, timeout=5)
        return result, summary.read_text() if summary.exists() else ""

    def test_complete_report_passes(self):
        result, summary = self.run_check(complete())
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("complete", summary)

    def test_missing_empty_and_duplicate_fields_fail(self):
        for body in [complete().replace("### Expected behavior", "### Unknown"),
                     complete().replace("### Expected behavior\n\nSynthetic evidence", "### Expected behavior\n\n_No response_"),
                     complete() + "\n\n### Expected behavior\n\nDuplicate"]:
            result, summary = self.run_check(body)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Expected behavior", summary)
            self.assertNotIn("Synthetic evidence", summary)

    def test_unchecked_consent_fails(self):
        result, summary = self.run_check(complete().replace("[X]", "[ ]"))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Public report acknowledgement", summary)

    def test_unrelated_issue_skips(self):
        result, summary = self.run_check("not a feedback report", title="Ordinary bug")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(summary, "")

    def test_canary_never_echoed(self):
        secret = "SUNLIT_TEST_SECRET_never_send"
        result, summary = self.run_check(complete() + "\n" + secret)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn(secret, result.stdout + result.stderr + summary)
        self.assertIn("private", summary)

    def test_commands_and_actions_expressions_are_inert(self):
        payload = "`touch SENTINEL` $(touch SENTINEL) ${{ secrets.EXAMPLE }} <script>test</script>"
        result, summary = self.run_check(complete() + "\n" + payload)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.root / "SENTINEL").exists())
        self.assertNotIn(payload, summary)

    def test_bounded_event_and_malformed_body(self):
        for value in ["x" * 102401, None, {"unexpected": "object"}]:
            result, summary = self.run_check(value)
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn("Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
