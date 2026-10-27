"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { ROOT, loadApp } = require("./helpers.cjs");

function sources(lang, srcs) {
  const app = loadApp(lang);
  app.run(`DATA.meta = Object.assign({}, DATA.meta, { sources: ${JSON.stringify(srcs)}, months: [], last_modified: null });`);
  app.run("function storyMonthKeys() { return []; }");
  app.run(fs.readFileSync(path.join(ROOT, "js", "story.js"), "utf8").match(/function sourcesHtml\(\)[\s\S]*?\n}\n/)[0]);
  return app.run("sourcesHtml()");
}
const base = { month: "2030-01", dataset: "d", shape: "R", rows: 3, grand_total: 3, warnings: [], last_modified: "2030-02-01T10:00:00" };

test("a null fetched_at shows unknown, in both languages", () => {
  assert.match(sources("ro", [{ ...base, fetched_at: null }]), /descărcat: necunoscut/);
  assert.match(sources("en", [{ ...base, fetched_at: null }]), /unknown/);
});

test("a known fetched_at shows its date and last_modified stays separate", () => {
  const h = sources("ro", [{ ...base, fetched_at: "2030-02-03T04:05:06Z" }]);
  assert.match(h, /modificat la sursă: 2030-02-01/);
  assert.match(h, /descărcat: 2030-02-03/);
});
