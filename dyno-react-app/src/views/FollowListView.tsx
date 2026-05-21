import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { Human } from "../types";
import ProfileAvatar from "../components/ProfileAvatar";
import FollowButton from "../components/FollowButton";
import { API } from "../lib/api";

// Shared list page for /users/:id/followers and /users/:id/following.
// `mode` decides which list the page displays — they share layout, header, and
// per-row rendering.
export default function FollowListView({
  mode,
  currentUserId,
  following,
  onFollowChange,
}: {
  mode: "followers" | "following";
  currentUserId?: string;
  following: string[];
  onFollowChange: (targetId: string, nowFollowing: boolean) => Promise<void>;
}) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [users, setUsers] = React.useState<Human[] | null>(null);
  const [owner, setOwner] = React.useState<Human | null>(null);

  React.useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setUsers(null);
    axios
      .get(`${API}/users/${id}/profile`)
      .then((r) => {
        if (cancelled) return;
        setOwner(r.data.human);
        setUsers(mode === "followers" ? r.data.followers : r.data.following);
      })
      .catch(() => { if (!cancelled) setUsers([]); });
    return () => { cancelled = true; };
  }, [id, mode]);

  const title = mode === "followers" ? "Followers" : "Following";
  const ownerLabel = owner ? (owner.username || owner.name) : "";

  return (
    <div className="view">
      <button className="modal-back" onClick={() => navigate(-1)}>← Back</button>
      <h1 className="model-title">{title}</h1>
      {ownerLabel && <p className="view-subtitle">For {ownerLabel}</p>}

      {users === null ? (
        <p className="empty-state">Loading…</p>
      ) : users.length === 0 ? (
        <p className="empty-state">
          {mode === "followers" ? "No followers yet." : "Not following anyone yet."}
        </p>
      ) : (
        <ul className="friends-list">
          {users.map((u) => {
            const isSelf = u._id === currentUserId;
            const iAmFollowing = following.includes(u._id);
            return (
              <li
                key={u._id}
                className="friend-item"
                onClick={() => navigate(`/users/${u._id}`)}
              >
                <ProfileAvatar human={u} />
                <span className="friend-name">{u.username || u.name}</span>
                {!isSelf && currentUserId && (
                  <FollowButton
                    isFollowing={iAmFollowing}
                    onToggle={() => onFollowChange(u._id, !iAmFollowing)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
