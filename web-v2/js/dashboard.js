/* Dashboard view: KPI cards + chart grid + map. */

function renderDashboard(rows, container) {
  container.innerHTML = `
    <section class="kpis" id="kpis"></section>
    <div class="grid">
      <section class="panel map-panel">
        <h2 data-i18n="map_title">${t("map_title")}</h2>
        <div id="map"></div>
        <div class="legend" id="map-legend"></div>
        <div class="map-hint" data-i18n="map_tap_hint">${t("map_tap_hint")}</div>
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
        <div class="chart-box"><canvas id="chart-reliability"></canvas></div>
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
  renderTimelineChart("chart-timeline", rows);
  renderHazardChart("chart-hazard", rows);
  renderReliabilityChart("chart-reliability", rows);
  renderTopCountiesChart("chart-topcounties", rows);
  renderHourChart("chart-hour", rows);
  renderAuthorityChart("chart-authority", rows);
}

function renderDashboardKpis(rows) {
  const host = document.getElementById("kpis");
  if (!host) return;
  const total = rows.length;
  const sent = rows.filter((a) => a.status_ok === true).length;
  const err = rows.filter((a) => a.status_ok === false).length;
  const rate = total ? Math.round((err / total) * 100) : 0;
  const catM = countBy(rows, "risk_category");
  const topCat = [...catM.entries()].sort((a, b) => b[1] - a[1])[0];
  const missing = rows.filter((a) => a.risk_category === "Copil dispărut").length;
  const bear = rows.filter((a) => a.risk_category === "Animale periculoase").length;
  host.innerHTML = `
    <div class="kpi"><div class="v">${total}</div><div class="k">${t("kpi_total")}</div></div>
    <div class="kpi accent"><div class="v">${bear || topCat ? (topCat ? topCat[1] : 0) : 0}</div><div class="k">${t("kpi_toprisk")}</div><div class="sub">${topCat ? topCat[0] : "—"}</div></div>
    <div class="kpi err"><div class="v">${err}</div><div class="k">${t("kpi_failed")}</div></div>
    <div class="kpi ${rate >= 25 ? "err" : "ok"}"><div class="v">${rate}%</div><div class="k">${t("kpi_error_rate")}</div></div>
    <div class="kpi"><div class="v">${sent}</div><div class="k">${t("kpi_sent")}</div></div>
  `;
}
