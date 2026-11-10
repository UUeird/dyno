import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import axios from "axios";
import { API } from "../lib/api";
import { addBaseLayer, endpointMarker, END_COLOR, ROUTE_COLOR, START_COLOR } from "../lib/map";

export type PickedRoute = { route: { lat: number; lng: number }[]; distanceM: number; durationS: number };

const DEFAULT_VIEW: { center: L.LatLngTuple; zoom: number } = { center: [39.5, -98.35], zoom: 4 };

export default function RoutePicker({ onChange }: { onChange: (r: PickedRoute | null) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"start" | "end" | "loading" | "done" | "error">("start");
  const [summary, setSummary] = useState("");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: true });
    map.setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom);
    addBaseLayer(map);
    navigator.geolocation?.getCurrentPosition(
      (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 11),
      () => {},
      { timeout: 5000 },
    );

    const layer = L.layerGroup().addTo(map);
    let start: L.LatLng | null = null;
    let request = 0;

    map.on("click", async (e: L.LeafletMouseEvent) => {
      if (!start) {
        layer.clearLayers();
        onChangeRef.current(null);
        start = e.latlng;
        endpointMarker(start, START_COLOR).addTo(layer);
        setStatus("end");
        return;
      }
      const from = start;
      const to = e.latlng;
      start = null;
      endpointMarker(to, END_COLOR).addTo(layer);
      setStatus("loading");
      const id = ++request;
      try {
        const { data } = await axios.get<PickedRoute>(`${API}/route-lookup`, {
          params: { from: `${from.lat},${from.lng}`, to: `${to.lat},${to.lng}` },
        });
        if (id !== request) return;
        const line = L.polyline(data.route.map((p) => [p.lat, p.lng] as L.LatLngTuple), {
          color: ROUTE_COLOR, weight: 4, opacity: 0.9,
        }).addTo(layer);
        map.fitBounds(line.getBounds(), { padding: [24, 24] });
        setSummary(`${(data.distanceM / 1000).toFixed(1)} km · ${Math.max(1, Math.round(data.durationS / 60))} min`);
        setStatus("done");
        onChangeRef.current(data);
      } catch {
        if (id !== request) return;
        layer.clearLayers();
        setStatus("error");
      }
    });

    return () => { map.remove(); };
  }, []);

  const hint = {
    start: "Tap where the drive started",
    end: "Now tap where it ended",
    loading: "Finding the route…",
    done: `${summary} · tap the map to start over`,
    error: "No road route between those points. Tap a new start.",
  }[status];

  return (
    <div className="route-picker">
      <div ref={containerRef} className="route-picker-map" data-testid="route-picker-map" />
      <p className={`route-picker-hint${status === "error" ? " route-picker-hint--error" : ""}`} data-testid="route-picker-hint">
        {hint}
      </p>
    </div>
  );
}
