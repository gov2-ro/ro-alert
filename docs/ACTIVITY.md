# Activity

## 2026-10-28 — Briefing sidebar and text navigation (owner request)

**Done**
- Briefing (default) shows only "Categorie de risc", with every category and no inner scroll.
  Search, dates, Status difuzare, "Resetează filtrele" and the counts note show only in Console.
  `status_trimitere` is no longer a Briefing facet.
- The Briefing/Consolă buttons are one text link: "→ Mai multe filtre" in Briefing and
  "← Categorii de risc" in Console (EN: "→ More filters", "← Risk categories"). The link keeps
  focus and sets `aria-expanded`. `#sidebar[data-mode]` drives the CSS.
- The top navigation uses text links: the current view is accent, bold and underlined.
- Tests: `console-mode.cjs` follows the link; S03 switches back to Briefing by the link; new default
  checks cover the Briefing content and both link directions.

**Measured**
- Browser suite: 499 PASS, 0 FAIL (one run failed U09 because the nav lost its colour transition;
  restored). Node pass.

**Decided**
- Filters set in Console stay active in Briefing. The active-filter strip shows them and removes them.
  Clearing them on mode change would lose a selection without a visible action.

## 2026-10-28 — Footer, view order, Briefing default (owner request)

**Done**
- Top navigation: Dashboard, Pe scurt, Tabel, Feed, Local. Dashboard stays the landing view.
- Sidebar: "Briefing" is the first mode and the default. "Consolă" is second.
- Footer: removed "Proof of Concept". Added "Vezi și / See also" with the link to
  mariuscomper.uk/ro-alert and a GitHub icon link to gov2-ro/ro-alert (accessible name set).
- Tests: `tests/browser/console-mode.cjs` switches a test context to "Consolă" after each load,
  because the suites exercise Console-only facets. Three new checks in `smoke.cjs` open the page
  without it and check the view order, the Briefing default and the footer links.

**Measured**
- Browser suite: 498 PASS, 0 FAIL. Python 87 OK. Node pass.
- One earlier run had a single axe colour-contrast failure on Pe scurt at 390 px (2 nodes). Three
  isolated scans and the next full run found none. Treated as flaky; see BACKLOG.

**Decided**
- Tests opt into "Consolă" instead of the app reading the mode from the URL. A URL key would change
  the link schema for a test need.

## 2026-10-28 — Deploy script: remote home paths

**Done**
- `tools/deploy.sh` read `.env` with the shell, so `DEPLOY_PATH=~/x` expanded to the local home
  (`/Users/...`) before it went to the remote host. The remote `mkdir` failed with permission denied.
- The script now reads `.env` as plain `KEY=VALUE` lines. A leading `~/` means the home folder of the
  target: `$HOME` locally, and a path relative to the remote home over SSH. Unknown keys give a warning.
- Tested with stub `ssh` and `rsync`: remote `~/lab.gov2.ro/ro-alert` becomes `host:lab.gov2.ro/ro-alert`,
  the port is passed, quotes are removed. Local `~/x` becomes `$HOME/x`. No real host was contacted.

**Decided**
- Do not source `.env`. Reading values as text avoids local expansion and does not run code from the file.

## 2026-10-27 — Audit phase 06: browsing, export and rendering (branch `feat/audit-06-browsing`, Sonnet)

**Done**
- Pages: Table, Feed and the Local record list show 50 records per page (`js/browse.js`). The complete selection
  is sorted first (key, then id ascending), then sliced. A pager (range "51–100 of 3,385", "Page 2 of 68",
  labelled Previous/Next) sits above and below each list. A page change is a history entry (`page` key), moves
  focus to the list heading and shows its start. An out-of-range page shows the last page, and the URL says so.
  `selectionKey()` in `urlstate.js` resets the page to 1 whenever the selection or sort changes, in one place.
