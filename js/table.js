/* Console table view: dense, sortable metadata table of all dispatches.
   Modeled on the Claude Design "Direction A" wireframe, using v2's real
   fields and shared helpers (catColor, sevBadge, statusBadge, openDrawer). */

const TABLE_MAX = 500;

/* Column defs: i18n label, sort accessor, and cell HTML renderer. */
const TABLE_COLS = [
  { key: "time", label: "col_time", sort: (a) => a.sent_at || "", cell: (a) => `<span class="td-time">${fmtTime(a.sent_at)}</span>` },
  { key: "judet", label: "col_judet", sort: (a) => a.judet || "", cell: (a) => esc(a.judet || "—") },
  { key: "risk", label: "col_risk", sort: (a) => a.risk_category || "", cell: (a) => `<span class="td-risk"><span class="dot" style="background:${catColor(a.risk_category)}"></span>${esc(a.risk_category || "—")}</span>` },
  { key: "code", label: "col_code", sort: (a) => a.meteo_color || "", cell: (a) => a.meteo_color ? `<span class="td-code">${esc(a.meteo_color)}</span>` : "—" },
  { key: "sev", label: "col_sev", sort: (a) => a.severitate || "", cell: (a) => sevBadge(a.severitate) || "—" },
  { key: "status", label: "col_status", sort: (a) => (a.status_ok === false ? "0" : "1"), cell: (a) => statusBadge(a) },
  { key: "localities", label: "col_localities", sort: (a) => (a.localities || []).length, cell: (a) => localityCell(a.localities) },
  { key: "title", label: "col_title", sort: (a) => (a.title || "").toLowerCase(), cell: (a) => `<span class="td-title" title="${esc(a.title || "")}">${esc(a.title || a.risk_category || "—")}</span>` },
];

let tableSortKey = "time";
let tableSortDir = -1; // -1 desc, 1 asc
let tableRows = [];

function localityCell(locs) {
  if (!locs || !locs.length) return "—";
  const shown = locs.slice(0, 3).join(", ");
  const extra = locs.length > 3 ? ` +${locs.length - 3}` : "";
  return `<span class="td-loc" title="${esc(locs.join(", "))}">${esc(shown)}${extra}</span>`;
}

function renderTable(rows, container) {
  tableRows = rows;
  container.innerHTML = `
    <section class="kpis" id="kpis"></section>
    <section class="panel table-panel">
      <div class="table-head">
        <h2 data-i18n="view_table">${t("view_table")}</h2>
        <span class="table-legend">
          <span class="badge sent">${t("status_sent")}</span>
          <span class="badge error">${t("status_error")}</span>
        </span>
      </div>
      <div class="table-scroll">
        <table class="data-table"><thead id="table-head-row"></thead><tbody id="table-body"></tbody></table>
      </div>
      <div class="table-note" id="table-note"></div>
    </section>`;

  renderDashboardKpis(rows);
  renderTableHead();
  renderTableBody();
}

function renderTableHead() {
  const head = document.getElementById("table-head-row");
  if (!head) return;
  head.innerHTML = `<tr>${TABLE_COLS.map((c) => {
    const arrow = tableSortKey === c.key ? (tableSortDir > 0 ? "▲" : "▼") : "↕";
    return `<th data-key="${c.key}">${t(c.label)} <span class="th-arrow">${arrow}</span></th>`;
  }).join("")}</tr>`;
  head.querySelectorAll("th").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (tableSortKey === key) tableSortDir *= -1;
      else { tableSortKey = key; tableSortDir = key === "time" ? -1 : 1; }
      renderTableHead();
      renderTableBody();
    });
  });
}

function renderTableBody() {
  const body = document.getElementById("table-body");
  const note = document.getElementById("table-note");
  if (!body) return;
  const col = TABLE_COLS.find((c) => c.key === tableSortKey) || TABLE_COLS[0];
  const sorted = tableRows.slice().sort((a, b) => {
    const va = col.sort(a), vb = col.sort(b);
    if (va < vb) return -1 * tableSortDir;
    if (va > vb) return 1 * tableSortDir;
    return 0;
  });
  const shown = sorted.slice(0, TABLE_MAX);
  body.innerHTML = shown.map((a) => {
    const cls = a.status_ok === false ? " err-row" : "";
    return `<tr class="data-row${cls}" data-id="${a.id}">${TABLE_COLS.map((c) => `<td>${c.cell(a)}</td>`).join("")}</tr>`;
  }).join("");
  body.querySelectorAll(".data-row").forEach((tr) => {
    tr.addEventListener("click", () => openDrawer(tr.dataset.id));
  });
  if (note) note.textContent = sorted.length > TABLE_MAX ? `${shown.length} / ${sorted.length} — ${t("table_more_note")}` : "";
}
