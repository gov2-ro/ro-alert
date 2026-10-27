/* Phase 03 checks that need no browser: one facet registry (S01), search (S04), place
   identity (S05, S06), the URL hash (S07, S08), message language views (S09), and zero results
   (S11). Run: node --test tests/js/*.test.cjs */
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { ROOT, loadApp } = require("./helpers.cjs");

const app = loadApp("ro");
const { run } = app;
run(fs.readFileSync(path.join(ROOT, "js", "story.js"), "utf8"));
run(fs.readFileSync(path.join(ROOT, "js", "table.js"), "utf8"));
const plain = (x) => JSON.parse(JSON.stringify(x));
const ids = (rows) => rows.map((a) => a.id).sort();
const fresh = () => run("newState()");
const filter = (st) => { app.ctx.__st = st; return run("applyFilters(DATA.alerts, __st)"); };
const ctx = () => run("urlContext()");

test("S01 every facet is in one registry, with the keys all consumers read", () => {
  const reg = run("FACET_REGISTRY");
  const facets = app.meta.facets;
  assert.ok(reg.length >= 12);
  for (const d of reg) {
    assert.ok(d.field && d.meta && d.label, d.field);
    assert.ok(facets[d.meta], `meta.facets lacks ${d.meta}`);
    assert.ok(run(`I18N.ro["${d.label}"] && I18N.en["${d.label}"]`), `label ${d.label}`);
    assert.strictEqual(typeof d.open, "boolean");
    assert.strictEqual(typeof d.briefing, "boolean");
  }
  assert.strictEqual(run("typeof FACET_DEFS"), "undefined");
  assert.strictEqual(run("typeof FACET_DEFS_V2"), "undefined");
  // newState builds one empty set per registered facet
  assert.deepStrictEqual(plain(Object.keys(fresh().filters)), plain(reg.map((d) => d.field)));
});

test("S01 matching: AND across facets, OR inside one facet", () => {
  const st = fresh();
  st.filters.risk_category.add("Meteo");
  const meteo = filter(st);
  assert.ok(meteo.length > 0 && meteo.every((a) => a.risk_category === "Meteo"));
  st.filters.risk_category.add("Incendiu");
  const two = filter(st);
  assert.ok(two.length > meteo.length);
  st.filters.status_trimitere.add("ERROR");
  assert.ok(filter(st).every((a) => a.status_trimitere === "ERROR" && ["Meteo", "Incendiu"].includes(a.risk_category)));
});

test("S01 every active filter is listed and removable", () => {
  const st = fresh();
  st.filters.risk_category.add("Meteo");
  st.filters.severitate.add("SEVERE");
  st.search = "  apa ";
  st.dateFrom = "2026-03-01";
  st.view = "location";
  st.selectedCounty = "Harghita";
  st.selectedPlaceId = 83641;
  app.ctx.__st = st;
  const items = run("activeFilterItems(__st)");
  assert.deepStrictEqual(plain(items.map((i) => i.kind)), ["facet", "facet", "search", "dates", "county", "place"]);
  for (const it of items) { app.ctx.__it = it; run("removeFilterItem(__st, __it)"); }
  assert.strictEqual(run("hasActiveFilters(__st)"), false);
  assert.strictEqual(run("activeFilterItems(__st)").length, 0);
});

test("S01 whitespace-only search is no data filter", () => {
  const st = fresh();
  st.search = "   \n ";
  app.ctx.__st = st;
  assert.strictEqual(run("hasActiveFilters(__st)"), false);
  assert.strictEqual(filter(st).length, app.alerts.length);
});

test("S04 accented and plain queries return the same IDs, also for canonical place names", () => {
  const pairs = [["Brașov", "Brasov"], ["București", "Bucuresti"], ["TOPLIȚA", "toplita"], ["Argeș", "arges"]];
  for (const [a, b] of pairs) {
    const sa = fresh(); sa.search = a;
    const sb = fresh(); sb.search = b;
    const ra = ids(filter(sa)), rb = ids(filter(sb));
    assert.ok(ra.length > 0, a);
    assert.deepStrictEqual(ra, rb, `${a} vs ${b}`);
  }
  // a canonical place name that the message may spell without diacritics still finds its alerts
  const st = fresh(); st.search = "Toplița";
  const hits = filter(st);
  assert.ok(hits.some((a) => (a.places || []).some((p) => p.siruta === 83641)));
});

test("S04 search does not change the stored strings", () => {
  const before = JSON.stringify(app.alerts.slice(0, 50));
  const st = fresh(); st.search = "București";
  filter(st);
  assert.strictEqual(JSON.stringify(app.alerts.slice(0, 50)), before);
});

