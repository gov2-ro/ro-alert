/* Facet registry, category palette, search normalizer and filtering.
   One registry drives state initialization, matching, the sidebar, URL validation and the
   active-filter strip. AND across facets, OR within a facet. Nothing here touches the DOM. */

/* Facets, in display order. `field` is the alert property, `meta` the key in meta.facets,
   `label` an i18n key, `open` the initial expansion, `briefing` whether Briefing mode shows it. */
const FACET_REGISTRY = [
  { field: "risk_category", meta: "risk_category", label: "facet_risk_category", open: true, briefing: true },
  { field: "status_trimitere", meta: "status_trimitere", label: "facet_status_trimitere", open: true, briefing: false },
  { field: "judet", meta: "judet", label: "facet_judet", open: false, briefing: false },
  { field: "severitate", meta: "severitate", label: "facet_severitate", open: false, briefing: false },
  { field: "tip_mesaj", meta: "tip_mesaj", label: "facet_tip_mesaj", open: false, briefing: false },
  { field: "risc_principal", meta: "risc_principal", label: "facet_risc_principal", open: false, briefing: false },
  { field: "risc_asociat", meta: "risc_asociat", label: "facet_risc_asociat", open: false, briefing: false },
  { field: "cod_eveniment", meta: "cod_eveniment", label: "facet_cod_eveniment", open: false, briefing: false },
  { field: "meteo_color", meta: "meteo_color", label: "facet_meteo_color", open: false, briefing: false },
  { field: "tip_inregistrare", meta: "tip_inregistrare", label: "facet_tip_inregistrare", open: false, briefing: false },
  { field: "initiator", meta: "initiator", label: "facet_initiator", open: false, briefing: false },
  { field: "month", meta: "month", label: "facet_month", open: false, briefing: false },
];

/* The one category palette. `value` is the stored risk_category (never translated);
   `label` is the i18n key of its display name; the colour serves charts, chips and tables. */
const CATEGORIES = [
  { value: "Animale periculoase", label: "cat_animals", color: "#b07d3a" },
  { value: "Copil dispărut", label: "cat_missing_child", color: "#d05ce3" },
  { value: "Atac aerian / dronă", label: "cat_air", color: "#d93b3b" },
  { value: "Inundații", label: "cat_flood", color: "#2aa6c4" },
  { value: "Meteo", label: "cat_weather", color: "#2a6fc4" },
  { value: "Incendiu", label: "cat_fire", color: "#e3852b" },
  { value: "Tehnologic", label: "cat_tech", color: "#9aa72b" },
  { value: "Securitate națională", label: "cat_security", color: "#c44" },
  { value: "Altele", label: "cat_other", color: "#8a8a8a" },
];
const CATEGORY_BY_VALUE = new Map(CATEGORIES.map((c) => [c.value, c]));
const METEO_COLOR_LABELS = { "Galben": "color_yellow", "Portocaliu": "color_orange", "Roșu": "color_red", "Verde": "color_green" };

function catColor(name) { const c = CATEGORY_BY_VALUE.get(name); return c ? c.color : "#8a8a8a"; }
function catLabel(name) { const c = CATEGORY_BY_VALUE.get(name); return c ? t(c.label) : name; }

/* "Februarie 2026" (stored label) -> "February 2026" in English; the stored value never changes. */
function monthValueLabel(value) {
  const m = /^(\S+) (\d{4})$/.exec(value || "");
  if (!m) return value;
  const i = MONTH_NAMES.ro.indexOf(m[1]);
  return i < 0 ? value : `${monthName(i + 1)} ${m[2]}`;
}

/* Display label of one facet value in the UI language. Stored values stay as they are. */
function facetValueLabel(field, value) {
  if (field === "risk_category") return catLabel(value);
  if (field === "meteo_color") return METEO_COLOR_LABELS[value] ? t(METEO_COLOR_LABELS[value]) : value;
  if (field === "month") return monthValueLabel(value);
  return value;
}

/* ---- search ---- */

