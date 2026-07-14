import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import axios from "axios";
import "./App.css";
import { Car, Manufacturer, Human, Experience, Reaction, BadgeInfo } from "./types";
import ColorPicker from "./components/ColorPicker";
import { getColorOptions } from "./lib/colors";
import BadgeToast from "./components/BadgeToast";
import StarRating from "./components/StarRating";
import FeedView from "./views/FeedView";
import CarsView from "./views/CarsView";
import ProfileView from "./views/ProfileView";
import UserProfileView from "./views/UserProfileView";
import CarModelView from "./views/CarModelView";
import AllBadgesView from "./views/AllBadgesView";
import FollowListView from "./views/FollowListView";
import AdminManufacturersView from "./views/AdminManufacturersView";
import SignInView from "./views/SignInView";
import SignUpView from "./views/SignUpView";
import SearchBar from "./components/SearchBar";
import VersionFooter from "./components/VersionFooter";
import AuthBridge from "./components/AuthBridge";
import { API } from "./lib/api";
import { useAuth, SignedIn, SignedOut, UserButton, RedirectToSignIn } from "./lib/auth";

type ExperienceStep = "choose" | "library" | "vin" | "new-car" | "experience-type" | "location";

const emptyCar = {
  manufacturer: "",
  model: "",
  year: "",
  nickname: "",
  transmission: "",
  // colorInfo is a CarColor | null. We keep it null until the user picks one.
  colorInfo: null as import("./types").CarColor | null,
  trim: "",
  drivetrain: "",
  vin: "",
  owner: "",
};

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
  const [locationDisplay, setLocationDisplay] = useState("");
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "fetching" | "done" | "error">("idle");

  const selectedManufacturer = manufacturers.find((m) => m.name === form.manufacturer);
  const availableModels = selectedManufacturer?.models || [];
  const selectedModel = availableModels.find((m) => m._id === form.model);
  const { options: availableColors } = getColorOptions(selectedModel);
  const allTrims = selectedModel?.trims ?? [];
  const availableDrivetrains = selectedModel?.drivetrains ?? [];
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
      setForm({ ...form, manufacturer: value, model: "", colorInfo: null, trim: "", drivetrain: "" });
    } else if (name === "model") {
      setForm({ ...form, model: value, colorInfo: null, trim: "", drivetrain: "" });
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
      const { manufacturer: _manufacturer, owner, ...rest } = form;
      const { data } = await axios.post(`${API}/cars`, {
        ...rest,
        year: Number(form.year),
      });
      if (owner) {
        const { data: ownership } = await axios.post(`${API}/ownerships`, { car: data._id, owner });
        data.currentOwners = [ownership.owner];
        data.ownershipHistory = [ownership];
      }
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

  const requestLocation = async () => {
    if (!navigator.geolocation) {
      setLocationStatus("error");
      return;
    }
    setLocationStatus("fetching");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setLocationCoords({ lat, lng });
        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
            { headers: { "Accept-Language": "en" } }
          );
          const data = await r.json();
          const a = data.address || {};
          const display = [a.neighbourhood || a.suburb, a.city || a.town || a.village, a.country]
            .filter(Boolean)
            .join(", ");
          setLocationDisplay(display || data.display_name || "");
        } catch {
          setLocationDisplay(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
        setLocationStatus("done");
      },
      () => setLocationStatus("error")
    );
  };

  const submitExperience = async (type: "spotted" | "drove") => {
    if (!selectedCar) return;
    try {
      const location = type === "spotted" && locationDisplay.trim()
        ? { display: locationDisplay.trim(), lat: locationCoords?.lat ?? null, lng: locationCoords?.lng ?? null }
        : undefined;
      const { data } = await axios.post(`${API}/experiences`, {
        car: selectedCar._id,
        type,
        notes: notes.trim() || null,
        rating: type === "drove" ? rating : null,
        location,
      });
      onExperienceCreated(data.newBadges || []);
      onClose();
    } catch {
      onClose();
    }
  };

  const handleSelectExperienceType = (type: "spotted" | "drove") => {
    if (type === "spotted") {
      setStep("location");
    } else {
      submitExperience("drove");
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
            <p className="modal-subtitle modal-subtitle--spaced">VIN lookup coming soon.</p>
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
                {availableModels.map((m) => (
                  <option key={m._id} value={m._id}>{m.name}</option>
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
              {form.manufacturer && form.model && (
                <ColorPicker
                  colors={availableColors}
                  value={form.colorInfo}
                  onChange={(c) => setForm((prev) => ({ ...prev, colorInfo: c }))}
                />
              )}
              {allTrims.length === 0 ? (
                // No trims defined at all for this model — hide the field.
                null
              ) : availableTrims.length === 0 ? (
                // Trims exist for this model but none cover the selected year.
                // Fall back to free-text so users aren't blocked. Backend allows it.
                <input
                  name="trim"
                  placeholder={
                    form.year
                      ? `Trim (optional — no ${form.year} trims registered)`
                      : "Trim (optional)"
                  }
                  value={form.trim}
                  onChange={handleChange}
                />
              ) : (
                <select name="trim" value={form.trim} onChange={handleChange} required>
                  <option value="" disabled>Trim</option>
                  {availableTrims.map((t) => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
              )}
              {availableDrivetrains.length > 0 && (
                <select name="drivetrain" value={form.drivetrain} onChange={handleChange} required>
                  <option value="" disabled>Drivetrain</option>
                  {availableDrivetrains.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              )}
              <input name="vin" placeholder="VIN (optional)" value={form.vin} onChange={handleChange} maxLength={17} />
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
                <div className="experience-options experience-options--spaced">
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

        {step === "location" && selectedCar && (
          <>
            <h2>Where did you spot it?</h2>
            <p className="modal-subtitle">Optional — only visible to you.</p>
            <div className="location-row">
              {locationStatus === "idle" && (
                <button className="btn-location" onClick={requestLocation}>
                  📍 Use my location
                </button>
              )}
              {locationStatus === "fetching" && (
                <p className="location-status">Getting location…</p>
              )}
              {locationStatus === "error" && (
                <p className="location-status location-status--error">Couldn't get location.</p>
              )}
              {(locationStatus === "done" || locationStatus === "error") && (
                <input
                  className="location-input"
                  placeholder="e.g. Brooklyn, NY"
                  value={locationDisplay}
                  onChange={(e) => setLocationDisplay(e.target.value)}
                />
              )}
              {locationStatus === "idle" && (
                <input
                  className="location-input"
                  placeholder="Or type a location…"
                  value={locationDisplay}
                  onChange={(e) => setLocationDisplay(e.target.value)}
                />
              )}
            </div>
            <div className="experience-options experience-options--spaced">
              <button className="experience-option" onClick={() => { setLocationDisplay(""); setLocationCoords(null); setLocationStatus("idle"); submitExperience("spotted"); }}>
                <span className="option-label">Skip</span>
                <span className="option-desc">Log without location</span>
              </button>
              <button className="experience-option experience-option--primary" onClick={() => submitExperience("spotted")}>
                <span className="option-icon">👀</span>
                <span className="option-label">Log Spot</span>
                <span className="option-desc">{locationDisplay.trim() || "No location"}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function App() {
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const [cars, setCars] = useState<Car[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [humans, setHumans] = useState<Human[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [friendsExperiences, setFriendsExperiences] = useState<Experience[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [showNewExperience, setShowNewExperience] = useState(false);
  const [pendingBadges, setPendingBadges] = useState<BadgeInfo[]>([]);
  const [currentUser, setCurrentUser] = useState<Human | null>(null);
  const currentUserId = currentUser?._id;

  useEffect(() => {
    axios.get(`${API}/cars`).then((r) => setCars(r.data)).catch(console.error);
    axios.get(`${API}/manufacturers`).then((r) => setManufacturers(r.data)).catch(console.error);
    axios.get(`${API}/humans`).then((r) => setHumans(r.data)).catch(console.error);
    axios.get(`${API}/experiences`).then((r) => setExperiences(r.data)).catch(console.error);
  }, []);

  // Fetch the signed-in user's Human record (provisioned on first call).
  useEffect(() => {
    if (!authLoaded || !isSignedIn) {
      setCurrentUser(null);
      return;
    }
    axios.get(`${API}/me`)
      .then((r) => setCurrentUser(r.data))
      .catch(() => setCurrentUser(null));
  }, [authLoaded, isSignedIn]);

  useEffect(() => {
    if (!currentUserId) {
      setFriendsExperiences([]);
      return;
    }
    axios
      .get(`${API}/follows?follower=${currentUserId}`)
      .then((r) => setFollowing(r.data.map((f: { followee: { _id: string } }) => f.followee._id)))
      .catch(console.error);
    axios
      .get(`${API}/experiences?followedBy=me`)
      .then((r) => setFriendsExperiences(r.data))
      .catch(console.error);
  }, [currentUserId]);

  const handleFollowChange = async (targetId: string, nowFollowing: boolean): Promise<void> => {
    if (!currentUserId) return;
    if (nowFollowing) {
      await axios.post(`${API}/follows`, { followee: targetId });
      setFollowing((prev) => [...prev, targetId]);
    } else {
      await axios.delete(`${API}/follows`, { data: { followee: targetId } });
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
    if (currentUserId) {
      axios.get(`${API}/experiences?followedBy=me`).then((r) => setFriendsExperiences(r.data)).catch(console.error);
    }
    if (newBadges.length > 0) setPendingBadges(newBadges);
  };

  const handleReactionsChange = (experienceId: string, reactions: Reaction[]) => {
    const apply = (e: Experience) => (e._id === experienceId ? { ...e, reactions } : e);
    setExperiences((prev) => prev.map(apply));
    setFriendsExperiences((prev) => prev.map(apply));
  };

  return (
    <BrowserRouter>
      <AuthBridge />
      <div className="app-shell">
        <header className="app-header">
          <NavLink to="/" className="app-logo">Dyno</NavLink>
          <SearchBar />
          {currentUser?.isAdmin && (
            <NavLink to="/admin/manufacturers" className="header-admin-link" title="Admin">
              ⚙️
            </NavLink>
          )}
          <SignedIn>
            <UserButton afterSignOutUrl="/sign-in" />
          </SignedIn>
          <SignedOut>
            <NavLink to="/sign-in" className="header-sign-in">Sign in</NavLink>
          </SignedOut>
        </header>

        <main className="app-main">
          <Routes>
            {/* Clerk renders its multi-step flows within /sign-in/* and /sign-up/* */}
            <Route path="/sign-in/*" element={<SignInView />} />
            <Route path="/sign-up/*" element={<SignUpView />} />
            <Route
              path="/"
              element={
                <FeedView
                  experiences={experiences}
                  friendsExperiences={friendsExperiences}
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
                <>
                  <SignedIn>
                    <ProfileView
                      experiences={experiences}
                      setExperiences={setExperiences}
                      onNewExperience={() => setShowNewExperience(true)}
                      currentUser={currentUser}
                      cars={cars}
                      currentUserId={currentUserId}
                      following={following}
                      onFollowChange={handleFollowChange}
                    />
                  </SignedIn>
                  <SignedOut>
                    <RedirectToSignIn />
                  </SignedOut>
                </>
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
            <Route
              path="/users/:id/followers"
              element={
                <FollowListView
                  mode="followers"
                  currentUserId={currentUserId}
                  following={following}
                  onFollowChange={handleFollowChange}
                />
              }
            />
            <Route
              path="/users/:id/following"
              element={
                <FollowListView
                  mode="following"
                  currentUserId={currentUserId}
                  following={following}
                  onFollowChange={handleFollowChange}
                />
              }
            />
            <Route
              path="/admin/manufacturers"
              element={
                <>
                  <SignedIn>
                    <AdminManufacturersView currentUser={currentUser} />
                  </SignedIn>
                  <SignedOut>
                    <RedirectToSignIn />
                  </SignedOut>
                </>
              }
            />
          </Routes>
        </main>

        <div className="bottom-bar">
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
          <VersionFooter />
        </div>

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
