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

const DB_NAME = process.env.MONGO_DB || "carsDB";
mongoose
  .connect(`mongodb://localhost:27017/${DB_NAME}`)
  .then(() => {
    console.log("Connected to MongoDB");
    migrateLegacyOwners();
    seedBadgeSeries();
  })
  .catch((err) => console.error("Error connecting to MongoDB:", err));

// ── Schemas ──────────────────────────────────────────────────────────────────

const humanSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: String,
  avatarUrl: String,
});
const Human = mongoose.model("Human", humanSchema);

const colorEntrySchema = new mongoose.Schema({ name: String, hex: String }, { _id: false });

const yearRangeSchema = new mongoose.Schema({
  from: Number,
  to: Number,
  features: { type: [String], default: [] },
}, { _id: false });
const trimEntrySchema = new mongoose.Schema({
  name: String,
  // Array of {from, to, features} year ranges. null means open-ended on that side.
  years: { type: [yearRangeSchema], default: [] },
}, { _id: false });

const manufacturerSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  models: [String],
  // keyed by model name, or "*" for the generic fallback palette
  colors: { type: Map, of: [colorEntrySchema], default: {} },
  // keyed by model name; no "*" fallback — trims are always model-specific
  trims: { type: Map, of: [trimEntrySchema], default: {} },
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
  color: String,
  trim: String,
  vin: String,
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
  rating: { type: Number, min: 0, max: 5, default: null },
  loggedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Human", default: null },
});
const Experience = mongoose.model("Experience", experienceSchema);

const followSchema = new mongoose.Schema({
  follower: { type: mongoose.Schema.Types.ObjectId, ref: "Human", required: true },
  followee: { type: mongoose.Schema.Types.ObjectId, ref: "Human", required: true },
}, { timestamps: true });
followSchema.index({ follower: 1, followee: 1 }, { unique: true });
const Follow = mongoose.model("Follow", followSchema);

const reactionSchema = new mongoose.Schema({
  experience: { type: mongoose.Schema.Types.ObjectId, ref: "Experience", required: true },
  human: { type: mongoose.Schema.Types.ObjectId, ref: "Human", required: true },
  emoji: { type: String, required: true },
}, { timestamps: true });
reactionSchema.index({ experience: 1, human: 1 }, { unique: true });
const Reaction = mongoose.model("Reaction", reactionSchema);

const badgeSeriesSchema = new mongoose.Schema({
  slug: { type: String, unique: true, required: true },
  name: String,
  levels: [{
    level: Number,
    name: String,
    emoji: String,
    description: String,
  }],
});
const BadgeSeries = mongoose.model("BadgeSeries", badgeSeriesSchema);

const userBadgeSchema = new mongoose.Schema({
  human: { type: mongoose.Schema.Types.ObjectId, ref: "Human", required: true },
  seriesSlug: { type: String, required: true },
  level: { type: Number, required: true },
}, { timestamps: true });
userBadgeSchema.index({ human: 1, seriesSlug: 1 }, { unique: true });
const UserBadge = mongoose.model("UserBadge", userBadgeSchema);

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

