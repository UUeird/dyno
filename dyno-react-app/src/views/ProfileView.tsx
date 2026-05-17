import React from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { Car, Experience, Human, BadgeInfo } from "../types";
import CarThumbnail from "../components/CarThumbnail";
import ProfileAvatar from "../components/ProfileAvatar";
import FollowButton from "../components/FollowButton";
import BadgeShelf from "../components/BadgeShelf";
import StarIcon from "../components/StarIcon";
import { modelPath } from "../lib/modelSlug";

const API = "http://localhost:5000/api";

export default function ProfileView({
  experiences,
  setExperiences,
  onNewExperience,
  humans,
  cars,
  currentUserId,
  following,
  onFollowChange,
}: {
  experiences: Experience[];
  setExperiences: React.Dispatch<React.SetStateAction<Experience[]>>;
  onNewExperience: () => void;
  humans: Human[];
  cars: Car[];
  currentUserId?: string;
  following: string[];
  onFollowChange: (targetId: string, nowFollowing: boolean) => Promise<void>;
}) {
  const navigate = useNavigate();
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);
  const [badges, setBadges] = React.useState<BadgeInfo[]>([]);

  React.useEffect(() => {
    if (!currentUserId) return;
    axios.get(`${API}/users/${currentUserId}/badges`)
      .then((r) => setBadges(r.data))
      .catch(console.error);
  }, [currentUserId]);

  React.useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openMenuId]);

  const toggleMenu = (id: string) => {
    setOpenMenuId((prev) => (prev === id ? null : id));
  };

  const handleDelete = async (id: string) => {
    setOpenMenuId(null);
    await axios.delete(`${API}/experiences/${id}`);
    setExperiences((prev) => prev.filter((e) => e._id !== id));
  };

  const currentUser = humans.find((h) => h._id === currentUserId);
  const myExperiences = experiences.filter(
    (e) => e.loggedBy?._id === currentUserId
  );
  const myCars = cars.filter((c) =>
    c.ownershipHistory.some((o) => o.owner._id === currentUserId)
  );

  return (
    <div className="view">
      {currentUser && (
        <div className="profile-header">
          <ProfileAvatar human={currentUser} size={72} />
          <div className="profile-header-info">
            <span className="profile-header-name">{currentUser.name}</span>
          </div>
        </div>
      )}

      <BadgeShelf badges={badges} />

      {myCars.length > 0 && (
        <>
          <h2 className="profile-section-heading">Cars</h2>
          <ul className="car-list">
            {myCars.map((car) => (
              <li key={car._id} className="car-item">
                <div className="car-item-row">
                  <CarThumbnail car={car} />
                  <span className="car-info">
                    {car.nickname ? (
                      <>
                        <strong>{car.nickname}</strong>{" "}
                        <span className="car-meta">
                          {car.year} {car.manufacturer} {car.model}
                          {car.trim && ` ${car.trim}`}
                        </span>
                      </>
                    ) : (
                      <>
                        {car.year} {car.manufacturer} {car.model}
                        {car.trim && <span className="car-meta"> {car.trim}</span>}
                      </>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="section-heading-row">
        <h2 className="profile-section-heading">My Experiences</h2>
        <button className="btn-new-experience" onClick={onNewExperience}>+ New</button>
      </div>
      {myExperiences.length === 0 ? (
        <p className="empty-state">No experiences yet. Log one!</p>
      ) : (
        <ul className="experience-list">
          {myExperiences.map((exp) => (
            <li key={exp._id} className="experience-item">
              <div className="experience-item-main">
                <div className="experience-item-body">
                  <div className="experience-item-row">
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
                      {exp.car.currentOwners?.length > 0 && (
                        <span className="experience-owner">
                          {" · "}
                          {exp.car.currentOwners.map((o) => o.name).join(", ")}
                        </span>
                      )}
                    </span>
                    <span className="experience-date">
                      {new Date(exp.date).toLocaleDateString()}
                    </span>
                    <div className="car-menu-wrap">
                      <button
                        className="btn-menu"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMenu(exp._id);
                        }}
                      >
                        ⋯
                      </button>
                      {openMenuId === exp._id && (
                        <div className="car-menu">
                          <button
                            className="car-menu-delete"
                            onClick={() => handleDelete(exp._id)}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {exp.notes && (
                    <p className="experience-notes">{exp.notes}</p>
                  )}
                  {exp.type === "drove" && (
                    <StarIcon rating={exp.rating} />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="profile-section-heading">Friends</h2>
      {(() => {
        const friends = humans.filter((h) => h._id !== currentUserId);
        return friends.length === 0 ? (
          <p className="empty-state">No friends yet.</p>
        ) : (
          <ul className="friends-list">
            {friends.map((friend) => {
              const isFollowing = following.includes(friend._id);
              return (
                <li
                  key={friend._id}
                  className="friend-item"
                  style={{ cursor: "pointer" }}
                  onClick={() => navigate(`/users/${friend._id}`)}
                >
                  <ProfileAvatar human={friend} />
                  <span className="friend-name">{friend.name}</span>
                  <FollowButton
                    isFollowing={isFollowing}
                    onToggle={() => onFollowChange(friend._id, !isFollowing)}
                  />
                </li>
              );
            })}
          </ul>
        );
      })()}
    </div>
  );
}
