/* Bootstrap, state management, view routing, chrome event wiring. */

window.state = {
  lang: "ro",
  view: "dashboard",
  filters: {},
  search: "",
  dateFrom: null,
  dateTo: null,
  selectedCounty: null,
  selectedLocality: null,
};

/* Initialize filter sets from FACET_DEFS_V2 (or v1 FACET_DEFS as fallback) */
const defs = typeof FACET_DEFS_V2 !== "undefined" ? FACET_DEFS_V2 : (typeof FACET_DEFS !== "undefined" ? FACET_DEFS : []);
defs.forEach((d) => (state.filters[d.field] = new Set()));

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ---- init ---- */
async function init() {
  await loadData();
  applyI18n();
  buildSidebar();
  // Map is initialized in renderDashboard (when #map div exists)
  RoMap.onCountyClick = onCountyClick;
  wireChrome();
  renderDateLabel();
  render();
}

function renderDateLabel() {
  const m = DATA.meta;
  const el = document.getElementById("daterange-label");
  if (!el || !m.date_min) return;
  const fmt = (iso) => iso.slice(0, 10);
  el.textContent = `${fmt(m.date_min)} → ${fmt(m.date_max)}`;
}

/* ---- chrome wiring ---- */
function wireChrome() {
  // Language toggle
  document.getElementById("langtoggle").addEventListener("click", (e) => {
    const b = e.target.closest(".lbtn"); if (!b) return;
    state.lang = b.dataset.lang;
    document.querySelectorAll(".lbtn").forEach((x) => x.classList.toggle("active", x === b));
    applyI18n();
    relabelDynamic();
    render();
  });

  // View tabs
  document.getElementById("view-tabs").addEventListener("click", (e) => {
    const b = e.target.closest(".view-tab"); if (!b || b.disabled) return;
    state.view = b.dataset.view;
    document.querySelectorAll(".view-tab").forEach((x) => x.classList.toggle("active", x === b));
    if (state.view !== "location") { state.selectedCounty = null; state.selectedLocality = null; }
    render();
  });

  // Search
  let searchTimer;
  document.getElementById("search").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.search = e.target.value; render(); }, 250);
  });

  // Clear all (topnav button)
  document.getElementById("btn-clear-all").addEventListener("click", clearAll);

  // Clear all (sidebar button)
  document.getElementById("sidebar-clear").addEventListener("click", clearAll);

  // Drawer close
  document.getElementById("drawer-close").addEventListener("click", closeDrawer);
  document.getElementById("drawer-overlay").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
}

function clearAll() {
  Object.values(state.filters).forEach((s) => s.clear());
  document.querySelectorAll("#facets input[type=checkbox]").forEach((cb) => (cb.checked = false));
  state.search = ""; document.getElementById("search").value = "";
  const min = DATA.meta.date_min ? DATA.meta.date_min.slice(0, 10) : "";
  const max = DATA.meta.date_max ? DATA.meta.date_max.slice(0, 10) : "";
  state.dateFrom = null; state.dateTo = null;
  const df = document.getElementById("date-from");
  const dt = document.getElementById("date-to");
  if (df) df.value = min;
  if (dt) dt.value = max;
  state.selectedCounty = null; state.selectedLocality = null;
  if (state.view === "location") {
    state.view = "dashboard";
    document.querySelectorAll(".view-tab").forEach((t) => t.classList.toggle("active", t.dataset.view === "dashboard"));
    document.getElementById("view-tabs").querySelector("[data-view='location']").disabled = true;
  }
  render();
}

function relabelDynamic() {
  // i18n elements in sidebar (facet headers, tabs) use data-i18n, so applyI18n handles them.
  // But sidebar stats and view content need a full re-render.
  applyI18n();
  render();
}

/* ---- county click -> drill into Location ---- */
function onCountyClick(name) {
  const match = Object.keys(DATA.meta.judet_counts).find((j) => countyKey(j) === countyKey(name));
  if (!match) return;
  state.selectedCounty = match;
  state.selectedLocality = null;
  state.view = "location";
  document.querySelectorAll(".view-tab").forEach((t) => t.classList.toggle("active", t.dataset.view === "location"));
  const locTab = document.getElementById("view-tabs").querySelector("[data-view='location']");
  if (locTab) locTab.disabled = false;
  render();
}

