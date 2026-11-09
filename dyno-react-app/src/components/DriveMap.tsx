import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Experience } from "../types";

type RoutePoint = NonNullable<Experience["route"]>[number];

export default function DriveMap({ route }: { route: RoutePoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: false,
      scrollWheelZoom: false,
      dragging: !L.Browser.mobile,
      attributionControl: true,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const latlngs = route.map((p) => [p.lat, p.lng] as L.LatLngTuple);
    const line = L.polyline(latlngs, { color: "#4ade80", weight: 4, opacity: 0.9 }).addTo(map);
    const dot = (color: string) => ({ radius: 5, color: "#0a0a0a", weight: 2, fillColor: color, fillOpacity: 1 });
    L.circleMarker(latlngs[0], dot("#4ade80")).addTo(map);
    L.circleMarker(latlngs[latlngs.length - 1], dot("#f87171")).addTo(map);
    map.fitBounds(line.getBounds(), { padding: [16, 16] });

    return () => { map.remove(); };
  }, [route]);

  return <div ref={containerRef} className="drive-map" data-testid="drive-map" />;
}
