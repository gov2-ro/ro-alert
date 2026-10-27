/* Repeatable render measurement (audit 06, B09). Not part of the pass/fail suite.
   Run: node tests/browser/measure.cjs        Optional: RUNS=7 CPU_THROTTLE=4
   For each selection it reports the DOM element count of #content-main and the time from a
   state change (update()) to the next painted frame, median of RUNS runs. The same script
   runs on any commit, so before and after use the same conditions. It prints the browser
   version, the machine and the CPU throttle rate, because the times depend on them. */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright-core");

const ROOT = path.resolve(__dirname, "..", "..");
const URL = "file://" + path.join(ROOT, "index.html");
const CHROME = process.env.CHROME_PATH || [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].find((p) => fs.existsSync(p));
const RUNS = Number(process.env.RUNS || 5);
const THROTTLE = Number(process.env.CPU_THROTTLE || 1);

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Europe/Bucharest" });
  const page = await ctx.newPage();
  await page.route("**/*", (r) => (/^(file|data|blob):/.test(r.request().url()) ? r.continue() : r.abort()));
  await page.goto(URL);
  await page.waitForSelector("#kpis .kpi");
  if (THROTTLE > 1) { const c = await ctx.newCDPSession(page); await c.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE }); }
  console.log(`browser ${browser.version()} | ${os.cpus()[0].model} x${os.cpus().length} | ${os.platform()} ${os.release()} | cpu throttle x${THROTTLE} | runs ${RUNS} (median)`);

  const cases = [
    { name: "Dashboard, all alerts, add filter Meteo", view: "dashboard", prep: "", change: "state.filters.risk_category.add('Meteo')", reset: "state.filters.risk_category.clear()" },
    { name: "Table, all alerts, add filter Meteo", view: "table", prep: "", change: "state.filters.risk_category.add('Meteo')", reset: "state.filters.risk_category.clear()" },
    { name: "Feed, all alerts, add filter Meteo", view: "feed", prep: "", change: "state.filters.risk_category.add('Meteo')", reset: "state.filters.risk_category.clear()" },
    { name: "Local, county Harghita, add filter Meteo", view: "location", prep: "state.selectedCounty='Harghita'", change: "state.filters.risk_category.add('Meteo')", reset: "state.filters.risk_category.clear()" },
    { name: "Dashboard, language switch RO to EN", view: "dashboard", prep: "", change: "state.lang='en'", reset: "state.lang='ro'" },
  ];
  const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  for (const c of cases) {
    const out = await page.evaluate(async ({ c, RUNS }) => {
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      state.filters.risk_category.clear(); state.lang = "ro"; state.search = ""; state.selectedCounty = null; state.selectedPlaceId = null; state.page = 1;
      state.view = c.view; if (c.prep) (0, eval)(c.prep);
      update("replace"); await frame();
      const base = document.querySelectorAll("#content-main *").length;
      const times = []; let after = 0;
      for (let i = 0; i < RUNS; i++) {
        const t0 = performance.now();
        (0, eval)(c.change); update("replace"); await frame();
        times.push(performance.now() - t0);
        after = document.querySelectorAll("#content-main *").length;
        (0, eval)(c.reset); update("replace"); await frame();
      }
      return { base, after, times, rows: currentRows.length };
    }, { c, RUNS });
    console.log(`${c.name}: DOM ${out.base} at start, ${out.after} after the change; median ${med(out.times).toFixed(0)} ms (${out.times.map((x) => x.toFixed(0)).join(", ")})`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(2); });
