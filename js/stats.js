/* Pure statistics for a selection of alerts. No DOM, no globals except `Stats`.
   The same file loads in the browser (global `Stats`) and in Node (`require`), so
   `tests/js/` can run it without a browser. */

const Stats = (function () {
  const DAY_MS = 86400000;

  function parseDay(s) {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  }

  function fmtDay(ms) {
    return new Date(ms).toISOString().slice(0, 10);
  }

  /* Every calendar day from `first` to `last` (both "YYYY-MM-DD"), inclusive, once each.
     Uses UTC arithmetic, so the browser time zone and daylight-saving changes have no effect. */
  function dayRange(first, last) {
    const out = [];
    if (!first || !last) return out;
    for (let ms = parseDay(first), end = parseDay(last); ms <= end; ms += DAY_MS) out.push(fmtDay(ms));
    return out;
  }

  /* Daily counts for a selection. The axis runs from the first to the last selected date.
     `series[cat][i]` counts alerts of one category on `labels[i]`; `total[i]` is their sum;
     `failed[i]` counts failed alerts on that day (a diagnostic, not part of `total`). */
  function dailyCounts(rows) {
    const dates = rows.map((a) => a.date).filter(Boolean).sort();
    if (!dates.length) return { labels: [], categories: [], series: {}, total: [], failed: [] };
    const labels = dayRange(dates[0], dates[dates.length - 1]);
    const idx = new Map(labels.map((d, i) => [d, i]));
    const catTotals = new Map();
    for (const a of rows) {
      if (!a.date) continue;
      catTotals.set(a.risk_category, (catTotals.get(a.risk_category) || 0) + 1);
    }
    const categories = [...catTotals.entries()]
      .sort((x, y) => y[1] - x[1] || String(x[0]).localeCompare(String(y[0])))
      .map((e) => e[0]);
    const series = {};
    for (const c of categories) series[c] = new Array(labels.length).fill(0);
    const total = new Array(labels.length).fill(0);
    const failed = new Array(labels.length).fill(0);
    for (const a of rows) {
      const i = idx.get(a.date);
      if (i == null) continue;
      series[a.risk_category][i]++;
      total[i]++;
      if (a.status_ok === false) failed[i]++;
    }
    return { labels, categories, series, total, failed };
  }

  function rate(part, whole) {
    return whole ? (part / whole) * 100 : null;
  }

  /* Failure figures for a selection. `months` is META.months. Only a month whose
     `error_reporting` is "observed" has ERROR rows, so only those months form the
     reporting sample. A rate is null when its denominator is zero. */
  function selectionStats(rows, months) {
    const byLabel = new Map();
    for (const m of months || []) byLabel.set(m.label, m);
    const s = {
      total: rows.length, failedAlerts: 0,
      reportingAlerts: 0, reportingFailedAlerts: 0,
      reportingDeliveries: 0, reportingErrorDeliveries: 0,
      reportingMonths: [], unknownMonths: [],
    };
    const rep = new Set(), unk = new Set();
    for (const a of rows) {
      if (a.status_ok === false) s.failedAlerts++;
      const m = byLabel.get(a.month);
      if (m && m.error_reporting === "observed") {
        rep.add(m.key);
        s.reportingAlerts++;
        if (a.status_ok === false) s.reportingFailedAlerts++;
        for (const d of a.deliveries || []) {
          s.reportingDeliveries++;
          if (d.status === "ERROR") s.reportingErrorDeliveries++;
        }
      } else {
        unk.add(m ? m.key : a.month);
      }
    }
    s.reportingMonths = [...rep].sort();
    s.unknownMonths = [...unk].sort();
    s.alertRate = rate(s.reportingFailedAlerts, s.reportingAlerts);
    s.deliveryRate = rate(s.reportingErrorDeliveries, s.reportingDeliveries);
    return s;
  }

  return { dayRange, dailyCounts, selectionStats, rate };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Stats;