- Feed and Local group dates inside the page; a day that continues says "N of M alerts on this day".
- Export: "Export selection (JSON)" in Table and Feed. One UTF-8 file with `schema_version`, `exported_at`,
  `selection`, `sources`, `attribution`, `coverage`, `records` (all selected alerts, deliveries, original text).
  Blob and object URL, revoked after 30 s. Zero results: the button stays, disabled, with the reason.
- Lifecycle: each view has `mountX` / `updateX` (`VIEW_PARTS` in `app.js`). Dashboard, Table, Feed and Local keep
  their shell; charts update through `upsert()`, the map keeps its instance and zoom. Leaving the view or an empty
  selection destroys them. `describeChart` no longer adds a listener per update and refreshes an open table.
  New "Fit selection" map button. Page change redraws only the list (`listOnly`).
- Load errors: `js/boot.js` (first script) shows a loading text, then a plain-language error with Retry (reload keeps
  the URL hash) for a missing page script, a missing or broken data bundle, an unsupported schema, bad shape, empty
  list, and a failed or malformed JSON fallback. `loadData` reads a JSON copy only for an absent bundle and checks the shape.
- Reconciliation: stale commands and sizes in CLAUDE.md, README and BACKLOG; three duplicate VPS tasks became one;
  finished items flipped (see BACKLOG). New tests: `tests/browser/browsing.cjs` (94 checks), `tests/js/browse.test.cjs`
  (9), `tests/browser/measure.cjs` (not a pass or fail check).

**Measured** (Chrome 156, Apple M1 Pro 8 cores, macOS 24.6, no CPU throttle, 5 runs, median; same script before and after)
- DOM elements in `#content-main`: Feed all alerts 48,220 -> 767; Table 7,507 (500 rows) -> 806 (50 rows); Local Harghita
  (418 alerts) 6,748 -> 1,009; Feed after the filter Meteo 6,834 -> 591; Dashboard 377 -> 380.
- Filter to painted frame (Meteo filter): Feed 83 -> 33 ms, Table 50 -> 33 ms, Local 33 -> 33 ms, Dashboard 33 -> 31 ms;
  language switch on Dashboard 66 -> 67 ms. The 33 ms is two animation frames at 60 Hz; it is a floor, not a cost.
- Data unchanged: 3,385 alerts, 3,618 deliveries, 196 ERROR, 1 failed alert, 21 CANCEL; bundles untouched
  (`alerts.js` 4,664,511, `meta.js` 35,993, `geo.js` 250,835 bytes). No rebuild needed.
- Tests: 87 Python (none skipped), 53 Node in UTC, Europe/Bucharest, America/New_York, 495 browser checks (401 earlier + 94 new), no failure.
- Table: 68 pages, 67 x 50 + 35 rows; every one of 3,385 IDs reached once by clicking Next 67 times.
- Screenshots inspected: Table RO 1440 (page 5) and 390 (page 2), Feed RO and EN 1440, Feed EN 390, Local RO 1440 (page 2),
  Local EN 390, Dashboard EN 1440 (Fit selection), export-disabled empty state RO, load-error screen RO 1000.

**Hard**
- A script `error` handler also caught the optional analytics tag when its request failed, and showed the load error
  on a healthy page. Fixed: only `js/`, `vendor/` and `data/` files count.
- Leaflet animates `fitBounds`; the zoom read right after the click was the old one. The test waits for the animation.
- The corpus has no two alerts with the same `sent_at`, so equal-time ties cannot show on real data. The id rule is
  tested on synthetic ties and on risk-sort ties (thousands); a Node test and B02 cover both.
- `#boot-loading` is a child of `#content-main`, so `#content-main > *` matches before the first render; the older tests still pass
  because `goto` waits for the load event, which follows the first render.

**Decided**
- Pagination state is `state.page`; reset is central (`selectionKey`), not per handler. Cost: the old explicit resets are redundant but kept.
- Pe scurt and the empty state redraw each time; splitting Pe scurt is backlog. Cost: its three charts are recreated on a filter change.
- Export stays JSON only and compact (no indentation), about 10 MB for the full archive. Cost: less readable raw; any JSON viewer fixes it.
- Map mode and zoom stay out of the URL (as in Phase 05). "Scope navigation" for framing means mounting the Dashboard again (return from Local) plus the Fit selection button.
- `exported_at` exists only in the export, never in a bundle (checked by B06).

