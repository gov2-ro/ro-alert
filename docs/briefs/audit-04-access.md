# Audit 04: mobile layout and accessible interactions

Status: ready after phase 03. Read `../IMPLEMENTATION_HANDOFF.md` first.

## Scope and layout rules

Primary files: `index.html`, `css/styles.css`, and view/control JavaScript.
Keep the existing palette, brand, views, and shared filtering semantics.
Do not solve mobile overflow by hiding content or globally disabling horizontal overflow.

At desktop widths, retain the sidebar and an independently scrolling results region.
At narrow widths, use one document scroll for the content and an accessible Filters control.
Open the same search, dates, facets, and reset controls in a labelled filter drawer.
Prefer moving or reusing controls over creating a second set of event handlers and state.
If controls are duplicated, they must still derive from the same state and have unique IDs.
Keep the active-filter strip and result count visible outside the drawer.
Use a modal drawer on phones. Its Apply action closes it; changes may update results immediately.
Label Clear separately so it cannot be confused with closing the drawer.

Make the header fit 320 px without losing any view or language control.
Wrap or scroll the view list inside its own bounded region if required.
Use flexible header height instead of subtracting a fixed 60 px from the mobile viewport.
Stack the Feed summary above or below cards. Cards use the available content width.
Allow card headers, category labels, dates, and delivery tables to wrap safely.
Keep tables and maps in their own bounded scrolling containers where necessary.
The document itself must not overflow horizontally.
Keep footer and Sources content reachable with the chosen scrolling model.
Keep record details readable at 320 px and 200% zoom.

## Interaction and semantics

Use a native modal dialog for details and mobile filters where practical.
Otherwise implement the complete dialog pattern: accessible title, dialog role, aria-modal,
initial focus, focus containment, Escape, background inertness, and focus restoration.
Restore focus to a useful surviving control when rerendering removed the original trigger.
Do not leave focus on body after opening or closing a record.
Give close buttons an explicit translated accessible name.

Use native links or buttons for record actions and sorting.
Do not turn a click-only tr or div into the only way to open a record.
Use aria-sort on the active table header. Activate sorting with Enter and Space.
Keep visible focus styles on every interactive element, including map alternatives.
Give search, date bounds, language controls, and view navigation explicit accessible names.
Expose expanded state on disclosures and selected state on toggle controls.
Use navigation semantics for URL-linked views; do not add an incomplete ARIA tab pattern.

Announce the result count politely after settled updates. Do not announce every chart separately.
Provide a focusable skip link to the main content.
Map interaction must have an equivalent county/place list that works without a pointer.
Every chart must have an accessible title and a nearby data table or textual equivalent.
Do not require hover to obtain the data. Keep redundant tables collapsed until requested.
Respect prefers-reduced-motion for animations and chart transitions.

## Readability

Normal-size meaningful text must have at least 4.5:1 contrast.
Large text must have at least 3:1. Interactive focus and control boundaries need clear contrast.
The existing `#999` against `#faf8f1` is 2.68:1; replace it for meaningful captions and counts.
Keep colours supplementary to text, patterns, and labels.
Use at least 14 px for reading text and explanatory captions; 12 px is permitted for dense
table metadata when zoom remains usable. Avoid 10–11 px method text.
Aim for 44 px touch targets on primary controls. Keep secondary controls at least 24 px,
with enough spacing to avoid accidental activation.
These requirements apply to both language layouts and long source names.

References: [W3C modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/),
[reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), and
[contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

## Acceptance checks

| ID | Required evidence |
|---|---|
| U01 | At 320, 390, 1024, and 1440 px, document scrollWidth is no greater than clientWidth, allowing 1 px rounding. |
| U02 | At 320 and 390 px, search, dates, every facet, active-filter removal, and Reset are operable. |
| U03 | Mobile Feed cards occupy the content width; no fixed side column squeezes their text. |
| U04 | Keyboard alone opens a table and Feed record, sorts, changes views, filters, and closes both drawers. |
| U05 | Dialog focus enters, stays inside, closes with Escape, and returns to a meaningful trigger. |
| U06 | Keyboard users can select a county and a canonical place without using the map. |
| U07 | A chart's data is available without hover or canvas interpretation. |
| U08 | At 200% zoom and with long EN labels, controls remain available and no content is lost. |
| U09 | Contrast calculations pass for meaningful text tokens; reduced-motion settings suppress transitions. |
| U10 | Zero results, the footer, and Sources remain reachable. Both RO and EN mobile screenshots are inspected. |

Run an automated accessibility scan if available, then perform the manual keyboard checks.
An automated scan alone does not establish accessibility compliance.
Report remaining exceptions precisely. Do not claim a full WCAG certification.
