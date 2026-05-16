import React from "react";
import { Experience } from "../types";
import CarThumbnail from "../components/CarThumbnail";

export default function FeedView({ experiences, currentUserId }: { experiences: Experience[]; currentUserId?: string }) {
  return (
    <div className="view">
      <h2>Feed</h2>
      <p className="view-subtitle">Updates from friends.</p>
      {experiences.length === 0 ? (
        <p className="empty-state">No activity yet.</p>
      ) : (
        <ul className="experience-list">
          {experiences.map((exp) => (
            <li key={exp._id} className="experience-item">
              <CarThumbnail car={exp.car} />
              <span className={`experience-badge experience-badge--${exp.type}`}>
                {exp.type === "spotted" ? "👀 Spotted" : "🏎️ Drove"}
              </span>
              <span className="experience-car">
                {exp.car.year} {exp.car.manufacturer} {exp.car.model}
                {exp.car.currentOwners?.length > 0 && (
                  <span className="experience-owner">
                    {" · "}
                    {exp.car.currentOwners.map((o) =>
                      o._id === currentUserId ? "you" : o.name
                    ).join(", ")}
                  </span>
                )}
              </span>
              <span className="experience-date">
                {new Date(exp.date).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
