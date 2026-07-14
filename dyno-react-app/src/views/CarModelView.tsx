import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { Car, Experience, Reaction } from "../types";
import CarThumbnail from "../components/CarThumbnail";
import StarIcon from "../components/StarIcon";
import ReactionBar from "../components/ReactionBar";
import ExperienceVehicleLabel from "../components/ExperienceVehicleLabel";
import { API } from "../lib/api";

interface ModelPageData {
  manufacturer: string;
  model: string;
  modelId: string;
  cars: Car[];
  experiences: Experience[];
  rating: {
    average: number | null;
    count: number;
    totalExperiences: number;
  };
  wishlist: {
    count: number;
    wishlisted: boolean;
    item: { yearFrom: number | null; yearTo: number | null } | null;
    drivenYears: number[];
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
    let cancelled = false;
    setLoading(true);
    setError("");
    setData(null);
    const url = currentUserId
      ? `${API}/models/${manufacturer}/${model}?userId=${currentUserId}`
      : `${API}/models/${manufacturer}/${model}`;
    axios
      .get(url)
      .then((r) => { if (!cancelled) setData(r.data); })
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status === 404) setError("This model hasn't been logged yet.");
        else setError("Could not load model.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [manufacturer, model, currentUserId]);

  const [showWishlistForm, setShowWishlistForm] = React.useState(false);
  const [yearFromInput, setYearFromInput] = React.useState("");
  const [yearToInput, setYearToInput] = React.useState("");
  const [wishlistError, setWishlistError] = React.useState("");

  const removeFromWishlist = async () => {
    if (!data || !currentUserId) return;
    await axios.delete(`${API}/wishlist`, { data: { model: data.modelId } });
    setData((prev) =>
      prev
        ? {
            ...prev,
            wishlist: {
              ...prev.wishlist,
              count: prev.wishlist.count - 1,
              wishlisted: false,
              item: null,
            },
          }
        : prev
    );
  };

  const addToWishlist = async () => {
    if (!data || !currentUserId) return;
    setWishlistError("");
    const yf = yearFromInput.trim() ? parseInt(yearFromInput, 10) : null;
    const yt = yearToInput.trim() ? parseInt(yearToInput, 10) : null;
    if (yf != null && isNaN(yf)) return setWishlistError("Invalid 'from' year");
    if (yt != null && isNaN(yt)) return setWishlistError("Invalid 'to' year");
    if (yf != null && yt != null && yf > yt) return setWishlistError("'From' must be ≤ 'to'");
    try {
      const { data: item } = await axios.post(`${API}/wishlist`, {
        model: data.modelId,
        yearFrom: yf,
        yearTo: yt,
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              wishlist: {
                ...prev.wishlist,
                count: prev.wishlist.count + 1,
                wishlisted: true,
                item: { yearFrom: item.yearFrom, yearTo: item.yearTo },
              },
            }
          : prev
      );
      setShowWishlistForm(false);
      setYearFromInput("");
      setYearToInput("");
    } catch (err: any) {
      if (err.response?.status === 409) {
        setWishlistError("You've already driven a car matching this range.");
      } else {
        setWishlistError("Could not add to wishlist.");
      }
    }
  };

  // Has the user driven any car in this model? (for the "Driven" state when no wishlist exists)
  const userDrivenForModel = data?.wishlist.drivenYears ?? [];
  const hasDrivenAny = userDrivenForModel.length > 0;

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
        <div className="model-wishlist-row">
          {currentUserId && data.wishlist.wishlisted && (
            <button className="btn-wishlist btn-wishlist--active" onClick={removeFromWishlist}>
              ✓ Want to drive
              {data.wishlist.item && (data.wishlist.item.yearFrom || data.wishlist.item.yearTo) && (
                <span className="btn-wishlist-range">
                  {" "}
                  ({data.wishlist.item.yearFrom ?? "any"}–{data.wishlist.item.yearTo ?? "any"})
                </span>
              )}
            </button>
          )}
          {currentUserId && !data.wishlist.wishlisted && hasDrivenAny && !showWishlistForm && (
            <>
              <button className="btn-wishlist btn-wishlist--driven" disabled>
                Driven
              </button>
              <button className="btn-wishlist-add-range" onClick={() => setShowWishlistForm(true)}>
                + Add a year range
              </button>
            </>
          )}
          {currentUserId && !data.wishlist.wishlisted && !hasDrivenAny && !showWishlistForm && (
            <button className="btn-wishlist" onClick={() => setShowWishlistForm(true)}>
              + Want to drive
            </button>
          )}
          {data.wishlist.count > 0 && (
            <span className="wishlist-count">
              {data.wishlist.count} {data.wishlist.count === 1 ? "person wants" : "people want"} to drive this
            </span>
          )}
        </div>
        {showWishlistForm && (
          <div className="wishlist-form">
            <span className="wishlist-form-label">Year range (optional):</span>
            <input
              type="number"
              placeholder="From"
              value={yearFromInput}
              onChange={(e) => setYearFromInput(e.target.value)}
              className="wishlist-year-input"
            />
            <span>–</span>
            <input
              type="number"
              placeholder="To"
              value={yearToInput}
              onChange={(e) => setYearToInput(e.target.value)}
              className="wishlist-year-input"
            />
            <button className="btn-primary" onClick={addToWishlist}>Add</button>
            <button className="btn-cancel" onClick={() => { setShowWishlistForm(false); setWishlistError(""); }}>Cancel</button>
            {wishlistError && <span className="wishlist-error">{wishlistError}</span>}
          </div>
        )}
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
                    <ExperienceVehicleLabel experience={exp} />
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
