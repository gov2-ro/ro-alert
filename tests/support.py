"""Shared helpers: a temporary ingest workspace and a fake CKAN service. No network."""
import contextlib
import hashlib
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
from urllib.parse import parse_qs, urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURES = os.path.join(ROOT, "tests", "fixtures", "workbooks")
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import ingest  # noqa: E402
import wbfactory  # noqa: E402

try:
    import openpyxl  # noqa: F401
    import xlrd  # noqa: F401
    HAVE_READERS = True
except ImportError:
    HAVE_READERS = False


def tree(path):
    """{relative path: sha256} for every file under `path` (the byte-level snapshot)."""
    out = {}
    for base, _, names in os.walk(path):
        for n in names:
            p = os.path.join(base, n)
            with open(p, "rb") as f:
                out[os.path.relpath(p, path)] = hashlib.sha256(f.read()).hexdigest()
    return out


class FakeCkan:
    """Serves package_search pages and resource files. `resources` is a list of dicts:
    id, dataset, title, url, last_modified, data (bytes)."""

    def __init__(self, resources=None):
        self.resources = list(resources or [])
        self.success = True
        self.requests = []

    def add(self, rid, title, data, last_modified="2030-01-01T00:00:00", dataset=None):
        url = "https://example.invalid/dataset/%s/download/%s.xlsx" % (rid[:8], rid)
        self.resources = [r for r in self.resources if r["id"] != rid]
        self.resources.append({"id": rid, "dataset": dataset or ("ds-" + rid[:8]), "title": title,
                               "url": url, "last_modified": last_modified, "data": data})

    def http_get(self, url):
        self.requests.append(url)
        if url.startswith(ingest.CKAN_URL):
            q = parse_qs(urlparse(url).query)
            start, rows = int(q["start"][0]), int(q["rows"][0])
            page = self.resources[start:start + rows]
            return json.dumps({"success": self.success, "result": {
                "count": len(self.resources),
                "results": [{"id": "pkg-" + r["id"], "name": r["dataset"], "title": r["title"],
                             "resources": [{"id": r["id"], "url": r["url"], "state": "active",
                                            "last_modified": r["last_modified"]}]} for r in page]}}).encode()
        for r in self.resources:
            if r["url"] == url:
                return r["data"]
        raise IOError("404 " + url)


def book_bytes(book, name="x.xlsx"):
    d = tempfile.mkdtemp()
    try:
        p = os.path.join(d, name)
        wbfactory.write_xlsx(p, book)
        with open(p, "rb") as f:
            return f.read()
    finally:
        shutil.rmtree(d)


def fixture_bytes(name):
    with open(os.path.join(FIXTURES, name), "rb") as f:
        return f.read()


class IngestCase(unittest.TestCase):
    """A temporary workspace with the ingest module pointed at it."""

    def setUp(self):
        if not HAVE_READERS:
            self.skipTest("openpyxl and xlrd are not installed (pip install -r requirements.txt)")
        self.tmp = tempfile.mkdtemp(prefix="ro-alert-test-")
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.saved = {k: getattr(ingest, k) for k in
                      ("SOURCES", "MANIFEST", "CHOICES", "RAW_DIR", "STATUS_FILE", "http_get", "_FAULT", "PAGE_ROWS")}
        self.sources = os.path.join(self.tmp, "sources")
        os.makedirs(self.sources)
        ingest.SOURCES = self.sources
        ingest.MANIFEST = os.path.join(self.sources, "manifest.json")
        ingest.CHOICES = os.path.join(self.sources, "resource_choices.json")
        ingest.RAW_DIR = os.path.join(self.tmp, "raw")
        ingest.STATUS_FILE = os.path.join(self.tmp, "status", "ingest-status.json")
        ingest._FAULT = None
        self.ckan = FakeCkan()
        ingest.http_get = self.ckan.http_get
        self.addCleanup(self.restore)

    def restore(self):
        for k, v in self.saved.items():
            setattr(ingest, k, v)

    def run_ingest(self, *args):
        """Run main() with captured output. Return (exit code, stdout, stderr)."""
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = ingest.main(list(args))
        return code, out.getvalue(), err.getvalue()

    def snapshot(self):
        return tree(self.sources)

    def manifest(self):
        with open(ingest.MANIFEST, encoding="utf-8") as f:
            return json.load(f)

    def result(self, code_args=()):
        path = os.path.join(self.tmp, "result.json")
        code, out, err = self.run_ingest("--result", path, *code_args)
        with open(path, encoding="utf-8") as f:
            return code, json.load(f), out, err
