import React from "react";

type Props = {
  emoji: string;
  level: number;        // 0 = locked
  maxLevel: number;
  size?: number;        // px
  onClick?: () => void;
  title?: string;
};

// A circular badge: emoji centered, ring around it divided into `maxLevel` arcs.
// `level` of those arcs are highlighted (in the accent color); the rest are dim.
// At level 0, the ring is fully dim and the emoji is desaturated.
export default function BadgeCircle({ emoji, level, maxLevel, size = 56, onClick, title }: Props) {
  const stroke = Math.max(3, Math.round(size * 0.08));
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const gap = circumference * 0.03; // gap between arcs
  const arcLen = (circumference - gap * maxLevel) / maxLevel;
  const locked = level === 0;

  // Each arc i starts at fraction (i * (arcLen + gap) + gap/2) of the circumference,
  // starting from the top (12 o'clock) and going clockwise.
  const segments = [];
  for (let i = 0; i < maxLevel; i++) {
    const isOn = i < level;
    const offsetStart = i * (arcLen + gap);
    segments.push(
      <circle
        key={i}
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={isOn ? "var(--accent)" : "var(--border)"}
        strokeWidth={stroke}
        strokeDasharray={`${arcLen} ${circumference - arcLen}`}
        strokeDashoffset={-offsetStart}
        strokeLinecap="round"
      />
    );
  }

  return (
    <button
      type="button"
      className={`badge-circle${locked ? " badge-circle--locked" : ""}${onClick ? " badge-circle--clickable" : ""}`}
      onClick={onClick}
      title={title}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)" }}
      >
        {segments}
      </svg>
      <span className="badge-circle-emoji" style={{ fontSize: size * 0.42 }}>
        {emoji}
      </span>
    </button>
  );
}