async function seedBadgeSeries() {
  const series = [
    {
      slug: "drive-count",
      name: "Miles & Memories",
      levels: [
        { level: 1, emoji: "🔑", name: "First Ignition",  description: "Logged your first drive." },
        { level: 2, emoji: "🛣️", name: "Weekend Warrior", description: "10 drives logged." },
        { level: 3, emoji: "🏁", name: "Road Warrior",    description: "50 drives logged." },
        { level: 4, emoji: "💯", name: "Century Driver",  description: "100 drives logged." },
        { level: 5, emoji: "🌍", name: "Grand Tourer",    description: "250 drives logged." },
      ],
    },
    {
      slug: "spot-count",
      name: "Eagle Eye",
      levels: [
        { level: 1, emoji: "👀", name: "Sharp Eye",    description: "Spotted your first car." },
        { level: 2, emoji: "📸", name: "Car Spotter",  description: "10 cars spotted." },
        { level: 3, emoji: "🎯", name: "Paparazzi",    description: "50 cars spotted." },
        { level: 4, emoji: "🔭", name: "Street Scout", description: "100 cars spotted." },
      ],
    },
    {
      slug: "brand-explorer",
      name: "Brand Explorer",
      levels: [
        { level: 1, emoji: "🗺️", name: "Brand Curious", description: "Drove cars from 2 different manufacturers." },
        { level: 2, emoji: "🎨", name: "Multi-brand",    description: "Drove cars from 5 different manufacturers." },
        { level: 3, emoji: "🌐", name: "Brand Agnostic", description: "Drove cars from 10 different manufacturers." },
      ],
    },
    {
      slug: "stick-shift",
      name: "Stick Shift",
      levels: [
        { level: 1, emoji: "🦾", name: "Manual Loyalist",  description: "Drove a manual transmission car." },
        { level: 2, emoji: "⚙️", name: "Three-Pedal Club", description: "10 drives in a manual." },
        { level: 3, emoji: "🏎️", name: "Row Your Own",     description: "25 drives in a manual." },
      ],
    },
    {
      slug: "ev-pioneer",
      name: "EV Pioneer",
      levels: [
        { level: 1, emoji: "⚡", name: "Volt Curious",    description: "Drove an electric vehicle." },
        { level: 2, emoji: "🔋", name: "Amp Enthusiast",  description: "5 EV drives logged." },
        { level: 3, emoji: "🌱", name: "EV Pioneer",      description: "10 EV drives logged." },
      ],
    },
    {
      slug: "community",
      name: "Community",
      levels: [
        { level: 1, emoji: "🤝", name: "Newcomer",   description: "Following your first person." },
        { level: 2, emoji: "🕸️", name: "Connected",  description: "Following 5 people." },
        { level: 3, emoji: "📡", name: "Hub",         description: "Following 10 people." },
      ],
    },
    {
      slug: "decade-collector",
      name: "Decade Collector",
      levels: [
        { level: 1, emoji: "🕰️", name: "Time Traveler",  description: "Drove cars from 2 different decades." },
        { level: 2, emoji: "📅", name: "Era Hopper",      description: "Drove cars from 3 different decades." },
        { level: 3, emoji: "🏛️", name: "Living Museum",   description: "Drove cars from 5 different decades." },
      ],
    },
    {
      slug: "color-collector",
      name: "Color Collector",
      levels: [
        { level: 1, emoji: "🎨", name: "Color Curious",  description: "Experienced 3 different car colors." },
        { level: 2, emoji: "🌈", name: "Rainbow Chaser", description: "Experienced 8 different car colors." },
        { level: 3, emoji: "🖌️", name: "Full Spectrum",  description: "Experienced 14 different car colors." },
      ],
    },
  ];
  for (const s of series) {
    await BadgeSeries.findOneAndUpdate({ slug: s.slug }, s, { upsert: true, new: true });
  }
  console.log(`Badge series seeded (${series.length} series)`);
}

const EV_MANUFACTURERS = new Set(["Tesla", "Rivian", "Lucid", "Polestar", "Fisker", "NIO"]);

