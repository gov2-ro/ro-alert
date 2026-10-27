/* Location analytics view: county drill-down with scoped KPIs, charts, and feed. */

/* Resolved places in a set of alerts: one entry per SIRUTA code, each alert counted once. */
function placeCounts(rows) {
  const counts = new Map();
  for (const a of rows) for (const p of a.places || []) counts.set(p.siruta, (counts.get(p.siruta) || 0) + 1);
  return [...counts.entries()].sort((x, y) => y[1] - x[1] || placeLabel(x[0]).localeCompare(placeLabel(y[0])));
}

const PLACE_CHIPS_SHOWN = 12;

function placeChipHtml(id, cnt) {
  const on = id === state.selectedPlaceId;
  return `<button type="button" class="locality-chip${on ? " active" : ""}" aria-pressed="${on}" data-place="${id}">${esc(placeLabel(id))}<span class="locality-count">${cnt}</span></button>`;
}

/* Local view: a county scope, a place scope, or both. The heading shows the scope even when
   no record remains. Place chips list the resolved places of the alerts that pass the filters
   and the county scope (but not the place choice), so the user can switch place. */
function renderLocation(rows, container) {
  const county = state.selectedCounty;
  const placeId = state.selectedPlaceId;
  const scopeRows = applyFilters(DATA.alerts, { ...state, selectedPlaceId: null });
  const counts = placeCounts(scopeRows);
  const top = counts.slice(0, PLACE_CHIPS_SHOWN);
  if (placeId != null && !top.some(([id]) => id === placeId)) top.push([placeId, counts.find(([id]) => id === placeId)?.[1] || 0]);

  const dates = Stats.dailyCounts(rows).labels;
  const place = placeId != null ? DATA.places.get(placeId) : null;
  const title = place
    ? `${esc(place.name)}${place.county ? ` <span class="location-county-sub">· ${esc(place.county)}</span>` : ""}`
    : esc(county || "");
  const scopeNote = place && county ? `<span class="location-scope">${t("strip_county").replace("%s", esc(county))}</span>` : "";

  container.innerHTML = `<div class="location-view">
    <div class="location-header">
      <button type="button" class="back-btn" id="loc-back-btn" data-i18n="location_back">${t("location_back")}</button>
      <div class="location-titlebox">
        <div class="eyebrow">${t(place ? "loc_kind_place" : "loc_kind_county")}</div>
        <h2 class="location-county-name">${title} <span class="location-county-count">(${fmtN(rows.length)})</span></h2>
      </div>
      ${scopeNote}
    </div>
    ${top.length ? `<div class="place-block"><div class="eyebrow">${t("places_title")}</div>
      <div class="locality-chips" id="locality-chips">${top.map(([id, c]) => placeChipHtml(id, c)).join("")}</div>
      ${counts.length > top.length ? `<details class="place-more" id="place-more"><summary>${t("places_all").replace("%n", counts.length)}</summary>
        <input type="search" id="place-filter" placeholder="${esc(t("places_filter_ph"))}" aria-label="${esc(t("places_filter_ph"))}">
        <div class="locality-chips place-list" id="place-list">${counts.map(([id, c]) => placeChipHtml(id, c)).join("")}</div>
      </details>` : ""}
    </div>` : `<p class="chart-cap">${t("places_none")}</p>`}
    ${rows.length ? `<section class="kpis kpis-3" id="loc-kpis"></section>
    <div class="location-grid">
      <section class="panel">
        <h2 data-i18n="timeline_title">${t("timeline_title")}</h2>
        <div class="chart-box"><canvas id="chart-loc-timeline"></canvas></div>
        <p class="chart-cap">${esc(fill(t("cap_timeline"), { a: dates[0] || "—", b: dates[dates.length - 1] || "—", n: fmtN(rows.length) }))}</p>
      </section>
      <section class="panel">
        <h2 data-i18n="by_category">${t("by_category")}</h2>
        <div class="chart-box"><canvas id="chart-loc-hazard"></canvas></div>
        <p class="chart-cap">${esc(fill(t("cap_hazard"), { n: fmtN(rows.length) }))}</p>
      </section>
      <section class="panel">
        <h2 data-i18n="chart_by_type">${t("chart_by_type")}</h2>
        <div class="chart-box" id="loc-bytype"><canvas id="chart-loc-bytype"></canvas></div>
        <p class="chart-cap">${esc(fill(t("cap_type"), { n: fmtN(rows.filter((a) => a.tip_mesaj).length) }))}</p>
      </section>
    </div>
    ${qualityHtml(rows)}
    <div class="location-feed" id="location-feed"></div>` :
    `<div class="empty-state"><p>${placeId != null ? t("place_zero") : t("no_results")}</p>
       <button type="button" class="link-btn" id="empty-clear">${t("empty_clear")}</button></div>`}
  </div>`;

  if (rows.length) {
    renderLocationKpis(rows);
    renderStackedTimelineChart("chart-loc-timeline", rows);
    renderHazardChart("chart-loc-hazard", rows);
    renderLocByTypeChart("chart-loc-bytype", rows);
    renderLocationFeed(rows);
  } else {
    document.getElementById("empty-clear").addEventListener("click", clearAll);
  }

  document.getElementById("loc-back-btn").addEventListener("click", leaveLocal);

  const chipClick = (e) => {
    const chip = e.target.closest(".locality-chip");
    if (!chip) return;
    const id = Number(chip.dataset.place);
    if (state.selectedPlaceId === id) clearPlace(); else selectPlace(id);
  };
  container.querySelectorAll(".locality-chips").forEach((el) => el.addEventListener("click", chipClick));

  const filter = document.getElementById("place-filter");
  if (filter) {
    filter.addEventListener("input", () => {
      const q = normalizeSearch(filter.value);
      document.querySelectorAll("#place-list .locality-chip").forEach((c) => {
        c.hidden = !!q && !normalizeSearch(c.textContent).includes(q);
      });
    });
  }
}

