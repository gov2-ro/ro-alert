/* Calendar and failure-coverage contracts (audit 01, checks A05-A09).
   Run: node --test tests/js/*.test.cjs
   A05 also runs in child processes with TZ set to UTC, Europe/Bucharest and America/New_York. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("child_process");
const path = require("path");
const { loadApp, ROOT } = require("./helpers.cjs");
const Stats = require(path.join(ROOT, "js", "stats.js"));

const app = loadApp("ro");
const { alerts, meta } = app;
const sum = (a) => a.reduce((x, y) => x + y, 0);

test("A05: the day axis has 210 unique dates, Feb 3 to Aug 31, in every time zone", () => {
  const script = `
    const Stats = require(${JSON.stringify(path.join(ROOT, "js", "stats.js"))});
    const { loadApp } = require(${JSON.stringify(path.join(ROOT, "tests", "js", "helpers.cjs"))});
    const a = loadApp("ro").alerts;
    const d = Stats.dailyCounts(a);
    console.log(JSON.stringify({ n: d.labels.length, u: new Set(d.labels).size, first: d.labels[0],
      last: d.labels[d.labels.length - 1], tz: Intl.DateTimeFormat().resolvedOptions().timeZone }));`;
  for (const tz of ["UTC", "Europe/Bucharest", "America/New_York"]) {
    const out = JSON.parse(execFileSync(process.execPath, ["-e", script], { env: { ...process.env, TZ: tz } }).toString());
    assert.equal(out.tz, tz);
    assert.deepEqual([out.n, out.u, out.first, out.last], [210, 210, "2026-02-03", "2026-08-31"], tz);
  }
});

test("A05: dayRange crosses daylight-saving changes without skipping or repeating a day", () => {
  const r = Stats.dayRange("2026-03-27", "2026-03-31");
  assert.deepEqual(r, ["2026-03-27", "2026-03-28", "2026-03-29", "2026-03-30", "2026-03-31"]);
  const o = Stats.dayRange("2026-10-24", "2026-10-26");
  assert.deepEqual(o, ["2026-10-24", "2026-10-25", "2026-10-26"]);
  assert.deepEqual(Stats.dayRange("2026-05-01", "2026-05-01"), ["2026-05-01"]);
  assert.deepEqual(Stats.dayRange(null, null), []);
});

test("A06: daily stacks total 3385; Aug 31 holds 16 alerts; Mar 29 occurs once", () => {
  const d = Stats.dailyCounts(alerts);
  assert.equal(sum(d.total), 3385);
  assert.equal(d.total[d.labels.indexOf("2026-08-31")], 16);
  assert.equal(d.labels.filter((x) => x === "2026-03-29").length, 1);
  for (let i = 0; i < d.labels.length; i++) {
    assert.equal(sum(d.categories.map((c) => d.series[c][i])), d.total[i], d.labels[i]);
  }
  for (const c of d.categories) {
    assert.equal(sum(d.series[c]), alerts.filter((a) => a.risk_category === c).length, c);
  }
  assert.equal(sum(d.failed), 1);
});

test("A07: a filtered selection keeps internal zero days and its last day", () => {
  const rows = alerts.filter((a) => ["2026-05-02", "2026-05-06", "2026-05-09"].includes(a.date));
  const d = Stats.dailyCounts(rows);
  assert.deepEqual(d.labels, Stats.dayRange("2026-05-02", "2026-05-09"));
  assert.equal(sum(d.total), rows.length);
  assert.equal(d.total[d.labels.indexOf("2026-05-09")], rows.filter((a) => a.date === "2026-05-09").length);
  assert.ok(d.total[d.labels.indexOf("2026-05-03")] === 0, "internal day is zero");
  assert.deepEqual(Stats.dailyCounts([]).labels, []);
  // the failed line never changes the stacked total
  const failedRows = alerts.filter((a) => a.status_ok === false);
  const f = Stats.dailyCounts(failedRows);
  assert.equal(sum(f.total), failedRows.length);
});

test("A07: the Local timeline uses the same aggregation as the Dashboard", () => {
  const src = require("fs").readFileSync(path.join(ROOT, "js", "location.js"), "utf8");
  assert.match(src, /renderStackedTimelineChart\("chart-loc-timeline"/);
  const county = alerts.filter((a) => a.judet === "Harghita");
  const d = Stats.dailyCounts(county);
  assert.equal(sum(d.total), county.length);
});

test("A08: all data and April give a reporting sample of 237 alerts and 470 deliveries", () => {
  const all = Stats.selectionStats(alerts, meta.months);
  assert.equal(all.total, 3385);
  assert.equal(all.failedAlerts, 1);
  assert.equal(all.reportingAlerts, 237);
  assert.equal(all.reportingDeliveries, 470);
  assert.equal(all.reportingFailedAlerts, 1);
  assert.equal(all.reportingErrorDeliveries, 196);
  assert.deepEqual(all.reportingMonths, ["2026-04"]);
  const apr = Stats.selectionStats(alerts.filter((a) => a.source_file === "2026-04.csv"), meta.months);
  assert.deepEqual([apr.reportingAlerts, apr.reportingDeliveries], [237, 470]);
});

test("A08: May has no failure rate", () => {
  const may = Stats.selectionStats(alerts.filter((a) => a.source_file === "2026-05.csv"), meta.months);
  assert.equal(may.reportingAlerts, 0);
  assert.equal(may.alertRate, null);
  assert.equal(may.deliveryRate, null);
  assert.deepEqual(may.unknownMonths, ["2026-05"]);
});

test("A08: an April subset with no failure shows 0 of N", () => {
  const rows = alerts.filter((a) => a.source_file === "2026-04.csv" && a.status_ok === true).slice(0, 10);
  const s = Stats.selectionStats(rows, meta.months);
  assert.equal(s.reportingAlerts, 10);
  assert.equal(s.reportingFailedAlerts, 0);
  assert.equal(s.alertRate, 0);
});

test("A08: an empty selection has null rates", () => {
  const s = Stats.selectionStats([], meta.months);
  assert.deepEqual([s.alertRate, s.deliveryRate, s.total], [null, null, 0]);
});

test("A09: every view reads the same coverage model, in RO and EN", () => {
  for (const lang of ["ro", "en"]) {
    const a = loadApp(lang);
    const c = a.run("failureCoverage(DATA.alerts)");
    assert.equal(c.observed, 1);
    assert.equal(c.alerts.text, "1 / 237");
    assert.equal(c.deliveries.text, "196 / 470");
    assert.equal(c.months, "2026-04");
    const kpis = "";
    const lines = a.run("qualityHtml(DATA.alerts)");   // phase 05: one section replaces the cards and the lines
    for (const html of [lines]) {
      assert.match(html, /1 \/ 237/);
      assert.match(html, /196 \/ 470/);
      assert.match(html, /2026-04/);
    }
    assert.ok(!/1 \/ 3385/.test(kpis + lines), "never the 1/3385 overall rate");
    // May: coverage unknown, no "0%"
    a.run("globalThis.may = DATA.alerts.filter((x) => x.source_file === '2026-05.csv')");
    const mayKpis = a.run("qualityHtml(may)");
    const mayLines = mayKpis;
    assert.ok(!/0%/.test(mayKpis + mayLines));
    assert.match(mayLines, lang === "ro" ? /necunoscută/ : /unknown/);
  }
});

test("A09: the views use the shared helpers and no separate rate rounding", () => {
  const fs = require("fs");
  const read = (f) => fs.readFileSync(path.join(ROOT, "js", f), "utf8");
  for (const f of ["dashboard.js", "location.js", "story.js"]) {
    assert.match(read(f), /qualityHtml/, f);
    assert.doesNotMatch(read(f), /Math\.round\(\(failed/, f);
    assert.doesNotMatch(read(f), /kpi_error_rate|deliveryStats/, f);
  }
});

test("the data proves no complete reporting: error_reporting values", () => {
  const by = Object.fromEntries(meta.months.map((m) => [m.key, m.error_reporting]));
  assert.equal(by["2026-04"], "observed");
  assert.equal(by["2026-03"], "unknown");
  assert.equal(by["2026-01"], "not_applicable");
});