/* One normalizer for the query and the text it meets: lower case, no diacritics, single
   spaces. It never changes a stored string. */
function normalizeSearch(s) {
  return String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

const _haystacks = new WeakMap();

/* Normalized text of the fields a query searches: the original message, title, county,
   initiator, extracted candidates and canonical place names. Built once per alert. */
function searchHaystack(a) {
  let h = _haystacks.get(a);
  if (h === undefined) {
    const parts = [a.msg, a.title, a.judet, a.initiator];
    for (const l of a.locations || []) parts.push(l.name);
    for (const l of a.localities || []) parts.push(l);
    for (const p of a.places || []) { parts.push(p.name); }
    h = normalizeSearch(parts.filter(Boolean).join(" \n "));
    _haystacks.set(a, h);
  }
  return h;
}

/* ---- matching ---- */

function applyFilters(alerts, st) {
  const f = st.filters;
  const q = normalizeSearch(st.search);
  const from = st.dateFrom || null;
  const to = st.dateTo || null;
  const local = st.view === "location";
  const county = local && st.selectedCounty ? countyKey(st.selectedCounty) : null;
  const place = local && st.selectedPlaceId != null ? Number(st.selectedPlaceId) : null;

  return alerts.filter((a) => {
    for (const def of FACET_REGISTRY) {
      const set = f[def.field];
      if (set && set.size) {
        const v = a[def.field];
        if (!v || !set.has(v)) return false;
      }
    }
    // Local scope: the issuer-county convention, and a resolved place by SIRUTA code.
    // A place selection adds no county restriction, so a national alert at the place stays.
    if (county && countyKey(a.judet) !== county) return false;
    if (place != null && !(a.places || []).some((p) => p.siruta === place)) return false;
    if (from && (!a.date || a.date < from)) return false;
    if (to && (!a.date || a.date > to)) return false;
    if (q && !searchHaystack(a).includes(q)) return false;
    return true;
  });
}

/* True if any data filter is active: a facet, a non-blank search, a date bound, or a Local
   scope. View, language, sort, page and the open record are not data filters. */
function hasActiveFilters(st) {
  if (normalizeSearch(st.search)) return true;
  if (st.dateFrom || st.dateTo) return true;
  if (st.view === "location" && (st.selectedCounty || st.selectedPlaceId != null)) return true;
  return Object.values(st.filters).some((s) => s && s.size);
}

/* Every active data filter as a removable item for the strip. `remove` says what to clear. */
function activeFilterItems(st) {
  const items = [];
  for (const def of FACET_REGISTRY) {
    const set = st.filters[def.field];
    if (!set || !set.size) continue;
    [...set].sort().forEach((v) => items.push({
      kind: "facet", field: def.field, value: v,
      group: t(def.label), text: facetValueLabel(def.field, v),
    }));
  }
  const q = normalizeSearch(st.search);
  if (q) items.push({ kind: "search", text: t("strip_search").replace("%s", String(st.search).trim()) });
  if (st.dateFrom || st.dateTo) {
    const range = `${st.dateFrom || "…"} – ${st.dateTo || "…"}`;
    items.push({ kind: "dates", text: t("strip_dates").replace("%s", range) });
  }
  if (st.view === "location" && st.selectedCounty) {
    items.push({ kind: "county", text: t("strip_county").replace("%s", st.selectedCounty) });
  }
  if (st.view === "location" && st.selectedPlaceId != null) {
    items.push({ kind: "place", text: t("strip_place").replace("%s", placeLabel(st.selectedPlaceId, true) || String(st.selectedPlaceId)) });
  }
  return items;
}

/* Clear what one strip item stands for. */
function removeFilterItem(st, item) {
  if (item.kind === "facet") st.filters[item.field].delete(item.value);
  else if (item.kind === "search") st.search = "";
  else if (item.kind === "dates") { st.dateFrom = null; st.dateTo = null; }
  else if (item.kind === "county") st.selectedCounty = null;
  else if (item.kind === "place") st.selectedPlaceId = null;
}
