/* Feed view: filter chips, date-grouped chronological alert cards. */

/* Risk categories for the chips: the categories present in the data, in palette order. */
function feedChipValues() {
  const present = ((DATA.meta.facets || {}).risk_category || []).map((o) => o.value);
  const known = CATEGORIES.map((c) => c.value).filter((v) => present.includes(v));
  return known.concat(present.filter((v) => !CATEGORY_BY_VALUE.has(v)));
}

/* The shell is drawn once per visit to the view; updateFeed() refreshes its parts. */
function mountFeed(container) {
  container.innerHTML = `<div class="feed-view">
    <div class="filter-chips" id="feed-chips"></div>
    <div class="feed-layout">
      <div class="feed-sidebar" id="feed-sidebar"></div>
      <div class="feed-main">
        <div class="feed-head">
          <h2 id="list-heading" tabindex="-1" data-i18n="list_heading_feed">${esc(t("list_heading_feed"))}</h2>
          <div class="list-tools" id="list-tools"></div>
        </div>
        <div id="pager-top"></div>
        <div id="feed-body" class="feed-body"></div>
        <div id="pager-bottom"></div>
      </div>
    </div>
  </div>`;
  document.getElementById("feed-body").addEventListener("click", feedCardClick);     // one handler for all cards
}

function updateFeed(rows, opts = {}) {
  if (!opts.listOnly) { buildFeedChips(); renderFeedSidebar(rows); }
  renderFeedBody(rows);
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

/* One page of the complete selection, newest first (ties by id). */
function renderFeedBody(rows) {
  const host = document.getElementById("feed-body");
  if (!host) return;
  if (!rows.length) {
    host.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠</div><p>${t("feed_no_alerts")}</p></div>`;
    return;
  }
  const sorted = sortRecords(rows, timeKey, "desc");
  const info = pageInfo(sorted.length, state.page);
  host.innerHTML = recordListHtml(sorted.slice(info.offset, info.offset + info.size), dateCounts(rows));
  document.getElementById("pager-top").innerHTML = pagerHtml(info, "top");
  document.getElementById("pager-bottom").innerHTML = pagerHtml(info, "bottom");
  document.getElementById("list-tools").innerHTML = exportHtml(sorted.length);
}

/* Cards of one page, grouped by date. A date can continue on another page, so its header
   says how many of the day's alerts this page shows when that is not all of them.
   `dayTotals` is the Map date -> count over the complete selection. */
function recordListHtml(pageRows, dayTotals) {
  const groups = new Map();
  for (const a of pageRows) {
    const d = a.date || (a.sent_at ? a.sent_at.slice(0, 10) : "unknown");
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(a);
  }
  let html = "";
  for (const [date, alerts] of groups) {
    const total = dayTotals.get(date) || alerts.length;
    const label = formatDateHeader(date);
    const text = alerts.length === total
      ? `${label} · ${fmtN(total)} ${t("legend_alerts")}`
      : fill(t("feed_day_part"), { d: label, s: fmtN(alerts.length), n: fmtN(total) });
    html += `<div class="date-header">${esc(text)}</div>`;
    for (const a of alerts) html += feedCardHtml(a);
  }
  return html;
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
