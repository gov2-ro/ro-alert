/* Bootstrap, state management, view routing, chrome event wiring. */

/* One state object. The URL hash, the controls and every view derive from it. */
window.state = newState();

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
let currentRows = [];
let lastHash = "";            // the canonical hash that matches the current state
let notices = [];             // [{id, code, args}] shown above the view
let noticeSeq = 0;
let pushedRecord = null;      // record id whose history entry this page session pushed
let _ctx = null;

function getCtx() { return _ctx || (_ctx = urlContext()); }

async function init() {
  await loadData();
  buildSidebar();
  // Map is initialized in renderDashboard (when #map div exists)
  RoMap.onCountyClick = onCountyClick;
  RoMap.onPlaceClick = selectPlace;
  wireChrome();
  renderDateLabel();
  loadFromHash(currentHash(), true);
}

function renderDateLabel() {
  const m = DATA.meta;
  const el = document.getElementById("daterange-label");
  if (!el || !m.date_min) return;
  el.textContent = `${m.date_min.slice(0, 10)} → ${m.date_max.slice(0, 10)}`;
}

/* The footer range follows the language: "februarie 2026 – august 2026". */
function renderFooterRange() {
  const el = document.getElementById("footer-range");
  const m = DATA.meta;
  if (!el || !m || !m.date_min) return;
  const f = (iso) => `${monthName(+iso.slice(5, 7)).toLowerCase()} ${iso.slice(0, 4)}`;
  el.textContent = `(${f(m.date_min)} – ${f(m.date_max)})`;
}

/* ---- one update path ----
   Every change to `state` ends in update(): it normalizes the state, syncs every control from
   it, renders the view and writes the URL. `mode` is "push" (a deliberate step: a new history
   entry), "replace" (typing, language, sort: no new entry) or "none" (history events). */
function update(mode, opts = {}) {
  normalizeState(state, getCtx());
  syncControls();
  if (opts.render !== false) render();
  syncDrawer();
  if (mode !== "none") writeUrl(mode, opts.historyState);
}

function currentHash() { return (location.hash || "").replace(/^#/, ""); }

function writeUrl(mode, historyState) {
  const h = encodeState(state);
  if (h === lastHash) return;
  const url = h ? "#" + h : location.pathname + location.search;
  try {
    if (mode === "push") history.pushState(historyState || null, "", url);
    else history.replaceState(historyState || history.state || null, "", url);
  } catch (e) {
    try { location.hash = h; } catch (e2) { /* the page still works without a link */ }
  }
  lastHash = h;
}

/* Replace the state with the one a hash describes, then draw. History events and the first
   load both come here. A hash with unusable parts is replaced by its canonical form. */
function loadFromHash(h, initial) {
  const r = decodeHash(h, getCtx());
  Object.assign(state, r.state);
  notices = r.notices.map((n) => ({ id: ++noticeSeq, code: n.code, args: n.args }));
  update("none");
  const canonical = encodeState(state);
  lastHash = canonical;
  if (canonical !== h) {
    try { history.replaceState(history.state, "", canonical ? "#" + canonical : location.pathname + location.search); } catch (e) { /* ignore */ }
  }
  if (!initial) pushedRecord = null;
}

function onHistory() {
  if (currentHash() === lastHash) return;     // our own write, or the second of two events
  loadFromHash(currentHash(), false);
}

/* ---- chrome wiring ---- */
function wireChrome() {
  document.getElementById("langtoggle").addEventListener("click", (e) => {
    const b = e.target.closest(".lbtn"); if (!b || state.lang === b.dataset.lang) return;
    state.lang = b.dataset.lang;
    update("replace");
  });

  document.getElementById("view-tabs").addEventListener("click", (e) => {
    const b = e.target.closest(".view-tab"); if (!b || b.disabled) return;
    state.view = b.dataset.view;
    state.page = 1;
    update("push");
  });

  let searchTimer;
  document.getElementById("search").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    const value = e.target.value;
    searchTimer = setTimeout(() => { state.search = value; state.page = 1; update("replace"); }, 250);
  });

  document.getElementById("btn-clear-all").addEventListener("click", clearAll);
  document.getElementById("sidebar-clear").addEventListener("click", clearAll);

  document.getElementById("drawer-close").addEventListener("click", closeDrawer);
  document.getElementById("drawer-overlay").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

  // The strip and the notices sit outside the view content, so they survive every render.
  document.getElementById("active-strip").addEventListener("click", (e) => {
    if (e.target.closest("[data-strip-reset]")) { clearAll(); return; }
    const btn = e.target.closest("[data-strip-index]"); if (!btn) return;
    const item = activeFilterItems(state)[Number(btn.dataset.stripIndex)];
    if (!item) return;
    removeFilterItem(state, item);
    state.page = 1;
    update("push");
  });
  document.getElementById("notices").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-notice]"); if (!btn) return;
    notices = notices.filter((n) => String(n.id) !== btn.dataset.notice);
    renderNotices();
  });

  window.addEventListener("popstate", onHistory);
  window.addEventListener("hashchange", onHistory);
}

