/* Browser checks V01-V09 of audit phase 05 (visual hierarchy and geographic coverage).
   Called by smoke.cjs. Real clicks drive the controls; evaluated code only reads state and the DOM.
   V10 is the rest of the suite (all earlier checks) plus the unchanged data counts. */
"use strict";
const fs = require("fs");
const { useConsole } = require("./console-mode.cjs");
const path = require("path");

module.exports = async function run({ browser, check, URL, SHOTS }) {
  async function openAt(hash0, { lang = "ro", width = 1440, height = 900 } = {}) {
    let hash = hash0;
    const ctx = await browser.newContext({ timezoneId: "Europe/Bucharest", viewport: { width, height } });
    await useConsole(ctx);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await page.route("**/*", (route) => {
      const u = route.request().url();
      return u.startsWith("file://") || u.startsWith("data:") || u.startsWith("blob:") ? route.continue() : route.abort();
    });
    if (lang === "en" && !/lang=/.test(hash)) hash = (hash || "schema=1") + "&lang=en";
    await page.goto(hash ? `${URL}#${hash}` : URL);
    await page.waitForSelector("#content-main > *");
    await page.waitForTimeout(300);
    return { ctx, page, errors };
  }
  const shot = async (page, name, full) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: !!full });
  };
  const text = (page, sel) => page.innerText(sel);

  for (const lang of ["ro", "en"]) {
    const tag = `[${lang}]`;

    // ---- V01, V02, V03, V05: map modes and baseline coverage ----
    {
      const { ctx, page, errors } = await openAt("", { lang, height: 2400 });
      const first = await page.evaluate(() => ({
        mode: RoMap.mode, pressed: document.querySelector('#map-mode [data-map-mode="counties"]').getAttribute("aria-pressed"),
        layer: RoMap.placeLayer, circles: document.querySelectorAll("#map path.leaflet-interactive").length,
        shapes: RoMap.layer.getLayers().length,
      }));
      check(`${tag} V01 Dashboard opens in Counties mode with no locality points over the fills`,
        first.mode === "counties" && first.pressed === "true" && first.layer === null && first.circles === first.shapes, JSON.stringify(first));

      const cov = await text(page, "#map-coverage");
      const num = (n) => new Intl.NumberFormat(lang === "en" ? "en-GB" : "ro-RO").format(n);
      check(`${tag} V03 baseline county coverage 2,897 / 3,385 and 488 national`,
        cov.includes(num(2897)) && cov.includes(num(3385)) && cov.includes("85.6%") && cov.includes(num(488)), cov.replace(/\s+/g, " ").slice(0, 200));
      check(`${tag} V05 the combined Bucuresti-Ilfov convention and the issuer-county meaning are visible`,
        /Ilfov/.test(cov) && /ISU/.test(cov) && /(locul evenimentului|place of the event)/.test(cov));
      const lg = await text(page, "#map-legend");
      check(`${tag} V03 legend keeps numeric bounds and says the scale holds within this selection`,
        /\d+[–-]\d+/.test(lg) && /(în această selecție|within this selection)/.test(lg), lg.replace(/\s+/g, " ").slice(0, 160));

      await shot(page, `${lang}-v-dashboard-counties-1440`, true);
      const before = await page.evaluate(() => ({ hash: location.hash, n: document.getElementById("result-count").textContent, st: JSON.stringify(encodeState(state)), rows: currentRows.length, strip: document.getElementById("active-strip").hidden }));
      await page.click('#map-mode [data-map-mode="places"]');
      await page.waitForFunction(() => RoMap.mode === "places" && RoMap.placeLayer);
      const after = await page.evaluate(() => {
        const radii = []; RoMap.placeLayer.eachLayer((m) => radii.push(m.getRadius()));
        const fills = new Set(); RoMap.layer.eachLayer((l) => fills.add(l.options.fillColor));
        return { hash: location.hash, n: document.getElementById("result-count").textContent, st: JSON.stringify(encodeState(state)), rows: currentRows.length,
          points: radii.length, expect: RoMap.pointCount, maxR: Math.max(...radii), minR: Math.min(...radii), fills: [...fills], strip: document.getElementById("active-strip").hidden };
      });
      check(`${tag} V02 switching the map mode keeps filters, result count and the URL`,
        before.hash === after.hash && before.n === after.n && before.st === after.st && before.rows === after.rows && before.strip === after.strip, JSON.stringify([before, after]));
      check(`${tag} V02 Localities mode draws one point per resolved place, with bounded size and subdued county fills`,
        after.points === after.expect && after.points > 1000 && after.maxR <= 13.8 && after.minR >= 1.5 && after.fills.length === 1, JSON.stringify(after));
      const zoomR = await page.evaluate(() => {
        const m = RoMap.placeLayer.getLayers()[0]; const n = m.alertCount;
        RoMap.map.setZoom(6, { animate: false }); const r6 = m.getRadius();
        RoMap.map.setZoom(9, { animate: false }); const r9 = m.getRadius();
        return { n, r6, r9 };
      });
      check(`${tag} V02 point size follows the zoom`, zoomR.r9 > zoomR.r6, JSON.stringify(zoomR));
      const cov2 = await text(page, "#map-coverage");
      check(`${tag} V03 baseline place coverage 1,392 / 3,385 (41.1%), several-places note, separate mention quality`,
        cov2.includes(num(1392)) && cov2.includes(num(3385)) && cov2.includes("41.1%") && cov2.includes("94.9%") && /(mai multe localități|several places)/.test(cov2) && /(nu locul evenimentului|not the place of the event)/.test(cov2),
        cov2.replace(/\s+/g, " ").slice(0, 300));
      const lg2 = await text(page, "#map-legend");
      check(`${tag} V02 locality legend explains the point size`, /(Mărimea punctului|Point size)/.test(lg2));
      await shot(page, `${lang}-v-dashboard-places-1440`, false);
      await page.click('#map-mode [data-map-mode="counties"]');
      await page.waitForFunction(() => RoMap.mode === "counties" && RoMap.placeLayer === null);
      check(`${tag} V02 switching back removes the points`, true);
      // The mode survives a filter change (the map is drawn again).
      await page.click('#map-mode [data-map-mode="places"]');
      await page.fill("#search", "Harghita");
      await page.waitForFunction(() => state.search === "Harghita" && currentRows.length < 3385);
      const kept = await page.evaluate(() => RoMap.mode);
      check(`${tag} V02 the chosen map mode survives a filter change`, kept === "places");
      check(`${tag} V01-V05 no JS errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    }

    // ---- V04: filtered coverage equals an independent calculation ----
    {
      const { ctx, page, errors } = await openAt("schema=1&f.month=Mai+2026&f.risk_category=Meteo", { lang });
      const r = await page.evaluate(() => {
        const rows = DATA.alerts.filter((a) => a.month === "Mai 2026" && a.risk_category === "Meteo");
        let nat = 0, cty = 0, withPlace = 0;
        for (const a of rows) { if (a.scope === "national") nat++; else if (a.scope === "county") cty++; if (a.places && a.places.length) withPlace++; }
        const c = mapCoverage(currentRows);
        return { n: rows.length, nat, cty, withPlace, c: { total: c.total, county: c.county, national: c.national, withPlace: c.withPlace }, sel: currentRows.length };
      });
      check(`${tag} V04 filtered coverage equals an independent count from the selected rows`,
        r.sel === r.n && r.c.total === r.n && r.c.county === r.cty && r.c.national === r.nat && r.c.withPlace === r.withPlace && r.n > 0, JSON.stringify(r));
      const cov = await text(page, "#map-coverage");
      const num = (n) => new Intl.NumberFormat(lang === "en" ? "en-GB" : "ro-RO").format(n);
      check(`${tag} V04 the displayed coverage shows the selected counts`, cov.includes(num(r.cty)) && cov.includes(num(r.n)), cov.replace(/\s+/g, " ").slice(0, 160));
      const lg = await text(page, "#map-legend");
      const maxCount = await page.evaluate(() => Math.max(...Object.values(RoMap.counts)));
      check(`${tag} V04 the legend bound follows the selection maximum (${maxCount})`, lg.includes(String(maxCount)));
      const empty = await page.evaluate(() => {
        const c = mapCoverage([]);
        return { c, fmt: fmtShare(c.countyShare) + "|" + fmtShare(c.placeShare) };
      });
      check(`${tag} V04 empty coverage has no division by zero`, empty.c.total === 0 && empty.c.countyShare === null && empty.c.placeShare === null && empty.fmt === "—|—", JSON.stringify(empty));
      check(`${tag} V04 no JS errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    }

    // ---- V06: the diagnostics appear once per view, with period and denominators ----
    {
      const { ctx, page, errors } = await openAt("", { lang });
      const out = {};
      for (const v of ["dashboard", "story", "feed"]) {
        await page.click(`.view-tab[data-view="${v}"]`);
        await page.waitForTimeout(200);
        out[v] = await page.evaluate(() => ({
          quality: document.querySelectorAll("#quality").length,
          sample: (document.querySelector("#quality")?.innerText.match(/196 \/ 470/g) || []).length,
          side: /\//.test(document.getElementById("sidebar-stats").innerText),
          all: (document.getElementById("content-main").innerText.match(/196 \/ 470/g) || []).length,
          months: /2026-04/.test(document.querySelector("#quality")?.innerText || ""),
        }));
      }
      await page.goto(`${URL}#schema=1&county=Harghita${lang === "en" ? "&lang=en" : ""}`);
      await page.reload();
      await page.waitForSelector(".location-view");
      out.location = await page.evaluate(() => ({ quality: document.querySelectorAll("#quality").length, all: (document.getElementById("content-main").innerText.match(/\d+ \/ \d+ /g) || []).length }));
      check(`${tag} V06 Dashboard, Pe scurt and Local show one diagnostics section; Feed shows none`,
        out.dashboard.quality === 1 && out.story.quality === 1 && out.location.quality === 1 && out.feed.quality === 0, JSON.stringify(out));
      check(`${tag} V06 the sample, its months and denominators appear once; the sidebar repeats none`,
        out.dashboard.sample === 1 && out.dashboard.all === 1 && out.story.all === 1 && out.dashboard.months && !out.dashboard.side && !out.story.side && out.feed.all === 0, JSON.stringify(out));
      const unk = await page.evaluate(() => failureCoverage(DATA.alerts).stats.unknownAlerts);
      check(`${tag} V06 the unknown-coverage count is 3148 for the whole archive`, unk === 3385 - 237, String(unk));
      check(`${tag} V06 no JS errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    }

    // ---- V07: Pe scurt keeps the official distinction and the gap; changes are neutral ----
    {
      const { ctx, page, errors } = await openAt("schema=1&view=story", { lang });
      await page.waitForSelector("#chart-story-monthly");
      const s = await page.evaluate(() => {
        const c = charts["story-monthly"];
        const labels = c.data.labels.map((l) => (Array.isArray(l) ? l.join(" ") : l));
        const d = c.data.datasets[0];
        const gap = labels.findIndex((l) => l.startsWith("2025-11"));
        const off = labels.findIndex((l) => l.startsWith("2025-09"));
        const colors = [...document.querySelectorAll(".chg-v")].map((e) => getComputedStyle(e).color);
        const body = getComputedStyle(document.body).color;
        return { gapNull: d.data[gap] === null, gapLabel: labels[gap], offVal: d.data[off], offBorder: d.borderWidth[off], recBorder: d.borderWidth[labels.length - 1],
                 colors: [...new Set(colors)], body, cells: colors.length, hasPlus: [...document.querySelectorAll(".chg-v")].some((e) => /^[+−-]\d/.test(e.textContent)) };
      });
      check(`${tag} V07 Nov 2025 stays a null gap, official months stay hatched (bordered) with their totals`,
        s.gapNull && s.offVal === 286 && s.offBorder === 1 && s.recBorder === 0 && /(fără fișier|no file)/.test(s.gapLabel), JSON.stringify(s));
      check(`${tag} V07 volume changes use one neutral colour; the sign and number carry the direction`,
        s.colors.length === 1 && s.colors[0] === s.body && s.hasPlus, JSON.stringify(s));
      const kp = await text(page, ".kpis");
      check(`${tag} V07 Pe scurt keeps its narrative measures`, /%/.test(kp));
      check(`${tag} V07 no JS errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    }

    // ---- chart semantics: whole-number ticks on count axes ----
    {
      const { ctx, page, errors } = await openAt("schema=1&county=Harghita&place=83641", { lang });
      await page.waitForSelector("#chart-loc-timeline");
      const t = await page.evaluate(() => {
        const ticks = charts["chart-loc-timeline"].scales.y.ticks.map((x) => x.value);
        return { ticks, max: Math.max(...ticks) };
      });
      check(`${tag} V-chart Local daily chart y ticks are whole numbers`, t.ticks.every(Number.isInteger) && t.max >= 1 && t.max < 10, JSON.stringify(t));
      const cap = await text(page, ".location-grid .chart-cap");
      check(`${tag} V-chart the chart caption names the period and the denominator`, /\d{4}-\d{2}-\d{2}/.test(cap) && /\d/.test(cap));
      check(`${tag} V-chart no JS errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    }
  }

  // ---- V08: layout and reading order, three widths, both languages ----
  for (const lang of ["ro", "en"]) {
    for (const width of [320, 390, 1440]) {
      const tag = `[${lang} ${width}px]`;
      const { ctx, page, errors } = await openAt("", { lang, width, height: width > 800 ? 2600 : 900 });
      const dash = await page.evaluate(() => {
        const r = (s) => document.querySelector(s).getBoundingClientRect();
        const k = r("#kpis"), m = r(".map-panel"), tl = r("#chart-timeline").top ? r("#chart-timeline") : r("#chart-timeline"), q = r("#quality");
        const tp = document.querySelector("#chart-timeline").closest(".panel").getBoundingClientRect();
        return { order: k.top < m.top && m.top < q.top, side: tp.left >= m.right - 1 && Math.abs(tp.top - m.top) < 4, stacked: tp.top >= m.bottom - 1,
                 over: document.documentElement.scrollWidth - document.documentElement.clientWidth, kpiDup: /\//.test(document.getElementById("kpis").innerText) };
      });
      check(`${tag} V08 Dashboard order overview > map > quality, no horizontal scroll, no repeated failure cards`,
        dash.order && dash.over <= 0 && !dash.kpiDup && (width >= 1300 ? dash.side : dash.stacked), JSON.stringify(dash));
      await shot(page, `${lang}-v-dashboard-${width}`, true);
      await page.click('.view-tab[data-view="story"]');
      await page.waitForTimeout(300);
      const st = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await shot(page, `${lang}-v-story-${width}`, true);
      await page.goto(`${URL}#schema=1&county=Harghita${lang === "en" ? "&lang=en" : ""}`);
      await page.reload();
      await page.waitForSelector(".location-view");
      await page.waitForTimeout(300);
      const loc = await page.evaluate(() => ({
        over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        head: !!document.querySelector(".location-county-name") && !!document.getElementById("loc-back-btn"),
        order: document.querySelector("#loc-kpis").getBoundingClientRect().top < document.querySelector("#quality").getBoundingClientRect().top &&
               document.querySelector("#quality").getBoundingClientRect().top < document.querySelector("#location-feed").getBoundingClientRect().top,
      }));
      await shot(page, `${lang}-v-local-${width}`, true);
      check(`${tag} V08 Pe scurt and Local fit the width; Local keeps heading and back action and reads KPIs > quality > records`,
        st <= 0 && loc.over <= 0 && loc.head && loc.order, JSON.stringify({ st, loc }));
      check(`${tag} V08 no JS errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    }
  }

  // ---- V09: source status, coverage and method stay reachable in the Feed ----
  for (const lang of ["ro", "en"]) {
    for (const width of [390, 1440]) {
      const tag = `[${lang} ${width}px]`;
      const { ctx, page, errors } = await openAt("schema=1&view=feed", { lang, width });
      await page.waitForSelector(".feed-card");
      const g = await page.evaluate(() => {
        const c = document.getElementById("coverage").getBoundingClientRect();
        const link = document.querySelector("#coverage [data-goto-sources]").getBoundingClientRect();
        return { top: c.top, bottom: c.bottom, linkBottom: link.bottom, vh: innerHeight, txt: document.getElementById("coverage").innerText,
                 cards: document.querySelectorAll(".feed-card").length };
      });
      check(`${tag} V09 Feed shows coverage, freshness and the method link in the first screen, over ${g.cards} cards`,
        g.linkBottom < g.vh && /3[.,]385/.test(g.txt) && /(modificată|modified)/.test(g.txt) && /(descărcată|fetched)/.test(g.txt) && /(independent)/i.test(g.txt) && /(nu este un serviciu|not a live)/i.test(g.txt), JSON.stringify(g).slice(0, 400));
      await page.evaluate(() => { document.scrollingElement.scrollTop = 1500; document.getElementById("content-main").scrollTop = 1500; });
      const still = await page.evaluate(() => { const r = document.getElementById("coverage").getBoundingClientRect(); return r.bottom > 0 || getComputedStyle(document.documentElement).overflowY !== "hidden"; });
      await page.evaluate(() => { document.scrollingElement.scrollTop = 0; document.getElementById("content-main").scrollTop = 0; });
      await page.click("#coverage [data-goto-sources]");
      await page.waitForFunction(() => state.view === "story");
      const vis = await page.evaluate(() => { const r = document.getElementById("sources-section").getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
      check(`${tag} V09 the method link opens the Sources and method section`, vis && still);
      check(`${tag} V09 no JS errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    }
  }
};
