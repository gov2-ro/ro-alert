/* Accessibility helpers: the phone filter drawer, focus capture and restore, the skip link,
   the header height variable. The filter drawer reuses the sidebar element and its controls;
   it owns no filter state (the controls derive from `state`). */

const MOBILE_MQ = window.matchMedia("(max-width: 768px)");
const REDUCED_MQ = window.matchMedia("(prefers-reduced-motion: reduce)");
let filtersTrigger = null;

function filtersOpen() { return document.getElementById("sidebar").classList.contains("open"); }

function focusables(root) {
  return [...root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/* Everything outside the open drawer becomes inert, so focus and the screen reader stay inside. */
function setBackgroundInert(on) {
  ["topnav", "main-col", "site-footer", "skip-link"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) { if (on) el.setAttribute("inert", ""); else el.removeAttribute("inert"); }
  });
}

function openFilters() {
  if (!MOBILE_MQ.matches || filtersOpen()) return;
  const sb = document.getElementById("sidebar");
  filtersTrigger = document.getElementById("open-filters");
  sb.classList.add("open");
  sb.setAttribute("role", "dialog");
  sb.setAttribute("aria-modal", "true");
  document.getElementById("open-filters").setAttribute("aria-expanded", "true");
  setBackgroundInert(true);
  document.documentElement.classList.add("lock-scroll");
  document.getElementById("filters-title").focus();
}

function closeFilters() {
  if (!filtersOpen()) return;
  const sb = document.getElementById("sidebar");
  sb.classList.remove("open");
  sb.removeAttribute("role");
  sb.removeAttribute("aria-modal");
  document.getElementById("open-filters").setAttribute("aria-expanded", "false");
  setBackgroundInert(false);
  document.documentElement.classList.remove("lock-scroll");
  const back = filtersTrigger && filtersTrigger.isConnected ? filtersTrigger : document.getElementById("content-main");
  filtersTrigger = null;
  if (back) back.focus();
}

/* ---- focus capture and restore for rerendered views ---- */
const FOCUS_ATTRS = ["data-risk", "data-place", "data-key", "data-open-id", "data-view", "data-lang", "data-mode"];

function focusSig(el) {
  if (!el || el === document.body) return null;
  if (el.id) return "#" + el.id;
  for (const a of FOCUS_ATTRS) {
    if (el.hasAttribute(a)) return `${el.tagName.toLowerCase()}[${a}="${cssEsc(el.getAttribute(a))}"]`;
  }
  return null;
}

/* Capture before a render. After it, restoreFocus() returns focus to the same control when a
   rerender removed it; otherwise to the first match of `fallback`, or to the main region. */
function captureFocus() {
  const el = document.activeElement;
  return { el, sig: focusSig(el) };
}

function restoreFocus(cap, fallback) {
  if (!cap || !cap.el || cap.el === document.body || cap.el.isConnected) return;
  let target = cap.sig ? document.querySelector(cap.sig) : null;
  if (!target && fallback) target = document.querySelector(fallback);
  if (!target) target = document.getElementById("content-main");
  if (target) target.focus();
}

/* ---- header height: the layout subtracts the real height, not a fixed 60 px ---- */
function syncTopbarHeight() {
  const h = document.getElementById("topnav").offsetHeight;
  document.documentElement.style.setProperty("--topbar-h", h + "px");
}

/* Wrap Tab inside a modal container, so focus never falls to the page behind or the browser chrome. */
function trapTab(container, firstExtra) {
  container.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const list = focusables(container);
    if (!list.length) return;
    const first = list[0], last = list[list.length - 1], a = document.activeElement;
    if (e.shiftKey && (a === first || a === container || a === firstExtra)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  });
}

function wireAccess() {
  trapTab(document.getElementById("drawer"));
  document.getElementById("open-filters").addEventListener("click", openFilters);
  document.getElementById("filters-close").addEventListener("click", closeFilters);
  document.getElementById("filters-apply").addEventListener("click", closeFilters);
  document.getElementById("sidebar").addEventListener("keydown", (e) => {
    if (!filtersOpen()) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeFilters(); return; }
    if (e.key !== "Tab") return;
    const list = focusables(document.getElementById("sidebar"));
    if (!list.length) return;
    const first = list[0], last = list[list.length - 1];
    const title = document.getElementById("filters-title");
    if (e.shiftKey && (document.activeElement === first || document.activeElement === title)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  MOBILE_MQ.addEventListener("change", () => { if (!MOBILE_MQ.matches) closeFilters(); });

  document.getElementById("skip-link").addEventListener("click", (e) => {
    e.preventDefault();             // a hash link would change the app URL
    document.getElementById("content-main").focus();
  });

  if (window.ResizeObserver) new ResizeObserver(syncTopbarHeight).observe(document.getElementById("topnav"));
  syncTopbarHeight();
}

/* Text and counts of the filter controls that live outside the drawer. */
function syncFilterButtons(resultCount) {
  const n = activeFilterItems(state).length;
  const badge = document.getElementById("filters-badge");
  if (badge) badge.textContent = n ? ` · ${t("filters_active_n").replace("%n", n)}` : "";
  const apply = document.getElementById("filters-apply");
  if (apply && resultCount != null) apply.textContent = t("filters_apply").replace("%n", resultCount);
}
