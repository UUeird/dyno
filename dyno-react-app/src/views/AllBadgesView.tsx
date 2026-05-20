import React from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { BadgeProgress, Human } from "../types";
import BadgeCircle from "../components/BadgeCircle";
import { API } from "../lib/api";

export default function AllBadgesView({ currentUserId }: { currentUserId?: string }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const userId = id || currentUserId;
  const [progress, setProgress] = React.useState<BadgeProgress[] | null>(null);
  const [human, setHuman] = React.useState<Human | null>(null);
  // When this page is opened via a deep link like /users/:id/badges#drive-count,
  // we scroll the matching item into view and briefly highlight it. The CSS class
  // is removed after ~1.5s.
  const [highlighted, setHighlighted] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setProgress(null);
    Promise.all([
      axios.get(`${API}/users/${userId}/badges/all`),
      axios.get(`${API}/humans`),
    ])
      .then(([progRes, humansRes]) => {
        if (cancelled) return;
        setProgress(progRes.data);
        setHuman(humansRes.data.find((h: Human) => h._id === userId) || null);
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [userId]);

  // After progress loads, if there's a hash in the URL, scroll to it and highlight.
  React.useEffect(() => {
    if (!progress) return;
    const slug = location.hash.replace(/^#/, "");
    if (!slug) return;
    // Defer to next frame so the DOM has the IDs rendered before we query.
    const t = setTimeout(() => {
      const el = document.getElementById(`badge-${slug}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlighted(slug);
        setTimeout(() => setHighlighted(null), 1600);
      }
    }, 50);
    return () => clearTimeout(t);
  }, [progress, location.hash]);

  if (!userId) return <div className="view"><p className="empty-state">No user.</p></div>;
  if (!progress) return <div className="view"><p className="empty-state">Loading…</p></div>;

  const isOwn = userId === currentUserId;

  return (
    <div className="view">
      <button className="modal-back" onClick={() => navigate(-1)}>← Back</button>
      <h1 className="model-title">
        {isOwn ? "Your Badges" : human ? `${human.name}'s Badges` : "Badges"}
      </h1>

      <ul className="all-badges-list">
        {progress.map((p) => {
          const nextLevelDef = p.level < p.maxLevel ? p.levels.find((l) => l.level === p.level + 1) : null;
          const currentLevelDef = p.level > 0 ? p.levels.find((l) => l.level === p.level) : null;
          const displayLevelDef = currentLevelDef || nextLevelDef || p.levels[0];
          const isMaxed = p.level === p.maxLevel;
          const towardNext = p.nextThreshold
            ? Math.min(1, (p.count - p.prevThreshold) / (p.nextThreshold - p.prevThreshold))
            : 1;

          return (
            <li
              key={p.seriesSlug}
              id={`badge-${p.seriesSlug}`}
              className={`all-badges-item${highlighted === p.seriesSlug ? " all-badges-item--highlighted" : ""}`}
            >
              <BadgeCircle
                emoji={displayLevelDef?.emoji || "❓"}
                level={p.level}
                maxLevel={p.maxLevel}
                size={72}
              />
              <div className="all-badges-info">
                <div className="all-badges-header">
                  <h3 className="all-badges-name">{p.seriesName}</h3>
                  <span className="all-badges-level">
                    {p.level === 0 ? "Locked" : `Level ${p.level} of ${p.maxLevel}`}
                  </span>
                </div>
                {currentLevelDef && (
                  <p className="all-badges-current">
                    <strong>{currentLevelDef.name}</strong> — {currentLevelDef.description}
                  </p>
                )}
                {!isMaxed && p.nextThreshold != null && (
                  <>
                    <div className="all-badges-progress-bar">
                      <div
                        className="all-badges-progress-fill"
                        style={{ width: `${towardNext * 100}%` }}
                      />
                    </div>
                    <p className="all-badges-progress-meta">
                      {p.count} / {p.nextThreshold} {p.unit}
                      {nextLevelDef && (
                        <>
                          {" · next: "}
                          <strong>{nextLevelDef.emoji} {nextLevelDef.name}</strong>
                          {" — "}{nextLevelDef.description}
                        </>
                      )}
                    </p>
                  </>
                )}
                {isMaxed && (
                  <p className="all-badges-maxed">🎉 Max level reached</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
