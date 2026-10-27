#!/usr/bin/env python3
"""Find monthly RO-ALERT files on data.gov.ro and normalize them to sources/YYYY-MM.csv.

  python3 ingest.py                    query CKAN, download new or changed files, parse them
  python3 ingest.py --offline PATH...  parse local files, no network

Needs xlrd (.xls) and openpyxl (.xlsx); see requirements.txt. Only this script imports them.
Exit code: 0 on success (prints "no new data" or the new months), 1 when a file has an
unknown shape or no "Continut mesaj" header.
"""
import argparse
import csv
import hashlib
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
SOURCES = os.path.join(ROOT, "sources")
MANIFEST = os.path.join(SOURCES, "manifest.json")
RAW_DIR = os.path.join(ROOT, "repository", "arhiva-ro-alert", "ckan")  # git-ignored

CKAN_URL = ("https://data.gov.ro/api/3/action/package_search"
            "?q=mesaje+ro-alert&fq=organization:inspectoratul-general-pentru-situatii-de-urgenta"
            "&rows=100")
HEADER_KEY = "Continut mesaj"
MONTH_NUM = {"ianuarie": 1, "februarie": 2, "martie": 3, "aprilie": 4, "mai": 5,
             "iunie": 6, "iulie": 7, "august": 8, "septembrie": 9, "octombrie": 10,
             "noiembrie": 11, "decembrie": 12}
TITLE_RE = re.compile(r"luna\s+([a-zA-Zăâîșț]+)\s+(\d{4})", re.I)


class IngestError(Exception):
    pass


# --- reading workbooks -------------------------------------------------------
def _fmt(v):
    """Turn one cell value into text."""
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.strftime("%Y/%m/%d %H:%M:%S")
    if isinstance(v, float):
        return str(int(v)) if v == int(v) else repr(v)
    return str(v).strip()


def read_workbook(path):
    """Return {sheet name: list of rows (lists of text)}. Pick the library from the file bytes."""
    with open(path, "rb") as f:
        magic = f.read(4)
    sheets = {}
    if magic[:2] == b"PK":
        import openpyxl
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        for ws in wb.worksheets:
            sheets[ws.title] = [[_fmt(c) for c in row] for row in ws.iter_rows(values_only=True)]
        wb.close()
    elif magic == b"\xd0\xcf\x11\xe0":
        import xlrd
        wb = xlrd.open_workbook(path)
        for ws in wb.sheets():
            sheets[ws.name] = [[_fmt(c) for c in ws.row_values(r)] for r in range(ws.nrows)]
    else:
        raise IngestError("not an Excel file (unknown file signature)")
    return sheets


def detect_shape(names):
    n = set(names)
    if n == {"Message_Details"}:
        return "D"
    if n == {"Mesaje", "Raport"}:
        return "R"
    if n and all(re.fullmatch(r"Foaie\d+", x) for x in n):
        return "S"
    raise IngestError("unknown shape, sheets: " + ", ".join(sorted(n)))


def summary_info(rows):
    """From a summary sheet: (title text, grand total, [[risc principal, risc asociat, total]])."""
    title, total, items, principal = None, None, [], ""
    for r in rows:
        cells = [c for c in r if c != ""]
        if not cells:
            continue
        if title is None and TITLE_RE.search(cells[0]):
            title = cells[0]
        if cells[0] == "Grand Total" and len(cells) > 1:
            total = int(float(cells[-1]))
        elif len(cells) >= 2 and re.fullmatch(r"-?\d+(\.\d+)?", cells[-1]) \
                and cells[0] not in ("Risc principal",) and not cells[0].endswith(" Total"):
            if len(cells) >= 3:
                principal = cells[0]
            items.append([principal, cells[-2], int(float(cells[-1]))])
    return title, total, items


def parse_message_rows(rows, warnings):
    """Find the header row, map columns by name, return (columns, list of row dicts)."""
    hdr = next((i for i, r in enumerate(rows) if HEADER_KEY in [c.strip() for c in r]), None)
    if hdr is None:
        raise IngestError('no "%s" header row' % HEADER_KEY)
    cols = []  # (index, name)
    seen = set()
    for i, h in enumerate(rows[hdr]):
        h = h.strip()
        if not h or re.fullmatch(r"Column\d+", h):
            continue
        if h in seen:
            warnings.append("duplicate header %r at column %d ignored" % (h, i))
            continue
        seen.add(h)
        cols.append((i, h))
    out = []
    for r in rows[hdr + 1:]:
        d = {name: (r[i] if i < len(r) else "") for i, name in cols}
        if any(v != "" for v in d.values()):
            out.append(d)
    return [n for _, n in cols], out


def title_month(title):
    m = TITLE_RE.search(title or "")
    if not m or m.group(1).lower() not in MONTH_NUM:
        return None
    return "%s-%02d" % (m.group(2), MONTH_NUM[m.group(1).lower()])


