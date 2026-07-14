import React from "react";
import { Experience, Reaction } from "../types";
import CarThumbnail from "../components/CarThumbnail";
import ReactionBar from "../components/ReactionBar";
import StarIcon from "../components/StarIcon";
import ExperienceVehicleLabel from "../components/ExperienceVehicleLabel";

type FeedTab = "friends" | "public";

export default function FeedView({
  experiences,
  friendsExperiences,
  currentUserId,
  following,
  onReactionsChange,
}: {
  experiences: Experience[];
  friendsExperiences: Experience[];
  currentUserId?: string;
  following: string[];
  onReactionsChange: (experienceId: string, reactions: Reaction[]) => void;
}) {
  const [activeTab, setActiveTab] = React.useState<FeedTab>("friends");

  const friendsOnly = friendsExperiences.filter(
    (exp) => exp.loggedBy?._id && exp.loggedBy._id !== currentUserId
  );

  const publicExperiences = experiences.filter((exp) => {
    const authorId = exp.loggedBy?._id;
    return !!authorId && authorId !== currentUserId && !following.includes(authorId);
  });

  const activeExperiences = activeTab === "friends" ? friendsOnly : publicExperiences;

  return (
    <div className="view">
      <div className="feed-switcher">
        <button
          className={`feed-switcher-btn${activeTab === "friends" ? " feed-switcher-btn--active" : ""}`}
          onClick={() => setActiveTab("friends")}
        >
          Friends
        </button>
        <button
          className={`feed-switcher-btn${activeTab === "public" ? " feed-switcher-btn--active" : ""}`}
          onClick={() => setActiveTab("public")}
        >
          Public
        </button>
      </div>

      {activeExperiences.length === 0 ? (
        <p className="empty-state">
          {activeTab === "friends"
            ? "No activity from people you follow yet."
            : "Nothing public to show yet."}
        </p>
      ) : (
        <ul className="experience-list">
          {activeExperiences.map((exp) => (
            <li key={exp._id} className="experience-item">
              <div className="experience-item-main">
                <CarThumbnail car={exp.car} />
                <div className="experience-item-body">
                  <div className="experience-item-row">
                    <span className={`experience-badge experience-badge--${exp.type}`}>
                      {exp.type === "spotted" ? "👀 Spotted" : "🏎️ Drove"}
                    </span>
                    <ExperienceVehicleLabel
                      experience={exp}
                      ownerNames={
                        exp.car?.currentOwners?.length
                          ? exp.car.currentOwners.map((o) => (o._id === currentUserId ? "you" : o.name)).join(", ")
                          : undefined
                      }
                    />
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
                    {exp.loggedBy && (
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
