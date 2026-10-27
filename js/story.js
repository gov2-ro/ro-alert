/* "Pe scurt" view: a short story of the current selection, plus sources and method.
   Every figure comes from `rows` (the filtered alerts), except the official monthly totals,
   which have no alerts and show only when no filter is active. */

/* Same rule as BEAR_RE in build_data.py, on the Romanian text without diacritics. */
const BEAR_RE = /\burs(?:ul|ului|ule|i|ii|ilor|oaic\w*)?\b/;

function stripDiacritics(s) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function isBearAlert(a) {
  return BEAR_RE.test(stripDiacritics(a.msg_ro || a.msg || ""));
}

/* Month keys ("2025-09" ...) from the first to the last month in META.months. */
function storyMonthKeys() {
  const keys = ((DATA.meta && DATA.meta.months) || []).map((m) => m.key).sort();
  if (!keys.length) return [];
  const out = [];
  let [y, m] = keys[0].split("-").map(Number);
  const [ey, em] = keys[keys.length - 1].split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

/* Pure figures for a selection. `withOfficial` adds the official months. */
function storyStats(rows, withOfficial) {
  const n = rows.length;
  const keys = storyMonthKeys();
  const official = {};
  for (const m of (DATA.meta.months || [])) if (m.official) official[m.key] = m;
  const alertsBy = {}, bearBy = {}, stormBy = {};
  let bear = 0, evening = 0, withHour = 0, failedAlerts = 0;
  const places = new Map();
  for (const a of rows) {
    const k = (a.source_file || "").slice(0, 7);
    alertsBy[k] = (alertsBy[k] || 0) + 1;
    const b = isBearAlert(a);
    if (b) { bear++; bearBy[k] = (bearBy[k] || 0) + 1; }
    if (a.risc_asociat === "Furtuni") stormBy[k] = (stormBy[k] || 0) + 1;
    if (a.hour != null) { withHour++; if (a.hour >= 20) evening++; }
    if (a.status_ok === false) failedAlerts++;
    for (const p of a.places || []) {
      let e = places.get(p.siruta);
      if (!e) { e = { name: p.name, judet: null, n: 0, risks: new Map() }; places.set(p.siruta, e); }
      if (!e.judet && a.scope === "county") e.judet = a.judet;
      e.n++;
      e.risks.set(a.risk_category, (e.risks.get(a.risk_category) || 0) + 1);
    }
  }
  const months = keys.map((k) => {
    const o = withOfficial ? official[k] : null;
    const has = (DATA.meta.months || []).some((m) => m.key === k);
    if (o) {
      return { key: k, kind: "official", alerts: o.alerts,
               bear: (o.by_risk || {})["animale periculoase"] || 0, storm: (o.by_risk || {})["furtuni"] || 0 };
    }
    if (official[k] || !has) return { key: k, kind: has ? "hidden" : "gap", alerts: null, bear: null, storm: null };
    return { key: k, kind: "records", alerts: alertsBy[k] || 0, bear: bearBy[k] || 0, storm: stormBy[k] || 0 };
  });
  // change against the previous calendar month; none when that month has no figure
  months.forEach((m, i) => {
    const p = i ? months[i - 1] : null;
    m.change = (m.alerts != null && p && p.alerts) ? ((m.alerts - p.alerts) / p.alerts) * 100 : null;
  });
  const topPlaces = [...places.values()]
    .sort((x, y) => y.n - x.n || x.name.localeCompare(y.name))
    .slice(0, 10)
    .map((e) => ({ name: e.name, judet: e.judet, n: e.n,
                   risk: [...e.risks.entries()].sort((x, y) => y[1] - x[1])[0][0] }));
  return { n, bear, bearPct: pctRate(bear, n), evening, withHour, eveningPct: pctRate(evening, withHour),
           failedAlerts, months, topPlaces };
}

function fmtChange(c) {
  if (c == null) return "—";
  return (c > 0 ? "+" : "") + Math.round(c) + "%";
}

function storyCap(key) { return `<p class="chart-cap">${t(key)}</p>`; }

function renderStory(rows, container) {
  const withOfficial = !hasActiveFilters(state);
  const S = storyStats(rows, withOfficial);
  const failBody = `${failureLinesHtml(rows)}<p class="chart-cap">${t("story_fail_note")}</p>`;

  const changeCells = S.months.map((m) => {
    const lab = m.kind === "gap" ? t("story_no_file") : m.kind === "hidden" ? "—" : fmtChange(m.change);
    const cls = m.change == null ? "" : m.change > 0 ? "up" : "down";
    return `<div class="chg ${cls}"><span class="chg-m">${m.key}</span><span class="chg-v">${lab}</span></div>`;
  }).join("");

  const placeRows = S.topPlaces.map((p) =>
    `<tr><td>${esc(p.name)}</td><td>${esc(p.judet || "—")}</td><td class="num">${p.n}</td>` +
    `<td><span class="dot" style="background:${catColor(p.risk)}"></span>${esc(p.risk || "—")}</td></tr>`).join("");

  container.innerHTML = `
    <section class="kpis">
      <div class="kpi accent"><div class="v">${fmtPct(S.bearPct)}%</div><div class="k">${t("story_bear_share")}</div>
        <div class="sub">${t("story_bear_sub").replace("%n", S.n).replace("%b", S.bear)}</div></div>
      <div class="kpi"><div class="v">${fmtPct(S.eveningPct)}%</div><div class="k">${t("story_evening_share")}</div>
        <div class="sub">${t("story_evening_sub").replace("%e", S.evening).replace("%n", S.withHour)}</div></div>
      <div class="kpi err"><div class="v">${S.failedAlerts}</div><div class="k">${t("story_failed_alerts")}</div>
        <div class="sub">${t("story_failed_sub")}</div></div>
    </section>
    <div class="grid grid-2">
      <section class="panel">
        <h2>${t("story_monthly_title")}</h2>
        <div class="chart-box"><canvas id="chart-story-monthly"></canvas></div>
        ${storyCap("story_monthly_cap")}
        <h3 class="sub-h">${t("story_change_title")}</h3>
        <div class="chg-strip">${changeCells}</div>
      </section>
      <section class="panel">
        <h2>${t("story_hazards_title")}</h2>
        <div class="chart-box"><canvas id="chart-story-hazards"></canvas></div>
        ${storyCap("story_hazards_cap")}
      </section>
      <section class="panel">
        <h2>${t("story_hour_title")}</h2>
        <div class="chart-box"><canvas id="chart-story-hour"></canvas></div>
        ${storyCap("story_hour_cap")}
      </section>
      <section class="panel">
        <h2>${t("story_places_title")}</h2>
        <table class="story-table"><thead><tr><th>${t("story_col_place")}</th><th>${t("story_col_county")}</th><th class="num">${t("story_col_alerts")}</th><th>${t("story_col_risk")}</th></tr></thead>
          <tbody>${placeRows || `<tr><td colspan="4">—</td></tr>`}</tbody></table>
        ${storyCap("story_places_cap")}
      </section>
    </div>
    <section class="panel story-fail"><h2>${t("story_fail_title")}</h2>${failBody}</section>
    ${sourcesHtml()}`;

  renderStoryCharts(S, rows);
}

function storyAxisLabels(S) {
  return S.months.map((m) => m.kind === "gap" ? [m.key, t("story_no_file")] : m.kind === "official" ? [m.key, t("story_official")] : m.key);
}

/* Diagonal-stripe fill for the official bars. */
function hatch(color) {
  const c = document.createElement("canvas"); c.width = c.height = 8;
  const x = c.getContext("2d");
  x.fillStyle = "#faf8f1"; x.fillRect(0, 0, 8, 8);
  x.strokeStyle = color; x.lineWidth = 2;
  x.beginPath(); x.moveTo(-2, 10); x.lineTo(10, -2); x.stroke();
  return x.createPattern(c, "repeat");
}

function renderStoryCharts(S, rows) {
  const labels = storyAxisLabels(S);
  const isOff = (i) => S.months[i].kind === "official";
  const blue = "#2a6fc4", brown = catColor("Animale periculoase"), stormC = catColor("Meteo");
  const common = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } }, y: { beginAtZero: true, grid: { color: "#e8e3d8" } } },
  };
  upsert("story-monthly", "chart-story-monthly", {
    type: "bar",
    data: { labels, datasets: [{
      data: S.months.map((m) => m.alerts),
      backgroundColor: S.months.map((m, i) => isOff(i) ? hatch(blue) : blue),
      borderColor: blue, borderWidth: S.months.map((m, i) => isOff(i) ? 1 : 0), borderRadius: 3,
    }] },
    options: common,
  });
  const bearD = S.months.map((m) => m.bear), stormD = S.months.map((m) => m.storm);
  upsert("story-hazards", "chart-story-hazards", {
    type: "bar",
    data: { labels, datasets: [
      { label: t("story_bear_label"), data: bearD, borderRadius: 3, borderColor: brown, borderWidth: S.months.map((m, i) => isOff(i) ? 1 : 0),
        backgroundColor: S.months.map((m, i) => isOff(i) ? hatch(brown) : brown) },
      { label: t("story_storm_label"), data: stormD, borderRadius: 3, borderColor: stormC, borderWidth: S.months.map((m, i) => isOff(i) ? 1 : 0),
        backgroundColor: S.months.map((m, i) => isOff(i) ? hatch(stormC) : stormC) },
    ] },
    options: { ...common, plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 11 } } } } },
  });
  const hours = new Array(24).fill(0);
  for (const a of rows) if (a.hour != null) hours[a.hour]++;
  upsert("story-hour", "chart-story-hour", {
    type: "bar",
    data: { labels: hours.map((_, i) => i + ":00"),
            datasets: [{ data: hours, borderRadius: 3, backgroundColor: hours.map((_, i) => i >= 20 ? blue : "#7ab0e0") }] },
    options: { ...common, scales: { ...common.scales, x: { grid: { display: false }, ticks: { maxTicksLimit: 12, font: { size: 10 } } } } },
  });
}

