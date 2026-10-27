/* Light-theme Leaflet map of Romanian counties and resolved places.
   No tile basemap (fully offline). Two presentation modes: county fills (default) and
   locality points over subdued county outlines. Clicking a county opens the Location view. */

const RoMap = {
  map: null,
  layer: null,
  counts: {},
  selectedKey: null,
  onCountyClick: null,
  onPlaceClick: null,
  placeLayer: null,
  mode: "counties",      // presentation only: "counties" or "places". Not part of the URL or any filter.
  _max: 1,
  _rows: null,
  _keys: null,
  pointCount: 0,
  pointMax: 0,
};

const CHORO_STOPS = ["#d6e8f7", "#a8cce8", "#7ab0d9", "#4c94cb", "#2a78bd", "#1a5fa8"];
const MAP_NO_DATA = "#e8e3d8";

/* Colour bin 0..5 for a count, or -1 for none. The scale is relative to the selection maximum. */
function choroplethBin(c, max) {
  if (!c || !max) return -1;
  return Math.min(CHORO_STOPS.length - 1, Math.floor(Math.sqrt(c / max) * CHORO_STOPS.length));
}

/* Blue sequential scale for light background */
function choroplethColor(c, max) {
  const b = choroplethBin(c, max);
  return b < 0 ? MAP_NO_DATA : CHORO_STOPS[b];
}

/* The count range of each colour bin that occurs for counts 1..max: [{bin, lo, hi}]. */
function choroplethRanges(max) {
  const r = new Map();
  for (let c = 1; c <= max; c++) {
    const b = choroplethBin(c, max);
    const e = r.get(b);
    if (e) e.hi = c; else r.set(b, { bin: b, lo: c, hi: c });
  }
  return [...r.values()];
}

function initMap(geo) {
  const el = document.getElementById("map");
  if (!el) return;
  RoMap.map = L.map("map", {
    zoomControl: true, attributionControl: false,
    minZoom: 6, maxZoom: 9,
    zoomAnimation: !REDUCED_MQ.matches, fadeAnimation: !REDUCED_MQ.matches, markerZoomAnimation: !REDUCED_MQ.matches,
  });
  RoMap.layer = L.geoJSON(geo, {
    style: featureStyle,
    onEachFeature: (feature, lyr) => {
      lyr.on({
        mouseover: (e) => { e.target.setStyle({ weight: 2.5, color: "#555" }); },
        mouseout: (e) => { RoMap.layer.resetStyle(e.target); },
        click: () => {
          const name = feature.properties.name;
          if (RoMap.onCountyClick) RoMap.onCountyClick(name);
        },
      });
      lyr.bindTooltip(() => tooltipHtml(feature.properties.name), { sticky: true });
    },
  }).addTo(RoMap.map);
  RoMap.map.fitBounds(RoMap.layer.getBounds(), { padding: [10, 10] });
  RoMap.map.on("layeradd moveend zoomend", skipShapesInTabOrder);
  RoMap.map.on("zoomend", resizePlaces);
  skipShapesInTabOrder();
}

/* County shapes and place points are pointer targets. Keyboard users use the list under the map,
   so the shapes stay out of the Tab order (the map container and zoom buttons stay in it). */
function skipShapesInTabOrder() {
  if (!RoMap.map) return;
  RoMap.map.getContainer().querySelectorAll("path, svg").forEach((el) => { el.setAttribute("tabindex", "-1"); el.setAttribute("focusable", "false"); });
}

function featureStyle(feature) {
  const key = countyKey(feature.properties.name);
  const isSel = RoMap.selectedKey && key === RoMap.selectedKey;
  if (RoMap.mode === "places") {
    // Subdued outlines: the points carry the data, the counties only give the frame.
    return { fillColor: "#efebe0", weight: isSel ? 3 : 1, color: isSel ? "#245fa8" : "#bdb4a2", fillOpacity: 0.7 };
  }
  return {
    fillColor: choroplethColor(RoMap.counts[key] || 0, RoMap._max || 1),
    weight: isSel ? 3 : 1,
    color: isSel ? "#245fa8" : "#c8c0b0",
    fillOpacity: 0.85,
  };
}

function tooltipHtml(name) {
  const key = countyKey(name);
  const c = RoMap.counts[key] || 0;
  const note = key === "bucuresti" ? t("map_tip_bucuresti") : key === "ilfov" ? t("map_tip_ilfov") : "";
  return `<strong>${esc(name)}</strong><br>${c} ${t("legend_alerts")} · ${esc(t("loc_kind_county").toLowerCase())}` +
    (note ? `<br><em>${esc(note)}</em>` : "");
}

