import React from "react";
import { Link } from "react-router-dom";
import { useClerk } from "@clerk/clerk-react";
import { Human } from "../types";
import ProfileAvatar from "./ProfileAvatar";

// Header block shared by ProfileView and UserProfileView.
// Renders the avatar + username + clickable follower/following counts.
// On the user's own profile, if Clerk hasn't synced a username yet, shows a
// "Set a username" link that opens Clerk's account management modal.
export default function ProfileHeader({
  human,
  followingCount,
  followerCount,
  isOwn,
  rightSlot,
}: {
  human: Human;
  followingCount: number;
  followerCount: number;
  isOwn: boolean;
  rightSlot?: React.ReactNode; // e.g. FollowButton on other users' profiles
}) {
  const clerk = useClerk();
  const displayHandle = human.username ? `@${human.username}` : human.name;

  return (
    <div className="profile-header">
      <ProfileAvatar human={human} size={72} />
      <div className="profile-header-info">
        <span className="profile-header-name">{displayHandle}</span>
        {isOwn && !human.username && (
          <button
            type="button"
            className="profile-set-username"
            onClick={() => clerk.openUserProfile()}
          >
            Set a username
          </button>
        )}
        <div className="profile-counts">
          <Link to={`/users/${human._id}/following`} className="profile-count">
            <strong>{followingCount}</strong> following
          </Link>
          <Link to={`/users/${human._id}/followers`} className="profile-count">
            <strong>{followerCount}</strong> followers
          </Link>
        </div>
      </div>
      {rightSlot}
    </div>
  );
}
