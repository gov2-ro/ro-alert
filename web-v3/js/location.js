/* Location analytics view: county drill-down with scoped KPIs, charts, and feed. */

function renderLocation(rows, county, container) {
  // Chips list every locality in the county, independent of the active locality
  // filter, so users can switch between localities without going back.
  const countyRows = applyFilters(DATA.alerts, { ...state, selectedLocality: null });
  const localityCounts = new Map();
  for (const a of countyRows) {
    if (a.localities && a.localities.length) {
      for (const loc of a.localities) {
        localityCounts.set(loc, (localityCounts.get(loc) || 0) + 1);
      }
    }
  }
  const locEntries = [...localityCounts.entries()].sort((a, b) => b[1] - a[1]);

  container.innerHTML = `<div class="location-view">
    <div class="location-header">
      <button class="back-btn" id="loc-back-btn" data-i18n="location_back">${t("location_back")}</button>
      <span class="location-county-name">${esc(county)} <span class="location-county-count">(${rows.length})</span></span>
    </div>
    ${locEntries.length ? `<div class="locality-chips" id="locality-chips">
      ${locEntries.map(([loc, cnt]) => `<button class="locality-chip${loc === state.selectedLocality ? " active" : ""}" data-loc="${esc(loc)}">${esc(loc)}<span class="locality-count">${cnt}</span></button>`).join("")}
    </div>` : ""}
    <section class="kpis" id="loc-kpis"></section>
    <div class="location-grid">
      <section class="panel">
        <h2 data-i18n="timeline_title">${t("timeline_title")}</h2>
        <div class="chart-box"><canvas id="chart-loc-timeline"></canvas></div>
      </section>
      <section class="panel">
        <h2 data-i18n="by_category">${t("by_category")}</h2>
        <div class="chart-box"><canvas id="chart-loc-hazard"></canvas></div>
      </section>
      <section class="panel">
        <h2 data-i18n="chart_reliability">${t("chart_reliability")}</h2>
        <div class="chart-box"><canvas id="chart-loc-reliability"></canvas></div>
      </section>
      <section class="panel">
        <h2 data-i18n="chart_by_type">${t("chart_by_type")}</h2>
        <div class="chart-box" id="loc-bytype"><canvas id="chart-loc-bytype"></canvas></div>
      </section>
    </div>
    <div class="location-feed" id="location-feed"></div>
  </div>`;

  renderLocationKpis(rows);
  renderCountyTimelineChart("chart-loc-timeline", rows);
  renderHazardChart("chart-loc-hazard", rows);
  renderReliabilityChart("chart-loc-reliability", rows);
  renderLocByTypeChart("chart-loc-bytype", rows);
  renderLocationFeed(rows);

  // Wire back button
  const backBtn = document.getElementById("loc-back-btn");
  if (backBtn) backBtn.addEventListener("click", () => {
    state.selectedCounty = null;
    state.selectedLocality = null;
    state.view = "dashboard";
    document.querySelectorAll(".view-tab").forEach((t) => t.classList.toggle("active", t.dataset.view === "dashboard"));
    document.getElementById("view-tabs").querySelector("[data-view='location']").disabled = true;
    render();
  });

  // Wire locality chips
  const chipsEl = document.getElementById("locality-chips");
  if (chipsEl) {
    chipsEl.addEventListener("click", (e) => {
      const chip = e.target.closest(".locality-chip");
      if (!chip) return;
      const loc = chip.dataset.loc;
      state.selectedLocality = state.selectedLocality === loc ? null : loc;
      chipsEl.querySelectorAll(".locality-chip").forEach((c) => c.classList.toggle("active", c.dataset.loc === state.selectedLocality));
      render();
    });
  }
}

function renderLocationKpis(rows) {
  const host = document.getElementById("loc-kpis");
  if (!host) return;
  const total = rows.length;
  const sent = rows.filter((a) => a.status_ok === true).length;
  const err = rows.filter((a) => a.status_ok === false).length;
  const rate = total ? Math.round((err / total) * 100) : 0;
  host.innerHTML = `
    <div class="kpi"><div class="v">${total}</div><div class="k">${t("kpi_total")}</div></div>
    <div class="kpi ok"><div class="v">${sent}</div><div class="k">${t("kpi_sent")}</div></div>
    <div class="kpi err"><div class="v">${err}</div><div class="k">${t("kpi_failed")}</div></div>
    <div class="kpi ${rate >= 25 ? "err" : "ok"}"><div class="v">${rate}%</div><div class="k">${t("kpi_error_rate")}</div></div>
  `;
}

function renderLocByTypeChart(canvasId, rows) {
  const m = countBy(rows, "tip_mesaj");
  const entries = [...m.entries()].sort((a, b) => b[1] - a[1]);
  const cfg = {
    type: "bar",
    data: {
      labels: entries.map((e) => e[0] || "(none)"),
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
  host.querySelectorAll(".feed-card").forEach((card) => {
    card.addEventListener("click", () => openDrawer(+card.dataset.id));
  });
}
