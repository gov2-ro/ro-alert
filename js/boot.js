/* Start-up guard. This file loads first and depends on nothing else: it must still work when a
   data bundle, a script or the stylesheet is missing. It records scripts that fail to load,
   and it draws a plain-language error with a Retry button when the application cannot start.
   The loading status is plain text in index.html; the first render replaces it. */

const RoBoot = (function () {
  const failedScripts = [];     // {src, message}: scripts that did not load or did not parse
  let ready = false;
  let shown = false;

  const TEXT = {
    ro: {
      title: "Datele nu s-au putut încărca",
      intro: "Pagina nu poate porni, deci nu afișează nicio alertă. Aceasta nu înseamnă că arhiva este goală.",
      what: "Ce s-a întâmplat",
      fix: "Ce poți face",
      fixText: "Apasă Reîncarcă. Dacă eroarea rămâne, verifică dacă folderul paginii conține toate fișierele din folderele js, vendor și data, sau încearcă mai târziu.",
      retry: "Reîncarcă",
      tech: "Detalii tehnice",
    },
    en: {
      title: "The data could not be loaded",
      intro: "The page cannot start, so it shows no alerts. This does not mean that the archive is empty.",
      what: "What happened",
      fix: "What you can do",
      fixText: "Press Retry. If the error stays, check that the page folder holds every file of the js, vendor and data folders, or try again later.",
      retry: "Retry",
      tech: "Technical details",
    },
  };

  function lang() {
    return /(?:^|[#&])lang=en(?:&|$)/.test(location.hash) ? "en" : "ro";
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* `problem` is a plain-language sentence; `detail` is the technical line (shown in a disclosure). */
  function fail(problem, detail) {
    if (shown) return;
    shown = true;
    const x = TEXT[lang()];
    const html = `<section class="boot-error" role="alert">
      <h2>${esc(x.title)}</h2>
      <p>${esc(x.intro)}</p>
      <h3>${esc(x.what)}</h3><p class="boot-problem">${esc(problem)}</p>
      <h3>${esc(x.fix)}</h3><p>${esc(x.fixText)}</p>
      <p><button type="button" class="primary-btn boot-retry" id="boot-retry">${esc(x.retry)}</button></p>
      ${detail ? `<details><summary>${esc(x.tech)}</summary><pre>${esc(detail)}</pre></details>` : ""}
    </section>`;
    const host = document.getElementById("content-main") || document.body;
    host.innerHTML = html;
    const btn = document.getElementById("boot-retry");
    if (btn) {
      btn.addEventListener("click", () => location.reload());     // the hash stays: the selection survives
      btn.focus();
    }
    const rc = document.getElementById("result-count");
    if (rc) rc.textContent = "";
  }

  /* Turn any thrown value into a message for the page. */
  function failFrom(err) {
    const msg = err && err.userMessage ? err.userMessage : (lang() === "en"
      ? "An unexpected error stopped the page from starting."
      : "O eroare neașteptată a oprit pornirea paginii.");
    fail(msg, err && (err.detail || err.stack || err.message || String(err)));
  }

  /* A script that does not load fires "error" on its element; one that fails to parse fires it on
     window. A missing page script stops the start at once. A missing data bundle is recorded: the
     loader may still read the JSON copy, and it explains the failure when it cannot. */
  window.addEventListener("error", (e) => {
    if (ready || shown) return;
    const el = e.target;
    if (el && el !== window && el.tagName === "SCRIPT") {
      const src = el.getAttribute("src") || "";
      if (!/^(?:js|vendor|data)\//.test(src)) return;      // the optional analytics tag is not part of the page
      failedScripts.push({ src, message: "not loaded" });
      if (!/^data\//.test(src)) {
        fail(lang() === "en" ? `The file ${src} could not be loaded.` : `Fișierul ${src} nu s-a putut încărca.`, `script not loaded: ${src}`);
      }
      return;
    }
    const file = String(e.filename || "").replace(/^.*\/(?=(?:js|data|vendor)\/)/, "");
    if (!/^(?:js|vendor|data)\//.test(file)) return;      // not a file of this page
    failedScripts.push({ src: file, message: String(e.message || "") });
    if (/^data\//.test(file)) return;      // the loader reports a broken bundle
    fail(lang() === "en" ? `The script ${file || "of the page"} stopped with an error.` : `Scriptul ${file || "paginii"} s-a oprit cu o eroare.`,
      `${e.message || ""} ${e.filename || ""}:${e.lineno || ""}`);
  }, true);
  window.addEventListener("unhandledrejection", (e) => { if (!ready) failFrom(e.reason); });

  return { failedScripts, fail, failFrom, lang, markReady() { ready = true; }, get shown() { return shown; } };
})();
