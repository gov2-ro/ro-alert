#!/usr/bin/env bash
# Run ingest.py for the scheduled workflow and write the step outputs.
# Exit code 0 when ingest finds no new data. Exit code 1 (or any non-zero code) when ingest
# fails: the pipe below keeps the code of ingest.py, not the code of tee.
# Environment (for tests): PYTHON, INGEST_SCRIPT, GITHUB_OUTPUT.
set -euo pipefail

PYTHON="${PYTHON:-python3}"
INGEST="${INGEST_SCRIPT:-ingest.py}"
OUT="${GITHUB_OUTPUT:-/dev/null}"

rm -f ingest-result.json
"$PYTHON" "$INGEST" --result ingest-result.json | tee ingest.log
"$PYTHON" tools/ingest_report.py ingest-result.json sources/manifest.json >> "$OUT"
