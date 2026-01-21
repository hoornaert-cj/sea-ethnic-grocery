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

function linkRow(label, url, text = null) {
  if (!url) return "";
  const safeUrl = esc(url);
  const safeText = esc(text || label);
  return `<div class="popup-row"><a href="${safeUrl}" target="_blank" rel="noopener">${safeText}</a></div>`;
}

function esc(s) {
  if (s == null) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderRecipeLinks(raw) {
  // Split on newlines if present, otherwise try to split on "http"
  const text = raw.replace(/\r/g, "").trim();
  if (!text) return "";

  // If you already have newline-separated recipes, this works great.
  const lines = text.includes("\n")
    ? text.split("\n")
    : text.split(/(?=https?:\/\/)/g).map(s => s.trim()); // crude fallback

  const items = [];

  for (const line of lines) {
    const m = line.match(/^(.*?)(https?:\/\/\S+)\s*$/);
    if (!m) continue;
    const title = esc(m[1].replace(/[:\-–]\s*$/, "").trim() || "Recipe");
    const url = esc(m[2].trim());
    items.push(`<div class="sea-recipe"><a href="${url}" target="_blank" rel="noopener">${title}</a></div>`);
  }

  return items.join("");
}


//----ADD CANONICAL STORE HERE----//
function cleanValue (v) {
  if(v==null) return null;
  const s = String(v).trim();
  if(!s) return NULL;
  if(s.toLowerCase() ==='none') return null;
}

function firstNonEmpty(...vals) {
  for(const v of vals) {
    const cleaned = cleanValue(v);
    if(cleaned) return cleaned;
  }
  return null;
}

function buildGroceryPopupHTML(p) {
  const name = p.store_name_final ? esc(p.store_name_final) : "Grocery Store";

  const regionText = p.region ? esc(p.region) : null;

  const iconKey = p.icon_key ? esc(p.icon_key) : null;
  const iconHtml = iconKey
    ? `<img class="popup-flag" src="icons/${iconKey}.png" alt="${iconKey}">`
    : "";

  const recipesRaw = p.recipes_out ? String(p.recipes_out) : "";
  const recipesHtml = recipesRaw ? renderRecipeLinks(recipesRaw) : "";

  const flyer = p.flyer_url_final || null;
  const ordering = p.ordering_url || null;
  const directions = p.directions_url || null;

  const notes = p.notes_final ? esc(p.notes_final) : "";

  return `
    <div class="sea-card">
      <div class="sea-header">
        <div class="sea-title">${name}</div>
        ${iconHtml}
      </div>

      <div class="sea-rows">
        ${regionText ? rowHTML("Region:", `<span class="sea-linkish">${regionText}</span>`) : ""}

        ${recipesHtml ? rowHTML("Recipes:", recipesHtml) : ""}

        ${(flyer || ordering) ? rowHTML("Website:", `
          ${flyer ? `<div>${anchor("Flyers", flyer)}</div>` : ""}
          ${ordering ? `<div>${anchor("Ordering", ordering)}</div>` : ""}
        `) : ""}

        ${notes ? rowHTML("Notes:", `<div class="sea-notes">${notes}</div>`) : ""}
      </div>

      ${directions ? `
        <div class="sea-footer">
          <a class="sea-directions" href="${esc(directions)}" target="_blank" rel="noopener">
            Get Directions
          </a>
        </div>
      ` : ""}
    </div>
  `;
}

function rowHTML(label, contentHtml) {
  return `
    <div class="sea-row">
      <div class="sea-label">${label}</div>
      <div class="sea-value">${contentHtml}</div>
    </div>
  `;
}

function anchor(text, url) {
  const safeUrl = esc(url);
  const safeText = esc(text);
  return `<a href="${safeUrl}" target="_blank" rel="noopener">${safeText}</a>`;
}


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
  const html = buildGroceryPopupHTML(props);
  layer.bindPopup(html, { maxWidth: 320 });
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
