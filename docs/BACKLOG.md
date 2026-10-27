# Backlog

## Audit implementation hand-off

- [x] Prepare specs and implementation guidelines. Entry point: `docs/IMPLEMENTATION_HANDOFF.md`.
- [x] Phase 01: analytics correctness. Done on branch `feat/audit-01-analytics`. Brief: `docs/briefs/audit-01-analytics.md` (A01–A10).
- [x] Phase 02: pipeline reliability. Done on branch `feat/audit-02-pipeline`. Brief: `docs/briefs/audit-02-pipeline.md` (P01–P11).
- [x] Phase 03: shared state, places, and language. Done on branch `feat/audit-03-state`. Brief: `docs/briefs/audit-03-state.md` (S01–S11).
- [x] Phase 04: mobile and accessibility. Done on branch `feat/audit-04-access`. Brief: `docs/briefs/audit-04-access.md` (U01–U10).
- [x] Phase 05: visual and geographic architecture. Done on branch `feat/audit-05-visual`. Brief: `docs/briefs/audit-05-visual.md` (V01–V10).
- [x] Phase 06: browsing, export, and rendering. Done on branch `feat/audit-06-browsing`. Brief: `docs/briefs/audit-06-browsing.md` (B01–B11).

- [ ] Phase 01 follow-up: `js/story.js` keeps its own `BEAR_RE` copy (the "Pe scurt" bear share
  counts the word, not the category). Share one rule through the build in a later phase. (The
  category lists of the Feed chips and `CAT_COLORS` are now one palette: done in Phase 03.)

These phase tasks track delivery. The audit items below retain the findings and measurements.
Close an audit item only when all of its assigned work passes the brief's checks.

## Project audit — 2026-10-27

The audit changed no application code or data. Items below need implementation and review.

- [x] **P1 — Risk classification:** `risk_category` matches `urs` inside unrelated words.
  Examples include `sursele`, `hours`, `downpours`, and `watercourses`. Found 48 suspect
  animal classifications outside the source animal category, without a Romanian bear match.
  These include 32 storm and 8 flood records. Use source risk fields first. Bound fallback
  keywords to words. Add regression fixtures for these examples.
- [x] **P1 — Daily timeline:** local `setDate` changes a UTC-parsed date across summer time.
  Europe/Bucharest produces March 29 twice and omits August 31. Chart stacks total 3,369,
  against 3,385 alerts; 16 alerts disappear. Use UTC calendar arithmetic. Check UTC,
  Europe/Bucharest, and America/New_York.
- [x] **P1 — Mobile controls and layout:** below 769 px, the sidebar disappears without a
  replacement. Search, dates, and facets become unavailable. At 390 px, the feed body is
  90 px wide beside a fixed 240 px summary. Navigation makes the document 407 px wide at
  both 390 px and 320 px. Add a filter drawer and stack the feed summary.
- [x] **P1 — Coverage of failures:** the overview divides one failed alert by all 3,385
  alerts. Only April reports failed deliveries. Scope the rate to reporting months and
  show its denominator. Keep source SENT status separate from proof of device receipt.
- [x] **P2 — Workflow no-change path:** the month extraction pipeline exits 1 when ingest
  prints `no new data`. Reproduced under Bash with `-e -o pipefail`. Handle an empty match
  explicitly without hiding ingest failures. This is separate from the deferred VPS work.
- [x] **P2 — Filter state:** feed chips show All after selecting Meteo, although 583 rows
  remain selected. `renderFeed` resets `feedChipFilter`. Derive the active chip from state.
  Show active filters across views, including facets hidden by Briefing mode.
- [x] **P2 — Place identity:** Local chips use extracted text; map points use resolved
  SIRUTA places. Harghita has 23 alerts with resolved Toplița, but no chip with that exact
  name. Use SIRUTA for selection and canonical display names. Keep text candidates distinct.
- [x] **P2 — Accessibility:** table rows, sort headers, and feed cards need keyboard actions.
  The detail drawer has no dialog role, focus transfer, or focus containment. Search and date
  inputs need explicit labels. Charts need text or table alternatives. The dim text token
  `#999` on `#faf8f1` has 2.68:1 contrast. Increase contrast for small text.
