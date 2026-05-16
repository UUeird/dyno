import React from "react";
import axios from "axios";
import { Car, Manufacturer, Human, Ownership } from "../types";
import CarThumbnail from "../components/CarThumbnail";
import PhotoManager from "../components/PhotoManager";

const API = "http://localhost:5000/api";
const emptyCar = { manufacturer: "", model: "", year: "", nickname: "", transmission: "" };

type CarsTab = "owned" | "friends" | "all";

function OwnershipManager({ car, humans, onUpdated }: { car: Car; humans: Human[]; onUpdated: (car: Car) => void }) {
  const [addingOwner, setAddingOwner] = React.useState(false);
  const [newOwnerId, setNewOwnerId] = React.useState("");
  const [newFrom, setNewFrom] = React.useState("");

  const currentOwnerships = car.ownershipHistory.filter((o) => !o.to);
  const pastOwnerships = car.ownershipHistory.filter((o) => o.to);

  const handleAdd = async () => {
    if (!newOwnerId) return;
    await axios.post(`${API}/ownerships`, { car: car._id, owner: newOwnerId, from: newFrom || null });
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
              <span className="ownership-period ownership-current">current{o.from ? ` · since ${formatDate(o.from)}` : ""}</span>
              <button className="ownership-action" onClick={() => handleEnd(o)}>End</button>
              <button className="ownership-action ownership-remove" onClick={() => handleRemove(o)}>✕</button>
            </li>
          ))}
        </ul>
      )}
      {pastOwnerships.length > 0 && (
        <ul className="ownership-list ownership-list--past">
          {pastOwnerships.map((o) => (
            <li key={o._id} className="ownership-item ownership-item--past">
              <span className="ownership-name">{o.owner.name}</span>
              <span className="ownership-period">{formatDate(o.from)} – {formatDate(o.to)}</span>
              <button className="ownership-action ownership-remove" onClick={() => handleRemove(o)}>✕</button>
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
          <input type="date" value={newFrom} onChange={(e) => setNewFrom(e.target.value)} placeholder="From (optional)" />
          <div className="form-buttons">
            <button type="button" onClick={handleAdd} disabled={!newOwnerId}>Add</button>
            <button type="button" onClick={() => setAddingOwner(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="ownership-add-btn" onClick={() => setAddingOwner(true)}>+ Add owner</button>
      )}
    </div>
  );
}

function CarList({
  cars,
  manufacturers,
  humans,
  currentUser,
  editingId,
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
  onCarUpdated,
  emptyMessage,
}: {
  cars: Car[];
  manufacturers: Manufacturer[];
  humans: Human[];
  currentUser?: Human;
  editingId: string | null;
  editForm: typeof emptyCar;
  editError: string;
  openMenuId: string | null;
  editAvailableModels: string[];
  onEditChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onEditSubmit: (e: React.FormEvent) => void;
  onStartEdit: (car: Car) => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  onToggleMenu: (id: string) => void;
  onCarUpdated: (car: Car) => void;
  emptyMessage: string;
}) {
  if (cars.length === 0) return <p className="empty-state">{emptyMessage}</p>;

  return (
    <ul className="car-list">
      {cars.map((car) => (
        <li key={car._id} className="car-item">
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
                {editAvailableModels.map((modelName) => (
                  <option key={modelName} value={modelName}>{modelName}</option>
                ))}
              </select>
              <input name="year" type="number" value={editForm.year} onChange={onEditChange} required />
              <input name="nickname" placeholder="Nickname (optional)" value={editForm.nickname} onChange={onEditChange} />
              <select name="transmission" value={editForm.transmission} onChange={onEditChange}>
                <option value="" disabled hidden>Transmission</option>
                <option value="Manual">Manual</option>
                <option value="Automatic">Automatic</option>
              </select>
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
              <CarThumbnail car={car} />
              <span className="car-info">
                {car.nickname
                  ? <><strong>{car.nickname}</strong> <span className="car-meta">{car.year} {car.manufacturer} {car.model}</span></>
                  : <>{car.year} {car.manufacturer} {car.model}</>
                }
                {car.transmission && <span className="car-meta"> — {car.transmission}</span>}
                {car.currentOwners.length > 0 && (
                  <span className="car-owner"> · {car.currentOwners.map((o) => o.name).join(", ")}</span>
                )}
              </span>
              <div className="car-menu-wrap">
                <button className="btn-menu" onClick={(e) => { e.stopPropagation(); onToggleMenu(car._id); }}>⋯</button>
                {openMenuId === car._id && (
                  <div className="car-menu">
                    <button onClick={() => onStartEdit(car)}>Edit</button>
                    <button className="car-menu-delete" onClick={() => onDelete(car._id)}>Delete</button>
                  </div>
                )}
              </div>
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
      setEditForm({ ...editForm, manufacturer: value, model: "" });
    } else {
      setEditForm({ ...editForm, [name]: value });
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError("");
    try {
      const { data } = await axios.put(`${API}/cars/${editingId}`, {
        ...editForm,
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

  const startEdit = (car: Car) => {
    setEditError("");
    setOpenMenuId(null);
    setEditingId(car._id);
    setEditForm({
      manufacturer: car.manufacturer,
      model: car.model,
      year: String(car.year),
      nickname: car.nickname || "",
      transmission: car.transmission || "",
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
    c.currentOwners.some((o) => o._id !== currentUserId)
  );

  const sharedProps = {
    manufacturers,
    humans,
    currentUser,
    editingId,
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
