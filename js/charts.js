/* Chart.js renderers for v2 light-theme dashboard.
   Charts are created once and updated in place via upsert(). */

Chart.defaults.color = "#6b6b6b";
Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";
Chart.defaults.borderColor = "#ddd8cc";
Chart.defaults.font.size = 12;
Chart.defaults.scales.linear.ticks.precision = 0;       // counts are whole numbers: no 0.5 ticks
if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) Chart.defaults.animation = false;

/* The category palette, labels and catColor() live in filters.js (one palette for all views). */

const charts = {};

function countBy(arr, key) {
  const m = new Map();
  for (const a of arr) {
    const v = a[key];
    if (!v) continue;
    m.set(v, (m.get(v) || 0) + 1);
  }
  return m;
}

/* ---- Daily timeline: alerts per day stacked by hazard category, with a separate
   failed-alert line. The Dashboard and the Local view both use it. Stats.dailyCounts
   builds the axis: every day from the first to the last selected date, once each. The
   failed line is a diagnostic; it is not part of the stack. Counts are discrete, so the
   line has no smoothing. ---- */
function renderStackedTimelineChart(canvasId, rows) {
  const d = Stats.dailyCounts(rows);
  const datasets = d.categories.map((c) => ({
    label: catLabel(c), data: d.series[c], backgroundColor: catColor(c), stack: "haz", borderWidth: 0, categoryPercentage: 0.9, barPercentage: 1,
  }));
  datasets.push({
    label: t("kpi_failed"), data: d.failed, type: "line",
    borderColor: "#d93b3b", backgroundColor: "transparent", borderWidth: 1.5,
    tension: 0, pointRadius: 0, order: 0,
  });

  const cfg = {
    type: "bar",
    data: { labels: d.labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 12 } } }, tooltip: { itemSort: (a, b) => b.raw - a.raw } },
      scales: {
        x: { stacked: true, ticks: { maxTicksLimit: 8 }, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, grid: { color: "#e8e3d8" } },
      },
    },
  };
  upsert(canvasId, canvasId, cfg);
}

/* ---- Hazard types (horizontal bar) ---- */
function renderHazardChart(canvasId, rows) {
  const m = countBy(rows, "risk_category");
  const entries = [...m.entries()].sort((a, b) => b[1] - a[1]);
  const cfg = {
    type: "bar",
    data: {
      labels: entries.map((e) => catLabel(e[0])),
      datasets: [{ data: entries.map((e) => e[1]), backgroundColor: entries.map((e) => catColor(e[0])), borderRadius: 4 }],
    },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, grid: { color: "#e8e3d8" } }, y: { grid: { display: false } } },
    },
  };
  upsert(canvasId, canvasId, cfg);
}

/* ---- Top counties (horizontal bar) ---- */
function renderTopCountiesChart(canvasId, rows) {
  const m = countBy(rows.filter((a) => a.scope === "county"), "judet");
  const entries = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const cfg = {
    type: "bar",
    data: {
      labels: entries.map((e) => e[0]),
      datasets: [{ data: entries.map((e) => e[1]), backgroundColor: "#2a6fc4", borderRadius: 4 }],
    },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, grid: { color: "#e8e3d8" } }, y: { grid: { display: false } } },
    },
  };
  upsert(canvasId, canvasId, cfg);
}

/* ---- Hour of day (bar) ---- */
function renderHourChart(canvasId, rows) {
  const hours = new Array(24).fill(0);
  for (const a of rows) {
    if (!a.sent_at) continue;
    const h = parseInt(a.sent_at.slice(11, 13), 10);
    if (!isNaN(h)) hours[h]++;
  }
  const cfg = {
    type: "bar",
    data: {
      labels: hours.map((_, i) => i + ":00"),
      datasets: [{ data: hours, backgroundColor: "#7ab0e0", borderRadius: 3 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 12, font: { size: 12 } }, grid: { display: false } },
        y: { beginAtZero: true, grid: { color: "#e8e3d8" } },
      },
    },
  };
  upsert(canvasId, canvasId, cfg);
}

/* ---- Issuing authority (horizontal bar) ---- */
function renderAuthorityChart(canvasId, rows) {
  const m = countBy(rows, "initiator");
  const entries = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const cfg = {
    type: "bar",
    data: {
      labels: entries.map((e) => e[0]),
      datasets: [{ data: entries.map((e) => e[1]), backgroundColor: "#5a9e6f", borderRadius: 4 }],
    },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, grid: { color: "#e8e3d8" } }, y: { grid: { display: false } } },
    },
  };
  upsert(canvasId, canvasId, cfg);
}

/* ---- Chart lifecycle ---- */
function upsert(name, canvasId, cfg) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  cfg.options = cfg.options || {};
  cfg.options.locale = state.lang === "en" ? "en-GB" : "ro-RO";   // one number format with the UI text
  describeChart(el, cfg);
  if (charts[name]) {
    charts[name].data = cfg.data;
    charts[name].options = cfg.options;
    charts[name].update();
  } else {
    charts[name] = new Chart(el, cfg);
  }
}

function destroyChart(name) {
  if (charts[name]) { charts[name].destroy(); delete charts[name]; }
}

function destroyAllCharts() {
  Object.keys(charts).forEach((k) => { charts[k].destroy(); });
  for (const k in charts) delete charts[k];
}

/* ---- Text equivalent of a chart ----
   The canvas gets a name from the panel heading. A collapsed disclosure after the chart holds
   the same numbers as a table, so no one needs hover or the canvas. The table is built when
   the disclosure first opens, to keep the DOM small. */
function describeChart(canvas, cfg) {
  const panel = canvas.closest(".panel");
  const h = panel && panel.querySelector("h2");
  const title = h ? h.textContent.trim() : canvas.id;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", title);
  const box = canvas.closest(".chart-box");
  if (!box) return;
  let det = box.nextElementSibling;
  if (!det || !det.classList.contains("chart-data")) {
    det = document.createElement("details");
    det.className = "chart-data";
    box.after(det);
  }
  det.innerHTML = `<summary>${esc(t("chart_data_show"))}</summary>`;
  det.addEventListener("toggle", () => {
    if (det.open && !det.querySelector("table")) det.insertAdjacentHTML("beforeend", chartTableHtml(title, cfg.data));
  });
}

function chartTableHtml(title, data) {
  const lab = (l) => esc(Array.isArray(l) ? l.join(" ") : l);
  const sets = data.datasets.map((d) => d.label || t("chart_data_value"));
  const rows = data.labels.map((l, i) =>
    `<tr><th scope="row">${lab(l)}</th>${data.datasets.map((d) => `<td class="num">${d.data[i] == null ? "—" : esc(d.data[i])}</td>`).join("")}</tr>`).join("");
  return `<div class="chart-data-scroll" tabindex="0" role="region" aria-label="${esc(t("chart_data_region") + ": " + title)}">
    <table class="chart-table"><caption class="sr-only">${esc(title)}</caption>
    <thead><tr><th scope="col">${esc(title)}</th>${sets.map((x) => `<th scope="col" class="num">${esc(x)}</th>`).join("")}</tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}
