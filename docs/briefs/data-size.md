# Brief: make the data bundle smaller

Status: ready for Sonnet. Owner: pax. Author: Opus, 2026-10-27.

## Measured (2026-10-27, 3385 alerts)

- `data/alerts.js` is 7,200,209 bytes; gzip gives 506,123 bytes. Apache on lab.gov2.ro
  sends `Vary: Accept-Encoding`, so the network cost is about 0.5 MB.
- `data/geo.js` is 1,352,356 bytes (county borders at full precision).
- Share of `alerts.js` by field: `msg` 24.8%, `msg_ro` 15.0%, `msg_en` 10.4%,
  `deliveries` 6.5%, `locations` 4.6%. `msg` is the same text as `msg_ro` + `msg_en`.
- 16 fields are null in at least 3148 of 3385 alerts (the April-only and March-only columns).

## Decision

Keep the JS globals (`window.ALERTS`, …). Do not change to CSV or SQLite.

- The app must open from `file://`. A browser cannot `fetch()` a local CSV or SQLite file
  from `file://`, so both formats need a server.
- SQLite in the browser needs sql.js (WASM, about 1 MB) to query 3,385 rows that fit in
  memory. CSV cannot hold the nested `deliveries` and `locations` lists.
- The cost is in the content, not in the format: duplicate text, null fields, derived fields.

## Deliverables

1. `build_data.py` writes a compact bundle:
   - Drop `msg`. The front end builds it from `msg_ro` and `msg_en` where it needs it.
   - Omit a key when its value is null, empty string or empty list.
   - Drop the fields that the front end can derive from `sent_at` (`date`, `hour`, `weekday`).
     `data.js` adds them back once, after load. Keep `month`.
   - Keep `data/alerts.json` with the same compact content (it is git-ignored).
2. `data.js` restores the dropped fields after load, so that no other file in `js/` changes.
   If another file must change, list it in the report.
3. `data/geo.js`: round coordinates to 4 decimals (about 11 m) and simplify each ring with
   Douglas–Peucker, in standard-library Python, in `build_data.py`. Keep every county.
   Do not add a dependency.
4. ACTIVITY and BACKLOG entries with the measured sizes, raw and gzip.

## Acceptance tests

1. Sizes: report raw and gzip for `alerts.js` and `geo.js`, before and after.
   Target: `alerts.js` under 3.5 MB raw; `geo.js` under 300 KB raw.
2. Parity: after `data.js` restores the fields, each alert equals the old alert (compare as
   JSON, with the old `msg` rebuilt from `msg_ro` and `msg_en`). Report every difference.
   If `msg` cannot be rebuilt exactly for some alerts, keep `msg` for those alerts only and
   report the count.
3. The map shows all 42 county shapes with no visible gaps at the default zoom
   (headless Chrome screenshot; look at it).
4. The dashboard KPIs, filters, table, feed and drawer work from `file://` with 0 JS errors.

## Stop and ask

Stop and ask before you add a dependency or change a field that the front end reads, other
than the restored fields above.
