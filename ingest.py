#!/usr/bin/env python3
"""Find monthly RO-ALERT files on data.gov.ro and normalize them to sources/YYYY-MM.csv.

  python3 ingest.py                    query CKAN, download new or changed files, parse them
  python3 ingest.py --refresh          also re-check known files for changed bytes
  python3 ingest.py --offline PATH...  parse local files, no network
  python3 ingest.py --result PATH      also write a JSON result for automation

Needs xlrd (.xls) and openpyxl (.xlsx); see requirements.txt. Only this script imports them.

Exit code 0: success, with or without new data (prints "no new data" or the changed months).
Exit code 1: rejected input, download failure, resource conflict or unfinished transaction.

A run changes tracked files only after every job has passed. Steps: discover, download, parse
and validate in a staging folder, then commit with a journal. Writes are not one atomic
filesystem operation. The journal restores the earlier snapshot after a failure or an
interruption.

Several resources for one month: resources with the same bytes collapse into the one with the
lowest resource id. Resources with different bytes are a conflict. The owner resolves a conflict
in sources/resource_choices.json: {"YYYY-MM": "<resource id>"}.
"""
import argparse
import csv
import hashlib
import io
import json
import os
import re
import shutil
import sys
import tempfile
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.abspath(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
SOURCES = os.path.join(ROOT, "sources")
MANIFEST = os.path.join(SOURCES, "manifest.json")
CHOICES = os.path.join(SOURCES, "resource_choices.json")  # optional, tracked
RAW_DIR = os.path.join(ROOT, "repository", "arhiva-ro-alert", "ckan")  # ignored by version control
STATUS_FILE = os.path.join(ROOT, "repository", "arhiva-ro-alert", "ingest-status.json")  # ignored

CKAN_URL = ("https://data.gov.ro/api/3/action/package_search"
            "?q=mesaje+ro-alert&fq=organization:inspectoratul-general-pentru-situatii-de-urgenta")
PAGE_ROWS = 100
HEADER_KEY = "Continut mesaj"
REQUIRED_HEADERS = ("Continut mesaj", "Nume si data alerta", "Data trimitere")
# Warnings that the owner accepted: (month, exact text). Any other warning is new.
ACCEPTED_WARNINGS = {("2026-08", "Grand Total 556 differs from row count 557")}
MONTH_NUM = {"ianuarie": 1, "februarie": 2, "martie": 3, "aprilie": 4, "mai": 5,
             "iunie": 6, "iulie": 7, "august": 8, "septembrie": 9, "octombrie": 10,
             "noiembrie": 11, "decembrie": 12}
TITLE_RE = re.compile(r"luna\s+([a-zA-Zăâîșț]+)\s+(\d{4})", re.I)

_FAULT = None  # test hook: called with the index of each applied operation


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
    present = {c.strip() for c in rows[hdr]}
    missing = [h for h in REQUIRED_HEADERS if h not in present]
    if missing:
        raise IngestError("missing required header(s): " + ", ".join(missing))
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
    return c.most_common()[0][0] if c else None


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
        if grand_total is None:
            raise IngestError("summary workbook has no Grand Total row")
        entry["summary"] = summary
    return entry, rows


def csv_bytes(columns, rows):
    """Serialize one month to the normalized CSV bytes (UTF-8, LF)."""
    buf = io.StringIO(newline="")
    w = csv.DictWriter(buf, fieldnames=columns, lineterminator="\n")
    w.writeheader()
    w.writerows(rows)
    return buf.getvalue().encode("utf-8")


# --- manifest ------------------------------------------------------------------
def load_manifest():
    if not os.path.exists(MANIFEST):
        return []
    try:
        with open(MANIFEST, encoding="utf-8") as f:
            data = json.load(f)
    except ValueError as e:
        raise IngestError("sources/manifest.json is not valid JSON: %s" % e)
    if not isinstance(data, list) or not all(isinstance(e, dict) and e.get("month") for e in data):
        raise IngestError("sources/manifest.json must be a list of entries with a month")
    return data


def manifest_bytes(entries):
    entries = sorted(entries, key=lambda e: (e["month"], e.get("dataset") or ""))
    return (json.dumps(entries, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def load_choices():
    if not os.path.exists(CHOICES):
        return {}
    try:
        with open(CHOICES, encoding="utf-8") as f:
            data = json.load(f)
    except ValueError as e:
        raise IngestError("sources/resource_choices.json is not valid JSON: %s" % e)
    if not isinstance(data, dict):
        raise IngestError("sources/resource_choices.json must map a month to a resource id")
    return data


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# --- CKAN ------------------------------------------------------------------------
def http_get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "ro-alert-ingest/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def list_resources():
    """Return all active resources, in a stable order. Follow pages until `count` is reached."""
    out, seen_pkg, start = [], set(), 0
    while True:
        page = json.loads(http_get("%s&rows=%d&start=%d" % (CKAN_URL, PAGE_ROWS, start)))
        if page.get("success") is not True:
            raise IngestError("CKAN reported failure: %s" % json.dumps(page.get("error"), ensure_ascii=False))
        result = page["result"]
        pkgs = result["results"]
        for p in pkgs:
            if p["id"] in seen_pkg:
                continue
            seen_pkg.add(p["id"])
            for r in p.get("resources", []):
                if r.get("state", "active") != "active":
                    continue
                out.append({"dataset": p["name"], "title": p["title"], "resource_id": r["id"],
                            "url": r["url"], "last_modified": r.get("last_modified")})
        start += len(pkgs)
        if not pkgs or start >= result.get("count", 0):
            break
    return sorted(out, key=lambda r: r["resource_id"])


def download(res, dest_dir):
    os.makedirs(dest_dir, exist_ok=True)
    name = os.path.basename(urllib.parse.urlparse(res["url"]).path)
    path = os.path.join(dest_dir, "%s-%s" % (res["resource_id"][:8], name))
    with open(path, "wb") as f:
        f.write(http_get(res["url"]))
    return path


# --- staging -----------------------------------------------------------------------
def rid(meta):
    """Identity of a source: the resource id online, the dataset (file name) offline."""
    return meta.get("resource_id") or meta.get("dataset")


def describe(meta):
    return "resource %s (%s)" % (rid(meta), meta.get("url") or meta.get("dataset"))


def stage_job(path, meta, stage):
    """Download (when `path` is None), parse and validate one job. Nothing tracked changes.
    Return a dict: meta, raw path, sha256, entry fields, CSV bytes. Raise IngestError with context."""
    try:
        if path is None:
            path = download(meta, os.path.join(stage, "raw"))
        fields, rows = parse_file(path, meta.get("title"))
        if fields["shape"] != "S":
            from build_data import validate_rows  # standard library only
            problems = validate_rows(rows, meta.get("dataset") or "?")
            if problems:
                raise IngestError("invalid rows: " + "; ".join(problems[:5])
                                  + (" (+%d more)" % (len(problems) - 5) if len(problems) > 5 else ""))
        data = csv_bytes(fields["columns"], rows) if fields["shape"] != "S" else None
        return {"meta": meta, "raw": path, "sha256": sha256_of(path), "fields": fields, "csv": data}
    except IngestError as e:
        raise IngestError("%s: %s" % (describe(meta), e))
    except Exception as e:  # download error, unreadable workbook
        raise IngestError("%s: %s: %s" % (describe(meta), type(e).__name__, e))


# --- planning ------------------------------------------------------------------------
def change_kind(old, new):
    """Name the change of a month: for the report only."""
    if old is None:
        return "new"
    if old["shape"] != "S" and new["shape"] == "S":
        return "detail_to_summary"
    if old["shape"] == "S" and new["shape"] != "S":
        return "summary_to_detail"
    return "summary_changed" if new["shape"] == "S" else "detail_changed"


def plan(manifest, staged, active, choices, checked_at):
    """Decide the new manifest and file operations. Pure: no file access.

    manifest: current entries. staged: staged jobs. active: resources currently listed
    (empty offline). Return {"entries", "csv_writes": {month: bytes}, "csv_deletes": [month],
    "outcomes": [...]} or raise IngestError for a conflict."""
    by_rid = {e["resource_id"]: e for e in manifest if e.get("resource_id")}
    by_month = {e["month"]: e for e in manifest}
    candidates = {}  # month -> {identity: candidate}
    outcomes = []

    for s in staged:
        meta, f = s["meta"], s["fields"]
        month, ident = f["month"], rid(meta)
        prior = by_rid.get(ident) if meta.get("resource_id") else by_month.get(month)
        if prior and prior["month"] != month:
            raise IngestError("%s changed month from %s to %s; the owner must decide"
                              % (describe(meta), prior["month"], month))
        new_entry = {"dataset": meta.get("dataset"), "resource_id": meta.get("resource_id"),
                     "url": meta.get("url"), "last_modified": meta.get("last_modified"),
                     "fetched_at": checked_at, "sha256": s["sha256"], **f}
        cand = {"ident": ident, "meta": meta, "sha": s["sha256"], "staged": s, "entry": new_entry,
                "prior": prior}
        if prior and prior.get("sha256") == s["sha256"]:
            # same bytes: keep the entry; only a source metadata change is recorded
            kept = dict(prior)
            if meta.get("last_modified") != prior.get("last_modified") and meta.get("resource_id"):
                kept["last_modified"] = meta.get("last_modified")
                kept["url"] = meta.get("url") or prior.get("url")
                cand["outcome"] = "metadata"
            else:
                cand["outcome"] = "unchanged"
            cand["entry"] = kept
            cand["same_bytes"] = True
        else:
            cand["outcome"] = "revised" if prior else "new"
        candidates.setdefault(month, {})[ident] = cand

    # active resources that are not staged still count for their month
    staged_ids = {rid(s["meta"]) for s in staged}
    for res in active:
        if res["resource_id"] in staged_ids:
            continue
        e = by_rid.get(res["resource_id"])
        if e:
            candidates.setdefault(e["month"], {})[res["resource_id"]] = {
                "ident": res["resource_id"], "meta": res, "sha": e.get("sha256"), "staged": None,
                "entry": e, "prior": e, "outcome": "unchanged", "same_bytes": True}

    final = {e["month"]: e for e in manifest}
    csv_writes, csv_deletes, picked = {}, [], {}
    for month in sorted(candidates):
        cands = candidates[month]
        chosen_id = choices.get(month)
        if chosen_id is not None:
            if chosen_id not in cands:
                raise IngestError("resource_choices.json picks %s for %s, but that resource is not "
                                  "an active resource of the month" % (chosen_id, month))
            chosen = cands[chosen_id]
        elif len(cands) == 1:
            chosen = next(iter(cands.values()))
        else:
            shas = {c["sha"] for c in cands.values()}
            if len(shas) == 1 and None not in shas:
                chosen = cands[min(cands)]  # same bytes: the lowest resource id
                chosen = dict(chosen)
                chosen["entry"] = dict(chosen["entry"])
                chosen["entry"]["duplicate_resource_ids"] = sorted(i for i in cands if i != chosen["ident"])
            else:
                lines = ["  %s  %s  sha256 %s" % (i, c["meta"].get("url"), (c["sha"] or "unknown")[:12])
                         for i, c in sorted(cands.items())]
                raise IngestError(
                    "month %s has %d active resources with different content. Add the chosen "
                    "resource id to sources/resource_choices.json as {\"%s\": \"<id>\"}.\n%s"
                    % (month, len(cands), month, "\n".join(lines)))
        picked[month] = chosen

    for month, c in picked.items():
        entry, old = c["entry"], by_month.get(month)
        if c["outcome"] in ("new", "revised"):
            s = c["staged"]
            if s["fields"]["shape"] == "S":
                if old is not None and old["shape"] != "S":
                    csv_deletes.append(month)
            else:
                csv_writes[month] = s["csv"]
            c["kind"] = change_kind(old, entry)
        elif c["outcome"] == "unchanged" and old is not None and old.get("resource_id") != entry.get("resource_id"):
            # a choice selected another recorded resource without new bytes: refuse to guess
            raise IngestError("month %s: the chosen resource differs from the recorded one and "
                              "was not staged" % month)
        final[month] = entry

    for c in picked.values():
        outcomes.append({"month": c["entry"]["month"], "resource_id": c["entry"].get("resource_id"),
                         "dataset": c["entry"].get("dataset"), "outcome": c["outcome"],
                         "kind": c.get("kind"), "shape": c["entry"]["shape"],
                         "rows": c["entry"]["rows"]})
    # an unchanged-bytes revision with a different CSV path needs no write
    return {"entries": list(final.values()), "csv_writes": csv_writes, "csv_deletes": csv_deletes,
            "outcomes": sorted(outcomes, key=lambda o: (o["month"], o["resource_id"] or "")),
            "picked": picked}


# --- transaction ----------------------------------------------------------------------
def txn_dir():
    return os.path.join(SOURCES, ".ingest-txn")


def _fsync_write(path, data):
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def _rollback(txn):
    with open(os.path.join(txn, "journal.json"), encoding="utf-8") as f:
        journal = json.load(f)
    for item in journal["files"]:
        target = os.path.join(SOURCES, item["name"])
        if item["existed"]:
            with open(os.path.join(txn, "backup", item["name"]), "rb") as f:
                _fsync_write(target, f.read())
        elif os.path.exists(target):
            os.remove(target)


def commit(writes, deletes, manifest_data):
    """Apply file changes with a journal. writes: {file name: bytes}; deletes: [file name].
    The manifest is written last. On an ordinary exception, restore the earlier files."""
    txn = txn_dir()
    if os.path.exists(txn):
        raise IngestError("unfinished transaction in %s; run recover first" % txn)
    names = sorted(set(writes) | set(deletes)) + ["manifest.json"]
    os.makedirs(os.path.join(txn, "backup"))
    files = []
    for n in names:
        p = os.path.join(SOURCES, n)
        existed = os.path.exists(p)
        files.append({"name": n, "existed": existed})
        if existed:
            shutil.copy2(p, os.path.join(txn, "backup", n))
    _fsync_write(os.path.join(txn, "journal.json"),
                 json.dumps({"state": "committing", "files": files}).encode("utf-8"))
    ops = [("write", n, writes[n]) for n in sorted(writes)] + [("delete", n, None) for n in sorted(deletes)] \
        + [("write", "manifest.json", manifest_data)]
    try:
        for i, (kind, n, data) in enumerate(ops):
            if kind == "write":
                _fsync_write(os.path.join(SOURCES, n), data)
            elif os.path.exists(os.path.join(SOURCES, n)):
                os.remove(os.path.join(SOURCES, n))
            if _FAULT:
                _FAULT(i)
    except Exception:
        _rollback(txn)
        shutil.rmtree(txn)
        raise
    _fsync_write(os.path.join(txn, "journal.json"),
                 json.dumps({"state": "committed", "files": files}).encode("utf-8"))
    shutil.rmtree(txn)


def recover():
    """Settle an unfinished transaction before any read of sources/. Return a message or None.
    Restore the earlier snapshot of an interrupted commit. Refuse an unreadable journal."""
    if os.path.isdir(SOURCES):
        for n in os.listdir(SOURCES):
            if n.startswith(".stage-"):
                shutil.rmtree(os.path.join(SOURCES, n), ignore_errors=True)
    txn = txn_dir()
    if not os.path.exists(txn):
        return None
    jp = os.path.join(txn, "journal.json")
    if not os.path.exists(jp):  # backup step was interrupted: nothing was applied yet
        shutil.rmtree(txn)
        return "removed an incomplete transaction (no file had changed)"
    try:
        with open(jp, encoding="utf-8") as f:
            state = json.load(f)["state"]
    except (ValueError, KeyError, OSError):
        raise IngestError("transaction journal %s is unreadable; restore sources/ from version "
                          "control and delete %s" % (jp, txn))
    if state == "committed":
        shutil.rmtree(txn)
        return "removed a finished transaction"
    if state != "committing":
        raise IngestError("transaction journal has unknown state %r; refusing to continue" % state)
    _rollback(txn)
    shutil.rmtree(txn)
    return "restored the earlier snapshot after an interrupted update"


# --- run ----------------------------------------------------------------------------
def select_jobs(manifest, active, refresh, choices):
    """Pick the resources to download: new, changed, chosen but not recorded, or all on refresh."""
    known = {(e.get("resource_id"), e.get("last_modified")) for e in manifest if e.get("resource_id")}
    recorded = {e["month"]: e.get("resource_id") for e in manifest}
    chosen = set(choices.values())
    jobs = []
    for res in active:
        if refresh or (res["resource_id"], res["last_modified"]) not in known \
                or (res["resource_id"] in chosen and res["resource_id"] not in recorded.values()):
            jobs.append((None, res))
    return jobs


def write_status(result):
    try:
        os.makedirs(os.path.dirname(STATUS_FILE), exist_ok=True)
        with open(STATUS_FILE, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2, sort_keys=True)
            f.write("\n")
    except OSError as e:
        print("WARNING: cannot write the run status: %s" % e, file=sys.stderr)


def run(offline=None, refresh=False, result_path=None):
    """Run once. Return (exit code, result dict)."""
    checked_at = now_iso()
    result = {"schema": 1, "status": "failed", "checked_at": checked_at,
              "mode": "offline" if offline else ("refresh" if refresh else "check"),
              "changed_months": [], "outcomes": [], "warnings": [], "errors": []}
    stage = None
    try:
        note = recover()
        if note:
            print("recovery: " + note, file=sys.stderr)
        manifest = load_manifest()
        choices = load_choices()
        os.makedirs(SOURCES, exist_ok=True)
        stage = tempfile.mkdtemp(prefix=".stage-", dir=SOURCES)

        if offline:
            active = []
            jobs = [(p, {"dataset": os.path.basename(p)}) for p in offline]
        else:
            active = list_resources()
            jobs = select_jobs(manifest, active, refresh, choices)

        staged, errors = [], []
        for path, meta in jobs:
            try:
                staged.append(stage_job(path, meta, stage))
            except IngestError as e:
                errors.append(str(e))
        if errors:
            result["errors"] = errors
            for e in errors:
                print("ERROR " + e, file=sys.stderr)
            return 1, result

        p = plan(manifest, staged, active, choices, checked_at)
        result["outcomes"] = p["outcomes"]
        changed = [o for o in p["outcomes"] if o["outcome"] in ("new", "revised", "metadata")]
        result["changed_months"] = sorted({o["month"] for o in changed})
        for o in changed:
            for w in p["picked"][o["month"]]["entry"]["warnings"]:
                acc = (o["month"], w) in ACCEPTED_WARNINGS
                result["warnings"].append({"month": o["month"], "text": w, "accepted": acc})
                print("WARNING %s (%s)%s: %s" % (o["month"], o["dataset"], " [accepted]" if acc else "", w),
                      file=sys.stderr)
        if changed:
            writes = {m + ".csv": data for m, data in p["csv_writes"].items()}
            deletes = [m + ".csv" for m in p["csv_deletes"]]
            commit(writes, deletes, manifest_bytes(p["entries"]))
            # raw files are a cache: move them in only after the sources committed
            for o in changed:
                s = p["picked"][o["month"]]["staged"]
                if s and os.path.dirname(s["raw"]).startswith(stage) and s["raw"].startswith(stage):
                    try:
                        os.makedirs(RAW_DIR, exist_ok=True)
                        os.replace(s["raw"], os.path.join(RAW_DIR, os.path.basename(s["raw"])))
                    except OSError as e:
                        print("WARNING: cannot keep the raw file: %s" % e, file=sys.stderr)
            print("changed: " + ", ".join(
                "%s (%s, %s, %d rows)" % (o["month"], o["outcome"], o["shape"], o["rows"]) for o in changed))
            result["status"] = "changed"
        else:
            print("no new data")
            result["status"] = "no_change"
        return 0, result
    except IngestError as e:
        result["errors"].append(str(e))
        print("ERROR " + str(e), file=sys.stderr)
        return 1, result
    except Exception as e:  # unexpected: still a failure, never a silent success
        result["errors"].append("%s: %s" % (type(e).__name__, e))
        print("ERROR %s: %s" % (type(e).__name__, e), file=sys.stderr)
        return 1, result
    finally:
        if stage:
            shutil.rmtree(stage, ignore_errors=True)
        write_status(result)
        if result_path:
            with open(result_path, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2, sort_keys=True)
                f.write("\n")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--offline", nargs="+", metavar="PATH", help="parse local files, no network")
    ap.add_argument("--refresh", action="store_true",
                    help="download known resources again and compare bytes")
    ap.add_argument("--result", metavar="PATH", help="write a JSON result for automation")
    args = ap.parse_args(argv)
    code, _ = run(args.offline, args.refresh, args.result)
    return code


if __name__ == "__main__":
    sys.exit(main())
