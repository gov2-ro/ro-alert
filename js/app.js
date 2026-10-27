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

/* ---- extracted locations (typed) ---- */
const LOC_TYPE_META = {
  locality: { icon: "▣", label: "loc_type_locality" },
  street:   { icon: "▮", label: "loc_type_street" },
  poi:      { icon: "◆", label: "loc_type_poi" },
  road:     { icon: "▲", label: "loc_type_road" },
  km:       { icon: "↦", label: "loc_type_km" },
  river:    { icon: "≈", label: "loc_type_river" },
};

/* Render typed location chips. opts.specificFirst surfaces streets/POIs/roads
   ahead of localities (county is already shown elsewhere); opts.limit caps the
   count and appends a "+N" overflow chip. */
function locChips(locs, opts = {}) {
  if (!locs || !locs.length) return "";
  const order = opts.specificFirst
    ? ["poi", "street", "road", "km", "river", "locality"]
    : ["locality", "street", "poi", "road", "km", "river"];
  const rank = (l) => { const i = order.indexOf(l.type); return i < 0 ? 99 : i; };
  let arr = locs.slice().sort((a, b) => rank(a) - rank(b));
  let overflow = "";
  if (opts.limit && arr.length > opts.limit) {
    overflow = `<span class="loc-chip loc-more">+${arr.length - opts.limit}</span>`;
    arr = arr.slice(0, opts.limit);
  }
  return arr.map((l) => {
    const m = LOC_TYPE_META[l.type] || { icon: "•", label: "" };
    return `<span class="loc-chip loc-${esc(l.type)}" title="${esc(t(m.label))}"><span class="loc-ic">${m.icon}</span>${esc(l.name)}</span>`;
  }).join("") + overflow;
}

/* ---- init ---- */
async function init() {
  await loadData();
  applyI18n();
  buildSidebar();
  // Map is initialized in renderDashboard (when #map div exists)
  RoMap.onCountyClick = onCountyClick;
  RoMap.onPlaceClick = onPlaceClick;
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

/* ---- map point click -> Location view, filtered by that locality ----
   Reuses state.selectedLocality; applyFilters matches it against places[].name too. */
function onPlaceClick(judet, name) {
  onCountyClick(judet);
  state.selectedLocality = name;
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
  } else if (state.view === "table") {
    renderTable(currentRows, main);
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

  // Extracted-entity chips (real fields only)
  const chips = [
    a.risk_category && { v: a.risk_category, k: t("f_risk_category"), color: catColor(a.risk_category) },
    a.meteo_color && { v: a.meteo_color, k: t("f_meteo_color") },
    a.severitate && { v: a.severitate, k: t("f_severitate") },
    a.localities && a.localities.length && { v: a.localities.length, k: t("ent_places") },
    a.scope && { v: t(a.scope === "national" ? "scope_national" : "scope_county"), k: "scope" },
    a.is_cancel && { v: t("status_cancel"), k: "lifecycle" },
  ].filter(Boolean);
  const chipsHtml = chips.map((c) =>
    `<span class="ent-chip">${c.color ? `<span class="dot" style="background:${c.color}"></span>` : ""}<b>${esc(String(c.v))}</b><span class="ent-k">${esc(c.k)}</span></span>`
  ).join("");

  // Per-message RO/EN toggle (defaults to active UI language, falls back when missing)
  const msgRo = a.msg_ro || a.msg || "";
  const msgEn = a.msg_en && a.msg_en !== a.msg_ro ? a.msg_en : "";
  const startLang = state.lang === "en" && msgEn ? "en" : "ro";

  document.getElementById("drawer-body").innerHTML = `
    <div class="drawer-title">${esc(a.title || a.risk_category)}</div>
    <div class="drawer-sub">${esc(a.judet || "")} · ${esc(a.initiator || "")} · ${fmtTime(a.sent_at)}</div>
    <div class="status-row">${statusBadge(a)} ${sevBadge(a.severitate)}</div>
    ${chipsHtml ? `<div class="drawer-eyebrow">${t("drawer_entities")}</div><div class="drawer-chips">${chipsHtml}</div>` : ""}
    <div class="drawer-cols">
      <div class="drawer-col">
        <div class="msg-head"><h3>${t("detail_message")}</h3>
          <div class="msg-toggle">
            <button class="mt-btn${startLang === "ro" ? " active" : ""}" data-lang="ro">RO</button>
            <button class="mt-btn${startLang === "en" ? " active" : ""}" data-lang="en"${msgEn ? "" : " disabled"}>EN</button>
          </div>
        </div>
        <div class="msg-block" id="drawer-msg">${esc(startLang === "en" ? msgEn : msgRo)}</div>
        ${a.localities && a.localities.length ? `<h3>${t("detail_localities")}</h3><div>${a.localities.map((l) => `<span class="pill">${esc(l)}</span>`).join("")}</div>` : ""}
        ${(() => { const extra = (a.locations || []).filter((l) => l.type !== "locality"); return extra.length ? `<h3>${t("detail_locations")}</h3><div class="loc-chips">${locChips(extra)}</div>` : ""; })()}
        ${a.poligoane ? `<h3>${t("detail_polygons")}</h3><div>${a.poligoane.split(",").map((p) => `<span class="pill">${esc(p.trim())}</span>`).join("")}</div>` : ""}
      </div>
      <div class="drawer-col">
        ${a.deliveries && a.deliveries.length ? `<h3>${t("detail_deliveries")} (${a.deliveries.length})</h3>
        <table class="del-table"><thead><tr><th>${t("del_channel")}</th><th>${t("del_status")}</th><th>${t("del_time")}</th></tr></thead><tbody>${a.deliveries.map((d) => `<tr><td>${esc((d.channel || "—").replace(/^trimitere alerta pe canalul\s+/i, ""))}</td><td><span class="badge ${d.status === "ERROR" ? "error" : "sent"}">${esc(d.status || "—")}</span></td><td>${fmtTime(d.sent_at)}</td></tr>`).join("")}</tbody></table>` : ""}
        <h3>${t("detail_meta")}</h3>
        <div class="meta-grid">${metaRows.map(([k, v]) => `<div class="mk">${t(k)}</div><div>${esc(v)}</div>`).join("")}</div>
      </div>
    </div>`;

  // Wire message language toggle (in-place, no global re-render)
  const msgEl = document.getElementById("drawer-msg");
  document.querySelectorAll(".msg-toggle .mt-btn").forEach((b) => {
    b.addEventListener("click", () => {
      if (b.disabled) return;
      document.querySelectorAll(".msg-toggle .mt-btn").forEach((x) => x.classList.toggle("active", x === b));
      msgEl.textContent = b.dataset.lang === "en" ? (msgEn || msgRo) : msgRo;
    });
  });

  document.getElementById("drawer").classList.remove("hidden");
  document.getElementById("drawer-overlay").classList.remove("hidden");
}

function closeDrawer() {
  document.getElementById("drawer").classList.add("hidden");
  document.getElementById("drawer-overlay").classList.add("hidden");
}

/* ---- boot ---- */
init();
