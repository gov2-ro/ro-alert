"""Build determinism (audit 01, check A10, bundle part).

The test copies the build inputs to a temporary folder, so it never touches `data/`.
Run: python3 -m unittest discover -s tests -p 'test_*.py'
"""
import hashlib
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def digest(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


class BuildIsDeterministic(unittest.TestCase):
    def test_two_builds_give_identical_bundles_equal_to_the_tracked_ones(self):
        with tempfile.TemporaryDirectory() as tmp:
            shutil.copy(os.path.join(ROOT, "build_data.py"), tmp)
            shutil.copytree(os.path.join(ROOT, "sources"), os.path.join(tmp, "sources"))
            shutil.copytree(os.path.join(ROOT, "gazetteer"), os.path.join(tmp, "gazetteer"))
            shutil.copytree(os.path.join(ROOT, "geometry"), os.path.join(tmp, "geometry"))
            runs = []
            for _ in range(2):
                subprocess.run([sys.executable, "build_data.py"], cwd=tmp, check=True,
                               stdout=subprocess.DEVNULL)
                runs.append({n: digest(os.path.join(tmp, "data", n)) for n in ("alerts.js", "meta.js", "geo.js")})
            self.assertEqual(runs[0], runs[1])
            for n in ("alerts.js", "meta.js", "geo.js"):
                self.assertEqual(runs[0][n], digest(os.path.join(ROOT, "data", n)),
                                 "%s differs from the tracked bundle: rebuild and commit" % n)


if __name__ == "__main__":
    unittest.main()
