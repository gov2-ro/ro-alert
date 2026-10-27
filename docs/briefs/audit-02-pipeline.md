# Audit 02: reliable ingestion, provenance, and offline checks

Status: ready after phase 01. Read `../IMPLEMENTATION_HANDOFF.md` first.

## Scope

Primary files: `ingest.py`, `build_data.py`, `.github/workflows/`, `sources/manifest.json`,
`.gitignore`, README, regression fixtures, and generated metadata.
Do not start a network schedule or build the deferred VPS deployment.
Keep existing ingest libraries. Use standard-library Python tests.

## A. No-change and failure paths

The ingest command must exit 0 on no change and 1 on rejected input or download failure.
The workflow's month extraction must accept an empty list under Bash `-e -o pipefail`.
It must preserve non-zero exit codes from ingest.
Emit a structured ingest result for automation instead of parsing human prose where practical.
Its changed-month list must include revisions, detail-to-summary changes, and summary changes.
Keep the human-readable `no new data` message.
Only open a data PR when publishable source or bundle files actually change.
Include new warnings and explicitly identify the accepted August warning.

## B. Validate before replacing a snapshot

Separate discovery, download, parsing, validation, and commit.
Download and parse all selected jobs in a temporary staging directory.
A failed job must leave the tracked CSV files and manifest unchanged.
Reject duplicate active resources for one month unless an explicit local choice identifies one.
Do not choose whichever resource happens to arrive last in the API response.
Include resource IDs and URLs in the diagnostic so the owner can choose a new source.
Collapse identical resources only when their bytes and parsed month agree; document that rule.
Validate the CKAN `success` field and paginate discovery when results exceed a page.
Reject unknown workbook shapes and required-header failures with the resource context.

For a valid detail-to-summary revision, remove the previous month's detail CSV in the same update.
For summary-to-detail revisions, replace the manifest entry and create one detail CSV.
Write the manifest last. Keep backups or a journal until the full commit succeeds.
On ordinary exceptions during replacement, restore the prior snapshot.
On restart after interruption, recover or reject the unfinished transaction before reading sources.
Do not claim that several independent file renames form one atomic filesystem transaction.
Do not delete the last usable raw file before a replacement validates.

## C. Content checks and provenance

Retain resource ID, URL, source `last_modified`, and raw SHA-256.
Add an explicit `--refresh` option that checks known resources even when metadata is unchanged.
No automatic refresh schedule is authorized here.
Content-identical refreshes must leave tracked files unchanged.
Store per-run `checked_at` and outcomes in an ignored run-status file.
Add `fetched_at` to a manifest entry only when new content is accepted.
For legacy entries, keep the unknown fetch time null; do not copy `last_modified` into it.
Changing run time alone must not create a data PR or alter generated bundles.
Retain the current warning strings; codes may be added without losing their text.
Do not generalize the accepted August warning into permission to suppress future mismatches.

Add `meta.schema_version=1` and deterministic input hashes for normalized CSVs, the gazetteer,
the source geometry, and the builder code.
Use stable relative paths, sorted keys, and content hashes. Do not put the current build time in bundles.
Label `last_modified` as source modification time in RO and EN.
Show fetch time separately when known; keep last check in the run report until deployment exists.

Commit the existing source county GeoJSON under a tracked input path, with provenance if available.
Update the builder to read that path and regenerate the same geo.js from a fresh clone.
Do not invent missing licence or source attribution. Record any unknown provenance as unknown.

## D. Offline validation gates

Add a workflow on pull requests and pushes that runs without data.gov.ro.
Keep it separate from the existing scheduled discovery workflow.
Check these invariants before publishing generated output:

- Source rows are conserved as delivery entries, including retries and CANCEL messages.
- Alert IDs are unique. Conflicting duplicate IDs are fatal and include both source references.
- Identical duplicate candidates are also reported; do not discard rows silently.
  If an actual corpus duplicate breaks delivery conservation, stop and report the conflict.
- Non-empty timestamps parse. Invalid dates and unsupported statuses fail with row context.
  Initial accepted delivery statuses are SENT, ERROR, and empty/unknown. CANCEL is a message type.
- Month keys are unique. Summary-only months have no detail records.
- The accepted August discrepancy remains a warning.
- A malformed manifest is fatal; do not silently build metadata without it.
- Compaction and frontend restoration preserve the complete enriched object.
- Two builds with identical accepted inputs produce byte-identical bundles.

Use small committed fixtures for all three workbook shapes and changing column order.
They must cover actual parser behaviour, including XLS and XLSX readers.
Fixtures may be minimal source-derived examples or deterministically generated test workbooks.
Keep personal messages out of synthetic fixtures when they do not affect the test.
Do not depend on ignored raw workbooks or home-directory tools.

## Acceptance checks

| ID | Required evidence |
|---|---|
| P01 | No-change simulation exits 0; no PR is requested; tracked files stay byte-identical. |
| P02 | Ingest failure exits non-zero through the workflow pipe. |
| P03 | A valid job plus an invalid job commits neither. The previous snapshot still rebuilds. |
| P04 | Replacement failure restores the snapshot; an interrupted transaction is detected and recovered or refused. |
| P05 | Detail-to-summary removes stale rows; summary-to-detail adds the expected records once. |
| P06 | Duplicate-resource order does not change the result; conflicting resources give an actionable error. |
| P07 | --refresh detects changed bytes with unchanged metadata; equal bytes change no tracked file. |
| P08 | Fixtures cover missing headers, reordered columns, all shapes, valid zero summary totals, invalid dates, statuses, and duplicate IDs. |
| P09 | A clean tracked-file checkout rebuilds all three bundles offline, including geo.js. |
| P10 | Phase 01 checks pass; the existing corpus retains all row counts and warnings. |
| P11 | Missing legacy fetched_at is displayed as unknown. Two builds have equal input hashes and bundles. |

Document setup and exact check commands. Report source and bundle diffs separately.
