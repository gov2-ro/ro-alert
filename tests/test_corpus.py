"""Corpus and bundle checks (audit 02, P10/P11), plus compaction parity.

P09 (clean-checkout rebuild, byte-identical bundles) lives in test_build.py.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import build_data  # noqa: E402


def bundled_meta():
    with open(os.path.join(ROOT, "data", "meta.js"), encoding="utf-8") as f:
        s = f.read()
    return json.loads(s[s.index("=") + 1:].strip().rstrip(";"))


class Corpus(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.b = build_data.build()
        cls.meta = bundled_meta()

    def test_p10_corpus_counts(self):
        m = self.b["meta"]
        self.assertEqual(m["total"], 3385)
        self.assertEqual(m["deliveries"], 3618)
        self.assertEqual(m["delivery_error"], 196)
        self.assertEqual(m["cancel"], 21)
        self.assertEqual(len(m["judet_counts"]), 41)

    def test_p10_august_warning_kept_and_legacy_fetched_at_null(self):
        aug = [s for s in self.meta["sources"] if s["month"] == "2026-08"][0]
        self.assertEqual(aug["warnings"], ["Grand Total 556 differs from row count 557"])
        self.assertTrue(all(s["fetched_at"] is None for s in self.meta["sources"]))

    def test_p11_meta_inputs_match_recomputed_hashes(self):
        self.assertEqual(self.meta["schema_version"], 1)
        self.assertEqual(self.meta["inputs"], self.b["meta"]["inputs"])

    def test_p11_bundled_meta_equals_fresh_meta(self):
        self.assertEqual(json.loads(json.dumps(self.b["meta"])), self.meta)

    def test_compaction_restores_to_the_full_alerts_in_js(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node is not installed")
        with tempfile.TemporaryDirectory() as tmp:
            dump = os.path.join(tmp, "dump.json")
            with open(dump, "w", encoding="utf-8") as f:
                json.dump({"full": self.b["alerts"], "slim": self.b["slim"],
                           "omitted": self.b["meta"]["omitted"]}, f)
            p = subprocess.run([node, os.path.join(ROOT, "tests", "js", "restore_parity.cjs"), dump],
                               capture_output=True, text=True)
            self.assertEqual(p.returncode, 0, p.stdout + p.stderr)


if __name__ == "__main__":
    unittest.main()
