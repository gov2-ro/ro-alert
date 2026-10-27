/* Phase 03 browser checks (S02, S03, S04, S05, S06, S07, S08, S09, S11), from file://.
   Called by smoke.cjs, which supplies the browser, the page URL and the `check` function.
   Real clicks and typing drive the controls. Evaluated code only reads state or injects a
   synthetic record (S06). */
"use strict";
const fs = require("fs");
const path = require("path");

const RO_CATEGORIES = ["Animale periculoase", "Copil dispărut", "Atac aerian / dronă", "Inundații", "Incendiu", "Tehnologic"];
const WIDTHS = [1440, 1024, 390, 320];

module.exports = async function run({ browser, check, URL, SHOTS }) {
  async function openAt(hash0, { lang = "ro", width = 1440 } = {}) {
    let hash = hash0;
    const ctx = await browser.newContext({ timezoneId: "Europe/Bucharest", viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await page.route("**/*", (route) => {
      const u = route.request().url();
      return u.startsWith("file://") || u.startsWith("data:") || u.startsWith("blob:") ? route.continue() : route.abort();
    });
    // English starts from the link (`lang=en`), so an open record cannot cover the toggle.
    if (lang === "en" && !/lang=/.test(hash)) hash = (hash || "schema=1") + "&lang=en";
    await page.goto(hash ? `${URL}#${hash}` : URL);
    await page.waitForSelector("#content-main > *");
    return { ctx, page, errors };
  }
  const shot = async (page, name) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: false });
  };
  const count = async (page) => parseInt((await page.innerText("#result-count")).trim(), 10);
  const hash = (page) => page.evaluate(() => decodeURIComponent(location.hash));
  const ids = (page) => page.evaluate(() => currentRows.map((a) => a.id).sort().join(","));

  for (const lang of ["ro", "en"]) {
    const tag = `[${lang}]`;
    const L = (ro, en) => (lang === "en" ? en : ro);

    // ---- S02: Feed chip state comes from `state` ----
    {
      const { ctx, page, errors } = await openAt("", { lang });
      await page.click('.view-tab[data-view="feed"]');
      await page.waitForSelector("#feed-chips .filter-chip");
      const all0 = await page.getAttribute('#feed-chips [data-risk=""]', "aria-pressed");
      check(`${tag} S02 Feed starts with All active`, all0 === "true");
      await page.click('#feed-chips [data-risk="Meteo"]');
      await page.waitForSelector('#feed-chips [data-risk="Meteo"][aria-pressed="true"]');
      const st = await page.evaluate(() => ({
        on: [...document.querySelectorAll("#feed-chips .filter-chip.active")].map((b) => b.dataset.risk),
        all: document.querySelector('#feed-chips [data-risk=""]').getAttribute("aria-pressed"),
        box: [...document.querySelectorAll('#facets input[data-field="risk_category"]:checked')].map((c) => c.value),
        n: currentRows.length,
      }));
      check(`${tag} S02 Meteo is highlighted, All is not, sidebar agrees`, st.on.join() === "Meteo" && st.all === "false" && st.box.join() === "Meteo" && st.n === 616, JSON.stringify(st));
      // a second chip replaces the selection
      await page.click('#feed-chips [data-risk="Incendiu"]');
      await page.waitForSelector('#feed-chips [data-risk="Incendiu"][aria-pressed="true"]');
      const rep = await page.evaluate(() => [...state.filters.risk_category].join());
      check(`${tag} S02 a chip replaces the risk selection`, rep === "Incendiu", rep);
      await page.click('#feed-chips [data-risk="Meteo"]');
      // language change keeps the highlight and renders once
      const renders = await page.evaluate(() => { window.__r = 0; const o = render; window.render = function () { window.__r++; return o.apply(this, arguments); }; return 0; });
      await page.click(`#langtoggle [data-lang="${lang === "ro" ? "en" : "ro"}"]`);
      await page.waitForFunction((l) => state.lang === l, lang === "ro" ? "en" : "ro");
      const after = await page.evaluate(() => ({
        on: [...document.querySelectorAll("#feed-chips .filter-chip.active")].map((b) => b.dataset.risk),
        all: document.querySelector('#feed-chips [data-risk=""]').getAttribute("aria-pressed"),
        r: window.__r, label: document.querySelector('#feed-chips [data-risk="Meteo"]').textContent.trim(),
      }));
      check(`${tag} S02 highlight survives a language change, one render`, after.on.join() === "Meteo" && after.all === "false" && after.r === 1, JSON.stringify(after));
      void renders;
      check(`${tag} S02 chip label follows the language`, after.label === (lang === "ro" ? "Weather" : "Meteo"), after.label);
      // All clears only the risk facet
      await page.click('#langtoggle [data-lang="' + lang + '"]');
      await page.fill("#search", "ISU");
      await page.waitForTimeout(400);
      await page.click('#feed-chips [data-risk=""]');
      await page.waitForFunction(() => state.filters.risk_category.size === 0);
      const keep = await page.evaluate(() => state.search);
      check(`${tag} S02 All clears only the risk facet`, keep === "ISU");
      check(`${tag} S02 no JS errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    }

    // ---- S03: Briefing keeps hidden filters visible, Reset clears them ----
    {
      const { ctx, page, errors } = await openAt("schema=1&f.meteo_color=Portocaliu&f.meteo_color=Ro%C8%99u", { lang });
      const before = await count(page);
      await page.click('.stab[data-mode="briefing"]');
      const vis = await page.evaluate(() => {
        const f = document.querySelector('.facet[data-facet-field="meteo_color"]');
        return { hidden: getComputedStyle(f).display === "none", n: currentRows.length, chips: document.querySelectorAll("#active-strip .strip-chip").length,
                 set: [...state.filters.meteo_color].sort().join() };
      });
      check(`${tag} S03 Briefing hides the control but keeps the filter and its chip`, vis.hidden && vis.set === "Portocaliu,Roșu" && vis.chips === 2 && vis.n === before && before > 0, JSON.stringify(vis));
      await shot(page, `${lang}-s03-briefing`);
      await page.click("#active-strip [data-strip-reset]");
      await page.waitForFunction(() => document.getElementById("active-strip").hidden);
      const clean = await page.evaluate(() => ({ s: state.filters.meteo_color.size, a: 0, hash: location.hash }));
      check(`${tag} S03 Reset clears hidden filters and the URL`, clean.s === 0 && clean.a === 0 && !/f\.|q=|from=|to=/.test(clean.hash), JSON.stringify(clean));
      check(`${tag} S03 no JS errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    }

    // ---- S04: accented and plain searches give the same IDs ----
    {
      const { ctx, page } = await openAt("", { lang });
      const res = {};
      for (const q of ["Brașov", "Brasov", "București", "Bucuresti", "TOPLIȚA", "toplita"]) {
        await page.fill("#search", q);
        await page.waitForFunction((x) => state.search === x, q);
        res[q] = [await count(page), await ids(page)];
      }
      check(`${tag} S04 Brașov = Brasov`, res["Brașov"][1] === res["Brasov"][1] && res["Brasov"][0] > 0, `${res["Brașov"][0]}/${res["Brasov"][0]}`);
      check(`${tag} S04 București = Bucuresti`, res["București"][1] === res["Bucuresti"][1] && res["Bucuresti"][0] > 0);
      check(`${tag} S04 canonical place name Toplița = toplita`, res["TOPLIȚA"][1] === res["toplita"][1] && res["toplita"][0] > 0);
      await ctx.close();
    }

    // ---- S05: Toplița selects 23 Harghita records, one canonical place ----
    {
      const { ctx, page, errors } = await openAt("schema=1&county=Harghita&place=83641", { lang });
      await page.waitForSelector(".location-view");
      const info = await page.evaluate(() => ({
        title: document.querySelector(".location-county-name").textContent.replace(/\s+/g, " ").trim(),
        n: currentRows.length,
        pressed: [...document.querySelectorAll('.locality-chip[aria-pressed="true"]')].map((b) => b.dataset.place),
        strip: [...document.querySelectorAll("#active-strip .strip-chip")].map((c) => c.textContent),
        variants: [...document.querySelectorAll(".locality-chip")].filter((b) => /^Topli/i.test(b.textContent)).map((b) => b.textContent),
      }));
      check(`${tag} S05 Toplița selected: 23 records, heading, pressed chip, strip`,
        info.n === 23 && /^Toplița/.test(info.title) && [...new Set(info.pressed)].join() === "83641" && info.strip.some((s) => /Toplița/.test(s)), JSON.stringify(info));
      check(`${tag} S05 one canonical spelling in the chips`, new Set(info.variants.map((v) => v.replace(/\d+$/, ""))).size <= 1, info.variants.join(" | "));
      await shot(page, `${lang}-s05-place`);
      // the place chip in the strip removes the place and leaves the county view
      await page.locator("#active-strip [data-strip-index]").last().click();
      await page.waitForFunction(() => state.selectedPlaceId === null);
      check(`${tag} S05 removing the place keeps the county scope`, (await page.evaluate(() => state.selectedCounty)) === "Harghita" && (await page.evaluate(() => state.view)) === "location");
      check(`${tag} S05 no JS errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    }

    // ---- S06: a point click keeps a nationally issued record; count equals the point ----
    {
      const { ctx, page, errors } = await openAt("", { lang });
      await page.evaluate(() => {
        const base = DATA.alerts.find((a) => (a.places || []).some((p) => p.siruta === 83641));
        DATA.alerts.push({ ...base, id: "synthetic-national", judet: "National", scope: "national", initiator: "IGSU" });
        render();
      });
      const pt = await page.evaluate(() => { let r = null; RoMap.placeLayer.eachLayer((l) => { if (l.sirutaCode === 83641) r = l.alertCount; }); return r; });
      await page.evaluate(() => RoMap.placeLayer.eachLayer((l) => { if (l.sirutaCode === 83641) l.fire("click"); }));
      await page.waitForSelector(".location-view");
      const res = await page.evaluate(() => ({ n: currentRows.length, syn: currentRows.some((a) => a.id === "synthetic-national"),
        county: state.selectedCounty, place: state.selectedPlaceId, hash: decodeURIComponent(location.hash) }));
      check(`${tag} S06 point click keeps the national record, no county added`, res.syn && res.county === null && res.place === 83641, JSON.stringify(res));
      check(`${tag} S06 selection count equals the point count`, res.n === pt && pt === 24, `${res.n} vs ${pt}`);
      check(`${tag} S06 no JS errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    }

    // ---- S07: URL round trip, history, reload, copy/paste ----
    {
      const { ctx, page, errors } = await openAt("", { lang });
      await page.click('.view-tab[data-view="feed"]');
      await page.click('#feed-chips [data-risk="Meteo"]');
      await page.waitForFunction(() => state.filters.risk_category.has("Meteo"));
      await page.fill("#date-from", "2026-04-01");
      await page.waitForFunction(() => state.dateFrom === "2026-04-01");
      const typedBefore = await page.evaluate(() => history.length);
      await page.fill("#search", "ISU");
      await page.waitForFunction(() => state.search === "ISU");
      await page.fill("#search", "ISU A");
      await page.waitForFunction(() => state.search === "ISU A");
      const typedAfter = await page.evaluate(() => history.length);
      check(`${tag} S07 typing adds no history entry per character`, typedAfter === typedBefore, `${typedBefore} -> ${typedAfter}`);
      await page.click(".feed-card");
      await page.waitForFunction(() => !!state.record);
      const url = page.url();
      const h = await hash(page);
      check(`${tag} S07 hash carries view, lang, filters, dates, search and record`,
        /view=feed/.test(h) && /f\.risk_category=Meteo/.test(h) && /from=2026-04-01/.test(h) && /q=ISU\+A|q=ISU A/.test(h) && /record=/.test(h) && (lang === "en" ? /lang=en/.test(h) : !/lang=/.test(h)), h);
      const snap = await page.evaluate(() => ({ n: currentRows.length, view: state.view, rec: state.record, lang: state.lang }));
      // copy / paste into a fresh page
      const copy = await openAt(url.split("#")[1], { lang: "ro" });
      const snap2 = await copy.page.evaluate(() => ({ n: currentRows.length, view: state.view, rec: state.record, lang: state.lang,
        drawer: document.getElementById("drawer").open }));
      check(`${tag} S07 copy/paste restores the same state and the open record`, snap2.n === snap.n && snap2.view === snap.view && snap2.rec === snap.rec && snap2.lang === snap.lang && snap2.drawer, JSON.stringify([snap, snap2]));
      await copy.ctx.close();
      // reload
      await page.reload();
      await page.waitForSelector("#feed-chips");
      const snap3 = await page.evaluate(() => ({ n: currentRows.length, view: state.view, rec: state.record, lang: state.lang }));
      check(`${tag} S07 reload restores the same state`, JSON.stringify(snap3) === JSON.stringify(snap), JSON.stringify([snap, snap3]));
      // Close the drawer with the button: the record leaves the URL
      await page.click("#drawer-close");
      await page.waitForFunction(() => !state.record);
      check(`${tag} S07 closing the drawer removes the record from the URL`, !/record=/.test(await hash(page)));
      // Back / Forward across a deliberate step
      await page.click('#feed-chips [data-risk="Incendiu"]');
      await page.waitForFunction(() => state.filters.risk_category.has("Incendiu"));
      await page.goBack();
      await page.waitForFunction(() => state.filters.risk_category.has("Meteo"));
      const back = await page.evaluate(() => ({ on: [...document.querySelectorAll("#feed-chips .filter-chip.active")].map((b) => b.dataset.risk).join(), box: [...document.querySelectorAll('#facets input[data-field="risk_category"]:checked')].map((c) => c.value).join() }));
      check(`${tag} S07 Back restores the earlier facet in the chips and the sidebar`, back.on === "Meteo" && back.box === "Meteo", JSON.stringify(back));
      await page.goForward();
      await page.waitForFunction(() => state.filters.risk_category.has("Incendiu"));
      check(`${tag} S07 Forward restores the later facet`, (await page.evaluate(() => [...state.filters.risk_category].join())) === "Incendiu");
      // Opening a record and pressing Back closes it
      await page.click(".feed-card");
      await page.waitForFunction(() => !!state.record);
      await page.goBack();
      await page.waitForFunction(() => !state.record);
      check(`${tag} S07 Back closes the drawer and keeps the filters`, !(await page.evaluate(() => document.getElementById("drawer").open)) && (await page.evaluate(() => state.filters.risk_category.has("Incendiu"))));
      // Reset updates the URL
      await page.click("#btn-clear-all");
      await page.waitForFunction(() => state.filters.risk_category.size === 0 && !state.dateFrom && !state.search);
      check(`${tag} S07 Reset empties the filters and the URL`, !/f\.|q=|from=|to=|record=/.test(await hash(page)), await hash(page));
      check(`${tag} S07 no JS errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    }

    // ---- S08: safe fallbacks with visible explanations ----
    {
      const probes = [
        ["unknown key, bad date, absent IDs, bad facet value", "schema=1&foo=bar&from=2026-13-45&record=nope&place=1&county=Atlantis&f.risk_category=Zzz", 5],
        ["unsupported schema", "schema=9&view=table&f.risk_category=Meteo", 1],
        ["reversed range", "schema=1&from=2026-06-01&to=2026-05-01", 1],
      ];
      for (const [name, h, minNotices] of probes) {
        const { ctx, page, errors } = await openAt(h, { lang });
        const r = await page.evaluate(() => ({ notices: document.querySelectorAll("#notices .notice").length, view: state.view, n: currentRows.length,
          hash: location.hash, shown: !document.getElementById("notices").hidden, text: document.getElementById("notices").innerText }));
        check(`${tag} S08 ${name}: visible notice, valid state`, r.shown && r.notices >= minNotices && r.view !== "location" && r.n > 0 && !/foo=/.test(r.hash), JSON.stringify(r).slice(0, 300));
        if (name.startsWith("unknown")) await shot(page, `${lang}-s08-notices`);
        check(`${tag} S08 ${name}: no JS errors`, errors.length === 0, errors.join(" | "));
        await page.click("#notices .notice-x");
        const left = await page.evaluate(() => document.querySelectorAll("#notices .notice").length);
        check(`${tag} S08 ${name}: notice can be dismissed`, left === r.notices - 1);
        await ctx.close();
      }
      // dates outside the detailed range are kept and explained
      const { ctx, page } = await openAt("schema=1&from=2025-09-01&to=2025-10-31", { lang });
      const o = await page.evaluate(() => ({ from: state.dateFrom, to: state.dateTo, note: document.querySelector("#active-strip .strip-note")?.textContent || "",
        empty: !!document.getElementById("empty-clear"), n: currentRows.length }));
      check(`${tag} S08 summary-only months: dates kept, period explained, no records invented`, o.from === "2025-09-01" && o.to === "2025-10-31" && /2026-02-03/.test(o.note) && o.n === 0 && o.empty, JSON.stringify(o));
      await ctx.close();
    }

    // ---- S09: message language in the drawer ----
    {
      const { ctx, page, errors } = await openAt("schema=1&record=60e0361757e4", { lang });
      await page.waitForSelector("#drawer-msg");
      const d = await page.evaluate(() => ({
        msg: document.getElementById("drawer-msg").textContent,
        en: document.querySelector('.msg-toggle [data-lang="en"]').disabled,
        ro: document.querySelector('.msg-toggle [data-lang="ro"]').disabled,
        label: document.querySelector(".msg-lang").textContent,
        note: document.getElementById("drawer-msg-note").textContent,
        outside: !!document.getElementById("drawer-context"),
      }));
      check(`${tag} S09 English-only record: EN enabled, RO disabled, labelled English, original text`,
        !d.en && d.ro && d.msg.startsWith("On 09.02.2026") && /(engleză|English)/.test(d.label), JSON.stringify(d).slice(0, 300));
      check(`${tag} S09 ${lang === "ro" ? "requested Romanian text is absent: original shown with a note" : "English view shows the English text with no fallback note"}`,
        lang === "ro" ? d.note.length > 0 : d.note === "");
      check(`${tag} S09 a record link opened with no filter is not labelled as outside`, !d.outside);
      await shot(page, `${lang}-s09-drawer`);
      check(`${tag} S09 no JS errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    }
    {
      // a bilingual record: both buttons work, the text matches each language
      const probe = await openAt("", { lang });
      const id = await probe.page.evaluate(() => DATA.alerts.find((a) => a.message_language === "mixed" && a.msg_ro && a.msg_en).id);
      await probe.ctx.close();
      const { ctx, page } = await openAt(`schema=1&record=${id}`, { lang });
      await page.waitForSelector("#drawer-msg");
      const before = await page.evaluate(() => document.getElementById("drawer-msg").textContent);
      await page.click(`.msg-toggle [data-lang="${lang === "ro" ? "en" : "ro"}"]`);
      const after = await page.evaluate(() => document.getElementById("drawer-msg").textContent);
      check(`${tag} S09 bilingual record: toggle switches the text`, before !== after && before.length > 20 && after.length > 20);
      // the drawer is outside the selection when a filter excludes it
      const outside = await page.evaluate(() => { state.filters.risk_category.add("Zzz-none"); update("replace"); return !!document.getElementById("drawer-context"); });
      check(`${tag} S09 a record outside the selection says so`, outside);
      await ctx.close();
    }

    // ---- S11: zero results keep usable filters; EN leaves no Romanian category labels ----
    {
      const { ctx, page, errors } = await openAt("", { lang });
      await page.fill("#search", "zzzzqqqq");
      await page.waitForFunction(() => state.search === "zzzzqqqq");
      const z = await page.evaluate(() => ({
        empty: !!document.querySelector("#content-main .empty-state"), btn: !!document.getElementById("empty-clear"),
        input: document.getElementById("search").value, chip: document.querySelector("#active-strip .strip-chip")?.textContent || "",
        side: !!document.getElementById("sidebar-clear"),
      }));
      check(`${tag} S11 zero results: message, clear action, search text and strip chip stay`, z.empty && z.btn && z.input === "zzzzqqqq" && /zzzzqqqq/.test(z.chip) && z.side, JSON.stringify(z));
      await shot(page, `${lang}-s11-empty`);
      await page.click("#empty-clear");
      await page.waitForFunction(() => currentRows.length === DATA.alerts.length);
      check(`${tag} S11 the clear action restores the results and empties the search box`, (await page.inputValue("#search")) === "");
      check(`${tag} S11 no JS errors`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    }
  }

  // EN: no Romanian derived-category labels in any view
  {
    const { ctx, page, errors } = await openAt("schema=1&lang=en", { lang: "en" });
    const leaks = {};
    const scan = async (name) => {
      const found = await page.evaluate((ro) => {
        const out = [];
        const sel = ["#facets .facet[data-facet-field='risk_category'] .lbl", "#feed-chips .filter-chip", ".feed-card-risk", "td .td-risk", ".story-table td",
          "#kpis .sub", ".feed-breakdown-item span:first-child", "#drawer-body .ent-chip b", ".legend"];
        for (const s of sel) document.querySelectorAll(s).forEach((e) => { if (ro.some((r) => e.textContent.includes(r))) out.push(s + ": " + e.textContent.trim().slice(0, 40)); });
        for (const c of Object.values(charts)) {
          const labels = (c.data.labels || []).concat(c.data.datasets.map((d) => d.label || ""));
          labels.forEach((l) => { if (ro.some((r) => String(l).includes(r))) out.push("chart: " + l); });
        }
        return out;
      }, RO_CATEGORIES);
      if (found.length) leaks[name] = found;
    };
    for (const v of ["dashboard", "story", "table", "feed"]) {
      await page.click(`.view-tab[data-view="${v}"]`);
      await page.waitForTimeout(150);
      await scan(v);
    }
    await page.goto(`${URL}#schema=1&lang=en&county=Harghita`);
    await page.reload();
    await page.waitForSelector(".location-view");
    await scan("location");
    const foot = await page.evaluate(() => ({ f: document.querySelector(".site-footer").innerText, r: document.getElementById("footer-range").textContent }));
    check("[en] S11 no Romanian derived category label in any view or chart", Object.keys(leaks).length === 0, JSON.stringify(leaks));
    check("[en] S11 the footer and its range are English", /NOT an official/.test(foot.f) && /february/i.test(foot.r) && !/NU ESTE/.test(foot.f), JSON.stringify(foot));
    check("[en] S11 no JS errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // Layout of the new strip and the place view at every width, both languages.
  for (const lang of ["ro", "en"]) {
    for (const width of WIDTHS) {
      const { ctx, page, errors } = await openAt("schema=1&f.risk_category=Meteo&f.risk_category=Inunda%C8%9Bii&f.severitate=SEVERE&from=2026-04-01&q=ISU&county=Harghita&place=83641", { lang, width });
      await page.waitForSelector(".location-view");
      const g = await page.evaluate(() => {
        const s = document.getElementById("active-strip");
        const r = s.getBoundingClientRect();
        return { stripW: Math.round(r.width), scrollW: s.scrollWidth, clientW: s.clientWidth, vw: innerWidth, chips: s.querySelectorAll(".strip-chip").length,
                 reset: !!s.querySelector("[data-strip-reset]"), n: currentRows.length };
      });
      check(`[${lang} ${width}px] strip shows all filters and fits its width`, g.chips === 7 && g.reset && g.scrollW <= g.clientW + 1, JSON.stringify(g));
      await shot(page, `${lang}-strip-${width}`);
      check(`[${lang} ${width}px] no JS errors with filters, place and strip`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    }
  }
};
