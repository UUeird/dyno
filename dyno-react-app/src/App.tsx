import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";

const API = "http://localhost:5000/api";

type Car = {
  _id: string;
  year: number;
  manufacturer: string;
  model: string;
  transmission?: string;
};

type Manufacturer = {
  _id: string;
  name: string;
  models: string[];
};

const emptyCar = { manufacturer: "", model: "", year: "", transmission: "" };

function App() {
  const [cars, setCars] = useState<Car[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [form, setForm] = useState(emptyCar);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    axios
      .get(`${API}/cars`)
      .then((response) => setCars(response.data))
      .catch((error) => console.error("Error fetching cars:", error));
    axios
      .get(`${API}/manufacturers`)
      .then((response) => setManufacturers(response.data))
      .catch((error) => console.error("Error fetching manufacturers:", error));
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    if (name === "manufacturer") {
      setFormError("");
      setForm({ ...form, manufacturer: value, model: "" });
      return;
    }
    setFormError("");
    setForm({ ...form, [name]: value });
  };

  const selectedManufacturer = manufacturers.find(
    (manufacturer) => manufacturer.name === form.manufacturer,
  );
  const availableModels = selectedManufacturer?.models || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    const payload = { ...form, year: Number(form.year) };

    try {
      if (editingId) {
        const { data } = await axios.put(`${API}/cars/${editingId}`, payload);
        setCars(cars.map((c) => (c._id === editingId ? data : c)));
        setEditingId(null);
      } else {
        const { data } = await axios.post(`${API}/cars`, payload);
        setCars([...cars, data]);
      }
      setForm(emptyCar);
    } catch (error) {
      if (axios.isAxiosError(error) && typeof error.response?.data?.error === "string") {
        setFormError(error.response.data.error);
      } else {
        setFormError("Unable to save car. Please try again.");
      }
    }
  };

  const startEdit = (car: Car) => {
    setFormError("");
    setEditingId(car._id);
    setForm({
      manufacturer: car.manufacturer,
      model: car.model,
      year: String(car.year),
      transmission: car.transmission || "",
    });
  };

  const cancelEdit = () => {
    setFormError("");
    setEditingId(null);
    setForm(emptyCar);
  };

  const handleDelete = async (id: string) => {
    await axios.delete(`${API}/cars/${id}`);
    setCars(cars.filter((c) => c._id !== id));
  };

  return (
    <div className="App">
      <h1>Dyno</h1>

      <div className="section-container">
        {/* Section 1: Experiences */}
        <div className="section">
          <h2>Experiences</h2>
          <p>Track the cars you've seen, driven, or owned.</p>
        </div>

        {/* Section 2: Cars */}
        <div className="section">
          <h2>Cars</h2>

          <form className="car-form" onSubmit={handleSubmit}>
            <select
              name="manufacturer"
              value={form.manufacturer}
              onChange={handleChange}
              required
            >
              <option value="" disabled hidden>Manufacturer</option>
              {manufacturers.map((m) => (
                <option key={m._id} value={m.name}>{m.name}</option>
              ))}
            </select>
            <select
              name="model"
              value={form.model}
              onChange={handleChange}
              required
              disabled={!form.manufacturer}
            >
              <option value="" disabled hidden>
                {form.manufacturer ? "Model" : "Select manufacturer first"}
              </option>
              {availableModels.map((modelName) => (
                <option key={modelName} value={modelName}>
                  {modelName}
                </option>
              ))}
            </select>
            <input
              name="year"
              placeholder="Year"
              type="number"
              value={form.year}
              onChange={handleChange}
              required
            />
            <select
              name="transmission"
              value={form.transmission}
              onChange={handleChange}
            >
              <option value="" disabled hidden>Transmission</option>
              <option value="Manual">Manual</option>
              <option value="Automatic">Automatic</option>
            </select>
            <div className="form-buttons">
              <button type="submit">{editingId ? "Update" : "Add Car"}</button>
              {editingId && (
                <button type="button" onClick={cancelEdit}>
                  Cancel
                </button>
              )}
            </div>
          </form>
          {formError && <p className="form-error">{formError}</p>}

          {cars.length > 0 ? (
            <ul className="car-list">
              {cars.map((car) => (
                <li key={car._id} className="car-item">
                  <span className="car-info">
                    {car.year} {car.manufacturer} {car.model}
                    {car.transmission && ` — ${car.transmission}`}
                  </span>
                  <span className="car-actions">
                    <button className="btn-edit" onClick={() => startEdit(car)}>
                      Edit
                    </button>
                    <button
                      className="btn-delete"
                      onClick={() => handleDelete(car._id)}
                    >
                      Delete
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No cars available.</p>
          )}
        </div>

        {/* Section 3: Friends */}
        <div className="section">
          <h2>Friends</h2>
          <p>Share your passion with others.</p>
        </div>
      </div>
    </div>
  );
}

export default App;
