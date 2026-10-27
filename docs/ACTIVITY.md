# Activity

## 2026-10-27 — Ingest spike and brief

**Done**
- Consolidated the `web/`, `web-v2/`, `web-v3/` builds into the repo root. Added `CLAUDE.md`.
- Queried the data.gov.ro CKAN API: 11 monthly datasets, 2025-09 to 2026-08. The current
  dashboard has only 2026-02 to 2026-04 (648 alerts).
- Downloaded and inspected all 11 files. Wrote `docs/briefs/ckan-ingest.md`.

**Hard**
- The files have three shapes: summary only (4 months, no messages), summary + report
  (4 months), and raw details (3 months). The column set changes every month (9 to 21).
- Row counts per month: Feb 76, Mar 102, Apr 470, May 618, Jun 1185, Jul 610, Aug 557.
- The `Grand Total` check fails for August: 557 rows, total 556. The cause is not known.
- Only April reports ERROR rows (196 of 470). The current failure-rate KPI (30%) comes
  from April alone.

**Decided**
- Discover files through the CKAN API, not HTML. The API gives resource ids and
  `last_modified`, so the ingest downloads only new files.
- Parse XLS/XLSX with `xlrd` and `openpyxl`, only in the ingest step. The alternative
  (LibreOffice in CI) costs a large install and a second conversion to debug.
- Commit normalized `sources/YYYY-MM.csv`; keep raw files ignored. A clone rebuilds offline.
- CI opens a pull request and does not push to `main`, because the format drifts.
- Assumed, not measured: the LLM-merged CSV equals a direct parse of the Feb–Apr files.
  Acceptance test 1 of the brief measures it.
