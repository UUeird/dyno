import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import axios from "axios";
import "./App.css";
import { Car, Manufacturer, Human, Experience } from "./types";
import FeedView from "./views/FeedView";
import CarsView from "./views/CarsView";
import ProfileView from "./views/ProfileView";

const API = "http://localhost:5000/api";

type ExperienceStep = "choose" | "library" | "vin" | "new-car" | "experience-type";

const emptyCar = { manufacturer: "", model: "", year: "", nickname: "", transmission: "", owner: "" };

function NewExperienceModal({
  cars,
  manufacturers,
  humans,
  onCarCreated,
  onExperienceCreated,
  onClose,
}: {
  cars: Car[];
  manufacturers: Manufacturer[];
  humans: Human[];
  onCarCreated: (car: Car) => void;
  onExperienceCreated: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<ExperienceStep>("choose");
  const [selectedCar, setSelectedCar] = useState<Car | null>(null);
  const [form, setForm] = useState(emptyCar);
  const [formError, setFormError] = useState("");
  const [vin, setVin] = useState("");

  const selectedManufacturer = manufacturers.find((m) => m.name === form.manufacturer);
  const availableModels = selectedManufacturer?.models || [];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormError("");
    if (name === "manufacturer") {
      setForm({ ...form, manufacturer: value, model: "" });
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
      await axios.post(`${API}/experiences`, { car: selectedCar._id, type });
      onExperienceCreated();
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
                      {car.owner && <span className="library-owner">{car.owner.name}</span>}
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
              </select>
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
            <div className="experience-options">
              <button className="experience-option" onClick={() => handleSelectExperienceType("spotted")}>
                <span className="option-icon">👀</span>
                <span className="option-label">Spotted</span>
                <span className="option-desc">You saw this car in the wild</span>
              </button>
              <button className="experience-option" onClick={() => handleSelectExperienceType("drove")}>
                <span className="option-icon">🏎️</span>
                <span className="option-label">Drove</span>
                <span className="option-desc">You got behind the wheel</span>
              </button>
            </div>
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
  const [showNewExperience, setShowNewExperience] = useState(false);

  useEffect(() => {
    axios.get(`${API}/cars`).then((r) => setCars(r.data)).catch(console.error);
    axios.get(`${API}/manufacturers`).then((r) => setManufacturers(r.data)).catch(console.error);
    axios.get(`${API}/humans`).then((r) => setHumans(r.data)).catch(console.error);
    axios.get(`${API}/experiences`).then((r) => setExperiences(r.data)).catch(console.error);
  }, []);

  const handleCarCreated = (car: Car) => {
    if (!cars.find((c) => c._id === car._id)) {
      setCars((prev) => [...prev, car]);
    }
  };

  const handleExperienceCreated = () => {
    axios.get(`${API}/experiences`).then((r) => setExperiences(r.data)).catch(console.error);
  };

  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="app-header">
          <span className="app-logo">Dyno</span>
        </header>

        <main className="app-main">
          <Routes>
            <Route path="/" element={<FeedView experiences={experiences} currentUserId={humans.find((h) => h.email === "sam@samelawrence.com")?._id} />} />
            <Route
              path="/cars"
              element={
                <CarsView
                  cars={cars}
                  manufacturers={manufacturers}
                  humans={humans}
                  setCars={setCars}
                  currentUserId={humans.find((h) => h.email === "sam@samelawrence.com")?._id}
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
                  currentUserId={humans.find((h) => h.email === "sam@samelawrence.com")?._id}
                />
              }
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
            onCarCreated={handleCarCreated}
            onExperienceCreated={handleExperienceCreated}
            onClose={() => setShowNewExperience(false)}
          />
        )}
      </div>
    </BrowserRouter>
  );
}

export default App;
