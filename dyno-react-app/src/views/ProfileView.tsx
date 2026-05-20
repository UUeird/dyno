import React from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Car, Experience, Human, BadgeInfo, WishlistItem } from "../types";
import CarThumbnail from "../components/CarThumbnail";
import BadgeShelf from "../components/BadgeShelf";
import StarIcon from "../components/StarIcon";
import ProfileHeader from "../components/ProfileHeader";
import { modelPath } from "../lib/modelSlug";
import { API, API_ORIGIN } from "../lib/api";

export default function ProfileView({
  experiences,
  setExperiences,
  onNewExperience,
  currentUser,
  cars,
  currentUserId,
  following,
}: {
  experiences: Experience[];
  setExperiences: React.Dispatch<React.SetStateAction<Experience[]>>;
  onNewExperience: () => void;
  currentUser: Human | null;
  cars: Car[];
  currentUserId?: string;
  following: string[];
  onFollowChange: (targetId: string, nowFollowing: boolean) => Promise<void>;
}) {
  const navigate = useNavigate();
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);
  const [badges, setBadges] = React.useState<BadgeInfo[]>([]);
  const [wishlist, setWishlist] = React.useState<WishlistItem[]>([]);
  const [followingCount, setFollowingCount] = React.useState(0);
  const [followerCount, setFollowerCount] = React.useState(0);

  React.useEffect(() => {
    if (!currentUserId) return;
    axios.get(`${API}/users/${currentUserId}/badges`)
      .then((r) => setBadges(r.data))
      .catch(console.error);
    axios.get(`${API}/users/${currentUserId}/wishlist`)
      .then((r) => setWishlist(r.data))
      .catch(console.error);
    axios.get(`${API}/users/${currentUserId}/profile`)
      .then((r) => {
        setFollowingCount(r.data.following.length);
        setFollowerCount(r.data.followers.length);
      })
      .catch(console.error);
  }, [currentUserId, following]);

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

  const myExperiences = experiences.filter(
    (e) => e.loggedBy?._id === currentUserId
  );
  const myCars = cars.filter((c) =>
    c.ownershipHistory.some((o) => o.owner._id === currentUserId)
  );

  return (
    <div className="view">
      {currentUser && (
        <ProfileHeader
          human={currentUser}
          followingCount={followingCount}
          followerCount={followerCount}
          isOwn={true}
        />
      )}

      {currentUserId && <BadgeShelf badges={badges} userId={currentUserId} />}

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

      <h2 className="profile-section-heading">Want to Drive</h2>
      {wishlist.length === 0 ? (
        <p className="empty-state">Nothing on your wishlist yet.</p>
      ) : (
        <ul className="wishlist-gallery">
          {wishlist.map((item) => {
            const hasRange = item.yearFrom != null || item.yearTo != null;
            const rangeText = hasRange
              ? item.yearFrom != null && item.yearTo != null && item.yearFrom === item.yearTo
                ? `${item.yearFrom}`
                : `${item.yearFrom ?? "any"}–${item.yearTo ?? "any"}`
              : null;
            const imgSrc = item.thumbnailUrl
              ? (item.thumbnailUrl.startsWith("http") ? item.thumbnailUrl : `${API_ORIGIN}${item.thumbnailUrl}`)
              : null;
            return (
              <li key={item._id} className="wishlist-tile">
                <Link
                  to={modelPath(item.manufacturer, item.model)}
                  className="wishlist-tile-link"
                  title={`${item.manufacturer} ${item.model}`}
                >
                  {imgSrc ? (
                    <img src={imgSrc} alt={`${item.manufacturer} ${item.model}`} className="wishlist-tile-img" />
                  ) : (
                    <div className="wishlist-tile-placeholder">
                      <span className="wishlist-tile-placeholder-name">
                        {item.manufacturer} {item.model}
                      </span>
                    </div>
                  )}
                  {rangeText && (
                    <span className="wishlist-tile-year-badge">{rangeText}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

    </div>
  );
}
