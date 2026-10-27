# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A static dashboard for the archive of RO-ALERT public warning messages (648 alerts,
February–April 2026). Source data comes from data.gov.ro / IGSU. The live POC is at
lab.gov2.ro/ro-alert. The UI and the data are in Romanian; `js/i18n.js` adds English.

## Commands

There is no build tool, no package manager, no linter and no test suite.

- Rebuild the data: `python3 build_data.py` (run from the repo root; standard library only).
  The script prints totals (sent / error / cancel, date range, county count). Compare them
  with the previous run to detect a regression.
- Run the app: open `index.html` directly in a browser (`file://` works). A local server
  is optional, for example `python3 -m http.server`.

## Architecture

**Data pipeline (`build_data.py`).** The script reads one aggregated CSV,
`repository/arhiva-ro-alert/aggregated/csv/mesaje ro-alert gemini.csv`. Git ignores
`repository/arhiva-ro-alert/`, so a fresh clone cannot rebuild the data. The script enriches
each row offline and without an LLM:

- `judet_for` maps the initiator code (`ISUPH`) or an `ISU XX` title tag to a county.
  National actors (`IGSU`, `ANM`, …) get `scope="national"`.
- `risk_category` and `meteo_color` derive the dashboard categories.
- `split_bilingual` splits each message into `msg_ro` and `msg_en`.
- `extract_locations` reads only the Romanian half. It returns typed candidates
  (`locality`, `street`, `road`, `km`, `river`, `poi`). It does not geocode them.

The script writes `data/alerts.json` and `data/meta.json` (facet counts, per-county counts,
localities per county). It also writes the same objects as JS globals: `data/alerts.js`
(`window.ALERTS`), `data/meta.js` (`window.META`) and `data/geo.js` (`window.GEO`, from
`data/romania-counties.geojson`). Git tracks only the three `.js` bundles. Commit them
after each rebuild, because the deployed app reads only them.

**Front end.** The app is plain browser JS with no modules and no bundler. Each file in
`js/` defines globals. `index.html` loads them in dependency order: vendor (Leaflet,
Chart.js, vendored locally) → data bundles → `i18n` → `data` → `filters` → views →
`app.js`. Keep this order when you add a file.

- `app.js` owns `window.state` (language, view, facet sets, search, date range, selected
  county and locality). `render()` runs `applyFilters` and draws the active view:
  `dashboard`, `table`, `feed` or `location`. A click on a county opens the `location`
  view.
- `data.js` loads the globals into `DATA`. It falls back to `fetch()` of the JSON files.
  `countyKey()` normalizes county names (diacritics, București-Ilfov) to match the GeoJSON.
- `filters.js` applies AND across facets and OR inside one facet.
- Facets have two definitions: `FACET_DEFS` in `filters.js` (used by `applyFilters`) and
  `FACET_DEFS_V2` in `sidebar.js` (used to draw the sidebar and initialize `state`).
  Change both when you add or remove a facet. A facet also needs a key in `meta.facets`
  (in `build_data.py`) and a label in `i18n.js`.
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