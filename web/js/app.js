/* Orchestrates state, sidebar, KPIs, table, detail drawer, views. */

window.state = {
  lang: "ro",
  view: "national",
  filters: {},            // field -> Set(values)
  search: "",
  dateFrom: null,
  dateTo: null,
  localJudet: null,
  localLocality: null,
  sort: { field: "sent_at", dir: "desc" },
};
FACET_DEFS.forEach((d) => (state.filters[d.field] = new Set()));

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ---------------- init ---------------- */
async function init() {
  await loadData();
  applyI18n();
  buildDateRange();
  buildFacets();
  initMap(DATA.geo);
  RoMap.onCountyClick = onCountyClick;
  buildLocalPicker();
  wireChrome();
  renderDateLabel();
  render();
}

function renderDateLabel() {
  const m = DATA.meta;
  if (!m.date_min) return;
  const fmt = (iso) => iso.slice(0, 10);
  $("#daterange-label").textContent = `${fmt(m.date_min)} → ${fmt(m.date_max)}`;
}

/* ---------------- sidebar ---------------- */
function buildDateRange() {
  const wrap = document.createElement("div");
  wrap.className = "facet";
  const min = DATA.meta.date_min ? DATA.meta.date_min.slice(0, 10) : "";
  const max = DATA.meta.date_max ? DATA.meta.date_max.slice(0, 10) : "";
  wrap.innerHTML = `
    <div class="facet-head"><span>${t("col_time")}</span></div>
    <div class="facet-body" style="display:flex;gap:6px;align-items:center">
      <input type="date" id="date-from" min="${min}" max="${max}" value="${min}" style="flex:1;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px">
      <span style="color:var(--muted)">–</span>
      <input type="date" id="date-to" min="${min}" max="${max}" value="${max}" style="flex:1;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px">
    </div>`;
  $("#facets").appendChild(wrap);
  wrap.querySelector("#date-from").addEventListener("change", (e) => {
    state.dateFrom = e.target.value || null; render();
  });
  wrap.querySelector("#date-to").addEventListener("change", (e) => {
    state.dateTo = e.target.value || null; render();
  });
}

