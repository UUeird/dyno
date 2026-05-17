import React from "react";
import axios from "axios";
import { Reaction } from "../types";
import { API } from "../lib/api";

const EMOJIS = ["🔥", "👀", "🤙"];

export default function ReactionBar({
  experienceId,
  reactions,
  currentUserId,
  onReactionsChange,
}: {
  experienceId: string;
  reactions: Reaction[];
  currentUserId?: string;
  onReactionsChange: (experienceId: string, reactions: Reaction[]) => void;
}) {
  const [loading, setLoading] = React.useState(false);

  const safeReactions = reactions ?? [];

  const myReaction = currentUserId
    ? safeReactions.find((r) => r.human._id === currentUserId)
    : null;

  const counts = EMOJIS.reduce<Record<string, number>>((acc, e) => {
    acc[e] = safeReactions.filter((r) => r.emoji === e).length;
    return acc;
  }, {});

  const handleTap = async (emoji: string) => {
    if (!currentUserId || loading) return;
    setLoading(true);
    try {
      if (myReaction?.emoji === emoji) {
        await axios.delete(`${API}/experiences/${experienceId}/reactions`, {
          data: { human: currentUserId },
        });
        onReactionsChange(experienceId, safeReactions.filter((r) => r.human._id !== currentUserId));
      } else {
        const { data } = await axios.post(`${API}/experiences/${experienceId}/reactions`, {
          human: currentUserId,
          emoji,
        });
        const next = safeReactions.filter((r) => r.human._id !== currentUserId);
        onReactionsChange(experienceId, [...next, data]);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="reaction-bar">
      {EMOJIS.map((emoji) => {
        const count = counts[emoji];
        const mine = myReaction?.emoji === emoji;
        return (
          <button
            key={emoji}
            className={`reaction-btn${mine ? " reaction-btn--active" : ""}${count === 0 ? " reaction-btn--empty" : ""}`}
            onClick={(e) => { e.stopPropagation(); handleTap(emoji); }}
            disabled={loading || !currentUserId}
            title={mine ? "Remove reaction" : undefined}
          >
            <span className="reaction-emoji">{emoji}</span>
            {count > 0 && <span className="reaction-count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
