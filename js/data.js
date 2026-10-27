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
    restoreAlerts(DATA.alerts, DATA.meta.omitted);
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
  restoreAlerts(DATA.alerts, DATA.meta.omitted);
  return DATA;
}

const WEEKDAYS_RO = ["Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"];

/* Put back one omitted key. `segs` is a key path such as ["deliveries[]", "audienta"];
   a segment that ends in "[]" is a list of objects. */
function restoreKey(obj, segs, def) {
  const seg = segs[0];
  const isList = seg.endsWith("[]");
  const key = isList ? seg.slice(0, -2) : seg;
  if (segs.length === 1) {
    if (!(key in obj)) obj[key] = Array.isArray(def) ? [] : def;
    return;
  }
  const child = obj[key];
  if (!child) return;
  if (isList) for (const item of child) restoreKey(item, segs.slice(1), def);
  else restoreKey(child, segs.slice(1), def);
}

/* build_data.py writes a compact bundle. This function restores the old shape, in place:
   - keys with an empty value (null, "" or []) that `omitted` lists (path -> value);
   - `msg`, rebuilt as msg_ro + (msg_sep or " ") + msg_en, when the bundle omits it;
   - `date`, `hour` and `weekday`, derived from `sent_at`. */
function restoreAlerts(alerts, omitted) {
  const paths = Object.entries(omitted || {}).map(([p, def]) => [p.split("."), def]);
  for (const a of alerts) {
    for (const [segs, def] of paths) restoreKey(a, segs, def);
    if (!("msg" in a)) {
      a.msg = a.msg_ro ? (a.msg_en ? a.msg_ro + (a.msg_sep ?? " ") + a.msg_en : a.msg_ro) : null;
    }
    delete a.msg_sep;
    const s = a.sent_at;
    if (s) {
      a.date = s.slice(0, 10);
      a.hour = parseInt(s.slice(11, 13), 10);
      a.weekday = WEEKDAYS_RO[(new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)).getDay() + 6) % 7];
    } else {
      a.date = a.hour = a.weekday = null;
    }
  }
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

/* Percentage of part in total, as a number (0..100). */
function pctRate(part, total) {
  return total ? (part / total) * 100 : 0;
}

/* Display form of a percentage: "<0.1" for small non-zero values, one decimal below 10,
   whole numbers above. So 1 failed alert of 3385 does not read "0%". */
function fmtPct(r) {
  if (r > 0 && r < 0.1) return "<0.1";
  return r < 10 ? String(Math.round(r * 10) / 10) : String(Math.round(r));
}

/* KPI card for delivery failures; empty string when the selection has no reporting month. */
function deliveryKpiHtml(rows) {
  const ds = deliveryStats(rows);
  if (!ds) return "";
  return `<div class="kpi"><div class="v">${ds.failed}</div><div class="k">${t("kpi_delivery_failed")}</div><div class="sub">${fmtPct(ds.rate)}% ${t("of_deliveries")} · ${t("delivery_note")}</div></div>`;
}
