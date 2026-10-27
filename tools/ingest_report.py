#!/usr/bin/env python3
"""Turn the structured ingest result into step outputs for the workflow.

  python3 tools/ingest_report.py ingest-result.json sources/manifest.json >> "$GITHUB_OUTPUT"

Prints `months=<list>` and a `body` block for the pull request. An empty month list is valid.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ingest import ACCEPTED_WARNINGS  # noqa: E402


def main(result_path, manifest_path):
    with open(result_path, encoding="utf-8") as f:
        result = json.load(f)
    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)
    months = ", ".join(result.get("changed_months", []))
    lines = ["Changed months: %s." % (months or "none")]
    for o in result.get("outcomes", []):
        if o["outcome"] in ("new", "revised", "metadata"):
            lines.append("- %s: %s%s" % (o["month"], o["outcome"], " (%s)" % o["kind"] if o.get("kind") else ""))
    new = [w for w in result.get("warnings", []) if not w["accepted"]]
    lines += ["", "New warnings:"] + (["- %s: %s" % (w["month"], w["text"]) for w in new] or ["- none"])
    accepted = [(e["month"], w) for e in manifest for w in e.get("warnings", [])
                if (e["month"], w) in ACCEPTED_WARNINGS]
    other = [(e["month"], w) for e in manifest for w in e.get("warnings", [])
             if (e["month"], w) not in ACCEPTED_WARNINGS]
    lines += ["", "Accepted warnings (owner decision):"] + (["- %s: %s" % x for x in accepted] or ["- none"])
    lines += ["", "Other warnings in the manifest:"] + (["- %s: %s" % x for x in other] or ["- none"])
    lines += ["", "A person must review each changed month before the merge."]
    print("months=" + months)
    print("body<<EOF_BODY")
    print("\n".join(lines))
    print("EOF_BODY")
    return 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:3]))
