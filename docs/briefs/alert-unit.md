# Brief: count alerts, not delivery rows

Status: ready for Sonnet. Owner: pax. Author: Opus, 2026-10-27.
Depends on: `docs/briefs/ckan-ingest.md` (merged or on the same branch).

## Problem

April 2026 (shape D) has one row per delivery: one per channel (CBC CMAS, STS) and one per
retry. The other months have one row per alert. So the build counts April about twice, and
the failure-rate KPI counts failed delivery rows.

Measured on `sources/2026-04.csv` (470 rows, 2026-10-27):

| Group key | Groups | Groups with no SENT row |
|---|---|---|
| title + `Data creare` | 216 | 1 |
| title + `Data creare` + `Tip mesaj` | 237 | 1 |

ERROR rows by channel: STS 180, CBC CMAS 16. One alert has 11 rows (an ALERT, its CANCEL,
and 7 failed CANCEL retries). mariuscomper.uk/ro-alert reduced April to 216 alerts in the
same way (see `docs/research/mariuscomper-ro-alert.md`).

## Decision

- One alert is one group of rows with the same title, `Data creare` and `Tip mesaj`. Keep
  ALERT and CANCEL as separate alerts, because the dashboard counts cancellations.
- Months without `Data creare` keep one row per alert, as today.
- An alert gets `deliveries`: a list of `{channel, status, sent_at, audienta}`, one per row.
- `status_ok` is true when at least one delivery is SENT. `status_trimitere` takes the value
  of that best delivery. `sent_at` is the first SENT delivery, else the first row.
- `reports_errors` (per month, from the manifest) goes into `meta.json`, per month.

Cost of the alternative (keep delivery rows): April stays inflated (470 for 237), and the
KPI says 30% failed when 1 of 237 alerts failed.

## Deliverables

1. `build_data.py`: group the rows as above; add `deliveries`; set the fields as above.
   Keep the stable `id` (hash of title, `Data creare`, `Tip mesaj`; or `Identificator unic`).
2. Front end: the failure KPI shows failed alerts, and a delivery-failure figure only for
   months that report ERROR rows, with a note. The drawer lists the deliveries.
3. `docs/ACTIVITY.md` and `docs/BACKLOG.md` entries with the measured numbers.

## Acceptance tests

1. April gives 237 alerts, 1 with `status_ok=false`. Report the totals for all months.
2. The 3,618 rows are all present as deliveries (sum of `len(deliveries)` = 3,618).
3. The other months give the same counts as before (Feb 76, Mar 102, May 618, Jun 1185,
   Jul 610, Aug 557).
4. The KPI and the drawer work in the browser from `file://`. Report the size of
   `data/alerts.js`.

## Stop and ask

Stop and ask before you change the group key, drop the ERROR rows, or change other fields
of the alert object.