/* Clear every data filter and the Local scope. View, language and the open record stay. */
function clearAll() {
  Object.values(state.filters).forEach((s) => s.clear());
  state.search = "";
  state.dateFrom = null; state.dateTo = null;
  state.selectedCounty = null; state.selectedPlaceId = null;
  state.page = 1;
  update("push");
}

/* ---- controls derive from state ---- */
function syncControls() {
  document.querySelectorAll(".lbtn").forEach((x) => x.classList.toggle("active", x.dataset.lang === state.lang));
  applyI18n();
  renderFooterRange();
  const scoped = !!state.selectedCounty || state.selectedPlaceId != null;
  document.querySelectorAll(".view-tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === state.view);
    if (b.dataset.view === "location") b.disabled = !scoped;
  });
  syncSidebar();
  renderStrip();
  renderNotices();
}

/* The strip lists every active data filter, including those a hidden facet holds. */
function renderStrip() {
  const host = document.getElementById("active-strip");
  if (!host) return;
  const items = activeFilterItems(state);
  const range = datesOutsideDetail();
  if (!items.length && !range) { host.innerHTML = ""; host.hidden = true; return; }
  host.hidden = false;
  const chips = items.map((it, i) => {
    const full = it.group ? `${it.group}: ${it.text}` : it.text;
    return `<span class="strip-chip"><span class="strip-text">${esc(full)}</span>` +
      `<button type="button" class="strip-x" data-strip-index="${i}" aria-label="${esc(t("strip_remove").replace("%s", full))}">&times;</button></span>`;
  }).join("");
  const reset = items.length ? `<button type="button" class="link-btn strip-reset" data-strip-reset>${t("strip_reset")}</button>` : "";
  const note = range ? `<p class="strip-note">${esc(range)}</p>` : "";
  host.innerHTML = `<div class="strip-row"><span class="strip-label">${t("strip_label")}</span>${chips}${reset}</div>${note}`;
}

/* Text that explains a date bound outside the detailed messages. The value is kept, never clamped. */
function datesOutsideDetail() {
  const m = DATA.meta;
  if (!m || !m.date_min) return "";
  const min = m.date_min.slice(0, 10), max = m.date_max.slice(0, 10);
  if ((state.dateFrom && state.dateFrom < min) || (state.dateTo && state.dateTo > max)) {
    return t("notice_dates_outside").replace("%a", min).replace("%b", max);
  }
  return "";
}

function renderNotices() {
  const host = document.getElementById("notices");
  if (!host) return;
  host.hidden = !notices.length;
  host.innerHTML = notices.map((n) => {
    let msg = t("notice_" + n.code);
    n.args.forEach((a) => { msg = msg.replace("%s", esc(a)); });
    return `<div class="notice" role="status"><span>${msg}</span>` +
      `<button type="button" class="notice-x" data-notice="${n.id}" aria-label="${esc(t("notice_dismiss"))}">&times;</button></div>`;
  }).join("");
}

function addNotice(code, args) {
  notices.push({ id: ++noticeSeq, code, args: args || [] });
  renderNotices();
}

/* ---- navigation helpers ---- */

/* County click -> Local view for the issuer county. No place is selected. */
function onCountyClick(name) {
  const match = Object.keys(DATA.meta.judet_counts).find((j) => countyKey(j) === countyKey(name));
  if (!match) return;
  state.selectedCounty = match;
  state.selectedPlaceId = null;
  state.view = "location";
  state.page = 1;
  update("push");
}

