/* Shareable location hash: state <-> "#schema=1&view=table&f.risk_category=Meteo ...".
   Pure functions (no DOM), so Node tests load this file too. The hash uses URLSearchParams
   encoding, so a source string never needs hand escaping, and file:// works without routing.

   Keys: schema, view, lang, q, from, to, f.FIELD (repeated), county, place, record, sort, dir, page.
   An optional key appears only when set or different from its default. A state with every
   key at its default has an empty hash. */

const URL_SCHEMA = 1;
const URL_VIEWS = ["story", "dashboard", "table", "feed", "location"];
const URL_LANGS = ["ro", "en"];
const DEFAULT_SORT = { key: "time", dir: "desc" };

function newState() {
  const filters = {};
  FACET_REGISTRY.forEach((d) => { filters[d.field] = new Set(); });
  return {
    lang: "ro", view: "dashboard", filters, search: "", dateFrom: null, dateTo: null,
    selectedCounty: null,      // issuer-county value, as in alert.judet
    selectedPlaceId: null,     // integer SIRUTA code of a resolved place
    record: null,              // id of the open alert
    sort: null,                // {key, dir} for the Table; null = DEFAULT_SORT
    page: 1,                   // page number (Phase 06 paginates; the key is kept now)
  };
}

/* True for a real calendar date written YYYY-MM-DD. */
function isIsoDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/* Rules that keep a state consistent. `ctx.dateMin` and `ctx.dateMax` are the bounds of the
   detailed messages: a date equal to a bound restricts nothing, so it counts as unset. */
function normalizeState(st, ctx) {
  if (ctx && st.dateFrom && st.dateFrom === ctx.dateMin) st.dateFrom = null;
  if (ctx && st.dateTo && st.dateTo === ctx.dateMax) st.dateTo = null;
  if (st.selectedPlaceId != null) st.selectedPlaceId = Number(st.selectedPlaceId);
  if (st.view === "location" && !st.selectedCounty && st.selectedPlaceId == null) st.view = "dashboard";
  if (st.view !== "location") { st.selectedCounty = null; st.selectedPlaceId = null; }
  if (!(st.page >= 1)) st.page = 1;
  st.page = Math.floor(st.page);
  if (st.view !== "table") st.sort = null;
  return st;
}

/* The canonical hash (without "#") for a state. Equal selections give equal strings. */
function encodeState(st) {
  const p = new URLSearchParams();
  if (st.view !== "dashboard") p.append("view", st.view);
  if (st.lang !== "ro") p.append("lang", st.lang);
  const q = String(st.search || "").trim().replace(/\s+/g, " ");
  if (q) p.append("q", q);
  if (st.dateFrom) p.append("from", st.dateFrom);
  if (st.dateTo) p.append("to", st.dateTo);
  for (const def of FACET_REGISTRY) {
    const set = st.filters[def.field];
    if (set && set.size) [...set].sort().forEach((v) => p.append("f." + def.field, v));
  }
  if (st.selectedCounty) p.append("county", st.selectedCounty);
  if (st.selectedPlaceId != null) p.append("place", String(st.selectedPlaceId));
  if (st.record) p.append("record", st.record);
  if (st.view === "table" && st.sort && (st.sort.key !== DEFAULT_SORT.key || st.sort.dir !== DEFAULT_SORT.dir)) {
    p.append("sort", st.sort.key);
    p.append("dir", st.sort.dir);
  }
  if (st.page > 1) p.append("page", String(st.page));
  const body = p.toString();
  return body ? "schema=" + URL_SCHEMA + "&" + body : "";
}

/* Read a hash into {state, notices}. `state` is a complete, valid state. `notices` lists
   what the reader ignored: {code, args}. The reader never throws on odd input.
   ctx: {facetValues: {field: Set}, alertIds: Set, placeIds: Set, counties: Set,
         sortKeys: [..], dateMin, dateMax}. */
