# Audit 03: shared state, place identity, URLs, and language

Status: ready after phases 01 and 02. Read `../IMPLEMENTATION_HANDOFF.md` first.

## Scope

Primary files: `js/app.js`, `js/filters.js`, `js/sidebar.js`, `js/feed.js`, `js/map.js`,
`js/location.js`, `js/story.js`, `js/data.js`, `js/i18n.js`, and `index.html`.
The language and place additions below authorize targeted builder and bundle changes.
Keep the global-script architecture and file:// support.

## A. One state and one facet registry

Keep one registry in `filters.js`, loaded before sidebar and app code.
Include field, metadata key, translation key, initial expansion, and Briefing visibility.
Use it for state initialization, matching, rendering, URL validation, and active-filter labels.
Remove the duplicate registry and independent Feed chip filter state.
Keep one category palette. Feed and charts use its colours and translated labels.
Keep data category values unchanged; labels may depend on the UI language.

Controls derive their selection from state after every render and history event.
Selecting a Feed chip replaces that facet's selection with its category.
All clears only the risk facet. Other filters remain active.
If several risk values are selected, show their chip states consistently; All is inactive.
Briefing hides advanced controls without changing their filters.
Show every active data filter in a persistent strip outside the replaceable view content.
Each chip has an accessible remove action. Reset clears all data filters and local scope.
Show global facet counts as "all-data counts" until contextual counts are implemented.
Do not imply that the current static counts describe the filtered selection.

Use one state update path to synchronize controls, URL, result count, and rendering.
Language changes trigger one render. Changing a visual control does not alter data filters.
No-results content retains search, active filters, and a clear-filters action.

## B. Place identity

Add `state.selectedPlaceId`, an integer SIRUTA code or null.
Use it instead of name equality for resolved-place filtering.
Add `places[].county` as the canonical gazetteer county display name.
Keep `name`, `siruta`, `lat`, and `lon` unchanged.
Do not change the gazetteer matching algorithm or pick ambiguous candidates.
Preserve text candidates in `locations` and `localities`; label them as extracted candidates.

Build Local chips and top-place links from distinct SIRUTA codes in resolved `places`.
Count one alert at most once for each code, even if the source names it several times.
Use canonical display names. Show county context when names collide.
Use a searchable list or disclosure for a long place list instead of hundreds of open chips.
Put the selected place in the heading and active-filter strip even when no records remain.

A county click scopes to the existing issuer-county convention, with no place selected.
A point click scopes to its SIRUTA code within current global filters.
It must not add an issuer-county restriction that excludes nationally issued records.
Local view therefore permits either a county selection or a place selection, or both.
When choosing a place inside an existing county view, retain that county scope.
The map point count and the resulting selection count must agree.
Never use the most frequent issuer as the geographic identity of a place.

Harghita / Toplița must show the canonical name, a selected control, and 23 alerts
on the audited corpus. Do not display several spelling variants as different resolved places.
Unresolved text remains available in message details and the quality report.

## C. Shareable location hash

Use a versioned URL hash so file:// works without server routing.
Use URLSearchParams encoding inside the hash. Do not concatenate unescaped source strings.
The canonical keys are:

| Key | Value |
|---|---|
| schema | 1 |
| view | story, dashboard, table, feed, location |
| lang | ro or en |
| q | Search text |
| from / to | Valid YYYY-MM-DD bounds, omitted when unrestricted |
| f.FIELD | Repeated values from the registered facet |
| county | Existing canonical issuer-county value |
| place | Decimal SIRUTA code |
| record | Existing alert ID |
| sort / dir / page | View-specific sort key, asc or desc, positive page number |

Canonicalize filter ordering so equal selections produce equal links.
Only include optional keys when set or different from defaults.
Unknown keys and unsupported enum values cannot crash initialization.
Unknown records or place IDs produce a small dismissible notice and leave valid state intact.
Reject malformed dates and reversed ranges with a visible explanation.
Do not clamp summary-only months into the detail range silently.
Keep current summary visibility rules; explain unavailable detail periods when selected.

Use pushState for deliberate view, facet, scope, page, and record navigation.
Use replaceState for debounced typing to avoid a history entry for every character.
Handle Back, Forward, and hash navigation through the same state update path.
Avoid duplicate history entries and render loops.
Opening a record does not change the filtered selection.
A valid record link may open a record outside the current selection; label that context.
Closing its drawer removes record state. Back closes it when that was the last action.
Reset must update the URL as well as visible controls.
Phase 06 implements pagination; retain the page key contract until then.
Whitespace-only search is unrestricted. Use normalized state when deciding whether a data filter is active.

## D. Search and language

Use one accent-insensitive, case-insensitive search normalizer.
Search original message, title, county, initiator, extracted candidates, and canonical place names.
Do not change original strings to achieve normalized search.
Equivalent Brasov/Brașov and Bucuresti/București queries must return identical ID sets.
Translate derived categories, month labels, control text, and the footer in RO and EN.
Do not translate source messages or change source risk strings in stored data.

Improve bilingual splitting conservatively. Authorize `message_language` with values
ro, en, mixed, or unknown. Preserve the normalized original message exactly through compaction.
English-only records must not be labelled Romanian or have their available EN control disabled.
The corpus record `60e0361757e4` starts "On 09.02.2026" and is a required example.
Use deterministic, documented evidence rules. Ambiguous text stays unknown or unsplit.
Short unknown text must not disappear. Show the original when a requested translation is absent.
Do not add network translation or a language-model dependency.
Update original-text fallback paths in the drawer, Feed, search, and bear-text calculation.
The story bear measure must keep its documented Romanian-word definition and expose unavailable
Romanian text, rather than invent a translation. Report any change to its denominator and count.

## Acceptance checks

| ID | Required evidence |
|---|---|
| S01 | One facet registry drives matching and controls. Every active filter is visible and removable. |
| S02 | Selecting Meteo highlights Meteo after rendering and after a language change. All is inactive. |
| S03 | Briefing preserves advanced filters and displays their active chips. Reset clears them. |
| S04 | Equivalent accented searches return identical IDs, including canonical place names. |
| S05 | Toplița selects 23 Harghita records and displays one canonical selected place. |
| S06 | A synthetic nationally issued record at a resolved place survives a point click. Count equals the point. |
| S07 | Reload, Back, Forward, and copy/paste preserve facets, view, language, scope, dates, and record. |
| S08 | Unknown URL keys, bad dates, absent IDs, and an unsupported hash schema have safe visible fallbacks. |
| S09 | RO, EN, mixed, and unknown message fixtures preserve original text exactly. The English-only example is labelled correctly. |
| S10 | Rebuild diff changes only the authorized place/language fields and metadata. IDs and deliveries remain equal. |
| S11 | Zero results retain usable filters. No global EN view leaves derived category labels in Romanian. |

Return the URL schema examples, corpus field diff, and revised bear-text coverage figures.
