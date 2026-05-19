import React from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Manufacturer, Human } from "../types";
import { API } from "../lib/api";

// Admin-only page for managing the manufacturer + model registry. Gated by the
// `isAdmin` flag returned from /api/me — non-admins are redirected to the home page.
export default function AdminManufacturersView({ currentUser }: { currentUser: Human | null }) {
  const navigate = useNavigate();
  const [manufacturers, setManufacturers] = React.useState<Manufacturer[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  // New-manufacturer form
  const [newMfrName, setNewMfrName] = React.useState("");
  const [newMfrModels, setNewMfrModels] = React.useState("");

  // Per-row "add model" inputs, keyed by manufacturer id
  const [modelInputs, setModelInputs] = React.useState<Record<string, string>>({});

  // Redirect non-admins. Wait until currentUser has loaded before deciding.
  React.useEffect(() => {
    if (currentUser === null) return; // still loading
    if (!currentUser.isAdmin) navigate("/");
  }, [currentUser, navigate]);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/manufacturers`);
      setManufacturers(data);
    } catch (e: any) {
      setError(e.response?.data?.error || "Failed to load manufacturers");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  const addManufacturer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const name = newMfrName.trim();
    if (!name) return;
    const models = newMfrModels.split(",").map((s) => s.trim()).filter(Boolean);
    try {
      await axios.post(`${API}/manufacturers`, { name, models });
      setNewMfrName("");
      setNewMfrModels("");
      await refresh();
    } catch (e: any) {
      setError(e.response?.data?.error || "Failed to add manufacturer");
    }
  };

  const addModel = async (mfrId: string) => {
    const model = (modelInputs[mfrId] || "").trim();
    if (!model) return;
    setError("");
    try {
      await axios.patch(`${API}/manufacturers/${mfrId}/models`, { model });
      setModelInputs((prev) => ({ ...prev, [mfrId]: "" }));
      await refresh();
    } catch (e: any) {
      setError(e.response?.data?.error || "Failed to add model");
    }
  };

  const removeModel = async (mfrId: string, model: string) => {
    if (!window.confirm(`Remove "${model}"? This is blocked if any car uses it.`)) return;
    setError("");
    try {
      await axios.delete(`${API}/manufacturers/${mfrId}/models/${encodeURIComponent(model)}`);
      await refresh();
    } catch (e: any) {
      setError(e.response?.data?.error || "Failed to remove model");
    }
  };

  if (currentUser === null) return <div className="view"><p className="empty-state">Loading…</p></div>;
  if (!currentUser.isAdmin) return null; // navigate effect will redirect

  return (
    <div className="view admin-view">
      <h1 className="model-title">Manage Manufacturers</h1>
      <p className="view-subtitle">Add new brands and models for cars that aren't in the registry yet.</p>

      {error && <p className="form-error">{error}</p>}

      <section className="admin-section">
        <h2 className="profile-section-heading">Add a new manufacturer</h2>
        <form className="admin-form" onSubmit={addManufacturer}>
          <input
            placeholder="Manufacturer name (e.g. Lamborghini)"
            value={newMfrName}
            onChange={(e) => setNewMfrName(e.target.value)}
            required
          />
          <input
            placeholder="Initial models, comma-separated (optional)"
            value={newMfrModels}
            onChange={(e) => setNewMfrModels(e.target.value)}
          />
          <button type="submit" className="btn-primary">Add</button>
        </form>
      </section>

      <section className="admin-section">
        <h2 className="profile-section-heading">
          Existing manufacturers <span className="section-count">{manufacturers.length}</span>
        </h2>
        {loading ? (
          <p className="empty-state">Loading…</p>
        ) : (
          <ul className="admin-mfr-list">
            {manufacturers.map((m) => (
              <li key={m._id} className="admin-mfr-item">
                <div className="admin-mfr-header">
                  <strong>{m.name}</strong>
                  <span className="section-count">{m.models.length} model{m.models.length === 1 ? "" : "s"}</span>
                </div>
                <ul className="admin-model-list">
                  {m.models.map((model) => (
                    <li key={model} className="admin-model-pill">
                      <span>{model}</span>
                      <button
                        className="admin-model-remove"
                        onClick={() => removeModel(m._id, model)}
                        aria-label={`Remove ${model}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="admin-add-model-row">
                  <input
                    placeholder="Add a model"
                    value={modelInputs[m._id] || ""}
                    onChange={(e) => setModelInputs((prev) => ({ ...prev, [m._id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addModel(m._id);
                      }
                    }}
                  />
                  <button className="btn-primary" onClick={() => addModel(m._id)}>Add model</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
