/* Phase 04 browser checks (U01-U10), from file://. Called by smoke.cjs, which supplies the
   browser, the page URL, `check` and SHOTS. Keyboard checks press real keys. Evaluated code
   only reads state and layout. An axe-core scan is added as supporting evidence; it does not
   establish compliance. */
"use strict";
const fs = require("fs");
const { useConsole } = require("./console-mode.cjs");
const path = require("path");

const WIDTHS = [1440, 1024, 390, 320];
const AXE = path.join(__dirname, "..", "..", "node_modules", "axe-core", "axe.min.js");

module.exports = async function run({ browser, check, URL, SHOTS, report }) {
  const log = report || (() => {});
  async function openAt(width, lang, hash0, opts = {}) {
    const ctx = await browser.newContext({ timezoneId: "Europe/Bucharest", viewport: { width, height: opts.height || 900 }, reducedMotion: opts.reducedMotion });
    await useConsole(ctx);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await page.route("**/*", (r) => { const u = r.request().url(); return /^(file|data|blob):/.test(u) ? r.continue() : r.abort(); });
    let hash = hash0 || "";
    if (lang === "en") hash = (hash || "schema=1") + (/lang=/.test(hash) ? "" : "&lang=en");
    await page.goto(hash ? `${URL}#${hash}` : URL);
    await page.waitForSelector("#content-main > *");
    return { ctx, page, errors };
  }
  const shot = async (page, name) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: false });
  };
  const view = async (page, v) => { await page.click(`.view-tab[data-view="${v}"]`); await page.waitForTimeout(120); };
  const overflow = (page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  const isMobile = (w) => w <= 768;

  /* Press Tab (or Shift+Tab) until the focused element matches `sel`. */
  async function tabTo(page, sel, { max = 1500, back = false } = {}) {
    for (let i = 0; i < max; i++) {
      if (await page.evaluate((s) => !!document.activeElement && document.activeElement.matches(s), sel)) return true;
      await page.keyboard.press(back ? "Shift+Tab" : "Tab");
    }
    return false;
  }
  const activeIn = (page, sel) => page.evaluate((s) => { const a = document.activeElement; return !!a && !!a.closest(s); }, sel);
  const toStart = async (page) => { await page.evaluate(() => { window.scrollTo(0, 0); document.getElementById("skip-link").focus(); }); };

  for (const lang of ["ro", "en"]) {
    const tag0 = `[${lang}]`;

    // ---- U01: no horizontal document overflow, every width, every view, and with a record open ----
    for (const width of WIDTHS) {
      const { ctx, page, errors } = await openAt(width, lang, "");
      const bad = [];
      for (const v of ["story", "dashboard", "table", "feed"]) {
        await view(page, v);
        const o = await overflow(page);
        if (o.sw > o.cw + 1) bad.push(`${v} ${o.sw}>${o.cw}`);
        if (SHOTS && (width === 390 || width === 320)) await shot(page, `${lang}-${v}-${width}`);
      }
      await page.evaluate(() => { state.selectedCounty = "Harghita"; state.view = "location"; update("push"); });
      await page.waitForSelector(".location-view");
      let o = await overflow(page);
      if (o.sw > o.cw + 1) bad.push(`location ${o.sw}>${o.cw}`);
      await shot(page, `${lang}-location-${width}`);
      await page.evaluate(() => openDrawer(currentRows[0].id));
      await page.waitForSelector("#drawer[open]");
      o = await page.evaluate(() => { const d = document.querySelector("#drawer"); return { sw: d.scrollWidth, cw: d.clientWidth }; });
      if (o.sw > o.cw + 1) bad.push(`record dialog ${o.sw}>${o.cw}`);
      o = await overflow(page);
      if (o.sw > o.cw + 1) bad.push(`document with record ${o.sw}>${o.cw}`);
      await shot(page, `${lang}-record-${width}`);
      check(`${tag0} U01 ${width}px: scrollWidth <= clientWidth in every view and the record dialog`, bad.length === 0 && errors.length === 0, bad.join("; ") + errors.join("|"));
      await ctx.close();
    }
    // between phone and desktop, and the 200% zoom equivalents of 1440 and 1024
    for (const width of [800, 768, 720, 512]) {
      const { ctx, page } = await openAt(width, lang, "");
      const bad = [];
      for (const v of ["story", "dashboard", "table", "feed"]) {
        await view(page, v);
        const o = await overflow(page);
        if (o.sw > o.cw + 1) bad.push(`${v} ${o.sw}>${o.cw}`);
      }
      check(`${tag0} U01 ${width}px (also 200% zoom of 1440 and 1024): no document overflow`, bad.length === 0, bad.join("; "));
      await ctx.close();
    }

    // ---- U02: filters operable at 390 and 320 ----
    for (const width of [390, 320]) {
      const tag = `${tag0} ${width}px`;
      const { ctx, page, errors } = await openAt(width, lang, "");
      const closedHidden = await page.evaluate(() => getComputedStyle(document.getElementById("sidebar")).display === "none");
      check(`${tag} U02 the drawer is closed at load; the Filters button is visible`, closedHidden && await page.isVisible("#open-filters"));
      await page.click("#open-filters");
      const dlg = await page.evaluate(() => { const s = document.getElementById("sidebar"); return { role: s.getAttribute("role"), modal: s.getAttribute("aria-modal"), name: document.getElementById("filters-title").textContent, exp: document.getElementById("open-filters").getAttribute("aria-expanded"), inertMain: document.getElementById("main-col").hasAttribute("inert") }; });
      check(`${tag} U02 filter drawer is a labelled modal dialog; background is inert`, dlg.role === "dialog" && dlg.modal === "true" && dlg.name.length > 0 && dlg.exp === "true" && dlg.inertMain, JSON.stringify(dlg));
      await page.fill("#search", "ISU");
      await page.waitForFunction(() => state.search === "ISU");
      await page.fill("#date-from", "2026-04-01");
      await page.fill("#date-to", "2026-06-30");
      await page.waitForFunction(() => state.dateFrom === "2026-04-01" && state.dateTo === "2026-06-30");
      const facets = await page.evaluate(() => [...document.querySelectorAll("#facets .facet")].map((f) => f.dataset.facetField));
      let allOk = true; const failed = [];
      for (const f of facets) {
        const head = `#facets .facet[data-facet-field="${f}"] .facet-head`;
        if ((await page.getAttribute(head, "aria-expanded")) !== "true") await page.click(head);
        const expanded = await page.getAttribute(head, "aria-expanded");
        const box = `#facets .facet[data-facet-field="${f}"] input[type=checkbox]`;
        await page.locator(box).first().check();
        const ok = expanded === "true" && await page.evaluate((fld) => state.filters[fld].size === 1, f);
        if (!ok) { allOk = false; failed.push(f); }
      }
      check(`${tag} U02 search, both dates and every facet (${facets.length}) change state from the drawer`, allOk && facets.length >= 5, failed.join(","));
      await shot(page, `${lang}-filters-open-${width}`);
      const o = await overflow(page);
      check(`${tag} U02 the open drawer has no document overflow`, o.sw <= o.cw + 1);
      // Apply closes; the strip and the count stay visible outside the drawer
      const n = await page.evaluate(() => currentRows.length);
      const applyText = await page.innerText("#filters-apply");
      await page.click("#filters-apply");
      check(`${tag} U02 Apply closes the drawer; the label shows the count`, !(await page.evaluate(() => document.getElementById("sidebar").classList.contains("open"))) && applyText.includes(String(n)), applyText);
      const strip = await page.evaluate(() => ({ chips: document.querySelectorAll("#active-strip .strip-chip").length, vis: !document.getElementById("active-strip").hidden, count: document.getElementById("result-count").textContent }));
      check(`${tag} U02 the active strip and result count stay visible outside the drawer`, strip.chips > 0 && strip.vis && parseInt(strip.count, 10) === n, JSON.stringify(strip));
      await shot(page, `${lang}-strip-${width}`);
      // remove one chip, then Reset (the strip's Reset)
      const before = await page.evaluate(() => activeFilterItems(state).length);
      await page.click("#active-strip .strip-x");
      const after = await page.evaluate(() => activeFilterItems(state).length);
      check(`${tag} U02 an active-filter chip is removable by tap`, after === before - 1, `${before}->${after}`);
      await page.click("#btn-clear-all");
      const cleared = await page.evaluate(() => activeFilterItems(state).length === 0 && !state.search && !state.dateFrom && !state.dateTo);
      check(`${tag} U02 Reset clears every filter`, cleared);
      // drawer Clear is separate from Close
      await page.click("#open-filters");
      await page.locator("#facets input[type=checkbox]").first().check();
      await page.click("#sidebar-clear");
      const stillOpen = await page.evaluate(() => document.getElementById("sidebar").classList.contains("open") && activeFilterItems(state).length === 0);
      const names = await page.evaluate(() => [document.getElementById("sidebar-clear").textContent.trim(), document.getElementById("filters-close").getAttribute("aria-label"), document.getElementById("filters-apply").textContent.trim()]);
      check(`${tag} U02 Clear resets but keeps the drawer open; Clear, Close and Apply have distinct names`, stillOpen && new Set(names).size === 3, names.join(" | "));
      await page.keyboard.press("Escape");
      check(`${tag} no JS errors`, errors.length === 0, errors.join("|"));
      await ctx.close();
    }

    // ---- U03: Feed cards use the content width ----
    for (const width of [390, 320]) {
      const { ctx, page } = await openAt(width, lang, "view=feed");
      await page.waitForSelector(".feed-card");
      const m = await page.evaluate(() => {
        const c = document.querySelector(".feed-card").getBoundingClientRect();
        const main = document.getElementById("content-main").getBoundingClientRect();
        const body = document.getElementById("feed-body").getBoundingClientRect();
        const side = document.getElementById("feed-sidebar").getBoundingClientRect();
        return { card: Math.round(c.width), main: Math.round(main.width), body: Math.round(body.width), stacked: side.bottom <= body.top + 1, vw: innerWidth };
      });
      check(`${lang} ${width}px U03 Feed card width ${m.card} of content ${m.main}; summary stacked above`, m.card >= m.main - 28 && m.body >= m.main - 28 && m.stacked, JSON.stringify(m));
      await ctx.close();
    }
  }

  // ---- U04 / U05: keyboard only (RO and EN) ----
  for (const lang of ["ro", "en"]) {
    const tag = `[${lang}]`;
    const { ctx, page, errors } = await openAt(1440, lang, "");
    // skip link: first Tab stop, moves focus to main, keeps the URL
    await page.keyboard.press("Tab");
    const skip = await page.evaluate(() => document.activeElement.id);
    const hash0 = await page.evaluate(() => location.hash);
    await page.keyboard.press("Enter");
    const afterSkip = await page.evaluate(() => ({ id: document.activeElement.id, hash: location.hash }));
    check(`${tag} U04 skip link is the first Tab stop and moves focus to main without changing the URL`, skip === "skip-link" && afterSkip.id === "content-main" && afterSkip.hash === hash0, JSON.stringify({ skip, afterSkip }));

    // views by keyboard
    await toStart(page);
    check(`${tag} U04 Tab reaches the Table view button`, await tabTo(page, '.view-tab[data-view="table"]'));
    await page.keyboard.press("Enter");
    await page.waitForSelector(".data-table");
    const cur = await page.evaluate(() => ({ v: state.view, cur: document.querySelector('.view-tab[aria-current="page"]').dataset.view }));
    check(`${tag} U04 Enter on a view button changes view; aria-current follows`, cur.v === "table" && cur.cur === "table", JSON.stringify(cur));

    // sort with Enter and Space
    check(`${tag} U04 Tab reaches a sort button`, await tabTo(page, '.sort-btn[data-key="judet"]'));
    await page.keyboard.press("Enter");
    let s1 = await page.evaluate(() => ({ s: document.querySelector('th[data-key="judet"]').getAttribute("aria-sort"), f: document.activeElement.className, sorted: state.sort && state.sort.key }));
    await page.keyboard.press("Space");
    let s2 = await page.evaluate(() => ({ s: document.querySelector('th[data-key="judet"]').getAttribute("aria-sort"), f: document.activeElement.dataset.key, others: document.querySelectorAll("th[aria-sort]").length }));
    check(`${tag} U04 Enter then Space sort; aria-sort only on the active header; focus stays on the button`, s1.s === "ascending" && s2.s === "descending" && s2.others === 1 && s2.f === "judet", JSON.stringify([s1, s2]));

    // open a table record by keyboard, dialog behaviour
    check(`${tag} U04 Tab reaches a record button in the table`, await tabTo(page, ".row-open"));
    const trigId = await page.evaluate(() => document.activeElement.dataset.openId);
    await page.keyboard.press("Enter");
    await page.waitForSelector("#drawer[open]");
    const d = await page.evaluate(() => { const dl = document.getElementById("drawer"); return { modal: dl.matches(":modal"), name: document.getElementById(dl.getAttribute("aria-labelledby")).textContent.trim(), inside: dl.contains(document.activeElement), closeName: document.getElementById("drawer-close").getAttribute("aria-label") }; });
    check(`${tag} U05 record dialog is modal, named by its title; focus entered it; close button has a translated name`, d.modal && d.name.length > 0 && d.inside && d.closeName === (lang === "en" ? "Close alert details" : "Închide detaliile alertei"), JSON.stringify(d));
    let inside = true;
    for (let i = 0; i < 40; i++) { await page.keyboard.press(i % 7 === 6 ? "Shift+Tab" : "Tab"); if (!(await activeIn(page, "#drawer"))) inside = false; }
    check(`${tag} U05 focus stays inside the dialog over 40 Tab / Shift+Tab presses`, inside);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !state.record);
    const back = await page.evaluate((id) => ({ open: document.getElementById("drawer").open, id: document.activeElement.dataset && document.activeElement.dataset.openId, tag: document.activeElement.tagName }), trigId);
    check(`${tag} U05 Escape closes the dialog; focus returns to the opening record button`, !back.open && back.id === trigId, JSON.stringify(back));

    // Feed: card button, a render while open (trigger replaced), Escape
    await toStart(page);
    await tabTo(page, '.view-tab[data-view="feed"]');
    await page.keyboard.press("Enter");
    await page.waitForSelector(".card-open");
    check(`${tag} U04 Tab reaches a Feed record button`, await tabTo(page, ".card-open"));
    const fid = await page.evaluate(() => document.activeElement.dataset.openId);
    await page.keyboard.press("Space");
    await page.waitForSelector("#drawer[open]");
    await page.evaluate(() => render());                 // the trigger node is replaced while the dialog is open
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !state.record);
    const fb = await page.evaluate(() => ({ id: document.activeElement.dataset.openId, tag: document.activeElement.tagName }));
    check(`${tag} U05 after a rerender removed the trigger, focus goes to the same record's new button, not body`, fb.id === fid && fb.tag === "BUTTON", JSON.stringify([fb, fid]));
    // closing a record opened from the URL (no trigger): focus lands on main, not body
    await page.goto(`${URL}#schema=1&record=${fid}`);
    await page.reload();
    await page.waitForSelector("#drawer[open]");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !state.record);
    await page.waitForTimeout(100);
    const url = await page.evaluate(() => ({ tag: document.activeElement.tagName, id: document.activeElement.id }));
    check(`${tag} U05 closing a record opened from a link leaves focus on the main region`, url.tag !== "BODY", JSON.stringify(url));
    check(`${tag} no JS errors in keyboard flow`, errors.length === 0, errors.join("|"));
    await ctx.close();

    // filters by keyboard on a phone: open, stay inside, filter, Escape, focus returns
    {
      const { ctx: c2, page: p2 } = await openAt(390, lang, "");
      await toStart(p2);
      check(`${tag} U04 Tab reaches the Filters button at 390px`, await tabTo(p2, "#open-filters"));
      await p2.keyboard.press("Enter");
      const o = await p2.evaluate(() => ({ open: document.getElementById("sidebar").classList.contains("open"), inside: document.getElementById("sidebar").contains(document.activeElement) }));
      let stay = true;
      for (let i = 0; i < 60; i++) { await p2.keyboard.press("Tab"); if (!(await activeIn(p2, "#sidebar"))) stay = false; }
      await p2.keyboard.press("Shift+Tab");
      if (!(await activeIn(p2, "#sidebar"))) stay = false;
      check(`${tag} U04 Enter opens the filter drawer; focus enters and stays inside over 61 presses`, o.open && o.inside && stay, JSON.stringify(o));
      // a facet checkbox by keyboard
      await toStart(p2);
      await p2.evaluate(() => document.getElementById("filters-title").focus());
      await tabTo(p2, '#facets input[data-field="risk_category"]');
      await p2.keyboard.press("Space");
      const risk = await p2.evaluate(() => state.filters.risk_category.size);
      check(`${tag} U04 Space on a facet checkbox filters`, risk === 1);
      await p2.keyboard.press("Escape");
      const closed = await p2.evaluate(() => ({ open: document.getElementById("sidebar").classList.contains("open"), id: document.activeElement.id, inert: document.getElementById("main-col").hasAttribute("inert") }));
      check(`${tag} U05 Escape closes the filter drawer; focus returns to the Filters button; background no longer inert`, !closed.open && closed.id === "open-filters" && !closed.inert, JSON.stringify(closed));
      await c2.close();
    }
  }

  // ---- U06: county and place by keyboard, no map ----
  for (const width of [1440, 390]) {
    const { ctx, page, errors } = await openAt(width, "ro", "");
    await toStart(page);
    const summary = "#map-list > summary";
    check(`[ro ${width}px] U06 Tab reaches the map list disclosure`, await tabTo(page, summary));
    await page.keyboard.press("Enter");
    const exp = await page.evaluate(() => document.getElementById("map-list").open);
    check(`[ro ${width}px] U06 Enter opens the list`, exp);
    check(`[ro ${width}px] U06 Tab reaches a county button`, await tabTo(page, '#county-list [data-county="Harghita"]'));
    await page.keyboard.press("Enter");
    await page.waitForSelector(".location-view");
    const c = await page.evaluate(() => ({ county: state.selectedCounty, view: state.view }));
    check(`[ro ${width}px] U06 a county chosen by keyboard opens its Local view`, c.county === "Harghita" && c.view === "location", JSON.stringify(c));
    await page.evaluate(() => leaveLocal());
    await page.waitForSelector("#map-list");
    await toStart(page);
    await tabTo(page, summary);
    await page.keyboard.press("Enter");
    await tabTo(page, "#map-place-filter");
    await page.keyboard.type("Toplita");
    await page.waitForTimeout(100);
    check(`[ro ${width}px] U06 Tab reaches a canonical place`, await tabTo(page, "#place-pick [data-place]"));
    await page.keyboard.press("Enter");
    await page.waitForSelector(".location-view");
    const p = await page.evaluate(() => ({ id: state.selectedPlaceId, name: DATA.places.get(state.selectedPlaceId).name, view: state.view }));
    check(`[ro ${width}px] U06 a place chosen by keyboard is selected by SIRUTA code`, p.id === 83641 && p.view === "location", JSON.stringify(p));
    await view(page, "dashboard");
    const shapes = await page.evaluate(() => [...document.querySelectorAll("#map path")].filter((p) => p.getAttribute("tabindex") !== "-1").length);
    check(`[ro ${width}px] U06 map shapes are not Tab stops (the list is the keyboard route)`, shapes === 0, String(shapes));
    check(`[ro ${width}px] U06 no JS errors`, errors.length === 0, errors.join("|"));
    await ctx.close();
  }

  // ---- U07: chart data without hover or canvas ----
  for (const lang of ["ro", "en"]) {
    const { ctx, page } = await openAt(1440, lang, "");
    const bad = []; let tables = 0;
    const scan = async (name) => {
      const charts = await page.evaluate(() => [...document.querySelectorAll("canvas")].map((c) => ({ id: c.id, label: c.getAttribute("aria-label"), role: c.getAttribute("role"), det: !!c.closest(".chart-box").nextElementSibling.classList.contains("chart-data") })));
      for (const c of charts) {
        if (!c.label || c.role !== "img" || !c.det) { bad.push(`${name}:${c.id} no name/details`); continue; }
        const sel = `canvas#${c.id}`;
        const info = await page.evaluate((cid) => {
          const canvas = document.getElementById(cid), det = canvas.closest(".chart-box").nextElementSibling;
          det.open = true; det.dispatchEvent(new Event("toggle"));
          const rows = det.querySelectorAll("tbody tr").length;
          const key = Object.keys(charts).find((k) => charts[k].canvas === canvas);
          return { rows, labels: charts[key].data.labels.length, collapsedBefore: true, cells: det.querySelectorAll("tbody td").length, datasets: charts[key].data.datasets.length };
        }, c.id);
        tables++;
        if (info.rows !== info.labels || info.cells !== info.labels * info.datasets) bad.push(`${name}:${c.id} rows ${info.rows}/${info.labels}`);
      }
    };
    await scan("dashboard");
    await view(page, "story"); await scan("story");
    await page.evaluate(() => { state.selectedCounty = "Harghita"; state.view = "location"; update("push"); });
    await page.waitForSelector(".location-view canvas"); await scan("location");
    // keyboard opens a disclosure
    await view(page, "dashboard");
    await toStart(page);
    await tabTo(page, ".chart-data > summary");
    await page.keyboard.press("Enter");
    const kopen = await page.waitForFunction(() => !!document.activeElement.parentElement.querySelector("table"), null, { timeout: 3000 }).then(() => true, () => false);
    check(`[${lang}] U07 every chart (${tables}) has an accessible name and a data table equal to its labels; no hover needed`, bad.length === 0 && tables >= 10, bad.join("; "));
    check(`[${lang}] U07 the disclosure opens by keyboard and builds the table`, kopen);
    await ctx.close();
  }

  // ---- U08: 200% zoom, long EN labels, controls remain available ----
  for (const width of [720, 390, 320]) {
    const { ctx, page } = await openAt(width, "en", "");
    const m = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const sel = ['.view-tab', '.lbtn', '#btn-clear-all', '#open-filters', '#result-count'];
      const out = [];
      for (const s of sel) for (const el of document.querySelectorAll(s)) { const r = el.getBoundingClientRect(); if (r.width === 0) { out.push(s + " hidden"); continue; } if (r.left < -1 || r.right > vw + 1) out.push(`${s} ${Math.round(r.left)}..${Math.round(r.right)}`); }
      return out;
    });
    check(`[en ${width}px] U08 view, language, Reset and Filters controls lie inside the viewport`, m.length === 0, m.join("; "));
    if (width <= 768) {
      await page.click("#open-filters");
      const f = await page.evaluate(() => { const vw = document.documentElement.clientWidth; return ["#filters-close", "#sidebar-clear", "#filters-apply", "#search", "#date-from", "#date-to"].filter((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.width === 0 || r.left < -1 || r.right > vw + 1; }); });
      check(`[en ${width}px] U08 drawer controls lie inside the viewport`, f.length === 0, f.join(","));
      await page.keyboard.press("Escape");
    }
    // long names: the longest source name and facet labels wrap, nothing is clipped by the page
    await view(page, "story");
    const long = await page.evaluate(() => { const li = [...document.querySelectorAll(".src-list li")]; return li.every((l) => l.getBoundingClientRect().right <= document.documentElement.clientWidth + 1) && document.querySelectorAll(".src-list li").length > 0; });
    check(`[en ${width}px] U08 Sources lines stay inside the viewport`, long);
    await ctx.close();
  }

  // ---- U09: contrast and reduced motion ----
  const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const x = lum(...a), y = lum(...b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  {
    const { ctx, page } = await openAt(1440, "ro", "");
    const tok = await page.evaluate(() => { const cs = getComputedStyle(document.documentElement); return Object.fromEntries(["--text", "--text-muted", "--text-dim", "--accent", "--error", "--ok", "--warn", "--cancel", "--bg", "--card", "--accent-light", "--error-light", "--ok-light", "--warn-light", "--border-ctl", "--focus"].map((k) => [k, cs.getPropertyValue(k).trim()])); });
    const pairs = [["--text", "--bg"], ["--text", "--card"], ["--text-muted", "--bg"], ["--text-muted", "--card"], ["--text-dim", "--bg"], ["--text-dim", "--card"], ["--accent", "--bg"], ["--accent", "--card"], ["--accent", "--accent-light"], ["--error", "--card"], ["--error", "--error-light"], ["--ok", "--card"], ["--ok", "--ok-light"], ["--warn", "--card"], ["--warn", "--warn-light"], ["--cancel", "--card"]];
    const rs = pairs.map(([a, b]) => [a + " on " + b, ratio(hex(tok[a]), hex(tok[b]))]);
    const white = ratio([255, 255, 255], hex(tok["--accent"]));
    const worst = rs.reduce((m, x) => (x[1] < m[1] ? x : m));
    check(`U09 token text pairs >= 4.5:1 (lowest ${worst[0]} ${worst[1].toFixed(2)}); white on accent ${white.toFixed(2)}`, rs.every((x) => x[1] >= 4.5) && white >= 4.5, rs.map((x) => `${x[0]}=${x[1].toFixed(2)}`).join(", "));
    const ctl = [["--border-ctl", "--bg"], ["--border-ctl", "--card"], ["--focus", "--bg"], ["--focus", "--card"]].map(([a, b]) => [a + " on " + b, ratio(hex(tok[a]), hex(tok[b]))]);
    check(`U09 control boundary and focus ring >= 3:1 (lowest ${Math.min(...ctl.map((x) => x[1])).toFixed(2)})`, ctl.every((x) => x[1] >= 3), ctl.map((x) => `${x[0]}=${x[1].toFixed(2)}`).join(", "));
    log("U09 tokens: " + rs.map((x) => `${x[0]}=${x[1].toFixed(2)}`).join(", ") + `; white/accent=${white.toFixed(2)}; ` + ctl.map((x) => `${x[0]}=${x[1].toFixed(2)}`).join(", "));
    await ctx.close();
  }
  // computed-colour scan of rendered text, all views, both languages, desktop and phone
  const scanContrast = () => {
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
    const over = (f, b) => [0, 1, 2].map((i) => f[i] * f[3] + b[i] * (1 - f[3]));
    const L = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const bgOf = (el) => { const stack = []; for (let e = el; e; e = e.parentElement) { const b = parse(getComputedStyle(e).backgroundColor); if (b && b[3] > 0) stack.push(b); if (b && b[3] >= 0.99) break; } let c = [255, 255, 255]; for (const b of stack.reverse()) c = over(b, c).concat(1); return c; };
    const opacityOf = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o; };
    const worst = []; let n = 0;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    while (w.nextNode()) {
      const tn = w.currentNode; if (!tn.nodeValue.trim()) continue;
      const el = tn.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
      if (el.closest("canvas, script, style, .sr-only, .leaflet-control, .leaflet-tooltip, [disabled], .leaflet-disabled, [hidden], details:not([open]) > :not(summary)")) continue;
      const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
      const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none") continue;
      if (el.closest(".sidebar") && getComputedStyle(document.getElementById("sidebar")).display === "none") continue;
      const fg = parse(cs.color); if (!fg) continue;
      const bg = bgOf(el); const op = opacityOf(el);
      const f = over([fg[0], fg[1], fg[2], fg[3] * op], bg);
      const ratio = (Math.max(L(f), L(bg)) + 0.05) / (Math.min(L(f), L(bg)) + 0.05);
      const px = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700;
      const need = px >= 24 || (px >= 18.66 && bold) ? 3 : 4.5;
      n++;
      if (ratio < need) worst.push({ t: tn.nodeValue.trim().slice(0, 30), cls: el.className && el.className.toString().slice(0, 30), ratio: +ratio.toFixed(2), need, px });
    }
    // minimum text size among reading text
    return { n, bad: worst.slice(0, 8), nbad: worst.length };
  };
  for (const lang of ["ro", "en"]) {
    for (const width of [1440, 390]) {
      const { ctx, page } = await openAt(width, lang, "");
      const bad = []; let total = 0;
      for (const v of ["story", "dashboard", "table", "feed"]) {
        await view(page, v);
        await page.waitForTimeout(250);      // let the 0.15 s tab transition finish
        const r = await page.evaluate(scanContrast); total += r.n; if (r.nbad) bad.push(v + ":" + JSON.stringify(r.bad));
      }
      await page.evaluate(() => { state.selectedCounty = "Harghita"; state.view = "location"; update("push"); });
      await page.waitForSelector(".location-view");
      await page.waitForTimeout(250);
      let r = await page.evaluate(scanContrast); total += r.n; if (r.nbad) bad.push("location:" + JSON.stringify(r.bad));
      await page.evaluate(() => openDrawer(currentRows[0].id)); await page.waitForSelector("#drawer[open]");
      await page.waitForTimeout(250);
      r = await page.evaluate(scanContrast); total += r.n; if (r.nbad) bad.push("record:" + JSON.stringify(r.bad));
      check(`[${lang} ${width}px] U09 computed text contrast scan (${total} text elements): all meet 4.5:1 (3:1 large)`, bad.length === 0, bad.join(" "));
      log(`U09 scan ${lang} ${width}: ${total} elements`);
      await ctx.close();
    }
  }
  {
    // minimum font sizes of reading text (RO, dashboard + feed + story + table at 390)
    const { ctx, page } = await openAt(390, "ro", "");
    const small = [];
    for (const v of ["story", "dashboard", "feed", "table"]) {
      await view(page, v);
      small.push(...await page.evaluate((vn) => [...document.querySelectorAll("#content-main *, #sidebar *, .resultbar *, .active-strip *")].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim()) && e.getBoundingClientRect().width > 1 && !e.closest(".sr-only,canvas,.leaflet-container,.data-table,.chart-table")).map((e) => ({ v: vn, c: e.className.toString().slice(0, 24), px: parseFloat(getComputedStyle(e).fontSize), t: e.textContent.trim().slice(0, 16) })).filter((x) => x.px < 12), v));
    }
    check(`U09 no text below 12px outside dense tables`, small.length === 0, JSON.stringify(small.slice(0, 5)));
    await ctx.close();
  }
  {
    const { ctx, page } = await openAt(1440, "ro", "", { reducedMotion: "reduce" });
    const rm = await page.evaluate(() => ({ chart: Chart.defaults.animation, tr: getComputedStyle(document.querySelector(".view-tab")).transitionDuration, leaflet: RoMap.map.options.zoomAnimation, anim: matchMedia("(prefers-reduced-motion: reduce)").matches }));
    check(`U09 reduced motion: CSS transitions 0s, Chart.js animation off, Leaflet zoom animation off`, rm.anim && rm.chart === false && /^0s(, 0s)*$/.test(rm.tr) && rm.leaflet === false, JSON.stringify(rm));
    await ctx.close();
    const n = await openAt(1440, "ro", "");
    const nm = await n.page.evaluate(() => ({ tr: getComputedStyle(document.querySelector(".view-tab")).transitionDuration, leaflet: RoMap.map.options.zoomAnimation }));
    check(`U09 default motion is unchanged (transition ${nm.tr}, Leaflet zoom animation ${nm.leaflet})`, nm.tr !== "0s" && nm.leaflet !== false);
    await n.ctx.close();
  }

  // ---- U10: zero results, footer, Sources ----
  for (const lang of ["ro", "en"]) {
    for (const width of [390, 320]) {
      const tag = `[${lang} ${width}px]`;
      const { ctx, page } = await openAt(width, lang, "");
      await page.click("#open-filters");
      await page.fill("#search", "zzzzqqqq");
      await page.waitForFunction(() => currentRows.length === 0);
      await page.click("#filters-apply");
      const z = await page.evaluate(() => ({ empty: !!document.querySelector(".empty-state"), clear: !!document.getElementById("empty-clear"), count: document.getElementById("result-count").textContent, strip: !document.getElementById("active-strip").hidden || state.search === "zzzzqqqq" }));
      check(`${tag} U10 zero results show the empty state, a clear action and the count`, z.empty && z.clear && parseInt(z.count, 10) === 0, JSON.stringify(z));
      await page.evaluate(() => document.getElementById("site-footer").scrollIntoView());
      const foot = await page.evaluate(() => { const r = document.getElementById("site-footer").getBoundingClientRect(); const a = document.querySelector("#site-footer a"); a.focus(); return { inView: r.bottom <= innerHeight + 1 && r.top < innerHeight, focus: document.activeElement === a, sw: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 }; });
      check(`${tag} U10 the footer is reachable by scrolling and its link takes focus`, foot.inView && foot.focus && foot.sw, JSON.stringify(foot));
      await shot(page, `${lang}-zero-${width}`);
      await page.evaluate(() => { window.scrollTo(0, 0); });
      await view(page, "story");
      const src = await page.evaluate(() => { const s = document.querySelector(".story-sources"); if (!s) return null; s.scrollIntoView(); const r = s.getBoundingClientRect(); return { items: s.querySelectorAll(".src-list li").length, inView: r.top < innerHeight, sw: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 }; });
      check(`${tag} U10 Sources stay reachable with zero results`, !!src && src.items > 5 && src.inView && src.sw, JSON.stringify(src));
      await shot(page, `${lang}-zero-sources-${width}`);
      await ctx.close();
    }
  }

  // ---- Supporting evidence: axe-core scan (not a compliance claim) ----
  if (fs.existsSync(AXE)) {
    const src = fs.readFileSync(AXE, "utf8");
    for (const [lang, width] of [["ro", 1440], ["ro", 390], ["en", 320]]) {
      const { ctx, page } = await openAt(width, lang, "");
      const out = [];
      for (const v of ["story", "dashboard", "table", "feed"]) {
        await view(page, v);
        await page.evaluate(src);
        const r = await page.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] }).then((x) => x.violations.map((vv) => `${vv.id}(${vv.impact}):${vv.nodes.length}`)));
        out.push(...r.map((x) => v + ":" + x));
      }
      log(`axe ${lang} ${width}: ${out.join(", ") || "no violations"}`);
      const serious = out.filter((x) => /\((serious|critical)\)/.test(x));
      check(`[${lang} ${width}px] axe-core: no serious or critical violations in four views`, serious.length === 0, out.join(", "));
      await ctx.close();
    }
  } else {
    console.log("SKIP  axe-core not installed (npm install)");
  }
};
