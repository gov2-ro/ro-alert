/* Dashboard view: KPI cards + chart grid + map. */

function renderDashboard(rows, container) {
  container.innerHTML = `
    <section class="kpis" id="kpis"></section>
    <div class="grid">
      <section class="panel map-panel">
        <h2 data-i18n="map_title">${t("map_title")}</h2>
        <div id="map" role="group" aria-label="${esc(t("map_label"))}"></div>
        <div class="legend" id="map-legend"></div>
        <div class="map-hint" data-i18n="map_tap_hint">${t("map_tap_hint")}</div>
        <div class="map-hint" data-i18n="map_places_note">${t("map_places_note")}</div>
        <details class="map-list" id="map-list"><summary>${esc(t("map_list_summary"))}</summary>
          <h3 class="sub-h">${esc(t("map_list_counties"))}</h3>
          <ul class="county-list" id="county-list"></ul>
          <h3 class="sub-h">${esc(t("map_list_places"))}</h3>
          <input type="search" id="map-place-filter" aria-label="${esc(t("map_list_filter"))}" placeholder="${esc(t("map_list_filter"))}" autocomplete="off">
          <ul class="county-list" id="place-pick"></ul>
        </details>
      </section>
      <section class="panel">
        <h2 data-i18n="timeline_title">${t("timeline_title")}</h2>
        <div class="chart-box"><canvas id="chart-timeline"></canvas></div>
      </section>
      <section class="panel">
        <h2 data-i18n="by_category">${t("by_category")}</h2>
        <div class="chart-box"><canvas id="chart-hazard"></canvas></div>
      </section>
    </div>
    <div class="grid grid-3" style="margin-bottom:20px">
      <section class="panel">
        <h2 data-i18n="chart_reliability">${t("chart_reliability")}</h2>
        <div class="fail-text" id="fail-text"></div>
      </section>
      <section class="panel">
        <h2 data-i18n="chart_hour">${t("chart_hour")}</h2>
        <div class="chart-box"><canvas id="chart-hour"></canvas></div>
      </section>
      <section class="panel">
        <h2 data-i18n="chart_authority">${t("chart_authority")}</h2>
        <div class="chart-box"><canvas id="chart-authority"></canvas></div>
      </section>
    </div>
    <section class="panel">
      <h2 data-i18n="by_judet">${t("by_judet")}</h2>
      <div class="chart-box tall"><canvas id="chart-topcounties"></canvas></div>
    </section>`;

  renderDashboardKpis(rows);
  if (!RoMap.map) initMap(DATA.geo);
  updateMap(rows, null);
  renderMapList(rows);
  renderStackedTimelineChart("chart-timeline", rows);
  renderHazardChart("chart-hazard", rows);
  document.getElementById("fail-text").innerHTML = failureLinesHtml(rows);
  renderTopCountiesChart("chart-topcounties", rows);
  renderHourChart("chart-hour", rows);
  renderAuthorityChart("chart-authority", rows);
}

function renderDashboardKpis(rows) {
  const host = document.getElementById("kpis");
  if (!host) return;
  const total = rows.length;
  const sent = rows.filter((a) => a.status_ok === true).length;
  const catM = countBy(rows, "risk_category");
  const topCat = [...catM.entries()].sort((a, b) => b[1] - a[1])[0];
  host.innerHTML = `
    <div class="kpi"><div class="v">${total}</div><div class="k">${t("kpi_total")}</div></div>
    <div class="kpi accent"><div class="v">${topCat ? topCat[1] : 0}</div><div class="k">${t("kpi_toprisk")}</div><div class="sub">${topCat ? esc(catLabel(topCat[0])) : "—"}</div></div>
    <div class="kpi"><div class="v">${sent}</div><div class="k">${t("kpi_sent")}</div></div>
    ${failureKpisHtml(rows)}
  `;
}

/* The map's equivalent for a keyboard: counties and canonical places as buttons. A county
   button opens the Local view like a map click; a place button selects the place by SIRUTA. */
function renderMapList(rows) {
  const counties = new Map();
  for (const a of rows) if (a.scope === "county" && a.judet) counties.set(a.judet, (counties.get(a.judet) || 0) + 1);
  const list = document.getElementById("county-list");
  list.innerHTML = [...counties.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([j, n]) => `<li><button type="button" class="map-pick" data-county="${esc(j)}">${esc(j)} <span class="locality-count">${n}</span></button></li>`).join("");
  list.onclick = (e) => { const b = e.target.closest("[data-county]"); if (b) onCountyClick(b.dataset.county); };

  const places = placeCounts(rows);
  const host = document.getElementById("place-pick");
  const input = document.getElementById("map-place-filter");
  const draw = () => {
    const q = normalizeSearch(input.value);
    const hits = places.filter(([id]) => !q || normalizeSearch(placeLabel(id, true)).includes(q)).slice(0, 30);
    host.innerHTML = hits.length
      ? hits.map(([id, n]) => `<li><button type="button" class="map-pick" data-place="${id}">${esc(placeLabel(id, true))} <span class="locality-count">${n}</span></button></li>`).join("")
      : `<li class="chart-cap">${esc(t("map_list_none"))}</li>`;
  };
  input.oninput = draw;
  host.onclick = (e) => { const b = e.target.closest("[data-place]"); if (b) selectPlace(Number(b.dataset.place)); };
  draw();
}
