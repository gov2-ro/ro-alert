#!/usr/bin/env python3
"""Compare two builds of data/alerts.json by alert ID.

Usage:  python3 tools/risk_change_report.py OLD_ALERTS_JSON [NEW_ALERTS_JSON]

Prints the category counts before and after. Writes data/risk_changes.csv (git-ignored)
with one row per changed alert: id, old category, new category, source risks, rule.
Exits with status 1 when any other alert field, any delivery row, or the set of IDs differs.
"""
import csv
import json
import os
import sys
import collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load(path):
    with open(path, encoding="utf-8") as f:
        return {a["id"]: a for a in json.load(f)}


def main(argv):
    if len(argv) < 2:
        raise SystemExit(__doc__)
    old = load(argv[1])
    new = load(argv[2] if len(argv) > 2 else os.path.join(ROOT, "data", "alerts.json"))
    rules = {}
    with open(os.path.join(ROOT, "data", "risk_rules.csv"), encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            rules[r["id"]] = r["rule"]
    bad = 0
    if old.keys() != new.keys():
        print("ID sets differ: %d only old, %d only new" % (len(old.keys() - new.keys()), len(new.keys() - old.keys())))
        bad += 1
    changes = []
    for aid in sorted(old.keys() & new.keys()):
        o, n = old[aid], new[aid]
        keys = (set(o) | set(n)) - {"risk_category"}
        diff = [k for k in sorted(keys) if o.get(k) != n.get(k)]
        if diff:
            bad += 1
            print("unexpected field change in", aid, diff)
        if o.get("risk_category") != n.get("risk_category"):
            changes.append((aid, o.get("risk_category"), n.get("risk_category"),
                            o.get("risc_principal") or "", o.get("risc_asociat") or "", rules.get(aid, "")))
    out = os.path.join(ROOT, "data", "risk_changes.csv")
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "old_category", "new_category", "risc_principal", "risc_asociat", "rule"])
        w.writerows(changes)
    for label, d in (("before", old), ("after", new)):
        c = collections.Counter(a.get("risk_category") for a in d.values())
        print(label, dict(sorted(c.items(), key=lambda kv: -kv[1])))
    pairs = collections.Counter((c[1], c[2], c[5]) for c in changes)
    print("changed alerts:", len(changes))
    for (o, n, r), k in sorted(pairs.items(), key=lambda kv: -kv[1]):
        print("  %4d  %s -> %s  [%s]" % (k, o, n, r))
    print("wrote", out)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
