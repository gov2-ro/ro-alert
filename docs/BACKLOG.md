# Backlog

## Ingest

- [x] Smaller data bundle. Brief: `docs/briefs/data-size.md`. Done on branch `feat/data-size`:
  `geo.js` 1.35 MB -> 251 KB; `alerts.js` 7.20 MB -> 4.30 MB (gzip 493 KB -> 398 KB).
- [ ] Watch the size of `alerts.js`. Act when it passes 12 MB raw (owner, 2026-10-27); it is
  4.30 MB now. Candidates, measured: `locations[].type` (about 179 KB), `deliveries[].sent_at`
  equal to the alert `sent_at` (about 115 KB), `localities` derivable from `locations` (about
  98 KB), or a lazy file for `msg_en`.
- [ ] Localities from `Lista poligoane`, with a map layer. Brief: `docs/briefs/localities.md`.
- [ ] Timeline with official totals and a "Pe scurt" view. Brief: `docs/briefs/story-view.md`.
- [ ] Scheduled update on the VPS: GitHub-hosted runners cannot reach data.gov.ro (2 of 2
  runs timed out on connect, 2026-10-27). Needs the VPS details from the owner.
- [x] The ingest step hid a failed `ingest.py` (pipe into `tee` without `pipefail`).

- [x] Count alerts, not delivery rows (April has one row per channel and retry; 470 rows
  are 237 alerts, 1 failed). Done on branch `feat/alert-unit`; brief `docs/briefs/alert-unit.md`.
  Measured: 3385 alerts, 3618 deliveries, 1 failed alert.
- [x] UI: the failure rate of 1 in 237 alerts shows as "0%" (whole-number rounding). Show one
  decimal below 10%, or the count.
- [ ] Monthly timeline: add the official totals of the summary-only months (2025-09 286,
  2025-10 146, 2025-12 96, 2026-01 61), marked as official summary.
- [ ] Location resolution: resolve from `Lista poligoane` first. Target from
  mariuscomper.uk: 94.8% of bear-alert locality mentions resolved without ambiguity.

- [~] Automatic ingest from data.gov.ro (CKAN API → `sources/YYYY-MM.csv` → build), with a
  daily GitHub Action that opens a pull request. Brief: `docs/briefs/ckan-ingest.md`.
  Built on branch `feat/ckan-ingest`; waits for the owner's decision on the next item.
- [x] **Defect: dedup by `id` removed 214 valid April rows.** Closed by the alert unit: April
  alerts group by title + `Data creare` + `Tip mesaj`; all 3618 rows are deliveries.
- [ ] Find the cause of the August Grand Total mismatch (557 rows, total 556).
- [x] UI: show that delivery failures exist only for months that report ERROR rows. Done with
  the alert unit (`meta.months[].reports_errors`).
- [ ] Deploy to lab.gov2.ro after a data pull request merges. The deploy location is not in
  this repo.

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

## Verified limits

- [-] Find the cause of the August 2026 Grand Total mismatch (557 rows, summary 556).
  Accepted by the owner on 2026-10-27 as a known source defect; the manifest keeps the
  warning.
- [-] Run the ingest on GitHub-hosted runners. The connection to data.gov.ro timed out in
  2 of 2 runs (run 40526336961 and its re-run, 2026-10-27). The runners are in Azure; the
  site likely blocks or drops that traffic. Use the VPS instead.