/* Place choice (map point, Local chip, top-place link). The place scopes by SIRUTA code within
   the current global filters. From the Local view the county scope stays; from any other view
   no county is added, so nationally issued alerts at the place stay in. */
function selectPlace(siruta) {
  const id = Number(siruta);
  if (!DATA.places.has(id)) return;
  if (state.view !== "location") state.selectedCounty = null;
  state.selectedPlaceId = id;
  state.view = "location";
  state.page = 1;
  update("push");
}

function clearPlace() {
  state.selectedPlaceId = null;
  state.page = 1;
  update("push");
}

/* Leave the Local view for the overview. */
function leaveLocal() {
  state.selectedCounty = null;
  state.selectedPlaceId = null;
  state.view = "dashboard";
  state.page = 1;
  update("push");
}

/* ---- main render ---- */
function render() {
  currentRows = applyFilters(DATA.alerts, state);

  const main = document.getElementById("content-main");
  // Destroy old charts and map before clearing DOM
  destroyAllCharts();
  destroyMap();
  main.innerHTML = "";

  if (state.view === "location") {
    renderLocation(currentRows, main);       // draws its own heading, also with no records
  } else if (!currentRows.length) {
    renderEmpty(main);
  } else if (state.view === "story") {
    renderStory(currentRows, main);
  } else if (state.view === "dashboard") {
    renderDashboard(currentRows, main);
  } else if (state.view === "table") {
    renderTable(currentRows, main);
  } else if (state.view === "feed") {
    renderFeed(currentRows, main);
  }

  renderSidebarStats(currentRows);
  document.getElementById("result-count").textContent = `${currentRows.length} ${t("results")}`;
}

