import React from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { Human, Experience, Car, BadgeInfo } from "../types";
import CarThumbnail from "../components/CarThumbnail";
import ProfileAvatar from "../components/ProfileAvatar";
import FollowButton from "../components/FollowButton";
import BadgeShelf from "../components/BadgeShelf";
import { modelPath } from "../lib/modelSlug";

const API = "http://localhost:5000/api";

interface ProfileData {
  human: Human;
  experiences: Experience[];
  ownedCars: Car[];
  following: Human[];
  followers: Human[];
  badges: BadgeInfo[];
}

export default function UserProfileView({
  currentUserId,
  following,
  onFollowChange,
}: {
  currentUserId?: string;
  following: string[];
  onFollowChange: (targetId: string, nowFollowing: boolean) => Promise<void>;
}) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = React.useState<ProfileData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError("");
    setProfile(null);
    axios
      .get(`${API}/users/${id}/profile`)
      .then((r) => setProfile(r.data))
      .catch(() => setError("Could not load profile."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="view"><p className="empty-state">Loading…</p></div>;
  if (error || !profile) return <div className="view"><p className="empty-state">{error || "Profile not found."}</p></div>;

  const { human, experiences, ownedCars, badges } = profile;
  const isOwnProfile = human._id === currentUserId;
  const isFollowing = following.includes(human._id);

  return (
    <div className="view">
      <button className="modal-back" onClick={() => navigate(-1)}>← Back</button>

      <div className="profile-header">
        <ProfileAvatar human={human} size={72} />
        <div className="profile-header-info">
          <span className="profile-header-name">{human.name}</span>
        </div>
        {!isOwnProfile && currentUserId && (
          <FollowButton
            isFollowing={isFollowing}
            onToggle={() => onFollowChange(human._id, !isFollowing)}
          />
        )}
      </div>

      <BadgeShelf badges={badges ?? []} />

      {ownedCars.length > 0 && (
        <>
          <h2 className="profile-section-heading">Cars</h2>
          <ul className="car-list">
            {ownedCars.map((car) => (
              <li key={car._id} className="car-item">
                <div className="car-item-row">
                  <CarThumbnail car={car} />
                  <span className="car-info">
                    {car.nickname ? (
                      <>
                        <strong>{car.nickname}</strong>{" "}
                        <span className="car-meta">{car.year} {car.manufacturer} {car.model}</span>
                      </>
                    ) : (
                      <>{car.year} {car.manufacturer} {car.model}</>
                    )}
                    {car.transmission && <span className="car-meta"> — {car.transmission}</span>}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="profile-section-heading">Experiences</h2>
      {experiences.length === 0 ? (
        <p className="empty-state">No experiences logged yet.</p>
      ) : (
        <ul className="experience-list">
          {experiences.map((exp) => (
            <li key={exp._id} className="experience-item">
              <CarThumbnail car={exp.car} />
              <span className={`experience-badge experience-badge--${exp.type}`}>
                {exp.type === "spotted" ? "👀 Spotted" : "🏎️ Drove"}
              </span>
              <span className="experience-car">
                {exp.car.year}{" "}
                <Link
                  to={modelPath(exp.car.manufacturer, exp.car.model)}
                  className="model-name-link"
                >
                  {exp.car.manufacturer} {exp.car.model}
                </Link>
              </span>
              <span className="experience-date">
                {new Date(exp.date).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="profile-section-heading">Following</h2>
      {profile.following.length === 0 ? (
        <p className="empty-state">Not following anyone yet.</p>
      ) : (
        <ul className="friends-list">
          {profile.following.map((friend) => {
            if (friend._id === currentUserId) return null;
            const iAmFollowing = following.includes(friend._id);
            return (
              <li
                key={friend._id}
                className="friend-item"
                style={{ cursor: "pointer" }}
                onClick={() => navigate(`/users/${friend._id}`)}
              >
                <ProfileAvatar human={friend} />
                <span className="friend-name">{friend.name}</span>
                {currentUserId && (
                  <FollowButton
                    isFollowing={iAmFollowing}
                    onToggle={() => onFollowChange(friend._id, !iAmFollowing)}
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
