/* Browser smoke test from file:// (audit 01, check A10, and the chart checks of A05-A09).
   Needs the development dependency: npm install   (installs playwright-core only)
   Needs Google Chrome or Chromium on the machine. Set CHROME_PATH when it is not in the usual place.
   Run: node tests/browser/smoke.cjs
   Optional: SHOTS=/some/folder writes screenshots there.
   The test aborts every request that is not file://. The only external request allowed is the
   optional Simple Analytics tag in index.html; the page works without it. Its blocked load
   shows as a console "Failed to load resource" line, which the test ignores. */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const ROOT = path.resolve(__dirname, "..", "..");
const URL = "file://" + path.join(ROOT, "index.html");
const CHROME = process.env.CHROME_PATH || [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].find((p) => fs.existsSync(p));
const SHOTS = process.env.SHOTS;
const ZONES = ["UTC", "Europe/Bucharest", "America/New_York"];
const WIDTHS = [1440, 1024, 390, 320];

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
}

async function open(browser, tz, width, lang) {
  const ctx = await browser.newContext({ timezoneId: tz, viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  const external = [];
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith("file://") || u.startsWith("data:") || u.startsWith("blob:")) return route.continue();
    if (!/^https:\/\/(scripts|queue)\.simpleanalyticscdn\.com\//.test(u)) external.push(u);
    return route.abort();
  });
  await page.goto(URL);
  await page.waitForSelector("#kpis .kpi");
  if (lang === "en") {
    await page.click('#langtoggle [data-lang="en"]');
    await page.waitForSelector("#kpis .kpi");
  }
  return { ctx, page, errors, external };
}

async function view(page, name) {
  await page.click(`.view-tab[data-view="${name}"]`);
  await page.waitForTimeout(150);
}

