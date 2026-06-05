/* Feed view: filter chips, date-grouped chronological alert cards. */

/* Risk categories for feed filter chips */
const FEED_CHIPS = [
  { value: null, label: "feed_filter_all" },
  { value: "Animale periculoase", label: null, color: "#b07d3a" },
  { value: "Copil dispărut", label: null, color: "#d05ce3" },
  { value: "Atac aerian / dronă", label: null, color: "#d93b3b" },
  { value: "Inundații", label: null, color: "#2aa6c4" },
  { value: "Meteo", label: null, color: "#2a6fc4" },
  { value: "Incendiu", label: null, color: "#e3852b" },
  { value: "Tehnologic", label: null, color: "#9aa72b" },
];
let feedChipFilter = null; // null = all, or risk_category string

function renderFeed(rows, container) {
  feedChipFilter = null;
  container.innerHTML = `<div class="feed-view">
    <div class="filter-chips" id="feed-chips"></div>
    <div style="display:flex;gap:20px">
      <div id="feed-body" style="flex:1;min-width:0"></div>
      <div class="feed-sidebar" id="feed-sidebar" style="width:240px;flex-shrink:0"></div>
    </div>
  </div>`;
  buildFeedChips();
  renderFeedBody(rows);
  renderFeedSidebar(rows);
}

function buildFeedChips() {
  const host = document.getElementById("feed-chips");
  if (!host) return;
  host.innerHTML = FEED_CHIPS.map((c) => {
    const label = c.label ? t(c.label) : c.value;
    const dot = c.color ? `<span class="chip-dot" style="background:${c.color}"></span>` : "";
    const active = feedChipFilter === c.value ? " active" : "";
    return `<button class="filter-chip${active}" data-risk="${c.value || ""}">${dot}${label}</button>`;
  }).join("");
  host.addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-chip");
    if (!btn) return;
    const risk = btn.dataset.risk || null;
    feedChipFilter = risk;
    // Update active state
    host.querySelectorAll(".filter-chip").forEach((b) => b.classList.toggle("active", b.dataset.risk === (risk || "")));
    // Apply to filters
    const set = state.filters.risk_category;
    set.clear();
    if (risk) set.add(risk);
    // Also update sidebar checkbox
    document.querySelectorAll("#facets input[data-field='risk_category']").forEach((cb) => {
      cb.checked = risk ? cb.value === risk : false;
    });
    render();
  });
}

function renderFeedBody(rows) {
  const host = document.getElementById("feed-body");
  if (!host) return;
  if (!rows.length) {
    host.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠</div><p>${t("feed_no_alerts")}</p></div>`;
    return;
  }
  // Sort by sent_at descending
  const sorted = rows.slice().sort((a, b) => (b.sent_at || "").localeCompare(a.sent_at || ""));
  // Group by date
  const groups = new Map();
  for (const a of sorted) {
    const d = a.date || (a.sent_at ? a.sent_at.slice(0, 10) : "unknown");
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(a);
  }
  let html = "";
  for (const [date, alerts] of groups) {
    const label = formatDateHeader(date);
    html += `<div class="date-header">${label} · ${alerts.length} ${t("legend_alerts")}</div>`;
    for (const a of alerts) {
      html += feedCardHtml(a);
    }
  }
  host.innerHTML = html;
  host.querySelectorAll(".feed-card").forEach((card) => {
    card.addEventListener("click", () => openDrawer(+card.dataset.id));
  });
}

function formatDateHeader(dateStr) {
  if (!dateStr || dateStr === "unknown") return t("col_time");
  const [y, m, d] = dateStr.split("-");
  const monthsRo = ["", "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie", "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"];
  const monthsEn = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const mon = state.lang === "en" ? monthsEn[+m] : monthsRo[+m];
  return `${+d} ${mon} ${y}`;
}

function feedCardHtml(a) {
  const msg = state.lang === "en" ? (a.msg_en || a.msg || "") : (a.msg_ro || a.msg || "");
  return `<div class="feed-card" data-id="${a.id}">
    <div class="feed-card-header">
      <span class="feed-card-sender">${esc(a.initiator || "—")}</span>
      <span class="dot" style="background:${catColor(a.risk_category)}"></span>
      <span class="feed-card-risk">${esc(a.risk_category)}</span>
      <span class="feed-card-county">${esc(a.judet || "")}</span>
    </div>
    <div class="feed-card-msg">${esc(msg)}</div>
    <div class="feed-card-footer">
      <span class="feed-card-time">${fmtTime(a.sent_at)}</span>
      ${sevBadge(a.severitate)}
      ${statusBadge(a)}
    </div>
  </div>`;
}

function renderFeedSidebar(rows) {
  const host = document.getElementById("feed-sidebar");
  if (!host) return;
  const sent = rows.filter((a) => a.status_ok === true).length;
  const failed = rows.filter((a) => a.status_ok === false).length;
  const pct = rows.length ? Math.round((failed / rows.length) * 100) : 0;
  const catM = countBy(rows, "risk_category");
  const entries = [...catM.entries()].sort((a, b) => b[1] - a[1]);
  let breakdown = entries.map(([k, v]) => `<div class="feed-breakdown-item"><span>${esc(k)}</span><span>${v}</span></div>`).join("");
  host.innerHTML = `
    <div class="feed-sidebar-row"><span>${t("sent_label")}</span><span class="sent">${sent}</span></div>
    <div class="feed-sidebar-row"><span>${t("failed_label")}</span><span class="failed">${failed}</span></div>
    <div style="margin-top:8px;color:var(--text-muted);font-size:12px">
      ${pct}% ${t("kpi_error_rate").toLowerCase()} — ${pct >= 25 ? "STS" : ""}
    </div>
    <div class="feed-breakdown">
      <h4>${t("feed_by_type")}</h4>
      ${breakdown}
    </div>`;
}