function decodeHash(hash, ctx) {
  const st = newState();
  const notices = [];
  const body = String(hash || "").replace(/^#/, "");
  if (!body) return { state: st, notices };
  let p;
  try { p = new URLSearchParams(body); } catch (e) { return { state: st, notices }; }
  const schema = p.get("schema");
  if (schema !== null && schema !== String(URL_SCHEMA)) {
    notices.push({ code: "schema", args: [schema.slice(0, 20)] });
    return { state: st, notices };
  }
  const fixedKeys = new Set(["schema", "view", "lang", "q", "from", "to", "county", "place", "record", "sort", "dir", "page"]);
  const facetKeys = new Set(FACET_REGISTRY.map((d) => "f." + d.field));
  const unknownKeys = [...new Set([...p.keys()].filter((k) => !fixedKeys.has(k) && !facetKeys.has(k)))];
  if (unknownKeys.length) notices.push({ code: "keys", args: [unknownKeys.slice(0, 5).map((k) => k.slice(0, 30)).join(", ")] });
  const badValues = [];
  const bad = (k, v) => badValues.push(`${k}=${String(v).slice(0, 30)}`);

  const view = p.get("view");
  if (view !== null) { if (URL_VIEWS.includes(view)) st.view = view; else bad("view", view); }
  const lang = p.get("lang");
  if (lang !== null) { if (URL_LANGS.includes(lang)) st.lang = lang; else bad("lang", lang); }
  const q = p.get("q");
  if (q !== null) st.search = q.slice(0, 200);

  let from = p.get("from"), to = p.get("to");
  if (from !== null && !isIsoDate(from)) { notices.push({ code: "date", args: [from.slice(0, 20)] }); from = null; }
  if (to !== null && !isIsoDate(to)) { notices.push({ code: "date", args: [to.slice(0, 20)] }); to = null; }
  if (from && to && from > to) { notices.push({ code: "range", args: [from, to] }); from = to = null; }
  st.dateFrom = from || null;
  st.dateTo = to || null;

  for (const def of FACET_REGISTRY) {
    const allowed = ctx && ctx.facetValues && ctx.facetValues[def.field];
    for (const v of p.getAll("f." + def.field)) {
      if (!allowed || allowed.has(v)) st.filters[def.field].add(v);
      else bad("f." + def.field, v);
    }
  }
  const county = p.get("county");
  if (county !== null) {
    if (ctx && ctx.counties && ctx.counties.has(county)) st.selectedCounty = county;
    else notices.push({ code: "county", args: [county.slice(0, 40)] });
  }
  const place = p.get("place");
  if (place !== null) {
    if (/^\d{1,9}$/.test(place) && ctx && ctx.placeIds && ctx.placeIds.has(Number(place))) st.selectedPlaceId = Number(place);
    else notices.push({ code: "place", args: [place.slice(0, 20)] });
  }
  const record = p.get("record");
  if (record !== null) {
    if (ctx && ctx.alertIds && ctx.alertIds.has(record)) st.record = record;
    else notices.push({ code: "record", args: [record.slice(0, 30)] });
  }
  const sort = p.get("sort"), dir = p.get("dir");
  if (sort !== null || dir !== null) {
    const keyOk = sort !== null && ctx && ctx.sortKeys && ctx.sortKeys.includes(sort);
    const dirOk = dir === "asc" || dir === "desc";
    if (keyOk) st.sort = { key: sort, dir: dirOk ? dir : "asc" };
    else if (sort !== null) bad("sort", sort);
    if (dir !== null && !dirOk) bad("dir", dir);
  }
  const page = p.get("page");
  if (page !== null) { if (/^[1-9]\d{0,5}$/.test(page)) st.page = Number(page); else bad("page", page); }

  if (badValues.length) notices.push({ code: "values", args: [badValues.slice(0, 5).join(", ")] });
  if (st.selectedCounty || st.selectedPlaceId != null) st.view = "location";
  normalizeState(st, ctx);
  return { state: st, notices };
}

/* Validation context from the loaded data. Built once per call; cheap. */
function urlContext() {
  const facetValues = {};
  for (const def of FACET_REGISTRY) {
    facetValues[def.field] = new Set(((DATA.meta.facets || {})[def.meta] || []).map((o) => o.value));
  }
  return {
    facetValues,
    alertIds: new Set(DATA.alerts.map((a) => a.id)),
    placeIds: new Set(DATA.places.keys()),
    counties: new Set(Object.keys(DATA.meta.judet_counts || {})),
    sortKeys: (typeof TABLE_COLS !== "undefined" ? TABLE_COLS.map((c) => c.key) : []),
    dateMin: DATA.meta.date_min ? DATA.meta.date_min.slice(0, 10) : null,
    dateMax: DATA.meta.date_max ? DATA.meta.date_max.slice(0, 10) : null,
  };
}
