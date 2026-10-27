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
    <div class="feed-layout">
      <div class="feed-sidebar" id="feed-sidebar"></div>
      <div id="feed-body" class="feed-body"></div>
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
  host.onclick = feedCardClick;
}

/* The card button gives keyboard access; a click anywhere on the card also opens the record. */
function feedCardClick(e) {
  const card = e.target.closest(".feed-card");
  if (card) openDrawer(card.dataset.id, e.target);
}

function formatDateHeader(dateStr) {
  if (!dateStr || dateStr === "unknown") return t("col_time");
  const [y, m, d] = dateStr.split("-");
  return `${+d} ${monthName(+m)} ${y}`;
}

function feedCardHtml(a) {
  const msg = messageView(a, state.lang).text;
  const name = [catLabel(a.risk_category), a.title, fmtTime(a.sent_at)].filter(Boolean).join(", ");
  return `<article class="feed-card" data-id="${esc(a.id)}" style="border-left:4px solid ${catColor(a.risk_category)}">
    <div class="feed-card-header">
      <span class="feed-card-sender">${esc(a.initiator || "—")}</span>
      <span class="dot" style="background:${catColor(a.risk_category)}" aria-hidden="true"></span>
      <button type="button" class="feed-card-risk card-open" data-open-id="${esc(a.id)}" aria-label="${esc(t("row_open").replace("%s", name))}">${esc(catLabel(a.risk_category))}</button>
      <span class="feed-card-county">${esc(a.judet || "")}</span>
    </div>
    <div class="feed-card-msg">${esc(msg)}</div>
    ${a.locations && a.locations.length ? `<div class="feed-card-locs loc-chips">${locChips(a.locations, { specificFirst: true, limit: 5 })}</div>` : ""}
    <div class="feed-card-footer">
      <span class="feed-card-time">${fmtTime(a.sent_at)}</span>
      ${sevBadge(a.severitate)}
      ${statusBadge(a)}
    </div>
  </article>`;
}

/* A compact summary of the selection. Delivery diagnostics are not repeated here: the coverage
   bar above the view links to them and to the method. */
function renderFeedSidebar(rows) {
  const host = document.getElementById("feed-sidebar");
  if (!host) return;
  const catM = countBy(rows, "risk_category");
  const entries = [...catM.entries()].sort((a, b) => b[1] - a[1]);
  const breakdown = entries.map(([k, v]) => `<div class="feed-breakdown-item"><span>${esc(catLabel(k))}</span><span>${fmtN(v)}</span></div>`).join("");
  host.innerHTML = `
    <div class="feed-sum">
      <h2>${t("feed_sum_title")}</h2>
      <div class="feed-sum-n">${fmtN(rows.length)} <span>${t("legend_alerts")}</span></div>
      <p class="chart-cap">${t("feed_sum_note")}<button type="button" class="link-btn" data-goto-sources>${t("cov_method")}</button></p>
    </div>
    <div class="feed-breakdown">
      <h2>${t("feed_by_type")}</h2>
      ${breakdown}
    </div>`;
}
