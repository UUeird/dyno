import React from "react";
import { Car } from "../types";

// Mix a hex color with black by `amount` (0..1). 0 = the color, 1 = black.
// Used so the placeholder car's "lower body" and "upper hood" read as the same
// paint color but with a touch of depth.
function darken(hex: string, amount: number): string {
  const m = hex.replace("#", "").match(/^([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const t = (c: number) => Math.round(c * (1 - amount));
  const hex2 = (c: number) => c.toString(16).padStart(2, "0");
  return `#${hex2(t(r))}${hex2(t(g))}${hex2(t(b))}`;
}

function PlaceholderSVG({ bodyHex }: { bodyHex?: string }) {
  // If we have a body color, paint both body shapes with shades of it. Otherwise
  // fall back to the original neutral grey palette.
  const lower = bodyHex || "#3a3a3a";
  const upper = bodyHex ? darken(bodyHex, 0.18) : "#2e2e2e";
  return (
    <svg viewBox="0 0 80 44" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="20" width="68" height="16" rx="4" fill={lower} />
      <path d="M20 20 L26 8 Q28 6 32 6 L50 6 Q54 6 56 8 L62 20 Z" fill={upper} />
      <path d="M28 19 L33 9 L49 9 L54 19 Z" fill="#1a3a4a" opacity="0.9" />
      <circle cx="18" cy="36" r="7" fill="#222" />
      <circle cx="18" cy="36" r="3.5" fill="#444" />
      <circle cx="62" cy="36" r="7" fill="#222" />
      <circle cx="62" cy="36" r="3.5" fill="#444" />
      <rect x="70" y="23" width="5" height="4" rx="1" fill="#ffe082" />
      <rect x="5" y="23" width="4" height="4" rx="1" fill="#ef5350" opacity="0.8" />
      <line x1="40" y1="20" x2="40" y2="36" stroke="#444" strokeWidth="0.8" />
    </svg>
  );
}

export default function CarThumbnail({ car }: { car?: Car | null }) {
  const photo = car?.thumbnail;
  const [imgFailed, setImgFailed] = React.useState(false);

  // Only the new structured colorInfo carries a usable hex. Legacy plain-string
  // colors are skipped — the thumbnail just falls back to grey for those.
  const bodyHex = car?.colorInfo?.hex;

  return (
    <div className="car-thumbnail">
      {photo && !imgFailed ? (
        <img
          src={photo.url}
          alt={photo.caption || "Car photo"}
          className="car-thumbnail-img"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <PlaceholderSVG bodyHex={bodyHex} />
      )}
    </div>
  );
}
