/* Loads the tracked data bundles and the browser-independent scripts into a vm context.
   The scripts are plain browser scripts, so this runs them as the page does, without a DOM. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function loadApp(lang = "ro") {
  const ctx = vm.createContext({ console, URLSearchParams });
  ctx.window = ctx;
  const run = (code, name) => vm.runInContext(code, ctx, { filename: name || "inline" });
  run(read("data/alerts.js"), "alerts.js");
  run(read("data/meta.js"), "meta.js");
  run("const esc = (s) => String(s == null ? '' : s);");
  for (const f of ["js/i18n.js", "js/stats.js", "js/data.js", "js/filters.js", "js/urlstate.js", "js/browse.js"]) run(read(f), f);
  run(`window.state = { lang: ${JSON.stringify(lang)} };`);
  // loadData uses window.GEO only to decide between globals and fetch
  run("window.GEO = { features: [{ properties: { name: 'x' } }] };");
  run("loadData()");
  return { ctx, run, alerts: run("DATA.alerts"), meta: run("DATA.meta") };
}

module.exports = { ROOT, read, loadApp };
