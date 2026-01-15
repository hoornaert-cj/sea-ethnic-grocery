// js/map.js

const PROJECT = {
  initialCenter: [43.726, -79.390],
  initialZoom: 12,
  minZoom: 10,
  tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileOptions: {
    maxZoom: 19,
    minZoom: 10,
    attribution:
      '&copy; OpenStreetMap contributors | Data: SEA',
  },
  panes: [
    { name: "basePolys", zIndex: 250 },
    { name: "points", zIndex: 450 },
    { name: "labels", zIndex: 550 },
  ],
};

const map = L.map("map", {
  center: PROJECT.initialCenter,
  zoom: PROJECT.initialZoom,
  minZoom: PROJECT.minZoom,
});

PROJECT.panes.forEach(({ name, zIndex }) => {
  map.createPane(name);
  map.getPane(name).style.zIndex = zIndex;
});

L.tileLayer(PROJECT.tileUrl, PROJECT.tileOptions).addTo(map);

const overlayLayers = {};
let legendContainer = null;

function formatValue(val, decimals = 1) {
  const n = Number(val);
  if (val == null) return null;
  return isNaN(n) ? String(val) : n.toFixed(decimals);
}

function buildPopupHTML(cfg, props) {
  let html = "";

  if (cfg.popup?.title) {
    const title =
      typeof cfg.popup.title === "function"
        ? cfg.popup.title(props)
        : props[cfg.popup.title];
    if (title) html += `<strong>${title}</strong><br>`;
  }

  const fields = cfg.popup?.fields || [];
  fields.forEach((f) => {
    const raw = props[f.field];
    if (raw == null) return;

    const value =
      f.format === "number"
        ? formatValue(raw, f.decimals ?? 1)
        : String(raw);

    if (value != null) {
      html += `${f.label}: ${value}${f.suffix || ""}<br>`;
    }
  });

  return html || "No attributes";
}

//----ADD CANONICAL STORE HERE----//

// -------- LAYER CONFIGS (edit these per project) --------
const LAYER_CONFIGS = [
  {
    id: "groceries",
    name: "Ethnic Grocery Stores",
    url: "data/ethnic-grocery.geojson",
    defaultVisible: true,
    pane: "points",

    pointToLayer: (feature, latlng) =>
      L.circleMarker(latlng, {
        radius: 6,
        weight: 1,
        opacity: 1,
        fillOpacity: 0.9,
      }),

    popup: {
      title: (p) => p.store_name || p.Name || "Grocery Store",
      fields: [
        { field: "description", label: "Category" },
        { field: "address", label: "Address" },
        { field: "neighbourhood", label: "Neighbourhood" },
        { field: "languages", label: "Languages" },
      ],
    },

    legend: {
      type: "note",
      text: "Tap a point to view store details.",
    },
  },

  // Optional: a neighbourhood boundary polygon layer
  // {
  //   id: "areas",
  //   name: "Neighbourhoods",
  //   url: "data/neighbourhoods.geojson",
  //   defaultVisible: false,
  //   pane: "basePolys",
  //   style: () => ({ color: "#000", weight: 1, fillOpacity: 0 }),
  //   popup: { title: "name", fields: [] },
  // },
];

function styleForFeature(feature, cfg) {
  if (cfg.style) return cfg.style(feature);
  return undefined;
}

function onEachFeature(feature, layer, cfg) {
  const props = feature.properties;
  if (!props) return;
  const html = buildPopupHTML(cfg, props);
  layer.bindPopup(html);
}

// -------- Legend UI --------
const legendControl = L.control({ position: "topright" });

legendControl.onAdd = function () {
  const div = L.DomUtil.create("div", "layer-legend");
  div.innerHTML = `
    <h3>SEA Map</h3>
    <h4>Layers</h4>
    <form id="layer-legend-form"></form>
  `;
  L.DomEvent.disableClickPropagation(div);
  legendContainer = div;
  return div;
};

legendControl.addTo(map);

function rebuildLegend() {
  const form = document.getElementById("layer-legend-form");
  if (!form) return;
  form.innerHTML = "";

  LAYER_CONFIGS.forEach((cfg) => {
    const layer = overlayLayers[cfg.id];
    if (!layer) return;

    const container = document.createElement("div");
    container.className = "layer-entry";

    const wrapper = document.createElement("label");
    wrapper.className = "layer-toggle";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = cfg.id;
    checkbox.checked = map.hasLayer(layer);
    checkbox.addEventListener("change", (e) => {
      if (e.target.checked) map.addLayer(layer);
      else map.removeLayer(layer);
    });

    const text = document.createElement("span");
    text.textContent = cfg.name;

    wrapper.appendChild(checkbox);
    wrapper.appendChild(text);
    container.appendChild(wrapper);

    if (cfg.legend?.type === "note") {
      const note = document.createElement("div");
      note.className = "layer-note";
      note.textContent = cfg.legend.text;
      container.appendChild(note);
    }

    form.appendChild(container);
  });
}

// -------- Load layers --------
LAYER_CONFIGS.forEach((cfg) => {
  fetch(cfg.url)
    .then((r) => r.json())
    .then((geojson) => {
      const layer = L.geoJSON(geojson, {
        pane: cfg.pane,
        style: (feature) => styleForFeature(feature, cfg),
        pointToLayer: cfg.pointToLayer
          ? (feature, latlng) => cfg.pointToLayer(feature, latlng)
          : undefined,
        onEachFeature: (feature, layer) => onEachFeature(feature, layer, cfg),
      });

      overlayLayers[cfg.id] = layer;
      if (cfg.defaultVisible) layer.addTo(map);
      rebuildLegend();
    })
    .catch((err) => console.error(`Error loading ${cfg.url}`, err));
});

// -------- Optional: reset view --------
const resetControl = L.control({ position: "topleft" });

resetControl.onAdd = function () {
  const container = L.DomUtil.create("div", "leaflet-bar reset-control");
  const link = L.DomUtil.create("a", "", container);
  link.href = "#";
  link.title = "Reset view";
  link.innerHTML = "⟳";
  L.DomEvent.on(link, "click", (e) => {
    L.DomEvent.stop(e);
    map.setView(PROJECT.initialCenter, PROJECT.initialZoom);
  });
  return container;
};

resetControl.addTo(map);
