import React from "react";
import { Human } from "../types";

export default function ProfileAvatar({ human, size = 40 }: { human: Human; size?: number }) {
  const [failed, setFailed] = React.useState(false);
  if (human.avatarUrl && !failed) {
    return (
      <img
        src={human.avatarUrl}
        alt={human.name}
        className="friend-avatar friend-avatar--photo"
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className="friend-avatar"
      style={{ width: size, height: size, fontSize: size * 0.45, lineHeight: `${size}px` }}
    >
      {human.name.charAt(0).toUpperCase()}
    </span>
  );
}
