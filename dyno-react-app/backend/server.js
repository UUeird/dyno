const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json());
app.use(cors());

// Serve uploaded photos statically
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use("/uploads", express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

mongoose
  .connect("mongodb://localhost:27017/carsDB")
  .then(() => {
    console.log("Connected to MongoDB");
    migrateLegacyOwners();
  })
  .catch((err) => console.error("Error connecting to MongoDB:", err));

// ── Schemas ──────────────────────────────────────────────────────────────────

const humanSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: String,
  avatarUrl: String,
});
const Human = mongoose.model("Human", humanSchema);

const manufacturerSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  models: [String],
});
const Manufacturer = mongoose.model("Manufacturer", manufacturerSchema);

const photoSchema = new mongoose.Schema({
  car: { type: mongoose.Schema.Types.ObjectId, ref: "Car", required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Human", required: true },
  url: { type: String, required: true },
  caption: String,
  createdAt: { type: Date, default: Date.now },
});
const Photo = mongoose.model("Photo", photoSchema);

const carSchema = new mongoose.Schema({
  manufacturer: String,
  model: String,
  year: Number,
  nickname: String,
  transmission: String,
  thumbnailPhoto: { type: mongoose.Schema.Types.ObjectId, ref: "Photo", default: null },
  // legacy field — kept so Mongoose can read/unset it during migration
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "Human", default: null },
});
const Car = mongoose.model("Car", carSchema);

const ownershipSchema = new mongoose.Schema({
  car: { type: mongoose.Schema.Types.ObjectId, ref: "Car", required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "Human", required: true },
  from: { type: Date, default: null },
  to: { type: Date, default: null },
});
const Ownership = mongoose.model("Ownership", ownershipSchema);

const experienceSchema = new mongoose.Schema({
  car: { type: mongoose.Schema.Types.ObjectId, ref: "Car", required: true },
  type: { type: String, enum: ["spotted", "drove"], required: true },
  date: { type: Date, default: Date.now },
  notes: String,
});
const Experience = mongoose.model("Experience", experienceSchema);

// ── Migration ─────────────────────────────────────────────────────────────────