const BADGE_EVALUATORS = {
  "drive-count": async (humanId) => {
    const count = await Experience.countDocuments({ loggedBy: humanId, type: "drove" });
    if (count >= 250) return 5;
    if (count >= 100) return 4;
    if (count >= 50)  return 3;
    if (count >= 10)  return 2;
    if (count >= 1)   return 1;
    return 0;
  },
  "spot-count": async (humanId) => {
    const count = await Experience.countDocuments({ loggedBy: humanId, type: "spotted" });
    if (count >= 100) return 4;
    if (count >= 50)  return 3;
    if (count >= 10)  return 2;
    if (count >= 1)   return 1;
    return 0;
  },
  "brand-explorer": async (humanId) => {
    const exps = await Experience.find({ loggedBy: humanId, type: "drove" }).populate("car", "manufacturer");
    const manufacturers = new Set(exps.map((e) => e.car?.manufacturer).filter(Boolean));
    const count = manufacturers.size;
    if (count >= 10) return 3;
    if (count >= 5)  return 2;
    if (count >= 2)  return 1;
    return 0;
  },
  "stick-shift": async (humanId) => {
    const exps = await Experience.find({ loggedBy: humanId, type: "drove" }).populate("car", "transmission");
    const count = exps.filter((e) => e.car?.transmission === "Manual").length;
    if (count >= 25) return 3;
    if (count >= 10) return 2;
    if (count >= 1)  return 1;
    return 0;
  },
  "ev-pioneer": async (humanId) => {
    const exps = await Experience.find({ loggedBy: humanId, type: "drove" }).populate("car", "manufacturer transmission");
    const count = exps.filter((e) => {
      const t = e.car?.transmission;
      const m = e.car?.manufacturer;
      return t === "Electric" || EV_MANUFACTURERS.has(m);
    }).length;
    if (count >= 10) return 3;
    if (count >= 5)  return 2;
    if (count >= 1)  return 1;
    return 0;
  },
  "community": async (humanId) => {
    const count = await Follow.countDocuments({ follower: humanId });
    if (count >= 10) return 3;
    if (count >= 5)  return 2;
    if (count >= 1)  return 1;
    return 0;
  },
  "decade-collector": async (humanId) => {
    const exps = await Experience.find({ loggedBy: humanId, type: "drove" }).populate("car", "year");
    const decades = new Set(exps.map((e) => e.car?.year ? Math.floor(e.car.year / 10) * 10 : null).filter(Boolean));
    const count = decades.size;
    if (count >= 5) return 3;
    if (count >= 3) return 2;
    if (count >= 2) return 1;
    return 0;
  },
  "color-collector": async (humanId) => {
    const exps = await Experience.find({ loggedBy: humanId }).populate("car", "color");
    const colors = new Set(exps.map((e) => e.car?.color).filter(Boolean));
    const count = colors.size;
    if (count >= 14) return 3;
    if (count >= 8)  return 2;
    if (count >= 3)  return 1;
    return 0;
  },
};

async function evaluateBadges(humanId) {
  if (!humanId) return [];
  const seriesSlugs = Object.keys(BADGE_EVALUATORS);
  const existingBadges = await UserBadge.find({ human: humanId, seriesSlug: { $in: seriesSlugs } });
  const existingMap = {};
  for (const b of existingBadges) existingMap[b.seriesSlug] = b.level;

  const results = await Promise.all(
    seriesSlugs.map(async (slug) => {
      const newLevel = await BADGE_EVALUATORS[slug](humanId);
      return { slug, newLevel };
    })
  );

  const allSeries = await BadgeSeries.find({ slug: { $in: seriesSlugs } }).lean();
  const seriesMap = {};
  for (const s of allSeries) seriesMap[s.slug] = s;

  const awarded = [];
  for (const { slug, newLevel } of results) {
    if (newLevel === 0) continue;
    const prevLevel = existingMap[slug] || 0;
    if (newLevel > prevLevel) {
      await UserBadge.findOneAndUpdate(
        { human: humanId, seriesSlug: slug },
        { human: humanId, seriesSlug: slug, level: newLevel },
        { upsert: true, new: true }
      );
      const series = seriesMap[slug];
      const levelDef = series?.levels.find((l) => l.level === newLevel);
      awarded.push({ seriesSlug: slug, seriesName: series?.name, level: newLevel, name: levelDef?.name, emoji: levelDef?.emoji, description: levelDef?.description });
    }
  }
  return awarded;
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
    const { manufacturer, model, year, nickname, transmission, color, trim, vin } = req.body;
    if (!manufacturer || !model || !year) {
      return res.status(400).json({ error: "manufacturer, model, and year are required" });
    }
    const mfr = await Manufacturer.findOne({ name: manufacturer });
    if (!mfr) return res.status(400).json({ error: "invalid manufacturer" });
    if (!mfr.models.includes(model))
      return res.status(400).json({ error: `invalid model for manufacturer ${manufacturer}` });

    const car = await new Car({ manufacturer, model, year, nickname, transmission, color, trim, vin }).save();
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
    let filter = {};
    if (req.query.followedBy) {
      const followerId = req.query.followedBy;
      const follows = await Follow.find({ follower: followerId }).lean();
      const followeeIds = follows.map((f) => f.followee);
      filter = { loggedBy: { $in: [followerId, ...followeeIds] } };
    }
    const experiences = await Experience.find(filter)
      .populate("car")
      .populate("loggedBy", "name email avatarUrl")
      .sort({ date: -1 });
    const expIds = experiences.map((e) => e._id);
    const allReactions = await Reaction.find({ experience: { $in: expIds } })
      .populate("human", "name")
      .lean();
    const reactionsByExp = {};
    for (const r of allReactions) {
      const key = String(r.experience);
      if (!reactionsByExp[key]) reactionsByExp[key] = [];
      reactionsByExp[key].push(r);
    }
    const result = await Promise.all(experiences.map(async (exp) => {
      const expObj = exp.toObject();
      expObj.car = await attachOwnership(exp.car);
      expObj.reactions = reactionsByExp[String(exp._id)] || [];
      return expObj;
    }));
    res.json(result);
  } catch {
    res.status(500).send("Error fetching experiences");
  }
});