test("S05 Toplița (SIRUTA 83641) selects 23 Harghita records and one canonical place", () => {
  const st = fresh();
  st.view = "location"; st.selectedCounty = "Harghita"; st.selectedPlaceId = 83641;
  const rows = filter(st);
  assert.strictEqual(rows.length, 23);
  assert.ok(rows.every((a) => a.judet === "Harghita"));
  assert.strictEqual(run("DATA.places.get(83641).name"), "Toplița");
  assert.strictEqual(run("DATA.places.get(83641).county"), "Harghita");
  // the name clashes with another place, so the label carries the county
  assert.strictEqual(run("placeLabel(83641)"), "Toplița (Harghita)");
  assert.ok(run("DATA.places.get(91544)").county === "Hunedoara");
});

test("S05 one alert counts once per SIRUTA code, and a code has one county", () => {
  for (const a of app.alerts) {
    const codes = (a.places || []).map((p) => p.siruta);
    assert.strictEqual(new Set(codes).size, codes.length, a.id);
  }
  const county = new Map();
  for (const a of app.alerts) for (const p of a.places || []) {
    assert.ok(p.county, `place ${p.siruta} has no county`);
    if (county.has(p.siruta)) assert.strictEqual(county.get(p.siruta), p.county);
    county.set(p.siruta, p.county);
  }
});

test("S06 a nationally issued record at a resolved place survives a place selection", () => {
  const base = app.alerts.find((a) => (a.places || []).some((p) => p.siruta === 83641));
  const synthetic = { ...base, id: "synthetic-national", judet: "National", scope: "national", initiator: "IGSU" };
  const alerts = app.alerts.concat([synthetic]);
  const st = fresh();
  st.view = "location"; st.selectedPlaceId = 83641;      // a point click: no county
  app.ctx.__alerts = alerts; app.ctx.__st = st;
  const rows = run("applyFilters(__alerts, __st)");
  assert.ok(rows.some((a) => a.id === "synthetic-national"));
  // the dashboard point count equals the selection count: alerts naming the code under the same filters
  const dash = fresh();
  app.ctx.__st = dash;
  const dashRows = run("applyFilters(__alerts, __st)");
  const pointCount = dashRows.filter((a) => (a.places || []).some((p) => p.siruta === 83641)).length;
  assert.strictEqual(rows.length, pointCount);
  // with a county as well, the issuer-county rule still applies
  st.selectedCounty = "Harghita";
  app.ctx.__st = st;
  assert.ok(!run("applyFilters(__alerts, __st)").some((a) => a.id === "synthetic-national"));
});

test("S07 encode then decode keeps view, language, scope, dates, facets, search and record", () => {
  const st = fresh();
  st.view = "location"; st.lang = "en"; st.search = "Brașov & co/ #1";
  st.dateFrom = "2026-03-02"; st.dateTo = "2026-07-31";
  st.filters.risk_category.add("Inundații"); st.filters.risk_category.add("Meteo");
  st.filters.judet.add("Brașov");
  st.selectedCounty = "Harghita"; st.selectedPlaceId = 83641;
  st.record = app.alerts[10].id;
  app.ctx.__st = st;
  const hash = run("encodeState(__st)");
  assert.match(hash, /^schema=1&/);
  const r = run(`decodeHash(${JSON.stringify("#" + hash)}, urlContext())`);
  assert.deepStrictEqual(plain(r.notices), []);
  app.ctx.__back = r.state;
  assert.strictEqual(run("encodeState(__back)"), hash);
  assert.strictEqual(r.state.view, "location");
  assert.strictEqual(r.state.lang, "en");
  assert.strictEqual(r.state.search, "Brașov & co/ #1");
  assert.strictEqual(r.state.dateFrom, "2026-03-02");
  assert.strictEqual(r.state.selectedPlaceId, 83641);
  assert.strictEqual(r.state.selectedCounty, "Harghita");
  assert.strictEqual(r.state.record, app.alerts[10].id);
  assert.deepStrictEqual(plain([...r.state.filters.risk_category].sort()), ["Inundații", "Meteo"]);
});

test("S07 equal selections give equal links; defaults give an empty hash", () => {
  const a = fresh(), b = fresh();
  ["Meteo", "Incendiu", "Inundații"].forEach((v) => a.filters.risk_category.add(v));
  ["Inundații", "Incendiu", "Meteo"].forEach((v) => b.filters.risk_category.add(v));
  app.ctx.__a = a; app.ctx.__b = b;
  assert.strictEqual(run("encodeState(__a)"), run("encodeState(__b)"));
  assert.strictEqual(run("encodeState(newState())"), "");
});

