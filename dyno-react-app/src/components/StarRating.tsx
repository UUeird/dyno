import React from "react";

// Renders 5 stars for a given rating value (0–5, multiples of 0.5).
// If onClick is provided, stars are interactive.
export default function StarRating({
  rating,
  onClick,
}: {
  rating: number | null | undefined;
  onClick?: (newRating: number) => void;
}) {
  const stars = [1, 2, 3, 4, 5];

  const handleClick = (star: number) => {
    if (!onClick) return;
    if (rating === star) {
      // Tap same full star → drop to half
      onClick(star - 0.5);
    } else {
      onClick(star);
    }
  };

  const getStarType = (star: number): "full" | "half" | "empty" => {
    if (rating == null) return "empty";
    if (rating >= star) return "full";
    if (rating >= star - 0.5) return "half";
    return "empty";
  };

  return (
    <span className={`star-rating${onClick ? " star-rating--interactive" : ""}`}>
      {stars.map((star) => {
        const type = getStarType(star);
        return (
          <span
            key={star}
            className={`star star--${type}`}
            onClick={onClick ? () => handleClick(star) : undefined}
            aria-label={`${star} star${star !== 1 ? "s" : ""}`}
          >
            {type === "full" ? "★" : type === "half" ? "½" : "☆"}
          </span>
        );
      })}
    </span>
  );
}
