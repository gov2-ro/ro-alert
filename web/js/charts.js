/* Chart.js renderers. Charts are created once and updated in place. */

Chart.defaults.color = "#8b97a7";
Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";
Chart.defaults.borderColor = "#2a313c";

const CAT_COLORS = {
  "Animale periculoase": "#b07d3a",
  "Copil dispărut": "#d05ce3",
  "Atac aerian / dronă": "#f85149",
  "Meteo": "#4c8dff",
  "Inundații": "#2aa6c4",
  "Incendiu": "#e3852b",
  "Tehnologic": "#9aa72b",
  "Securitate națională": "#c44",
  "Altele": "#6e7681",
};
function catColor(name) { return CAT_COLORS[name] || "#6e7681"; }

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

function renderCharts(rows) {
  renderTimeline(rows);
  renderCategory(rows);
  renderJudet(rows);
}

function renderTimeline(rows) {
  const m = countBy(rows, "date");
  const labels = [...m.keys()].sort();
  const data = labels.map((d) => m.get(d));
  // split errors per day for a second series
  const errM = new Map();
  for (const a of rows) if (a.status_ok === false && a.date) errM.set(a.date, (errM.get(a.date) || 0) + 1);
  const errData = labels.map((d) => errM.get(d) || 0);

  const cfg = {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: t("kpi_total"), data, borderColor: "#4c8dff", backgroundColor: "rgba(76,141,255,.15)", fill: true, tension: .25, pointRadius: 0, borderWidth: 2 },
        { label: t("kpi_error"), data: errData, borderColor: "#f85149", backgroundColor: "transparent", tension: .25, pointRadius: 0, borderWidth: 1.5 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, labels: { boxWidth: 10 } } },
      scales: { x: { ticks: { maxTicksLimit: 8 }, grid: { display: false } }, y: { beginAtZero: true } },
    },
  };
  upsert("timeline", "chart-timeline", cfg);
}

function renderCategory(rows) {
  const m = countBy(rows, "risk_category");
  const entries = [...m.entries()].sort((a, b) => b[1] - a[1]);
  const cfg = {
    type: "doughnut",
    data: {
      labels: entries.map((e) => e[0]),
      datasets: [{ data: entries.map((e) => e[1]), backgroundColor: entries.map((e) => catColor(e[0])), borderColor: "#161b22", borderWidth: 2 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "55%",
      plugins: { legend: { position: "right", labels: { boxWidth: 10, font: { size: 11 } } } },
    },
  };
  upsert("category", "chart-category", cfg);
}

function renderJudet(rows) {
  const m = countBy(rows.filter((a) => a.scope === "county"), "judet");
  const entries = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const cfg = {
    type: "bar",
    data: {
      labels: entries.map((e) => e[0]),
      datasets: [{ data: entries.map((e) => e[1]), backgroundColor: "#4c8dff", borderRadius: 4 }],
    },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, grid: { color: "#1c2230" } }, y: { grid: { display: false } } },
    },
  };
  upsert("judet", "chart-judet", cfg);
}

function upsert(name, canvasId, cfg) {
  if (charts[name]) {
    charts[name].data = cfg.data;
    charts[name].options = cfg.options;
    charts[name].update();
  } else {
    charts[name] = new Chart(document.getElementById(canvasId), cfg);
  }
}
