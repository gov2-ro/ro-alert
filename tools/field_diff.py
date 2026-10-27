#!/usr/bin/env python3
"""Compare the alerts of two builds field by field, by alert ID.

Usage:
  python3 tools/field_diff.py --dump OLD.json
      Build from the current tracked inputs and write the full alerts (before compaction).
      Run it on the old commit first.
  python3 tools/field_diff.py OLD.json [--allow FIELD,FIELD,places[].county]
      Build again and compare. Prints, per field, how many alerts changed. Exits with status 1
      when the ID set or the delivery rows differ, or when a field outside --allow changed.
      A path such as places[].county allows an added or changed key inside a list of objects.

The build writes nothing to data/. Use a temporary copy of the repository for the old commit.
"""
import argparse
import json
import os
import sys
import collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import build_data  # noqa: E402


def changed_paths(old, new, path=""):
    """Yield the key paths (list items as `name[]`) where old and new differ."""
    if isinstance(old, dict) and isinstance(new, dict):
        for k in sorted(set(old) | set(new)):
            p = f"{path}.{k}" if path else k
            if k not in old or k not in new:
                yield p
            else:
                yield from changed_paths(old[k], new[k], p)
    elif isinstance(old, list) and isinstance(new, list) and len(old) == len(new) \
            and all(isinstance(x, dict) for x in old + new):
        for o, n in zip(old, new):
            yield from changed_paths(o, n, path + "[]")
    elif old != new:
        yield path


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("path", help="OLD.json (compare) or the output file (--dump)")
    ap.add_argument("--dump", action="store_true", help="write the full alerts of the current build")
    ap.add_argument("--allow", default="", help="comma list of key paths that may change")
    opts = ap.parse_args(argv[1:])
    if opts.dump:
        with open(opts.path, "w", encoding="utf-8") as f:
            json.dump(build_data.build()["alerts"], f, ensure_ascii=False)
        print("wrote", opts.path)
        return 0
    allow = {x for x in opts.allow.split(",") if x}
    args = [opts.path]
    with open(args[0], encoding="utf-8") as f:
        old = {a["id"]: a for a in json.load(f)}
    new = {a["id"]: a for a in build_data.build()["alerts"]}
    bad = 0
    if old.keys() != new.keys():
        print("ID sets differ: %d only old, %d only new" % (len(old.keys() - new.keys()), len(new.keys() - old.keys())))
        bad += 1
    counts = collections.Counter()
    samples = {}
    for aid in sorted(old.keys() & new.keys()):
        for p in set(changed_paths(old[aid], new[aid])):
            counts[p] += 1
            samples.setdefault(p, aid)
    for p, n in sorted(counts.items()):
        ok = p in allow
        print("%-34s %5d alerts  e.g. %s %s" % (p, n, samples[p], "" if ok else "  NOT ALLOWED"))
        if not ok:
            bad += 1
    if "deliveries" in counts or any(p.startswith("deliveries") for p in counts):
        bad += 1
    print("alerts compared: %d; fields changed: %d" % (len(old.keys() & new.keys()), len(counts)))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