test("S07 the table sort and the page keys round-trip, only when not default", () => {
  const st = fresh();
  st.view = "table"; st.sort = { key: "judet", dir: "asc" }; st.page = 3;
  app.ctx.__st = st;
  const h = run("encodeState(__st)");
  assert.match(h, /sort=judet&dir=asc&page=3/);
  const r = run(`decodeHash(${JSON.stringify(h)}, urlContext())`);
  assert.deepStrictEqual(plain(r.state.sort), { key: "judet", dir: "asc" });
  assert.strictEqual(r.state.page, 3);
  st.sort = { key: "time", dir: "desc" }; st.page = 1;
  assert.doesNotMatch(run("encodeState(__st)"), /sort=|page=/);
});

test("S08 unknown keys, bad dates, absent IDs and a foreign schema fall back safely", () => {
  const dec = (h) => run(`decodeHash(${JSON.stringify(h)}, urlContext())`);
  let r = dec("schema=1&zzz=1&view=nowhere&lang=de&f.nope=x&f.risk_category=NoSuchCategory&page=-4&sort=bogus");
  assert.strictEqual(r.state.view, "dashboard");
  assert.strictEqual(r.state.lang, "ro");
  assert.strictEqual(r.state.filters.risk_category.size, 0);
  assert.strictEqual(r.state.page, 1);
  assert.deepStrictEqual(plain(r.notices.map((n) => n.code).sort()), ["keys", "values"]);

  r = dec("schema=1&from=2026-02-30&to=notadate");
  assert.strictEqual(r.state.dateFrom, null);
  assert.strictEqual(r.state.dateTo, null);
  assert.deepStrictEqual(plain(r.notices.map((n) => n.code)), ["date", "date"]);

  r = dec("schema=1&from=2026-06-01&to=2026-05-01");
  assert.strictEqual(r.state.dateFrom, null);
  assert.deepStrictEqual(plain(r.notices.map((n) => n.code)), ["range"]);

  r = dec("schema=1&record=absent&place=999999999&county=Atlantis");
  assert.strictEqual(r.state.record, null);
  assert.strictEqual(r.state.selectedPlaceId, null);
  assert.strictEqual(r.state.selectedCounty, null);
  assert.deepStrictEqual(plain(r.notices.map((n) => n.code).sort()), ["county", "place", "record"]);

  r = dec("schema=2&view=table&f.risk_category=Meteo");
  assert.strictEqual(r.state.view, "dashboard");
  assert.strictEqual(r.state.filters.risk_category.size, 0);
  assert.deepStrictEqual(plain(r.notices.map((n) => n.code)), ["schema"]);

  assert.doesNotThrow(() => dec("%%%&=&&schema&view"));
});

test("S08 dates outside the detailed range are kept, not clamped", () => {
  const r = run(`decodeHash("schema=1&from=2025-09-01&to=2025-10-31", urlContext())`);
  assert.strictEqual(r.state.dateFrom, "2025-09-01");
  assert.strictEqual(r.state.dateTo, "2025-10-31");
  assert.deepStrictEqual(plain(r.notices), []);
});

test("S08 a date equal to a data bound counts as unrestricted", () => {
  const meta = app.meta;
  const min = meta.date_min.slice(0, 10), max = meta.date_max.slice(0, 10);
  const r = run(`decodeHash("schema=1&from=${min}&to=${max}", urlContext())`);
  assert.strictEqual(r.state.dateFrom, null);
  assert.strictEqual(r.state.dateTo, null);
  app.ctx.__st = r.state;
  assert.strictEqual(run("hasActiveFilters(__st)"), false);
});

test("S08 a scope without Local view, and Local view without scope, are made consistent", () => {
  let r = run(`decodeHash("schema=1&county=Harghita&view=table", urlContext())`);
  assert.strictEqual(r.state.view, "location");
  r = run(`decodeHash("schema=1&view=location", urlContext())`);
  assert.strictEqual(r.state.view, "dashboard");
});

test("S09 message language values and exact original text on every record", () => {
  const counts = { ro: 0, en: 0, mixed: 0, unknown: 0 };
  for (const a of app.alerts) {
    assert.ok(a.message_language in counts, `${a.id}: ${a.message_language}`);
    counts[a.message_language]++;
    const parts = a.msg_ro && a.msg_en ? a.msg_ro + (a.msg_sep ?? " ") + a.msg_en : (a.msg_ro || a.msg_en || a.msg);
    assert.ok(a.msg, a.id);
    if (a.message_language === "en") { assert.ok(!a.msg_ro && a.msg_en === a.msg, a.id); }
    if (a.message_language === "ro") { assert.ok(a.msg_ro === a.msg && !a.msg_en, a.id); }
    if (a.message_language === "mixed" && a.msg_ro) assert.ok(a.msg.startsWith(a.msg_ro) && a.msg.endsWith(a.msg_en), a.id);
    void parts;
  }
  assert.deepStrictEqual(plain(app.meta.message_languages), Object.fromEntries(Object.entries(counts).filter(([, n]) => n)));
});

