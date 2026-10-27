# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A static dashboard for the archive of RO-ALERT public warning messages (monthly files from
data.gov.ro; February–August 2026 at the time of writing). Source data comes from data.gov.ro / IGSU. The live POC is at
lab.gov2.ro/ro-alert. The UI and the data are in Romanian; `js/i18n.js` adds English.

## Commands

There is no build tool and no linter. `ingest.py` needs `xlrd` and
`openpyxl`; `build_data.py` uses only the standard library.

- Run the tests: `python3 -m unittest discover -s tests -p 'test_*.py'` and
  `node --test tests/js/*.test.cjs`. The browser smoke test is `node tests/browser/smoke.cjs`
  (after `npm install`; see README).
- Set up once: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`.
- Fetch new months: `.venv/bin/python ingest.py`. The script queries the data.gov.ro CKAN API,
  downloads new or changed files, and writes `sources/YYYY-MM.csv` and `sources/manifest.json`.
  It prints `no new data` when nothing changed. Read the manifest `warnings` after each run.
- Parse local files without network: `.venv/bin/python ingest.py --offline PATH...`.
- Rebuild the data: `python3 build_data.py` (run from the repo root). The script reads every
  `sources/*.csv` and prints totals (sent / error / cancel, date range, county count) and the
  count of duplicates removed. Compare the totals with the previous run to detect a regression.
- `ingest.py` stages, validates and commits through a journal (`sources/.ingest-txn`); it exits 1
  on a rejected file. `--refresh` re-downloads, `--result PATH` writes JSON,
  `sources/resource_choices.json` settles duplicate resources. `build_data.py` fails on bad
  statuses, timestamps, conflicting ids and Grand Total mismatches, and records `schema_version`
  and input hashes in `meta`. `.github/workflows/ci.yml` runs the offline tests.
- A GitHub Action (`.github/workflows/ingest.yml`) runs both scripts daily and opens a pull
  request when `sources/` changes. A person reviews each new month before the merge.
- Run the app: open `index.html` directly in a browser (`file://` works). A local server
  is optional, for example `python3 -m http.server`.

## Architecture

**Data pipeline (`ingest.py`, `build_data.py`).** `ingest.py` turns the IGSU Excel files into
one normalized UTF-8 CSV per month, `sources/YYYY-MM.csv`. Git tracks `sources/`, so a fresh
clone rebuilds without network. Raw downloads go to `repository/arhiva-ro-alert/ckan/` (ignored).
The script detects the file shape by sheet names (S: summary only, R: summary + report,
D: raw details), maps columns by header name and records each file in `sources/manifest.json`.
Shape S files give a manifest entry and no rows. `build_data.py` reads every `sources/*.csv`
in month order. One alert is one message, not one delivery row: rows with the same title,
`Data creare` and `Tip mesaj` (April 2026: one row per channel and retry) become one alert
with a `deliveries` list. `status_ok` is true when any delivery is SENT. Each alert has a
stable string `id`; the build removes duplicate ids. It enriches
each row offline and without an LLM:

- `judet_for` maps the initiator code (`ISUPH`) or an `ISU XX` title tag to a county.
  National actors (`IGSU`, `ANM`, …) get `scope="national"`.
- `risk_category` and `meteo_color` derive the dashboard categories.
- `split_languages` sets `message_language` (`ro`, `en`, `mixed`, `unknown`) and splits a
  message into `msg_ro` and `msg_en` only when the evidence is clear. `msg` stays the original.
  `split_bilingual` (earlier splitter) still feeds `extract_locations`, so `locations` stay stable.
- `extract_locations` reads only the Romanian half. It returns typed candidates
  (`locality`, `street`, `road`, `km`, `river`, `poi`). It does not geocode them.

The script writes `data/alerts.json` and `data/meta.json` (facet counts, per-county counts,
localities per county). It also writes the same objects as JS globals: `data/alerts.js`
(`window.ALERTS`), `data/meta.js` (`window.META`) and `data/geo.js` (`window.GEO`, from
`geometry/romania-counties.geojson`, a tracked input; source and licence unknown, see `geometry/PROVENANCE.md`). Git tracks only the three `.js` bundles. Commit them
after each rebuild, because the deployed app reads only them.

**Front end.** The app is plain browser JS with no modules and no bundler. Each file in
`js/` defines globals. `index.html` loads them in dependency order: vendor (Leaflet,
Chart.js, vendored locally) → data bundles → `i18n` → `stats` → `data` → `filters` → `urlstate` → views →
`app.js`. Keep this order when you add a file.

- `app.js` owns `window.state` (built by `newState()` in `urlstate.js`: language, view, facet sets,
  search, date range, selected county, selected place as a SIRUTA code, open record, sort, page).
  Every change ends in `update(mode)`, which normalizes the state, syncs the controls, calls `render()`
  and writes the URL hash. `render()` runs `applyFilters` and draws the active view: `story`,
  `dashboard`, `table`, `feed` or `location`. A click on a county or a place opens the `location` view.
- `data.js` loads the globals into `DATA`. It falls back to `fetch()` of the JSON files.
  `countyKey()` normalizes county names (diacritics, București-Ilfov) to match the GeoJSON.
- `filters.js` applies AND across facets and OR inside one facet.
- Facets have one definition: `FACET_REGISTRY` in `filters.js`. It drives `newState()`, `applyFilters`,
  the sidebar, URL validation and the active-filter strip. A facet also needs a key in `meta.facets`
  (in `build_data.py`) and a label in `i18n.js`. The category palette (`CATEGORIES`, `catColor`,
  `catLabel`) is also in `filters.js`.
- Every user-visible string goes through `t(key)` and `data-i18n` attributes in `i18n.js`.

`_obsolete/` is not in use (git ignores it). Do not edit it. The repo root holds the only
current build; the earlier `web/`, `web-v2/` and `web-v3/` builds were merged into it.

## Tone of voice

Follow Simplified Technical English (ASD-STE100) for docs, error messages and agent-facing
text:

- One instruction per sentence; at most ~20 words (procedures), ~25 (descriptive).
- Active voice; name the actor.
- Simple tenses.
- One word, one meaning; the same term every time.
- No noun clusters over three words; keep the articles.
- Keep every condition and qualifier.

## Process notes

Two files carry the project's memory between sessions. Create each one with the first work
that needs it, and read both before starting.

**`docs/BACKLOG.md`** — roadmap, tasks, bugs. Statuses: `[ ]` open, `[~]` in progress, `[x]`
done, `[-]` dropped.
- Flip an item to `[x]` in the same change that finishes it.
- Add a defect or deferred work when you find it.
- Mark a dead end `[-]` **with the reason**, under *Verified limits*, so that nobody
  investigates it again.

**`docs/ACTIVITY.md`** — dated entries, newest first, each with **Done / Hard / Decided**.
- Add an entry when a chunk of work lands.
- A decision carries its rationale and the cost of the alternative.
- Record wrong turns, and say what was measured and what was assumed. Keep the measured
  numbers: they are the baseline for regressions.

**Versions follow the work.** The project is spec-driven, so a spec, an ADR, a decision that
changes a spec, a set of named tests, and a measured spike are deliverables, as much as a
user capability is. After each committed chunk, check what changed since the last tag. For a
relevant deliverable, bump the minor version; for a correction only, bump the patch. 
Add a line to `docs/RELEASES.md`, commit, and tag the commit. Do this without asking, and say 
when you did. **Publishing a release is separate, and happens only when asked.**


## Opus designs, Sonnet builds

The work splits by model. **When you are Opus**, defer implementation and well-defined
future work to Sonnet by default:

- **Opus** writes specs, ADRs and briefs; makes and records decisions; and reviews Sonnet's
  results against the brief before they are accepted.
- **Sonnet** carries out a brief: code, spikes, measurements, fixture changes, and the
  activity and backlog entries for that work.
- **Opus does the work itself** when the task is a few lines, or when the design is still
  moving and the doing is part of the deciding.

**Sonnet stops and asks** when a step would change a spec, an ADR, an invariant or a
dependency outside the brief's folder. It reports what it measured and what it assumed.

To hand over, Opus tells the owner that the brief is ready. The owner runs it in a Sonnet
session, or asks Opus to start a Sonnet agent on it.