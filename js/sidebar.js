/* Sidebar: filter sections, search, date range, stats. */

let sidebarMode = "console"; // "console" | "briefing"

function buildSidebar() {
  buildDateRange();
  buildFacets();
  wireSidebarTabs();
  updateSidebarVisibility();
}

function buildDateRange() {
  const wrap = document.getElementById("date-range");
  if (!wrap) return;
  const min = DATA.meta.date_min ? DATA.meta.date_min.slice(0, 10) : "";
  const max = DATA.meta.date_max ? DATA.meta.date_max.slice(0, 10) : "";
  wrap.innerHTML = `
    <input type="date" id="date-from" min="${min}" max="${max}" value="${min}">
    <span>–</span>
    <input type="date" id="date-to" min="${min}" max="${max}" value="${max}">`;
  document.getElementById("date-from").addEventListener("change", (e) => setDateBound("dateFrom", e.target.value));
  document.getElementById("date-to").addEventListener("change", (e) => setDateBound("dateTo", e.target.value));
}

/* Set one date bound from an input. A reversed range is refused with a visible notice; the
   inputs then show the state again. */
function setDateBound(key, value) {
  const next = { dateFrom: state.dateFrom, dateTo: state.dateTo, [key]: value || null };
  if (next.dateFrom && next.dateTo && next.dateFrom > next.dateTo) {
    addNotice("range", [next.dateFrom, next.dateTo]);
    syncSidebar();
    return;
  }
  state.dateFrom = next.dateFrom;
  state.dateTo = next.dateTo;
  state.page = 1;
  update("push");
}

function buildFacets() {
  const host = document.getElementById("facets");
  if (!host) return;
  host.innerHTML = "";
  FACET_REGISTRY.forEach((def) => {
    const opts = DATA.meta.facets[def.meta] || [];
    if (!opts.length) return;
    const facet = document.createElement("div");
    facet.className = "facet" + (def.open ? "" : " collapsed");
    facet.dataset.facetField = def.field;
    facet.dataset.briefing = def.briefing ? "1" : "0";
    const body = opts.map((o) => {
      const isErr = def.field === "status_trimitere" && o.value === "ERROR";
      return `<label class="facet-opt${isErr ? " sel-error" : ""}">
        <input type="checkbox" value="${esc(o.value)}" data-field="${def.field}">
        <span class="lbl" title="${esc(o.value)}"></span>
        <span class="cnt" title="${esc(t("facet_counts_title"))}">${o.count}</span>
      </label>`;
    }).join("");
    facet.innerHTML = `
      <button class="facet-head"><span data-i18n="${def.label}">${t(def.label)}</span><span class="chev">▾</span></button>
      <div class="facet-body">${body}</div>`;
    facet.querySelector(".facet-head").addEventListener("click", () => facet.classList.toggle("collapsed"));
    facet.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const set = state.filters[cb.dataset.field];
        cb.checked ? set.add(cb.value) : set.delete(cb.value);
        state.page = 1;
        update("push");
      });
    });
    host.appendChild(facet);
  });
}

/* Controls show what `state` says, after every render and history event. */
function syncSidebar() {
  document.querySelectorAll("#facets input[type=checkbox]").forEach((cb) => {
    const set = state.filters[cb.dataset.field];
    cb.checked = !!(set && set.has(cb.value));
    const lbl = cb.parentElement.querySelector(".lbl");
    const text = facetValueLabel(cb.dataset.field, cb.value);
    if (lbl.textContent !== text) lbl.textContent = text;
    cb.parentElement.querySelector(".cnt").title = t("facet_counts_title");
  });
  const search = document.getElementById("search");
  if (search && document.activeElement !== search && search.value !== (state.search || "")) search.value = state.search || "";
  const df = document.getElementById("date-from"), dt = document.getElementById("date-to");
  const min = DATA.meta.date_min ? DATA.meta.date_min.slice(0, 10) : "";
  const max = DATA.meta.date_max ? DATA.meta.date_max.slice(0, 10) : "";
  if (df) df.value = state.dateFrom || min;
  if (dt) dt.value = state.dateTo || max;
  document.querySelectorAll(".stab").forEach((b) => b.classList.toggle("active", b.dataset.mode === sidebarMode));
  updateSidebarVisibility();
}

function wireSidebarTabs() {
  document.querySelectorAll(".stab").forEach((btn) => {
    btn.addEventListener("click", () => {
      sidebarMode = btn.dataset.mode;
      document.querySelectorAll(".stab").forEach((b) => b.classList.toggle("active", b === btn));
      updateSidebarVisibility();
    });
  });
}

function updateSidebarVisibility() {
  document.querySelectorAll(".facet").forEach((f) => {
    if (sidebarMode === "briefing" && f.dataset.briefing === "0") {
      f.style.display = "none";
    } else {
      f.style.display = "";
    }
  });
}

function renderSidebarStats(rows) {
  const host = document.getElementById("sidebar-stats");
  if (!host) return;
  const sent = rows.filter((a) => a.status_ok === true).length;
  const c = failureCoverage(rows);
  const sample = c.alerts
    ? `<div class="sidebar-stat" title="${esc(failureSub(c.alerts, c.months))}"><div class="sv">${c.alerts.text}</div><div class="sk">${t("fail_sample_alerts")}</div></div>
       <div class="sidebar-stat" title="${esc(failureSub(c.deliveries, c.months))}"><div class="sv">${c.deliveries.text}</div><div class="sk">${t("fail_sample_deliv")}</div></div>`
    : `<div class="sidebar-stat" title="${esc(t("fail_unknown_sub"))}"><div class="sv">—</div><div class="sk">${t("fail_unknown")}</div></div>`;
  host.innerHTML = `
    <div class="sidebar-stat"><div class="sv">${rows.length}</div><div class="sk">${t("kpi_total")}</div></div>
    <div class="sidebar-stat ok"><div class="sv">${sent}</div><div class="sk">${t("kpi_sent")}</div></div>
    <div class="sidebar-stat err"><div class="sv">${c.observed}</div><div class="sk">${t("kpi_error")}</div></div>
    ${sample}
  `;
}