## 2026-10-27 — Audit phase 05: visual hierarchy and geographic coverage (branch `feat/audit-05-visual`, Sonnet)

**Done**
- Reading order: a coverage bar above every view (outside the replaceable view) states the detail-record
  coverage and period, the current selection, source modification apart from fetch time, that the site is an
  independent archive and not a live service, and a "Sources and method" link. The link opens `Pe scurt`
  at the Sources section; Back returns. The Feed keeps it in view over its 3,385 cards.
- Dashboard: compact overview (selected alerts, dominant risk with share, issuing counties), map beside the
  daily timeline (stacked under 1,280 px), risk, hour and issuer charts, top counties, then one reporting-quality
  section. The failure-rate cards and the reliability doughnut-panel are gone. The sidebar KPI grid is one result line.
- Map: labelled Counties / Localities control (default Counties; presentation only, not in the URL or any filter;
  survives a filter change). County mode: fills by issuing county, no points. Locality mode: points over subdued
  outlines, radius bounded (1.5 to 13.8 px) and follows the zoom. Legends give exact count ranges per colour
  and say "within this selection"; the point legend shows sample sizes. Coverage text per mode and per selection;
  the București-Ilfov convention, the issuer-county meaning and the national exclusion are visible text.
  Tooltips of București and Ilfov say how the combined source counts.
- Quality section (Dashboard, Pe scurt, Local; none in Feed): observed failed alerts, reporting sample with months
  and denominators, the count of alerts outside the sample, one limit sentence, a disclosure with the longer method.
- Charts: whole-number ticks on count axes (the Local daily chart showed 0.5), chart locale follows the UI
  language, captions with period and denominator on every Dashboard and Local chart, month-over-month changes in neutral ink.
- Local: "Issuing county" / "Resolved place" label above the heading, KPIs, charts, quality section, then records.
- Tests: `tests/browser/visual.cjs` (86 checks, V01-V09), `tests/js/visual.test.cjs` (8), `Stats.mapCoverage`,
  `Stats.dominant`, `selectionStats.unknownAlerts`. Existing checks A08/A09 and S06 now read the new places.

**Measured**
- No data change: 3,385 alerts, 3,618 deliveries, 196 ERROR rows, 1 failed alert, 21 CANCEL; `data/*.js` untouched.
- Baseline coverage: county 2,897 / 3,385 (85.6%), national 488, unknown 0; places 1,392 / 3,385 (41.1%), 1,373 distinct
  points, 3,415 alert-place pairs; mention resolution 3,426 / 3,611 (94.9%, whole archive). May 2026 + Meteo: coverage equals an
  independent count. Unknown-coverage alerts (outside the ERROR-reporting month): 3,148.
- Dashboard KPI grid: 6 cards (3,385, 2,337, 3,384, 1, 1/237, 196/470) -> 3 cards; failure figures appear once per view.
- Tests: 87 Python, 44 Node (UTC, Europe/Bucharest, America/New_York), 401 browser checks (315 earlier + 86 new), no failure.
- Screenshots inspected: Dashboard RO 1440 and 390, Dashboard places mode RO 1440, Dashboard EN 1440 (places), Pe scurt RO 1440
  and EN 390, Local RO 1440, RO 320 and EN 390 (clipped), before/after of Dashboard and Local at 1440.

**Hard**
- Chart bars looked empty in screenshots taken 0.9 s after load (Chart.js animation); a 2.5 s wait shows them. Not a defect.
- The Local view renders every record card; a full-page screenshot is 98,000 px tall (Phase 06 owns pagination).
- `cap_type` first said "of 418 alerts"; only 30 Harghita alerts have a message type. The caption counts those 30.

**Decided**
- Map mode lives in `RoMap.mode`, not in `state` or the URL: the brief says a mode change must not change the data
  selection. Cost: a shared link does not carry the mode.
