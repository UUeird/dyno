import React from "react";
import { Link } from "react-router-dom";
import { Experience, Reaction } from "../types";
import CarThumbnail from "../components/CarThumbnail";
import ReactionBar from "../components/ReactionBar";
import StarIcon from "../components/StarIcon";
import { modelPath } from "../lib/modelSlug";

export default function FeedView({
  experiences,
  currentUserId,
  following,
  onReactionsChange,
}: {
  experiences: Experience[];
  currentUserId?: string;
  following: string[];
  onReactionsChange: (experienceId: string, reactions: Reaction[]) => void;
}) {
  const feedExperiences = experiences.filter((exp) => {
    const authorId = exp.loggedBy?._id;
    if (!authorId) return false;
    return authorId === currentUserId || following.includes(authorId);
  });

  return (
    <div className="view">
      <h2>Feed</h2>
      <p className="view-subtitle">Updates from you and people you follow.</p>
      {feedExperiences.length === 0 ? (
        <p className="empty-state">No activity yet. Follow some friends or log an experience!</p>
      ) : (
        <ul className="experience-list">
          {feedExperiences.map((exp) => (
            <li key={exp._id} className="experience-item">
              <div className="experience-item-main">
                <CarThumbnail car={exp.car} />
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
                          {exp.car.currentOwners
                            .map((o) => (o._id === currentUserId ? "you" : o.name))
                            .join(", ")}
                        </span>
                      )}
                    </span>
                  </div>
                  {exp.notes && (
                    <p className="experience-notes">{exp.notes}</p>
                  )}
                  {exp.type === "drove" && (
                    <StarIcon rating={exp.rating} />
                  )}
                  <div className="experience-item-meta">
                    <span className="experience-date">
                      {new Date(exp.date).toLocaleDateString()}
                    </span>
                    {exp.loggedBy && exp.loggedBy._id !== currentUserId && (
                      <span className="experience-author">{exp.loggedBy.name}</span>
                    )}
                  </div>
                </div>
              </div>
              <ReactionBar
                experienceId={exp._id}
                reactions={exp.reactions}
                currentUserId={currentUserId}
                onReactionsChange={onReactionsChange}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