function buildFacets() {
  const host = $("#facets");
  FACET_DEFS.forEach((def) => {
    const opts = DATA.meta.facets[def.meta] || [];
    if (!opts.length) return;
    const facet = document.createElement("div");
    facet.className = "facet" + (def.open ? "" : " collapsed");
    const body = opts.map((o) => {
      const isErr = def.field === "status_trimitere" && o.value === "ERROR";
      return `<label class="facet-opt${isErr ? " sel-error" : ""}">
        <input type="checkbox" value="${esc(o.value)}" data-field="${def.field}">
        <span class="lbl" title="${esc(o.value)}">${esc(o.value)}</span>
        <span class="cnt">${o.count}</span>
      </label>`;
    }).join("");
    facet.innerHTML = `
      <button class="facet-head"><span>${t(def.label)}</span><span class="chev">▾</span></button>
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

/* ---------------- local picker ---------------- */
function buildLocalPicker() {
  const selJ = $("#sel-judet");
  const counties = Object.keys(DATA.meta.judet_counts).sort((a, b) => a.localeCompare(b, "ro"));
  selJ.innerHTML = `<option value="">${t("choose_judet")}</option>` +
    counties.map((c) => `<option value="${esc(c)}">${esc(c)} (${DATA.meta.judet_counts[c]})</option>`).join("");
  selJ.addEventListener("change", () => {
    state.localJudet = selJ.value || null;
    state.localLocality = null;
    fillLocalities();
    render();
  });
  $("#sel-locality").addEventListener("change", (e) => {
    state.localLocality = e.target.value || null;
    render();
  });
}

function fillLocalities() {
  const sel = $("#sel-locality");
  const locs = (DATA.meta.localities_by_judet[state.localJudet] || [])
    .slice().sort((a, b) => a.localeCompare(b, "ro"));
  sel.innerHTML = `<option value="">${t("all_localities")}</option>` +
    locs.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join("");
}

/* ---------------- chrome (lang, view, search, sort, drawer) ---------------- */
function wireChrome() {
  $("#langtoggle").addEventListener("click", (e) => {
    const b = e.target.closest(".lbtn"); if (!b) return;
    state.lang = b.dataset.lang;
    document.querySelectorAll(".lbtn").forEach((x) => x.classList.toggle("active", x === b));
    applyI18n();
    relabelDynamic();
    render();
  });
  $("#viewswitch").addEventListener("click", (e) => {
    const b = e.target.closest(".vbtn"); if (!b) return;
    state.view = b.dataset.view;
    document.querySelectorAll(".vbtn").forEach((x) => x.classList.toggle("active", x === b));
    $("#local-picker").classList.toggle("hidden", state.view !== "local");
    if (state.view === "national") { state.localJudet = null; state.localLocality = null; $("#sel-judet").value = ""; }
    render();
  });
  $("#search").addEventListener("input", (e) => { state.search = e.target.value; render(); });
  $("#clear-all").addEventListener("click", clearAll);
  document.querySelectorAll("th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const f = th.dataset.sort;
      if (state.sort.field === f) state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
      else state.sort = { field: f, dir: "asc" };
      renderTable(currentRows);
    });
  });
  $("#drawer-close").addEventListener("click", closeDrawer);
  $("#drawer-overlay").addEventListener("click", closeDrawer);
}

function relabelDynamic() {
  // rebuild facet headers + date labels in the new language
  document.querySelectorAll(".facet").forEach((f) => {});
  // simplest: facet titles use t() at build time; rebuild needed → re-translate headers
  const heads = document.querySelectorAll(".facet-head span:first-child");
  // date-range facet is first
  let idx = 0;
  heads.forEach((h, i) => {
    if (i === 0) { h.textContent = t("col_time"); return; }
    const def = FACET_DEFS[i - 1];
    if (def) h.textContent = t(def.label);
  });
  // local picker localities "all" option
  if (state.localJudet) fillLocalities();
  $("#sel-judet").querySelector("option").textContent = t("choose_judet");
}

function clearAll() {
  Object.values(state.filters).forEach((s) => s.clear());
  document.querySelectorAll("#facets input[type=checkbox]").forEach((cb) => (cb.checked = false));
  state.search = ""; $("#search").value = "";
  const min = DATA.meta.date_min.slice(0, 10), max = DATA.meta.date_max.slice(0, 10);
  state.dateFrom = null; state.dateTo = null;
  if ($("#date-from")) { $("#date-from").value = min; $("#date-to").value = max; }
  render();
}

function onCountyClick(name) {
  if (state.view === "local") {
    state.localJudet = name; state.localLocality = null;
    // map ASCII feature name to data judet key
    const match = Object.keys(DATA.meta.judet_counts).find((j) => countyKey(j) === countyKey(name));
    if (match) { state.localJudet = match; $("#sel-judet").value = match; fillLocalities(); }
    render();
    return;
  }
  // national: toggle judet facet
  const match = Object.keys(DATA.meta.judet_counts).find((j) => countyKey(j) === countyKey(name));
  if (!match) return;
  const set = state.filters.judet;
  set.has(match) ? set.delete(match) : set.add(match);
  const cb = document.querySelector(`#facets input[data-field="judet"][value="${cssEsc(match)}"]`);
  if (cb) cb.checked = set.has(match);
  render();
}
function cssEsc(s) { return s.replace(/["\\]/g, "\\$&"); }

/* ---------------- render ---------------- */
let currentRows = [];
function render() {
  const rows = applyFilters(DATA.alerts, state);
  currentRows = rows;
  renderKpis(rows);
  renderCharts(rows);
  updateMap(rows, state.view === "local" ? state.localJudet : null);
  renderTable(rows);
  $("#result-count").textContent = `${rows.length} ${t("results")}`;
}

function renderKpis(rows) {
  const total = rows.length;
  const sent = rows.filter((a) => a.status_ok === true).length;
  const err = rows.filter((a) => a.status_ok === false).length;
  const cancel = rows.filter((a) => a.is_cancel).length;
  const counties = new Set(rows.filter((a) => a.scope === "county").map((a) => a.judet)).size;
  const catM = countBy(rows, "risk_category");
  const topCat = [...catM.entries()].sort((a, b) => b[1] - a[1])[0];
  const rate = total ? Math.round((err / total) * 100) : 0;
  const cards = [
    { k: "kpi_total", v: total },
    { k: "kpi_sent", v: sent, cls: "ok" },
    { k: "kpi_error", v: err, cls: "err" },
    { k: "kpi_error_rate", v: rate + "%", cls: rate >= 25 ? "err" : "" },
    { k: "kpi_cancel", v: cancel },
    { k: "kpi_counties", v: counties },
    { k: "kpi_toprisk", v: topCat ? topCat[0] : "—", small: true },
  ];
  $("#kpis").innerHTML = cards.map((c) =>
    `<div class="kpi ${c.cls || ""}"><div class="v" style="${c.small ? "font-size:16px" : ""}">${esc(c.v)}</div><div class="k">${t(c.k)}</div></div>`
  ).join("");
}

function renderTable(rows) {
  const { field, dir } = state.sort;
  const sorted = rows.slice().sort((a, b) => {
    let va = a[field], vb = b[field];
    va = va == null ? "" : va; vb = vb == null ? "" : vb;
    if (va < vb) return dir === "asc" ? -1 : 1;
    if (va > vb) return dir === "asc" ? 1 : -1;
    return 0;
  });
  const body = $("#alerts-tbody");
  if (!sorted.length) {
    body.innerHTML = `<tr><td colspan="6" class="muted" style="padding:24px;text-align:center">${t("no_results")}</td></tr>`;
  } else {
    body.innerHTML = sorted.map((a) => rowHtml(a)).join("");
    body.querySelectorAll("tr[data-id]").forEach((tr) =>
      tr.addEventListener("click", () => openDrawer(+tr.dataset.id)));
  }
  $("#table-count").textContent = `${sorted.length} ${t("results")}`;
}

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
    ? `<span class="badge error">ERROR</span>`
    : `<span class="badge sent">SENT</span>`;
  if (a.is_cancel) h += ` <span class="badge cancel">CANCEL</span>`;
  return h;
}
function msgText(a) {
  if (state.lang === "en") return a.msg_en || a.msg || "";
  return a.msg_ro || a.msg || "";
}
function rowHtml(a) {
  return `<tr data-id="${a.id}">
    <td class="nowrap">${fmtTime(a.sent_at)}</td>
    <td class="nowrap">${esc(a.judet)}</td>
    <td><span class="dot" style="background:${catColor(a.risk_category)}"></span>${esc(a.risk_category)}</td>
    <td>${sevBadge(a.severitate)}</td>
    <td class="nowrap">${statusBadge(a)}</td>
    <td class="msg-cell"><div class="clip">${esc(msgText(a))}</div></td>
  </tr>`;
}

/* ---------------- detail drawer ---------------- */
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

  const times = [
    ["f_created", a.data_creare], ["f_sent", a.sent_at ? fmtTime(a.sent_at) : null],
    ["f_expires", a.data_expirare],
  ].filter(([, v]) => v);

  let msgBlocks = "";
  if (a.msg_ro) msgBlocks += `<div class="msg-block">${esc(a.msg_ro)}</div>`;
  if (a.msg_en && a.msg_en !== a.msg_ro) msgBlocks += `<div class="msg-block" style="margin-top:8px">${esc(a.msg_en)}</div>`;
  if (!msgBlocks) msgBlocks = `<div class="msg-block">${esc(a.msg || "—")}</div>`;

  const colorTag = a.meteo_color ? ` <span class="color-${countyKey(a.meteo_color)}">● ${esc(a.meteo_color)}</span>` : "";

  $("#drawer-body").innerHTML = `
    <div class="drawer-title">${esc(a.title || a.risk_category)}</div>
    <div class="drawer-sub">${esc(a.judet)} · ${esc(a.initiator || "")} · ${fmtTime(a.sent_at)}${colorTag}</div>
    <div>${statusBadge(a)} ${sevBadge(a.severitate)}</div>
    <h3>${t("detail_message")}</h3>${msgBlocks}
    ${a.localities && a.localities.length ? `<h3>${t("detail_localities")}</h3><div>${a.localities.map((l) => `<span class="pill">${esc(l)}</span>`).join("")}</div>` : ""}
    ${a.poligoane ? `<h3>${t("detail_polygons")}</h3><div>${a.poligoane.split(",").map((p) => `<span class="pill">${esc(p.trim())}</span>`).join("")}</div>` : ""}
    ${times.length ? `<h3>${t("detail_times")}</h3><div class="meta-grid">${times.map(([k, v]) => `<div class="mk">${t(k)}</div><div>${esc(v)}</div>`).join("")}</div>` : ""}
    <h3>${t("detail_meta")}</h3>
    <div class="meta-grid">${metaRows.map(([k, v]) => `<div class="mk">${t(k)}</div><div>${esc(v)}</div>`).join("")}</div>`;

  $("#drawer").classList.remove("hidden");
  $("#drawer-overlay").classList.remove("hidden");
}
function closeDrawer() {
  $("#drawer").classList.add("hidden");
  $("#drawer-overlay").classList.add("hidden");
}

init();
