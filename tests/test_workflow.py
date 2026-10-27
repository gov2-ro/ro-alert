"""Workflow script checks (audit 02, P01/P02). Offline: a stub replaces ingest.py."""
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def run_ci(stub_body):
    tmp = tempfile.mkdtemp()
    os.makedirs(os.path.join(tmp, "tools"))
    os.makedirs(os.path.join(tmp, "sources"))
    for f in ("ci_ingest.sh", "ingest_report.py"):
        shutil.copy(os.path.join(ROOT, "tools", f), os.path.join(tmp, "tools", f))
    shutil.copy(os.path.join(ROOT, "ingest.py"), tmp)  # ingest_report imports ACCEPTED_WARNINGS
    with open(os.path.join(tmp, "sources", "manifest.json"), "w") as f:
        f.write("[]")
    stub = os.path.join(tmp, "stub.py")
    with open(stub, "w") as f:
        f.write(stub_body)
    out = os.path.join(tmp, "gh_output")
    env = dict(os.environ, INGEST_SCRIPT=stub, PYTHON=sys.executable, GITHUB_OUTPUT=out)
    p = subprocess.run(["bash", "tools/ci_ingest.sh"], cwd=tmp, env=env, capture_output=True, text=True)
    text = open(out).read() if os.path.exists(out) else ""
    return p, text, tmp


STUB_OK = '''import json, sys
path = sys.argv[sys.argv.index("--result") + 1]
json.dump({"changed_months": %s, "outcomes": [], "warnings": []}, open(path, "w"))
print("no new data")
'''


class CiIngest(unittest.TestCase):
    def test_p01_no_change_exits_zero_with_empty_months(self):
        p, out, _ = run_ci(STUB_OK % "[]")
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertIn("months=\n", out)

    def test_p01_failure_keeps_exit_code(self):
        p, _, _ = run_ci("import sys\nprint('boom')\nsys.exit(1)\n")
        self.assertEqual(p.returncode, 1)

    def test_p01_changed_months_are_reported(self):
        p, out, _ = run_ci(STUB_OK % '["2030-03"]')
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertIn("months=2030-03", out)
        self.assertIn("A person must review", out)

    def test_p02_no_change_leaves_no_tracked_change(self):
        # The run writes only ignored files (ingest-result.json, ingest.log) outside sources/.
        p, _, tmp = run_ci(STUB_OK % "[]")
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertEqual(sorted(os.listdir(os.path.join(tmp, "sources"))), ["manifest.json"])
        with open(os.path.join(ROOT, ".gitignore")) as f:
            ignored = f.read().split()
        self.assertIn("ingest-result.json", ignored)
        self.assertIn("ingest.log", ignored)


class WorkflowFiles(unittest.TestCase):
    def test_p02_pr_step_is_conditional_on_changes(self):
        with open(os.path.join(ROOT, ".github", "workflows", "ingest.yml")) as f:
            s = f.read()
        self.assertIn("steps.diff.outputs.changed == 'true'", s)
        self.assertIn("status --porcelain", s)


if __name__ == "__main__":
    unittest.main()