/* No records: keep the filters usable. The search box and the strip stay outside this area. */
function renderEmpty(main) {
  main.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠</div><p>${t("no_results")}</p>` +
    `<button type="button" class="link-btn" id="empty-clear">${t("empty_clear")}</button></div>`;
  document.getElementById("empty-clear").addEventListener("click", clearAll);
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

/* ---- detail drawer ----
   The open record is state (`state.record`, key `record` in the URL). Opening it changes no
   data filter. A record link may point at an alert outside the current selection; the drawer
   says so. */
let drawerKey = null;

function openDrawer(id) {
  if (!DATA.alerts.some((x) => x.id === id)) return;
  const already = !!state.record;
  state.record = id;
  if (!already) pushedRecord = id;
  update(already ? "replace" : "push", { render: false, historyState: already ? null : { rec: id } });
}

function closeDrawer() {
  if (!state.record) return;
  if (pushedRecord === state.record && history.state && history.state.rec === state.record) {
    pushedRecord = null;
    history.back();             // the popstate handler clears the record and closes the drawer
    return;
  }
  pushedRecord = null;
  state.record = null;
  update("replace", { render: false });
}

/* Show or hide the drawer from `state.record`. Rebuild it only when its content would change. */
function syncDrawer() {
  const drawer = document.getElementById("drawer");
  const overlay = document.getElementById("drawer-overlay");
  const a = state.record ? DATA.alerts.find((x) => x.id === state.record) : null;
  if (!a) {
    drawer.classList.add("hidden"); overlay.classList.add("hidden");
    drawerKey = null;
    return;
  }
  const inSelection = currentRows.some((r) => r.id === a.id);
  const key = `${a.id}|${state.lang}|${inSelection}`;
  if (key !== drawerKey) { fillDrawer(a, inSelection); drawerKey = key; }
  drawer.classList.remove("hidden"); overlay.classList.remove("hidden");
}

function fillDrawer(a, inSelection) {
  const metaRows = [
    ["f_initiator", a.initiator], ["f_judet", a.judet],
    ["f_risk_category", a.risk_category ? catLabel(a.risk_category) : null], ["f_risc_principal", a.risc_principal],
    ["f_risc_asociat", a.risc_asociat], ["f_severitate", a.severitate],
    ["f_urgenta", a.urgenta], ["f_categorie", a.categorie],
    ["f_tip_mesaj", a.tip_mesaj], ["f_cod_eveniment", a.cod_eveniment],
    ["f_tip_inregistrare", a.tip_inregistrare], ["f_audienta", a.audienta],
    ["f_meteo_color", a.meteo_color ? facetValueLabel("meteo_color", a.meteo_color) : null], ["f_status", a.status_trimitere],
    ["f_repeats", a.nr_repetitii], ["f_source", a.source_file],
  ].filter(([, v]) => v);

  // Extracted-entity chips (real fields only)
  const chips = [
    a.risk_category && { v: catLabel(a.risk_category), k: t("f_risk_category"), color: catColor(a.risk_category) },
    a.meteo_color && { v: facetValueLabel("meteo_color", a.meteo_color), k: t("f_meteo_color") },
    a.severitate && { v: a.severitate, k: t("f_severitate") },
    a.localities && a.localities.length && { v: a.localities.length, k: t("ent_places") },
    a.scope && { v: t(a.scope === "national" ? "scope_national" : "scope_county"), k: t("f_scope") },
    a.is_cancel && { v: t("status_cancel"), k: t("f_lifecycle") },
  ].filter(Boolean);
  const chipsHtml = chips.map((c) =>
    `<span class="ent-chip">${c.color ? `<span class="dot" style="background:${c.color}"></span>` : ""}<b>${esc(String(c.v))}</b><span class="ent-k">${esc(c.k)}</span></span>`
  ).join("");

  // Message: the requested language when it exists, else the original with a reason.
  const view = messageView(a, state.lang);
  const hasRo = !!a.msg_ro, hasEn = !!a.msg_en;
  const note = (v) => v.fallback === "unsplit" ? t("drawer_unsplit") : v.fallback === "missing" ? t("drawer_fallback") : "";
  const ml = a.message_language ? t("msglang_" + a.message_language) : "";
  const places = a.places || [];

  document.getElementById("drawer-body").innerHTML = `
    <div class="drawer-title">${esc(a.title || (a.risk_category ? catLabel(a.risk_category) : ""))}</div>
    <div class="drawer-sub">${esc(a.judet || "")} · ${esc(a.initiator || "")} · ${fmtTime(a.sent_at)}</div>
    ${inSelection ? "" : `<p class="drawer-context" id="drawer-context">${t("drawer_outside")}</p>`}
    <div class="status-row">${statusBadge(a)} ${sevBadge(a.severitate)}</div>
    ${chipsHtml ? `<div class="drawer-eyebrow">${t("drawer_entities")}</div><div class="drawer-chips">${chipsHtml}</div>` : ""}
    <div class="drawer-cols">
      <div class="drawer-col">
        <div class="msg-head"><h3>${t("detail_message")}</h3>
          <div class="msg-toggle">
            <button class="mt-btn${view.shown === "ro" ? " active" : ""}" data-lang="ro"${hasRo ? "" : " disabled"}>RO</button>
            <button class="mt-btn${view.shown === "en" ? " active" : ""}" data-lang="en"${hasEn ? "" : " disabled"}>EN</button>
          </div>
        </div>
        ${ml ? `<div class="msg-lang">${t("drawer_lang")}: ${esc(ml)}</div>` : ""}
        <div class="msg-block" id="drawer-msg">${esc(view.text)}</div>
        <div class="msg-note" id="drawer-msg-note">${esc(note(view))}</div>
        ${places.length ? `<h3>${t("detail_places")}</h3><div>${places.map((p) => `<span class="pill">${esc(placeLabel(p.siruta, true))}</span>`).join("")}</div>` : ""}
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

  // Wire the message language toggle (in place, no global re-render)
  const msgEl = document.getElementById("drawer-msg");
  const noteEl = document.getElementById("drawer-msg-note");
  document.querySelectorAll(".msg-toggle .mt-btn").forEach((b) => {
    b.addEventListener("click", () => {
      if (b.disabled) return;
      document.querySelectorAll(".msg-toggle .mt-btn").forEach((x) => x.classList.toggle("active", x === b));
      const v = messageView(a, b.dataset.lang);
      msgEl.textContent = v.text;
      noteEl.textContent = note(v);
    });
  });
}

/* ---- boot ---- the footer follows the scripts, so wait until the page is parsed */
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
