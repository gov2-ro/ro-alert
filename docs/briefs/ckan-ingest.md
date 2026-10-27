# Brief: automatic ingest from data.gov.ro

Status: ready for Sonnet. Owner: pax. Author: Opus, 2026-10-27.

## Goal

A script finds new monthly RO-ALERT files on data.gov.ro, parses them without an LLM, and
rebuilds the dashboard data. A scheduled GitHub Action runs the script and opens a pull
request when it finds a new month.

Today `build_data.py` reads one CSV that an LLM (Gemini) merged by hand from three months.
That step does not repeat. This brief replaces it with a deterministic parser.

## Measured facts (spike, 2026-10-27)

**Discovery.** The CKAN API works without a key:

```
GET https://data.gov.ro/api/3/action/package_search
    ?q=mesaje+ro-alert
    &fq=organization:inspectoratul-general-pentru-situatii-de-urgenta
    &rows=100
```

It returns 11 datasets, one per month, September 2025 – August 2026. Each dataset has one
resource. Dataset names and file names are not consistent (`…-luna-ianuarie2026`,
`…-aprilie`, `raport-ro-alert-august.xls`). IGSU publishes each month 4–8 weeks late, on
an irregular day. Two months (June, July) came out on the same day.

**File shapes.** The 11 files have three shapes. Detect the shape by sheet names, not by
the file extension.

| Shape | Sheets | Months | Message rows | `Status trimitere` |
|---|---|---|---|---|
| S — summary only | `Foaie1..3` | 2025-09, 2025-10, 2025-12, 2026-01 | none | — |
| R — summary + report | `Mesaje`, `Raport` | 2026-02, 2026-03, 2026-07, 2026-08 | 76, 102, 610, 557 | SENT only |
| D — raw details | `Message_Details` | 2026-04, 2026-05, 2026-06 | 470, 618, 1185 | SENT + ERROR (April only) |

- In shapes R and D, the header row is the row that contains `Continut mesaj` (row index 1
  in all files measured).
- The column set changes from month to month (9 to 21 columns). Map columns by header
  name, never by position. March has placeholder headers (`Column1`…`Column5`). Drop them.
- The `Mesaje` sheet holds a pivot table with a `Grand Total` row. Use it as a check.
  It matches the row count for February (76), March (102) and July (610). It does not
  match for August: 557 rows against a total of 556.
- Shape S files contain only per-risk totals. They have no messages.
- `.xls` files are JasperReports BIFF files (need `xlrd`). `.xlsx` files need `openpyxl`.
- `Data trimitere` has the format `2026/05/01 03:39:44`. `parse_dt` already accepts it.
- Only April contains ERROR rows (196 of 470). All other months contain SENT rows only.

## Decisions

1. **Use the CKAN API, not HTML scraping.** The API is stable and returns resource ids,
   sizes and `last_modified`. `scrapers1/ckan-explorer` only lists all packages; do not
   reuse its code. Reuse only the endpoint pattern.
2. **Add two dependencies: `xlrd` and `openpyxl`,** in `requirements.txt`. Only the ingest
   step imports them. `build_data.py` stays standard-library only. Cost of the alternative
   (convert with LibreOffice in CI): a large system install and a second format to debug.
3. **Commit the normalized month files, not the raw downloads.** The ingest writes one
   UTF-8 CSV per month to `sources/YYYY-MM.csv`, with canonical column names. Git tracks
   `sources/`. A fresh clone can then rebuild without network. The raw files stay ignored;
   the manifest keeps their URL and SHA-256 so that anyone can download them again.
4. **CI opens a pull request; it does not push to `main`.** Three shapes in 11 files show
   that the format drifts. A person must look at each new month before it goes live.
5. **Keep shape S out of the alert list.** Record its totals in the manifest only.
6. **Do not hide the SENT/ERROR difference.** Record per month whether the file reports
   ERROR rows (`reports_errors: true|false`). The UI change that uses this flag is
   separate work (see Out of scope).

## Deliverables

1. `ingest.py` at the repo root:
   - `python3 ingest.py` queries CKAN, downloads only new or changed resources (compare
     the resource id and `last_modified` with the manifest), and writes `sources/YYYY-MM.csv`.
   - `python3 ingest.py --offline PATH...` parses local files without network. The
     acceptance tests use this mode.
   - It takes the month from the dataset title (`luna <month> <year>`), not from the file
     name.
   - It writes `sources/manifest.json`: one entry per resource with `dataset`, `resource_id`,
     `url`, `last_modified`, `sha256`, `month`, `shape`, `rows`, `grand_total`,
     `reports_errors`, `columns`, `warnings`.
   - It exits with code 0 and prints `no new data` when nothing changed. It exits with
     code 0 and prints the new months when it wrote files. It exits with code 1 when a file
     has an unknown shape or no `Continut mesaj` header.
   - A `Grand Total` mismatch is a warning in the manifest, not a failure.
2. `build_data.py` changes:
   - Read every `sources/*.csv` in month order, in place of the Gemini CSV.
   - Replace the hard-coded `MONTHS` dictionary with a value derived from `YYYY-MM`. The
     `month` label becomes `<Luna> <YYYY>` (for example `Mai 2026`), because the data now
     spans two years.
   - Give each alert a stable `id`. Use `Identificator unic` when it exists. Otherwise use
     the first 12 hex characters of the SHA-256 of `title|sent_at|msg`. The row index is not
     stable when months are added. The `id` becomes a string. Check every place in `js/`
     that reads `id` (for example `openDrawer`) and make it work with a string.
   - Remove duplicates by that `id`, and print the count of duplicates removed.
3. `.github/workflows/ingest.yml`: a daily cron (06:00 UTC) and `workflow_dispatch`. It runs
   `ingest.py` and then `build_data.py`. If `sources/` changed, it opens a pull request
   titled `data: RO-ALERT <months>` with the manifest warnings in the body.
4. `requirements.txt`, and an update of the Commands section in `CLAUDE.md`.
5. Entries in `docs/ACTIVITY.md` and `docs/BACKLOG.md`, with the measured numbers.

## Acceptance tests

Run each test and report the output.

1. **Parity with the current corpus.** Run `ingest.py --offline` on the February, March and
   April files in `repository/arhiva-ro-alert/xls/`, then `build_data.py`. The totals must
   equal the current build: `total=648 sent=452 error=196 cancel=41`. If they differ,
   list each record that differs. Do not change the parser to hide a difference before you
   report it.
2. **Field parity.** For the 648 records, compare `judet`, `risk_category`, `sent_at` and
   `msg` with the current `data/alerts.json`. Report the count of differences per field.
3. **New months.** Ingest May–August. Report rows per month, the Grand Total check, and the
   new totals.
4. **Idempotence.** A second `python3 ingest.py` prints `no new data` and changes no file.
5. **Shape S.** The four summary-only files produce manifest entries and no rows.
6. **Front end.** `index.html` opens from `file://` with all months, and the month facet
   lists every month. Report the size of `data/alerts.js`.

## Out of scope (add to the backlog, do not build)

- The UI for months without ERROR rows. The failure-rate KPI is wrong for a selection
  that includes such months.
- The deploy to lab.gov2.ro. The location of that deploy is not in this repo.
- Lazy loading or splitting of `data/alerts.js` per month. Measure the size first.

## Stop and ask

Stop and ask the owner before you:

- change the shape of an alert object that the front end reads (other than `id`);
- add a dependency other than `xlrd` and `openpyxl`;
- delete `repository/` files or the Gemini CSV;
- change a decision in this brief.
