import React from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Manufacturer, Human, TrimEntry, YearRange } from "../types";
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

  // Which manufacturer cards are expanded. Collapsed by default to keep the list scannable.
  const [expandedMfrs, setExpandedMfrs] = React.useState<Record<string, boolean>>({});
  const toggleMfr = (id: string) => setExpandedMfrs((prev) => ({ ...prev, [id]: !prev[id] }));

  // Which (mfrId, model) is currently being trim-edited
  const [openTrims, setOpenTrims] = React.useState<{ mfrId: string; model: string } | null>(null);

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
      <p className="view-subtitle">Add brands, models, and trim/year-range data the new-car form references.</p>

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
            {manufacturers.map((m) => {
              const expanded = !!expandedMfrs[m._id];
              return (
              <li key={m._id} className="admin-mfr-item">
                <button
                  type="button"
                  className="admin-mfr-header"
                  onClick={() => toggleMfr(m._id)}
                  aria-expanded={expanded}
                >
                  <span className="admin-mfr-chevron">{expanded ? "▾" : "▸"}</span>
                  <strong>{m.name}</strong>
                  <span className="section-count">{m.models.length} model{m.models.length === 1 ? "" : "s"}</span>
                </button>
                {expanded && (
                <>
                <ul className="admin-model-rows">
                  {m.models.map((model) => {
                    const isOpen = openTrims?.mfrId === m._id && openTrims?.model === model;
                    const trims = m.trims?.[model] || [];
                    return (
                      <li key={model} className="admin-model-row">
                        <div className="admin-model-row-header">
                          <span className="admin-model-row-name">{model}</span>
                          <span className="section-count">
                            {trims.length} trim{trims.length === 1 ? "" : "s"}
                          </span>
                          <button
                            className="btn-text"
                            onClick={() => setOpenTrims(isOpen ? null : { mfrId: m._id, model })}
                          >
                            {isOpen ? "Close" : "Edit trims"}
                          </button>
                          <button
                            className="admin-model-remove"
                            onClick={() => removeModel(m._id, model)}
                            aria-label={`Remove ${model}`}
                            title={`Remove ${model}`}
                          >
                            ×
                          </button>
                        </div>
                        {isOpen && (
                          <TrimEditor
                            mfrId={m._id}
                            model={model}
                            initialTrims={trims}
                            onSaved={refresh}
                            onError={setError}
                          />
                        )}
                      </li>
                    );
                  })}
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
                </>
                )}
              </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─── Trim editor ──────────────────────────────────────────────────────────────

// Local row state — we keep `from`/`to` as strings so empty inputs round-trip
// correctly (no NaN, no premature null collapse).
type EditableYearRange = { from: string; to: string };
type EditableTrim = { name: string; years: EditableYearRange[] };

function rangeFromApi(y: YearRange): EditableYearRange {
  return { from: y.from == null ? "" : String(y.from), to: y.to == null ? "" : String(y.to) };
}

function trimFromApi(t: TrimEntry): EditableTrim {
  return { name: t.name, years: t.years.length > 0 ? t.years.map(rangeFromApi) : [{ from: "", to: "" }] };
}

function TrimEditor({
  mfrId,
  model,
  initialTrims,
  onSaved,
  onError,
}: {
  mfrId: string;
  model: string;
  initialTrims: TrimEntry[];
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [trims, setTrims] = React.useState<EditableTrim[]>(() => initialTrims.map(trimFromApi));
  const [saving, setSaving] = React.useState(false);

  const updateTrim = (idx: number, patch: Partial<EditableTrim>) => {
    setTrims((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };

  const updateYear = (trimIdx: number, yearIdx: number, patch: Partial<EditableYearRange>) => {
    setTrims((prev) =>
      prev.map((t, i) =>
        i !== trimIdx ? t : { ...t, years: t.years.map((y, j) => (j === yearIdx ? { ...y, ...patch } : y)) }
      )
    );
  };

  const addTrim = () => setTrims((prev) => [...prev, { name: "", years: [{ from: "", to: "" }] }]);
  const removeTrim = (idx: number) => setTrims((prev) => prev.filter((_, i) => i !== idx));
  const addYear = (trimIdx: number) =>
    setTrims((prev) =>
      prev.map((t, i) => (i === trimIdx ? { ...t, years: [...t.years, { from: "", to: "" }] } : t))
    );
  const removeYear = (trimIdx: number, yearIdx: number) =>
    setTrims((prev) =>
      prev.map((t, i) => (i !== trimIdx ? t : { ...t, years: t.years.filter((_, j) => j !== yearIdx) }))
    );

  const save = async () => {
    onError("");
    // Build the API payload. Backend accepts null for blank from/to and validates everything.
    const payload = {
      trims: trims
        .filter((t) => t.name.trim())
        .map((t) => ({
          name: t.name.trim(),
          years: t.years.map((y) => ({
            from: y.from.trim() === "" ? null : Number(y.from),
            to: y.to.trim() === "" ? null : Number(y.to),
          })),
        })),
    };
    setSaving(true);
    try {
      await axios.put(`${API}/manufacturers/${mfrId}/trims/${encodeURIComponent(model)}`, payload);
      onSaved();
    } catch (e: any) {
      onError(e.response?.data?.error || "Failed to save trims");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-trim-editor">
      {trims.length === 0 && <p className="empty-state">No trims yet. Add one to get started.</p>}
      {trims.map((trim, ti) => (
        <div key={ti} className="admin-trim-row">
          <div className="admin-trim-name-row">
            <input
              className="admin-trim-name-input"
              placeholder="Trim name (e.g. Sport, Touring, Type R)"
              value={trim.name}
              onChange={(e) => updateTrim(ti, { name: e.target.value })}
            />
            <button
              className="btn-text btn-danger"
              onClick={() => removeTrim(ti)}
              title="Remove trim"
            >
              Remove
            </button>
          </div>
          <div className="admin-trim-years">
            {trim.years.map((year, yi) => (
              <div key={yi} className="admin-trim-year-row">
                <input
                  type="number"
                  className="admin-year-input"
                  placeholder="From"
                  value={year.from}
                  onChange={(e) => updateYear(ti, yi, { from: e.target.value })}
                />
                <span>–</span>
                <input
                  type="number"
                  className="admin-year-input"
                  placeholder="To (blank = ongoing)"
                  value={year.to}
                  onChange={(e) => updateYear(ti, yi, { to: e.target.value })}
                />
                <button
                  className="admin-model-remove"
                  onClick={() => removeYear(ti, yi)}
                  aria-label="Remove year range"
                  title="Remove year range"
                >
                  ×
                </button>
              </div>
            ))}
            <button className="btn-text" onClick={() => addYear(ti)}>+ Year range</button>
          </div>
        </div>
      ))}
      <div className="admin-trim-actions">
        <button className="btn-text" onClick={addTrim}>+ Add trim</button>
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save trims"}
        </button>
      </div>
    </div>
  );
}
