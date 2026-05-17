import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import axios from "axios";
import "./App.css";
import { Car, Manufacturer, Human, Experience, Reaction, BadgeInfo, TrimEntry } from "./types";
import ColorPicker from "./components/ColorPicker";
import BadgeToast from "./components/BadgeToast";
import StarRating from "./components/StarRating";
import FeedView from "./views/FeedView";
import CarsView from "./views/CarsView";
import ProfileView from "./views/ProfileView";
import UserProfileView from "./views/UserProfileView";
import CarModelView from "./views/CarModelView";
import AllBadgesView from "./views/AllBadgesView";
import SearchBar from "./components/SearchBar";
import { API } from "./lib/api";

type ExperienceStep = "choose" | "library" | "vin" | "new-car" | "experience-type";

const emptyCar = { manufacturer: "", model: "", year: "", nickname: "", transmission: "", color: "", trim: "", vin: "", owner: "" };

function NewExperienceModal({
  cars,
  manufacturers,
  humans,
  currentUserId,
  onCarCreated,
  onExperienceCreated,
  onClose,
}: {
  cars: Car[];
  manufacturers: Manufacturer[];
  humans: Human[];
  currentUserId?: string;
  onCarCreated: (car: Car) => void;
  onExperienceCreated: (newBadges: BadgeInfo[]) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<ExperienceStep>("choose");
  const [selectedCar, setSelectedCar] = useState<Car | null>(null);
  const [form, setForm] = useState(emptyCar);
  const [formError, setFormError] = useState("");
  const [vin, setVin] = useState("");
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [droveSelected, setDroveSelected] = useState(false);

  const selectedManufacturer = manufacturers.find((m) => m.name === form.manufacturer);
  const availableModels = selectedManufacturer?.models || [];
  const availableColors = selectedManufacturer?.colors
    ? (selectedManufacturer.colors[form.model] ?? selectedManufacturer.colors["*"] ?? [])
    : [];
  const allTrims = selectedManufacturer?.trims?.[form.model] ?? [];
  const availableTrims = (() => {
    if (!form.year || isNaN(Number(form.year))) return allTrims;
    const y = Number(form.year);
    return allTrims.filter((t) =>
      t.years.length === 0 ||
      t.years.some((r) => (r.from === null || r.from <= y) && (r.to === null || r.to >= y))
    );
  })();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormError("");
    if (name === "manufacturer") {
      setForm({ ...form, manufacturer: value, model: "", color: "", trim: "" });
    } else if (name === "model") {
      setForm({ ...form, model: value, color: "", trim: "" });
    } else if (name === "year") {
      setForm({ ...form, year: value, trim: "" });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const handleNewCarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    try {
      const { data } = await axios.post(`${API}/cars`, {
        ...form,
        year: Number(form.year),
        owner: form.owner || null,
      });
      onCarCreated(data);
      setSelectedCar(data);
      setStep("experience-type");
    } catch (error) {
      if (axios.isAxiosError(error) && typeof error.response?.data?.error === "string") {
        setFormError(error.response.data.error);
      } else {
        setFormError("Unable to save car. Please try again.");
      }
    }
  };

  const handleSelectLibraryCar = (car: Car) => {
    setSelectedCar(car);
    setStep("experience-type");
  };

  const handleSelectExperienceType = async (type: "spotted" | "drove") => {
    if (!selectedCar) return;
    try {
      const { data } = await axios.post(`${API}/experiences`, {
        car: selectedCar._id,
        type,
        loggedBy: currentUserId || null,
        notes: notes.trim() || null,
        rating: type === "drove" ? rating : null,
      });
      onExperienceCreated(data.newBadges || []);
      onClose();
    } catch {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>

        {step === "choose" && (
          <>
            <h2>New Experience</h2>
            <p className="modal-subtitle">How do you want to add a car to this experience?</p>
            <div className="experience-options">
              <button className="experience-option" onClick={() => setStep("library")}>
                <span className="option-icon">🚗</span>
                <span className="option-label">Previous car</span>
                <span className="option-desc">Pick from your library</span>
              </button>
              <button className="experience-option" onClick={() => setStep("vin")}>
                <span className="option-icon">🔍</span>
                <span className="option-label">Search by VIN</span>
                <span className="option-desc">Look up a specific vehicle</span>
              </button>
              <button className="experience-option" onClick={() => setStep("new-car")}>
                <span className="option-icon">✚</span>
                <span className="option-label">New car</span>
                <span className="option-desc">Add a car you haven't logged yet</span>
              </button>
            </div>
          </>
        )}

        {step === "library" && (
          <>
            <button className="modal-back" onClick={() => setStep("choose")}>← Back</button>
            <h2>Your Cars</h2>
            {cars.length === 0 ? (
              <p className="modal-subtitle">No cars in your library yet.</p>
            ) : (
              <ul className="library-list">
                {cars.map((car) => (
                  <li key={car._id} className="library-item" onClick={() => handleSelectLibraryCar(car)}>
                    <span>{car.year} {car.manufacturer} {car.model}</span>
                    <span className="library-meta">
                      {car.transmission && <span className="library-transmission">{car.transmission}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {step === "vin" && (
          <>
            <button className="modal-back" onClick={() => setStep("choose")}>← Back</button>
            <h2>Search by VIN</h2>
            <p className="modal-subtitle">Enter a 17-character VIN to look up a vehicle.</p>
            <div className="vin-form">
              <input
                className="vin-input"
                placeholder="e.g. 1HGBH41JXMN109186"
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase())}
                maxLength={17}
              />
              <button className="btn-primary" disabled={vin.length !== 17}>Look up</button>
            </div>
            <p className="modal-subtitle" style={{ marginTop: 16 }}>VIN lookup coming soon.</p>
          </>
        )}

        {step === "new-car" && (
          <>
            <button className="modal-back" onClick={() => setStep("choose")}>← Back</button>
            <h2>Add a New Car</h2>
            <form className="car-form" onSubmit={handleNewCarSubmit}>
              <select name="manufacturer" value={form.manufacturer} onChange={handleChange} required>
                <option value="" disabled hidden>Manufacturer</option>
                {manufacturers.map((m) => (
                  <option key={m._id} value={m.name}>{m.name}</option>
                ))}
              </select>
              <select name="model" value={form.model} onChange={handleChange} required disabled={!form.manufacturer}>
                <option value="" disabled hidden>
                  {form.manufacturer ? "Model" : "Select manufacturer first"}
                </option>
                {availableModels.map((modelName) => (
                  <option key={modelName} value={modelName}>{modelName}</option>
                ))}
              </select>
              <input name="year" placeholder="Year" type="number" value={form.year} onChange={handleChange} required />
              <input name="nickname" placeholder="Nickname (optional)" value={form.nickname} onChange={handleChange} />
              <select name="transmission" value={form.transmission} onChange={handleChange}>
                <option value="" disabled hidden>Select transmission</option>
                <option value="Manual">Manual</option>
                <option value="Automatic">Automatic</option>
                <option value="Electric">Electric</option>
              </select>
              {availableColors.length > 0 && (
                <ColorPicker
                  colors={availableColors}
                  value={form.color}
                  onChange={(name) => setForm((prev) => ({ ...prev, color: name }))}
                />
              )}
              {availableTrims.length > 0 ? (
                <select name="trim" value={form.trim} onChange={handleChange}>
                  <option value="">Trim (optional)</option>
                  {availableTrims.map((t) => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
              ) : (
                <input name="trim" placeholder="Trim (optional)" value={form.trim} onChange={handleChange} />
              )}
              <input name="vin" placeholder="VIN" value={form.vin} onChange={handleChange} maxLength={17} required />
              <select name="owner" value={form.owner} onChange={handleChange}>
                <option value="">Owner (optional)</option>
                {humans.map((h) => (
                  <option key={h._id} value={h._id}>{h.name}</option>
                ))}
              </select>
              {formError && <p className="form-error">{formError}</p>}
              <div className="form-buttons">
                <button type="submit">Next →</button>
              </div>
            </form>
          </>
        )}

        {step === "experience-type" && selectedCar && (
          <>
            <h2>What was this experience?</h2>
            <p className="modal-subtitle">
              {selectedCar.year} {selectedCar.manufacturer} {selectedCar.model}
            </p>
            <textarea
              className="experience-notes-input"
              placeholder="Add a note… (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
            {droveSelected ? (
              <div className="drove-rating-step">
                <p className="modal-subtitle">Rate this drive (optional)</p>
                <StarRating rating={rating} onClick={setRating} />
                <div className="experience-options" style={{ marginTop: 20 }}>
                  <button className="experience-option" onClick={() => { setDroveSelected(false); setRating(null); }}>
                    <span className="option-icon">👀</span>
                    <span className="option-label">Spotted</span>
                    <span className="option-desc">Change to spotted instead</span>
                  </button>
                  <button className="experience-option experience-option--primary" onClick={() => handleSelectExperienceType("drove")}>
                    <span className="option-icon">🏎️</span>
                    <span className="option-label">Log Drive</span>
                    <span className="option-desc">{rating != null ? `${rating} star${rating !== 1 ? "s" : ""}` : "No rating"}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="experience-options">
                <button className="experience-option" onClick={() => handleSelectExperienceType("spotted")}>
                  <span className="option-icon">👀</span>
                  <span className="option-label">Spotted</span>
                  <span className="option-desc">You saw this car in the wild</span>
                </button>
                <button className="experience-option" onClick={() => setDroveSelected(true)}>
                  <span className="option-icon">🏎️</span>
                  <span className="option-label">Drove</span>
                  <span className="option-desc">You got behind the wheel</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function App() {
  const [cars, setCars] = useState<Car[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [humans, setHumans] = useState<Human[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [showNewExperience, setShowNewExperience] = useState(false);
  const [pendingBadges, setPendingBadges] = useState<BadgeInfo[]>([]);

  const currentUser = humans.find((h) => h.email === "sam@samelawrence.com");
  const currentUserId = currentUser?._id;

  useEffect(() => {
    axios.get(`${API}/cars`).then((r) => setCars(r.data)).catch(console.error);
    axios.get(`${API}/manufacturers`).then((r) => setManufacturers(r.data)).catch(console.error);
    axios.get(`${API}/humans`).then((r) => setHumans(r.data)).catch(console.error);
    axios.get(`${API}/experiences`).then((r) => setExperiences(r.data)).catch(console.error);
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    axios
      .get(`${API}/follows?follower=${currentUserId}`)
      .then((r) => setFollowing(r.data.map((f: { followee: { _id: string } }) => f.followee._id)))
      .catch(console.error);
  }, [currentUserId]);

  const handleFollowChange = async (targetId: string, nowFollowing: boolean): Promise<void> => {
    if (!currentUserId) return;
    if (nowFollowing) {
      await axios.post(`${API}/follows`, { follower: currentUserId, followee: targetId });
      setFollowing((prev) => [...prev, targetId]);
    } else {
      await axios.delete(`${API}/follows`, { data: { follower: currentUserId, followee: targetId } });
      setFollowing((prev) => prev.filter((id) => id !== targetId));
    }
  };

  const handleCarCreated = (car: Car) => {
    if (!cars.find((c) => c._id === car._id)) {
      setCars((prev) => [...prev, car]);
    }
  };

  const handleExperienceCreated = (newBadges: BadgeInfo[]) => {
    axios.get(`${API}/experiences`).then((r) => setExperiences(r.data)).catch(console.error);
    if (newBadges.length > 0) setPendingBadges(newBadges);
  };

  const handleReactionsChange = (experienceId: string, reactions: Reaction[]) => {
    setExperiences((prev) =>
      prev.map((e) => (e._id === experienceId ? { ...e, reactions } : e))
    );
  };

  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="app-header">
          <NavLink to="/" className="app-logo">Dyno</NavLink>
          <SearchBar />
        </header>

        <main className="app-main">
          <Routes>
            <Route
              path="/"
              element={
                <FeedView
                  experiences={experiences}
                  currentUserId={currentUserId}
                  following={following}
                  onReactionsChange={handleReactionsChange}
                />
              }
            />
            <Route
              path="/cars"
              element={
                <CarsView
                  cars={cars}
                  manufacturers={manufacturers}
                  humans={humans}
                  setCars={setCars}
                  currentUserId={currentUserId}
                />
              }
            />
            <Route
              path="/profile"
              element={
                <ProfileView
                  experiences={experiences}
                  setExperiences={setExperiences}
                  onNewExperience={() => setShowNewExperience(true)}
                  humans={humans}
                  cars={cars}
                  currentUserId={currentUserId}
                  following={following}
                  onFollowChange={handleFollowChange}
                />
              }
            />
            <Route
              path="/users/:id"
              element={
                <UserProfileView
                  currentUserId={currentUserId}
                  following={following}
                  onFollowChange={handleFollowChange}
                />
              }
            />
            <Route
              path="/cars/:manufacturer/:model"
              element={
                <CarModelView
                  currentUserId={currentUserId}
                  onReactionsChange={handleReactionsChange}
                />
              }
            />
            <Route
              path="/badges"
              element={<AllBadgesView currentUserId={currentUserId} />}
            />
            <Route
              path="/users/:id/badges"
              element={<AllBadgesView currentUserId={currentUserId} />}
            />
          </Routes>
        </main>

        <nav className="tab-bar">
          <NavLink to="/" end className={({ isActive }) => isActive ? "tab-item tab-item--active" : "tab-item"}>
            <span className="tab-icon">📡</span>
            <span className="tab-label">Feed</span>
          </NavLink>
          <NavLink to="/cars" className={({ isActive }) => isActive ? "tab-item tab-item--active" : "tab-item"}>
            <span className="tab-icon">🚗</span>
            <span className="tab-label">Cars</span>
          </NavLink>
          <NavLink to="/profile" className={({ isActive }) => isActive ? "tab-item tab-item--active" : "tab-item"}>
            <span className="tab-icon">👤</span>
            <span className="tab-label">Profile</span>
          </NavLink>
        </nav>

        {showNewExperience && (
          <NewExperienceModal
            cars={cars}
            manufacturers={manufacturers}
            humans={humans}
            currentUserId={currentUserId}
            onCarCreated={handleCarCreated}
            onExperienceCreated={handleExperienceCreated}
            onClose={() => setShowNewExperience(false)}
          />
        )}
        {pendingBadges.length > 0 && (
          <BadgeToast
            badges={pendingBadges}
            onDismiss={() => setPendingBadges([])}
          />
        )}
      </div>
    </BrowserRouter>
  );
}

export default App;
