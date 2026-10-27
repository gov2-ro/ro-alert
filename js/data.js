/* Loads the enriched datasets. Exposes window.DATA = {alerts, meta, geo}. */
const DATA = { alerts: [], meta: null, geo: null };

/* Normalize a county name to a diacritic-free lowercase key so data județe
   ("Argeș", "București-Ilfov") match GeoJSON names ("Arges", "Bucuresti"). */
function countyKey(name) {
  if (!name) return "";
  let s = name.toLowerCase()
    .replace(/ș|ş/g, "s").replace(/ț|ţ/g, "t")
    .replace(/ă/g, "a").replace(/â/g, "a").replace(/î/g, "i");
  // București-Ilfov in the data maps onto the Bucuresti feature
  if (s.startsWith("bucuresti")) s = "bucuresti";
  return s;
}

/* Data is embedded as JS globals (window.ALERTS / META / GEO) via the
   data/*.js bundles, so the app runs straight from the filesystem (file://)
   with no server. Falls back to fetching the JSON if the globals are absent. */
async function loadData() {
  if (window.ALERTS && window.META && window.GEO) {
    DATA.alerts = window.ALERTS;
    DATA.meta = window.META;
    DATA.geo = window.GEO;
    return DATA;
  }
  const [alerts, meta, geo] = await Promise.all([
    fetch("data/alerts.json").then((r) => r.json()),
    fetch("data/meta.json").then((r) => r.json()),
    fetch("data/romania-counties.geojson").then((r) => r.json()),
  ]);
  DATA.alerts = alerts;
  DATA.meta = meta;
  DATA.geo = geo;
  return DATA;
}

/* Delivery figures for a selection of alerts. An alert is one message; a delivery is one
   channel or retry row of it. Only months with `reports_errors` in META.months report
   ERROR deliveries, so the figures cover those months only.
   Returns null when the selection holds no such month. */
function deliveryStats(rows) {
  const months = (DATA.meta && DATA.meta.months) || [];
  const reporting = new Set(months.filter((m) => m.reports_errors).map((m) => m.label));
  let total = 0, failed = 0, n = 0;
  for (const a of rows) {
    if (!reporting.has(a.month)) continue;
    n++;
    for (const d of a.deliveries || []) {
      total++;
      if (d.status === "ERROR") failed++;
    }
  }
  if (!n) return null;
  return { total, failed, rate: pctRate(failed, total) };
}

/* Percentage for display: one decimal below 10%, so that 1 of 3385 does not read "0%". */
function pctRate(part, total) {
  if (!total) return 0;
  const r = (part / total) * 100;
  return r < 10 ? Math.round(r * 10) / 10 : Math.round(r);
}

/* KPI card for delivery failures; empty string when the selection has no reporting month. */
function deliveryKpiHtml(rows) {
  const ds = deliveryStats(rows);
  if (!ds) return "";
  return `<div class="kpi"><div class="v">${ds.failed}</div><div class="k">${t("kpi_delivery_failed")}</div><div class="sub">${ds.rate}% ${t("of_deliveries")} · ${t("delivery_note")}</div></div>`;
}
