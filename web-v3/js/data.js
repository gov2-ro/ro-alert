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
    fetch("../data/alerts.json").then((r) => r.json()),
    fetch("../data/meta.json").then((r) => r.json()),
    fetch("../data/romania-counties.geojson").then((r) => r.json()),
  ]);
  DATA.alerts = alerts;
  DATA.meta = meta;
  DATA.geo = geo;
  return DATA;
}