- Pe scurt loses its failed-alert KPI card: the quality section holds that count, and the brief wants it once per view.
- The Feed shows no diagnostics, only a summary and the method link (brief: no second reliability report).
- Exact count ranges in the county legend replace the earlier approximate stops; cost: up to six swatches.
- Chart dates stay ISO; shortening them needs one format for tables and tooltips too (backlog).
- Keyboard access to shapes stays the list under the map (backlog item closed with the reason).

## 2026-10-27 — Deploy script

**Done**
- `tools/deploy.sh` reads `DEPLOY_PATH`, `DEPLOY_HOST`, `DEPLOY_PORT` and `DEPLOY_DELETE` from
  `.env` (or `--env FILE`) and copies the page files with rsync. `--dry-run` lists the changes.
  `.env.example` documents the keys; Git ignores other `.env` files.
- Tested on this machine: dry run, first copy, second copy with a stale `js/stale.js` (removed)
  and a foreign `keep.txt` at the target root (kept), refusal on an uncommitted `js/app.js`,
  refusal of `DEPLOY_PATH=/`. The copied `js/` is identical to the source. The SSH path is not run.

**Decided**
- Copy an explicit list of files, not the repo. The page needs only these files; the rest holds
  sources, tests and documents that must not reach the web folder.
- Refuse uncommitted changes by default, so that the target matches a commit. The printed short
  hash identifies the deployed version.
- Deletion is opt-in and limited to `css/`, `js/` and `vendor/`, so a wrong `DEPLOY_PATH` cannot
  remove unrelated files at the target root.

## 2026-10-27 — Audit phase 04: mobile and accessibility (branch `feat/audit-04-access`, Sonnet)

**Done**
- Phones (max 768 px): one document scroll; the sidebar becomes a labelled modal filter drawer (same
  element and controls, no second state). A Filters button with an active-filter count and the polite
  result count sit outside it, with the active strip (bounded to 34% of the viewport). Apply closes;
  "Resetează filtrele" resets and leaves the drawer open; the close button has its own name.
  Background is `inert`, Tab wraps, Escape closes, focus returns to the Filters button.
- Header wraps at 320 px; the layout subtracts the measured header height (`--topbar-h`, ResizeObserver).
  Feed summary stacks above the cards; cards use the content width. Grids use `minmax(0,1fr)`.
- Record details are a native `<dialog>` (modal, named by its title, Escape, backdrop click, translated
  close name). Focus returns to the opening button, or to the same record's new button after a rerender,
  or to the main region. `update()` restores focus when a rerender removed the focused control.
- Table: sort headers are buttons with `aria-sort`; each row has a record button (row click kept as a
  mouse extra). Feed cards: a record button stretched over the card. Facet heads: `aria-expanded`;
  toggles: `aria-pressed`; views: `aria-current`; labels for search, dates, language group.
  Skip link, `<h1>`, `main` focus target. The skip link does not change the hash (the hash is app state).
- Charts: `role=img` plus a name from the panel heading, and a collapsed "Date în tabel" disclosure with
  the data (built on first open). Map: a list of counties and a searchable list of canonical places,
  by keyboard, in a disclosure under the map. Sources stay on the Story view with zero results.
- Readability: `--text-dim` #999 -> #66625a; muted, accent, error, ok, warn, cancel darkened to pass 4.5:1;
  control border token 3:1+; focus ring 3 px; no text below 12 px, captions 14 px; targets 44 px on
  phones. `prefers-reduced-motion` turns off CSS transitions, Chart.js animation and Leaflet zoom animation.
- Tests: `tests/browser/access.cjs` (called by `smoke.cjs`); `axe-core` 4.10.2 as a development dependency.

**Measured**
- Document `scrollWidth <= clientWidth` at 1440, 1024, 800, 768, 720, 512, 390, 320 px, RO and EN, in
  every view, in the Local view and with a record open (the dialog too).
