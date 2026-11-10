import L from "leaflet";
import "leaflet/dist/leaflet.css";

export const ROUTE_COLOR = "#4ade80";
export const START_COLOR = "#4ade80";
export const END_COLOR = "#f87171";

export function addBaseLayer(map: L.Map) {
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);
}

export function endpointMarker(latlng: L.LatLngExpression, color: string) {
  return L.circleMarker(latlng, { radius: 6, color: "#0a0a0a", weight: 2, fillColor: color, fillOpacity: 1 });
}
