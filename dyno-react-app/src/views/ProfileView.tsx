import React from "react";
import axios from "axios";
import { Experience, Human } from "../types";

const API = "http://localhost:5000/api";

export default function ProfileView({
  experiences,
  setExperiences,
  onNewExperience,
  humans,
  currentUserId,
}: {
  experiences: Experience[];
  setExperiences: React.Dispatch<React.SetStateAction<Experience[]>>;
  onNewExperience: () => void;
  humans: Human[];
  currentUserId?: string;
}) {
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);

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

  return (
    <div className="view">
      <h2>My Experiences</h2>
      <button className="btn-new-experience" onClick={onNewExperience}>
        + New Experience
      </button>
      {experiences.length === 0 ? (
        <p className="empty-state">No experiences yet. Log one!</p>
      ) : (
        <ul className="experience-list">
          {experiences.map((exp) => (
            <li key={exp._id} className="experience-item">
              <span className={`experience-badge experience-badge--${exp.type}`}>
                {exp.type === "spotted" ? "👀 Spotted" : "🏎️ Drove"}
              </span>
              <span className="experience-car">
                {exp.car.year} {exp.car.manufacturer} {exp.car.model}
                {exp.car.currentOwners?.length > 0 && (
                  <span className="experience-owner"> · {exp.car.currentOwners.map((o) => o.name).join(", ")}</span>
                )}
              </span>
              <span className="experience-date">
                {new Date(exp.date).toLocaleDateString()}
              </span>
              <div className="car-menu-wrap">
                <button className="btn-menu" onClick={(e) => { e.stopPropagation(); toggleMenu(exp._id); }}>⋯</button>
                {openMenuId === exp._id && (
                  <div className="car-menu">
                    <button className="car-menu-delete" onClick={() => handleDelete(exp._id)}>Delete</button>
                  </div>
                )}
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
            {friends.map((friend) => (
              <li key={friend._id} className="friend-item">
                <span className="friend-avatar">{friend.name.charAt(0).toUpperCase()}</span>
                <span className="friend-name">{friend.name}</span>
                {friend.email && <span className="friend-email">{friend.email}</span>}
              </li>
            ))}
          </ul>
        );
      })()}
    </div>
  );
}
