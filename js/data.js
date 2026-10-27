/* Loads the enriched datasets. Exposes window.DATA = {alerts, meta, geo}. */
const DATA = { alerts: [], meta: null, geo: null, places: new Map(), placeNameCount: new Map() };

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
    indexPlaces(DATA.alerts);
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
  indexPlaces(DATA.alerts);
  return DATA;
}

/* Index of resolved places by SIRUTA code: canonical name, county, coordinates. `n` counts the
   alerts that name the place (an alert names a code at most once). `placeNameCount` counts
   the distinct codes behind each name, to know when a name needs its county. */
function indexPlaces(alerts) {
  DATA.places = new Map();
  DATA.placeNameCount = new Map();
  for (const a of alerts) {
    for (const p of a.places || []) {
      let e = DATA.places.get(p.siruta);
      if (!e) {
        e = { siruta: p.siruta, name: p.name, county: p.county || null, lat: p.lat, lon: p.lon, n: 0 };
        DATA.places.set(p.siruta, e);
        DATA.placeNameCount.set(p.name, (DATA.placeNameCount.get(p.name) || 0) + 1);
      }
      e.n++;
    }
  }
}

/* Display name of a resolved place. The county follows the name when another place has the
   same name, or when `always` is true. Returns "" for an unknown code. */
function placeLabel(siruta, always) {
  const e = DATA.places.get(Number(siruta));
  if (!e) return "";
  const clash = (DATA.placeNameCount.get(e.name) || 0) > 1;
  return e.county && (clash || always) ? `${e.name} (${e.county})` : e.name;
}

/* The text of an alert in the requested language, with the reason when it is not that language.
   Returns {text, shown, fallback}: shown is "ro", "en" or "original"; fallback is "missing"
   (the requested language has no text and an original of another language is shown),
   "unsplit" (the original could not be split by language) or null. */
function messageView(a, lang) {
  const original = a.msg || a.msg_ro || a.msg_en || "";
  const want = lang === "en" ? a.msg_en : a.msg_ro;
  if (want) return { text: want, shown: lang === "en" ? "en" : "ro", fallback: null };
  const l = a.message_language;
  if (l === "mixed" || l === "unknown") return { text: original, shown: "original", fallback: "unsplit" };
  return { text: original, shown: "original", fallback: "missing" };
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
   - `msg`, rebuilt as msg_ro + (msg_sep or " ") + msg_en (or msg_en alone for English-only
     text), when the bundle omits it;
   - `date`, `hour` and `weekday`, derived from `sent_at`. */
function restoreAlerts(alerts, omitted) {
  const paths = Object.entries(omitted || {}).map(([p, def]) => [p.split("."), def]);
  for (const a of alerts) {
    for (const [segs, def] of paths) restoreKey(a, segs, def);
    if (!("msg" in a)) {
      a.msg = a.msg_ro ? (a.msg_en ? a.msg_ro + (a.msg_sep ?? " ") + a.msg_en : a.msg_ro) : (a.msg_en || null);
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

/* Failure figures for a selection, with the labels every view shows.
   One source for the Dashboard, Local, Feed, sidebar and "Pe scurt" views.
   The data proves observed statuses, not receipt on a device. A rate exists only for
   the reporting sample: the selected alerts from months with `error_reporting` "observed". */
function failureCoverage(rows) {
  const s = Stats.selectionStats(rows, (DATA.meta && DATA.meta.months) || []);
  const months = s.reportingMonths.join(", ");
  const share = (n, d, r) => (r == null ? null : { text: `${n} / ${d}`, pct: `${fmtPct(r)}%` });
  return {
    stats: s, months, observed: s.failedAlerts,
    alerts: share(s.reportingFailedAlerts, s.reportingAlerts, s.alertRate),
    deliveries: share(s.reportingErrorDeliveries, s.reportingDeliveries, s.deliveryRate),
  };
}

function failureSub(share, months) {
  return t("fail_sample_sub").replace("%p", share.pct).replace("%m", esc(months));
}

/* KPI cards for the failure figures: the observed count, then the sample shares
   (or one card that says the coverage is unknown). */
function failureKpisHtml(rows) {
  const c = failureCoverage(rows);
  const head = `<div class="kpi err"><div class="v">${c.observed}</div><div class="k">${t("kpi_failed")}</div><div class="sub">${t("fail_observed_sub")}</div></div>`;
  if (!c.alerts) {
    return head + `<div class="kpi"><div class="v">—</div><div class="k">${t("fail_unknown")}</div><div class="sub">${t("fail_unknown_sub")}</div></div>`;
  }
  return head +
    `<div class="kpi"><div class="v">${c.alerts.text}</div><div class="k">${t("fail_sample_alerts")}</div><div class="sub">${failureSub(c.alerts, c.months)}</div></div>` +
    `<div class="kpi"><div class="v">${c.deliveries.text}</div><div class="k">${t("fail_sample_deliv")}</div><div class="sub">${failureSub(c.deliveries, c.months)}</div></div>`;
}

/* The same figures as short text lines, for panels that have no room for cards. */
function failureLinesHtml(rows) {
  const c = failureCoverage(rows);
  const observed = `<p>${t("fail_observed_line").replace("%n", c.observed)}</p>`;
  if (!c.alerts) return observed + `<p>${t("fail_unknown_line")}</p><p class="chart-cap">${t("fail_caveat")}</p>`;
  const line = t("fail_sample_line").replace("%m", esc(c.months))
    .replace("%a", c.alerts.text).replace("%ap", c.alerts.pct)
    .replace("%d", c.deliveries.text).replace("%dp", c.deliveries.pct);
  return `${observed}<p>${line}</p><p class="chart-cap">${t("fail_caveat")}</p>`;
}
