# Brief: timeline with official totals, and a "Pe scurt" view

Status: ready for Sonnet after `data-size` and `localities` merge. Owner: pax.
Author: Opus, 2026-10-27.

## Context

mariuscomper.uk/ro-alert tells the data as a story (see
`docs/research/mariuscomper-ro-alert.md`). We take the method, not the text.

## Deliverables

1. **Timeline with official totals.** The monthly timeline also shows the summary-only
   months (manifest shape S: 2025-09 286, 2025-10 146, 2025-12 96, 2026-01 61), drawn with
   a different style and the label "rezumat oficial". 2025-11 has no file: show a gap, not
   zero. `build_data.py` writes these totals and their risk breakdown into `meta.months`.
2. **"Pe scurt" view** (a new tab, the first one). Each item is computed from the current
   selection, so the filters change it:
   - the share of alerts whose text contains `urs`;
   - alerts per month, with the change against the previous month;
   - bear and storm alerts per month, on one chart;
   - the share of alerts sent between 20:00 and 23:59;
   - the top localities (from `places`), with their main risk;
   - the one-alert failure count and the delivery-failure note for April.
   Each chart has one caption line that says what the chart does not show.
3. **Sources and method** section: one line per month from `sources/manifest.json` (shape,
   rows, link to the data.gov.ro dataset, warnings), the CC BY 4.0 licence, and the date of
   the last ingest. Link mariuscomper.uk as related work.
4. RO and EN text through `i18n.js`. The EN text follows the tone rules in `CLAUDE.md`.

## Acceptance tests

1. With no filter, the "Pe scurt" numbers for February–July equal a Python check script
   on `data/alerts.json`. Report both.
2. With the filter "judet = Harghita", the numbers change and still equal the script.
3. The timeline shows 11 months and the gap for 2025-11.
4. 0 JS errors from `file://`.

## Stop and ask

Stop and ask before you change the alert object or remove an existing view.
