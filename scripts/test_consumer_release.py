"""Release-banner consistency against explicit, already-reviewed release metadata."""
# Copyright 2026 Sherif Mansour and contributors.
# SPDX-License-Identifier: Apache-2.0
import importlib.util
from pathlib import Path
import unittest


class ReleaseBannerTests(unittest.TestCase):
    def setUp(self):
        path = Path(__file__).with_name("sync-consumer-release.py")
        self.assertTrue(path.is_file(), "Release metadata command is not implemented")
        spec = importlib.util.spec_from_file_location("consumer_release", path)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)

    def test_banner_uses_coordinated_release_and_prerequisite(self):
        value = self.module.banner("v3.0.0", {"engines": {"node": ">=22.12.0"}}, ["3.0.0"] * 6)
        self.assertIn("**3.0.0**", value)
        self.assertIn("Node.js >=22.12.0", value)

    def test_conflicting_or_invalid_metadata_rejected(self):
        for tag, versions in [("main", ["3.0.0"] * 6), ("v3.0.0", ["2.0.0"] * 6), ("v3.0.0", [])]:
            with self.assertRaises(ValueError):
                self.module.banner(tag, {"engines": {"node": ">=22.12.0"}}, versions)

    def test_only_banner_changes_and_history_is_preserved(self):
        source = "# Hulumi\n\nCurrent coordinated release: old\n\n## Release history\nv1.5.4\n"
        result = self.module.replace_banner(source, "Current coordinated release: new")
        self.assertEqual(result, source.replace("Current coordinated release: old", "Current coordinated release: new"))
        with self.assertRaises(ValueError):
            self.module.replace_banner("no banner", "new")


if __name__ == "__main__":
    unittest.main()
