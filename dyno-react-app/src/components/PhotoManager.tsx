import React from "react";
import axios from "axios";
import { Car, Photo, Human } from "../types";

const API = "http://localhost:5000/api";

function PhotoItem({ photo, isThumbnail, onSetThumbnail, onDelete }: {
  photo: Photo;
  isThumbnail: boolean;
  onSetThumbnail: () => void;
  onDelete: () => void;
}) {
  const [failed, setFailed] = React.useState(false);
  if (failed) return null;

  return (
    <div className={`photo-item${isThumbnail ? " photo-item--thumb" : ""}`}>
      <img
        src={photo.url}
        alt={photo.caption || "Car photo"}
        className="photo-preview"
        onError={() => setFailed(true)}
      />
      <div className="photo-meta">
        <span className="photo-uploader">{photo.uploadedBy.name}</span>
        {isThumbnail && <span className="photo-thumb-badge">Thumbnail</span>}
      </div>
      <div className="photo-actions">
        {!isThumbnail && (
          <button className="photo-action-btn" onClick={onSetThumbnail}>Set thumbnail</button>
        )}
        <button className="photo-action-btn photo-action-delete" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

export default function PhotoManager({
  car,
  currentUser,
  onUpdated,
}: {
  car: Car;
  currentUser?: Human;
  onUpdated: (car: Car) => void;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const refreshCar = async () => {
    const { data } = await axios.get(`${API}/cars`);
    const updated = data.find((c: Car) => c._id === car._id);
    if (updated) onUpdated(updated);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    setUploading(true);
    setUploadError("");
    try {
      const formData = new FormData();
      formData.append("photo", file);
      formData.append("uploadedBy", currentUser._id);
      formData.append("caption", file.name);
      await axios.post(`${API}/cars/${car._id}/photos`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await refreshCar();
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSetThumbnail = async (photo: Photo) => {
    await axios.patch(`${API}/cars/${car._id}/thumbnail`, { photoId: photo._id });
    await refreshCar();
  };

  const handleDelete = async (photo: Photo) => {
    await axios.delete(`${API}/photos/${photo._id}`);
    await refreshCar();
  };

  const isThumbnail = (photo: Photo) =>
    car.thumbnail?._id === photo._id;

  return (
    <div className="photo-manager">
      <p className="ownership-label">Photos</p>
      {car.photos.length === 0 ? (
        <p className="ownership-empty">No photos yet.</p>
      ) : (
        <div className="photo-grid">
          {car.photos.map((photo) => (
            <PhotoItem
              key={photo._id}
              photo={photo}
              isThumbnail={isThumbnail(photo)}
              onSetThumbnail={() => handleSetThumbnail(photo)}
              onDelete={() => handleDelete(photo)}
            />
          ))}
        </div>
      )}
      <div className="photo-upload">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          id={`photo-upload-${car._id}`}
          className="photo-file-input"
          onChange={handleFileChange}
          disabled={uploading || !currentUser}
        />
        <label htmlFor={`photo-upload-${car._id}`} className="ownership-add-btn photo-upload-label">
          {uploading ? "Uploading…" : "+ Add photo"}
        </label>
        {uploadError && <p className="form-error">{uploadError}</p>}
      </div>
    </div>
  );
}