- Contrast, tokens: text 12.82/13.87 (bg/card); muted 5.55/6.01; dim 5.28/5.71; accent 5.57/6.03; error
  5.71 on card; ok 5.73; warn 5.85; cancel 6.29; white on accent 6.41; control border 3.83/4.14; focus 6.90/7.47.
  A computed-colour scan of every rendered text element (4 views + Local + record, RO and EN, 1440 and
  390 px) finds none below 4.5:1 (3:1 large). Old state: `#999` on card 2.68.
- axe-core (wcag2a/aa, 21a/aa, 22aa, best-practice) on 4 views at ro 1440, ro 390, en 320: 0 violations
  after fixes. First run: heading-order in the Feed (h4 without h2), fixed.
- Focus order (measured by Tab presses), 1440: skip link, Pe scurt, Dashboard, Tabel, Feed, Reset, RO, EN,
  Consolă, Briefing, search, date parts, Resetează filtrele, facets. 390: the same header stops, then
  Filters, the map, its two zoom buttons, the map-list summary, chart data disclosures, footer links.
  A first run showed 41 county shapes and 1,300+ place points as Tab stops; they are now `tabindex=-1`.
- Existing suites unchanged: 87 Python, 36 Node in UTC, Europe/Bucharest, America/New_York. No data change.

**Hard**
- Chrome keeps its sequential-focus start point after a programmatic focus; keyboard tests reset it by
  focusing the skip link first. A native modal dialog lets Tab leave to the browser UI, so a Tab wrap was added.
- The contrast scan read mid-transition colours (0.15 s on tabs); the scan now waits 250 ms.
- A fullPage screenshot with an open modal dialog gave an unusable 794,000 px image; shots use the viewport.

**Decided**
- The filter drawer reuses the sidebar node (class `open`, role set at run time) instead of a `<dialog>`:
  one set of controls and IDs, and the desktop sidebar stays a plain landmark. Cost of the alternative: a
  duplicate control set or moving nodes between a dialog and the sidebar.
- The record view is a native `<dialog>`: free inertness and Escape. Cost: a Tab wrap for the browser UI.
- `--accent` moved from #2a6fc4 to #245fa8 (links and text on the beige background were 4.38:1). Chart
  colours keep the earlier hues; they carry no text.
- `axe-core` is a development-only dependency; the page loads no test code.
- Views stay buttons inside `<nav>` with `aria-current`, not an ARIA tab pattern.
- The disabled Local tab is not focusable; a county or place choice enables it.

## 2026-10-27 — Audit phase 03: shared state, places, and language (branch `feat/audit-03-state`, Sonnet)

**Done**
- One state path: `update(mode)` normalizes, syncs controls, renders and writes the URL. Facet registry
  (`FACET_REGISTRY`) and category palette (`CATEGORIES`) live in `filters.js`; `FACET_DEFS`,
  `FACET_DEFS_V2`, `CAT_COLORS` and the Feed chip state are gone. Category, meteo-colour, month and
  footer labels follow the UI language. A language change renders once.
- Persistent active-filter strip and notices outside the view; every chip has a remove button.
  Facet counts carry an "all data" note. Zero results keep search, strip and a clear action.
- Places by SIRUTA: `state.selectedPlaceId`, `places[].county`, Local chips and Story links from
  distinct codes, searchable list, selected place in heading and strip. Map point click adds no county.
- `js/urlstate.js`: versioned hash (`schema=1`), push for steps, replace for typing, language and sort;
  Back and Forward share the load path; a record link opens the drawer, which says when the record is
  outside the selection. Unknown keys, bad dates, absent IDs and a foreign schema give notices.
- Search: one accent- and case-insensitive normalizer over message, title, county, initiator,
  candidates and canonical place names.
- Build: `message_language` (ro, en, mixed, unknown), evidence-based `split_languages`, `places[].county`,
  `meta.message_languages`. `tools/field_diff.py` diffs two builds by alert ID and field.
