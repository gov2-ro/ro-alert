# RO-ALERT audit implementation hand-off

Status: ready for implementation. Owner: pax. Prepared: 2026-10-27.
Baseline: v0.7.0, commit `53a7187`, plus the audit notes recorded in this release.

## Start here

Read `AGENTS.md` when present; otherwise read the tracked `CLAUDE.md` instructions.
Read `docs/BACKLOG.md` and the newest entries in `docs/ACTIVITY.md`.
Then read this file and the brief for the next unfinished phase.
Implement one phase at a time. Each phase must produce a reviewable change and evidence.
Do not start by rewriting the application or introducing a framework.

This package specifies the work requested after the project audit.
It authorizes the changes listed in these six briefs, including their stated data additions.
Earlier briefs remain historical context. These briefs supersede their restrictions only for
the changes expressly listed here. The alert unit and owner deferrals below still apply.
Routine implementation choices inside a brief do not need another approval.

## Order and ownership

| Phase | Brief | Result | Depends on |
|---|---|---|---|
| 01 | [Analytics correctness](briefs/audit-01-analytics.md) | Correct risks, dates, and failure denominators | Baseline |
| 02 | [Pipeline reliability](briefs/audit-02-pipeline.md) | Offline regression checks and safe source updates | 01 |
| 03 | [State, places, and language](briefs/audit-03-state.md) | Consistent filters, stable places, shareable URLs | 01, 02 |
| 04 | [Mobile and accessibility](briefs/audit-04-access.md) | Usable controls and records on phones and keyboards | 03 |
| 05 | [Visual and geographic architecture](briefs/audit-05-visual.md) | Clear hierarchy and explicit map coverage | 01, 03, 04 |
| 06 | [Browsing and rendering](briefs/audit-06-browsing.md) | Complete browsing, exports, bounded rendering, error states | 02–05 |

Follow this order. Work across shared files makes concurrent implementation costly.
The same implementing model may finish all phases, with a checkpoint after each phase.
Report a failed acceptance check and resolve it before moving to the next phase.

Track phase completion in BACKLOG, not by assuming that a ready brief is implemented.
Phase ownership covers the audit as follows:

| Audit concern | Implementing phase |
|---|---|
| Risk classification, calendar dates, failure denominators | 01 |
| No-change workflow, source transactions, revisions, input provenance, offline CI | 02 |
| Facet duplication, filter visibility, place identity, URLs, search, language | 03 |
| Phone controls, responsive layout, keyboard actions, dialogs, chart alternatives, contrast | 04 |
| KPI repetition, map modes, geographic coverage, chart semantics | 05 |
| Table cutoff, Feed DOM growth, exports, resource lifecycle, load errors | 06 |
| Source geometry and deterministic schema/input hashes | 02 |
| Stale commands, measurements, and duplicate backlog items | Each phase; final reconciliation in 06 |

## Decisions that stay fixed

- The application stays static and works from `file://` without a build step or network.
- Keep the existing five views: Pe scurt, Dashboard, Table, Feed, and Local.
- Keep Dashboard as the default view. Changing the landing view remains an owner decision.
- Keep official summary months visible only when no data filter is active.
  Language, sorting, pagination, view selection, and opening a record are not data filters.
- A missing month is unknown, not zero. Summary totals never become invented alert records.
- Keep ALERT and CANCEL as separate alerts. Do not change grouping or existing alert IDs.
- Preserve every source delivery row. One successful delivery makes `status_ok=true`.
- Preserve the representative row rule: first SENT row, otherwise first row.
- Keep the accepted August mismatch: 557 detail rows against official total 556.
  Retain its warning. Do not remove a row to make the totals agree.
- Do not resolve ambiguous places by picking the largest or nearest candidate.
  Keep unresolved and ambiguous names visible in the quality report.
- Do not start VPS scheduling, deployment, publishing, or remote repository changes.
  The owner explicitly deferred VPS scheduling. The runner connectivity limit is documented.
- Keep Python enrichment standard-library only. Existing ingest dependencies remain allowed.
  A browser test dependency is allowed in development only; it must not enter page scripts.
- Preserve the warm light palette and current brand. Improve layout and hierarchy within it.
- Keep source strings and stable category values. Translate their display labels separately.
- Do not edit `_obsolete/`, delete raw workbooks, or replace the gazetteer in this package.

## Measured baseline

These are audit measurements, not target values for corrected risk categories.

