# Related work: mariuscomper.uk/ro-alert

Read on 2026-10-27. Page revised on 2026-10-25. Author: Marius Comper. Data: IGSU via
data.gov.ro, CC BY 4.0, January–July 2026.

## What the page is

A one-page data story, not a dashboard. The headline is: "almost seven in ten alerts
mentioned bears". It has five sections: bears, calendar, bear map, hour of day, sources.
Every chart has a caption that says what the chart does **not** show.

## Their numbers (February–July 2026)

- 2,807 alerts with individual records. January (61) is used only as an official total.
- 1,963 alerts have the label "Animale periculoase"; 1,958 of them contain the word "urs".
- Storms 503 (17.9%), floods 109 (3.9%), missing children 105 (3.7%).
- Alerts per month grow ×19 from January (61) to June (1,185).
- 996 alerts (35.5%) were sent between 20:00 and 23:59.
- Bear map: 920 locality mentions from `Lista poligoane`; 872 (94.8%) resolved without
  ambiguity, into 217 points; 34 had no safe match and 14 were ambiguous in the same county.

## What we take from it

1. **The unit is the alert, not the delivery row.** April 2026 has one row per channel
   (CBC/CMAS and STS) and per retry. They reduce 470 rows to 216 alerts by alert name and
   `Data creare`, and keep a SENT row where one exists. We measured the same file:
   216 groups by name and `Data creare`; 237 groups when ALERT and CANCEL stay separate;
   only 1 group has no SENT row. Our "30% failed" KPI counts failed delivery rows, mostly on
   the STS channel (180 of 196). It does not count failed alerts. See
   `docs/briefs/alert-unit.md`.
2. **Geocode from `Lista poligoane`, not from the message text.** The field is structured
   (`1-ARGES`, locality names) and gave them 94.8% unambiguous matches. Our extractor reads
   the message text. Use their numbers as the target for the SIRUTA step in the backlog.
3. **Separate official totals from individual records.** Shape S months (summary only) can
   still give a monthly total in the timeline, marked as "official summary".
4. **Say what a chart does not show.** For example: a bear-map point is the locality of the
   alert area, not the place of the sighting; the send hour is not the sighting hour.
5. **Story candidates for the dashboard:** the share of bear alerts, the evening peak, and
   the "Craiova exception" (14 mentions, 13 of them missing-children alerts from ISU Dolj).

## Where we differ

- We are an explorer (filters, table, feed, county drill-down); they are a narrative.
- We have August 2026 (557 rows), which they do not have yet.
- We keep the ERROR delivery rows, as delivery detail under one alert, after the
  alert-unit change.
