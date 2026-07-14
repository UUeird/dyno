import React from "react";
import axios from "axios";
import { Car, CarColor, ColorEntry, TrimEntry, CarModel, Manufacturer, Human, Ownership } from "../types";
import CarThumbnail from "../components/CarThumbnail";
import PhotoManager from "../components/PhotoManager";
import ColorPicker from "../components/ColorPicker";
import { API } from "../lib/api";
import { getColorOptions } from "../lib/colors";

const emptyCar = {
  manufacturer: "",
  model: "",
  year: "",
  nickname: "",
  transmission: "",
  colorInfo: null as CarColor | null,
  trim: "",
  vin: "",
};

type CarsTab = "owned" | "friends" | "all";

function OwnershipManager({ car, humans, onUpdated }: { car: Car; humans: Human[]; onUpdated: (car: Car) => void }) {
  const [addingOwner, setAddingOwner] = React.useState(false);
  const [newOwnerId, setNewOwnerId] = React.useState("");
  const [newFrom, setNewFrom] = React.useState("");
  const [error, setError] = React.useState("");
  // Which ownership row, if any, is currently being edited inline (date pickers).
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editFrom, setEditFrom] = React.useState("");
  const [editTo, setEditTo] = React.useState("");

  const toIsoDate = (d: string | Date | null | undefined) => {
    if (!d) return "";
    const date = typeof d === "string" ? new Date(d) : d;
    return isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  };

  const startEditOwnership = (o: Ownership) => {
    setEditingId(o._id);
    setEditFrom(toIsoDate(o.from));
    setEditTo(toIsoDate(o.to));
    setError("");
  };

  const cancelEditOwnership = () => {
    setEditingId(null);
    setEditFrom("");
    setEditTo("");
    setError("");
  };

  const saveEditOwnership = async (o: Ownership) => {
    setError("");
    if (editFrom && editFrom > todayIso) return setError("Start date cannot be in the future");
    if (editTo && editTo > todayIso) return setError("End date cannot be in the future");
    if (editFrom && editTo && editFrom > editTo) return setError("Start date must be before end date");
    try {
      await axios.put(`${API}/ownerships/${o._id}`, {
        from: editFrom || null,
        to: editTo || null,
      });
    } catch (e: any) {
      setError(e.response?.data?.error || "Failed to update ownership");
      return;
    }
    const { data } = await axios.get(`${API}/cars`);
    const updated = data.find((c: Car) => c._id === car._id);
    if (updated) onUpdated(updated);
    cancelEditOwnership();
  };

  const todayIso = new Date().toISOString().slice(0, 10);
  const currentOwnerships = car.ownershipHistory.filter((o) => !o.to);
  const pastOwnerships = car.ownershipHistory.filter((o) => o.to);

  const handleAdd = async () => {
    if (!newOwnerId) return;
    setError("");
    if (newFrom && newFrom > todayIso) {
      setError("Ownership start date cannot be in the future");
      return;
    }
    try {
      await axios.post(`${API}/ownerships`, { car: car._id, owner: newOwnerId, from: newFrom || null });
    } catch (e: any) {
      setError(e.response?.data?.error || "Failed to add owner");
      return;
    }
    const { data } = await axios.get(`${API}/cars`);
    const updated = data.find((c: Car) => c._id === car._id);
    if (updated) onUpdated(updated);
    setAddingOwner(false);
    setNewOwnerId("");
    setNewFrom("");
  };

  const handleEnd = async (ownership: Ownership) => {
    await axios.patch(`${API}/ownerships/${ownership._id}/end`, {});
    const { data } = await axios.get(`${API}/cars`);
    const updated = data.find((c: Car) => c._id === car._id);
    if (updated) onUpdated(updated);
  };

  const handleRemove = async (ownership: Ownership) => {
    await axios.delete(`${API}/ownerships/${ownership._id}`);
    const { data } = await axios.get(`${API}/cars`);
    const updated = data.find((c: Car) => c._id === car._id);
    if (updated) onUpdated(updated);
  };

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : "unknown";

  return (
    <div className="ownership-manager">
      <p className="ownership-label">Owners</p>
      {currentOwnerships.length > 0 && (
        <ul className="ownership-list">
          {currentOwnerships.map((o) => (
            <li key={o._id} className="ownership-item">
              <span className="ownership-name">{o.owner.name}</span>
              {editingId === o._id ? (
                <OwnershipEditRow
                  fromValue={editFrom}
                  toValue={editTo}
                  onFromChange={setEditFrom}
                  onToChange={setEditTo}
                  onSave={() => saveEditOwnership(o)}
                  onCancel={cancelEditOwnership}
                  maxDate={todayIso}
                  error={error}
                />
              ) : (
                <>
                  <span className="ownership-period ownership-current">current{o.from ? ` · since ${formatDate(o.from)}` : ""}</span>
                  <button className="ownership-action" onClick={() => startEditOwnership(o)}>Edit</button>
                  <button className="ownership-action" onClick={() => handleEnd(o)}>End</button>
                  <button className="ownership-action ownership-remove" onClick={() => handleRemove(o)}>✕</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {pastOwnerships.length > 0 && (
        <ul className="ownership-list ownership-list--past">
          {pastOwnerships.map((o) => (
            <li key={o._id} className="ownership-item ownership-item--past">
              <span className="ownership-name">{o.owner.name}</span>
              {editingId === o._id ? (
                <OwnershipEditRow
                  fromValue={editFrom}
                  toValue={editTo}
                  onFromChange={setEditFrom}
                  onToChange={setEditTo}
                  onSave={() => saveEditOwnership(o)}
                  onCancel={cancelEditOwnership}
                  maxDate={todayIso}
                  error={error}
                />
              ) : (
                <>
                  <span className="ownership-period">{formatDate(o.from)} – {formatDate(o.to)}</span>
                  <button className="ownership-action" onClick={() => startEditOwnership(o)}>Edit</button>
                  <button className="ownership-action ownership-remove" onClick={() => handleRemove(o)}>✕</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {car.ownershipHistory.length === 0 && <p className="ownership-empty">No owners recorded.</p>}
      {addingOwner ? (
        <div className="ownership-add-form">
          <select value={newOwnerId} onChange={(e) => setNewOwnerId(e.target.value)}>
            <option value="" disabled hidden>Select person</option>
            {humans.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
          </select>
          <input
            type="date"
            value={newFrom}
            max={todayIso}
            onChange={(e) => setNewFrom(e.target.value)}
            placeholder="From (optional)"
          />
          {error && <p className="form-error">{error}</p>}
          <div className="form-buttons">
            <button type="button" onClick={handleAdd} disabled={!newOwnerId}>Add</button>
            <button type="button" onClick={() => { setAddingOwner(false); setError(""); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="ownership-add-btn" onClick={() => setAddingOwner(true)}>+ Add owner</button>
      )}
    </div>
  );
}

// Inline date-range editor for a single ownership row. Both inputs are bounded
// by today, parent owns state and persistence.
function OwnershipEditRow({
  fromValue,
  toValue,
  onFromChange,
  onToChange,
  onSave,
  onCancel,
  maxDate,
  error,
}: {
  fromValue: string;
  toValue: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  maxDate: string;
  error: string;
}) {
  return (
    <div className="ownership-edit-row">
      <input type="date" value={fromValue} max={maxDate} onChange={(e) => onFromChange(e.target.value)} />
      <span>–</span>
      <input type="date" value={toValue} max={maxDate} onChange={(e) => onToChange(e.target.value)} />
      <button className="ownership-action" onClick={onSave}>Save</button>
      <button className="ownership-action" onClick={onCancel}>Cancel</button>
      {error && <span className="form-error" style={{ width: "100%" }}>{error}</span>}
    </div>
  );
}

function CarDetail({ car, manufacturers }: { car: Car; manufacturers: Manufacturer[] }) {
  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : "unknown";
  const currentOwnerships = car.ownershipHistory.filter((o) => !o.to);
  const pastOwnerships = car.ownershipHistory.filter((o) => o.to);

  const carModel = findModel(manufacturers, car.manufacturer, car.model);

  // Prefer the new structured colorInfo; fall back to the legacy plain-string color
  // for older records. If colorInfo has no hex but matches a canonical entry, use that hex.
  const colorName = car.colorInfo?.name || car.color || null;
  let colorHex: string | undefined = car.colorInfo?.hex;
  if (colorName && !colorHex) {
    const match = getColors(carModel).find((c) => c.name === colorName);
    if (match) colorHex = match.hex;
  }

  const features = car.trim
    ? getFeatures(carModel, car.trim, String(car.year))
    : [];

  return (
    <div className="car-detail">
      {car.photos.length > 0 && (
        <div className="car-detail-photos">
          {car.photos.map((photo) => (
            <img
              key={photo._id}
              src={photo.url}
              alt={photo.caption || "Car photo"}
              className="car-detail-photo"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ))}
        </div>
      )}
      <div className="car-detail-specs">
        <span className="car-detail-spec">
          <span className="car-detail-spec-label">Make</span>
          <span className="car-detail-spec-value">{car.manufacturer}</span>
        </span>
        <span className="car-detail-spec">
          <span className="car-detail-spec-label">Model</span>
          <span className="car-detail-spec-value">{car.model}</span>
        </span>
        {car.trim && (
          <span className="car-detail-spec">
            <span className="car-detail-spec-label">Trim</span>
            <span className="car-detail-spec-value">{car.trim}</span>
          </span>
        )}
        {colorName && (
          <span className="car-detail-spec">
            <span className="car-detail-spec-label">Color</span>
            <span className="car-detail-color-value car-detail-spec-value">
              {colorHex && <span className="car-detail-color-dot" style={{ background: colorHex }} />}
              {colorName}
            </span>
          </span>
        )}
        {car.transmission && (
          <span className="car-detail-spec">
            <span className="car-detail-spec-label">Transmission</span>
            <span className="car-detail-spec-value">{car.transmission}</span>
          </span>
        )}
        {car.vin && (
          <span className="car-detail-spec car-detail-spec--vin">
            <span className="car-detail-spec-label">VIN</span>
            <span className="car-detail-spec-value">{car.vin}</span>
          </span>
        )}
      </div>
      {features.length > 0 && (
        <div className="car-detail-features">
          <span className="car-detail-section-label">Features</span>
          <div className="car-feature-chips">
            {features.map((f) => (
              <span key={f} className="car-feature-chip">{f}</span>
            ))}
          </div>
        </div>
      )}
      {car.ownershipHistory.length > 0 && (
        <div className="car-detail-owners">
          <span className="car-detail-section-label">Owners</span>
          {currentOwnerships.map((o) => (
            <div key={o._id} className="car-detail-owner">
              <span>{o.owner.name}</span>
              <span className="car-detail-owner-period ownership-current">current{o.from ? ` · since ${formatDate(o.from)}` : ""}</span>
            </div>
          ))}
          {pastOwnerships.map((o) => (
            <div key={o._id} className="car-detail-owner car-detail-owner--past">
              <span>{o.owner.name}</span>
              <span className="car-detail-owner-period">{formatDate(o.from)} – {formatDate(o.to)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Cars only carry the model's display name, not its id, so we resolve back to
// the CarModel by (manufacturer name, model name) for lookups against the
// registry (colors/trims). Edit forms use the id directly instead — see
// editForm.model in CarsView.
function findModel(manufacturers: Manufacturer[], manufacturer: string, model: string): CarModel | undefined {
  const mfr = manufacturers.find((m) => m.name === manufacturer);
  return mfr?.models.find((m) => m.name === model);
}

function getColors(model: CarModel | undefined): ColorEntry[] {
  return model?.colors ?? [];
}

function getFeatures(model: CarModel | undefined, trim: string, year: string): string[] {
  if (!trim || !year || isNaN(Number(year))) return [];
  const y = Number(year);
  const trims: TrimEntry[] = model?.trims ?? [];
  const trimEntry = trims.find((t) => t.name === trim);
  if (!trimEntry) return [];
  const span = trimEntry.years.find(
    (r) => (r.from === null || r.from <= y) && (r.to === null || r.to >= y)
  );
  return span?.features ?? [];
}

function getTrims(model: CarModel | undefined, year: string): TrimEntry[] {
  const all: TrimEntry[] = model?.trims ?? [];
  if (!year || isNaN(Number(year))) return all;
  const y = Number(year);
  return all.filter((t) =>
    t.years.length === 0 ||
    t.years.some((r) => (r.from === null || r.from <= y) && (r.to === null || r.to >= y))
  );
}

function CarList({
  cars,
  manufacturers,
  humans,
  currentUser,
  editingId,
  expandedId,
  editForm,
  editError,
  openMenuId,
  editAvailableModels,
  onEditChange,
  onEditSubmit,
  onStartEdit,
  onCancelEdit,
  onDelete,
  onToggleMenu,
  onToggleExpand,
  onColorChange,
  onTrimChange,
  onCarUpdated,
  emptyMessage,
}: {
  cars: Car[];
  manufacturers: Manufacturer[];
  humans: Human[];
  currentUser?: Human;
  editingId: string | null;
  expandedId: string | null;
  editForm: typeof emptyCar;
  editError: string;
  openMenuId: string | null;
  editAvailableModels: CarModel[];
  onEditChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onEditSubmit: (e: React.FormEvent) => void;
  onStartEdit: (car: Car) => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  onToggleMenu: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onColorChange: (color: CarColor | null) => void;
  onTrimChange: (name: string) => void;
  onCarUpdated: (car: Car) => void;
  emptyMessage: string;
}) {
  const editSelectedModel = editAvailableModels.find((m) => m._id === editForm.model);
  const { options: editColors } = getColorOptions(editSelectedModel);
  const editTrims = getTrims(editSelectedModel, editForm.year);

  if (cars.length === 0) return <p className="empty-state">{emptyMessage}</p>;

  return (
    <ul className="car-list">
      {cars.map((car) => (
        <li key={car._id} className={`car-item${expandedId === car._id ? " car-item--expanded" : ""}`}>
          {editingId === car._id ? (
            <form className="car-form inline-edit-form" onSubmit={onEditSubmit}>
              <select name="manufacturer" value={editForm.manufacturer} onChange={onEditChange} required>
                <option value="" disabled hidden>Manufacturer</option>
                {manufacturers.map((m) => (
                  <option key={m._id} value={m.name}>{m.name}</option>
                ))}
              </select>
              <select name="model" value={editForm.model} onChange={onEditChange} required disabled={!editForm.manufacturer}>
                <option value="" disabled hidden>Model</option>
                {editAvailableModels.map((m) => (
                  <option key={m._id} value={m._id}>{m.name}</option>
                ))}
              </select>
              <input name="year" type="number" value={editForm.year} onChange={onEditChange} required />
              <input name="nickname" placeholder="Nickname (optional)" value={editForm.nickname} onChange={onEditChange} />
              <select name="transmission" value={editForm.transmission} onChange={onEditChange}>
                <option value="" disabled hidden>Transmission</option>
                <option value="Manual">Manual</option>
                <option value="Automatic">Automatic</option>
                <option value="Electric">Electric</option>
              </select>
              {editForm.manufacturer && editForm.model && (
                <ColorPicker
                  colors={editColors}
                  value={editForm.colorInfo}
                  onChange={onColorChange}
                />
              )}
              {editTrims.length > 0 ? (
                <select
                  name="trim"
                  value={editForm.trim}
                  onChange={(e) => onTrimChange(e.target.value)}
                >
                  <option value="">Trim (optional)</option>
                  {editTrims.map((t) => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
              ) : (
                <input name="trim" placeholder="Trim (optional)" value={editForm.trim} onChange={onEditChange} />
              )}
              <input name="vin" placeholder="VIN (optional)" value={editForm.vin} onChange={onEditChange} maxLength={17} />
              <OwnershipManager car={car} humans={humans} onUpdated={onCarUpdated} />
              <PhotoManager car={car} currentUser={currentUser} onUpdated={onCarUpdated} />
              {editError && <p className="form-error">{editError}</p>}
              <div className="form-buttons">
                <button type="submit">Update</button>
                <button type="button" onClick={onCancelEdit}>Cancel</button>
              </div>
            </form>
          ) : (
            <>
              <div
                className="car-item-row"
                onClick={() => onToggleExpand(car._id)}
              >
                <CarThumbnail car={car} />
                <span className="car-info">
                  {car.nickname
                    ? <><strong>{car.nickname}</strong> <span className="car-meta">{car.year} {car.manufacturer} {car.model}{car.trim && ` ${car.trim}`}</span></>
                    : <>{car.year} {car.manufacturer} {car.model}{car.trim && <span className="car-meta"> {car.trim}</span>}</>
                  }
                  {car.transmission && <span className="car-meta"> — {car.transmission}</span>}
                  {car.currentOwners.length > 0 && (
                    <span className="car-owner"> · {car.currentOwners.map((o) => o.name).join(", ")}</span>
                  )}
                </span>
                {(() => {
                  // Show a small color dot when we have a usable hex. Prefer the
                  // stored hex on colorInfo; fall back to canonical lookup by name
                  // (covers older records with only the legacy `color` string).
                  const name = car.colorInfo?.name || car.color;
                  if (!name) return null;
                  let hex = car.colorInfo?.hex;
                  if (!hex) {
                    const ce = getColors(findModel(manufacturers, car.manufacturer, car.model)).find((c) => c.name === name);
                    hex = ce?.hex;
                  }
                  return hex ? <span className="car-color-dot" style={{ background: hex }} title={name} /> : null;
                })()}
                <div className="car-menu-wrap">
                  <button className="btn-menu" onClick={(e) => { e.stopPropagation(); onToggleMenu(car._id); }}>⋯</button>
                  {openMenuId === car._id && (
                    <div className="car-menu">
                      <button onClick={() => onStartEdit(car)}>Edit</button>
                      <button className="car-menu-delete" onClick={() => onDelete(car._id)}>Delete</button>
                    </div>
                  )}
                </div>
              </div>
              {expandedId === car._id && <CarDetail car={car} manufacturers={manufacturers} />}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function CarsView({
  cars,
  manufacturers,
  humans,
  setCars,
  currentUserId,
}: {
  cars: Car[];
  manufacturers: Manufacturer[];
  humans: Human[];
  setCars: React.Dispatch<React.SetStateAction<Car[]>>;
  currentUserId?: string;
}) {
  const [tab, setTab] = React.useState<CarsTab>("all");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [editForm, setEditForm] = React.useState(emptyCar);
  const [editError, setEditError] = React.useState("");
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openMenuId]);

  const selectedEditManufacturer = manufacturers.find((m) => m.name === editForm.manufacturer);
  const editAvailableModels = selectedEditManufacturer?.models || [];

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditError("");
    if (name === "manufacturer") {
      setEditForm({ ...editForm, manufacturer: value, model: "", colorInfo: null, trim: "" });
    } else if (name === "model") {
      setEditForm({ ...editForm, model: value, colorInfo: null, trim: "" });
    } else if (name === "year") {
      setEditForm((prev) => ({ ...prev, year: value, trim: "" }));
    } else {
      setEditForm({ ...editForm, [name]: value });
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError("");
    try {
      const { manufacturer: _manufacturer, ...rest } = editForm;
      const { data } = await axios.put(`${API}/cars/${editingId}`, {
        ...rest,
        year: Number(editForm.year),
      });
      setCars((prev) => prev.map((c) => (c._id === editingId ? data : c)));
      setEditingId(null);
    } catch (error) {
      if (axios.isAxiosError(error) && typeof error.response?.data?.error === "string") {
        setEditError(error.response.data.error);
      } else {
        setEditError("Unable to save car. Please try again.");
      }
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const startEdit = (car: Car) => {
    setEditError("");
    setOpenMenuId(null);
    setExpandedId(null);
    setEditingId(car._id);
    // Prefer the new structured colorInfo. If only the legacy `color` string is
    // present (a record the migration hasn't touched), wrap it as a custom color
    // — it gets normalized on save.
    const colorInfo: CarColor | null = car.colorInfo
      ? car.colorInfo
      : car.color
        ? { name: car.color, isCustom: true }
        : null;
    setEditForm({
      manufacturer: car.manufacturer,
      model: car.modelId || "",
      year: String(car.year),
      nickname: car.nickname || "",
      transmission: car.transmission || "",
      colorInfo,
      trim: car.trim || "",
      vin: car.vin || "",
    });
  };

  const cancelEdit = () => {
    setEditError("");
    setEditingId(null);
    setEditForm(emptyCar);
  };

  const handleDelete = async (id: string) => {
    setOpenMenuId(null);
    await axios.delete(`${API}/cars/${id}`);
    setCars((prev) => prev.filter((c) => c._id !== id));
  };

  const toggleMenu = (id: string) => {
    setOpenMenuId((prev) => (prev === id ? null : id));
  };

  const handleCarUpdated = (updated: Car) => {
    setCars((prev) => prev.map((c) => (c._id === updated._id ? updated : c)));
  };

  const currentUser = humans.find((h) => h._id === currentUserId);

  const ownedCars = cars.filter((c) =>
    c.ownershipHistory.some((o) => o.owner._id === currentUserId)
  );
  const friendsCars = cars.filter((c) =>
    c.currentOwners.length > 0 && c.currentOwners.every((o) => o._id !== currentUserId)
  );

  const sharedProps = {
    manufacturers,
    humans,
    currentUser,
    editingId,
    expandedId,
    editForm,
    editError,
    openMenuId,
    editAvailableModels,
    onEditChange: handleEditChange,
    onEditSubmit: handleEditSubmit,
    onStartEdit: startEdit,
    onCancelEdit: cancelEdit,
    onDelete: handleDelete,
    onToggleMenu: toggleMenu,
    onToggleExpand: toggleExpand,
    onColorChange: (color: CarColor | null) => setEditForm((prev) => ({ ...prev, colorInfo: color })),
    onTrimChange: (name: string) => setEditForm((prev) => ({ ...prev, trim: name })),
    onCarUpdated: handleCarUpdated,
  };

  return (
    <div className="view">
      <h2>Cars</h2>
      <div className="cars-tabs">
        <button className={tab === "owned" ? "cars-tab cars-tab--active" : "cars-tab"} onClick={() => setTab("owned")}>Owned</button>
        <button className={tab === "friends" ? "cars-tab cars-tab--active" : "cars-tab"} onClick={() => setTab("friends")}>Friends</button>
        <button className={tab === "all" ? "cars-tab cars-tab--active" : "cars-tab"} onClick={() => setTab("all")}>All</button>
      </div>
      {tab === "owned" && <CarList {...sharedProps} cars={ownedCars} emptyMessage="You haven't owned any cars yet." />}
      {tab === "friends" && <CarList {...sharedProps} cars={friendsCars} emptyMessage="No cars owned by friends yet." />}
      {tab === "all" && <CarList {...sharedProps} cars={cars} emptyMessage="No cars yet. Add one via a new experience." />}
    </div>
  );
}
