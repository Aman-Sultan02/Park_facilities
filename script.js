// 1. Create the map
const map = L.map("map").setView([33.65, 73.05], 11);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors"
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
const statusEl = document.getElementById("status");
let places = [];   // all parks, in one simple format

// 2. Overpass query (bounding box around Islamabad + Rawalpindi)
const query = `
  [out:json][timeout:25];
  nwr["leisure"~"^(park|garden|recreation_ground|playground)$"](33.45,72.85,33.80,73.30);
  out center tags;`;
const servers = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];

// 3. Fetch from the API (try each server in turn)
async function fetchParks() {
  for (const url of servers) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query)
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      // A busy server may reply OK with no data - treat that as a failure
      if (!json.elements || json.elements.length === 0) throw new Error("Empty result");

      return json.elements.map(el => {
        const t = el.tags || {};
        return {
          name: t.name || "Unnamed",
          type: t.leisure,
          lat: el.lat || el.center.lat,
          lng: el.lon || el.center.lon,
          details: {
            "Address": [t["addr:housenumber"], t["addr:street"], t["addr:suburb"], t["addr:city"]].filter(Boolean).join(", ") || t["addr:full"],
            "Description": t.description,
            "Opening hours": t.opening_hours,
            "Access": t.access,
            "Entry fee": t.fee,
            "Operator": t.operator,
            "Phone": t.phone || t["contact:phone"],
            "Website": t.website || t["contact:website"]
          }
        };
      });
    } catch (err) {
      console.warn("Server failed:", url, err);
    }
  }
  throw new Error("All Overpass servers failed");
}

// Build the popup text for one place
function makePopup(p) {
  let rows = "";
  for (const [label, value] of Object.entries(p.details)) {
    if (value) rows += `<br><b>${label}:</b> ${value}`;
  }
  let location = "loading...";
  if (p.location !== undefined) location = p.location || "not available";
  return `<b>${p.name}</b><br>Type: ${p.type.replace("_", " ")}<br><b>Location:</b> ${location}${rows}`;
}

// Get a location name (road, area, city) from Nominatim when a park is clicked
async function loadLocation(p) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&addressdetails=1&lat=${p.lat}&lon=${p.lng}`;
    const res = await fetch(url);
    const a = (await res.json()).address || {};
    p.location = [a.road, a.neighbourhood || a.suburb || a.quarter, a.city || a.town || a.county]
      .filter(Boolean).join(", ");
  } catch (err) {
    p.location = "";
  }
}

// 4. Draw markers (applies search + filter)
function showMarkers() {
  markerLayer.clearLayers();
  const text = document.getElementById("search").value.toLowerCase();
  const type = document.getElementById("filter").value;

  const shown = places.filter(p =>
    (type === "all" || p.type === type) && p.name.toLowerCase().includes(text)
  );

  shown.forEach(p => {
    const marker = L.circleMarker([p.lat, p.lng], { radius: 7, color: "#1b5e20", fillColor: "#43a047", fillOpacity: 0.8 })
      .bindPopup(() => makePopup(p))
      .addTo(markerLayer);

    // When the popup opens, look up the location name once, then refresh the popup
    marker.on("popupopen", async () => {
      if (p.location === undefined) {
        await loadLocation(p);
        marker.setPopupContent(makePopup(p));
      }
    });
  });
  statusEl.textContent = shown.length + " places shown";
}

// 5. Load data with loading + error handling
async function loadData() {
  try {
    places = await fetchParks();
    showMarkers();
  } catch (err) {
    statusEl.textContent = "Could not load data from the API. Please refresh and try again.";
    statusEl.className = "error";
  }
}

document.getElementById("search").addEventListener("input", showMarkers);
document.getElementById("filter").addEventListener("change", showMarkers);
loadData();
