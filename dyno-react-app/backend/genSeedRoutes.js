// Regenerates seedRoutes.json — the drive paths seedDev.js attaches to seeded
// "drove" experiences. Hits public APIs, so it's run by hand, not on every seed:
//
//   node genSeedRoutes.js
//
// Road geometry + per-segment durations come from the OSRM demo server;
// elevations come from Open-Meteo, the same source the backend uses.

const fs = require("fs");
const path = require("path");

const MAX_POINTS = 150;

// [key, display name, waypoints as [lat, lng]]. Keys match PLACES in seedDev.js.
const ROUTES = [
  ["dragon", "Tail of the Dragon (US-129)", [[35.4676, -83.9207], [35.5215, -84.0088]]],
  ["la", "PCH → Malibu Canyon → Mulholland", [[34.0259, -118.7798], [34.0365, -118.687], [34.1001, -118.714]]],
  ["road", "Braselton backroads from Road Atlanta", [[34.1487, -83.8156], [34.2201, -83.8771], [34.1712, -83.9605]]],
  ["sav", "Savannah → Tybee Island (US-80)", [[32.0809, -81.0912], [32.015, -80.845]]],
  ["atl", "Downtown Atlanta → Stone Mountain", [[33.749, -84.388], [33.8053, -84.1455]]],
  ["nyc", "Brooklyn → Prospect Park", [[40.6782, -73.9442], [40.6602, -73.969]]],
];

async function osrm(waypoints) {
  const coords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(";");
  const resp = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&annotations=duration`);
  const data = await resp.json();
  if (data.code !== "Ok") throw new Error(`OSRM: ${data.code}`);
  const route = data.routes[0];
  const durations = route.legs.flatMap((l) => l.annotation.duration);
  // Cumulative seconds from the start, one per geometry point.
  const offsets = [0];
  for (const d of durations) offsets.push(offsets[offsets.length - 1] + d);
  const points = route.geometry.coordinates.map(([lng, lat], i) => ({ lat, lng, s: Math.round(offsets[i] ?? offsets[offsets.length - 1]) }));
  return { distanceM: Math.round(route.distance), points };
}

function downsample(points, n) {
  if (points.length <= n) return points;
  const step = (points.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => points[Math.round(i * step)]);
}

async function elevations(points) {
  const out = [];
  for (let i = 0; i < points.length; i += 100) {
    const chunk = points.slice(i, i + 100);
    const params = new URLSearchParams({
      latitude: chunk.map((p) => p.lat).join(","),
      longitude: chunk.map((p) => p.lng).join(","),
    });
    // The free tier rate-limits bursts; back off and retry.
    let data;
    for (let attempt = 0; attempt < 5; attempt++) {
      data = await (await fetch(`https://api.open-meteo.com/v1/elevation?${params}`)).json();
      if (Array.isArray(data.elevation)) break;
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
    }
    if (!Array.isArray(data.elevation)) throw new Error(`Open-Meteo: ${data.reason ?? "no elevation"}`);
    out.push(...data.elevation);
  }
  return out;
}

function summarize(eles) {
  let gainM = 0, lossM = 0;
  for (let i = 1; i < eles.length; i++) {
    const d = eles[i] - eles[i - 1];
    if (d > 0) gainM += d; else lossM -= d;
  }
  return { gainM: Math.round(gainM), lossM: Math.round(lossM), minM: Math.min(...eles), maxM: Math.max(...eles) };
}

async function run() {
  const out = {};
  for (const [key, name, waypoints] of ROUTES) {
    const { distanceM, points } = await osrm(waypoints);
    const route = downsample(points, MAX_POINTS).map((p) => ({ lat: +p.lat.toFixed(5), lng: +p.lng.toFixed(5), s: p.s }));
    const eles = await elevations(route);
    route.forEach((p, i) => { p.ele = eles[i]; });
    out[key] = { name, distanceM, elevation: summarize(eles), route };
    console.log(`${key}: ${(distanceM / 1000).toFixed(1)} km, ${route.length} pts, +${out[key].elevation.gainM}/-${out[key].elevation.lossM} m`);
  }
  fs.writeFileSync(path.join(__dirname, "seedRoutes.json"), JSON.stringify(out) + "\n");
}

run().catch((err) => { console.error(err.message); process.exitCode = 1; });