| Measure | Baseline |
|---|---|
| Alerts / deliveries | 3,385 / 3,618 |
| SENT alerts / observed failed alerts / CANCEL | 3,384 / 1 / 21 |
| ERROR delivery rows | 196, all in April |
| Monthly alert counts, Feb–Aug 2026 | 76, 102, 237, 618, 1,185, 610, 557 |
| April delivery rows | 470 |
| Summary totals | Sep 2025: 286; Oct: 146; Dec: 96; Jan 2026: 61 |
| Missing month | November 2025 |
| Date range | 2026-02-03 through 2026-08-31 |
| Duplicate IDs removed by current build | 0 |
| Animal-category records before correction | 2,387; 48 suspect cases identified |
| Bear text matches before correction | 2,333 across all record months |
| Daily chart in Europe/Bucharest | 210 slots, 209 unique dates, 16 alerts omitted |
| Place mentions resolved | 3,426 / 3,611; 131 ambiguous; 54 unmatched |
| Alerts with a resolved place | 1,392 / 3,385 (41.1%) |
| Distinct map points | 1,373 |
| County-scoped / national-scoped alerts | 2,897 / 488 |
| Table / Feed rendering | 500 table rows; 3,385 cards; 48,923 Feed DOM elements |
| alerts.js / meta.js / geo.js | 4,531,815 / 34,304 / 250,835 bytes |

Current values after Phase 06 (render measure): Feed 767 DOM elements, Table 806 (50 rows), Local Harghita 1,009; `alerts.js` 4,664,511 / `meta.js` 35,993 / `geo.js` 250,835 bytes. The table above stays as the audit record.

Cached raw workbooks exist at `repository/arhiva-ro-alert/ckan/` in the audited workspace.
They are ignored by Git. A fresh clone cannot assume that they exist.
The source GeoJSON is also ignored. Phase 02 must close that build-input gap.
Audit screenshots and scripts under `/tmp/ro-alert-*` are optional session evidence.
They are not implementation dependencies or a persistent test suite.

## Implementation guidelines

Keep functions small enough to test without a DOM where possible.
Separate reading and validation from committing source changes.
Separate filtering from aggregation, and aggregation from rendering.
Keep state authoritative; DOM controls reflect state and never define another filter store.
Preserve unknown values as unknown. Do not turn missing data into success, zero, or a place.
Escape source content before HTML insertion. Use text nodes when practical.
Use one category palette and one facet registry across views.
Keep the existing script dependency order, or update it explicitly when adding a helper.
Avoid unrelated formatting, renaming, dependency upgrades, and broad extraction-rule changes.

Use deterministic fixtures and observable user outcomes for regression tests.
Do not add tests that only compare copied implementation constants.
Run checks from a temporary workspace when a test mutates sources or generated bundles.
Never use a live ingest against the working corpus as a test fixture.
Adding a development-only test manifest and a tracked geometry input is authorized by this package.
Do not ask for approval solely because an earlier brief did not name those files.

## Verification contract

Each phase adds its named checks to the persistent suite.
Use `python3 -m unittest discover -s tests -p 'test_*.py'` for Python checks.
Use `node --test tests/js/*.test.cjs` for browser-independent JavaScript checks.
Add commands and prerequisites to README when their tests first land.
The browser runner may use Playwright, installed in development only.
Commit its test code and dependency manifest when added; do not depend on a user's home path.
Document the browser installation and one exact command to run the suite.

Browser checks must cover `file://`, RO and EN, and the relevant views.
Use widths 1440, 1024, 390, and 320 CSS px. Test calendar calculations in UTC,
Europe/Bucharest, and America/New_York. Block external requests for the offline smoke run.
Inspect screenshots of changed layouts. Do not rely only on screenshots being written.
Use stable selectors and accessible names. Avoid arbitrary long sleeps.

After data changes, report field-level differences by alert ID and rebuild twice.
Unrelated alert fields and all delivery rows must remain equal.
After UI changes, check the no-results state, empty optional fields, and a failing load.
Keep accepted source warnings visible. New warnings must be described, not silently accepted.

## Checkpoint report

Return these items after each phase:

1. What changed and which acceptance checks passed.
2. Exact commands, measurements, screenshots, and any failed or unrun checks.
3. Alert field changes, record counts, source warnings, and bundle sizes when relevant.
4. Decisions made inside the brief and any remaining limit.
5. Commit and tag, following the repository release rules, plus the next unfinished phase.

Update matching BACKLOG items and add an ACTIVITY entry in the same change.
Do not mark the broader audit item complete if a later phase still owns part of it.
Check repository status first. Preserve unrelated user changes and existing untracked files.
Commit authored deliverables only. Do not push or publish a release.

## Copyable prompt for the implementing model

```text
Implement the RO-ALERT audit follow-up in this repository.
Read AGENTS.md when present, otherwise CLAUDE.md.
Read docs/IMPLEMENTATION_HANDOFF.md, docs/BACKLOG.md, and docs/ACTIVITY.md.
Start with the first unfinished phase in the hand-off and read that phase's full brief.
The listed changes are authorized. Keep the fixed decisions and explicit exclusions.
Implement and verify one phase at a time. Update the backlog and activity log.
Follow repository commit, release-note, and tag rules. Do not push, deploy, or schedule a VPS job.
Continue through the phases while their prerequisites and acceptance checks pass.
Report measured results and exact commands. Do not claim an unrun check passed.
Ask only when a required decision falls outside these briefs or evidence contradicts a fixed invariant.
```
