# Audit 05: visual hierarchy and geographic coverage

Status: ready after phases 01, 03, and 04. Read `../IMPLEMENTATION_HANDOFF.md` first.

## Design intent

The page should answer three questions in order:
What data does this selection cover? What patterns does it show? Which messages support them?
Use the existing warm light palette, type system, category colours, and restrained card style.
Improve information hierarchy before adding decoration.
Keep Dashboard as the landing view. Keep Pe scurt first in navigation.

## A. Common page structure

Use the shared selection strip from phase 03 above each view.
Show detail-record coverage, current selection, and source freshness with precise labels.
Example: "3,385 detail records · Feb–Aug 2026; earlier months have summary totals only".
Translate the label. Distinguish source modification from fetch/check time.
Identify the site near its introduction as an independent archive, without suggesting live warnings.
Keep the existing source attribution and official-project disclaimer.

Dashboard order:

1. Compact overview: selected alert count, dominant risk with share, and counties represented.
2. County/place map beside the daily timeline at wide widths; stack them on phones.
3. Risk distribution, hour distribution, and leading counties/issuers.
4. A single reporting-quality section with observed delivery diagnostics and method links.

Remove repeated failure-rate cards and the reliability doughnut.
The sidebar provides controls, active selection, and a result count; remove its duplicate KPI grid.
The Feed uses a compact selection summary rather than a second reliability report.
The Local view uses the same hierarchy with a clear county or place heading and back action.
Keep alert records easy to reach from the analytical views.

Pe scurt keeps its narrative measures, official summary styling, and Sources section.
Use neutral ink for month-over-month increases and decreases. Signs and numbers carry direction.
Do not colour an increase in warnings green or a decrease red as a judgment of safety.
Avoid implying incident frequency, human receipt, or risk exposure from message counts.

## B. Map modes

Add a labelled Counties / Localities mode control. Default to Counties.
Do not paint all locality points over the county choropleth by default.
County mode uses current issuer-county counts and labels that convention explicitly.
Locality mode uses resolved SIRUTA places and subdued county outlines.
Keep point size bounded and sensitive to zoom. Keep a count legend and the existing caveat:
the point marks a named locality in the alert area, not the exact event or its polygon.
Both modes have the accessible list alternative from phase 04.

Show map coverage for the current selection, not only a whole-corpus percentage:

- County mode: mapped issuer-county alerts / selected alerts; national and unknown counts separately.
- Locality mode: alerts with at least one resolved place / selected alerts.
- Explain that one alert can name several places; point counts do not sum to unique alerts.
- Keep mention-resolution quality separate from alert coverage.

On the baseline, locality coverage is 1,392 / 3,385 (41.1%), whereas mention resolution is 94.9%.
The county map excludes 488 nationally scoped alerts. Some are geographically targeted.
Do not relabel them as nationwide events or silently assign them to an issuer's home county.
Do not change geographical inference or source scope in this phase.
Document that combined București-Ilfov records map onto the București feature today.
An Ilfov feature with zero mapped records must not imply that the combined source excludes Ilfov.
Explain this exception in the legend or coverage details.

Under filtering, keep the map legend's numeric bounds visible.
When the colour scale changes with the selection, label it "within this selection".
Do not imply that the same blue means the same count across selections.
Keep boundaries, selected states, labels, and categorical meanings consistent between modes.

## C. Charts and methods

Use consistent number formatting, category order, colours, and date labels across views.
Keep true zero distinct from missing or unavailable values.
Keep the November 2025 gap and hatched official summary bars.
Label chart periods and denominators. Show method notes in readable text, not faint footnotes.
The official animal category is not necessarily a bear-word match; retain that caption.
Failure diagnostics show the phase 01 reporting sample and unknown-coverage count.
Make source links and quality notes reachable from every analytical view.
Use a disclosure for detailed explanations after one concise visible limitation sentence.

## Acceptance checks

| ID | Required evidence |
|---|---|
| V01 | Dashboard opens with Counties mode and no locality points covering the fills. |
| V02 | Switching map mode changes presentation but not filters, result count, or URL data selection. |
| V03 | Baseline coverage shows county 2,897/3,385 and national 488; place coverage 1,392/3,385. |
| V04 | Filtered coverage equals an independent calculation from selected rows. Empty coverage does not divide by zero. |
| V05 | The combined București-Ilfov convention is visible; map labels do not claim event locations. |
| V06 | Observed delivery diagnostics appear once per view, with reporting periods and denominators. |
| V07 | Story retains the official-summary distinction and missing-month gap. Volume changes use neutral colour. |
| V08 | Dashboard, Pe scurt, and Local remain readable at 320, 390, and 1440 px in RO and EN. |
| V09 | Source status, coverage, and method links remain available without scrolling through all Feed records. |
| V10 | All earlier acceptance checks pass. No alert data or geographic assignments change in this phase. |

Return inspected before/after screenshots and a short explanation of the new reading order.