test("S09 the English-only record 60e0361757e4 is English and its EN view is available", () => {
  const a = app.alerts.find((x) => x.id === "60e0361757e4");
  assert.strictEqual(a.message_language, "en");
  assert.ok(a.msg.startsWith("On 09.02.2026"));
  app.ctx.__a = a;
  const en = run("messageView(__a, 'en')");
  assert.strictEqual(en.shown, "en");
  assert.strictEqual(en.text, a.msg);
  const ro = run("messageView(__a, 'ro')");
  assert.strictEqual(ro.shown, "original");
  assert.strictEqual(ro.fallback, "missing");
  assert.strictEqual(ro.text, a.msg);
});

test("S09 fixtures: ro, en, mixed and unknown keep their original text; absent translation shows the original", () => {
  const view = (a, l) => { app.ctx.__a = a; return JSON.parse(JSON.stringify(run(`messageView(__a, '${l}')`))); };
  const ro = { msg: "Evitati zona.", msg_ro: "Evitati zona.", msg_en: null, message_language: "ro" };
  const mixed = { msg: "Evitati zona. Avoid the area.", msg_ro: "Evitati zona.", msg_en: "Avoid the area.", message_language: "mixed" };
  const unsplit = { msg: "Evitati zona si the area", msg_ro: null, msg_en: null, message_language: "mixed" };
  const unknown = { msg: "Test 112", msg_ro: null, msg_en: null, message_language: "unknown" };
  assert.deepStrictEqual(view(ro, "ro"), { text: "Evitati zona.", shown: "ro", fallback: null });
  assert.deepStrictEqual(view(ro, "en"), { text: "Evitati zona.", shown: "original", fallback: "missing" });
  assert.deepStrictEqual(view(mixed, "en"), { text: "Avoid the area.", shown: "en", fallback: null });
  assert.deepStrictEqual(view(mixed, "ro"), { text: "Evitati zona.", shown: "ro", fallback: null });
  assert.deepStrictEqual(view(unsplit, "en"), { text: "Evitati zona si the area", shown: "original", fallback: "unsplit" });
  assert.deepStrictEqual(view(unknown, "ro"), { text: "Test 112", shown: "original", fallback: "unsplit" });
});

test("S09 bear measure: English-only alerts leave the denominator and are reported", () => {
  const S = run("storyStats(DATA.alerts, true)");
  const en = app.alerts.filter((a) => a.message_language === "en").length;
  assert.strictEqual(S.noRomanian, en);
  assert.strictEqual(S.bearBase, app.alerts.length - en);
  assert.strictEqual(S.n, app.alerts.length);
  // the numerator keeps the documented Romanian-word rule
  const re = /\burs(?:ul|ului|ule|i|ii|ilor|oaic\w*)?\b/;
  const strip = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const expected = app.alerts.filter((a) => a.message_language !== "en" && re.test(strip(a.msg_ro || a.msg || ""))).length;
  assert.strictEqual(S.bear, expected);
});

test("S11 category and month labels follow the UI language; stored values do not change", () => {
  const en = loadApp("en");
  for (const c of en.run("CATEGORIES")) {
    const label = en.run(`catLabel(${JSON.stringify(c.value)})`);
    assert.ok(label && (label === c.value || !/[ăâîșț]/i.test(label)), label);
  }
  assert.strictEqual(en.run("catLabel('Inundații')"), "Floods");
  assert.strictEqual(en.run("catLabel('Animale periculoase')"), "Dangerous animals");
  assert.strictEqual(en.run("facetValueLabel('month', 'Februarie 2026')"), "February 2026");
  assert.strictEqual(en.run("facetValueLabel('meteo_color', 'Roșu')"), "Red");
  assert.strictEqual(run("catLabel('Inundații')"), "Inundații");
  // every category in the data has a palette entry, so no label falls back to Romanian by omission
  for (const o of app.meta.facets.risk_category) assert.ok(run(`CATEGORY_BY_VALUE.has(${JSON.stringify(o.value)})`), o.value);
  assert.strictEqual(app.alerts.filter((a) => a.risk_category === "Inundații").length, app.meta.facets.risk_category.find((o) => o.value === "Inundații").count);
});

test("S11 a zero-result selection keeps the filters that caused it", () => {
  const st = fresh();
  st.search = "zzzzqqqq"; st.filters.risk_category.add("Meteo");
  assert.strictEqual(filter(st).length, 0);
  app.ctx.__st = st;
  const items = run("activeFilterItems(__st)");
  assert.deepStrictEqual(plain(items.map((i) => i.kind)), ["facet", "search"]);
});
