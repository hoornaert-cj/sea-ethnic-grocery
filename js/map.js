// js/map.js

const PROJECT = {
  initialCenter: [43.7766, -79.2318],
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

let regionFilter = "ALL";
let regionOptions = [];
let groceriesGeojson = null;
let groceriesLayer = null;

function makeLayerFromGeojson(geojson, cfg) {
  return L.geoJSON(geojson, {
    pane: cfg.pane,
    style: (feature) => styleForFeature(feature, cfg),
    pointToLayer: cfg.pointToLayer
      ? (feature, latlng) => cfg.pointToLayer(feature, latlng, cfg)
      : undefined,
    onEachFeature: (feature, layer) => onEachFeature(feature, layer, cfg),
  });
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

// --- Option B: divIcon (image marker controlled by CSS) ---
const ICON_HTML_CACHE = {};

function makeStoreDivIcon(iconKeyRaw) {
  // Your filenames are lowercase like "ph.png", "cn.png", etc.
  const key = String(iconKeyRaw || "general").trim().toLowerCase();

  // Cache the HTML string so we're not rebuilding it for every marker
  if (!ICON_HTML_CACHE[key]) {
    ICON_HTML_CACHE[key] = `<img src="icons/${key}.png" class="store-icon-img" alt="">`;
  }

  return L.divIcon({
    className: "store-divicon",     // CSS hook
    html: ICON_HTML_CACHE[key],
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17],
  });
}


function renderRecipeLinks(raw, hasRecommended) {
  const text = String(raw || "").replace(/\r/g, "").trim();
  if (!text || text.toLowerCase() === "none") return "";

  const lines = text
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);

  const urlRe = /(https?:\/\/\S+)/;

  const itemsHtml = lines
    .map(line => {
      const m = line.match(urlRe);
      if (!m) return "";

      const url = m[1].trim();
      const label = line
        .slice(0, m.index)
        .replace(/[:\-–]\s*$/, "")
        .trim() || "Recipe";

      return `<div class="sea-item">${anchor(label, url)}</div>`;
    })
    .filter(Boolean)
    .join("");

  // ✅ If there are no items, don't render anything (and no star either)
  if (!itemsHtml) return "";

  const starHtml = hasRecommended ? `
  <span class="sea-star" aria-label="recommended" title="recommended dish">
    ★
  </span>
` : "";

  return `
    <div class="sea-recipes">
      <div class="sea-list">${itemsHtml}</div>
      ${starHtml}
    </div>
  `;
}

function buildGroceriesLayer(cfg) {
  if (!groceriesGeojson) return L.layerGroup(); // safety

  const geo = (regionFilter === "ALL")
    ? groceriesGeojson
    : {
        ...groceriesGeojson,
        features: groceriesGeojson.features.filter(f =>
          (f.properties?.region || "").trim() === regionFilter
        ),
      };

  return makeLayerFromGeojson(geo, cfg);
}


function refreshGroceriesLayer() {
  const cfg = LAYER_CONFIGS.find(c => c.id === "groceries");
  if (!cfg || !groceriesGeojson) return;

  const wasOn = groceriesLayer && map.hasLayer(groceriesLayer);
  if (wasOn) map.removeLayer(groceriesLayer);

  groceriesLayer = buildGroceriesLayer(cfg);
  overlayLayers[cfg.id] = groceriesLayer;

  if (wasOn) groceriesLayer.addTo(map);

  rebuildLegend(); // optional
}




//----ADD CANONICAL STORE HERE----//
function cleanValue(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.toLowerCase() === "none") return null;
  return s;
}