def modal_month(rows):
    c = Counter()
    for d in rows:
        m = re.match(r"(\d{4})[/-](\d{2})", d.get("Data trimitere", ""))
        if m:
            c[m.group(1) + "-" + m.group(2)] += 1
    return c.most_common(1)[0][0] if c else None


def parse_file(path, dataset_title=None):
    """Parse one file. Return (entry fields, rows). Raise IngestError for a file that cannot be read."""
    sheets = read_workbook(path)
    shape = detect_shape(sheets.keys())
    warnings = []
    sum_rows = sheets.get("Mesaje") or sheets.get("Foaie1") or []
    stitle, grand_total, summary = (summary_info(sum_rows) if shape in ("R", "S") else (None, None, []))

    columns, rows = [], []
    if shape != "S":
        columns, rows = parse_message_rows(sheets["Raport" if shape == "R" else "Message_Details"],
                                           warnings)

    # month: dataset title (online), else summary-sheet title, else the modal Data trimitere month
    month, source = title_month(dataset_title), "dataset title"
    if month is None:
        month, source = title_month(stitle), "summary sheet title"
    if month is None:
        month, source = modal_month(rows), "Data trimitere (most common month)"
    if month is None:
        raise IngestError("cannot find the month")
    if rows:
        dm = modal_month(rows)
        if dm != month:
            warnings.append("month %s (%s) differs from most common Data trimitere month %s"
                            % (month, source, dm))
    if shape == "R" and grand_total is not None and grand_total != len(rows):
        warnings.append("Grand Total %d differs from row count %d" % (grand_total, len(rows)))
    reports_errors = any(d.get("Status trimitere", "").upper() == "ERROR" for d in rows)
    entry = {"month": month, "month_source": source, "shape": shape, "rows": len(rows),
             "grand_total": grand_total, "reports_errors": reports_errors,
             "columns": columns, "warnings": warnings}
    if shape == "S":
        entry["summary"] = summary
    return entry, rows


def write_month_csv(month, columns, rows):
    os.makedirs(SOURCES, exist_ok=True)
    with open(os.path.join(SOURCES, month + ".csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=columns, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


# --- manifest ------------------------------------------------------------------
def load_manifest():
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding="utf-8") as f:
            return json.load(f)
    return []


def save_manifest(entries):
    entries = sorted(entries, key=lambda e: (e["month"], e.get("dataset") or ""))
    os.makedirs(SOURCES, exist_ok=True)
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)
        f.write("\n")


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def build_entry(path, meta):
    """Parse a file, write its CSV (shape D or R) and return its manifest entry."""
    fields, rows = parse_file(path, meta.get("title"))
    if fields["shape"] != "S":
        write_month_csv(fields["month"], fields["columns"], rows)
    return {"dataset": meta.get("dataset"), "resource_id": meta.get("resource_id"),
            "url": meta.get("url"), "last_modified": meta.get("last_modified"),
            "sha256": sha256_of(path), **fields}


# --- CKAN ------------------------------------------------------------------------
def http_get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "ro-alert-ingest/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def list_resources():
    result = json.loads(http_get(CKAN_URL))["result"]
    out = []
    for p in result["results"]:
        for r in p.get("resources", []):
            out.append({"dataset": p["name"], "title": p["title"], "resource_id": r["id"],
                        "url": r["url"], "last_modified": r.get("last_modified")})
    return out


def download(res):
    os.makedirs(RAW_DIR, exist_ok=True)
    name = os.path.basename(urllib.parse.urlparse(res["url"]).path)
    path = os.path.join(RAW_DIR, "%s-%s" % (res["resource_id"][:8], name))
    with open(path, "wb") as f:
        f.write(http_get(res["url"]))
    return path


# --- main --------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--offline", nargs="+", metavar="PATH", help="parse local files, no network")
    args = ap.parse_args()

    manifest = load_manifest()
    new, failed = [], []

    if args.offline:
        jobs = [(p, {"dataset": os.path.basename(p)}) for p in args.offline]
    else:
        known = {(e.get("resource_id"), e.get("last_modified")) for e in manifest if e.get("resource_id")}
        jobs = [(None, res) for res in list_resources()
                if (res["resource_id"], res["last_modified"]) not in known]

    for path, meta in jobs:
        label = meta.get("dataset")
        try:
            if path is None:
                path = download(meta)
            entry = build_entry(path, meta)
        except Exception as e:  # unknown shape, missing header, download error
            print("ERROR %s: %s" % (label, e), file=sys.stderr)
            failed.append(label)
            continue
        # a new file for a month replaces the earlier entry of that month
        manifest = [e for e in manifest if e["month"] != entry["month"]]
        manifest.append(entry)
        new.append(entry)
        for w in entry["warnings"]:
            print("WARNING %s (%s): %s" % (entry["month"], label, w), file=sys.stderr)

    if new:
        save_manifest(manifest)
        print("new: " + ", ".join(
            "%s (%s, %d rows)" % (e["month"], e["shape"], e["rows"]) for e in sorted(new, key=lambda e: e["month"])))
    elif not failed:
        print("no new data")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
