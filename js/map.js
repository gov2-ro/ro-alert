/* Light-theme Leaflet choropleth of Romanian counties.
   No tile basemap (fully offline). Clicking a county drills into Location view. */

const RoMap = {
  map: null,
  layer: null,
  counts: {},
  selectedKey: null,
  onCountyClick: null,
  onPlaceClick: null,
  placeLayer: null,
};

/* Blue sequential scale for light background */
function choroplethColor(c, max) {
  if (!c || max === 0) return "#e8e3d8";
  const t = Math.sqrt(c / (max || 1));
  const stops = ["#d6e8f7", "#a8cce8", "#7ab0d9", "#4c94cb", "#2a78bd", "#1a5fa8"];
  const i = Math.min(stops.length - 1, Math.floor(t * stops.length));
  return stops[i];
}

function initMap(geo) {
  const el = document.getElementById("map");
  if (!el) return;
  RoMap.map = L.map("map", {
    zoomControl: true, attributionControl: false,
    minZoom: 6, maxZoom: 9,
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
}

function featureStyle(feature) {
  const key = countyKey(feature.properties.name);
  const max = RoMap._max || 1;
  const isSel = RoMap.selectedKey && key === RoMap.selectedKey;
  return {
    fillColor: choroplethColor(RoMap.counts[key] || 0, max),
    weight: isSel ? 3 : 1,
    color: isSel ? "#2a6fc4" : "#c8c0b0",
    fillOpacity: 0.85,
  };
}

function tooltipHtml(name) {
  const key = countyKey(name);
  const c = RoMap.counts[key] || 0;
  return `<strong>${name}</strong><br>${c} ${t("legend_alerts")}`;
}

function updateMap(rows, selectedJudet) {
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
  RoMap.layer.setStyle(featureStyle);
  renderMapLegend(RoMap._max);
  renderPlaces(rows);

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

/* Point layer: one circle per locality named in the polygon list of the selected alerts.
   Radius grows with the count of alerts that name the locality. A point marks the locality
   of the alert area, not the place of the event. */
function renderPlaces(rows) {
  if (RoMap.placeLayer) { RoMap.placeLayer.remove(); RoMap.placeLayer = null; }
  const byId = new Map();
  for (const a of rows) {
    for (const p of a.places || []) {
      let e = byId.get(p.siruta);
      if (!e) { e = { p, n: 0, judets: new Map() }; byId.set(p.siruta, e); }
      e.n++;
      if (a.scope === "county") e.judets.set(a.judet, (e.judets.get(a.judet) || 0) + 1);
    }
  }
  const group = L.layerGroup();
  const entries = [...byId.values()].sort((a, b) => b.n - a.n);   // small points drawn last
  for (const e of entries.reverse()) {
    const m = L.circleMarker([e.p.lat, e.p.lon], {
      radius: Math.min(12, 2.5 + 1.3 * Math.sqrt(e.n)),
      color: "#9b1c1c", weight: 1, fillColor: "#d93b3b", fillOpacity: 0.55,
      bubblingMouseEvents: false,
    });
    const judet = [...e.judets.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0])[0] || null;
    m.bindTooltip(`<strong>${esc(e.p.name)}</strong><br>${e.n} ${t("legend_alerts")}`, { sticky: true });
    m.on("click", () => { if (judet && RoMap.onPlaceClick) RoMap.onPlaceClick(judet, e.p.name); });
    group.addLayer(m);
  }
  group.addTo(RoMap.map);
  RoMap.placeLayer = group;
}

function renderMapLegend(max) {
  const el = document.getElementById("map-legend");
  if (!el) return;
  const stops = [0, Math.ceil(max * 0.15), Math.ceil(max * 0.4), Math.ceil(max * 0.7), max];
  const seen = new Set();
  el.innerHTML = stops
    .filter((v) => !seen.has(v) && seen.add(v))
    .map((v) => `<span><i class="sw" style="background:${choroplethColor(v, max)}"></i>${v}</span>`)
    .join("");
}

function destroyMap() {
  if (RoMap.map) {
    RoMap.map.remove();
    RoMap.map = null;
    RoMap.layer = null;
    RoMap.placeLayer = null;
    RoMap.counts = {};
    RoMap.selectedKey = null;
  }
}