- Tests: 13 Python (`test_language.py`), 22 Node (`state.test.cjs`), browser checks in
  `tests/browser/state.cjs` (RO and EN, 1440/1024/390/320, file://).
- Fixed two defects found on the way: the footer was never translated (it follows the scripts, so
  `init` now waits for the parsed page); the Leaflet panes covered the drawer (`#map` isolates).

**Measured**
- Corpus unchanged: 3,385 alerts, 3,618 deliveries, 196 ERROR rows, 1 failed alert, 21 CANCEL, same IDs,
  delivery rows equal. Field diff by alert ID: `message_language` 3,385 (new); `msg_ro` 2,475 (2,266 only
  lose a trailing full stop or space; 209 split differently); `msg_en` 208; `places[].county` 1,392
  (new). Nothing else changed, `locations` included. `meta`: new `message_languages`; `omitted` gains
  `msg_ro`; `inputs` has a new `build_data.py` hash.
- `message_language`: ro 448, en 4, mixed 2,933, unknown 0. Record `60e0361757e4` is `en`.
- Bundles, before -> after: `alerts.js` 4,531,252 -> 4,664,511; `meta.js` 35,928 -> 35,993; `geo.js` 250,835.
- Bear measure: numerator 2,333 (unchanged); denominator 3,385 -> 3,381 (4 English-only alerts have no
  Romanian text and are reported); 68.9% -> 69.0%.
- Toplița 83641: 23 alerts, all Harghita; point count 24 equals selection 24 with one synthetic national alert.
- Tests: 87 Python (none skipped), 36 Node in UTC, Europe/Bucharest and America/New_York, 168 browser checks pass.
  Two builds are byte-identical and equal to the tracked bundles (`test_build`).

**Hard**
- The old splitter cut inside English text ("Avoid", "Please" lead-ins) and missed upper-case lead-ins.
  A boundary search with an evidence count fixed it. Tie rule: least leaked evidence, then the latest boundary.
- The new split would change `locations` for 3 alerts (English tail read as streets). Not authorized, so
  `extract_locations` keeps the earlier splitter's input.
- Hungarian text after the Romanian one (423 alerts) stays inside `msg_ro`; the brief has no value for it.

**Decided**
- `mixed` means both languages are present (split when clear, else unsplit with null parts). Alternative:
  `mixed` only for unsplit text; it would label 2,933 normal bilingual alerts `ro`.
- A date equal to a data bound counts as unset; an outside date stays and is explained, never clamped.
- A default state has an empty hash; `schema=1` appears with any other key.
- Leaving the Local view clears county and place, as before.

## 2026-10-27 — Audit phase 02: pipeline reliability (branch `feat/audit-02-pipeline`, Sonnet)

**Done**
- `ingest.py`: staged, validated, journaled commit of `sources/`; recovery at the next run; exit 1 on
  any rejection; paginated CKAN discovery; required headers; duplicate resources collapse by bytes or
  fail with ids; `--refresh`, `--result`; revision kinds (detail_to_summary and others); `checked_at`
  in an ignored status file; `fetched_at` only for new accepted content.
- `build_data.py`: `build()` split from `main()`; fatal checks for manifest, statuses, timestamps,
  conflicting ids, Grand Total, delivery conservation; zero summary totals kept; `meta.schema_version`,
  `meta.inputs` (hashes), `sources[].fetched_at`. County geometry is now tracked in `geometry/`.
- `tools/ci_ingest.sh`, `tools/ingest_report.py`, `ingest.yml` (PR only on real change), `ci.yml` (offline).
- Tests: 74 Python (`test_ingest`, `test_sources`, `test_workflow`, `test_corpus`, `test_build`), 14 Node,
  8 committed workbook fixtures, restore-parity check in Node.

**Measured**
- Corpus unchanged: 3,385 alerts, 3,618 deliveries, 196 ERROR rows, 1 failed alert, 21 CANCEL, 41 counties.
- `alerts.js` (4,531,252 bytes) and `geo.js` (250,835) byte-identical to v0.9.0. `meta.js` 34,642 -> 35,928
  bytes; the only changes are `schema_version`, `inputs`, and `fetched_at: null` on every source.
- Two builds give identical bundles. Browser smoke test passes. Node tests pass in UTC, Los Angeles, Auckland.

**Hard**
- The disk filled during the work; the run stopped and resumed from a WIP commit.
- A `status_ok` edit was at risk after ENOSPC; re-checked after the resume (UNKNOWN status is unknown, not failed).

**Decided**
- Staging and journal sit inside `sources/` (dot names, ignored) so a rename stays on one volume.
  Cost of the alternative: a cross-device move is not atomic.
- Legacy manifest entries keep `fetched_at` unset (null in meta). Inventing a date would be false.
- The geometry licence is recorded as unknown; the owner must confirm it.

## 2026-10-27 — Audit phase 01: analytics correctness (branch `feat/audit-01-analytics`, Sonnet)

**Done**
- `build_data.py`: `classify_risk()` returns category and rule id. Structured fields decide first
  (`Risc asociat`, then `Risc principal`); free text applies only when they do not. The rule table
  sits beside the function. Bear words use one rule (`BEAR_RE`, `BEAR_EN_RE`, whole words only).
  `meta.months[].error_reporting` is `observed`, `unknown` or `not_applicable`. `reports_errors` stays.
- `js/stats.js` (new, pure, loads in Node too): `dayRange` (UTC arithmetic), `dailyCounts`,
  `selectionStats`. `data.js` adds `failureCoverage`, `failureKpisHtml`, `failureLinesHtml`. The
  Dashboard, Local, Feed, sidebar and "Pe scurt" views all read them. The reliability doughnut is
  now a text panel. Local uses the Dashboard's daily stacked chart. Line smoothing removed.
- Tests: `tests/test_risk.py`, `tests/test_build.py`, `tests/js/stats.test.cjs`,
  `tests/browser/smoke.cjs` (Playwright-core with system Chrome, development only).
  `tools/risk_change_report.py` diffs two builds by alert ID.

**Measured**
- Corpus unchanged: 3,385 alerts, 3,618 deliveries, 196 ERROR rows, 1 failed alert, 21 CANCEL.
- Diff by alert ID: only `risk_category` changed, on 53 alerts. All other fields and all delivery
  rows are equal (the script exits 1 otherwise). Category counts, before -> after: Animale
  periculoase 2387 -> 2337, Meteo 583 -> 616, Copil dispărut 140 -> 142, Inundații 126 -> 134,
  Atac aerian / dronă 91 -> 94, Incendiu 32 -> 32, Tehnologic 9 -> 16, Altele 17 -> 14.
  Changes: 33 animal -> Meteo, 8 animal -> Inundații, 7 animal -> Tehnologic, 2 animal -> Copil
  dispărut, 3 Altele -> Atac aerian / dronă (text rule, drone words).
- Bundles, before -> after: `alerts.js` 4,531,815 -> 4,531,252; `meta.js` 34,304 -> 34,642;
  `geo.js` 250,835 (unchanged). Two builds in a temporary folder give identical bundles.
- Daily axis: 210 unique dates, 2026-02-03 to 2026-08-31, in UTC, Europe/Bucharest and
  America/New_York; stack total 3,385; 2026-08-31 holds 16; 2026-03-29 occurs once.
- Reporting sample (all data and April): 1 / 237 failed alerts, 196 / 470 failed deliveries.
  May: no rate, coverage unknown.

**Hard**
- The brief's 48 suspect records are a review set. The result differs: 50 animal records changed
  (2 extra are Copii disparuti records whose structured risk was overridden by text), plus 3 new
  drone records from the text fallback.
- `index.html` loads an optional Simple Analytics tag. The offline smoke run blocks it; the test
  allows that one host and ignores its blocked-load console line.

**Decided**
- Text fallback adds Romanian and English drone words to the air category. Alternative: leave
  those 3 records in Altele. They are real drone events, so they move.
- The daily axis spans the first to the last selected record date, not the date inputs. Alternative:
  span the input range; that shows empty edge days that no record selected.

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
