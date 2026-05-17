import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { Car, Experience, Reaction } from "../types";
import CarThumbnail from "../components/CarThumbnail";
import StarIcon from "../components/StarIcon";
import ReactionBar from "../components/ReactionBar";

const API = "http://localhost:5000/api";

interface ModelPageData {
  manufacturer: string;
  model: string;
  cars: Car[];
  experiences: Experience[];
  rating: {
    average: number | null;
    count: number;
    totalExperiences: number;
  };
}

export default function CarModelView({
  currentUserId,
  onReactionsChange,
}: {
  currentUserId?: string;
  onReactionsChange: (experienceId: string, reactions: Reaction[]) => void;
}) {
  const { manufacturer, model } = useParams<{ manufacturer: string; model: string }>();
  const navigate = useNavigate();
  const [data, setData] = React.useState<ModelPageData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!manufacturer || !model) return;
    setLoading(true);
    setError("");
    setData(null);
    axios
      .get(`${API}/models/${manufacturer}/${model}`)
      .then((r) => setData(r.data))
      .catch((err) => {
        if (err.response?.status === 404) setError("This model hasn't been logged yet.");
        else setError("Could not load model.");
      })
      .finally(() => setLoading(false));
  }, [manufacturer, model]);

  if (loading) return <div className="view"><p className="empty-state">Loading…</p></div>;
  if (error || !data) return <div className="view"><p className="empty-state">{error || "Model not found."}</p></div>;

  const { rating } = data;

  return (
    <div className="view">
      <button className="modal-back" onClick={() => navigate(-1)}>← Back</button>

      <div className="model-header">
        <h1 className="model-title">{data.manufacturer} {data.model}</h1>
        <p className="model-subtitle">
          {data.rating.totalExperiences} experience{data.rating.totalExperiences !== 1 ? "s" : ""} on Dyno
        </p>
      </div>

      <div className="model-rating-block">
        {rating.average != null ? (
          <>
            <StarIcon rating={rating.average} />
            <div className="model-rating-details">
              <span className="model-rating-score">{rating.average.toFixed(1)}</span>
              <span className="model-rating-meta">
                out of 5 · {rating.count} rating{rating.count !== 1 ? "s" : ""}
              </span>
            </div>
          </>
        ) : (
          <p className="empty-state">No ratings yet — be the first to rate this model.</p>
        )}
      </div>

      <h2 className="profile-section-heading">Recent Experiences</h2>
      {data.experiences.length === 0 ? (
        <p className="empty-state">No experiences logged for this model yet.</p>
      ) : (
        <ul className="experience-list">
          {data.experiences.map((exp) => (
            <li key={exp._id} className="experience-item">
              <div className="experience-item-main">
                <CarThumbnail car={exp.car} />
                <div className="experience-item-body">
                  <div className="experience-item-row">
                    <span className={`experience-badge experience-badge--${exp.type}`}>
                      {exp.type === "spotted" ? "👀 Spotted" : "🏎️ Drove"}
                    </span>
                    <span className="experience-car">
                      {exp.car.year} {exp.car.manufacturer} {exp.car.model}
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
                    {exp.loggedBy && (
                      <span
                        className="experience-author"
                        style={{ cursor: "pointer" }}
                        onClick={() => navigate(`/users/${exp.loggedBy!._id}`)}
                      >
                        {exp.loggedBy.name}
                      </span>
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

      <h2 className="profile-section-heading">
        {data.cars.length} {data.cars.length === 1 ? "example" : "examples"} on Dyno
      </h2>
      <ul className="car-list">
        {data.cars.map((car) => (
          <li key={car._id} className="car-item">
            <div className="car-item-row">
              <CarThumbnail car={car} />
              <span className="car-info">
                {car.nickname ? (
                  <>
                    <strong>{car.nickname}</strong>{" "}
                    <span className="car-meta">{car.year} {car.trim}</span>
                  </>
                ) : (
                  <>
                    <strong>{car.year}</strong>
                    {car.trim && <span className="car-meta"> {car.trim}</span>}
                  </>
                )}
                {car.currentOwners?.length > 0 && (
                  <span className="car-meta">
                    {" · owned by "}
                    {car.currentOwners.map((o) => o.name).join(", ")}
                  </span>
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
