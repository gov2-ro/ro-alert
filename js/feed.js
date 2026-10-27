/* Feed view: filter chips, date-grouped chronological alert cards. */

/* Risk categories for the chips: the categories present in the data, in palette order. */
function feedChipValues() {
  const present = ((DATA.meta.facets || {}).risk_category || []).map((o) => o.value);
  const known = CATEGORIES.map((c) => c.value).filter((v) => present.includes(v));
  return known.concat(present.filter((v) => !CATEGORY_BY_VALUE.has(v)));
}

function renderFeed(rows, container) {
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

/* The chips show the risk facet of `state`; they keep no filter of their own.
   A category chip replaces the risk selection with that category. "All" clears only the risk
   facet. With several risk values selected, each of them shows as selected and "All" does not. */
function buildFeedChips() {
  const host = document.getElementById("feed-chips");
  if (!host) return;
  const set = state.filters.risk_category;
  const chip = (value, label, color) => {
    const on = value === null ? set.size === 0 : set.has(value);
    const dot = color ? `<span class="chip-dot" style="background:${color}"></span>` : "";
    return `<button type="button" class="filter-chip${on ? " active" : ""}" aria-pressed="${on}" data-risk="${esc(value || "")}">${dot}${esc(label)}</button>`;
  };
  host.innerHTML = chip(null, t("feed_filter_all"), null) +
    feedChipValues().map((v) => chip(v, catLabel(v), catColor(v))).join("");
  host.onclick = (e) => {
    const btn = e.target.closest(".filter-chip");
    if (!btn) return;
    const risk = btn.dataset.risk || null;
    set.clear();
    if (risk) set.add(risk);
    state.page = 1;
    update("push");
  };
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
    card.addEventListener("click", () => openDrawer(card.dataset.id));
  });
}

function formatDateHeader(dateStr) {
  if (!dateStr || dateStr === "unknown") return t("col_time");
  const [y, m, d] = dateStr.split("-");
  return `${+d} ${monthName(+m)} ${y}`;
}

function feedCardHtml(a) {
  const msg = messageView(a, state.lang).text;
  return `<div class="feed-card" data-id="${a.id}" style="border-left:4px solid ${catColor(a.risk_category)}">
    <div class="feed-card-header">
      <span class="feed-card-sender">${esc(a.initiator || "—")}</span>
      <span class="dot" style="background:${catColor(a.risk_category)}"></span>
      <span class="feed-card-risk">${esc(catLabel(a.risk_category))}</span>
      <span class="feed-card-county">${esc(a.judet || "")}</span>
    </div>
    <div class="feed-card-msg">${esc(msg)}</div>
    ${a.locations && a.locations.length ? `<div class="feed-card-locs loc-chips">${locChips(a.locations, { specificFirst: true, limit: 5 })}</div>` : ""}
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
  const catM = countBy(rows, "risk_category");
  const entries = [...catM.entries()].sort((a, b) => b[1] - a[1]);
  let breakdown = entries.map(([k, v]) => `<div class="feed-breakdown-item"><span>${esc(catLabel(k))}</span><span>${v}</span></div>`).join("");
  host.innerHTML = `
    <div class="feed-sidebar-row"><span>${t("sent_label")}</span><span class="sent">${sent}</span></div>
    <div class="feed-sidebar-row"><span>${t("failed_label")}</span><span class="failed">${failed}</span></div>
    <div class="fail-text" style="margin-top:8px;color:var(--text-muted);font-size:12px">${failureLinesHtml(rows)}</div>
    <div class="feed-breakdown">
      <h4>${t("feed_by_type")}</h4>
      ${breakdown}
    </div>`;
}
