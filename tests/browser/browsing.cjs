/* Browser checks B01-B10 of audit phase 06 (browsing, export, rendering lifecycle, load errors).
   Called by smoke.cjs. Real clicks drive the controls; evaluated code reads state and the DOM.
   B09 (render measurement) is a separate script: node tests/browser/measure.cjs
   B11 is the whole suite plus the screenshots. */
"use strict";
const fs = require("fs");
const { useConsole } = require("./console-mode.cjs");
const http = require("http");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PAGE_FILES = ["index.html", "css", "js", "vendor", "data/alerts.js", "data/meta.js", "data/geo.js"];

/* A copy of the deployable files in a new temporary folder. `mutate(dir)` changes it. */
function pageCopy(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ro-alert-b10-"));
  for (const f of PAGE_FILES) {
    const dst = path.join(dir, f);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.cpSync(path.join(ROOT, f), dst, { recursive: true });
  }
  if (mutate) mutate(dir);
  return dir;
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".geojson": "application/json", ".png": "image/png" };

/* A static server for one folder. `delay[urlPath]` holds a response back, in ms. */
function serve(dir, delay = {}) {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split("?")[0]);
    const file = path.join(dir, u === "/" ? "index.html" : u);
    const send = () => {
      if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
      res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    };
    if (delay[u]) setTimeout(send, delay[u]); else send();
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