- [x] **P2 — Browse and share:** table truncates at 500 of 3,385 rows with no pagination.
  Feed creates 3,385 cards and 48,923 DOM elements. Add pagination and filtered export.
  Store view, filters, county, locality, and record id in the URL. Support browser Back.
  Phase 03 did the URL and Back part (`js/urlstate.js`). Done in Phase 06: 50 records per page in Table,
  Feed and Local, and a JSON export of the whole selection (CSV is deferred, see below).
- [x] **P2 — Pipeline validation:** add offline CI for workbook fixtures, delivery conservation,
  unique ids, valid dates, supported statuses, and compact/restore parity. Fail on conflicting
  duplicate ids. Stage CSV and manifest changes before replacing the current snapshot.
- [x] **P2 — Source revisions:** change detection uses only resource id and last_modified;
  SHA-256 is recorded after download. Add periodic content checks and checked_at/fetched_at.
  Define selection when multiple resources describe one month. Remove stale CSV data when
  a month changes from detail to summary. Keep this separate from starting a VPS schedule.
- [x] **P2 — Geographic coverage:** 488 alerts are excluded from county fills as national.
  These include 369 classified weather alerts. Show this count. Distinguish issuer county
  from affected area. Document the combined București-Ilfov mapping onto București.
  Done in Phase 05: the map coverage shows 2,897 / 3,385 county, 488 national, and the Ilfov convention.
- [x] **P3 — Visual hierarchy:** separate county fills from locality points; 1,373 points
  obscure the county map. Reduce repeated status KPIs. Move delivery diagnostics into a
  coverage-labelled panel. Use neutral colours for changes in warning volume. Done in Phase 05.
- [x] **P3 — Small architecture changes:** consolidate the two facet definitions and category
  colours. Render once on language changes. Preserve map and chart instances on filtering.
  Add a data schema version, build input hashes, and a visible load-error state.
  Done: one facet registry, one category palette, one render per language change (Phase 03);
  schema version and input hashes (Phase 02); map and chart instances kept on filtering and language
  changes, and the visible load-error state with Retry (Phase 06).
- [x] **P3 — Language and provenance:** normalize diacritics for search and include resolved
  place names. Translate derived category labels. Recognize English-only messages instead
  of storing them as Romanian. Label source last_modified separately from last ingest.
- [x] **P3 — Build inputs and memory:** keep or document the source county geometry needed
  to regenerate geo.js; it is currently ignored. Reconcile stale sizes and duplicate tasks
  below. The geometry is tracked in `geometry/` (Phase 02). Current bundles (Phase 06, unchanged since
  Phase 03): `alerts.js` 4,664,511 bytes (gzip default level 472,600), `meta.js` 35,993, `geo.js` 250,835.
  The stale sizes and duplicate tasks are reconciled in Phase 06 (see its ACTIVITY entry).

- [ ] Phase 03 follow-up: three alerts keep English text in `locations` because the location
  extraction still reads the earlier splitter's Romanian half (`9483912b17c5`, `e104d8bef73e`,
  `2d5537664f07`; for example the street "Jiului" from the English tail). The brief did not authorize a
  `locations` change. Switch `extract_locations` to `msg_ro` in a later phase and report that diff.
- [ ] Phase 03 follow-up: 423 alerts (Alba, Covasna, Harghita, Mureș) add a Hungarian text after the
  Romanian one (matched by four Hungarian words). 267 have `message_language` `ro` and 156 have
  `mixed`; in both, `msg_ro` holds the Hungarian text too. The brief allows only ro, en, mixed and
  unknown. Add Hungarian evidence only after an owner decision.
- [ ] Phase 03 follow-up: the Local view lists every resolved place in a disclosure, so the long
  list holds a second copy of the top chips. Phase 04 decides the keyboard and screen-reader form.

- [ ] Flaky test: the axe scan in `tests/browser/access.cjs` once reported 2 colour-contrast nodes on
  Pe scurt at 390 px (2026-10-28); not reproduced in 3 isolated scans and one full run. If it
  recurs, log the node HTML and wait for chart and transition settling before the scan.

## Ingest

- [x] Smaller data bundle. Brief: `docs/briefs/data-size.md`. Done on branch `feat/data-size`:
  `geo.js` 1.35 MB -> 251 KB; `alerts.js` 7.20 MB -> 4.30 MB (gzip 493 KB -> 398 KB).