/* Does the alert land on a county shape? One shape set serves the counts and the coverage. */
function mapCountyKeys() {
  if (!RoMap._keys) RoMap._keys = new Set(((DATA.geo && DATA.geo.features) || []).map((f) => countyKey(f.properties.name)));
  return RoMap._keys;
}

function mapCoverage(rows) {
  const keys = mapCountyKeys();
  return Stats.mapCoverage(rows, (a) => !!a.judet && keys.has(countyKey(a.judet)));
}

/* Draw the map for a selection. `opts.refit` (default true) refits the view; a mode change
   keeps the user's zoom. County counts use the issuing county of county-scope alerts. */
function updateMap(rows, selectedJudet, opts = {}) {
  if (!RoMap.layer) return;
  const counts = {};
  for (const a of rows) {
    if (a.scope !== "county") continue;
    const k = countyKey(a.judet);
    counts[k] = (counts[k] || 0) + 1;
  }
  RoMap.counts = counts;
  RoMap._max = Math.max(1, ...Object.values(counts));
  RoMap.selectedKey = selectedJudet ? countyKey(selectedJudet) : null;
  RoMap._rows = rows;
  RoMap.layer.setStyle(featureStyle);
  renderPlaces(rows);
  renderMapLegend();
  renderMapCoverage(rows);
  syncMapMode();

  if (opts.refit === false) return;
  if (RoMap.selectedKey) {
    let target = null;
    RoMap.layer.eachLayer((l) => {
      if (countyKey(l.feature.properties.name) === RoMap.selectedKey) target = l;
    });
    if (target) RoMap.map.fitBounds(target.getBounds(), { padding: [40, 40], maxZoom: 9 });
  } else {
    RoMap.map.fitBounds(RoMap.layer.getBounds(), { padding: [10, 10] });
  }
}

/* Switch between the county fills and the locality points. Presentation only: no filter,
   result count or URL value changes, and the view is not rendered again. */
function setMapMode(mode) {
  if (mode !== "counties" && mode !== "places") return;
  RoMap.mode = mode;
  if (RoMap.layer && RoMap._rows) updateMap(RoMap._rows, null, { refit: false });
  else syncMapMode();
}

