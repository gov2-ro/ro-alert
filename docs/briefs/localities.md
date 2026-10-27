# Brief: localities from `Lista poligoane`, on the map

Status: ready for Sonnet. Owner: pax. Author: Opus, 2026-10-27.

## Measured (2026-10-27)

- `poligoane` (source `Lista poligoane`) is a comma list of `N-NAME` items, for example
  `1-PATARLAGELE`, `1-Cerc, 2-CAVNIC`, `1-polygon, 2-polygon`. All 5,972 items have the
  `N-` prefix. Names are upper case, without diacritics, and without a county.
- Generic geometry labels (`Cerc`, `Poligon`, `polygon`) are not places.
- mariuscomper.uk resolved 872 of 920 bear-alert locality mentions (94.8%) without
  ambiguity: 34 had no safe match, 14 were ambiguous inside one county. That is the target.

## Decisions

- Use a gazetteer with coordinates, committed to the repo, so that the build stays offline.
  Preferred source: Wikidata (CC0), items with a SIRUTA code (P843) and coordinates (P625),
  with the county. Fetch it once with a script in `gazetteer/`; commit the script and the
  resulting CSV. If Wikidata does not cover at least 95% of the SIRUTA localities, stop and
  report the coverage and other candidate sources.
- Match on a key: upper case, no diacritics, no punctuation, single spaces. Match inside
  the alert's county first. For a national alert, match only when the name is unique in
  Romania.
- A name that matches more than one place in the county is ambiguous. Do not place it.
  Count it.
- Keep `locations` (text extraction) as it is. Add a new field.

## Deliverables

1. `gazetteer/fetch_wikidata.py` and `gazetteer/localities.csv` (siruta, name, key, county,
   lat, lon, type such as city or village).
2. `build_data.py`: parse `poligoane`, drop the generic labels, resolve each name, and add
   `places`: a list of `{name, siruta, lat, lon}` per alert. Write the counts to `meta.json`:
   mentions, resolved, no match, ambiguous. List the unresolved names with their counts in
   a git-ignored report file, for review.
3. Map: a point layer for the current selection, sized by the count of mentions per place,
   with a caption that says a point is the locality of the alert area, not the place of
   the event. Clicking a point filters by that locality.
4. ACTIVITY and BACKLOG entries with the measured rates.

## Acceptance tests

1. For bear alerts (`msg` contains `urs`, February–July), report mentions, resolved,
   no match and ambiguous. Compare with 920 / 872 / 34 / 14.
2. For all alerts, report the same four counts.
3. The 20 most frequent unresolved names, with the reason for each.
4. The map layer works from `file://`, with 0 JS errors; report the size change of
   `data/alerts.js`.

## Stop and ask

Stop and ask before you change `locations`, add a dependency to the build, or use a
gazetteer whose licence does not allow redistribution.
