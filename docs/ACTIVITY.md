# Activity

## 2026-10-27 — Audit implementation specs and hand-off

**Done**
- Added `docs/IMPLEMENTATION_HANDOFF.md` with the baseline, fixed decisions, order,
  implementation guidelines, verification commands, and a copyable implementation prompt.
- Added six briefs: analytics; pipeline; state/places/language; mobile/accessibility;
  visual/geographic architecture; browsing/export/rendering. Each has named acceptance checks.
- Linked every audit concern to an implementing phase and added phase tasks to BACKLOG.
- Checked Markdown links, acceptance IDs, phase dependencies, and whitespace. No application
  code or data changed. Implementation checks remain work for the implementing model.

**Hard**
- The audit found ERROR rows only in April. That does not establish complete reporting.
  The specification distinguishes observed errors, unknown coverage, and summary-only sources.
- Ignored workbooks and `/tmp` screenshots are available in this workspace only. The specs
  require committed fixtures and tracked geometry for a fresh-clone offline check.

**Decided**
- Keep Dashboard as the landing view, the alert unit, accepted August warning, and current
  summary visibility. Preserve the owner's deferral of VPS scheduling and deployment.
- Authorize the listed schema and state additions explicitly. The implementing model can
  proceed without treating historical brief restrictions as new approval requirements.
- Use SIRUTA for resolved-place identity. A point selection must include nationally issued
  records at that place; issuer county and affected locality remain different concepts.
- Use JSON for the required filtered export. Defer CSV to avoid expanding this package.
- Release this specification package as v0.8.0 under the repository's version rules.

## 2026-10-27 — Pipeline, data, architecture, and UX audit

**Done**
- Read the pipeline, all current view modules, styles, workflow, briefs, and project memory.
- Parsed all 11 cached workbooks offline. All seven detail CSV files match the parser output.
  Their raw hashes match the manifest. All four summary breakdowns match the manifest.
- Rebuilt in a temporary directory. alerts.js, meta.js, and geo.js match the committed files
  byte for byte. Totals: 3,385 alerts; 3,618 deliveries; 196 ERROR deliveries; one failed
  alert; 21 cancellations; zero duplicate ids removed.
- Checked Chrome from file:// at 1440, 1024, 390, and 320 px. No JavaScript errors occurred.
  Inspected screenshots of Dashboard, Pe scurt, and the mobile Feed. Checked filters, table,
  drawer, county/locality selection, search, and English labels.
- Recorded defects and opportunities in the audit section of BACKLOG.md. Application code
  and data stay unchanged. Browser evidence is in /tmp/ro-alert-browser-results.json and
  /tmp/ro-alert-*.png for this session.

**Measured**
- Daily chart in Europe/Bucharest: March 29 appears twice; August 31 is absent. Its stacks
  count 3,369 alerts, losing 16. UTC has all 210 unique dates. America/New_York reproduces
  the missing final day.
- Classifier: 48 suspect animal classifications lack a Romanian bear match and a source
  animal category. Examples match unrelated words containing `urs`, including English text.
- Mobile: search and date controls are hidden; feed body is 90 px wide at a 390 px viewport.
  Document width is 407 px at viewport widths 390 and 320.
- Feed: 3,385 cards, 48,923 DOM elements. Meteo selects 583 rows but leaves All highlighted.
  Table: 500 displayed rows, no next-page control, no keyboard-focusable record rows.
- Gazetteer: 3,426 of 3,611 mentions resolved (94.9%); 131 ambiguous, 54 unmatched.
  Only 1,392 of 3,385 alerts have a resolved place. Map has 1,373 distinct place points.
- Current bundles: alerts.js 4,531,815 bytes; meta.js 34,304; geo.js 250,835.
  Python gzip defaults give 466,525, 12,612, and 61,838 bytes respectively.

**Hard**
- Playwright's default Chromium build was absent. Installed Chrome worked after sandbox
  approval. External requests were blocked during browser checks.
- Did not query live CKAN, rerun the hosted Action, test the VPS, or inspect deployment.
  The hosted-runner connection limit and VPS deferral remain the recorded owner decisions.

**Decided**
- Keep the static application and file:// requirement. Current evidence supports targeted
  correctness, validation, state, and responsive-layout work. It does not justify a framework
  migration or database. No application fixes, commits, tags, or deployments in this audit.

## 2026-10-27 — Review of the story-view branch (Opus)

**Done**
- Checked: a rebuild changes no file; all `js/` files parse; the "Pe scurt" tab renders from
  `file://` (screenshot read). The Python check and the browser agree on every figure.
