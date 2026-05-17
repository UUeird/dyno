import React from "react";

function starPath(cx: number, cy: number, outerR: number, innerR: number): string {
  // We start the path at vertex 9 (the inner concave vertex at the left base
  // of the top-facing point), so that any dash drawn from path position 0
  // begins exactly there and runs clockwise through vertex 0 (top tip), then
  // vertex 1 (right base of top point), and so on.
  let d = "";
  for (let i = 0; i < 10; i++) {
    const v = (9 + i) % 10;
    const angleDeg = (v * 360) / 10;
    const r = v % 2 === 0 ? outerR : innerR;
    const rad = (angleDeg * Math.PI) / 180;
    const x = cx + r * Math.sin(rad);
    const y = cy - r * Math.cos(rad);
    d += `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  return d + "Z";
}

function computePerimeter(outerR: number, innerR: number): number {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (i * 360) / 10;
    const r = i % 2 === 0 ? outerR : innerR;
    const rad = (angle * Math.PI) / 180;
    xs.push(r * Math.sin(rad));
    ys.push(-r * Math.cos(rad));
  }
  let p = 0;
  for (let i = 0; i < 10; i++) {
    const j = (i + 1) % 10;
    p += Math.hypot(xs[j] - xs[i], ys[j] - ys[i]);
  }
  return p;
}

const STAR_PATH = starPath(12, 12, 10, 4);
const PERIMETER = computePerimeter(10, 4);
// Path origin is at vertex 9 (left base of the top-facing point), so the
// bright stroke naturally starts there and runs clockwise. Rating 0.5 lights
// vertex 9 → 0 (left edge of top point); rating 1.0 lights vertex 9 → 0 → 1
// (whole top point); higher ratings continue clockwise.
const DASH_OFFSET = 0;

type StarState = "unrated" | "empty" | "filled";

function MiniStar(props: {
  portion: number;
  state: StarState;
  discrete?: boolean;
  fillDelayMs?: number;
}) {
  // Stable ID so the half-star clipPath URL keeps working across rerenders.
  const clipIdRef = React.useRef("star-half-clip-" + Math.random().toString(36).slice(2, 9));

  // In discrete mode, omit empty stars entirely.
  if (props.discrete && props.portion === 0) return null;

  // In discrete mode, a portion strictly between 0 and 1 is rendered as a
  // half-star: the bright stroke draws the full outline but a rectangular
  // clip exposes only the left half (x < 12 in the 24x24 viewBox).
  const isHalf = !!props.discrete && props.portion > 0 && props.portion < 1;

  // Stroke length: full perimeter in discrete mode (clip handles the cut);
  // proportional to portion in continuous mode (compact-source clock-fill).
  const strokeLen = props.discrete ? PERIMETER : props.portion * PERIMETER;

  const glowStyle = {
    strokeDasharray: strokeLen.toFixed(2) + " " + (PERIMETER - strokeLen).toFixed(2),
    strokeDashoffset: DASH_OFFSET.toFixed(2),
    transitionDelay: (props.fillDelayMs || 0) + "ms",
  };

  return (
    <svg
      className={"star-icon star-icon--" + props.state}
      viewBox="0 0 24 24"
      width="22"
      height="22"
    >
      {isHalf && (
        <defs>
          <clipPath id={clipIdRef.current}>
            <rect x="0" y="0" width="12" height="24" />
          </clipPath>
        </defs>
      )}
      <path className="star-icon-base" d={STAR_PATH} />
      {props.state === "filled" && props.portion > 0 && (
        <path
          className="star-icon-glow"
          d={STAR_PATH}
          clipPath={isHalf ? "url(#" + clipIdRef.current + ")" : undefined}
          style={glowStyle}
        />
      )}
    </svg>
  );
}

export default function StarIcon({ rating }: { rating: number | null | undefined }) {
  const [expanded, setExpanded] = React.useState(false);
  const [isTouch, setIsTouch] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const flip = () => setIsTouch(true);
    window.addEventListener("touchstart", flip, { once: true });
    return () => window.removeEventListener("touchstart", flip);
  }, []);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const isUnrated = rating == null;
  const isZero = rating === 0;
  const ratingValue = rating ?? 0;
  const overallState: StarState = isUnrated ? "unrated" : isZero ? "empty" : "filled";
  const canExpand = !isUnrated;

  // Each star's share of the rating (0-1).
  const portions = [0, 1, 2, 3, 4].map((i) =>
    Math.max(0, Math.min(ratingValue - i, 1))
  );

  // Source fill: compact mode compresses the whole rating into one star;
  // expanded mode shows just its share as star #1.
  const sourcePortion = expanded ? portions[0] : ratingValue / 5;

  const handleEnter = () => {
    if (!canExpand || isTouch) return;
    setExpanded(true);
  };

  const handleLeave = () => {
    if (!canExpand || isTouch) return;
    setExpanded(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!canExpand) return;
    e.stopPropagation();
    setExpanded(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setExpanded(false), 2500);
  };

  return (
    <span
      className={`star-icon-wrap${expanded ? " star-icon-wrap--expanded" : ""}`}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onTouchStart={handleTouchStart}
      aria-label={isUnrated ? "Not rated" : `${ratingValue} star rating`}
    >
      <span className="star-icon-anchor">
        <MiniStar
          portion={sourcePortion}
          state={overallState}
          discrete={expanded}
        />
      </span>
      {canExpand && (
        <span className="star-icon-expand-row" aria-hidden={!expanded}>
          {[1, 2, 3, 4].map((i) => {
            if (portions[i] === 0) return null;
            const delayMs = i * 98;
            const spawnStyle = {
              transitionDelay: expanded ? delayMs + "ms" : "0ms",
            };
            return (
              <span key={i} className="star-icon-spawn" style={spawnStyle}>
                <MiniStar
                  portion={portions[i]}
                  state={overallState}
                  discrete={true}
                  fillDelayMs={expanded ? delayMs : 0}
                />
              </span>
            );
          })}
        </span>
      )}
    </span>
  );
}