module.exports = async function run({ browser, check, URL, SHOTS }) {
  const shotDir = SHOTS && (fs.mkdirSync(SHOTS, { recursive: true }), SHOTS);
  const shot = async (page, name, full) => { if (shotDir) await page.screenshot({ path: path.join(shotDir, name + ".png"), fullPage: !!full }); };

  async function openAt(hash0, { lang = "ro", width = 1440, height = 900 } = {}) {
    let hash = hash0;
    const ctx = await browser.newContext({ timezoneId: "Europe/Bucharest", viewport: { width, height }, acceptDownloads: true });
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
    await page.waitForSelector("#content-main > :not(.boot-loading):not(noscript)");
    return { ctx, page, errors };
  }
  const L = (lang, ro, en) => (lang === "en" ? en : ro);
  const rowIds = (page) => page.evaluate(() => [...document.querySelectorAll("#table-body tr.data-row")].map((r) => r.dataset.id));
  const hashOf = (page) => page.evaluate(() => decodeURIComponent(location.hash));
  const expectedOrder = (page, sortKey, dir) => page.evaluate(({ sortKey, dir }) => {
    // Independent of the app's sort: key, direction, then id ascending.
    const col = TABLE_COLS.find((c) => c.key === sortKey);
    const d = dir === "asc" ? 1 : -1;
    return currentRows.slice().sort((a, b) => {
      const x = col.sort(a), y = col.sort(b);
      return x < y ? -d : x > y ? d : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    }).map((a) => a.id);
  }, { sortKey, dir });
  const readDownload = async (dl) => JSON.parse(fs.readFileSync(await dl.path(), "utf8"));

  // ---- B01, B02, B04: table pages ----
  for (const lang of ["ro", "en"]) {
    const tag = `[${lang}]`;
    {
      const { ctx, page, errors } = await openAt("view=table", { lang });
      const all = await page.evaluate(() => DATA.alerts.map((a) => a.id));
      const seen = [];
      let pages = 0, maxRows = 0, lastRows = 0;
      for (;;) {
        const ids = await rowIds(page);
        pages++; maxRows = Math.max(maxRows, ids.length); lastRows = ids.length;
        seen.push(...ids);
        const next = page.locator('#pager-bottom [data-page-go="next"]');
        if (await next.isDisabled()) break;
        await next.click();
        await page.waitForFunction((n) => document.querySelector(".pager-page").textContent.includes(String(n)), pages + 1);
      }
      const set = new Set(seen);
      check(`${tag} B01 pagination reaches every one of the 3,385 IDs once, 68 pages, at most 50 rows each`,
        seen.length === 3385 && set.size === 3385 && all.every((id) => set.has(id)) && pages === 68 && maxRows === 50 && lastRows === 35,
        JSON.stringify({ n: seen.length, unique: set.size, pages, maxRows, lastRows }));
      const range = await page.innerText("#pager-top .pager-range");
      check(`${tag} B01 the range line shows start-end of total and the page`, /3\.385|3,385/.test(range) && range.includes("3351") === false, range);
      check(`${tag} B01 no page error`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    }

    // B02: order is computed over the complete selection, then sliced; ties are stable.
    {
      const { ctx, page } = await openAt("view=table", { lang });
      const sameAs = async (key, dir, n) => {
        const exp = await expectedOrder(page, key, dir);
        const got = [];
        for (let i = 0; i < n; i++) {
          got.push(...(await rowIds(page)));
          const next = page.locator('#pager-top [data-page-go="next"]');
          if (i < n - 1) { await next.click(); await page.waitForFunction((k) => document.querySelector(".pager-page").textContent.includes(String(k)), i + 2); }
        }
        return got.join() === exp.slice(0, n * 50).join();
      };
      check(`${tag} B02 default order is newest first with id ties, pages 1-3 match an independent sort`, await sameAs("time", "desc", 3));
      // Sort by risk: thousands of ties. Pages 1-3 must equal the independent order (key, then id).
      await page.click('.sort-btn[data-key="risk"]');
      await page.waitForFunction(() => document.querySelector('th[data-key="risk"]').getAttribute("aria-sort") === "ascending");
      check(`${tag} B02 the new sort starts at page 1 and pages 1-3 match an independent sort with id ties`,
        (await hashOf(page)).includes("sort=risk") && !(await hashOf(page)).includes("page=") && await sameAs("risk", "asc", 3));
      const p2a = await (async () => { await page.click('#pager-top [data-page-go="prev"]'); await page.click('#pager-top [data-page-go="next"]'); return rowIds(page); })();
      await page.reload();
      await page.waitForSelector("#table-body tr");
      check(`${tag} B02 the same page after a reload shows the same records`, (await rowIds(page)).join() === p2a.join());
      // Filter before pagination: Meteo has 616 alerts = 13 pages; the last page holds 16.
      await page.goto(URL + "#schema=1&view=table&f.risk_category=Meteo&page=13");
      await page.waitForSelector("#table-body tr");
      const meteo = await page.evaluate(() => ({ rows: document.querySelectorAll("#table-body tr").length, all: [...document.querySelectorAll("#table-body tr")].every((r) => DATA.alerts.find((a) => a.id === r.dataset.id).risk_category === "Meteo"), range: document.querySelector(".pager-range").textContent }));
      check(`${tag} B02 a filter applies before the pages: Meteo has 13 pages and 16 rows on the last`, meteo.rows === 16 && meteo.all && /601/.test(meteo.range) && /616/.test(meteo.range), JSON.stringify(meteo));
      await ctx.close();
    }

    // B04: deep link, clamp, reset on filter change, Back.
    {
      const { ctx, page } = await openAt("view=table&page=5", { lang });
      const p5 = await page.evaluate(() => ({ range: document.querySelector(".pager-range").textContent, first: document.querySelector("#table-body tr").dataset.id, exp: sortRecords(currentRows, timeKey, "desc")[200].id }));
      check(`${tag} B04 a page deep link reloads on that page (201-250)`, /201/.test(p5.range) && /250/.test(p5.range) && p5.first === p5.exp, JSON.stringify(p5));
      await page.goto(URL + "#schema=1&view=table&page=999");
      await page.reload();
      await page.waitForSelector("#table-body tr");
      const clamp = await page.evaluate(() => ({ hash: decodeURIComponent(location.hash), page: document.querySelector(".pager-page").textContent, rows: document.querySelectorAll("#table-body tr").length }));
      check(`${tag} B04 an out-of-range page shows the last valid page and the URL reports it`, /page=68/.test(clamp.hash) && /68/.test(clamp.page) && clamp.rows === 35, JSON.stringify(clamp));
      await page.goto(URL + "#schema=1&view=table&page=3");
      await page.reload();
      await page.waitForSelector("#table-body tr");
      await page.locator('#facets input[data-field="risk_category"][value="Meteo"]').check();
      await page.waitForFunction(() => currentRows.length === 616);
      const reset = await page.evaluate(() => ({ hash: decodeURIComponent(location.hash), range: document.querySelector(".pager-range").textContent }));
      check(`${tag} B04 a filter change resets the page to 1`, !/page=/.test(reset.hash) && /^1/.test(reset.range), JSON.stringify(reset));
      await page.goBack();
      await page.waitForFunction(() => currentRows.length === 3385);
      const back = await page.evaluate(() => ({ hash: decodeURIComponent(location.hash), range: document.querySelector(".pager-range").textContent }));
      check(`${tag} B04 Back restores the page and the earlier selection`, /page=3/.test(back.hash) && /101/.test(back.range) && /3\.385|3,385/.test(back.range), JSON.stringify(back));
      // Page steps are history entries too.
      await page.click('#pager-top [data-page-go="next"]');
      await page.click('#pager-top [data-page-go="next"]');
      await page.goBack();
      const step = await page.evaluate(() => ({ hash: decodeURIComponent(location.hash) }));
      check(`${tag} B04 Back after a page step returns to the previous page`, /page=4/.test(step.hash), JSON.stringify(step));
      // Focus and position after a page change.
      await page.click('#pager-top [data-page-go="next"]');
      const foc = await page.evaluate(() => ({ id: document.activeElement.id, top: Math.round(document.getElementById("list-heading").getBoundingClientRect().top) }));
      check(`${tag} B04 after a page change focus is on the list heading and its start is visible`, foc.id === "list-heading" && foc.top >= 0 && foc.top < 300, JSON.stringify(foc));
      await shot(page, `${lang}-b-table-1440`);
      await ctx.close();
    }
  }

  // ---- B03: Feed and Local mount at most 50 records; counts and charts cover the selection ----
  for (const lang of ["ro", "en"]) {
    const tag = `[${lang}]`;
    {
      const { ctx, page } = await openAt("view=feed", { lang });
      const f = await page.evaluate(() => ({ cards: document.querySelectorAll("#feed-body .feed-card").length, dom: document.querySelectorAll("#content-main *").length,
        count: document.getElementById("result-count").textContent, side: document.querySelector(".feed-sum-n").textContent, range: document.querySelector(".pager-range").textContent }));
      check(`${tag} B03 Feed mounts 50 cards and still reports 3,385 alerts`, f.cards === 50 && /3[.,]?385/.test(f.count) && /3[.,]385/.test(f.side) && /3[.,]385/.test(f.range), JSON.stringify(f));
      check(`${tag} B09 Feed DOM has fewer than 5,000 elements`, f.dom < 5000, String(f.dom));
      // A date that continues on another page says so: find a page boundary inside one day.
      const split = await page.evaluate(() => {
        const sorted = sortRecords(currentRows, timeKey, "desc");
        for (let i = 49; i < sorted.length - 1; i += 50) if (sorted[i].date === sorted[i + 1].date) return { page: (i + 1) / 50, date: sorted[i].date, total: dateCounts(currentRows).get(sorted[i].date) };
        return null;
      });
      await page.goto(URL + `#schema=1&view=feed&page=${split.page}` + (lang === "en" ? "&lang=en" : ""));
      await page.reload();
      await page.waitForSelector("#feed-body .feed-card");
      const hdrs = await page.evaluate(() => [...document.querySelectorAll(".date-header")].map((h) => h.textContent));
      check(`${tag} B03 a date that continues on the next page states the full day count (${split.total})`,
        hdrs[hdrs.length - 1].includes(String(split.total)) && /(pe alte pagini|on other pages)/.test(hdrs[hdrs.length - 1]), JSON.stringify(hdrs.slice(-1)));
      await shot(page, `${lang}-b-feed-1440`);
      await ctx.close();
    }
    {
      const { ctx, page } = await openAt("county=Harghita", { lang });
      await page.waitForSelector("#loc-kpis .kpi");
      const l = await page.evaluate(() => {
        const c = charts["chart-loc-timeline"];
        const bars = c.data.datasets.filter((d) => d.type !== "line");
        return { cards: document.querySelectorAll("#location-feed .feed-card").length, dom: document.querySelectorAll("#content-main *").length,
          sum: bars.reduce((s, d) => s + d.data.reduce((a, b) => a + b, 0), 0), rows: DATA.alerts.filter((a) => a.judet === "Harghita").length,
          title: document.querySelector(".location-county-count").textContent, range: document.querySelector(".pager-range").textContent };
      });
      check(`${tag} B03 Local mounts 50 cards; the heading count, the range and the timeline cover all ${418} Harghita alerts`,
        l.cards === 50 && l.sum === l.rows && l.rows === 418 && /418/.test(l.title) && /418/.test(l.range), JSON.stringify(l));
      await page.click('#pager-bottom [data-page-go="next"]');
      const l2 = await page.evaluate(() => ({ cards: document.querySelectorAll("#location-feed .feed-card").length, id: document.activeElement.id, hash: decodeURIComponent(location.hash) }));
      check(`${tag} B03 Local page 2 is in the URL and focuses the list heading`, l2.id === "list-heading" && /page=2/.test(l2.hash) && l2.cards === 50, JSON.stringify(l2));
      await shot(page, `${lang}-b-local-1440`);
      await ctx.close();
    }
  }

  // ---- B05, B06: export ----
  for (const lang of ["ro", "en"]) {
    const tag = `[${lang}]`;
    const { ctx, page } = await openAt("view=table&f.risk_category=Meteo&page=2", { lang });
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("[data-export]")]);
    const env = await readDownload(dl);
    const want = await page.evaluate(() => currentRows.map((a) => a.id).sort());
    const got = env.records.map((r) => r.id);
    const same = await page.evaluate((recs) => {
      const byId = new Map(DATA.alerts.map((a) => [a.id, a]));
      return recs.every((r) => { const a = byId.get(r.id); return r.msg === a.msg && r.msg_ro === a.msg_ro && r.msg_en === a.msg_en && r.title === a.title && JSON.stringify(r.deliveries) === JSON.stringify(a.deliveries); });
    }, env.records);
    const deliveries = env.records.reduce((s, r) => s + r.deliveries.length, 0);
    const wantDeliveries = await page.evaluate(() => currentRows.reduce((s, a) => s + a.deliveries.length, 0));
    check(`${tag} B05 the export holds all 616 selected IDs once, including those beyond the current page`,
      env.records.length === 616 && new Set(got).size === 616 && got.slice().sort().join() === want.join(), String(env.records.length));
    check(`${tag} B05 every delivery of every selected record is exported`, deliveries === wantDeliveries && wantDeliveries >= 616, `${deliveries}/${wantDeliveries}`);
    check(`${tag} B06 original message text and deliveries equal the source records`, same);
    const timeOrder = await page.evaluate((recs) => JSON.stringify(recs.map((r) => r.id)) === JSON.stringify(sortRecords(recs, timeKey, "desc").map((r) => r.id)), env.records);
    check(`${tag} B06 records follow the active sort with id ties`, timeOrder);
    const keys = Object.keys(env).join();
    check(`${tag} B06 envelope: schema_version 1, ISO exported_at, selection, sources, attribution, coverage, records`,
      env.schema_version === 1 && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(env.exported_at) && /selection/.test(keys) && /sources/.test(keys) && /attribution/.test(keys) && /coverage/.test(keys) && keys.endsWith("records"), keys);
    check(`${tag} B06 selection states filters and language and excludes page and open record`,
      JSON.stringify(env.selection.filters) === JSON.stringify({ risk_category: ["Meteo"] }) && env.selection.language === lang && env.selection.count === 616 &&
      !("page" in env.selection) && !("record" in env.selection) && env.selection.sort.key === "time", JSON.stringify(env.selection));
    const months = [...new Set(env.records.map((r) => r.source_file.slice(0, 7)))].sort();
    check(`${tag} B06 sources describe exactly the months of the selection`, env.sources.map((s) => s.month).sort().join() === months.join() && env.sources.every((s) => "last_modified" in s && "dataset" in s), env.sources.map((s) => s.month).join());
    check(`${tag} B06 attribution and coverage explanation are in the language of the page`,
      L(lang, /IGSU/, /IGSU/).test(env.attribution) && env.coverage.note.includes(L(lang, "rezumat", "summary")) && env.coverage.selected_records === 616 && env.coverage.archive_detail_records === 3385,
      env.coverage.note.slice(0, 60));
    check(`${tag} B06 the file name describes the selection`, /^ro-alert-selection-616-alerts-\d{4}-\d\d-\d\d_\d{4}-\d\d-\d\d-(ro|en)\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    const status = await page.innerText("#export-status");
    check(`${tag} B05 the page reports the started export`, /616/.test(status), status);
    // Feed export, no filter: all 3,385 records and 3,618 deliveries.
    await page.click('.view-tab[data-view="feed"]');
    await page.evaluate(() => { state.filters.risk_category.clear(); update("replace"); });
    await page.waitForSelector("#feed-body .feed-card");
    const [dl2] = await Promise.all([page.waitForEvent("download"), page.click("[data-export]")]);
    const all = await readDownload(dl2);
    check(`${tag} B05 Feed exports the whole archive selection: 3,385 records, 3,618 deliveries, unique IDs`,
      all.records.length === 3385 && new Set(all.records.map((r) => r.id)).size === 3385 && all.records.reduce((s, r) => s + r.deliveries.length, 0) === 3618 && all.selection.view === "feed");
    // Zero results: disabled, with the reason.
    await page.fill("#search", "zzzzqqqq");
    await page.waitForSelector(".empty-state");
    const none = await page.evaluate(() => ({ dis: document.querySelector(".export-btn").disabled, why: document.getElementById("export-why").textContent, desc: document.querySelector(".export-btn").getAttribute("aria-describedby") }));
    check(`${tag} B06 export is disabled for zero results and says why`, none.dis && none.desc === "export-why" && /(nimic de exportat|Nothing to export)/.test(none.why), JSON.stringify(none));
    await shot(page, `${lang}-b-export-empty-1440`);
    await ctx.close();
  }
  const bundles = ["data/alerts.js", "data/meta.js", "data/geo.js"].map((f) => fs.readFileSync(path.join(ROOT, f), "utf8"));
  check("B06 exported_at is never written into the static bundles", bundles.every((b) => !/exported_at/.test(b)));

  // ---- B07, B08: lifecycle ----
  for (const lang of ["ro", "en"]) {
    const tag = `[${lang}]`;
    const { ctx, page, errors } = await openAt("", { lang, height: 1400 });
    await page.waitForFunction(() => Object.keys(charts).length === 5 && RoMap.map);
    await page.evaluate(() => { window.__keep = { map: RoMap.map, charts: { ...charts }, canvases: Object.fromEntries(Object.keys(charts).map((k) => [k, charts[k].canvas])), shell: document.getElementById("map") }; });
    await page.locator('#facets input[data-field="risk_category"][value="Meteo"]').check();
    await page.waitForFunction(() => currentRows.length === 616);
    await page.click('#langtoggle [data-lang="' + (lang === "ro" ? "en" : "ro") + '"]');
    await page.waitForFunction((l) => state.lang !== l, lang);
    const alive = await page.evaluate(() => ({
      sameMap: RoMap.map === window.__keep.map, sameShell: document.getElementById("map") === window.__keep.shell,
      sameCharts: Object.keys(window.__keep.charts).every((k) => charts[k] === window.__keep.charts[k] && charts[k].canvas === window.__keep.canvases[k] && document.contains(charts[k].canvas)),
      n: Object.keys(charts).length, canvases: document.querySelectorAll("#content-main canvas").length,
      containers: document.querySelectorAll(".leaflet-container").length,
      total: charts["chart-timeline"].data.datasets.filter((d) => d.type !== "line").reduce((s, d) => s + d.data.reduce((a, b) => a + b, 0), 0),
    }));
    check(`${tag} B07 a filter and a language change keep the map and all five chart instances (and their canvases)`,
      alive.sameMap && alive.sameShell && alive.sameCharts && alive.n === 5 && alive.canvases === 5 && alive.containers === 1, JSON.stringify(alive));
    check(`${tag} B07 the kept chart shows the new selection (616)`, alive.total === 616, String(alive.total));
    // Leaving the view releases the resources; coming back creates one instance per canvas.
    await page.click('.view-tab[data-view="table"]');
    const left = await page.evaluate(() => ({ charts: Object.keys(charts).length, map: RoMap.map, containers: document.querySelectorAll(".leaflet-container").length, canvases: document.querySelectorAll("#content-main canvas").length }));
    check(`${tag} B07 leaving the Dashboard releases charts and map`, left.charts === 0 && left.map === null && left.containers === 0 && left.canvases === 0, JSON.stringify(left));
    await page.click('.view-tab[data-view="dashboard"]');
    await page.waitForFunction(() => Object.keys(charts).length === 5 && RoMap.map);
    const back = await page.evaluate(() => ({ n: Object.keys(charts).length, canvases: document.querySelectorAll("#content-main canvas").length, one: [...document.querySelectorAll("#content-main canvas")].every((c) => Chart.getChart(c) === Object.values(charts).find((x) => x.canvas === c)), containers: document.querySelectorAll(".leaflet-container").length }));
    check(`${tag} B07 returning draws exactly one instance per canvas and one map`, back.n === 5 && back.canvases === 5 && back.one && back.containers === 1, JSON.stringify(back));
    // An empty selection releases them; results coming back mount again.
    await page.fill("#search", "zzzzqqqq");
    await page.waitForSelector(".empty-state");
    const empty = await page.evaluate(() => ({ charts: Object.keys(charts).length, map: RoMap.map }));
    await page.fill("#search", "");
    await page.waitForFunction(() => Object.keys(charts).length === 5 && RoMap.map);
    check(`${tag} B07 an empty selection releases the resources and clearing it mounts them once`, empty.charts === 0 && empty.map === null);
    // Local keeps its charts across a filter change.
    await page.goto(URL + "#schema=1&county=Harghita" + (lang === "en" ? "&lang=en" : ""));
    await page.reload();
    await page.waitForSelector("#loc-kpis .kpi");
    await page.evaluate(() => { window.__loc = { ...charts }; });
    await page.locator('#facets input[data-field="risk_category"][value="Animale periculoase"]').check();
    await page.waitForFunction(() => currentRows.length < 418);
    const loc = await page.evaluate(() => ({ same: Object.keys(window.__loc).length === 3 && Object.keys(window.__loc).every((k) => charts[k] === window.__loc[k]), n: Object.keys(charts).length, canvases: document.querySelectorAll("#content-main canvas").length }));
    check(`${tag} B07 Local keeps its three chart instances across a filter change`, loc.same && loc.n === 3 && loc.canvases === 3, JSON.stringify(loc));
    check(`${tag} B07 no page error across mounts`, errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  {
    const { ctx, page } = await openAt("", { height: 1400 });
    await page.waitForFunction(() => RoMap.map);
    const first = await page.evaluate(() => ({ z: RoMap.map.getZoom(), c: RoMap.map.getCenter() }));
    await page.evaluate(() => { RoMap.map.setView([46.0, 25.5], 8, { animate: false }); });
    const before = await page.evaluate(() => ({ z: RoMap.map.getZoom(), c: RoMap.map.getCenter() }));
    await page.locator('#facets input[data-field="risk_category"][value="Meteo"]').check();
    await page.waitForFunction(() => currentRows.length === 616);
    await page.fill("#search", "vant");
    await page.waitForFunction(() => currentRows.length < 616);
    const after = await page.evaluate(() => ({ z: RoMap.map.getZoom(), c: RoMap.map.getCenter() }));
    check("B08 map zoom and centre survive filter and search changes",
      after.z === before.z && Math.abs(after.c.lat - before.c.lat) < 1e-6 && Math.abs(after.c.lng - before.c.lng) < 1e-6, JSON.stringify([before, after]));
    // Fit selection: filter to one county, then fit.
    await page.fill("#search", "");
    await page.locator('#facets input[data-field="risk_category"][value="Meteo"]').uncheck();
    await page.evaluate(() => { state.filters.judet.add("Harghita"); update("push"); });
    await page.waitForFunction(() => currentRows.length === 418);
    await page.evaluate(() => { RoMap.map.setView([46.0, 25.5], 6, { animate: false }); });
    await page.click("#map-fit");
    await page.waitForFunction(() => !RoMap.map._animatingZoom && RoMap.map.getZoom() > 6);     // the zoom animates
    const fit = await page.evaluate(() => {
      let hb = null; RoMap.layer.eachLayer((l) => { if (l.feature.properties.name.toLowerCase().startsWith("harghita")) hb = l.getBounds(); });
      const mb = RoMap.map.getBounds();
      return { contains: mb.contains(hb), zoom: RoMap.map.getZoom(), area: (mb.getNorth() - mb.getSouth()) * (mb.getEast() - mb.getWest()), harea: (hb.getNorth() - hb.getSouth()) * (hb.getEast() - hb.getWest()) };
    });
    check("B08 Fit selection frames the selected county (inside the view, tighter than the country)", fit.contains && fit.zoom > first.z && fit.area < 12 * fit.harea, JSON.stringify([first, fit]));
    // Explicit scope navigation: open the county in Local, leave it: the Dashboard frames the country again.
    await page.evaluate(() => { state.filters.judet.clear(); update("push"); });
    await page.waitForFunction(() => currentRows.length === 3385);
    await page.evaluate(() => { RoMap.map.setView([46.0, 25.5], 8, { animate: false }); });
    await page.click("#map-list summary");
    await page.click('#county-list [data-county="Harghita"]');
    await page.waitForSelector("#loc-kpis .kpi");
    await page.click("#loc-back-btn");
    await page.waitForFunction(() => RoMap.map && Object.keys(charts).length === 5);
    const reframed = await page.evaluate(() => ({ z: RoMap.map.getZoom(), c: RoMap.map.getCenter() }));
    check("B08 scope navigation (Local and back) frames the whole country again", reframed.z === first.z && Math.abs(reframed.c.lat - first.c.lat) < 0.05, JSON.stringify([first, reframed]));
    // The map mode survives a filter change while the Dashboard stays.
    await page.click('#map-mode [data-map-mode="places"]');
    await page.locator('#facets input[data-field="risk_category"][value="Meteo"]').check();
    await page.waitForFunction(() => currentRows.length === 616);
    check("B08 the map mode survives a filter change", await page.evaluate(() => RoMap.mode === "places" && RoMap.placeLayer && document.querySelector('#map-mode [data-map-mode="places"]').getAttribute("aria-pressed") === "true"));
    await ctx.close();
  }

  // ---- B10: load and schema failures ----
  async function failPage(dir, { hash = "", http: base } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route("**/*", (route) => {
      const u = route.request().url();
      return u.startsWith("file://") || u.startsWith("data:") || u.startsWith("http://127.0.0.1") ? route.continue() : route.abort();
    });
    await page.goto((base || "file://" + path.join(dir, "index.html")) + hash);
    return { ctx, page, errors };
  }
  const errorText = async (page) => {
    await page.waitForSelector(".boot-error", { timeout: 8000 });
    return page.evaluate(() => ({ text: document.querySelector(".boot-error").innerText, role: document.querySelector(".boot-error").getAttribute("role"), retry: !!document.getElementById("boot-retry"), focus: document.activeElement && document.activeElement.id, empty: document.getElementById("content-main").innerText.trim().length === 0 }));
  };
  const cases = [
    ["missing data/geo.js", (d) => fs.rmSync(path.join(d, "data/geo.js")), /data\/geo\.js/],
    ["missing data/alerts.js", (d) => fs.rmSync(path.join(d, "data/alerts.js")), /data\/alerts\.js/],
    ["missing js/charts.js", (d) => fs.rmSync(path.join(d, "js/charts.js")), /js\/charts\.js/],
    ["unsupported schema version", (d) => { const f = path.join(d, "data/meta.js"); fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(/"schema_version":\s*1/, '"schema_version": 99')); }, /schema 99|schema 99/],
    ["malformed alerts (not a list)", (d) => fs.writeFileSync(path.join(d, "data/alerts.js"), "window.ALERTS = { broken: true };\n"), /(list[ăa] de alerte|list of alerts)/],
    ["empty alerts list", (d) => fs.writeFileSync(path.join(d, "data/alerts.js"), "window.ALERTS = [];\n"), /(nicio alertă|no alert)/],
    ["alerts without ids", (d) => fs.writeFileSync(path.join(d, "data/alerts.js"), "window.ALERTS = [{ title: 'x' }];\n"), /(identificator|valid id)/],
    ["syntax error in data/alerts.js", (d) => fs.writeFileSync(path.join(d, "data/alerts.js"), "window.ALERTS = [ {;\n"), /data\/alerts\.js/],
  ];
  for (const [name, mutate, re] of cases) {
    const dir = pageCopy(mutate);
    const { ctx, page } = await failPage(dir, { hash: "#schema=1&view=table" });
    const e = await errorText(page);
    check(`B10 ${name}: a readable error with Retry, focus on Retry, the page is not empty`,
      e.role === "alert" && e.retry && e.focus === "boot-retry" && !e.empty && re.test(e.text), e.text.replace(/\s+/g, " ").slice(0, 200));
    if (name === "missing data/geo.js") {
      // Retry reloads the page and keeps the URL selection; with the file back, the app starts.
      fs.copyFileSync(path.join(ROOT, "data/geo.js"), path.join(dir, "data/geo.js"));
      await Promise.all([page.waitForNavigation(), page.click("#boot-retry")]);
      await page.waitForSelector("#kpis .kpi");
      check("B10 Retry reloads, keeps the selection in the URL and starts once the file is back", (await page.evaluate(() => location.hash)).includes("view=table") && (await page.evaluate(() => state.view)) === "table");
    }
    if (name === "missing data/alerts.js") await shot(page, "en-b-load-error-1000");
    await ctx.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  {
    // English wording follows the lang key of the link.
    const dir = pageCopy((d) => fs.rmSync(path.join(d, "data/geo.js")));
    const { ctx, page } = await failPage(dir, { hash: "#schema=1&lang=en" });
    const e = await errorText(page);
    check("B10 the error text follows lang=en", /could not be loaded/.test(e.text) && /Retry/.test(e.text), e.text.replace(/\s+/g, " ").slice(0, 120));
    await ctx.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  {
    // Over HTTP: a missing bundle is read from its JSON copy; a malformed or missing copy is an error.
    const mkJson = (d) => {
      const vm = require("vm");
      const sb = { window: {} }; sb.window = sb; vm.createContext(sb);
      for (const f of ["alerts", "meta", "geo"]) vm.runInContext(fs.readFileSync(path.join(d, `data/${f}.js`), "utf8"), sb);
      fs.writeFileSync(path.join(d, "data/alerts.json"), JSON.stringify(sb.ALERTS));
      fs.writeFileSync(path.join(d, "data/meta.json"), JSON.stringify(sb.META));
      fs.writeFileSync(path.join(d, "data/romania-counties.geojson"), JSON.stringify(sb.GEO));
      for (const f of ["alerts", "meta", "geo"]) fs.rmSync(path.join(d, `data/${f}.js`));
    };
    {
      const dir = pageCopy(mkJson);
      const { server, url } = await serve(dir);
      const { ctx, page } = await failPage(dir, { http: url });
      await page.waitForSelector("#kpis .kpi", { timeout: 15000 });
      const n = await page.evaluate(() => DATA.alerts.length);
      check("B10 JSON fallback works over HTTP when the bundles are absent (3,385 alerts)", n === 3385, String(n));
      await ctx.close(); server.close(); fs.rmSync(dir, { recursive: true, force: true });
    }
    {
      const dir = pageCopy((d) => { mkJson(d); fs.writeFileSync(path.join(d, "data/alerts.json"), "{ not json"); });
      const { server, url } = await serve(dir);
      const { ctx, page } = await failPage(dir, { http: url });
      const e = await errorText(page);
      check("B10 malformed JSON fallback shows a readable error with the file name", /alerts\.json/.test(e.text) && /(JSON valid|valid JSON)/.test(e.text) && e.retry, e.text.replace(/\s+/g, " ").slice(0, 160));
      await ctx.close(); server.close(); fs.rmSync(dir, { recursive: true, force: true });
    }
    {
      const dir = pageCopy((d) => { mkJson(d); fs.rmSync(path.join(d, "data/meta.json")); });
      const { server, url } = await serve(dir);
      const { ctx, page } = await failPage(dir, { http: url });
      const e = await errorText(page);
      check("B10 a missing JSON copy shows the HTTP status and the file", /meta\.json/.test(e.text) && /404/.test(e.text) && e.retry, e.text.replace(/\s+/g, " ").slice(0, 160));
      await ctx.close(); server.close(); fs.rmSync(dir, { recursive: true, force: true });
    }
    {
      // Load rejection: the fallback request fails at the network level.
      const dir = pageCopy(mkJson);
      const { server, url } = await serve(dir);
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
      const page = await ctx.newPage();
      await page.route("**/data/alerts.json", (r) => r.abort("connectionreset"));
      await page.goto(url);
      const e = await errorText(page);
      check("B10 a rejected load shows a readable error and Retry, not an empty page", /alerts\.json/.test(e.text) && e.retry && !e.empty, e.text.replace(/\s+/g, " ").slice(0, 160));
      await ctx.close(); server.close(); fs.rmSync(dir, { recursive: true, force: true });
    }
    {
      // Loading status: a slow bundle leaves the loading text visible, then the view replaces it.
      const dir = pageCopy();
      const { server, url } = await serve(dir, { "/data/alerts.js": 1500 });
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: "commit" });
      await page.waitForSelector("#boot-loading");
      const txt = await page.innerText("#boot-loading");
      await page.waitForSelector("#kpis .kpi", { timeout: 15000 });
      check("B10 an initial loading status shows before the data arrives and is replaced by the view", /(Se încarcă|Loading)/.test(txt) && (await page.$("#boot-loading")) === null, txt);
      await ctx.close(); server.close(); fs.rmSync(dir, { recursive: true, force: true });
    }
  }
};
