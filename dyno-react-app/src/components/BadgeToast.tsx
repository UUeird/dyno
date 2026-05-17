import React from "react";
import { BadgeInfo } from "../types";

export default function BadgeToast({
  badges,
  onDismiss,
}: {
  badges: BadgeInfo[];
  onDismiss: () => void;
}) {
  const [index, setIndex] = React.useState(0);
  const badge = badges[index];

  const handleNext = () => {
    if (index < badges.length - 1) {
      setIndex(index + 1);
    } else {
      onDismiss();
    }
  };

  if (!badge) return null;

  return (
    <div className="badge-toast-overlay" onClick={onDismiss}>
      <div className="badge-toast" onClick={(e) => e.stopPropagation()}>
        <div className="badge-toast-emoji">{badge.emoji}</div>
        <div className="badge-toast-series">{badge.seriesName}</div>
        <div className="badge-toast-name">{badge.name}</div>
        <p className="badge-toast-desc">{badge.description}</p>
        {badges.length > 1 && (
          <div className="badge-toast-progress">
            {badges.map((_, i) => (
              <span key={i} className={`badge-toast-dot${i === index ? " badge-toast-dot--active" : ""}`} />
            ))}
          </div>
        )}
        <button className="badge-toast-btn" onClick={handleNext}>
          {index < badges.length - 1 ? "Next →" : "Nice! 🎉"}
        </button>
      </div>
    </div>
  );
}
