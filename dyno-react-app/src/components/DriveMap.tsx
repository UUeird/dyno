import { useEffect, useRef } from "react";
import L from "leaflet";
import { Experience } from "../types";
import { addBaseLayer, endpointMarker, END_COLOR, ROUTE_COLOR, START_COLOR } from "../lib/map";

type RoutePoint = NonNullable<Experience["route"]>[number];

export default function DriveMap({ route }: { route: RoutePoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: false,
      scrollWheelZoom: false,
      dragging: !L.Browser.mobile,
    });
    addBaseLayer(map);

    const latlngs = route.map((p) => [p.lat, p.lng] as L.LatLngTuple);
    const line = L.polyline(latlngs, { color: ROUTE_COLOR, weight: 4, opacity: 0.9 }).addTo(map);
    endpointMarker(latlngs[0], START_COLOR).addTo(map);
    endpointMarker(latlngs[latlngs.length - 1], END_COLOR).addTo(map);
    map.fitBounds(line.getBounds(), { padding: [16, 16] });

    return () => { map.remove(); };
  }, [route]);

  return <div ref={containerRef} className="drive-map" data-testid="drive-map" />;
}
