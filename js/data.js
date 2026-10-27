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

/* Replace %x tokens in a dictionary string. Tokens are lower-case letters ("%n", "%nat"). */
function fill(str, vals) {
  return String(str).replace(/%([a-z]+)/g, (m, k) => (k in vals ? vals[k] : m));
}

/* Number in the UI language: "3.385" in Romanian, "3,385" in English. */
function fmtN(n) {
  return Number(n).toLocaleString(state.lang === "en" ? "en-GB" : "ro-RO", { maximumFractionDigits: 0, useGrouping: true });
}

/* Percentage text for a share (0..100) or null: "41.1%" or "—". */
function fmtShare(r) {
  if (r == null) return "—";
  return (Math.round(r * 10) / 10).toFixed(1) + "%";
}

/* The delivery-reporting section, drawn once per view. It states the observed failure count,
   the reporting sample with its denominators, how many alerts fall outside that sample, one
   short limit, and a disclosure with the longer method. */
function qualityHtml(rows, opts = {}) {
  const c = failureCoverage(rows);
  const observed = `<p>${t("fail_observed_line").replace("%n", c.observed)}</p>`;
  const sample = c.alerts
    ? `<p>${t("fail_sample_line").replace("%m", esc(c.months)).replace("%a", c.alerts.text).replace("%ap", c.alerts.pct)
        .replace("%d", c.deliveries.text).replace("%dp", c.deliveries.pct)}</p>`
    : `<p>${t("fail_unknown_line")}</p>`;
  const unk = c.stats.unknownAlerts;
  const unknown = `<p>${unk ? t("q_unknown").replace("%u", fmtN(unk)) : t("q_all_known")}</p>`;
  return `<section class="panel quality" id="quality"><h2>${t("q_title")}</h2>
    <div class="fail-text">${observed}${sample}${unknown}</div>
    <p class="chart-cap">${t("q_limit")}</p>
    <details class="q-details"><summary>${t("q_details")}</summary>
      <p>${t("fail_caveat")}</p><p>${t("story_fail_note")}</p>
      <p><button type="button" class="link-btn" data-goto-sources>${t("cov_method")}</button></p>
    </details>
  </section>`;
}

/* The coverage bar above every view: what the detail records cover, the current selection,
   the source freshness (source modification apart from fetch time) and the method link. */
function coverageHtml(selected) {
  const m = DATA.meta;
  if (!m || !m.date_min) return "";
  const f = (iso) => monthName(+iso.slice(5, 7)).toLowerCase();
  const y0 = m.date_min.slice(0, 4), y1 = m.date_max.slice(0, 4);
  const period = y0 === y1 ? `${f(m.date_min)}–${f(m.date_max)} ${y1}` : `${f(m.date_min)} ${y0}–${f(m.date_max)} ${y1}`;
  const fetched = (m.sources || []).map((s) => s.fetched_at).filter(Boolean).sort().pop();
  return `<p class="cov-line">${esc(fill(t("cov_records"), { n: fmtN(m.total), p: period }))} ` +
    `<b>${esc(fill(t("cov_selected"), { s: fmtN(selected), n: fmtN(m.total) }))}</b></p>` +
    `<p class="cov-line cov-source">${esc(fill(t("cov_source"), { m: m.last_modified ? m.last_modified.slice(0, 10) : t("cov_unknown"), f: fetched ? fetched.slice(0, 10) : t("cov_unknown") }))} ` +
    `${esc(t("cov_independent"))} <button type="button" class="link-btn" data-goto-sources>${t("cov_method")}</button></p>`;
}
