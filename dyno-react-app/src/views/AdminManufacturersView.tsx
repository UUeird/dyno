import React from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Manufacturer, Human, TrimEntry, YearRange, ModelYearRange } from "../types";
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

  // Which (mfrId, modelId) is currently being trim-edited
  const [openTrims, setOpenTrims] = React.useState<{ mfrId: string; modelId: string } | null>(null);

  // Which (mfrId, modelId) is currently being drivetrain-edited
  const [openDrivetrains, setOpenDrivetrains] = React.useState<{ mfrId: string; modelId: string } | null>(null);

  // Which (mfrId, modelId) is currently being production-year-edited
  const [openYears, setOpenYears] = React.useState<{ mfrId: string; modelId: string } | null>(null);

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

  const removeModel = async (mfrId: string, modelId: string, modelName: string) => {
    if (!window.confirm(`Remove "${modelName}"? This is blocked if any car uses it.`)) return;
    setError("");
    try {
      await axios.delete(`${API}/manufacturers/${mfrId}/models/${modelId}`);
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
                    const isOpen = openTrims?.mfrId === m._id && openTrims?.modelId === model._id;
                    const trims = model.trims || [];
                    const isDrivetrainsOpen = openDrivetrains?.mfrId === m._id && openDrivetrains?.modelId === model._id;
                    const drivetrains = model.drivetrains || [];
                    const isYearsOpen = openYears?.mfrId === m._id && openYears?.modelId === model._id;
                    const years = model.years || [];
                    return (
                      <li key={model._id} className="admin-model-row">
                        <div className="admin-model-row-header">
                          <span className="admin-model-row-name">{model.name}</span>
                          <span className="section-count">
                            {trims.length} trim{trims.length === 1 ? "" : "s"}
                          </span>
                          <button
                            className="btn-text"
                            onClick={() => setOpenTrims(isOpen ? null : { mfrId: m._id, modelId: model._id })}
                          >
                            {isOpen ? "Close" : "Edit trims"}
                          </button>
                          <span className="section-count">
                            {drivetrains.length} drivetrain{drivetrains.length === 1 ? "" : "s"}
                          </span>
                          <button
                            className="btn-text"
                            onClick={() => setOpenDrivetrains(isDrivetrainsOpen ? null : { mfrId: m._id, modelId: model._id })}
                          >
                            {isDrivetrainsOpen ? "Close" : "Edit drivetrains"}
                          </button>
                          <span className="section-count">
                            {years.length} year range{years.length === 1 ? "" : "s"}
                          </span>
                          <button
                            className="btn-text"
                            onClick={() => setOpenYears(isYearsOpen ? null : { mfrId: m._id, modelId: model._id })}
                          >
                            {isYearsOpen ? "Close" : "Edit years"}
                          </button>
                          <button
                            className="admin-model-remove"
                            onClick={() => removeModel(m._id, model._id, model.name)}
                            aria-label={`Remove ${model.name}`}
                            title={`Remove ${model.name}`}
                          >
                            ×
                          </button>
                        </div>
                        {isOpen && (
                          <TrimEditor
                            mfrId={m._id}
                            modelId={model._id}
                            initialTrims={trims}
                            onSaved={refresh}
                            onError={setError}
                          />
                        )}
                        {isDrivetrainsOpen && (
                          <DrivetrainEditor
                            mfrId={m._id}
                            modelId={model._id}
                            initialDrivetrains={drivetrains}
                            onSaved={refresh}
                            onError={setError}
                          />
                        )}
                        {isYearsOpen && (
                          <ModelYearEditor
                            mfrId={m._id}
                            modelId={model._id}
                            initialYears={years}
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
  modelId,
  initialTrims,
  onSaved,
  onError,
}: {
  mfrId: string;
  modelId: string;
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
      await axios.put(`${API}/manufacturers/${mfrId}/trims/${modelId}`, payload);
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

// ─── Drivetrain editor ────────────────────────────────────────────────────────

// Flat option list — no year windows, unlike trims (drivetrain doesn't vary by
// trim or year the way trim availability does).
function DrivetrainEditor({
  mfrId,
  modelId,
  initialDrivetrains,
  onSaved,
  onError,
}: {
  mfrId: string;
  modelId: string;
  initialDrivetrains: string[];
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [drivetrains, setDrivetrains] = React.useState<string[]>(
    initialDrivetrains.length > 0 ? initialDrivetrains : [""]
  );
  const [saving, setSaving] = React.useState(false);

  const updateDrivetrain = (idx: number, value: string) =>
    setDrivetrains((prev) => prev.map((d, i) => (i === idx ? value : d)));
  const addDrivetrain = () => setDrivetrains((prev) => [...prev, ""]);
  const removeDrivetrain = (idx: number) => setDrivetrains((prev) => prev.filter((_, i) => i !== idx));

  const save = async () => {
    onError("");
    const payload = { drivetrains: drivetrains.map((d) => d.trim()).filter(Boolean) };
    setSaving(true);
    try {
      await axios.put(`${API}/manufacturers/${mfrId}/drivetrains/${modelId}`, payload);
      onSaved();
    } catch (e: any) {
      onError(e.response?.data?.error || "Failed to save drivetrains");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-trim-editor">
      {drivetrains.map((d, i) => (
        <div key={i} className="admin-trim-name-row">
          <input
            className="admin-trim-name-input"
            placeholder="Drivetrain (e.g. FWD, RWD, AWD)"
            value={d}
            onChange={(e) => updateDrivetrain(i, e.target.value)}
          />
          <button className="btn-text btn-danger" onClick={() => removeDrivetrain(i)} title="Remove drivetrain">
            Remove
          </button>
        </div>
      ))}
      <div className="admin-trim-actions">
        <button className="btn-text" onClick={addDrivetrain}>+ Add drivetrain</button>
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save drivetrains"}
        </button>
      </div>
    </div>
  );
}

// ─── Model year editor ────────────────────────────────────────────────────────

// Production-year ranges for the model itself — separate from a trim's own
// availability windows. Same {from, to} row shape as trims' year ranges, minus
// the name/features (those are trim-specific).
type EditableModelYearRange = { from: string; to: string };

function modelYearFromApi(y: ModelYearRange): EditableModelYearRange {
  return { from: y.from == null ? "" : String(y.from), to: y.to == null ? "" : String(y.to) };
}

function ModelYearEditor({
  mfrId,
  modelId,
  initialYears,
  onSaved,
  onError,
}: {
  mfrId: string;
  modelId: string;
  initialYears: ModelYearRange[];
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [years, setYears] = React.useState<EditableModelYearRange[]>(() =>
    initialYears.length > 0 ? initialYears.map(modelYearFromApi) : [{ from: "", to: "" }]
  );
  const [saving, setSaving] = React.useState(false);

  const updateYear = (idx: number, patch: Partial<EditableModelYearRange>) =>
    setYears((prev) => prev.map((y, i) => (i === idx ? { ...y, ...patch } : y)));
  const addYear = () => setYears((prev) => [...prev, { from: "", to: "" }]);
  const removeYear = (idx: number) => setYears((prev) => prev.filter((_, i) => i !== idx));

  const save = async () => {
    onError("");
    const payload = {
      years: years
        .filter((y) => y.from.trim() !== "" || y.to.trim() !== "")
        .map((y) => ({
          from: y.from.trim() === "" ? null : Number(y.from),
          to: y.to.trim() === "" ? null : Number(y.to),
        })),
    };
    setSaving(true);
    try {
      await axios.put(`${API}/manufacturers/${mfrId}/years/${modelId}`, payload);
      onSaved();
    } catch (e: any) {
      onError(e.response?.data?.error || "Failed to save years");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-trim-editor">
      <div className="admin-trim-years">
        {years.map((year, i) => (
          <div key={i} className="admin-trim-year-row">
            <input
              type="number"
              className="admin-year-input"
              placeholder="From"
              value={year.from}
              onChange={(e) => updateYear(i, { from: e.target.value })}
            />
            <span>–</span>
            <input
              type="number"
              className="admin-year-input"
              placeholder="To (blank = ongoing)"
              value={year.to}
              onChange={(e) => updateYear(i, { to: e.target.value })}
            />
            <button
              className="admin-model-remove"
              onClick={() => removeYear(i)}
              aria-label="Remove year range"
              title="Remove year range"
            >
              ×
            </button>
          </div>
        ))}
        <button className="btn-text" onClick={addYear}>+ Year range</button>
      </div>
      <div className="admin-trim-actions">
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save years"}
        </button>
      </div>
    </div>
  );
}