function syncMapMode() {
  document.querySelectorAll("#map-mode [data-map-mode]").forEach((b) => {
    const on = b.dataset.mapMode === RoMap.mode;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
  const hint = document.getElementById("map-hint");
  if (hint) hint.textContent = RoMap.mode === "places" ? t("map_places_hint") : t("map_tap_hint");
}

/* Point radius in px: grows with the count, is bounded, and follows the zoom. */
function placeRadius(n, zoom) {
  const z = zoom == null ? 7 : zoom;
  const f = 0.7 + 0.15 * (z - 6);                      // 0.70 at zoom 6 .. 1.15 at zoom 9
  return Math.min(12, 2.5 + 1.3 * Math.sqrt(n)) * f;
}

/* Point layer (locality mode only): one circle per resolved place (SIRUTA code) named in the
   polygon list of the selected alerts. Radius grows with the count of alerts that name the
   place; an alert counts once per place. A point marks the locality of the alert area, not the
   place of the event. A click selects the place by code, within the current global filters.
   County mode draws no points, so they never cover the fills. */
function renderPlaces(rows) {
  if (RoMap.placeLayer) { RoMap.placeLayer.remove(); RoMap.placeLayer = null; }
  const byId = new Map();
  for (const a of rows) {
    for (const p of a.places || []) {
      let e = byId.get(p.siruta);
      if (!e) { e = { p, n: 0 }; byId.set(p.siruta, e); }
      e.n++;
    }
  }
  RoMap.pointCount = byId.size;
  RoMap.pointMax = Math.max(0, ...[...byId.values()].map((e) => e.n));
  if (RoMap.mode !== "places") return;
  const group = L.layerGroup();
  const entries = [...byId.values()].sort((a, b) => b.n - a.n);   // small points drawn last
  const z = RoMap.map.getZoom();
  for (const e of entries.reverse()) {
    const m = L.circleMarker([e.p.lat, e.p.lon], {
      radius: placeRadius(e.n, z),
      color: "#9b1c1c", weight: 1, fillColor: "#d93b3b", fillOpacity: 0.55,
      bubblingMouseEvents: false,
    });
    m.sirutaCode = e.p.siruta;
    m.alertCount = e.n;
    m.bindTooltip(`<strong>${esc(placeLabel(e.p.siruta, true))}</strong><br>${e.n} ${t("legend_alerts")}`, { sticky: true });
    m.on("click", () => { if (RoMap.onPlaceClick) RoMap.onPlaceClick(e.p.siruta); });
    group.addLayer(m);
  }
  group.addTo(RoMap.map);
  RoMap.placeLayer = group;
  skipShapesInTabOrder();
}

/* Points follow the zoom: a larger map zoom gives larger points, within the bound. */
function resizePlaces() {
  if (!RoMap.placeLayer || !RoMap.map) return;
  const z = RoMap.map.getZoom();
  RoMap.placeLayer.eachLayer((m) => m.setRadius(placeRadius(m.alertCount, z)));
  renderMapLegend();
}

/* The legend follows the mode. County mode lists the exact count range of each colour and says
   that the scale holds only within the selection. Locality mode shows sample point sizes. */
function renderMapLegend() {
  const el = document.getElementById("map-legend");
  if (!el) return;
  if (RoMap.mode === "places") {
    const max = RoMap.pointMax || 0;
    const z = RoMap.map ? RoMap.map.getZoom() : 7;
    const samples = [...new Set([1, Math.max(1, Math.round(max / 4)), max].filter((v) => v >= 1))];
    const dots = max ? samples.map((v) => {
      const r = Math.round(placeRadius(v, z) * 10) / 10;
      const d = Math.ceil(r * 2 + 2);
      return `<span class="lg-dot"><svg width="${d}" height="${d}" aria-hidden="true"><circle cx="${d / 2}" cy="${d / 2}" r="${r}" fill="#d93b3b" fill-opacity="0.55" stroke="#9b1c1c"/></svg>${v}</span>`;
    }).join("") : "—";
    el.innerHTML = `<div class="lg-title">${esc(t("map_legend_places"))}</div><div class="lg-row">${dots}</div>`;
    return;
  }
  const max = Math.max(0, ...Object.values(RoMap.counts));
  const swatches = [`<span><i class="sw" style="background:${MAP_NO_DATA}"></i>0</span>`].concat(
    choroplethRanges(max).map((r) => `<span><i class="sw" style="background:${CHORO_STOPS[r.bin]}"></i>${r.lo === r.hi ? r.lo : r.lo + "–" + r.hi}</span>`));
  el.innerHTML = `<div class="lg-title">${esc(t("map_legend_county"))}</div><div class="lg-row">${swatches.join("")}</div>` +
    `<div class="lg-note">${esc(t("map_scale_within"))}</div>`;
}

/* Coverage of the current selection on the map, per mode. Whole-archive mention quality is
   a separate line: it does not say how many alerts have a point. */
function renderMapCoverage(rows) {
  const host = document.getElementById("map-coverage");
  if (!host) return;
  const c = mapCoverage(rows);
  if (RoMap.mode === "places") {
    const pl = (DATA.meta.places && DATA.meta.places.all) || null;
    const mention = pl ? `<p>${esc(fill(t("map_cov_mention"), { r: fmtN(pl.resolved), m: fmtN(pl.mentions), p: fmtShare(Stats.rate(pl.resolved, pl.mentions)) }))}</p>` : "";
    host.innerHTML = `<p><b>${esc(fill(t("map_cov_place"), { a: fmtN(c.withPlace), n: fmtN(c.total), p: fmtShare(c.placeShare), d: fmtN(c.distinctPlaces) }))}</b></p>` +
      `<p>${esc(fill(t("map_cov_multi"), { m: fmtN(c.placeMentions) }))}</p>${mention}<p>${esc(t("map_places_note"))}</p>`;
  } else {
    host.innerHTML = `<p><b>${esc(fill(t("map_cov_county"), { a: fmtN(c.county), n: fmtN(c.total), p: fmtShare(c.countyShare), b: fmtN(c.national), c: fmtN(c.unknown) }))}</b></p>` +
      `<p>${esc(t("map_cov_national"))}</p><p>${esc(t("map_conv_county"))}</p><p>${esc(t("map_cov_ilfov"))}</p>`;
  }
}

function destroyMap() {
  if (RoMap.map) {
    RoMap.map.remove();
    RoMap.map = null;
    RoMap.layer = null;
    RoMap.placeLayer = null;
    RoMap.counts = {};
    RoMap.selectedKey = null;
    RoMap._rows = null;
  }
}
