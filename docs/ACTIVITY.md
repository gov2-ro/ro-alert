# Activity

## 2026-10-27 — Data size, deploy path, next briefs

**Done**
- Measured the bundle: `alerts.js` 7.2 MB raw, 0.5 MB gzip; `geo.js` 1.35 MB. `msg` repeats
  `msg_ro` + `msg_en` (25% of the file).
- Ran the ingest Action by hand (run 40526336961, and a re-run). Both runs timed out on the
  connection to data.gov.ro, and both reported success. Added `set -o pipefail`.
- lab.gov2.ro is an Apache server on 67.205.1.122, not GitHub Pages.
- Wrote briefs: `data-size`, `localities`, `story-view`.

**Decided**
- Keep the JS globals; no CSV, no SQLite. Both need a server for `file://`, and SQLite
  needs about 1 MB of WASM for 3,385 rows. The size is in duplicate text and null fields.
- Run the scheduled update on the VPS, because GitHub-hosted runners cannot reach
  data.gov.ro. Assumed, not measured: the VPS can reach data.gov.ro.
- Accept the August Grand Total mismatch (owner decision).

## 2026-10-27 — Alert unit: count alerts, not delivery rows (branch `feat/alert-unit`)

**Done**
- `build_data.py`: rows with a `Data creare` value group by file + title + `Data creare` +
  `Tip mesaj`. Other rows stay one alert per row, with the old id. The grouped id is a hash of
  title, `Data creare`, `Tip mesaj`. Each alert has `deliveries` (`channel`, `status`,
  `sent_at`, `audienta`), one per CSV row. `status_ok` is true when one delivery is SENT.
  `sent_at`, `status_trimitere` and the other fields come from the first SENT row, else the first row.
- `meta.json`: new `deliveries`, `delivery_error`, and `months` (per month: `alerts`,
  `deliveries`, `delivery_errors`, `reports_errors` from the manifest).
- Front end: the failure KPI counts failed alerts. A "Failed deliveries" figure with a note
  shows in the dashboard, the location KPIs and the sidebar stats, only when the selection holds
  a month with `reports_errors`. The drawer lists the deliveries (channel, status, time).
  Labels `kpi_error` and `kpi_failed` now say "Failed alerts". Removed the "STS" text in the
  feed sidebar (it assumed a 25% failure rate). `index.html` description: 3385 alerts.

**Measured** (offline run of `build_data.py` on `sources/*.csv`)
- Alerts 3385 (was 3618): Feb 76, Mar 102, Apr 237, May 618, Jun 1185, Jul 610, Aug 557.
  Deliveries 3618 (sum of `len(deliveries)`); ERROR deliveries 196.
- `sent=3384 error=1 cancel=21` (was 3422/196/41). April: 216 ALERT + 21 CANCEL, 1 alert with
  `status_ok=false` (ISU ARGES - URS, Bradulet / 26.04.2026: CBC CMAS and STS both ERROR).
- Months other than April: 3148 alerts, same ids, 0 field differences except the new `deliveries`.
- Only April has `Data creare`, so grouping changes April only.
- April channels: CBC CMAS 248 rows, STS 222. Delivery failure rate April: 196 of 470 (42%).
  Failed-alert rate: 1 of 237 (0.4%, the UI shows 0%).
- `data/alerts.js`: 7,200,209 bytes (was 7,241,558).
- Headless Chrome from `file://`: 0 JS errors; KPIs, sidebar, table, feed, drawer render in RO
  and EN. Delivery KPI is absent when the date filter covers May onwards, and present for all
  and for April.

**Hard**
- In 6 of 237 April groups the rows differ in message text or risk (a revised message in the
  Barbaroșie Sebastian Andrei alert; ERROR rows with a different `Risc principal` in 4
  alerts). The alert takes the SENT row, so the SENT row decides the risk category.
- `Tip inregistrare` holds the channel as "trimitere alerta pe canalul CBC CMAS". The data keeps
  the raw string; the drawer removes the prefix.

**Decided**
- Representative row = first SENT, else first row (brief). Cost of the alternative (first
  row): the failed STS row would set the risk category for 4 alerts.
- `reports_errors` in `meta.months` comes from the manifest; the fallback is "has an ERROR
  delivery". The delivery rate uses only the deliveries of months that report errors.
- Assumed, not measured: the failure rate at 0.4% shows as "0%" (whole-number rounding). The
  display was not changed; see BACKLOG.

## 2026-10-27 — Review of the ingest; alert unit; related work

**Done**
- Reviewed the ingest branch against `docs/briefs/ckan-ingest.md`. Tests 2–6 passed. Test 1
  failed: the brief's id key merged April's channel rows (3404 alerts, not 3618).
- Changed the id key to one record per delivery row (channel, message type, status,
  audience). Measured: 3618 alerts, sent=3422 error=196 cancel=41, 0 duplicates; Feb–Apr
  parity with the old build. Checked the three pinned Action tags: they exist.
- Read mariuscomper.uk/ro-alert. Notes: `docs/research/mariuscomper-ro-alert.md`.

**Hard**
- April rows are deliveries, not alerts: 470 rows, 216 groups by title + `Data creare`,
  237 when ALERT and CANCEL stay apart; only 1 group has no SENT row. ERROR rows: STS 180,
  CBC CMAS 16.

**Decided**
- Wrong turn (Opus): the brief's id rule assumed one row per alert. The hash of
  title|sent_at|msg is not unique for April.
- The delivery-row id is an interim fix: it keeps parity with the old build. The next
  step counts alerts (`docs/briefs/alert-unit.md`). Cost of staying on delivery rows: April
  counts about double, and the KPI shows 30% failed where 1 of 237 alerts failed.
- The stopgap branch `data/may-aug-2026` is superseded: the ingest gives the same 3618 rows.

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
