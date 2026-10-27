# Audit 06: complete browsing, export, and bounded rendering

Status: ready after phases 02–05. Read `../IMPLEMENTATION_HANDOFF.md` first.

## Scope

Primary files: `js/table.js`, `js/feed.js`, `js/location.js`, `js/app.js`, `js/charts.js`,
`js/map.js`, `js/data.js`, styles, translations, and browser tests.
Keep static files and the existing bundle format. Do not introduce a database or virtual DOM.

## A. Browse every selected record

Replace the fixed 500-row table cutoff with pagination, 50 records per page.
Use the same page size for Feed and the record list in Local.
Sort and filter the complete selection before slicing the visible page.
Default to descending sent_at with ID as a stable tie-breaker.
Table sorting must also use a stable tie-breaker so records do not move between pages.
Display start–end of total, current page, and labelled previous/next controls.
Page changes use the URL contract from phase 03.
Reset page to 1 when filters or sorting change. Clamp an out-of-range page after loading a link,
and report the resulting valid page in the canonical URL.
Keep aggregate charts and coverage based on the complete filtered selection.
Pagination must not count as a data filter or hide official summary months.
On a page transition, focus the list heading and make its beginning visible.

Do not attach one listener per row or card when delegation to the list can serve the action.
Keep native record links accessible. A full card may remain clickable as a supplementary action.
Group Feed dates within the current page; a date continuing on another page must not imply
that the displayed page count is the full day's count. Label it or show the full selected-day count.

## B. Filtered export

Provide an Export selection action in Table and Feed.
Minimum format: UTF-8 JSON downloaded with a Blob and an object URL.
Export the full selection, not the current page, and preserve original message content.
CSV and spreadsheet exports are deferred; do not add a dependency for them.

Use this envelope:

```text
schema_version: 1
exported_at: ISO timestamp (export only; never written into static bundles)
selection: canonical filter/scope state and language, excluding pagination and open record
sources: source provenance for the selected months
records: enriched selected records, with stable IDs, delivery entries, and original text
```

Sort records deterministically using the active sort and ID tie-breaker.
Include the attribution and reporting-coverage explanation in the export metadata.
Use a descriptive filename. Revoke the object URL after the download is started safely.
Disable export for zero results with a clear explanation.
Do not export raw workbook rows, only normalized selected alert records.

## C. Rendering lifecycle

Keep the active view shell while filters or language update it.
Update existing Chart instances through the existing upsert mechanism.
Update existing map layers and counts rather than destroying the map for each keystroke.
Destroy the resources when the view unmounts. Keep one active instance per canvas or map host.
Preserve map centre and zoom during filter changes. Reset framing on explicit scope navigation
or a Fit selection action. Keep the map-mode selection while the Dashboard remains active.
Keep cached search text and ID lookup indexes in memory when that simplifies repeated work.
Invalidate them only when the loaded data changes.
Do not change the compact schema or split bundles solely to meet an assumed size target.

Bound rendering by visible records. At most 50 record cards or table rows mount at once.
The active Feed DOM should stay below 5,000 elements for the audited corpus and normal controls.
Measure filter-to-render time with a repeatable script and report browser, hardware context,
and any CPU throttling. Compare the same selection before and after.
Do not make an unexplained wall-clock threshold a universal pass criterion.
If updates visibly block interaction after pagination, profile before adding another mechanism.

## D. Loading and schema failures

Show an initial loading status before app initialization.
Wrap initialization in a visible error path with Retry and a useful plain-language diagnostic.
Catch missing bundles, invalid fetched responses, unsupported schema versions, and malformed data.
Do not silently substitute empty successful datasets.
Validate the required shape before restoration and rendering.
Keep JSON fallback support where it works, but a fresh deployed static page must not depend on
ignored JSON files when its JS bundles are present.
With a missing bundle under file://, show the error and explain which local asset is missing.
Failure rendering must not depend on data or a successful full application render.
No uncaught promise rejection should leave an empty page.
Retry may reload the page; keep its existing URL selection.

## Acceptance checks

| ID | Required evidence |
|---|---|
| B01 | Every one of the 3,385 baseline IDs is reachable through table pagination, with no repeats or omissions. |
| B02 | Sort/filter happen before pagination. Equal timestamps remain stable across page transitions. |
| B03 | Feed and Local mount no more than 50 records; result counts and charts still describe the full selection. |
| B04 | A page deep link reloads correctly. Filter changes reset page; Back restores it. |
| B05 | Export contains every selected ID exactly once, including records beyond page 1 and all their deliveries. |
| B06 | Export metadata describes filters, sources, and coverage; JSON parses and original text is unchanged. |
| B07 | Filter and language changes keep map and chart instances alive; leaving a view releases them. |
| B08 | Map zoom survives filtering. Explicit scope navigation and Fit selection frame the intended area. |
| B09 | Feed has fewer than 5,000 DOM elements; before/after render measurements use the same conditions. |
| B10 | Missing bundle, bad schema, malformed JSON fallback, and load rejection show readable errors and Retry. |
| B11 | All phase suites pass offline. RO/EN file:// smoke checks and final screenshots are inspected. |

## Final hand-back

Run the full persistent suite once all phases pass.
Report each acceptance ID as passed, failed, or not run, with its evidence location.
Report new bundle sizes, corpus totals, classification changes, and known source limits.
Update README to match final commands and architecture, and reconcile stale backlog duplicates.
Keep deferred owner decisions and accepted source defects explicit.
Do not mark the project complete while a required acceptance check is failed or unrun.
