/* Dashboard view. Reading order: overview, map beside the timeline, distributions, reporting quality.
   The coverage bar and the active strip sit above the view (index.html, app.js). */

function renderDashboard(rows, container) {
  const nat = rows.filter((a) => a.scope === "national").length;
  const countyScoped = rows.length - nat;
  const dates = Stats.dailyCounts(rows).labels;
  container.innerHTML = `
    <section class="kpis kpis-3" id="kpis"></section>
    <div class="grid grid-map">
      <section class="panel map-panel">
        <h2 data-i18n="map_title">${t("map_title")}</h2>
        <div class="map-mode" id="map-mode" role="group" aria-label="${esc(t("map_mode_label"))}">
          <span class="map-mode-label" aria-hidden="true">${esc(t("map_mode_label"))}</span>
          <button type="button" class="seg active" data-map-mode="counties" aria-pressed="true">${esc(t("map_mode_counties"))}</button>
          <button type="button" class="seg" data-map-mode="places" aria-pressed="false">${esc(t("map_mode_places"))}</button>
        </div>
        <div id="map" role="group" aria-label="${esc(t("map_label"))}"></div>
        <div class="legend" id="map-legend"></div>
        <div class="map-hint" id="map-hint">${esc(t("map_tap_hint"))}</div>
        <div class="map-coverage chart-cap" id="map-coverage"></div>
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
        <div class="chart-box grow"><canvas id="chart-timeline"></canvas></div>
        <p class="chart-cap">${esc(fill(t("cap_timeline"), { a: dates[0] || "—", b: dates[dates.length - 1] || "—", n: fmtN(rows.length) }))}</p>
      </section>
    </div>
    <div class="grid grid-3">
      <section class="panel">
        <h2 data-i18n="by_category">${t("by_category")}</h2>
        <div class="chart-box"><canvas id="chart-hazard"></canvas></div>
        <p class="chart-cap">${esc(fill(t("cap_hazard"), { n: fmtN(rows.length) }))}</p>
      </section>
      <section class="panel">
        <h2 data-i18n="chart_hour">${t("chart_hour")}</h2>
        <div class="chart-box"><canvas id="chart-hour"></canvas></div>
        <p class="chart-cap">${esc(fill(t("cap_hour"), { n: fmtN(rows.filter((a) => a.sent_at).length) }))} ${esc(t("chart_zero_note"))}</p>
      </section>
      <section class="panel">
        <h2 data-i18n="chart_authority">${t("chart_authority")}</h2>
        <div class="chart-box"><canvas id="chart-authority"></canvas></div>
        <p class="chart-cap">${esc(fill(t("cap_authority"), { n: fmtN(rows.length) }))}</p>
      </section>
    </div>
    <section class="panel panel-wide">
      <h2 data-i18n="by_judet">${t("by_judet")}</h2>
      <div class="chart-box tall"><canvas id="chart-topcounties"></canvas></div>
      <p class="chart-cap">${esc(fill(t("cap_counties"), { c: fmtN(countyScoped), nat: fmtN(nat) }))}</p>
    </section>
    ${qualityHtml(rows)}`;

  renderDashboardKpis(rows);
  if (!RoMap.map) initMap(DATA.geo);
  updateMap(rows, null);
  document.getElementById("map-mode").addEventListener("click", (e) => {
    const b = e.target.closest("[data-map-mode]");
    if (b) setMapMode(b.dataset.mapMode);
  });
  renderMapList(rows);
  renderStackedTimelineChart("chart-timeline", rows);
  renderHazardChart("chart-hazard", rows);
  renderTopCountiesChart("chart-topcounties", rows);
  renderHourChart("chart-hour", rows);
  renderAuthorityChart("chart-authority", rows);
}

/* The compact overview: how many alerts, the dominant risk with its share, and how many
   issuing counties the selection spans. Counts of messages, not of incidents. */
function renderDashboardKpis(rows) {
  const host = document.getElementById("kpis");
  if (!host) return;
  const top = Stats.dominant(rows, "risk_category");
  const counties = new Set(rows.filter((a) => a.scope === "county" && a.judet).map((a) => a.judet)).size;
  const all = Object.keys(DATA.meta.judet_counts || {}).length;
  host.innerHTML = `
    <div class="kpi"><div class="v">${fmtN(rows.length)}</div><div class="k">${t("ov_selected")}</div><div class="sub">${esc(fill(t("ov_selected_sub"), { n: fmtN(DATA.meta.total) }))}</div></div>
    <div class="kpi accent"><div class="v">${top ? fmtShare(top.share) : "—"}</div><div class="k">${t("kpi_toprisk")}</div><div class="sub">${top ? esc(catLabel(top.value)) + " · " + fmtN(top.n) + " " + t("legend_alerts") : "—"}</div></div>
    <div class="kpi"><div class="v">${counties}</div><div class="k">${t("kpi_counties")}</div><div class="sub">${esc(fill(t("ov_counties_sub"), { n: all }))}</div></div>
  `;
}

/* The map's equivalent for a keyboard: counties and canonical places as buttons. A county
   button opens the Local view like a map click; a place button selects the place by SIRUTA.
   The lists serve both map modes. */
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
