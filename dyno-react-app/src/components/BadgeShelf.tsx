import React from "react";
import { BadgeInfo } from "../types";

export default function BadgeShelf({ badges }: { badges: BadgeInfo[] }) {
  const [tooltip, setTooltip] = React.useState<string | null>(null);

  if (badges.length === 0) return null;

  return (
    <div className="badge-shelf">
      {badges.map((badge) => (
        <button
          key={badge.seriesSlug}
          className="badge-pill"
          onMouseEnter={() => setTooltip(badge.seriesSlug)}
          onMouseLeave={() => setTooltip(null)}
          onClick={() => setTooltip(tooltip === badge.seriesSlug ? null : badge.seriesSlug)}
          title={badge.description}
        >
          <span className="badge-pill-emoji">{badge.emoji}</span>
          <span className="badge-pill-name">{badge.name}</span>
          {badge.level > 1 && (
            <span className="badge-pill-level">{"★".repeat(badge.level - 1)}</span>
          )}
          {tooltip === badge.seriesSlug && (
            <div className="badge-tooltip">
              <strong>{badge.seriesName}</strong>
              <span>{badge.description}</span>
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
