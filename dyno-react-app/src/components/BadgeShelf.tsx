import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { BadgeInfo } from "../types";
import BadgeCircle from "./BadgeCircle";

export default function BadgeShelf({
  badges,
  userId,
}: {
  badges: BadgeInfo[];
  userId: string;
}) {
  const navigate = useNavigate();
  const hasEarned = badges.length > 0;

  return (
    <div className="badge-shelf-wrap">
      {hasEarned ? (
        <div className="badge-shelf">
          {badges.map((b) => (
            <div key={b.seriesSlug} className="badge-shelf-item">
              <BadgeCircle
                emoji={b.emoji}
                level={b.level}
                maxLevel={b.maxLevel}
                title={`${b.seriesName} — ${b.name}`}
                onClick={() => navigate(`/users/${userId}/badges#${b.seriesSlug}`)}
              />
              <span className="badge-shelf-name">{b.seriesName}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-state badge-shelf-empty">No badges earned yet.</p>
      )}
      <Link to={`/users/${userId}/badges`} className="badge-shelf-see-all">
        See all →
      </Link>
    </div>
  );
}