- [ ] Watch the size of `alerts.js`. Act when it passes 12 MB raw (owner, 2026-10-27); it is
  4.66 MB now (4,664,511 bytes). Candidates, measured: `locations[].type` (about 179 KB), `deliveries[].sent_at`
  equal to the alert `sent_at` (about 115 KB), `localities` derivable from `locations` (about
  98 KB), or a lazy file for `msg_en`.
- [x] Localities from `Lista poligoane`, with a map layer. Brief: `docs/briefs/localities.md`.
  Done on branch `feat/localities`: 94.9% of all mentions and 98.4% of bear mentions resolved.
- [ ] Localities: match old spellings (`ADINCATA` for Adâncata: î written as i). Measured: 4 of 54 no-match mentions are names missing from the gazetteer (50 are county names); `ADINCATA` is one.
- [x] Map (done in Phase 05: Counties / Localities mode, points only in Localities mode): at national zoom, 1,373 points hide the county colours. Scale the radius with the
  zoom, or add a toggle between counties and points.
- [ ] Localities: 131 mentions are ambiguous (two places with the same name in one county). Decide whether to pick the larger place or the one nearest to the alert centroid.
- [x] Timeline with official totals and a "Pe scurt" view. Brief: `docs/briefs/story-view.md`. Done on branch `feat/story-view`.
- [x] Deploy script: `tools/deploy.sh` copies the page files to a local folder or to
  `DEPLOY_HOST:DEPLOY_PATH` from `.env` (owner request, 2026-10-27). Tested locally only.
- [ ] Scheduled update and deploy on the VPS (lab.gov2.ro, Apache on 67.205.1.122). GitHub-hosted runners
  cannot reach data.gov.ro (2 of 2 runs timed out on connect, 2026-10-27). Deferred by the owner: do
  not start until the owner says so. A daily cron job would run `ingest.py` and `build_data.py`, publish
  with `tools/deploy.sh` and the VPS env file, and push the new `sources/` and `data/*.js` to GitHub. It
  would publish without review when the manifest has no new warnings, and hold the update and tell the
  owner when it has. Open: SSH user, web folder, whether the VPS can reach data.gov.ro, the alert channel
  for a held update.
- [x] The ingest step hid a failed `ingest.py` (pipe into `tee` without `pipefail`).

- [x] Count alerts, not delivery rows (April has one row per channel and retry; 470 rows
  are 237 alerts, 1 failed). Done on branch `feat/alert-unit`; brief `docs/briefs/alert-unit.md`.
  Measured: 3385 alerts, 3618 deliveries, 1 failed alert.
- [x] UI: the failure rate of 1 in 237 alerts shows as "0%" (whole-number rounding). Show one
  decimal below 10%, or the count.
- [x] Monthly timeline: add the official totals of the summary-only months (2025-09 286,
  2025-10 146, 2025-12 96, 2026-01 61), marked as official summary.
- [x] Location resolution: resolve from `Lista poligoane` first. Target from
  mariuscomper.uk: 94.8% of bear-alert locality mentions resolved without ambiguity.
  Done with the localities task above: 98.4% of bear mentions and 94.9% of all mentions resolved.

- [x] Automatic ingest from data.gov.ro (CKAN API → `sources/YYYY-MM.csv` → build), with a
  daily GitHub Action that opens a pull request. Brief: `docs/briefs/ckan-ingest.md`.
  Merged (v0.3.0). The Action cannot reach data.gov.ro (verified limit below); the scheduled run
  is the deferred VPS item.
- [x] **Defect: dedup by `id` removed 214 valid April rows.** Closed by the alert unit: April
  alerts group by title + `Data creare` + `Tip mesaj`; all 3618 rows are deliveries.
- [ ] Owner decision: make "Pe scurt" the landing tab? Now the page opens on Dashboard.
- [ ] Owner decision: under a county or date filter, hide the summary-only months (now) or
  show their national totals greyed? They have no alerts, so a filter cannot apply to them.
- [ ] Find the cause of the August Grand Total mismatch (557 rows, total 556).
- [x] UI: show that delivery failures exist only for months that report ERROR rows. Done with
  the alert unit (`meta.months[].reports_errors`).

## Boilerplate phrase detection

RO-ALERT messages are heavily templated — the same safety instructions repeat
across hundreds of alerts. Detect and catalog the most common phrases so they
can be collapsed/templated, leaving only the substantive content (location,
time, the specific hazard) visible.

