import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import { addBaseLayer, endpointMarker, ROUTE_COLOR, START_COLOR } from "../lib/map";
import { haversineKm } from "../lib/geo";

export type RecordedPoint = { lat: number; lng: number; t: string };

// Kept in localStorage so a reload or tab eviction mid-drive doesn't lose it.
const STORAGE_KEY = "dyno_drive_recording";
const MIN_STEP_M = 10;
const MAX_ACCURACY_M = 50;
const MAX_POINTS = 2000;

type Saved = { startedAt: string; points: RecordedPoint[] };

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function save(s: Saved | null) {
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function downsample(points: RecordedPoint[]) {
  if (points.length <= MAX_POINTS) return points;
  const step = (points.length - 1) / (MAX_POINTS - 1);
  return Array.from({ length: MAX_POINTS }, (_, i) => points[Math.round(i * step)]);
}

function distanceKm(points: RecordedPoint[]) {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversineKm(points[i - 1], points[i]);
  return d;
}

function formatElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

export default function DriveRecorderView({ onFinish }: { onFinish: (points: RecordedPoint[]) => void }) {
  const navigate = useNavigate();
  const resumed = useRef(load());
  const [recording, setRecording] = useState<Saved | null>(resumed.current);
  const [now, setNow] = useState(Date.now());
  const [gps, setGps] = useState<"waiting" | "ok" | "weak" | "denied" | "unsupported">("waiting");
  const [wake, setWake] = useState<"on" | "unsupported">("on");

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);
  const startRef = useRef<L.CircleMarker | null>(null);
  const hereRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false });
    map.setView([39.5, -98.35], 4);
    addBaseLayer(map);
    lineRef.current = L.polyline([], { color: ROUTE_COLOR, weight: 5, opacity: 0.9 }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      startRef.current = null;
      hereRef.current = null;
    };
  }, []);

  useEffect(() => {
    const pts = recording?.points ?? [];
    const map = mapRef.current;
    if (!map || !lineRef.current) return;
    lineRef.current.setLatLngs(pts.map((p) => [p.lat, p.lng] as L.LatLngTuple));
    if (pts.length && !startRef.current) startRef.current = endpointMarker([pts[0].lat, pts[0].lng], START_COLOR).addTo(map);
  }, [recording]);

  // Position tracking runs the whole time the view is open so the map can show
  // where you are before you start; points are only kept while recording.
  const recordingRef = useRef(recording);
  recordingRef.current = recording;
  const lastFixRef = useRef<RecordedPoint | null>(null);
  useEffect(() => {
    if (!navigator.geolocation) { setGps("unsupported"); return; }
    let centered = false;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        setGps(accuracy > MAX_ACCURACY_M ? "weak" : "ok");
        lastFixRef.current = accuracy > MAX_ACCURACY_M ? null : { lat, lng, t: new Date(pos.timestamp).toISOString() };
        const map = mapRef.current;
        if (map) {
          if (!hereRef.current) hereRef.current = L.circleMarker([lat, lng], { radius: 7, color: "#fff", weight: 2, fillColor: "#60a5fa", fillOpacity: 1 }).addTo(map);
          else hereRef.current.setLatLng([lat, lng]);
          if (!centered) { map.setView([lat, lng], 15); centered = true; }
          else map.panTo([lat, lng]);
        }
        const rec = recordingRef.current;
        if (!rec || accuracy > MAX_ACCURACY_M) return;
        const last = rec.points[rec.points.length - 1];
        if (last && haversineKm(last, { lat, lng }) * 1000 < MIN_STEP_M) return;
        const next = { ...rec, points: [...rec.points, { lat, lng, t: new Date(pos.timestamp).toISOString() }] };
        recordingRef.current = next;
        save(next);
        setRecording(next);
      },
      (err) => setGps(err.code === err.PERMISSION_DENIED ? "denied" : "weak"),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Keep the screen awake while recording; browsers drop the lock whenever the
  // page is hidden, so re-request it when it becomes visible again.
  const isRecording = !!recording;
  useEffect(() => {
    if (!isRecording) return;
    if (!("wakeLock" in navigator)) { setWake("unsupported"); return; }
    let lock: WakeLockSentinel | null = null;
    let released = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
        setWake("on");
      } catch {
        setWake("unsupported");
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible" && !released) acquire(); };
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRecording]);

  const start = () => {
    const fix = lastFixRef.current;
    const rec = { startedAt: new Date().toISOString(), points: fix ? [fix] : [] };
    save(rec);
    setRecording(rec);
  };

  const discard = () => {
    if (recording?.points.length && !window.confirm("Discard this drive?")) return;
    save(null);
    navigate("/profile");
  };

  const finish = () => {
    if (!recording) return;
    const pts = downsample(recording.points);
    save(null);
    onFinish(pts);
    navigate("/profile");
  };

  const points = recording?.points ?? [];
  const gpsLabel = {
    waiting: "Waiting for GPS…",
    ok: "GPS locked",
    weak: "Weak GPS signal",
    denied: "Location access is blocked — allow it in your browser settings",
    unsupported: "This browser can't share your location",
  }[gps];

  return (
    <div className="recorder">
      <div ref={containerRef} className="recorder-map" data-testid="recorder-map" />
      <div className="recorder-panel">
        <div className="recorder-stats">
          <div>
            <span className="recorder-stat-value" data-testid="recorder-elapsed">
              {recording ? formatElapsed(now - new Date(recording.startedAt).getTime()) : "0:00"}
            </span>
            <span className="recorder-stat-label">Time</span>
          </div>
          <div>
            <span className="recorder-stat-value" data-testid="recorder-distance">{distanceKm(points).toFixed(2)}</span>
            <span className="recorder-stat-label">km</span>
          </div>
        </div>
        <p className={`recorder-status${gps === "denied" || gps === "unsupported" ? " recorder-status--error" : ""}`} data-testid="recorder-gps">
          {gpsLabel}
        </p>
        {recording && wake === "unsupported" && (
          <p className="recorder-status recorder-status--warn">Your browser can't keep the screen on — keep this page open and the screen unlocked.</p>
        )}
        {recording && wake === "on" && <p className="recorder-status">Screen will stay on while recording</p>}
        <div className="recorder-actions">
          {recording ? (
            <>
              <button className="recorder-btn recorder-btn--secondary" onClick={discard}>Discard</button>
              <button className="recorder-btn" onClick={finish} disabled={points.length < 2}>Finish drive</button>
            </>
          ) : (
            <>
              <button className="recorder-btn recorder-btn--secondary" onClick={discard}>Cancel</button>
              <button className="recorder-btn" onClick={start} disabled={gps === "denied" || gps === "unsupported"}>Start drive</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