(async () => {
  if (!CHROME) throw new Error("No Chrome found. Set CHROME_PATH.");
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  for (const tz of ZONES) {
    const { ctx, page, errors, external } = await open(browser, tz, 1440, "ro");
    const tag = `[${tz}]`;
    // Daily chart: 210 unique labels, stacks total 3385, Aug 31 holds 16, Mar 29 once.
    const daily = await page.evaluate(() => {
      const c = charts["chart-timeline"];
      const labels = c.data.labels;
      const bars = c.data.datasets.filter((d) => d.type !== "line");
      const total = labels.map((_, i) => bars.reduce((s, d) => s + d.data[i], 0));
      return { n: labels.length, u: new Set(labels).size, sum: total.reduce((a, b) => a + b, 0),
               aug31: total[labels.indexOf("2026-08-31")], mar29: labels.filter((x) => x === "2026-03-29").length,
               first: labels[0], last: labels[labels.length - 1] };
    });
    check(`${tag} A05 210 unique dates Feb 3 - Aug 31`, daily.n === 210 && daily.u === 210 && daily.first === "2026-02-03" && daily.last === "2026-08-31", JSON.stringify(daily));
    check(`${tag} A06 stacks 3385, Aug 31 = 16, Mar 29 once`, daily.sum === 3385 && daily.aug31 === 16 && daily.mar29 === 1);

    // A07: filtered date range keeps the last day and internal zero days.
    await page.evaluate(() => { state.dateFrom = "2026-05-02"; state.dateTo = "2026-05-09"; render(); });
    const rng = await page.evaluate(() => {
      const c = charts["chart-timeline"];
      const bars = c.data.datasets.filter((d) => d.type !== "line");
      const total = c.data.labels.map((_, i) => bars.reduce((s, d) => s + d.data[i], 0));
      const rows = DATA.alerts.filter((a) => a.date >= "2026-05-02" && a.date <= "2026-05-09");
      return { n: c.data.labels.length, last: c.data.labels.slice(-1)[0], sum: total.reduce((a, b) => a + b, 0), rows: rows.length };
    });
    check(`${tag} A07 date range axis and total`, rng.sum === rng.rows && rng.last <= "2026-05-09" && rng.n >= 1, JSON.stringify(rng));
    await page.evaluate(() => { state.dateFrom = null; state.dateTo = null; render(); });

    // A08/A09: Dashboard KPIs, all data.
    const kpis = await page.innerText("#quality");
    check(`${tag} A08 Dashboard shows 1 / 237 and 196 / 470`, /1 \/ 237/.test(kpis) && /196 \/ 470/.test(kpis) && !/1 \/ 3385/.test(kpis));
    // Phase 05: the sidebar keeps one result line; the diagnostics appear once, in the view.
    const side = await page.innerText("#sidebar-stats");
    check(`${tag} A09 sidebar has the result count only, no duplicate diagnostics`, /3\.385 rezultate/.test(side) && !/\//.test(side));
    // May only: unknown coverage, no rate.
    await page.evaluate(() => { state.filters.month.add("Mai 2026"); render(); });
    const may = await page.innerText("#quality");
    check(`${tag} A08 May shows unknown coverage, no failure rate`, /necunoscut/i.test(may) && !/0%/.test(may), may.replace(/\s+/g, " ").slice(0, 160));
    await page.evaluate(() => { state.filters.month.clear(); state.filters.month.add("Aprilie 2026"); render(); });
    const apr = await page.innerText("#quality");
    check(`${tag} A08 April shows 1 / 237`, /1 \/ 237/.test(apr) && /196 \/ 470/.test(apr));
    await page.evaluate(() => { state.filters.month.clear(); render(); });

    // Other views: Feed, Pe scurt, Local.
    await view(page, "feed");
    const feed = await page.innerText("#feed-sidebar");
    check(`${tag} A09 Feed shows a compact summary and no second diagnostics report`, !/1 \/ 237/.test(feed) && /3\.385/.test(feed) && (await page.$("#quality")) === null);
    await view(page, "story");
    const story = await page.innerText("#quality");
    check(`${tag} A09 Pe scurt shows the sample`, /1 \/ 237/.test(story) && /196 \/ 470/.test(story));
    await page.evaluate(() => { state.selectedCounty = "Harghita"; state.view = "location"; document.querySelector('.view-tab[data-view="location"]').disabled = false; render(); });
    await page.waitForSelector("#loc-kpis .kpi");
    const loc = await page.innerText("#quality");
    check(`${tag} A09 Local shows the diagnostics once`, /Alerte eșuate observate/.test(loc) && (await page.$$("#quality")).length === 1);
    const locDaily = await page.evaluate(() => {
      const c = charts["chart-loc-timeline"];
      const bars = c.data.datasets.filter((d) => d.type !== "line");
      return { n: c.data.labels.length, u: new Set(c.data.labels).size, sum: bars.reduce((s, d) => s + d.data.reduce((a, b) => a + b, 0), 0),
               rows: DATA.alerts.filter((a) => a.judet === "Harghita").length };
    });
    check(`${tag} A07 Local timeline uses the same contract`, locDaily.n === locDaily.u && locDaily.sum === locDaily.rows, JSON.stringify(locDaily));

    check(`${tag} A10 no JS errors from file://`, errors.length === 0, errors.join(" | "));
    check(`${tag} A10 no external request`, external.length === 0, external.join(" "));
    await ctx.close();
  }

  // Both languages and widths: render, no JS errors, no page-wide horizontal scroll, screenshots.
  for (const lang of ["ro", "en"]) {
    for (const width of WIDTHS) {
      const { ctx, page, errors } = await open(browser, "Europe/Bucharest", width, lang);
      for (const v of ["dashboard", "story", "feed"]) {
        await view(page, v);
        if (SHOTS) {
          fs.mkdirSync(SHOTS, { recursive: true });
          await page.screenshot({ path: path.join(SHOTS, `${lang}-${v}-${width}.png`), fullPage: true });
        }
      }
      const text = await page.evaluate(() => document.body.innerText);
      check(`[${lang} ${width}px] views render without JS errors`, errors.length === 0 && text.length > 500, errors.join(" | "));
      if (lang === "en") {
        await view(page, "dashboard");
        const en = await page.innerText("#quality");
        check(`[en ${width}px] A09 EN coverage labels`, /Reporting sample/.test(en) && /Observed failed alerts/.test(en));
      }
      await ctx.close();
    }
  }

  await require("./state.cjs")({ browser, check, URL, SHOTS });
  await require("./visual.cjs")({ browser, check, URL, SHOTS });
  await require("./access.cjs")({ browser, check, URL, SHOTS, report: (m) => console.log("INFO  " + m) });

  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll browser checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
