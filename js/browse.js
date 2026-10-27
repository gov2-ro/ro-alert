/* Browsing helpers shared by Table, Feed and Local: stable order, pages, the pager, and the
   JSON export of a selection. The first part is pure (no DOM), so Node tests load it too. */

const PAGE_SIZE = 50;
const EXPORT_SCHEMA = 1;

function compareById(a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }

/* The key of the default order: the send time. */
function timeKey(a) { return a.sent_at || ""; }

/* Sort the complete selection. Equal keys fall back to the alert id (ascending in both
   directions), so no record moves between pages when the same selection is drawn again. */
function sortRecords(rows, key, dir) {
  const d = dir === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const va = key(a), vb = key(b);
    if (va < vb) return -d;
    if (va > vb) return d;
    return compareById(a, b);
  });
}

/* Page arithmetic. `page` is clamped to 1..pages; `start` and `end` are 1-based and 0 when empty. */
function pageInfo(total, page, size) {
  const sz = size || PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(total / sz));
  const p = Math.min(Math.max(1, Math.floor(Number(page)) || 1), pages);
  const offset = (p - 1) * sz;
  return { total, pages, page: p, size: sz, offset, start: total ? offset + 1 : 0, end: Math.min(total, offset + sz) };
}

/* Alerts per calendar date over the complete selection: Map date -> count. */
function dateCounts(rows) {
  const m = new Map();
  for (const a of rows) {
    const d = a.date || (a.sent_at ? a.sent_at.slice(0, 10) : "unknown");
    m.set(d, (m.get(d) || 0) + 1);
  }
  return m;
}

/* The months (YYYY-MM) that the selected records come from. */
function selectionMonths(rows) {
  return [...new Set(rows.map((a) => (a.source_file || "").slice(0, 7)).filter(Boolean))].sort();
}

/* The selection as the export states it: filters, scope and language. No page, no open record. */
function describeSelection(st, sort, count) {
  const filters = {};
  for (const def of FACET_REGISTRY) {
    const set = st.filters[def.field];
    if (set && set.size) filters[def.field] = [...set].sort();
  }
  const place = st.selectedPlaceId != null && DATA.places.get(st.selectedPlaceId);
  return {
    view: st.view,
    language: st.lang,
    search: String(st.search || "").trim().replace(/\s+/g, " ") || null,
    date_from: st.dateFrom || null,
    date_to: st.dateTo || null,
    filters,
    county: st.selectedCounty || null,
    place: place ? { siruta: place.siruta, name: place.name, county: place.county } : null,
    sort: { key: sort.key, dir: sort.dir, tie_breaker: "id ascending" },
    count,
  };
}

/* The export envelope for a selection. `rows` is the complete selection; the records are the
   normalized alerts with their deliveries and original text, never workbook rows.
   `sortKeys` maps a sort key to its accessor (the Table columns). */
function buildExport(rows, st, sort, sortKeys, now) {
  const keyFn = (sortKeys && sortKeys[sort.key]) || timeKey;
  const records = sortRecords(rows, keyFn, sort.dir);
  const months = new Set(selectionMonths(records));
  const meta = DATA.meta;
  const s = Stats.selectionStats(records, meta.months || []);
  return {
    schema_version: EXPORT_SCHEMA,
    exported_at: (now || new Date()).toISOString(),
    selection: describeSelection(st, sort, records.length),
    sources: (meta.sources || []).filter((x) => months.has(x.month)),
    attribution: t("export_attribution"),
    coverage: {
      note: t("export_coverage_note"),
      archive_detail_records: meta.total,
      archive_period: { from: meta.date_min ? meta.date_min.slice(0, 10) : null, to: meta.date_max ? meta.date_max.slice(0, 10) : null },
      selected_records: records.length,
      delivery_reporting_months: s.reportingMonths,
      alerts_in_reporting_months: s.reportingAlerts,
      failed_alerts_observed: s.failedAlerts,
      alerts_outside_reporting_months: s.unknownAlerts,
      data_schema_version: meta.schema_version,
    },
    records,
  };
}

/* A descriptive file name: tool, count, period of the selected records, language. */
function exportFileName(rows, lang) {
  const dates = rows.map((a) => a.date).filter(Boolean).sort();
  const span = dates.length ? `${dates[0]}_${dates[dates.length - 1]}` : "no-dates";
  return `ro-alert-selection-${rows.length}-alerts-${span}-${lang}.json`;
}

/* ---- DOM helpers (browser only) ---- */

/* The range line, the page number and the previous/next buttons. `where` makes ids unique. */
function pagerHtml(info, where) {
  const prev = info.page > 1, next = info.page < info.pages;
  return `<nav class="pager" aria-label="${esc(t("pager_label"))}" data-pager="${where}">
    <span class="pager-range">${esc(fill(t("pager_range"), { a: fmtN(info.start), b: fmtN(info.end), n: fmtN(info.total) }))}</span>
    <button type="button" class="pager-btn" data-page-go="prev"${prev ? "" : " disabled"}><span aria-hidden="true">&larr;</span> ${esc(t("pager_prev"))}</button>
    <span class="pager-page">${esc(fill(t("pager_page"), { p: fmtN(info.page), n: fmtN(info.pages) }))}</span>
    <button type="button" class="pager-btn" data-page-go="next"${next ? "" : " disabled"}>${esc(t("pager_next"))} <span aria-hidden="true">&rarr;</span></button>
  </nav>`;
}

/* Export button with its status line. Disabled, with the reason, when nothing is selected. */
function exportHtml(count) {
  if (!count) {
    return `<div class="export-box"><button type="button" class="export-btn" disabled aria-describedby="export-why">${esc(t("export_btn"))}</button>
      <span class="export-note" id="export-why">${esc(t("export_none"))}</span></div>`;
  }
  return `<div class="export-box"><button type="button" class="export-btn" data-export aria-describedby="export-why">${esc(t("export_btn"))}</button>
    <span class="export-note" id="export-why">${esc(fill(t("export_note"), { n: fmtN(count) }))}</span>
    <span class="export-status" id="export-status" role="status" aria-live="polite"></span></div>`;
}

/* Move focus to the list heading and show the top of the list. Used after a page change. */
function focusListHeading() {
  const h = document.getElementById("list-heading");
  if (!h) return;
  h.focus({ preventScroll: true });
  h.scrollIntoView({ block: "start", behavior: "auto" });
}

function downloadText(text, filename, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);      // the download has started by then
}

/* Export the complete current selection (not only the visible page) as JSON. */
function exportSelection() {
  const status = document.getElementById("export-status");
  const say = (msg) => { if (status) status.textContent = msg; };
  try {
    if (!currentRows.length) { say(t("export_none")); return; }
    const sort = state.view === "table" ? tableSort() : DEFAULT_SORT;
    const keys = {};
    if (typeof TABLE_COLS !== "undefined") TABLE_COLS.forEach((c) => { keys[c.key] = c.sort; });
    const env = buildExport(currentRows, state, sort, keys, new Date());
    const name = exportFileName(currentRows, state.lang);
    downloadText(JSON.stringify(env), name, "application/json;charset=utf-8");
    say(fill(t("export_done"), { n: fmtN(env.records.length), f: name }));
  } catch (e) {
    say(t("export_failed"));
    if (window.console) console.error(e);
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { PAGE_SIZE, sortRecords, pageInfo, dateCounts, selectionMonths, exportFileName };
}