/* Sources and method: one line per manifest entry (META.sources). */
function sourcesHtml() {
  const m = DATA.meta;
  const src = m.sources || [];
  const lic = `<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>`;
  const lines = src.map((s) => {
    // Shape D is a raw export. Only a month with more deliveries than alerts (2026-04) has
    // one row per delivery; the other shape-D months have one row per alert.
    const mo = (m.months || []).find((x) => x.key === s.month);
    const perDelivery = s.shape === "D" && mo && mo.deliveries > mo.alerts;
    const shape = t("sources_shape_" + (s.shape === "D" && !perDelivery ? "R" : s.shape));
    const rows = s.shape === "S"
      ? `${t("sources_total")} ${s.grand_total}`
      : `${s.rows} ${t("sources_rows")}` + (s.grand_total != null && s.shape === "R" ? `, ${t("sources_total")} ${s.grand_total}` : "");
    const fetched = s.fetched_at ? s.fetched_at.slice(0, 10) : t("sources_unknown");
    const warn = (s.warnings || []).map((w) => ` <span class="badge cancel">${t("sources_warning")}: ${esc(w)}</span>`).join("");
    return `<li><b>${esc(s.month)}</b> · ${esc(shape)} · ${rows} · ` +
      `${t("sources_modified")} ${esc(s.last_modified ? s.last_modified.slice(0, 10) : t("sources_unknown"))} · ` +
      `${t("sources_fetched")} ${esc(fetched)} · ` +
      `<a href="https://data.gov.ro/dataset/${encodeURIComponent(s.dataset)}" target="_blank" rel="noopener">${esc(s.dataset)}</a>${warn}</li>`;
  }).join("");
  const have = new Set((m.months || []).map((x) => x.key));
  const gaps = storyMonthKeys().filter((k) => !have.has(k)).join(", ");
  const last = m.last_modified ? m.last_modified.slice(0, 10) : "—";
  return `<section class="panel story-sources">
    <h2>${t("sources_title")}</h2>
    <p>${t("sources_intro").replace("%l", lic)}</p>
    <ul class="src-list">${lines}</ul>
    ${gaps ? `<p class="chart-cap">${t("sources_missing").replace("%k", esc(gaps))}</p>` : ""}
    <p>${t("sources_last").replace("%d", esc(last))}</p>
    <p>${t("sources_method")}</p>
    <p><b>${t("sources_related")}:</b> ${t("sources_related_text")} <a href="https://mariuscomper.uk/ro-alert" target="_blank" rel="noopener">mariuscomper.uk/ro-alert</a></p>
  </section>`;
}