- Fixed: the Sources section said "one row per delivery" for May and June. Only April has
  more deliveries than alerts (470 against 237); the other shape-D months have one row per
  alert. The label now follows `meta.months`, not the file shape.

**Decided**
- Keep Dashboard as the landing tab for now; the owner decides.
- Feb–Jul gives 2,828 alerts here and 2,807 at mariuscomper.uk. The difference is April:
  237 alerts here (ALERT and CANCEL apart), 216 there.

## 2026-10-27 — Timeline with official totals and "Pe scurt" view (branch `feat/story-view`)

**Done**
- `build_data.py`: `meta.months` now holds the four summary-only months (2025-09 286, 2025-10 146, 2025-12 96, 2026-01 61) with `official: true` and `by_risk`. `meta.sources` and `meta.last_modified` come from the manifest. `alerts.js` is unchanged; `meta.js` only grew.
- `js/story.js`: new first tab "Pe scurt": bear share, evening share, failed alerts, alerts per month with change, bear and storm per month, hour chart, top 10 localities with main risk, delivery-failure note, and a Sources and method section (dataset links, CC BY 4.0, last update, mariuscomper.uk as related work). RO and EN text in `i18n.js`.
- The monthly chart has 12 slots from 2025-09 to 2026-08: 11 bars (4 hatched "rezumat oficial") and a labelled gap for 2025-11.

**Measured** (browser `storyStats` against `$scratch/check.py` on `data/alerts.json`; all equal)

| Selection | Alerts | Bear (regex) | Share | Sent 20-23 | Failed alerts | Deliveries failed |
|---|---|---|---|---|---|---|
| Feb-Jul 2026 (date filter) | 2,828 | 1,963 | 69.413% | 999 (35.3253%) | 1 | 196 of 470 |
| judet Harghita, no date filter | 418 | 404 | 96.651% | 198 (47.368%) | 0 | 30 of 60 |
| Feb-Jul and Harghita | 367 | 354 | 96.4578% | 166 (45.2316%) | 0 | 30 of 60 |
| All, no filter | 3,385 | 2,333 | 68.9217% | 1,232 (36.3959%) | 1 | 196 of 470 |

Change vs previous month (all): 2026-01 -36%, 02 +25%, 03 +34%, 04 +132%, 05 +161%, 06 +92%, 07 -49%, 08 -9%. 0 JS errors from `file://`.

**Decided**
- Official months show only with no filter. They have no alerts, so a filter cannot apply to them. Alternative: show them under every filter; that would mix filtered and unfiltered figures on one axis.
- Bear in official months is the category "Animale periculoase", not the word "urs" (no text exists). The caption says so. Storm is risc asociat "Furtuni" in both.
- "Last ingest" is the latest `last_modified` in the manifest (2026-10-23). The manifest has no download date.
- Dashboard stays the landing tab; "Pe scurt" is the first tab only in order.

**Hard**
- "No filter" for Feb-Jul needs a date filter, which also hides the official months. The check used the date window; the all-data row has no filter.

## 2026-10-27 — Localities from `Lista poligoane` (branch `feat/localities`)

**Done**
- `gazetteer/fetch_wikidata.py` (standard library only) and `gazetteer/localities.csv`: 16,978
  Wikidata items with a SIRUTA code (P843). 16,970 have coordinates and a county. 13,745 are
  village-level (`sat`, `localitate componentă`); the commune and town items are the admin units.
  The brief says about 13,700 SIRUTA localities: 13,745 agrees. That figure is the brief's, not checked
  against INS here.
- `build_data.py`: parses `poligoane`, drops `Cerc`/`Poligon`/`polygon`, resolves each name, adds
  `places` (`name`, `siruta`, `lat`, `lon`) per alert. `meta.places` holds the counts.
  `data/unresolved_places.csv` (git-ignored) lists the unresolved names with a reason.
- Map: red circle points for the selected alerts; radius grows with the count of alerts. Caption says a
  point is the locality of the alert area. A click opens the Location view of the county with
  `selectedLocality` set; `applyFilters` matches it on `places[].name` too.
- Checked in headless Chrome from `file://`: 1,373 points, a click on one gives Harghita /
  Odorheiu Secuiesc / 42 alerts, 0 JS errors. `alerts.js` grew from 7,200,209 to 7,456,527 bytes (+3.6%).

**Measured**

| Selection | Mentions | Resolved | No match | Ambiguous |
|---|---|---|---|---|
| Bear alerts Feb-Jul (1,963 alerts) | 924 | 909 (98.4%) | 0 | 15 |
| Comper (reference) | 920 | 872 (94.8%) | 34 | 14 |
| All alerts (3,385) | 3,611 | 3,426 (94.9%) | 54 | 131 |