Measured frequencies in the current corpus (RO half, 648 messages):

| count | phrase |
|------:|--------|
| 367 | `Evitati zona, ramaneti in locuinte!` |
| 333 | `Pastrati distanta fata de animal si nu incercati sa va fotografiati cu acesta sau sa il hraniti.` (incl. comma variants) |
| 409 | `Fara sa va expuneti pericolului protejati animalele din gospodarie.` (incl. punctuation variants) |
| 47 | `Exista posibilitatea caderii unor obiecte din spatiul aerian.` |
| 47 | `Adapostiti-va in beciuri sau adaposturi de protectie civila.` |

Approach (no LLM):
- Normalize (lowercase, strip accents/punctuation/whitespace) then count
  sentence-level n-grams to auto-surface templates above a frequency threshold.
- Maintain a curated list of canonical boilerplate phrases + their variants;
  tag each message with which templates it uses and store only the residual
  (non-boilerplate) text for display/analysis.
- Bonus: per-risk-category template sets (bear, air-raid, flood, meteo…).

## Location resolution / geocoding (follow-up to extraction)

`build_data.py` now extracts typed location candidates (`locations`:
locality/street/road/km/river/poi) deterministically and offline. The next
layer is *resolution* — turning candidates into validated places + coordinates:

- **Localities:** match against SIRUTA (official ~13k Romanian localities) to
  validate and attach the proper county; reject false captures.
- **Streets & POIs:** geocode via Nominatim (OpenStreetMap), scoped to Romania
  + the alert's `judet`. Resolves the open-class placemarks (e.g.
  "zona pensiunii Mofeta") that rules alone can't ground.
- Keep this in a **separate cached step** (rate-limited, network) so the main
  build stays reproducible/offline. Persist a `{query -> result}` cache.
- Optional: a local statistical NER pass (spaCy `ro_core_news_lg`) for the
  long tail of bare placemarks with no cue word.

## Phase 04 follow-up

- [x] The Feed rendered every card; on a phone the page was long. Done in Phase 06: 50 cards per page,
  and the Table has no 500-row cap (68 pages of 50).
- [-] Phase 05 reviewed the Leaflet map keyboard access: the shapes stay out of the Tab order and the list
  under the map stays the keyboard route in both modes. Reason: 41 shapes and 1,373 points would add
  more than 1,400 Tab stops; the list gives the same actions.
- [ ] Message text mixes Romanian and English; the drawer sets `lang` on its RO/EN buttons only, not on
  each message block. Add `lang` per block when the build marks the split reliably.
- [ ] Chart.js canvas labels and legends are not read by screen readers; each chart has a data table instead.

## Phase 05 follow-up

- [ ] The map list under the map holds counties and places for both modes. Show the list of the active
  mode first when a later phase has a reason to.
- [ ] Chart date labels stay ISO (`2026-03-17`), rotated. A shorter label needs one date format for the
  tables, tooltips and axes together.
- [x] The Local view rendered every record card (418 for Harghita). Done in Phase 06: 50 cards per page.
- [ ] Mention resolution (94.9%) is a whole-archive figure. A per-selection figure needs the unresolved
  mentions in the alert records; the build does not store them.

## Phase 06 follow-up

- [ ] CSV and spreadsheet export are deferred by the brief (JSON only). Add a CSV only after the owner
  names the columns; a flat CSV loses the `deliveries` list.
- [ ] Pe scurt still redraws its shell and its three charts on each filter or language change (its
  text is built from one string). B07 covers Dashboard and Local; a later phase could split Pe scurt.
- [ ] The map mode (Counties / Localities) and the zoom live in the page, not in the URL. A shared link
  does not carry them.
- [ ] The corpus has no two alerts with the same send time, so the id tie-break shows only on other
  sort keys (risk, county, status). Re-check after new months arrive.

## Verified limits

- [-] Find the cause of the August 2026 Grand Total mismatch (557 rows, summary 556).
  Accepted by the owner on 2026-10-27 as a known source defect; the manifest keeps the
  warning.
- [-] Run the ingest on GitHub-hosted runners. The connection to data.gov.ro timed out in
  2 of 2 runs (run 40526336961 and its re-run, 2026-10-27). The runners are in Azure; the
  site likely blocks or drops that traffic. Use the VPS instead.