async function migrateLegacyOwners() {
  const carsWithLegacyOwner = await Car.find({ owner: { $ne: null } });
  for (const car of carsWithLegacyOwner) {
    const existing = await Ownership.findOne({ car: car._id, owner: car.owner });
    if (!existing) {
      await Ownership.create({ car: car._id, owner: car.owner, from: null, to: null });
    }
    await Car.updateOne({ _id: car._id }, { $unset: { owner: "" } });
  }
  if (carsWithLegacyOwner.length > 0) {
    console.log(`Migrated ${carsWithLegacyOwner.length} legacy owner(s) to Ownership records`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function attachOwnership(carDoc) {
  const car = carDoc.toObject ? carDoc.toObject() : { ...carDoc };
  const ownerships = await Ownership.find({ car: car._id })
    .populate("owner", "name email")
    .sort({ from: 1 });
  car.currentOwners = ownerships.filter((o) => !o.to).map((o) => o.owner);
  car.ownershipHistory = ownerships;
  const photos = await Photo.find({ car: car._id })
    .populate("uploadedBy", "name")
    .sort({ createdAt: 1 });
  car.photos = photos;
  // resolve thumbnail: use set thumbnailPhoto, else first photo, else null
  if (car.thumbnailPhoto) {
    car.thumbnail = photos.find((p) => String(p._id) === String(car.thumbnailPhoto)) || photos[0] || null;
  } else {
    car.thumbnail = photos[0] || null;
  }
  return car;
}

async function attachOwnershipToMany(carDocs) {
  return Promise.all(carDocs.map(attachOwnership));
}

// ── Humans ────────────────────────────────────────────────────────────────────

app.get("/api/humans", async (req, res) => {
  try {
    res.json(await Human.find().sort({ name: 1 }));
  } catch {
    res.status(500).send("Error fetching humans");
  }
});

app.post("/api/humans", async (req, res) => {
  try {
    const human = new Human(req.body);
    res.status(201).json(await human.save());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Manufacturers ─────────────────────────────────────────────────────────────

app.get("/api/manufacturers", async (req, res) => {
  try {
    res.json(await Manufacturer.find().sort({ name: 1 }));
  } catch {
    res.status(500).send("Error fetching manufacturers");
  }
});

// ── Cars ──────────────────────────────────────────────────────────────────────

app.get("/api/cars", async (req, res) => {
  try {
    const cars = await Car.find();
    res.json(await attachOwnershipToMany(cars));
  } catch {
    res.status(500).send("Error fetching cars");
  }
});

app.post("/api/cars", async (req, res) => {
  try {
    const { manufacturer, model, year, nickname, transmission } = req.body;
    if (!manufacturer || !model || !year) {
      return res.status(400).json({ error: "manufacturer, model, and year are required" });
    }
    const mfr = await Manufacturer.findOne({ name: manufacturer });
    if (!mfr) return res.status(400).json({ error: "invalid manufacturer" });
    if (!mfr.models.includes(model))
      return res.status(400).json({ error: `invalid model for manufacturer ${manufacturer}` });

    const car = await new Car({ manufacturer, model, year, nickname, transmission }).save();
    res.status(201).json(await attachOwnership(car));
  } catch (err) {
    res.status(500).send("Error creating car");
  }
});

app.put("/api/cars/:id", async (req, res) => {
  try {
    const { manufacturer, model } = req.body;
    if (manufacturer || model) {
      const car = await Car.findById(req.params.id);
      if (!car) return res.status(404).json({ error: "Car not found" });
      const effectiveMfr = manufacturer || car.manufacturer;
      const effectiveModel = model || car.model;
      const mfr = await Manufacturer.findOne({ name: effectiveMfr });
      if (!mfr) return res.status(400).json({ error: "invalid manufacturer" });
      if (!mfr.models.includes(effectiveModel))
        return res.status(400).json({ error: `invalid model for manufacturer ${effectiveMfr}` });
    }
    const { owner: _owner, ...updateFields } = req.body;
    const updated = await Car.findByIdAndUpdate(req.params.id, updateFields, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ error: "Car not found" });
    res.json(await attachOwnership(updated));
  } catch {
    res.status(500).send("Error updating car");
  }
});

app.delete("/api/cars/:id", async (req, res) => {
  try {
    const deleted = await Car.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Car not found" });
    await Ownership.deleteMany({ car: req.params.id });
    await Photo.deleteMany({ car: req.params.id });
    res.json({ message: "Car deleted" });
  } catch {
    res.status(500).send("Error deleting car");
  }
});

// ── Photos ────────────────────────────────────────────────────────────────────

// List photos for a car
app.get("/api/cars/:id/photos", async (req, res) => {
  try {
    const photos = await Photo.find({ car: req.params.id })
      .populate("uploadedBy", "name")
      .sort({ createdAt: 1 });
    res.json(photos);
  } catch {
    res.status(500).send("Error fetching photos");
  }
});

// Upload a photo file for a car
app.post("/api/cars/:id/photos", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const { uploadedBy, caption } = req.body;
    if (!uploadedBy) return res.status(400).json({ error: "uploadedBy is required" });
    const url = `/uploads/${req.file.filename}`;
    const photo = await new Photo({ car: req.params.id, uploadedBy, url, caption }).save();
    await photo.populate("uploadedBy", "name");
    res.status(201).json(photo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a photo by URL (for seeding / external images)
app.post("/api/cars/:id/photos/url", async (req, res) => {
  try {
    const { uploadedBy, url, caption } = req.body;
    if (!uploadedBy || !url) return res.status(400).json({ error: "uploadedBy and url are required" });
    const photo = await new Photo({ car: req.params.id, uploadedBy, url, caption }).save();
    await photo.populate("uploadedBy", "name");
    res.status(201).json(photo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a photo
app.delete("/api/photos/:id", async (req, res) => {
  try {
    const photo = await Photo.findByIdAndDelete(req.params.id);
    if (!photo) return res.status(404).json({ error: "Photo not found" });
    // Clean up local file if stored on disk
    if (photo.url.startsWith("/uploads/")) {
      const filePath = path.join(__dirname, photo.url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    // Clear thumbnailPhoto reference if it pointed to this photo
    await Car.updateMany({ thumbnailPhoto: photo._id }, { $unset: { thumbnailPhoto: "" } });
    res.json({ message: "Photo deleted" });
  } catch {
    res.status(500).send("Error deleting photo");
  }
});

// Set thumbnail photo for a car
app.patch("/api/cars/:id/thumbnail", async (req, res) => {
  try {
    const { photoId } = req.body;
    const updated = await Car.findByIdAndUpdate(
      req.params.id,
      { thumbnailPhoto: photoId || null },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Car not found" });
    res.json(await attachOwnership(updated));
  } catch {
    res.status(500).send("Error setting thumbnail");
  }
});

// ── Ownerships ────────────────────────────────────────────────────────────────

app.get("/api/ownerships", async (req, res) => {
  try {
    const filter = req.query.car ? { car: req.query.car } : {};
    res.json(await Ownership.find(filter).populate("owner", "name email").sort({ from: 1 }));
  } catch {
    res.status(500).send("Error fetching ownerships");
  }
});

app.post("/api/ownerships", async (req, res) => {
  try {
    const { car, owner, from, to } = req.body;
    if (!car || !owner) return res.status(400).json({ error: "car and owner are required" });
    const record = await new Ownership({ car, owner, from: from || null, to: to || null }).save();
    await record.populate("owner", "name email");
    res.status(201).json(record);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch("/api/ownerships/:id/end", async (req, res) => {
  try {
    const record = await Ownership.findByIdAndUpdate(
      req.params.id,
      { to: req.body.to || new Date() },
      { new: true }
    ).populate("owner", "name email");
    if (!record) return res.status(404).json({ error: "Ownership not found" });
    res.json(record);
  } catch {
    res.status(500).send("Error ending ownership");
  }
});

app.delete("/api/ownerships/:id", async (req, res) => {
  try {
    const deleted = await Ownership.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Ownership not found" });
    res.json({ message: "Ownership deleted" });
  } catch {
    res.status(500).send("Error deleting ownership");
  }
});

// ── Experiences ───────────────────────────────────────────────────────────────

app.get("/api/experiences", async (req, res) => {
  try {
    const experiences = await Experience.find().populate("car").sort({ date: -1 });
    const result = await Promise.all(experiences.map(async (exp) => {
      const expObj = exp.toObject();
      expObj.car = await attachOwnership(exp.car);
      return expObj;
    }));
    res.json(result);
  } catch {
    res.status(500).send("Error fetching experiences");
  }
});

app.post("/api/experiences", async (req, res) => {
  try {
    const { car, type, notes } = req.body;
    if (!car || !type) return res.status(400).json({ error: "car and type are required" });
    const experience = new Experience({ car, type, notes });
    res.status(201).json(await experience.save());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/experiences/:id", async (req, res) => {
  try {
    const deleted = await Experience.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Experience not found" });
    res.json({ message: "Experience deleted" });
  } catch {
    res.status(500).send("Error deleting experience");
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
