/* Leaflet choropleth of Romanian counties. No tile basemap (fully offline):
   just the județe polygons shaded by the alert count of the filtered set.
   Clicking a county toggles it in the `judet` facet. */

const RoMap = {
  map: null,
  layer: null,
  counts: {},          // countyKey -> count
  selectedKey: null,   // local-view highlight
  onCountyClick: null, // wired by app.js
};

// blue sequential scale
function choroplethColor(c, max) {
  if (!c) return "#1a202c";
  const t = Math.sqrt(c / (max || 1)); // perceptual-ish
  const stops = ["#15314f", "#1d4f7c", "#2f6fb0", "#4c8dff", "#8fb8ff"];
  const i = Math.min(stops.length - 1, Math.floor(t * stops.length));
  return stops[i];
}

function initMap(geo) {
  RoMap.map = L.map("map", {
    zoomControl: true, attributionControl: false,
    minZoom: 6, maxZoom: 9,
  });
  RoMap.layer = L.geoJSON(geo, {
    style: featureStyle,
    onEachFeature: (feature, lyr) => {
      lyr.on({
        mouseover: (e) => { e.target.setStyle({ weight: 2, color: "#fff" }); },
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
    color: isSel ? "#ffd34d" : "#2a313c",
    fillOpacity: 0.85,
  };
}

function tooltipHtml(name) {
  const key = countyKey(name);
  const c = RoMap.counts[key] || 0;
  return `<strong>${name}</strong><br>${c} ${t("legend_alerts")}`;
}

/* Recolor from a filtered row set. selectedKey highlights one county (local). */
function updateMap(rows, selectedJudet) {
  const counts = {};
  for (const a of rows) {
    if (a.scope !== "county") continue;
    const k = countyKey(a.judet);
    counts[k] = (counts[k] || 0) + 1;
  }
  RoMap.counts = counts;
  RoMap._max = Math.max(1, ...Object.values(counts));
  RoMap.selectedKey = selectedJudet ? countyKey(selectedJudet) : null;
  if (RoMap.layer) RoMap.layer.setStyle(featureStyle);
  renderMapLegend(RoMap._max);

  // zoom to selected county in local view, else whole country
  if (RoMap.selectedKey && RoMap.layer) {
    let target = null;
    RoMap.layer.eachLayer((l) => {
      if (countyKey(l.feature.properties.name) === RoMap.selectedKey) target = l;
    });
    if (target) RoMap.map.fitBounds(target.getBounds(), { padding: [40, 40], maxZoom: 9 });
  }
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
