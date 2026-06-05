/* Faceted filtering. AND across facets, OR within a facet. */

/* Sidebar facet definitions, in display order. `field` is the alert property,
   `meta` the key in meta.facets, `label` an i18n key. */
const FACET_DEFS = [
  { field: "status_trimitere", meta: "status_trimitere", label: "facet_status_trimitere", open: true },
  { field: "risk_category", meta: "risk_category", label: "facet_risk_category", open: true },
  { field: "judet", meta: "judet", label: "facet_judet" },
  { field: "severitate", meta: "severitate", label: "facet_severitate" },
  { field: "tip_mesaj", meta: "tip_mesaj", label: "facet_tip_mesaj" },
  { field: "risc_principal", meta: "risc_principal", label: "facet_risc_principal" },
  { field: "risc_asociat", meta: "risc_asociat", label: "facet_risc_asociat" },
  { field: "cod_eveniment", meta: "cod_eveniment", label: "facet_cod_eveniment" },
  { field: "meteo_color", meta: "meteo_color", label: "facet_meteo_color" },
  { field: "tip_inregistrare", meta: "tip_inregistrare", label: "facet_tip_inregistrare" },
  { field: "initiator", meta: "initiator", label: "facet_initiator" },
  { field: "month", meta: "month", label: "facet_month" },
];

function applyFilters(alerts, st) {
  const f = st.filters;
  const q = (st.search || "").trim().toLowerCase();
  const from = st.dateFrom || null;
  const to = st.dateTo || null;

  return alerts.filter((a) => {
    // facets (AND across, OR within)
    for (const def of FACET_DEFS) {
      const set = f[def.field];
      if (set && set.size) {
        const v = a[def.field];
        if (!v || !set.has(v)) return false;
      }
    }
    // local view scoping
    if (st.view === "local" && st.localJudet) {
      if (a.judet !== st.localJudet) return false;
      if (st.localLocality && !(a.localities || []).includes(st.localLocality)) return false;
    }
    // date range (compare on YYYY-MM-DD)
    if (from && (!a.date || a.date < from)) return false;
    if (to && (!a.date || a.date > to)) return false;
    // free text
    if (q) {
      const hay = ((a.msg || "") + " " + (a.title || "")).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/* True if any filter (facet, search, date, local scope) is active. */
function hasActiveFilters(st) {
  if (st.search) return true;
  if (st.dateFrom || st.dateTo) return true;
  if (st.view === "local" && st.localJudet) return true;
  return Object.values(st.filters).some((s) => s && s.size);
}