Also 2,361 generic geometry labels dropped. Bear filter: `\burs(ul|ului|ule|i|ii|ilor|oaic*)?\b` on the
Romanian text without diacritics. It selects 1,963 alerts for Feb-Jul (`\burs\b` alone: 1,919).
Comper: 1,958.

**Decided**
- Use village-level items as places. A commune or town item counts only when no village-level item has
  the same name in the county. Alternative: keep all items; then each commune seat is "ambiguous" with its commune.
- `București` and `București-Ilfov` alerts search the counties București and Ilfov together.
  `SECTORUL N` and `BUCURESTI SECTORUL N` map to `SECTOR N`.
- County alerts match inside the county only. National alerts match when the name is unique in Romania.
  No fallback to other counties: a wrong county would put a point in the wrong place.

**Hard / wrong turns**
- One SPARQL query with `P131+` and county gave HTTP 504 (5 min). Four simple queries joined in Python
  take 33 s.
- Bear 0 no-match against 34 for Comper: assumed our gazetteer is complete, not checked name by name.
  Of the 54 all-alert no-matches, 50 are county names (`ARGES`, `ILFOV`, `VALCEA`), not localities; 4 are names not in the gazetteer.

## 2026-10-27 — Review of the data-size branch (Opus)

**Decided**
- Accept `alerts.js` at 4.30 MB raw, above the 3.5 MB target in the brief. The network
  cost is the gzip size, 398 KB (was 493 KB), and the parse of 4.3 MB is not a measured
  problem. The 3.5 MB target was an estimate, not a requirement.
- Do not apply the three shape changes (`locations[].type`, `deliveries[].sent_at`,
  `localities`; about 390 KB together). Each saves less than 10% and changes what the
  front end reads. Revisit only if a page-load measurement shows a problem.
- Checked: a rebuild reproduces the committed bundles byte for byte; the KPIs render from
  `file://` with the same values as `main`.

## 2026-10-27 — Smaller data bundle (branch `feat/data-size`)

**Done**
- `build_data.py` writes a compact bundle: no `msg` (rebuilt from `msg_ro`, `msg_sep`,
  `msg_en`), no `date`, `hour`, `weekday`, and no key with a null, empty-string or empty-list
  value. The rule is generic (any key path, lists of objects included, e.g. `deliveries[].audienta`).
  `meta.omitted` maps each omitted path to its empty value.
- `js/data.js`: `restoreAlerts` puts everything back after load. No other `js/` file changed.
- `data/geo.js`: coordinates rounded to 4 decimals; Douglas-Peucker per ring, tolerance 0.002
  degrees (about 220 m), standard library only. All 42 counties stay.

**Measured** (3385 alerts; gzip -9)
- `alerts.js`: 7,200,209 B raw, 492,673 B gzip -> 4,299,413 B raw, 397,861 B gzip.
- `geo.js`: 1,352,356 B raw, 280,447 B gzip -> 250,835 B raw, 61,741 B gzip. Points: 85,425 in the source.
- `meta.js`: 30,366 -> 30,816 B raw (adds `omitted`).
- Parity (Node, restore applied to the new bundle vs the old bundle, key order ignored): 0 of 3385 differ.
- `msg` could be rebuilt for 3384 alerts; 1 alert keeps `msg` (it starts with a "." that the
  split removes from `msg_ro`).
- Headless Chrome from `file://`: 0 JS errors; 6 KPIs, table (500 rows shown), feed (3385 cards), drawer
  from table and feed, facet filter, search ("urs" 2381 in EN), 42 map paths. Screenshots before and
  after at default zoom look the same, and a 4x zoom shows no gap between counties.

**Hard**
- `msg` is not `msg_ro` + " " + `msg_en`. `split_bilingual` strips the separator (". ", " ", "",
  ".", ...). 2334 of 3385 alerts differ with a plain space. Fix: store the separator as `msg_sep`
  when it is not " ". Cost: about 3 bytes in 1700 alerts.
- First parity run: 490 differences. Cause: `msg_sep` of "" was treated as an omittable empty value.
  `msg` and `msg_sep` are now excluded from the omit rule.
- The target `alerts.js` under 3.5 MB is not met: 4.30 MB. Remaining share: `msg_ro` 25%, `msg_en` 17%,
  `deliveries` 9%, `locations` 8%. See BACKLOG.

**Decided**
- Each ring is simplified alone. Shared borders could gap, but the largest shift is the tolerance
  (0.002 degrees), about 0.1 px at the default zoom; nothing shows at 4x zoom. The alternative
  (shared arcs, topology-aware) costs about 60 more lines.

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