function buildGroceryPopupHTML(p) {
  const name = p.store_name_final ? esc(p.store_name_final) : "Grocery Store";

  const regionText = p.region ? esc(p.region) : null;

const iconKeyRaw = p.icon_key ? String(p.icon_key).trim() : "";
const iconKey = iconKeyRaw ? esc(iconKeyRaw.toLowerCase()) : null;

const iconHtml = iconKey
  ? `<img class="popup-flag" src="icons/${iconKey}.png" alt="${iconKey}">`
  : "";

  const recipesRaw = p.recipes_out ? String(p.recipes_out) : "";
  const hasRecommended = Boolean(cleanValue(p.recipes_out));
  const recipesHtml = recipesRaw ? renderRecipeLinks(recipesRaw, hasRecommended) : "";

  const flyer = p.flyer_url_final || null;
  const ordering = p.ordering_url || null;
  const directions = p.directions_url || null;

  const notes = p.notes_final ? esc(p.notes_final) : "";

const addressRaw = cleanValue(p.address_full);

const addressHtml = (() => {
  if (!addressRaw) return "";

  const s = String(addressRaw).replace(/\r/g, "").trim();

  // Split on newline if present, otherwise commas
  const parts = s.includes("\n")
    ? s.split("\n").map(x => x.trim()).filter(Boolean)
    : s.split(",").map(x => x.trim()).filter(Boolean);

  if (!parts.length) return "";

  // Assume last part looks like: "ON M1G 1R2"
  const last = parts[parts.length - 1] || "";
  const m = last.match(/^([A-Za-z]{2})\s+(.+)$/);
  const prov = m ? m[1] : "";
  const postal = m ? m[2] : "";

  // City is usually the second-last part if we have at least 2 parts
  const city = parts.length >= 2 ? parts[parts.length - 2] : "";

  // Everything before city+provPostal is the street/address line
  const streetParts = parts.slice(0, Math.max(0, parts.length - 2));
  const street = streetParts.join(", ");

  const lines = [];
  if (street) lines.push(street);

  // Put City + Province on the same line (like the mock)
  if (city && prov) lines.push(`${city} ${prov}`);
  else if (city) lines.push(city);
  else if (prov) lines.push(prov);

  // Postal code on its own line
  if (postal) lines.push(postal);
  else if (last && !prov) lines.push(last);

  return lines.map(line => `<div>${esc(line)}</div>`).join("");
})();



  return `
    <div class="sea-card">
      <div class="sea-header">
        <div class="sea-title">${name}</div>
        ${iconHtml}
      </div>

      <div class="sea-rows">
        ${regionText ? rowHTML("Region:", `<span class="sea-text">${regionText}</span>`) : ""}

        ${recipesHtml ? rowHTML("Recipes:", recipesHtml) : ""}

        ${(flyer || ordering) ? rowHTML("Website:", `
          ${flyer ? `<div>${anchor("Flyers", flyer)}</div>` : ""}
          ${ordering ? `<div>${anchor("Ordering", ordering)}</div>` : ""}
        `) : ""}

        ${notes ? rowHTML("Notes:", `<div class="sea-notes">${notes}</div>`) : ""}
      </div>

      ${directions ? `
  <div class="sea-footer sea-footer--card">
    ${addressHtml ? `<div class="sea-address">${addressHtml}</div>` : `<div></div>`}

    <a class="sea-directions" href="${esc(directions)}" target="_blank" rel="noopener" aria-label="Get directions">
      <span class="sea-dir-icon" aria-hidden="true"></span>
      <span class="sea-dir-label">Get Directions</span>
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

pointToLayer: (feature, latlng, cfg) => {
  const p = feature.properties || {};
  return L.marker(latlng, {
    icon: makeStoreDivIcon(p.icon_key),
    pane: cfg.pane, // ✅ now cfg exists
  });
},

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
  <h3>Ethnic Grocery Stores</h3>

  <div class="legend-filter">
    <div class="legend-filter-label">Filter by region</div>
    <select id="region-filter"></select>
  </div>
`;
  L.DomEvent.disableClickPropagation(div);
  legendContainer = div;
  return div;
};

legendControl.addTo(map);

function rebuildLegend() {
  const select = document.getElementById("region-filter");
  if (!select) return;

  // Rebuild options
  select.innerHTML = "";
  const opts = regionOptions.length ? regionOptions : ["ALL"];

  for (const val of opts) {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = (val === "ALL") ? "All regions" : val;
    opt.selected = (val === regionFilter);
    select.appendChild(opt);
  }

  // Avoid stacking multiple handlers on repeated rebuilds
  select.onchange = null;
  select.onchange = (e) => {
    regionFilter = e.target.value;
    refreshGroceriesLayer();
  };
}

 // -------- Load layers --------
LAYER_CONFIGS.forEach((cfg) => {
  fetch(cfg.url)
    .then((r) => r.json())
    .then((geojson) => {

      // ---- Special handling for groceries (so we can filter it) ----
      if (cfg.id === "groceries") {
        groceriesGeojson = geojson; // store raw data once

        // build region dropdown options once
        const set = new Set();
        geojson.features.forEach(f => {
          const r = (f.properties?.region || "").trim();
          if (r) set.add(r);
        });
        regionOptions = ["ALL", ...Array.from(set).sort()];

        // create the *filtered* layer (based on regionFilter)
        groceriesLayer = buildGroceriesLayer(cfg);

        overlayLayers[cfg.id] = groceriesLayer;
        if (cfg.defaultVisible) groceriesLayer.addTo(map);

        rebuildLegend();
        return; //
      }

      // ---- Normal handling for other layers ----
  const layer = makeLayerFromGeojson(geojson, cfg);

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
