import React from "react";

export default function FollowButton({
  isFollowing,
  onToggle,
  disabled,
}: {
  isFollowing: boolean;
  onToggle: () => Promise<void>;
  disabled?: boolean;
}) {
  const [loading, setLoading] = React.useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      await onToggle();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      className={`follow-btn${isFollowing ? " follow-btn--following" : ""}`}
      onClick={handleClick}
      disabled={disabled || loading}
    >
      {loading ? "…" : isFollowing ? "Following" : "Follow"}
    </button>
  );
}
