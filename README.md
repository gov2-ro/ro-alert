# RO-ALERT Dashboard

A static, dependency-free dashboard for analyzing 3 months (Feb–Apr 2026) of
**RO-ALERT** public-warning messages (Romania's EU-ALERT / CBS / PWS system).

## Run

```bash
# 1. (Re)build the enriched data from the source CSV
python3 build_data.py

# 2. Serve the project root (fetch() needs HTTP, not file://)
python3 -m http.server 8799

# 3. Open the app
open http://localhost:8799/web/
```

## What it does

- **National view** — KPI cards (total / broadcast / **failed ERROR** / failure rate /
  cancellations / counties / top risk), a **county choropleth** (click a county to filter),
  alerts-per-day timeline, risk-category and top-county charts, and a sortable alerts table
  with a detail drawer (full RO+EN message + every metadata field).
- **Local view** — pick a **județ** (and optionally a locality) to see only locally relevant
  warnings, including failed (ERROR) broadcasts.
- **Sidebar filters** across every field: broadcast status (SENT/ERROR), risk category,
  county, severity, message type (ALERT/CANCEL), primary/associated risk, event code,
  weather color code, channel, initiator, month, date range, and full-text search.
- **Bilingual** RO/EN toggle for all UI labels and message bodies.

## Layout

```
build_data.py                 # CSV -> data/alerts.json + data/meta.json (semantic enrichment)
data/
  alerts.json                 # generated, one enriched record per alert
  meta.json                   # generated, facet lists + per-county counts
  romania-counties.geojson    # vendored județe boundaries (41 + București)
web/
  index.html  css/  js/  vendor/   # the static app (Leaflet + Chart.js vendored)
```

## Data notes

- Source of record: `repository/arhiva-ro-alert/aggregated/csv/mesaje ro-alert gemini.csv`
  (648 alerts; the most complete of the three monthly report formats).
- Column coverage is uneven across the source months — newer-format fields (severity,
  urgency, event code…) are null for older records, which the UI handles gracefully.
- Enrichment derives: county from the ISU initiator code (and meteo county from the title),
  a coarse `risk_category`, weather color code, parsed timestamps, locality extraction, and a
  RO/EN message split. Failed broadcasts (`Status trimitere = ERROR`, ~30%) are kept and
  flagged throughout.
