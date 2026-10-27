# Backlog

## Ingest

- [ ] Count alerts, not delivery rows (April has one row per channel and retry; 470 rows
  are 237 alerts, 1 failed). Brief: `docs/briefs/alert-unit.md`. This replaces the
  failure-rate UI item below.
- [ ] Monthly timeline: add the official totals of the summary-only months (2025-09 286,
  2025-10 146, 2025-12 96, 2026-01 61), marked as official summary.
- [ ] Location resolution: resolve from `Lista poligoane` first. Target from
  mariuscomper.uk: 94.8% of bear-alert locality mentions resolved without ambiguity.

- [~] Automatic ingest from data.gov.ro (CKAN API → `sources/YYYY-MM.csv` → build), with a
  daily GitHub Action that opens a pull request. Brief: `docs/briefs/ckan-ingest.md`.
  Built on branch `feat/ckan-ingest`; waits for the owner's decision on the next item.
- [ ] **Defect: dedup by `id` removes 214 valid April rows.** The hash of `title|sent_at|msg`
  is equal for the two delivery rows of one April message (channel `CBC CMAS` and channel
  `STS`). The build gives 3404 alerts, not 3618, and April shows 256 rows, not 470. Brief
  decision needed: add `Tip inregistrare` to the hash key (leaves 1 duplicate in April), or
  keep one alert per delivery row with a row-based tie-break. See `docs/ACTIVITY.md`.
- [ ] Find the cause of the August Grand Total mismatch (557 rows, total 556).
- [ ] UI: show that the failure rate exists only for months that report ERROR rows. Only
  April 2026 reports them (measured 2026-10-27). Blocked by the ingest.
- [ ] Deploy to lab.gov2.ro after a data pull request merges. The deploy location is not in
  this repo.
- [ ] `data/alerts.js` is 6.8 MB with 3404 alerts (measured 2026-10-27; 3618 alerts without
  the dedup defect would be about 7.2 MB). Measure the page load time. Split per month if it is slow.

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
