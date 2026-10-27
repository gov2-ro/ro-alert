/* Phase 06: order, pages, selection key, export envelope and data validation, without a browser. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers.cjs");

const app = loadApp("ro");
const { alerts, run } = app;
const json = (x) => JSON.stringify(x);

test("B01 pageInfo splits 3,385 records into 68 pages of at most 50 and clamps the page", () => {
  const info = (p) => run(`pageInfo(3385, ${json(p)})`);
  assert.equal(json([info(1).pages, info(1).start, info(1).end]), json([68, 1, 50]));
  assert.equal(json([info(68).start, info(68).end]), json([3351, 3385]));
  for (const bad of [0, -3, 999, NaN, "x", null, 2.7]) {
    const r = info(bad);
    assert.ok(r.page >= 1 && r.page <= 68, `page ${bad} -> ${r.page}`);
  }
  assert.equal(info(999).page, 68);
  assert.equal(info(2.7).page, 2);
  const empty = run("pageInfo(0, 5)");
  assert.equal(json([empty.page, empty.pages, empty.start, empty.end]), json([1, 1, 0, 0]));
});

test("B01 walking the pages of the default order visits every ID once", () => {
  const sorted = run("sortRecords(DATA.alerts, timeKey, 'desc')");
  const seen = [];
  for (let p = 1; p <= 68; p++) {
    const i = run(`pageInfo(${sorted.length}, ${p})`);
    seen.push(...sorted.slice(i.offset, i.offset + i.size).map((a) => a.id));
  }
  assert.equal(seen.length, 3385);
  assert.equal(new Set(seen).size, 3385);
  const all = new Set(seen);
  assert.ok(alerts.every((a) => all.has(a.id)));
});

test("B02 sort keeps equal keys in id order, in both directions, whatever the input order", () => {
  const rows = alerts.slice(0, 400);
  const key = (a) => a.risk_category || "";
  const asc = run("(rows, k) => sortRecords(rows, k, 'asc')")(rows, key);
  const desc = run("(rows, k) => sortRecords(rows, k, 'desc')")(rows, key);
  const shuffled = rows.slice().reverse();
  const asc2 = run("(rows, k) => sortRecords(rows, k, 'asc')")(shuffled, key);
  assert.deepEqual(asc.map((a) => a.id), asc2.map((a) => a.id));
  for (const list of [asc, desc]) {
    for (let i = 1; i < list.length; i++) {
      if (key(list[i]) === key(list[i - 1])) assert.ok(list[i - 1].id < list[i].id, "id ascending inside equal keys");
    }
  }
  // The corpus has no two alerts with the same send time (second resolution), so the id rule
  // is shown on synthetic ties: equal times in any input order give one fixed order.
  const mk = (id, t) => ({ id, sent_at: t });
  const tied = [mk("c", "2026-01-01T10:00:00"), mk("a", "2026-01-01T10:00:00"), mk("b", "2026-01-01T10:00:00"), mk("z", "2026-01-01T09:00:00")];
  const sortTime = run("(rows, d) => sortRecords(rows, timeKey, d)");
  assert.equal(sortTime(tied, "desc").map((a) => a.id).join(""), "abcz");
  assert.equal(sortTime(tied.slice().reverse(), "desc").map((a) => a.id).join(""), "abcz");
  assert.equal(sortTime(tied, "asc").map((a) => a.id).join(""), "zabc");
});

test("B04 the selection key ignores page, record and language, and sees filters, search and sort", () => {
  const key = (setup) => run(`(() => { const s = newState(); ${setup}; return selectionKey(s); })()`);
  const base = key("");
  assert.equal(key("s.page = 7; s.record = DATA.alerts[0].id; s.lang = 'en'"), base);
  assert.notEqual(key("s.filters.risk_category.add('Meteo')"), base);
  assert.notEqual(key("s.search = 'urs'"), base);
  assert.notEqual(key("s.view = 'table'; s.sort = { key: 'judet', dir: 'asc' }"), key("s.view = 'table'"));
  assert.notEqual(key("s.dateFrom = '2026-05-02'"), base);
});

test("B04 normalizeState gives views without record lists page 1 and keeps the page of list views", () => {
  const norm = (setup) => run(`(() => { const s = newState(); ${setup}; normalizeState(s, null); return s.page; })()`);
  assert.equal(norm("s.view = 'dashboard'; s.page = 4"), 1);
  assert.equal(norm("s.view = 'story'; s.page = 4"), 1);
  assert.equal(norm("s.view = 'table'; s.page = 4"), 4);
  assert.equal(norm("s.view = 'feed'; s.page = 4"), 4);
});

test("B05 day totals count the complete selection", () => {
  const m = run("dateCounts(DATA.alerts)");
  let sum = 0;
  for (const n of m.values()) sum += n;
  assert.equal(sum, 3385);
  assert.equal(m.get("2026-08-31"), 16);
});

test("B05 and B06 the export holds each selected record once with its deliveries and unchanged text", () => {
  run("window.__rows = DATA.alerts.filter((a) => a.risk_category === 'Meteo')");
  const env = run(`(() => {
    const st = newState(); st.view = 'table'; st.filters.risk_category.add('Meteo'); st.page = 3; st.record = DATA.alerts[0].id;
    return buildExport(window.__rows, st, { key: 'time', dir: 'desc' }, null, new Date('2026-10-27T10:00:00Z'));
  })()`);
  const rows = alerts.filter((a) => a.risk_category === "Meteo");
  assert.equal(env.schema_version, 1);
  assert.equal(env.exported_at, "2026-10-27T10:00:00.000Z");
  assert.equal(env.records.length, rows.length);
  assert.equal(new Set(env.records.map((r) => r.id)).size, rows.length);
  const byId = new Map(alerts.map((a) => [a.id, a]));
  for (const r of env.records) {
    const a = byId.get(r.id);
    assert.equal(r.msg, a.msg);
    assert.equal(r.msg_ro, a.msg_ro);
    assert.equal(r.msg_en, a.msg_en);
    assert.equal(json(r.deliveries), json(a.deliveries));
  }
  assert.equal(env.records.reduce((s, r) => s + r.deliveries.length, 0), rows.reduce((s, r) => s + r.deliveries.length, 0));
  assert.equal(json(env.selection.filters), json({ risk_category: ["Meteo"] }));
  assert.ok(!("page" in env.selection) && !("record" in env.selection));
  assert.equal(env.selection.count, rows.length);
  assert.equal(json(env.selection.sort), json({ key: "time", dir: "desc", tie_breaker: "id ascending" }));
  const months = [...new Set(rows.map((a) => a.source_file.slice(0, 7)))].sort();
  assert.equal(json(env.sources.map((s) => s.month).sort()), json(months));
  assert.match(env.attribution, /IGSU/);
  assert.equal(env.coverage.selected_records, rows.length);
  assert.equal(env.coverage.archive_detail_records, 3385);
  assert.equal(env.coverage.failed_alerts_observed, rows.filter((a) => a.status_ok === false).length);
  const times = env.records.map((r) => r.sent_at || "");
  assert.equal(json(times), json(times.slice().sort((x, y) => (x < y ? 1 : x > y ? -1 : 0))));
});

test("B06 the export file name describes the selection", () => {
  const name = run("exportFileName(DATA.alerts, 'en')");
  assert.equal(name, "ro-alert-selection-3385-alerts-2026-02-03_2026-08-31-en.json");
});

test("B10 validateData accepts the shipped bundles and refuses broken ones with a plain message", () => {
  const ok = run("(() => { try { validateData(DATA.alerts, DATA.meta, DATA.geo); return null; } catch (e) { return e.message; } })()");
  assert.equal(ok, null);
  const fails = (alertsExpr, metaExpr, geoExpr) => run(`(() => { try { validateData(${alertsExpr}, ${metaExpr}, ${geoExpr}); return null; } catch (e) { return e instanceof DataError ? e.userMessage : "NOT A DataError: " + e; } })()`);
  const geoOk = "{ features: [{}] }";
  assert.match(fails("{}", "{ ...DATA.meta }", geoOk), /list of alerts|listă de alerte/);
  assert.match(fails("[]", "{ ...DATA.meta }", geoOk), /nicio alertă|no alert/);
  assert.match(fails("[{ title: 'x' }]", "{ ...DATA.meta }", geoOk), /identificator|valid id/);
  assert.match(fails("DATA.alerts", "{ ...DATA.meta, schema_version: 2 }", geoOk), /schema 2/);
  assert.match(fails("DATA.alerts", "{ ...DATA.meta, schema_version: undefined }", geoOk), /schema/);
  assert.match(fails("DATA.alerts", "null", geoOk), /meta\.js/);
  assert.match(fails("DATA.alerts", "{ ...DATA.meta, total: 12 }", geoOk), /nu se potrivesc|do not match/);
  assert.match(fails("DATA.alerts", "{ ...DATA.meta }", "{}"), /geo\.js/);
});
