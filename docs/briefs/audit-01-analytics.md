# Audit 01: correct analytics and failure coverage

Status: ready. Dependency: baseline. Read `../IMPLEMENTATION_HANDOFF.md` first.

## Problem and scope

The current classifier matches `urs` inside unrelated words and overrides structured risks.
The daily chart mixes UTC parsing with local calendar changes and drops the final day's alerts.
Failure rates combine months with different reporting coverage.
Fix these behaviours before changing the visual hierarchy.

Primary files: `build_data.py`, `js/charts.js`, `js/data.js`, `js/dashboard.js`,
`js/sidebar.js`, `js/feed.js`, `js/location.js`, `js/story.js`, and `js/i18n.js`.
Generated data bundles and regression fixtures are in scope.

## A. Risk classification contract

Normalize accents, case, whitespace, and non-breaking spaces for comparisons only.
Keep original source fields unchanged.
Map recognized structured risks before inspecting free text:

- Animale periculoase -> Animale periculoase.
- Copii disparuti -> Copil dispărut.
- Atac aerian -> Atac aerian / dronă.
- Inundatii -> Inundații.
- Furtuni, Viscol, and Caderi masive de zapada -> Meteo.
- A principal risk identifying fire -> Incendiu, unless a more specific mapped risk applies.
- A principal risk identifying technology or pollution -> Tehnologic, unless more specific.

Document the mapping table beside the function. Cover the structured values in the corpus.
Use text only when structured fields do not establish a category.
The fallback must use bounded Romanian or English terms, including bear inflections.
Reuse the bear-word rule where appropriate; do not copy its definition into more modules.
Do not match `urs` in `sursele`, `hours`, `downpours`, `detours`, or `watercourses`.
A structured storm or flood remains that category even when its advice mentions an animal.
Keep unknown cases as Altele. Do not invent a model-based classifier.

Keep `risk_category` values compatible with the current facets and palette.
Write a deterministic, ignored classification-change report keyed by alert ID.
Include old category, new category, source risks, and the applied rule.
The audit's 48 suspect records are a review set, not a required exact change count.
Do not alter IDs, grouping, message text, representative rows, places, or deliveries here.

## B. Calendar contract

Generate daily labels with UTC calendar arithmetic, independent of the browser timezone.
This treats the source timestamp's date as the reporting date; it does not reinterpret its timezone.
Keep source wall-clock hours for the hour charts.
Do not append UTC offsets to source timestamps without evidence from the source.

Every day from the first selected date to the last selected date occurs once.
No day is skipped. Days without selected records have zero counts.
Use the same daily aggregation for the Dashboard and Local timelines.
Each category sum and their combined sum equal the corresponding filtered records.
The failed-alert line is a separate diagnostic and must not inflate the stacked total.
Remove smoothing that implies intermediate observations on discrete daily counts.

## C. Error reporting contract

The data proves observed statuses, not receipt by individual devices or complete system reliability.
`reports_errors` currently means an ERROR row was found. It does not prove reporting completeness.
Retain it for compatibility during migration; stop using it as evidence of complete reporting.

Add `meta.months[].error_reporting` with these values:

| Value | Meaning | Initial rule |
|---|---|---|
| observed | This source contains ERROR rows; completeness is not established | At least one ERROR delivery |
| unknown | No evidence establishes error reporting | Detail source without ERROR rows |
| not_applicable | No delivery records exist | Official summary-only source |

Add this metadata in the builder. No alert-object change is required.
Do not infer full coverage from file shape or a month containing no errors.
A future claim of complete reporting needs a separately documented source statement.

Use one shared selection-statistics helper for all views.
It returns total selected alerts, selected alerts from observed-reporting months,
observed failed alerts, selected delivery counts in those months, and ERROR deliveries.
Return null rates when the relevant denominator is zero.

The main count may say "Observed failed alerts: 1" across the full selection.
Never label `1 / 3385` as an overall failure rate.
In the reporting sample, show `1 / 237` failed alerts and `196 / 470` failed deliveries.
Label both as observed shares in the reporting sample, not national reliability.
Give the reporting months and denominator beside each rate.
For a selection restricted to May, show unknown error coverage rather than "0% failure".
Observed zero failures within a selected April subset may show 0/N with its sample label.
Use `fmtPct` consistently; remove the Feed's separate whole-number rounding.
Replace the reliability doughnut with a textual summary until phase 05 places the diagnostics.
Keep SENT labels tied to the source status. Do not claim user receipt.

## Acceptance checks

| ID | Required evidence |
|---|---|
| A01 | Fixtures classify structured storm, flood, missing child, air warning, pollution, and animal records correctly. |
| A02 | Fixtures cover the five false substring examples and genuine Romanian/English bear words. |
| A03 | Corpus diff lists every category change. All other alert fields and delivery rows are equal. |
| A04 | Counts remain 3,385 alerts, 3,618 deliveries, 196 ERROR deliveries, one failed alert, 21 CANCEL. |
| A05 | UTC, Bucharest, and New York produce 210 unique dates from Feb 3 through Aug 31 inclusive. |
| A06 | Daily stacks total 3,385. August 31 contains 16 alerts. March 29 occurs once. |
| A07 | A filtered date range includes internal zero days and its last day. Local uses the same contract. |
| A08 | All-data and April selections show reporting sample 237 alerts and 470 deliveries. May has no failure rate. |
| A09 | Dashboard, Local, Feed, sidebar, and Pe scurt use the same statistics and RO/EN coverage labels. |
| A10 | Rebuilding twice gives identical bundles. file:// smoke checks pass with no JS errors. |

Add persistent named tests. Return before/after category counts and bundle sizes.
Do not tune the grouping key or remove the accepted August warning to make a check pass.