/* ---- main render ---- */
let currentRows = [];
function render() {
  // applyFilters handles county + locality scoping for the location view.
  currentRows = applyFilters(DATA.alerts, state);

  const main = document.getElementById("content-main");
  // Destroy old charts and map before clearing DOM
  destroyAllCharts();
  destroyMap();
  main.innerHTML = "";

  if (!currentRows.length) {
    main.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠</div><p>${t("no_results")}</p></div>`;
  } else if (state.view === "dashboard") {
    renderDashboard(currentRows, main);
  } else if (state.view === "feed") {
    renderFeed(currentRows, main);
  } else if (state.view === "location" && state.selectedCounty) {
    renderLocation(currentRows, state.selectedCounty, main);
  }

  // Always update sidebar
  renderSidebarStats(currentRows);
  document.getElementById("result-count").textContent = `${currentRows.length} ${t("results")}`;
}

/* ---- utility functions (shared across modules) ---- */
function fmtTime(iso) {
  if (!iso) return "—";
  return iso.slice(0, 10) + " " + iso.slice(11, 16);
}

function sevBadge(s) {
  if (!s) return "";
  const cls = s === "EXTREME" ? "sev-extreme" : "sev-severe";
  return `<span class="badge ${cls}">${esc(s)}</span>`;
}

function statusBadge(a) {
  let h = a.status_ok === false
    ? `<span class="badge error">${t("status_error")}</span>`
    : `<span class="badge sent">${t("status_sent")}</span>`;
  if (a.is_cancel) h += ` <span class="badge cancel">${t("status_cancel")}</span>`;
  return h;
}

function cssEsc(s) { return s.replace(/["\\]/g, "\\$&"); }

/* ---- detail drawer ---- */
function openDrawer(id) {
  const a = DATA.alerts.find((x) => x.id === id);
  if (!a) return;
  const metaRows = [
    ["f_initiator", a.initiator], ["f_judet", a.judet],
    ["f_risk_category", a.risk_category], ["f_risc_principal", a.risc_principal],
    ["f_risc_asociat", a.risc_asociat], ["f_severitate", a.severitate],
    ["f_urgenta", a.urgenta], ["f_categorie", a.categorie],
    ["f_tip_mesaj", a.tip_mesaj], ["f_cod_eveniment", a.cod_eveniment],
    ["f_tip_inregistrare", a.tip_inregistrare], ["f_audienta", a.audienta],
    ["f_meteo_color", a.meteo_color], ["f_status", a.status_trimitere],
    ["f_repeats", a.nr_repetitii], ["f_source", a.source_file],
  ].filter(([, v]) => v);

  let msgBlocks = "";
  if (a.msg_ro) msgBlocks += `<div class="msg-block">${esc(a.msg_ro)}</div>`;
  if (a.msg_en && a.msg_en !== a.msg_ro) msgBlocks += `<div class="msg-block" style="margin-top:8px">${esc(a.msg_en)}</div>`;
  if (!msgBlocks) msgBlocks = `<div class="msg-block">${esc(a.msg || "—")}</div>`;

  document.getElementById("drawer-body").innerHTML = `
    <div class="drawer-title">${esc(a.title || a.risk_category)}</div>
    <div class="drawer-sub">${esc(a.judet || "")} · ${esc(a.initiator || "")} · ${fmtTime(a.sent_at)}</div>
    <div class="status-row">${statusBadge(a)} ${sevBadge(a.severitate)}</div>
    <h3>${t("detail_message")}</h3>${msgBlocks}
    ${a.localities && a.localities.length ? `<h3>${t("detail_localities")}</h3><div>${a.localities.map((l) => `<span class="pill">${esc(l)}</span>`).join("")}</div>` : ""}
    ${a.poligoane ? `<h3>${t("detail_polygons")}</h3><div>${a.poligoane.split(",").map((p) => `<span class="pill">${esc(p.trim())}</span>`).join("")}</div>` : ""}
    <h3>${t("detail_meta")}</h3>
    <div class="meta-grid">${metaRows.map(([k, v]) => `<div class="mk">${t(k)}</div><div>${esc(v)}</div>`).join("")}</div>`;

  document.getElementById("drawer").classList.remove("hidden");
  document.getElementById("drawer-overlay").classList.remove("hidden");
}

function closeDrawer() {
  document.getElementById("drawer").classList.add("hidden");
  document.getElementById("drawer-overlay").classList.add("hidden");
}

/* ---- boot ---- */
init();