app.post("/api/experiences", async (req, res) => {
  try {
    const { car, type, notes, rating, loggedBy } = req.body;
    if (!car || !type) return res.status(400).json({ error: "car and type are required" });
    const experience = new Experience({ car, type, notes, rating: rating ?? null, loggedBy: loggedBy || null });
    await experience.save();
    await experience.populate("loggedBy", "name email avatarUrl");
    const newBadges = await evaluateBadges(loggedBy);
    res.status(201).json({ experience, newBadges });
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

// ── Reactions ─────────────────────────────────────────────────────────────────

app.post("/api/experiences/:id/reactions", async (req, res) => {
  try {
    const { human, emoji } = req.body;
    if (!human || !emoji) return res.status(400).json({ error: "human and emoji are required" });
    const existing = await Reaction.findOne({ experience: req.params.id, human });
    if (existing) {
      existing.emoji = emoji;
      await existing.save();
      await existing.populate("human", "name");
      return res.json(existing);
    }
    const reaction = await Reaction.create({ experience: req.params.id, human, emoji });
    await reaction.populate("human", "name");
    res.status(201).json(reaction);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/experiences/:id/reactions", async (req, res) => {
  try {
    const { human } = req.body;
    if (!human) return res.status(400).json({ error: "human is required" });
    const deleted = await Reaction.findOneAndDelete({ experience: req.params.id, human });
    if (!deleted) return res.status(404).json({ error: "Reaction not found" });
    res.json({ message: "Reaction removed" });
  } catch {
    res.status(500).send("Error removing reaction");
  }
});

// ── Follows ────────────────────────────────────────────────────────────────────

app.get("/api/follows", async (req, res) => {
  try {
    const filter = {};
    if (req.query.follower) filter.follower = req.query.follower;
    if (req.query.followee) filter.followee = req.query.followee;
    const follows = await Follow.find(filter)
      .populate("follower", "name email avatarUrl")
      .populate("followee", "name email avatarUrl");
    res.json(follows);
  } catch {
    res.status(500).send("Error fetching follows");
  }
});

app.post("/api/follows", async (req, res) => {
  try {
    const { follower, followee } = req.body;
    if (!follower || !followee) return res.status(400).json({ error: "follower and followee are required" });
    if (String(follower) === String(followee)) return res.status(400).json({ error: "cannot follow yourself" });
    const follow = await Follow.create({ follower, followee });
    res.status(201).json(follow);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "already following" });
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/follows", async (req, res) => {
  try {
    const { follower, followee } = req.body;
    if (!follower || !followee) return res.status(400).json({ error: "follower and followee are required" });
    const deleted = await Follow.findOneAndDelete({ follower, followee });
    if (!deleted) return res.status(404).json({ error: "Follow not found" });
    res.json({ message: "Unfollowed" });
  } catch {
    res.status(500).send("Error deleting follow");
  }
});

// ── User profiles ──────────────────────────────────────────────────────────────

app.get("/api/users/:id/profile", async (req, res) => {
  try {
    const humanId = req.params.id;
    const human = await Human.findById(humanId);
    if (!human) return res.status(404).json({ error: "User not found" });

    const experienceDocs = await Experience.find({ loggedBy: humanId })
      .populate("car")
      .populate("loggedBy", "name email avatarUrl")
      .sort({ date: -1 });
    const expIds = experienceDocs.map((e) => e._id);
    const allReactions = await Reaction.find({ experience: { $in: expIds } })
      .populate("human", "name")
      .lean();
    const reactionsByExp = {};
    for (const r of allReactions) {
      const key = String(r.experience);
      if (!reactionsByExp[key]) reactionsByExp[key] = [];
      reactionsByExp[key].push(r);
    }
    const experiences = await Promise.all(experienceDocs.map(async (exp) => {
      const expObj = exp.toObject();
      expObj.car = await attachOwnership(exp.car);
      expObj.reactions = reactionsByExp[String(exp._id)] || [];
      return expObj;
    }));

    const ownerships = await Ownership.find({ owner: humanId, to: null }).populate("car");
    const ownedCars = await Promise.all(ownerships.map((o) => attachOwnership(o.car)));

    const followingDocs = await Follow.find({ follower: humanId })
      .populate("followee", "name email avatarUrl");
    const followerDocs = await Follow.find({ followee: humanId })
      .populate("follower", "name email avatarUrl");

    const userBadges = await UserBadge.find({ human: humanId }).lean();
    const allSeries = await BadgeSeries.find({ slug: { $in: userBadges.map((b) => b.seriesSlug) } }).lean();
    const seriesMap = {};
    for (const s of allSeries) seriesMap[s.slug] = s;
    const badges = userBadges.map((b) => {
      const series = seriesMap[b.seriesSlug];
      const levelDef = series?.levels.find((l) => l.level === b.level);
      return { seriesSlug: b.seriesSlug, seriesName: series?.name, level: b.level, name: levelDef?.name, emoji: levelDef?.emoji, description: levelDef?.description, awardedAt: b.updatedAt };
    });

    res.json({
      human,
      experiences,
      ownedCars,
      following: followingDocs.map((f) => f.followee),
      followers: followerDocs.map((f) => f.follower),
      badges,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/users/:id/badges", async (req, res) => {
  try {
    const userBadges = await UserBadge.find({ human: req.params.id }).lean();
    const allSeries = await BadgeSeries.find({ slug: { $in: userBadges.map((b) => b.seriesSlug) } }).lean();
    const seriesMap = {};
    for (const s of allSeries) seriesMap[s.slug] = s;
    const badges = userBadges.map((b) => {
      const series = seriesMap[b.seriesSlug];
      const levelDef = series?.levels.find((l) => l.level === b.level);
      return { seriesSlug: b.seriesSlug, seriesName: series?.name, level: b.level, name: levelDef?.name, emoji: levelDef?.emoji, description: levelDef?.description, awardedAt: b.updatedAt };
    });
    res.json(badges);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Car model pages (aggregate per manufacturer + model) ─────────────────────

// URL slugs are lowercase with hyphens for spaces, e.g. "Mercedes-Benz" → "mercedes-benz".
// On lookup we reverse the slug to a regex and do case-insensitive matching against
// the canonical mfr/model values stored on each Car.
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function slugToRegex(slug) {
  // hyphens in the slug come from either spaces in the original name OR
  // genuine hyphens in the name (e.g. "Mercedes-Benz", "S-Class"). Match either.
  const pattern = "^" + escapeRegex(slug).replace(/-/g, "[ -]") + "$";
  return new RegExp(pattern, "i");
}

app.get("/api/models/:mfr/:model", async (req, res) => {
  try {
    const mfrRegex = slugToRegex(req.params.mfr);
    const modelRegex = slugToRegex(req.params.model);

    const carDocs = await Car.find({ manufacturer: mfrRegex, model: modelRegex });
    const cars = await attachOwnershipToMany(carDocs);

    if (cars.length === 0) {
      return res.status(404).json({ error: "Model not found" });
    }

    // Canonicalize names from the first match (Mongo gave us actual stored case).
    const manufacturer = cars[0].manufacturer;
    const model = cars[0].model;

    const carIds = cars.map((c) => c._id);

    // All experiences for any instance of this model, newest first
    const experiences = await Experience.find({ car: { $in: carIds } })
      .populate("car")
      .populate("loggedBy", "name email avatarUrl")
      .sort({ date: -1 })
      .lean();

    // Attach reactions to each experience
    const expIds = experiences.map((e) => e._id);
    const allReactions = await Reaction.find({ experience: { $in: expIds } })
      .populate("human", "name")
      .lean();
    const reactionsByExp = new Map();
    for (const r of allReactions) {
      const k = String(r.experience);
      if (!reactionsByExp.has(k)) reactionsByExp.set(k, []);
      reactionsByExp.get(k).push(r);
    }
    for (const e of experiences) {
      e.reactions = reactionsByExp.get(String(e._id)) ?? [];
    }

    // Community rating: average of all rated experiences for this model
    const rated = experiences.filter((e) => e.rating != null);
    const ratingAverage = rated.length
      ? rated.reduce((s, e) => s + e.rating, 0) / rated.length
      : null;

    res.json({
      manufacturer,
      model,
      cars,
      experiences,
      rating: {
        average: ratingAverage,
        count: rated.length,
        totalExperiences: experiences.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Test seed endpoint (only available against carsDB_test) ──────────────────
if (DB_NAME === "carsDB_test") {
  // Wipe only badges and experiences — leaves humans/cars/manufacturers intact
  app.post("/api/test/reset-badges", async (req, res) => {
    try {
      const db = mongoose.connection.db;
      for (const col of ["experiences", "reactions", "userbadges"]) {
        await db.collection(col).drop().catch(() => {});
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/test/seed", async (req, res) => {
    try {
      const db = mongoose.connection.db;
      for (const col of ["humans", "cars", "experiences", "reactions", "userbadges", "follows", "manufacturers"]) {
        await db.collection(col).drop().catch(() => {});
      }

      const toId = (hex) => new mongoose.Types.ObjectId(hex);

      await Human.insertMany([
        { _id: toId("aaaaaaaaaaaaaaaaaaaaaaaa"), name: "Sam Lawrence", email: "sam@samelawrence.com", avatarUrl: "https://randomuser.me/api/portraits/men/32.jpg" },
        { _id: toId("bbbbbbbbbbbbbbbbbbbbbbbb"), name: "Alex Rivera", email: "alex@example.com", avatarUrl: "https://randomuser.me/api/portraits/men/45.jpg" },
      ]);

      await Manufacturer.insertMany([
        { _id: toId("111111111111111111111111"), name: "Honda", models: ["Civic", "Accord", "CR-V"], colors: { "*": [{ name: "White", hex: "#ffffff" }, { name: "Black", hex: "#000000" }] }, trims: {} },
        { _id: toId("222222222222222222222222"), name: "Chevrolet", models: ["Impala", "Camaro", "Silverado"], colors: {}, trims: {} },
        { _id: toId("333333333333333333333333"), name: "Tesla", models: ["Model 3", "Model S", "Model Y"], colors: {}, trims: {} },
      ]);

      await Car.insertMany([
        { _id: toId("cccccccccccccccccccccccc"), manufacturer: "Honda", model: "Civic", year: 2012, nickname: "Rhonda the Honda", transmission: "Manual", ownershipHistory: [{ owner: toId("aaaaaaaaaaaaaaaaaaaaaaaa"), from: null, to: null }], photos: [] },
        { _id: toId("dddddddddddddddddddddddd"), manufacturer: "Chevrolet", model: "Impala", year: 2015, transmission: "Automatic", ownershipHistory: [], photos: [] },
        { _id: toId("eeeeeeeeeeeeeeeeeeeeeeee"), manufacturer: "Tesla", model: "Model 3", year: 2023, transmission: "Electric", ownershipHistory: [], photos: [] },
      ]);

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
