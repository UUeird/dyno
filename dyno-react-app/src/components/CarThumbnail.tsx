import React from "react";
import { Car } from "../types";

function PlaceholderSVG() {
  return (
    <svg viewBox="0 0 80 44" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="20" width="68" height="16" rx="4" fill="#3a3a3a" />
      <path d="M20 20 L26 8 Q28 6 32 6 L50 6 Q54 6 56 8 L62 20 Z" fill="#2e2e2e" />
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

export default function CarThumbnail({ car }: { car?: Car }) {
  const photo = car?.thumbnail;
  const [imgFailed, setImgFailed] = React.useState(false);

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
        <PlaceholderSVG />
      )}
    </div>
  );
}