function renderLocationKpis(rows) {
  const host = document.getElementById("loc-kpis");
  if (!host) return;
  const top = Stats.dominant(rows, "risk_category");
  const cov = mapCoverage(rows);
  host.innerHTML = `
    <div class="kpi"><div class="v">${fmtN(rows.length)}</div><div class="k">${t("ov_selected")}</div></div>
    <div class="kpi accent"><div class="v">${top ? fmtShare(top.share) : "—"}</div><div class="k">${t("kpi_toprisk")}</div><div class="sub">${top ? esc(catLabel(top.value)) + " · " + fmtN(top.n) + " " + t("legend_alerts") : "—"}</div></div>
    <div class="kpi"><div class="v">${fmtN(cov.distinctPlaces)}</div><div class="k">${t("ov_places")}</div><div class="sub">${esc(fill(t("ov_places_sub"), { n: fmtN(cov.withPlace) }))}</div></div>
  `;
}

function renderLocByTypeChart(canvasId, rows) {
  const m = countBy(rows, "tip_mesaj");
  const entries = [...m.entries()].sort((a, b) => b[1] - a[1]);
  const cfg = {
    type: "bar",
    data: {
      labels: entries.map((e) => e[0] || t("none")),
      datasets: [{ data: entries.map((e) => e[1]), backgroundColor: entries.map((_, i) => ["#2a6fc4", "#d93b3b", "#5a9e6f", "#c47a1a", "#8a8a8a"][i % 5]), borderRadius: 3 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, grid: { color: "#e8e3d8" } }, y: { grid: { display: false } } },
    },
  };
  upsert(canvasId, canvasId, cfg);
}

function renderLocationFeed(rows) {
  const host = document.getElementById("location-feed");
  if (!host) return;
  if (!rows.length) {
    host.innerHTML = `<div class="empty-state"><p>${t("feed_no_alerts")}</p></div>`;
    return;
  }
  const sorted = rows.slice().sort((a, b) => (b.sent_at || "").localeCompare(a.sent_at || ""));
  const groups = new Map();
  for (const a of sorted) {
    const d = a.date || (a.sent_at ? a.sent_at.slice(0, 10) : "unknown");
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(a);
  }
  let html = "";
  for (const [date, alerts] of groups) {
    html += `<div class="date-header">${formatDateHeader(date)} · ${alerts.length} ${t("legend_alerts")}</div>`;
    for (const a of alerts) html += feedCardHtml(a);
  }
  host.innerHTML = html;
  host.onclick = feedCardClick;
}
