/* Phase 05: coverage and summary figures, computed without a browser (V03, V04). */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers.cjs");

const { alerts, meta, run } = loadApp();
const Stats = run("Stats");

// County keys come from the geometry bundle, as in the page.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const gctx = vm.createContext({});
gctx.window = gctx;
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "..", "data", "geo.js"), "utf8"), gctx);
const countyKey = (n) => run(`countyKey(${JSON.stringify(n)})`);
const shapeKeys = new Set(gctx.GEO.features.map((f) => countyKey(f.properties.name)));
const known = (a) => !!a.judet && shapeKeys.has(countyKey(a.judet));

test("V03 baseline coverage: 2,897 county, 488 national, 1,392 with a place", () => {
  const c = Stats.mapCoverage(alerts, known);
  assert.deepEqual([c.total, c.county, c.national, c.unknown, c.withPlace], [3385, 2897, 488, 0, 1392]);
  assert.equal(Math.round(c.placeShare * 10) / 10, 41.1);
  assert.equal(Math.round(c.countyShare * 10) / 10, 85.6);
  assert.ok(c.placeMentions >= c.withPlace);
  assert.equal(c.county + c.national + c.unknown, c.total);
});

test("V04 filtered coverage equals an independent count", () => {
  const rows = alerts.filter((a) => a.month === "Mai 2026" && a.risk_category === "Meteo");
  const c = Stats.mapCoverage(rows, known);
  let nat = 0, cty = 0, pl = 0;
  for (const a of rows) { if (a.scope === "national") nat++; else cty++; if ((a.places || []).length) pl++; }
  assert.deepEqual([c.total, c.county, c.national, c.withPlace], [rows.length, cty, nat, pl]);
});

test("V04 empty selection: shares are null, not NaN", () => {
  const c = Stats.mapCoverage([], known);
  assert.deepEqual([c.total, c.county, c.national, c.unknown, c.withPlace], [0, 0, 0, 0, 0]);
  assert.equal(c.countyShare, null);
  assert.equal(c.placeShare, null);
  assert.equal(Stats.dominant([], "risk_category"), null);
});

test("a county-scope alert with no shape counts as unknown, never as mapped", () => {
  const c = Stats.mapCoverage([{ scope: "county", judet: "Nowhere" }, { scope: "county", judet: null }], known);
  assert.deepEqual([c.county, c.unknown], [0, 2]);
});

test("dominant risk and its share", () => {
  const d = Stats.dominant(alerts, "risk_category");
  assert.equal(d.value, "Animale periculoase");
  assert.equal(d.n, 2337);
  assert.equal(Math.round(d.share * 10) / 10, 69.0);
});

test("V06 unknown-coverage count: 3,385 alerts less the 237 of the reporting month", () => {
  const s = Stats.selectionStats(alerts, meta.months);
  assert.equal(s.unknownAlerts, 3385 - 237);
  assert.equal(s.unknownAlerts + s.reportingAlerts, s.total);
});

test("every new phase 05 key exists in Romanian and English", () => {
  const ro = run("Object.keys(I18N.ro)"), en = run("Object.keys(I18N.en)");
  const fresh = ro.filter((k) => /^(cov_|ov_|map_(mode|conv|scale|legend|cov|tip|empty|places_hint)|cap_|q_|loc_kind|feed_sum|chart_zero)/.test(k));
  assert.ok(fresh.length > 40);
  for (const k of fresh) assert.ok(en.includes(k), "missing in en: " + k);
});

test("fill replaces named tokens and leaves unknown ones", () => {
  assert.equal(run('fill("%n of %nat, %x", { n: 1, nat: 2 })'), "1 of 2, %x");
});
