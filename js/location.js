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
   and the county scope (but not the place choice), so the user can switch place.
   With records the shell (charts, KPIs, record list) stays between updates; with none, the
   view shows the heading and an empty state. */
function mountLocation(container) {
  container.innerHTML = `<div class="location-view">
    <div id="loc-head"></div>
    <section class="kpis kpis-3" id="loc-kpis"></section>
    <div class="location-grid">
      <section class="panel">
        <h2 data-i18n="timeline_title">${t("timeline_title")}</h2>
        <div class="chart-box"><canvas id="chart-loc-timeline"></canvas></div>
        <p class="chart-cap" id="cap-loc-timeline"></p>
      </section>
      <section class="panel">
        <h2 data-i18n="by_category">${t("by_category")}</h2>
        <div class="chart-box"><canvas id="chart-loc-hazard"></canvas></div>
        <p class="chart-cap" id="cap-loc-hazard"></p>
      </section>
      <section class="panel">
        <h2 data-i18n="chart_by_type">${t("chart_by_type")}</h2>
        <div class="chart-box" id="loc-bytype"><canvas id="chart-loc-bytype"></canvas></div>
        <p class="chart-cap" id="cap-loc-type"></p>
      </section>
    </div>
    <div id="loc-quality"></div>
    <section class="location-feed" id="location-feed-panel">
      <h2 class="list-title" id="list-heading" tabindex="-1" data-i18n="list_heading_local">${esc(t("list_heading_local"))}</h2>
      <div id="pager-top"></div>
      <div id="location-feed"></div>
      <div id="pager-bottom"></div>
    </section>
  </div>`;
  wireLocationView(container.querySelector(".location-view"));
}

function mountLocationEmpty(container) {
  container.innerHTML = `<div class="location-view">
    <div id="loc-head"></div>
    <div class="empty-state"><p id="loc-empty-text"></p>
      <button type="button" class="link-btn" id="empty-clear">${esc(t("empty_clear"))}</button></div>
  </div>`;
  wireLocationView(container.querySelector(".location-view"));
}

/* Delegated handlers, wired once per mount. */
function wireLocationView(view) {
  view.addEventListener("click", (e) => {
    if (e.target.closest("#loc-back-btn")) { leaveLocal(); return; }
    if (e.target.closest("#empty-clear")) { clearAll(); return; }
    const chip = e.target.closest(".locality-chip");
    if (!chip) return;
    const id = Number(chip.dataset.place);
    if (state.selectedPlaceId === id) clearPlace(); else selectPlace(id);
  });
  view.addEventListener("input", (e) => {
    if (e.target.id !== "place-filter") return;
    applyPlaceFilter(e.target.value);
  });
  const feed = view.querySelector("#location-feed");
  if (feed) feed.addEventListener("click", feedCardClick);
}

function applyPlaceFilter(value) {
  const q = normalizeSearch(value);
  document.querySelectorAll("#place-list .locality-chip").forEach((c) => {
    c.hidden = !!q && !normalizeSearch(c.textContent).includes(q);
  });
}

/* Heading and place chips. Rebuilt on each update; the open state and the filter text of the
   place list survive. */
function renderLocationHead(rows) {
  const host = document.getElementById("loc-head");
  if (!host) return;
  const was = document.getElementById("place-more");
  const wasOpen = !!(was && was.open);
  const filterText = (document.getElementById("place-filter") || {}).value || "";
  const county = state.selectedCounty;
  const placeId = state.selectedPlaceId;
  const scopeRows = applyFilters(DATA.alerts, { ...state, selectedPlaceId: null });
  const counts = placeCounts(scopeRows);
  const top = counts.slice(0, PLACE_CHIPS_SHOWN);
  if (placeId != null && !top.some(([id]) => id === placeId)) top.push([placeId, counts.find(([id]) => id === placeId)?.[1] || 0]);

  const place = placeId != null ? DATA.places.get(placeId) : null;
  const title = place
    ? `${esc(place.name)}${place.county ? ` <span class="location-county-sub">· ${esc(place.county)}</span>` : ""}`
    : esc(county || "");
  const scopeNote = place && county ? `<span class="location-scope">${t("strip_county").replace("%s", esc(county))}</span>` : "";

  host.innerHTML = `
    <div class="location-header">
      <button type="button" class="back-btn" id="loc-back-btn">${t("location_back")}</button>
      <div class="location-titlebox">
        <div class="eyebrow">${t(place ? "loc_kind_place" : "loc_kind_county")}</div>
        <h2 class="location-county-name">${title} <span class="location-county-count">(${fmtN(rows.length)})</span></h2>
      </div>
      ${scopeNote}
    </div>
    ${top.length ? `<div class="place-block"><div class="eyebrow">${t("places_title")}</div>
      <div class="locality-chips" id="locality-chips">${top.map(([id, c]) => placeChipHtml(id, c)).join("")}</div>
      ${counts.length > top.length ? `<details class="place-more" id="place-more"${wasOpen ? " open" : ""}><summary>${t("places_all").replace("%n", counts.length)}</summary>
        <input type="search" id="place-filter" placeholder="${esc(t("places_filter_ph"))}" aria-label="${esc(t("places_filter_ph"))}" value="${esc(filterText)}">
        <div class="locality-chips place-list" id="place-list">${counts.map(([id, c]) => placeChipHtml(id, c)).join("")}</div>
      </details>` : ""}
    </div>` : `<p class="chart-cap">${t("places_none")}</p>`}`;
  if (filterText) applyPlaceFilter(filterText);
}

/* Update the Local view. `listOnly` (a page change) redraws only the record list. */
function updateLocation(rows, opts = {}) {
  if (!opts.listOnly) {
    renderLocationHead(rows);
    const dates = Stats.dailyCounts(rows).labels;
    const setCap = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    setCap("cap-loc-timeline", fill(t("cap_timeline"), { a: dates[0] || "—", b: dates[dates.length - 1] || "—", n: fmtN(rows.length) }));
    setCap("cap-loc-hazard", fill(t("cap_hazard"), { n: fmtN(rows.length) }));
    setCap("cap-loc-type", fill(t("cap_type"), { n: fmtN(rows.filter((a) => a.tip_mesaj).length) }));
    renderLocationKpis(rows);
    renderStackedTimelineChart("chart-loc-timeline", rows);
    renderHazardChart("chart-loc-hazard", rows);
    renderLocByTypeChart("chart-loc-bytype", rows);
    document.getElementById("loc-quality").innerHTML = qualityHtml(rows);
  }
  renderLocationFeed(rows);
}

function updateLocationEmpty(rows) {
  renderLocationHead(rows);
  const txt = document.getElementById("loc-empty-text");
  if (txt) txt.textContent = state.selectedPlaceId != null ? t("place_zero") : t("no_results");
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

/* One page of the record list of the Local scope; the pager belongs to this list. */
function renderLocationFeed(rows) {
  const host = document.getElementById("location-feed");
  if (!host) return;
  if (!rows.length) {
    host.innerHTML = `<div class="empty-state"><p>${t("feed_no_alerts")}</p></div>`;
    return;
  }
  const sorted = sortRecords(rows, timeKey, "desc");
  const info = pageInfo(sorted.length, state.page);
  host.innerHTML = recordListHtml(sorted.slice(info.offset, info.offset + info.size), dateCounts(rows));
  document.getElementById("pager-top").innerHTML = pagerHtml(info, "top");
  document.getElementById("pager-bottom").innerHTML = pagerHtml(info, "bottom");
}
