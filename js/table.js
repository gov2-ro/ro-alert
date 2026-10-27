/* Console table view: dense, sortable metadata table of all dispatches.
   Modeled on the Claude Design "Direction A" wireframe, using v2's real
   fields and shared helpers (catColor, sevBadge, statusBadge, openDrawer). */

/* Column defs: i18n label, sort accessor, and cell HTML renderer. */
const TABLE_COLS = [
  { key: "time", label: "col_time", sort: (a) => a.sent_at || "", cell: (a) => `<button type="button" class="row-open td-time" data-open-id="${esc(a.id)}" aria-label="${esc(t("row_open").replace("%s", (a.title || (a.risk_category ? catLabel(a.risk_category) : "")) + ", " + fmtTime(a.sent_at)))}">${fmtTime(a.sent_at)}</button>` },
  { key: "judet", label: "col_judet", sort: (a) => a.judet || "", cell: (a) => esc(a.judet || "—") },
  { key: "risk", label: "col_risk", sort: (a) => a.risk_category || "", cell: (a) => `<span class="td-risk"><span class="dot" style="background:${catColor(a.risk_category)}"></span>${esc(a.risk_category ? catLabel(a.risk_category) : "—")}</span>` },
  { key: "code", label: "col_code", sort: (a) => a.meteo_color || "", cell: (a) => a.meteo_color ? `<span class="td-code">${esc(facetValueLabel("meteo_color", a.meteo_color))}</span>` : "—" },
  { key: "sev", label: "col_sev", sort: (a) => a.severitate || "", cell: (a) => sevBadge(a.severitate) || "—" },
  { key: "status", label: "col_status", sort: (a) => (a.status_ok === false ? "0" : "1"), cell: (a) => statusBadge(a) },
  { key: "localities", label: "col_localities", sort: (a) => (a.localities || []).length, cell: (a) => localityCell(a.localities) },
  { key: "title", label: "col_title", sort: (a) => (a.title || "").toLowerCase(), cell: (a) => `<span class="td-title" title="${esc(a.title || "")}">${esc(a.title || (a.risk_category ? catLabel(a.risk_category) : "—"))}</span>` },
];

/* The sort is state (`state.sort`, URL keys sort and dir); null means the default, newest first. */
function tableSort() { return state.sort || DEFAULT_SORT; }
let tableRows = [];

function localityCell(locs) {
  if (!locs || !locs.length) return "—";
  const shown = locs.slice(0, 3).join(", ");
  const extra = locs.length > 3 ? ` +${locs.length - 3}` : "";
  return `<span class="td-loc" title="${esc(locs.join(", "))}">${esc(shown)}${extra}</span>`;
}

/* The shell is drawn once per visit to the view; updateTable() refreshes its parts. */
function mountTable(container) {
  container.innerHTML = `
    <section class="kpis" id="kpis"></section>
    <section class="panel table-panel">
      <div class="table-head">
        <h2 id="list-heading" tabindex="-1" data-i18n="view_table">${t("view_table")}</h2>
        <span class="table-legend">
          <span class="badge sent" data-i18n="status_sent">${t("status_sent")}</span>
          <span class="badge error" data-i18n="status_error">${t("status_error")}</span>
        </span>
      </div>
      <div class="list-tools" id="list-tools"></div>
      <div id="pager-top"></div>
      <div class="table-scroll" tabindex="0" role="region" data-i18n-label="table_region" aria-label="${esc(t("table_region"))}">
        <table class="data-table"><caption class="sr-only" data-i18n="table_caption">${esc(t("table_caption"))}</caption><thead id="table-head-row"></thead><tbody id="table-body"></tbody></table>
      </div>
      <div id="pager-bottom"></div>
    </section>`;
  // Delegated handlers, wired once: one per list, none per row.
  document.getElementById("table-head-row").addEventListener("click", (e) => {
    const btn = e.target.closest(".sort-btn");
    if (!btn) return;
    const key = btn.dataset.key;
    const cur = tableSort();
    state.sort = cur.key === key
      ? { key, dir: cur.dir === "asc" ? "desc" : "asc" }
      : { key, dir: key === "time" ? "desc" : "asc" };
    update("replace", { listOnly: true });          // a new order resets the page (selectionKey)
    const again = document.querySelector(`#table-head-row .sort-btn[data-key="${key}"]`);
    if (again) again.focus();                        // the header was rebuilt; keep the keyboard place
  });
  // One handler: the row button gives keyboard access; a click anywhere in the row also opens it.
  document.getElementById("table-body").addEventListener("click", (e) => {
    const tr = e.target.closest(".data-row");
    if (tr) openDrawer(tr.dataset.id, e.target);
  });
}

function updateTable(rows, opts = {}) {
  tableRows = rows;
  if (!opts.listOnly) renderDashboardKpis(rows);
  renderTableHead();
  renderTableBody();
}

function renderTableHead() {
  const head = document.getElementById("table-head-row");
  if (!head) return;
  head.innerHTML = `<tr>${TABLE_COLS.map((c) => {
    const cur = tableSort();
    const on = cur.key === c.key;
    const arrow = on ? (cur.dir === "asc" ? "▲" : "▼") : "↕";
    const aria = on ? ` aria-sort="${cur.dir === "asc" ? "ascending" : "descending"}"` : "";
    return `<th scope="col" data-key="${c.key}"${aria}><button type="button" class="sort-btn" data-key="${c.key}" aria-label="${esc(t("sort_by").replace("%s", t(c.label)))}">${t(c.label)} <span class="th-arrow" aria-hidden="true">${arrow}</span></button></th>`;
  }).join("")}</tr>`;
}

/* Sort the complete selection, then show one page of it. */
function renderTableBody() {
  const body = document.getElementById("table-body");
  if (!body) return;
  const cur = tableSort();
  const col = TABLE_COLS.find((c) => c.key === cur.key) || TABLE_COLS[0];
  const sorted = sortRecords(tableRows, col.sort, cur.dir);
  const info = pageInfo(sorted.length, state.page);
  body.innerHTML = sorted.slice(info.offset, info.offset + info.size).map((a) => {
    const cls = a.status_ok === false ? " err-row" : "";
    return `<tr class="data-row${cls}" data-id="${esc(a.id)}">${TABLE_COLS.map((c) => `<td>${c.cell(a)}</td>`).join("")}</tr>`;
  }).join("");
  document.getElementById("pager-top").innerHTML = pagerHtml(info, "top");
  document.getElementById("pager-bottom").innerHTML = pagerHtml(info, "bottom");
  document.getElementById("list-tools").innerHTML = exportHtml(sorted.length);
}
