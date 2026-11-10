import { useMemo, useState } from "react";
import { Experience } from "../types";

type RoutePoint = NonNullable<Experience["route"]>[number];
type Summary = NonNullable<Experience["elevation"]>;

const W = 1000;
const H = 100;

function haversineKm(a: RoutePoint, b: RoutePoint) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const m = (v: number | null) => (v == null ? "–" : `${Math.round(v)} m`);

export default function ElevationProfile({ route, summary }: { route: RoutePoint[]; summary: Summary }) {
  const [hover, setHover] = useState<number | null>(null);

  const pts = useMemo(() => {
    let dist = 0;
    const out: { km: number; ele: number }[] = [];
    route.forEach((p, i) => {
      if (i > 0) dist += haversineKm(route[i - 1], p);
      if (p.ele != null) out.push({ km: dist, ele: p.ele });
    });
    return out;
  }, [route]);

  if (pts.length < 2) return null;

  const totalKm = pts[pts.length - 1].km || 1;
  const eles = pts.map((p) => p.ele);
  const lo = Math.min(...eles);
  const hi = Math.max(...eles);
  const pad = Math.max((hi - lo) * 0.1, 5);
  const yMin = lo - pad;
  const yMax = hi + pad;
  const x = (km: number) => (km / totalKm) * W;
  const y = (ele: number) => H - ((ele - yMin) / (yMax - yMin)) * H;

  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.km).toFixed(1)},${y(p.ele).toFixed(1)}`).join("");
  const area = `${line}L${W},${H}L0,${H}Z`;

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const km = ((e.clientX - rect.left) / rect.width) * totalKm;
    let best = 0;
    for (let i = 1; i < pts.length; i++) {
      if (Math.abs(pts[i].km - km) < Math.abs(pts[best].km - km)) best = i;
    }
    setHover(best);
  };

  const hp = hover != null ? pts[hover] : null;

  return (
    <div className="elevation" data-testid="elevation-profile">
      <div className="elevation-stats">
        <span>↑ {m(summary.gainM)}</span>
        <span>↓ {m(summary.lossM)}</span>
        <span className="elevation-range">{m(summary.minM)} – {m(summary.maxM)}</span>
        <span className="elevation-dist">{totalKm.toFixed(1)} km</span>
      </div>
      <div
        className="elevation-plot"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Elevation profile: ${m(summary.minM)} to ${m(summary.maxM)}, gain ${m(summary.gainM)}, loss ${m(summary.lossM)} over ${totalKm.toFixed(1)} km`}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <path d={area} className="elevation-area" />
          <path d={line} className="elevation-line" vectorEffect="non-scaling-stroke" />
        </svg>
        {hp && (
          <>
            <div className="elevation-crosshair" style={{ left: `${(hp.km / totalKm) * 100}%` }} />
            <div
              className="elevation-dot"
              style={{ left: `${(hp.km / totalKm) * 100}%`, top: `${(y(hp.ele) / H) * 100}%` }}
            />
            <div
              className={`elevation-tip${hp.km / totalKm > 0.7 ? " elevation-tip--left" : ""}`}
              style={{ left: `${(hp.km / totalKm) * 100}%` }}
            >
              {Math.round(hp.ele)} m · {hp.km.toFixed(1)} km
            </div>
          </>
        )}
      </div>
    </div>
  );
}
