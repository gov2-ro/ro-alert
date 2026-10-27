# Activity

## 2026-10-27 — CKAN ingest built (branch `feat/ckan-ingest`)

**Done**
- `ingest.py`: CKAN discovery, download of new or changed resources, shape detection by sheet
  names, column mapping by header name, `sources/YYYY-MM.csv` and `sources/manifest.json`.
- `build_data.py` reads `sources/*.csv`; string `id`; `month` label `<Luna> <YYYY>`; dedup by `id`.
- `js/`: removed the `+` number cast before `openDrawer(...)` in `table.js`, `feed.js`, `location.js`.
- `.github/workflows/ingest.yml` (daily 06:00 UTC, opens a pull request), `requirements.txt`,
  `CLAUDE.md` Commands.
- Measured, offline run on the 11 files: rows per month Feb 76, Mar 102, Apr 470, May 618,
  Jun 1185, Jul 610, Aug 557 (3618 in all); shape S months 2025-09/10/12 and 2026-01 give
  manifest entries only (item totals equal the Grand Total: 286, 146, 96, 61).
- Measured, parity without dedup: 648 records, `sent=452 error=196 cancel=41`. Fields
  `judet`, `risk_category`, `sent_at`, `msg`: 0 differences in 648. Only the Gemini CSV
  wrote `nr_repetitii`, `interval_repetitie` (April) and `id_alerta` (March) as floats
  (`246.0`); the parser writes `246`.
- Measured, online run equals offline run (all 7 CSV files byte-identical); a second run prints
  `no new data` and changes no file. `data/alerts.js` is 6.8 MB for 3404 alerts.

**Hard**
- **The `id` rule from the brief fails for April.** The build with dedup gives `total=3404`
  (`sent=3383 error=21 cancel=35`) and 214 duplicates removed, all in April. April has two
  delivery rows per message: `Tip inregistrare` = `...canalul CBC CMAS` (`Audienta` CMAS) and
  `...canalul STS`. They share `title|sent_at|msg`, so the hash is equal. Added `Tip
  inregistrare` to the key, the count is 469 unique of 470 (measured, not applied).
- August: Grand Total 556, 557 rows. The cause is unknown; the manifest holds a warning.
- Month source in offline mode: the summary sheet title `Mesaje RO-ALERT - luna <x> <yyyy>`
  (it equals the CKAN dataset title). Shape D has no summary sheet, so the parser takes the most
  common `YYYY-MM` of `Data trimitere`. Measured: all 11 months agree between title and data.

**Decided**
- Kept the brief's dedup rule in `build_data.py` and did not tune it, because a change is a
  decision of the brief. The owner decides (see BACKLOG). Cost of leaving it: the dashboard
  loses 214 April rows and the KPI shows 21 ERROR rows, not 196.
- One manifest entry per month: a new file for a month replaces the earlier entry. Cost of the
  alternative (entries per resource): stale offline entries and a double download.
- Added a `summary` list (risk, associated risk, total) to shape S manifest entries, and a
  `month_source` field to all entries.
- Values of `source_file` are now `YYYY-MM.csv` (before: `26-02.csv`).

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
