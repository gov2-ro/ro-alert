/* Sidebar: filter sections, search, date range, stats. */

let sidebarMode = "briefing"; // "briefing" (default) | "console"

function buildSidebar() {
  buildDateRange();
  buildFacets();
  wireSidebarTabs();
  updateSidebarVisibility();
}

function buildDateRange() {
  const wrap = document.getElementById("date-range");
  if (!wrap) return;
  const min = DATA.meta.date_min ? DATA.meta.date_min.slice(0, 10) : "";
  const max = DATA.meta.date_max ? DATA.meta.date_max.slice(0, 10) : "";
  wrap.innerHTML = `
    <input type="date" id="date-from" min="${min}" max="${max}" value="${min}" data-i18n-label="date_from_label" aria-label="${esc(t("date_from_label"))}">
    <span aria-hidden="true">–</span>
    <input type="date" id="date-to" min="${min}" max="${max}" value="${max}" data-i18n-label="date_to_label" aria-label="${esc(t("date_to_label"))}">`;
  document.getElementById("date-from").addEventListener("change", (e) => setDateBound("dateFrom", e.target.value));
  document.getElementById("date-to").addEventListener("change", (e) => setDateBound("dateTo", e.target.value));
}

/* Set one date bound from an input. A reversed range is refused with a visible notice; the
   inputs then show the state again. */
function setDateBound(key, value) {
  const next = { dateFrom: state.dateFrom, dateTo: state.dateTo, [key]: value || null };
  if (next.dateFrom && next.dateTo && next.dateFrom > next.dateTo) {
    addNotice("range", [next.dateFrom, next.dateTo]);
    syncSidebar();
    return;
  }
  state.dateFrom = next.dateFrom;
  state.dateTo = next.dateTo;
  state.page = 1;
  update("push");
}

function buildFacets() {
  const host = document.getElementById("facets");
  if (!host) return;
  host.innerHTML = "";
  FACET_REGISTRY.forEach((def) => {
    const opts = DATA.meta.facets[def.meta] || [];
    if (!opts.length) return;
    const facet = document.createElement("div");
    facet.className = "facet" + (def.open ? "" : " collapsed");
    facet.dataset.facetField = def.field;
    facet.dataset.briefing = def.briefing ? "1" : "0";
    const body = opts.map((o) => {
      const isErr = def.field === "status_trimitere" && o.value === "ERROR";
      return `<label class="facet-opt${isErr ? " sel-error" : ""}">
        <input type="checkbox" value="${esc(o.value)}" data-field="${def.field}">
        <span class="lbl" title="${esc(o.value)}"></span>
        <span class="cnt" title="${esc(t("facet_counts_title"))}">${o.count}</span>
      </label>`;
    }).join("");
    facet.innerHTML = `
      <button type="button" class="facet-head" aria-expanded="${def.open ? "true" : "false"}" aria-controls="facet-body-${def.field}"><span data-i18n="${def.label}">${t(def.label)}</span><span class="chev" aria-hidden="true">▾</span></button>
      <div class="facet-body" id="facet-body-${def.field}" role="group" aria-labelledby="facet-head-${def.field}">${body}</div>`;
    const head = facet.querySelector(".facet-head");
    head.id = "facet-head-" + def.field;
    head.addEventListener("click", () => {
      facet.classList.toggle("collapsed");
      head.setAttribute("aria-expanded", String(!facet.classList.contains("collapsed")));
    });
    facet.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const set = state.filters[cb.dataset.field];
        cb.checked ? set.add(cb.value) : set.delete(cb.value);
        state.page = 1;
        update("push");
      });
    });
    host.appendChild(facet);
  });
}

/* Controls show what `state` says, after every render and history event. */
function syncSidebar() {
  document.querySelectorAll("#facets input[type=checkbox]").forEach((cb) => {
    const set = state.filters[cb.dataset.field];
    cb.checked = !!(set && set.has(cb.value));
    const lbl = cb.parentElement.querySelector(".lbl");
    const text = facetValueLabel(cb.dataset.field, cb.value);
    if (lbl.textContent !== text) lbl.textContent = text;
    cb.parentElement.querySelector(".cnt").title = t("facet_counts_title");
  });
  const search = document.getElementById("search");
  if (search && document.activeElement !== search && search.value !== (state.search || "")) search.value = state.search || "";
  const df = document.getElementById("date-from"), dt = document.getElementById("date-to");
  const min = DATA.meta.date_min ? DATA.meta.date_min.slice(0, 10) : "";
  const max = DATA.meta.date_max ? DATA.meta.date_max.slice(0, 10) : "";
  if (df) df.value = state.dateFrom || min;
  if (dt) dt.value = state.dateTo || max;
  document.querySelectorAll(".stab").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === sidebarMode);
    b.setAttribute("aria-pressed", String(b.dataset.mode === sidebarMode));
  });
  updateSidebarVisibility();
}

function wireSidebarTabs() {
  document.querySelectorAll(".stab").forEach((btn) => {
    btn.addEventListener("click", () => {
      sidebarMode = btn.dataset.mode;
      document.querySelectorAll(".stab").forEach((b) => { b.classList.toggle("active", b === btn); b.setAttribute("aria-pressed", String(b === btn)); });
      updateSidebarVisibility();
    });
  });
}

function updateSidebarVisibility() {
  document.querySelectorAll(".facet").forEach((f) => {
    if (sidebarMode === "briefing" && f.dataset.briefing === "0") {
      f.style.display = "none";
    } else {
      f.style.display = "";
    }
  });
}

/* The sidebar shows controls, the active selection (the strip) and one result count.
   Failure and status figures live in the view, once. */
function renderSidebarStats(rows) {
  const host = document.getElementById("sidebar-stats");
  if (!host) return;
  host.textContent = `${fmtN(rows.length)} ${t("results")}`;
}
