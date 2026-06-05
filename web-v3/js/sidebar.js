/* Sidebar: filter sections, search, date range, stats. */

let sidebarMode = "console"; // "console" | "briefing"

/* Facet definitions for v2 — same structure as v1, with `briefing` flag */
const FACET_DEFS_V2 = [
  { field: "risk_category", meta: "risk_category", label: "facet_risk_category", open: true, briefing: true },
  { field: "status_trimitere", meta: "status_trimitere", label: "facet_status_trimitere", open: true, briefing: true },
  { field: "judet", meta: "judet", label: "facet_judet" },
  { field: "severitate", meta: "severitate", label: "facet_severitate" },
  { field: "tip_mesaj", meta: "tip_mesaj", label: "facet_tip_mesaj" },
  { field: "risc_principal", meta: "risc_principal", label: "facet_risc_principal" },
  { field: "risc_asociat", meta: "risc_asociat", label: "facet_risc_asociat" },
  { field: "cod_eveniment", meta: "cod_eveniment", label: "facet_cod_eveniment" },
  { field: "meteo_color", meta: "meteo_color", label: "facet_meteo_color" },
  { field: "tip_inregistrare", meta: "tip_inregistrare", label: "facet_tip_inregistrare" },
  { field: "initiator", meta: "initiator", label: "facet_initiator" },
  { field: "month", meta: "month", label: "facet_month" },
];

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
  document.getElementById("date-from").addEventListener("change", (e) => {
    state.dateFrom = e.target.value || null; render();
  });
  document.getElementById("date-to").addEventListener("change", (e) => {
    state.dateTo = e.target.value || null; render();
  });
}

function buildFacets() {
  const host = document.getElementById("facets");
  if (!host) return;
  host.innerHTML = "";
  FACET_DEFS_V2.forEach((def) => {
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
        <span class="lbl" title="${esc(o.value)}">${esc(o.value)}</span>
        <span class="cnt">${o.count}</span>
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
        render();
      });
    });
    host.appendChild(facet);
  });
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
  const total = rows.length;
  const sent = rows.filter((a) => a.status_ok === true).length;
  const err = rows.filter((a) => a.status_ok === false).length;
  const counties = new Set(rows.filter((a) => a.scope === "county").map((a) => a.judet)).size;
  const rate = total ? Math.round((err / total) * 100) : 0;
  host.innerHTML = `
    <div class="sidebar-stat"><div class="sv">${total}</div><div class="sk">${t("kpi_total")}</div></div>
    <div class="sidebar-stat ok"><div class="sv">${sent}</div><div class="sk">${t("kpi_sent")}</div></div>
    <div class="sidebar-stat err"><div class="sv">${err}</div><div class="sk">${t("kpi_error")}</div></div>
    <div class="sidebar-stat ${rate >= 25 ? "err" : ""}"><div class="sv">${rate}%</div><div class="sk">${t("kpi_error_rate")}</div></div>
  `;
}
