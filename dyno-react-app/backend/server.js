require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const { clerkMiddleware, getAuth, clerkClient } = require("@clerk/express");
const cloudinary = require("cloudinary").v2;

const app = express();
app.use(express.json());

// CORS: in dev, allow everything. In production, restrict to FRONTEND_ORIGIN.
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN;
if (FRONTEND_ORIGIN) {
  app.use(cors({ origin: FRONTEND_ORIGIN.split(",").map((s) => s.trim()) }));
} else {
  app.use(cors());
}

const IS_TEST = (process.env.MONGO_DB || "carsDB") === "carsDB_test";

// Auth middleware:
// - In test mode, we bypass Clerk and read `x-test-user-id` directly so tests can
//   act as fixture users without going through magic-link flows.
// - In normal mode, Clerk's middleware attaches `req.auth` if a valid session JWT
//   is present (sent by the frontend as a Bearer token).
if (IS_TEST) {
  app.use((req, _res, next) => {
    const testUserId = req.header("x-test-user-id");
    if (testUserId) req.testUserId = testUserId;
    next();
  });
} else {
  app.use(clerkMiddleware());
}

// Cloudinary: SDK reads CLOUDINARY_URL from env automatically when called like this.
// We keep photos in memory only during the request; the buffer is streamed to
// Cloudinary and never touches disk. This works on ephemeral-filesystem hosts.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function uploadBufferToCloudinary(buffer, folder = "dyno") {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

// Best-effort delete from Cloudinary by public_id. Swallows errors so a DB delete
// can still succeed even if Cloudinary is slow/down.
async function deleteFromCloudinary(publicId) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.warn("Cloudinary delete failed:", err.message);
  }
}

const DB_NAME = process.env.MONGO_DB || "carsDB";
// In production we pass a full Atlas-style URI via MONGODB_URI. Locally we fall back
// to localhost:27017 with the named database.
const MONGODB_URI = process.env.MONGODB_URI || `mongodb://localhost:27017/${DB_NAME}`;
mongoose
  .connect(MONGODB_URI)
  .then(async () => {
    console.log("Connected to MongoDB");
    await migrateLegacyOwners();
    await seedBadgeSeries();
    await seedManufacturers();
    await migrateLegacyColors();
    // Ensure schema-declared indexes (e.g. Car.vin unique, Human.clerkId unique) are actually built
    await Car.syncIndexes();
    await Human.syncIndexes();
  })
  .catch((err) => console.error("Error connecting to MongoDB:", err));

// ── Schemas ──────────────────────────────────────────────────────────────────

const humanSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: String,
  avatarUrl: String,
  clerkId: { type: String },
  // Synced from Clerk on each /api/me call. Partial index covers only docs that
  // have an actual string value, so missing/null usernames don't collide.
  username: { type: String },
});
humanSchema.index({ clerkId: 1 }, { unique: true, sparse: true });
humanSchema.index(
  { username: 1 },
  { unique: true, partialFilterExpression: { username: { $type: "string" } } }
);
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
  // public_id is set when the photo lives in Cloudinary (so we can delete it).
  // Null/undefined for external photos added via /photos/url.
  cloudinaryPublicId: { type: String, default: null },
  caption: String,
  createdAt: { type: Date, default: Date.now },
});
const Photo = mongoose.model("Photo", photoSchema);

// Color is structured to track whether it's a canonical manufacturer color or a
// custom (aftermarket) one, plus an optional hex swatch.
const carColorSchema = new mongoose.Schema({
  name: String,
  hex: String,                     // optional; canonical colors have one, custom may not
  isCustom: { type: Boolean, default: false },
}, { _id: false });

const carSchema = new mongoose.Schema({
  manufacturer: String,
  model: String,
  year: Number,
  nickname: String,
  transmission: String,
  colorInfo: { type: carColorSchema, default: null },
  trim: String,
  vin: String,
  thumbnailPhoto: { type: mongoose.Schema.Types.ObjectId, ref: "Photo", default: null },
  // legacy field — kept so Mongoose can read/unset it during migration
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "Human", default: null },
});
// VIN is required for new cars; existing VIN-less rows are grandfathered (sparse index).
carSchema.index({ vin: 1 }, { unique: true, sparse: true });
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
  location: {
    display: { type: String, default: null },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },
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

const wishlistSchema = new mongoose.Schema({
  human: { type: mongoose.Schema.Types.ObjectId, ref: "Human", required: true },
  manufacturer: { type: String, required: true },
  model: { type: String, required: true },
  yearFrom: { type: Number, default: null },
  yearTo: { type: Number, default: null },
}, { timestamps: true });
wishlistSchema.index({ human: 1, manufacturer: 1, model: 1 }, { unique: true });
const WishlistItem = mongoose.model("WishlistItem", wishlistSchema);

// True if a car-year falls within a wishlist item's year range.
// null/null = any year. null on one end = open-ended on that side.
function yearMatchesWishlist(carYear, yearFrom, yearTo) {
  if (yearFrom == null && yearTo == null) return true;
  if (yearFrom != null && carYear < yearFrom) return false;
  if (yearTo != null && carYear > yearTo) return false;
  return true;
}

// Look up the list of trims defined for a (manufacturer, model) pair. Returns
// `[]` if no manufacturer match or no trims set up for that model.
function trimsForModel(mfr, model) {
  if (!mfr?.trims) return [];
  // Mongoose Maps expose .get(); plain objects use bracket access. Support both
  // so this works whether the caller passes a hydrated doc or .lean() result.
  const raw = typeof mfr.trims.get === "function" ? mfr.trims.get(model) : mfr.trims[model];
  return Array.isArray(raw) ? raw : [];
}

// Validates a trim string against the manufacturer's registered trims for a
// model and year. Returns null on success, an error message on failure.
//
// Rules:
// - Model has no trims defined at all → free-form (any string OK, blank OK).
// - Model has trims, but none cover the requested year → fall back to free-form.
//   This avoids trapping users on years admins haven't seeded yet.
// - Model has trims that cover the requested year → trim must be one of them.
function validateTrim(mfr, model, year, trim) {
  const trims = trimsForModel(mfr, model);
  if (trims.length === 0) return null;
  const trimsForYear =
    year == null
      ? trims
      : trims.filter((t) => t.years.some((y) => yearMatchesWishlist(Number(year), y.from, y.to)));
  if (trimsForYear.length === 0) return null; // nothing to validate against
  if (!trim) return `Trim is required for ${mfr.name} ${model}`;
  const match = trimsForYear.find((t) => t.name === trim);
  if (!match) return `"${trim}" is not a valid trim for ${mfr.name} ${model} in ${year}`;
  return null;
}

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

// Backfill legacy plain-string `color` into the new structured `colorInfo` field.
// We look up the manufacturer's canonical color list for the car's model — if the
// color name matches, it's canonical (we copy the hex too); otherwise we mark it
// custom. The legacy `color` field is unset once moved so we have one source of
// truth going forward.
async function migrateLegacyColors() {
  // The legacy `color` field is no longer on the Mongoose schema, so we go
  // directly through the raw collection to read it. Once the migration has run
  // on a deployment, this query returns 0 docs and is a fast no-op.
  const cars = await mongoose.connection.db.collection("cars").find({
    color: { $exists: true, $ne: null, $ne: "" },
    $or: [{ colorInfo: null }, { colorInfo: { $exists: false } }],
  }).toArray();
  if (cars.length === 0) return;

  // Pre-load all manufacturers once so we don't refetch per car
  const manufacturers = await Manufacturer.find().lean();
  const mfrByName = new Map(manufacturers.map((m) => [m.name, m]));

  for (const car of cars) {
    const mfr = mfrByName.get(car.manufacturer);
    const canonical = mfr?.colors
      ? (mfr.colors instanceof Map ? mfr.colors.get(car.model) || mfr.colors.get("*") : mfr.colors[car.model] || mfr.colors["*"])
      : null;
    const match = Array.isArray(canonical) ? canonical.find((c) => c.name === car.color) : null;
    const colorInfo = match
      ? { name: match.name, hex: match.hex, isCustom: false }
      : { name: car.color, isCustom: true };
    await Car.updateOne({ _id: car._id }, { $set: { colorInfo }, $unset: { color: "" } });
  }
  console.log(`Backfilled colorInfo on ${cars.length} car(s)`);
}

// Starter list of common manufacturers + a handful of models each. Idempotent —
// only inserts brands that don't already exist, so adding/removing entries here
// is safe (existing data is never overwritten). Admins can add more from the UI.
async function seedManufacturers() {
  const starters = [
    { name: "Acura",      models: ["Integra", "MDX", "NSX", "RDX", "TLX"] },
    { name: "Audi",       models: ["A3", "A4", "A6", "Q5", "R8"] },
    { name: "BMW",        models: ["3 Series", "5 Series", "M3", "X5", "i4"] },
    { name: "Chevrolet",  models: ["Camaro", "Corvette", "Impala", "Silverado", "Suburban"] },
    { name: "Dodge",      models: ["Challenger", "Charger", "Ram 1500"] },
    { name: "Ferrari",    models: ["296 GTB", "F8", "Roma", "SF90"] },
    { name: "Ford",       models: ["Bronco", "F-150", "Mustang", "Ranger"] },
    { name: "Honda",      models: ["Accord", "Civic", "CR-V", "Pilot"] },
    { name: "Hyundai",    models: ["Elantra", "Ioniq 5", "Santa Fe", "Sonata"] },
    { name: "Jeep",       models: ["Cherokee", "Gladiator", "Grand Cherokee", "Wrangler"] },
    { name: "Lexus",      models: ["ES", "IS", "LC", "LX", "RX"] },
    { name: "Mazda",      models: ["CX-5", "MX-5 Miata", "Mazda3", "Mazda6"] },
    { name: "Mercedes-Benz", models: ["C-Class", "E-Class", "G-Class", "S-Class"] },
    { name: "Nissan",     models: ["Altima", "GT-R", "Rogue", "Z"] },
    { name: "Porsche",    models: ["911", "Boxster", "Cayenne", "Taycan"] },
    { name: "Rivian",     models: ["R1S", "R1T"] },
    { name: "Subaru",     models: ["BRZ", "Forester", "Outback", "WRX"] },
    { name: "Tesla",      models: ["Cybertruck", "Model 3", "Model S", "Model X", "Model Y"] },
    { name: "Toyota",     models: ["4Runner", "Camry", "Corolla", "Land Cruiser", "Supra", "Tacoma"] },
    { name: "Volkswagen", models: ["Atlas", "Golf", "ID.4", "Jetta"] },
  ];
  let inserted = 0;
  for (const s of starters) {
    const existing = await Manufacturer.findOne({ name: s.name });
    if (!existing) {
      await Manufacturer.create({ name: s.name, models: s.models, colors: {}, trims: {} });
      inserted++;
    }
  }
  if (inserted > 0) console.log(`Seeded ${inserted} new manufacturer(s)`);
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
  ];
  for (const s of series) {
    await BadgeSeries.findOneAndUpdate({ slug: s.slug }, s, { upsert: true, new: true });
  }
  // Remove deprecated series so the all-badges page doesn't display them
  await BadgeSeries.deleteMany({ slug: { $nin: series.map((s) => s.slug) } });
  await UserBadge.deleteMany({ seriesSlug: { $nin: series.map((s) => s.slug) } });
  console.log(`Badge series seeded (${series.length} series)`);
}

const EV_MANUFACTURERS = new Set(["Tesla", "Rivian", "Lucid", "Polestar", "Fisker", "NIO"]);

// thresholds[i] is the count needed to reach level i+1.
const BADGE_DEFS = {
  "drive-count":      { unit: "drives",        thresholds: [1, 10, 50, 100, 250] },
  "spot-count":       { unit: "spots",         thresholds: [1, 10, 50, 100] },
  "brand-explorer":   { unit: "brands",        thresholds: [2, 5, 10] },
  "stick-shift":      { unit: "manual drives", thresholds: [1, 10, 25] },
  "ev-pioneer":       { unit: "EV drives",     thresholds: [1, 5, 10] },
  "community":        { unit: "follows",       thresholds: [1, 5, 10] },
  "decade-collector": { unit: "decades",       thresholds: [2, 3, 5] },
};

const BADGE_COUNTERS = {
  "drive-count":    (humanId) => Experience.countDocuments({ loggedBy: humanId, type: "drove" }),
  "spot-count":     (humanId) => Experience.countDocuments({ loggedBy: humanId, type: "spotted" }),
  "brand-explorer": async (humanId) => {
    const exps = await Experience.find({ loggedBy: humanId, type: "drove" }).populate("car", "manufacturer");
    return new Set(exps.map((e) => e.car?.manufacturer).filter(Boolean)).size;
  },
  "stick-shift": async (humanId) => {
    const exps = await Experience.find({ loggedBy: humanId, type: "drove" }).populate("car", "transmission");
    return exps.filter((e) => e.car?.transmission === "Manual").length;
  },
  "ev-pioneer": async (humanId) => {
    const exps = await Experience.find({ loggedBy: humanId, type: "drove" }).populate("car", "manufacturer transmission");
    return exps.filter((e) => {
      const t = e.car?.transmission;
      const m = e.car?.manufacturer;
      return t === "Electric" || EV_MANUFACTURERS.has(m);
    }).length;
  },
  "community":     (humanId) => Follow.countDocuments({ follower: humanId }),
  "decade-collector": async (humanId) => {
    const exps = await Experience.find({ loggedBy: humanId, type: "drove" }).populate("car", "year");
    return new Set(exps.map((e) => e.car?.year ? Math.floor(e.car.year / 10) * 10 : null).filter(Boolean)).size;
  },
};

function levelForCount(count, thresholds) {
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (count >= thresholds[i]) return i + 1;
  }
  return 0;
}

const BADGE_EVALUATORS = Object.fromEntries(
  Object.keys(BADGE_DEFS).map((slug) => [
    slug,
    async (humanId) => levelForCount(await BADGE_COUNTERS[slug](humanId), BADGE_DEFS[slug].thresholds),
  ])
);

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
  if (carDocs.length === 0) return [];
  const cars = carDocs.map((c) => (c.toObject ? c.toObject() : { ...c }));
  const carIds = cars.map((c) => c._id);

  const [ownerships, photos] = await Promise.all([
    Ownership.find({ car: { $in: carIds } })
      .populate("owner", "name email")
      .sort({ from: 1 }),
    Photo.find({ car: { $in: carIds } })
      .populate("uploadedBy", "name")
      .sort({ createdAt: 1 }),
  ]);

  const ownershipsByCar = {};
  for (const o of ownerships) {
    const key = String(o.car);
    if (!ownershipsByCar[key]) ownershipsByCar[key] = [];
    ownershipsByCar[key].push(o);
  }
  const photosByCar = {};
  for (const p of photos) {
    const key = String(p.car);
    if (!photosByCar[key]) photosByCar[key] = [];
    photosByCar[key].push(p);
  }

  return cars.map((car) => {
    const carOwnerships = ownershipsByCar[String(car._id)] || [];
    const carPhotos = photosByCar[String(car._id)] || [];
    car.currentOwners = carOwnerships.filter((o) => !o.to).map((o) => o.owner);
    car.ownershipHistory = carOwnerships;
    car.photos = carPhotos;
    if (car.thumbnailPhoto) {
      car.thumbnail = carPhotos.find((p) => String(p._id) === String(car.thumbnailPhoto)) || carPhotos[0] || null;
    } else {
      car.thumbnail = carPhotos[0] || null;
    }
    return car;
  });
}

// Serialize an Experience for API output using a strict whitelist. Any field
// not listed here is dropped — adding a private field to the schema is then a
// "this field won't appear in responses until you decide where it goes"
// situation, which is the safer default.
//
// `public` is returned to every caller. `authorOnly` is added only when the
// viewer is the experience's author.
const EXPERIENCE_PUBLIC_FIELDS = [
  "_id", "type", "date", "notes", "rating", "loggedBy", "car", "reactions",
];
const EXPERIENCE_AUTHOR_ONLY_FIELDS = ["location"];

function serializeExperience(exp, { viewerId } = {}) {
  const src = exp && exp.toObject ? exp.toObject() : (exp || {});
  const authorId = src.loggedBy && (src.loggedBy._id || src.loggedBy);
  const isAuthor = !!viewerId && !!authorId && String(authorId) === String(viewerId);
  const out = {};
  for (const f of EXPERIENCE_PUBLIC_FIELDS) {
    if (src[f] !== undefined) out[f] = src[f];
  }
  if (isAuthor) {
    for (const f of EXPERIENCE_AUTHOR_ONLY_FIELDS) {
      if (src[f] !== undefined) out[f] = src[f];
    }
  }
  return out;
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

// Resolve the calling user's Human record, creating one on first login.
// In test mode, looks up by `x-test-user-id` header (a Mongo _id of a fixture user).
// In normal mode, reads `req.auth.userId` (Clerk user id) and links to a Human by `clerkId`,
// auto-provisioning if it's the user's first request.
async function getCurrentHuman(req) {
  if (IS_TEST) {
    if (!req.testUserId) return null;
    return Human.findById(req.testUserId);
  }
  const auth = getAuth(req);
  if (!auth?.userId) return null;

  // Fetch Clerk profile once per request so we can both provision new users and
  // sync username changes for existing ones.
  const clerkUser = await clerkClient.users.getUser(auth.userId);
  const email = clerkUser.primaryEmailAddress?.emailAddress || clerkUser.emailAddresses?.[0]?.emailAddress;
  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || email || "New user";
  const avatarUrl = clerkUser.imageUrl || undefined;
  const username = clerkUser.username || undefined;

  let human = await Human.findOne({ clerkId: auth.userId });
  if (human) {
    // Sync username + avatar when Clerk values drift from what we stored.
    const currentUsername = human.username || undefined;
    if (currentUsername !== username || human.avatarUrl !== avatarUrl) {
      // Unset rather than set to null so the partial unique index stays clean.
      if (username) {
        human.username = username;
      } else if (human.username) {
        human.username = undefined;
      }
      if (avatarUrl) human.avatarUrl = avatarUrl;
      await human.save();
    }
    return human;
  }

  const newDoc = { name, email, avatarUrl, clerkId: auth.userId };
  if (username) newDoc.username = username;
  human = await Human.create(newDoc);
  return human;
}

// Express middleware: 401 if no current user, otherwise attaches `req.currentHuman`.
async function requireAuth(req, res, next) {
  try {
    const human = await getCurrentHuman(req);
    if (!human) return res.status(401).json({ error: "Authentication required" });
    req.currentHuman = human;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Comma-separated list of admin emails. Matching is case-insensitive.
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

function isAdmin(human) {
  return !!human?.email && ADMIN_EMAILS.has(human.email.toLowerCase());
}

// Express middleware: 403 if the authenticated user isn't in ADMIN_EMAILS.
async function requireAdmin(req, res, next) {
  try {
    const human = await getCurrentHuman(req);
    if (!human) return res.status(401).json({ error: "Authentication required" });
    if (!isAdmin(human)) return res.status(403).json({ error: "Admin access required" });
    req.currentHuman = human;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── Humans ────────────────────────────────────────────────────────────────────

// Health check for the platform's uptime probes. Returns 200 if the server is up
// and Mongo is connected, 503 otherwise. Intentionally not under /api/ so platform
// configs that proxy /api/* don't need to special-case it.
app.get("/healthz", (req, res) => {
  const dbReady = mongoose.connection.readyState === 1; // 1 = connected
  res.status(dbReady ? 200 : 503).json({ ok: dbReady, db: dbReady ? "up" : "down" });
});

app.get("/api/humans", async (req, res) => {
  try {
    res.json(await Human.find().sort({ name: 1 }));
  } catch {
    res.status(500).send("Error fetching humans");
  }
});

// Returns the Human record for the signed-in user, provisioning one on first call.
// Frontend hits this after Clerk sign-in to learn the user's Mongo _id.
app.get("/api/me", requireAuth, async (req, res) => {
  // Spread so we don't mutate the cached Mongoose doc, then attach the env-derived flag.
  const human = req.currentHuman.toObject ? req.currentHuman.toObject() : { ...req.currentHuman };
  human.isAdmin = isAdmin(req.currentHuman);
  res.json(human);
});

// Legacy: Humans are now provisioned automatically by Clerk on first authenticated
// request (see getCurrentHuman). This endpoint stays for tests but requires auth.
app.post("/api/humans", requireAuth, async (req, res) => {
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

// Admin-only: create a manufacturer with an optional initial models list.
app.post("/api/manufacturers", requireAdmin, async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "name is required" });
    const models = Array.isArray(req.body.models) ? req.body.models.map((m) => String(m).trim()).filter(Boolean) : [];
    const existing = await Manufacturer.findOne({ name });
    if (existing) return res.status(409).json({ error: "Manufacturer already exists" });
    const mfr = await Manufacturer.create({ name, models, colors: {}, trims: {} });
    res.status(201).json(mfr);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin-only: add a new model to an existing manufacturer (no-op if already present).
app.patch("/api/manufacturers/:id/models", requireAdmin, async (req, res) => {
  try {
    const model = (req.body.model || "").trim();
    if (!model) return res.status(400).json({ error: "model is required" });
    const mfr = await Manufacturer.findById(req.params.id);
    if (!mfr) return res.status(404).json({ error: "Manufacturer not found" });
    if (!mfr.models.includes(model)) {
      mfr.models.push(model);
      mfr.models.sort();
      await mfr.save();
    }
    res.json(mfr);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin-only: remove a model from a manufacturer (only if no Cars use it).
app.delete("/api/manufacturers/:id/models/:model", requireAdmin, async (req, res) => {
  try {
    const { id, model } = req.params;
    const mfr = await Manufacturer.findById(id);
    if (!mfr) return res.status(404).json({ error: "Manufacturer not found" });
    const inUse = await Car.findOne({ manufacturer: mfr.name, model });
    if (inUse) return res.status(409).json({ error: "Model is in use by one or more cars" });
    mfr.models = mfr.models.filter((m) => m !== model);
    // Clean up any trim entries for this model — otherwise we'd orphan them.
    if (mfr.trims && mfr.trims.has(model)) {
      mfr.trims.delete(model);
    }
    await mfr.save();
    res.json(mfr);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin-only: replace the full trim list for a (manufacturer, model). The request
// body is the canonical new list; existing entries for that model are overwritten.
// Each trim is `{ name, years: [{from, to}] }`. Both `from` and `to` may be null
// (open-ended on that side). The trim list for other models is left untouched.
app.put("/api/manufacturers/:id/trims/:model", requireAdmin, async (req, res) => {
  try {
    const { id, model } = req.params;
    const mfr = await Manufacturer.findById(id);
    if (!mfr) return res.status(404).json({ error: "Manufacturer not found" });
    if (!mfr.models.includes(model)) {
      return res.status(400).json({ error: `Model "${model}" not in manufacturer's model list` });
    }

    const incoming = Array.isArray(req.body.trims) ? req.body.trims : [];
    const normalized = [];
    for (const t of incoming) {
      const name = String(t?.name || "").trim();
      if (!name) continue; // skip blank-name rows silently
      const years = Array.isArray(t.years) ? t.years.map((y) => ({
        from: y?.from == null || y?.from === "" ? null : Number(y.from),
        to: y?.to == null || y?.to === "" ? null : Number(y.to),
      })).filter((y) => !(y.from == null && y.to == null)) : [];
      // Validate each range
      for (const y of years) {
        if (y.from != null && (!Number.isFinite(y.from) || y.from < 1900 || y.from > 2100)) {
          return res.status(400).json({ error: `Invalid 'from' year in trim "${name}"` });
        }
        if (y.to != null && (!Number.isFinite(y.to) || y.to < 1900 || y.to > 2100)) {
          return res.status(400).json({ error: `Invalid 'to' year in trim "${name}"` });
        }
        if (y.from != null && y.to != null && y.from > y.to) {
          return res.status(400).json({ error: `'from' must be ≤ 'to' in trim "${name}"` });
        }
      }
      normalized.push({ name, years });
    }

    if (!mfr.trims) mfr.trims = new Map();
    mfr.trims.set(model, normalized);
    await mfr.save();
    res.json(mfr);
  } catch (err) {
    res.status(400).json({ error: err.message });
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

app.post("/api/cars", requireAuth, async (req, res) => {
  try {
    const { manufacturer, model, year, nickname, transmission, colorInfo, trim, vin } = req.body;
    if (!manufacturer || !model || !year) {
      return res.status(400).json({ error: "manufacturer, model, and year are required" });
    }
    // VIN is optional. If provided, the sparse unique index still keeps duplicates out.
    // Pass undefined (not empty string) so Mongo doesn't store a "" value that would
    // collide with the unique index against other empty-string VINs.
    const trimmedVin = typeof vin === "string" ? vin.trim() : "";
    const vinValue = trimmedVin || undefined;

    const mfr = await Manufacturer.findOne({ name: manufacturer });
    if (!mfr) return res.status(400).json({ error: "invalid manufacturer" });
    if (!mfr.models.includes(model))
      return res.status(400).json({ error: `invalid model for manufacturer ${manufacturer}` });

    const trimError = validateTrim(mfr, model, year, trim);
    if (trimError) return res.status(400).json({ error: trimError });

    const normalizedColor = colorInfo && colorInfo.name
      ? { name: String(colorInfo.name).trim(), hex: colorInfo.hex || undefined, isCustom: !!colorInfo.isCustom }
      : null;

    try {
      const car = await new Car({
        manufacturer, model, year, nickname, transmission, trim,
        vin: vinValue,
        colorInfo: normalizedColor,
      }).save();
      res.status(201).json(await attachOwnership(car));
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ error: "A car with this VIN already exists" });
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: err.message || "Error creating car" });
  }
});

app.put("/api/cars/:id", requireAuth, async (req, res) => {
  try {
    const { manufacturer, model, year, trim } = req.body;
    const car = await Car.findById(req.params.id);
    if (!car) return res.status(404).json({ error: "Car not found" });

    // Compute effective values once for use in both manufacturer/model and trim validation.
    const effectiveMfrName = manufacturer || car.manufacturer;
    const effectiveModel = model || car.model;
    const effectiveYear = year != null ? year : car.year;
    const effectiveTrim = trim !== undefined ? trim : car.trim;

    if (manufacturer || model) {
      const mfr = await Manufacturer.findOne({ name: effectiveMfrName });
      if (!mfr) return res.status(400).json({ error: "invalid manufacturer" });
      if (!mfr.models.includes(effectiveModel))
        return res.status(400).json({ error: `invalid model for manufacturer ${effectiveMfrName}` });
    }

    // Validate trim against the effective (mfr, model, year). Re-fetch in case
    // the body didn't include manufacturer.
    if (trim !== undefined || year !== undefined || model !== undefined || manufacturer !== undefined) {
      const mfrDoc = await Manufacturer.findOne({ name: effectiveMfrName });
      if (mfrDoc) {
        const trimError = validateTrim(mfrDoc, effectiveModel, effectiveYear, effectiveTrim);
        if (trimError) return res.status(400).json({ error: trimError });
      }
    }

    const { owner: _owner, colorInfo, ...updateFields } = req.body;
    // Normalize colorInfo if supplied
    if (colorInfo !== undefined) {
      updateFields.colorInfo = colorInfo && colorInfo.name
        ? { name: String(colorInfo.name).trim(), hex: colorInfo.hex || undefined, isCustom: !!colorInfo.isCustom }
        : null;
    }
    const updated = await Car.findByIdAndUpdate(req.params.id, updateFields, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ error: "Car not found" });
    res.json(await attachOwnership(updated));
  } catch (err) {
    res.status(500).json({ error: err.message || "Error updating car" });
  }
});

app.delete("/api/cars/:id", requireAuth, async (req, res) => {
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
app.post("/api/cars/:id/photos", requireAuth, upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const { caption } = req.body;
    const result = await uploadBufferToCloudinary(req.file.buffer, `dyno/cars/${req.params.id}`);
    const photo = await new Photo({
      car: req.params.id,
      uploadedBy: req.currentHuman._id,
      url: result.secure_url,
      cloudinaryPublicId: result.public_id,
      caption,
    }).save();
    await photo.populate("uploadedBy", "name");
    res.status(201).json(photo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a photo by URL (for seeding / external images)
app.post("/api/cars/:id/photos/url", requireAuth, async (req, res) => {
  try {
    const { url, caption } = req.body;
    if (!url) return res.status(400).json({ error: "url is required" });
    const photo = await new Photo({ car: req.params.id, uploadedBy: req.currentHuman._id, url, caption }).save();
    await photo.populate("uploadedBy", "name");
    res.status(201).json(photo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a photo
app.delete("/api/photos/:id", requireAuth, async (req, res) => {
  try {
    const photo = await Photo.findByIdAndDelete(req.params.id);
    if (!photo) return res.status(404).json({ error: "Photo not found" });
    // Remove from Cloudinary if the photo was uploaded there. External URLs (added
    // via /photos/url) won't have a publicId — those just go away on DB delete.
    await deleteFromCloudinary(photo.cloudinaryPublicId);
    // Clear thumbnailPhoto reference if it pointed to this photo
    await Car.updateMany({ thumbnailPhoto: photo._id }, { $unset: { thumbnailPhoto: "" } });
    res.json({ message: "Photo deleted" });
  } catch {
    res.status(500).send("Error deleting photo");
  }
});

// Set thumbnail photo for a car
app.patch("/api/cars/:id/thumbnail", requireAuth, async (req, res) => {
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

app.post("/api/ownerships", requireAuth, async (req, res) => {
  try {
    const { car, owner, from, to } = req.body;
    if (!car || !owner) return res.status(400).json({ error: "car and owner are required" });

    const now = Date.now();
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    if (fromDate && fromDate.getTime() > now) {
      return res.status(400).json({ error: "Ownership start date cannot be in the future" });
    }
    if (toDate && toDate.getTime() > now) {
      return res.status(400).json({ error: "Ownership end date cannot be in the future" });
    }
    if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
      return res.status(400).json({ error: "Ownership start date must be before end date" });
    }

    const record = await new Ownership({ car, owner, from: fromDate, to: toDate }).save();
    await record.populate("owner", "name email");
    res.status(201).json(record);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch("/api/ownerships/:id/end", requireAuth, async (req, res) => {
  try {
    const now = Date.now();
    const to = req.body.to ? new Date(req.body.to) : new Date();
    if (to.getTime() > now) {
      return res.status(400).json({ error: "Ownership end date cannot be in the future" });
    }
    const record = await Ownership.findByIdAndUpdate(
      req.params.id,
      { to },
      { new: true }
    ).populate("owner", "name email");
    if (!record) return res.status(404).json({ error: "Ownership not found" });
    res.json(record);
  } catch {
    res.status(500).send("Error ending ownership");
  }
});

app.delete("/api/ownerships/:id", requireAuth, async (req, res) => {
  try {
    const deleted = await Ownership.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Ownership not found" });
    res.json({ message: "Ownership deleted" });
  } catch {
    res.status(500).send("Error deleting ownership");
  }
});

// Edit an ownership's from/to dates. Same future-date and ordering rules as POST.
// Pass null to clear a date; omit the field to leave it untouched.
app.put("/api/ownerships/:id", requireAuth, async (req, res) => {
  try {
    const record = await Ownership.findById(req.params.id);
    if (!record) return res.status(404).json({ error: "Ownership not found" });

    const now = Date.now();
    const fromProvided = Object.prototype.hasOwnProperty.call(req.body, "from");
    const toProvided = Object.prototype.hasOwnProperty.call(req.body, "to");
    const newFrom = fromProvided ? (req.body.from ? new Date(req.body.from) : null) : record.from;
    const newTo = toProvided ? (req.body.to ? new Date(req.body.to) : null) : record.to;

    if (newFrom && newFrom.getTime() > now) {
      return res.status(400).json({ error: "Ownership start date cannot be in the future" });
    }
    if (newTo && newTo.getTime() > now) {
      return res.status(400).json({ error: "Ownership end date cannot be in the future" });
    }
    if (newFrom && newTo && newFrom.getTime() > newTo.getTime()) {
      return res.status(400).json({ error: "Ownership start date must be before end date" });
    }

    record.from = newFrom;
    record.to = newTo;
    await record.save();
    await record.populate("owner", "name email");
    res.json(record);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Experiences ───────────────────────────────────────────────────────────────

app.get("/api/experiences", async (req, res) => {
  try {
    const requester = await getCurrentHuman(req);
    const requesterId = requester ? String(requester._id) : null;
    let filter = {};
    if (req.query.followedBy) {
      if (!requesterId) return res.status(401).json({ error: "Authentication required" });
      const followerId = req.query.followedBy === "me" ? requesterId : String(req.query.followedBy);
      if (followerId !== requesterId) return res.status(403).json({ error: "Cannot query another user's feed" });
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
    const enrichedCars = await attachOwnershipToMany(experiences.map((e) => e.car));
    const carById = {};
    for (const c of enrichedCars) carById[String(c._id)] = c;
    const result = experiences.map((exp) => {
      const expObj = exp.toObject();
      expObj.car = carById[String(exp.car._id)];
      expObj.reactions = reactionsByExp[String(exp._id)] || [];
      return serializeExperience(expObj, { viewerId: requesterId });
    });
    res.json(result);
  } catch {
    res.status(500).send("Error fetching experiences");
  }
});

app.post("/api/experiences", requireAuth, async (req, res) => {
  try {
    const { car, type, notes, rating, location } = req.body;
    if (!car || !type) return res.status(400).json({ error: "car and type are required" });
    const loggedBy = req.currentHuman._id;
    const loc = location?.display ? { display: location.display, lat: location.lat ?? null, lng: location.lng ?? null } : undefined;
    const experience = new Experience({ car, type, notes, rating: rating ?? null, loggedBy, location: loc });
    await experience.save();
    await experience.populate("loggedBy", "name email avatarUrl");

    // If this is a drove experience, remove any wishlist items that this car satisfies
    if (type === "drove") {
      const carDoc = await Car.findById(car).lean();
      if (carDoc) {
        const items = await WishlistItem.find({
          human: loggedBy,
          manufacturer: carDoc.manufacturer,
          model: carDoc.model,
        });
        for (const item of items) {
          if (yearMatchesWishlist(carDoc.year, item.yearFrom, item.yearTo)) {
            await WishlistItem.deleteOne({ _id: item._id });
          }
        }
      }
    }

    const newBadges = await evaluateBadges(loggedBy);
    res.status(201).json({ experience, newBadges });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/experiences/:id", requireAuth, async (req, res) => {
  try {
    const exp = await Experience.findById(req.params.id);
    if (!exp) return res.status(404).json({ error: "Experience not found" });
    if (String(exp.loggedBy) !== String(req.currentHuman._id)) {
      return res.status(403).json({ error: "Cannot delete someone else's experience" });
    }
    await Experience.findByIdAndDelete(req.params.id);
    res.json({ message: "Experience deleted" });
  } catch {
    res.status(500).send("Error deleting experience");
  }
});

// ── Reactions ─────────────────────────────────────────────────────────────────

app.post("/api/experiences/:id/reactions", requireAuth, async (req, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ error: "emoji is required" });
    const human = req.currentHuman._id;
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

app.delete("/api/experiences/:id/reactions", requireAuth, async (req, res) => {
  try {
    const deleted = await Reaction.findOneAndDelete({ experience: req.params.id, human: req.currentHuman._id });
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

app.post("/api/follows", requireAuth, async (req, res) => {
  try {
    const { followee } = req.body;
    if (!followee) return res.status(400).json({ error: "followee is required" });
    const follower = req.currentHuman._id;
    if (String(follower) === String(followee)) return res.status(400).json({ error: "cannot follow yourself" });
    const follow = await Follow.create({ follower, followee });
    res.status(201).json(follow);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "already following" });
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/follows", requireAuth, async (req, res) => {
  try {
    const { followee } = req.body;
    if (!followee) return res.status(400).json({ error: "followee is required" });
    const deleted = await Follow.findOneAndDelete({ follower: req.currentHuman._id, followee });
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

    const requester = await getCurrentHuman(req);
    const requesterId = requester ? String(requester._id) : null;

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
    const enrichedExpCars = await attachOwnershipToMany(experienceDocs.map((e) => e.car));
    const expCarById = {};
    for (const c of enrichedExpCars) expCarById[String(c._id)] = c;
    const experiences = experienceDocs.map((exp) => {
      const expObj = exp.toObject();
      expObj.car = expCarById[String(exp.car._id)];
      expObj.reactions = reactionsByExp[String(exp._id)] || [];
      return serializeExperience(expObj, { viewerId: requesterId });
    });

    const ownerships = await Ownership.find({ owner: humanId, to: null }).populate("car");
    const ownedCars = await attachOwnershipToMany(ownerships.map((o) => o.car));

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
      return {
        seriesSlug: b.seriesSlug,
        seriesName: series?.name,
        level: b.level,
        maxLevel: series?.levels.length || b.level,
        name: levelDef?.name,
        emoji: levelDef?.emoji,
        description: levelDef?.description,
        awardedAt: b.updatedAt,
      };
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
      return {
        seriesSlug: b.seriesSlug,
        seriesName: series?.name,
        level: b.level,
        maxLevel: series?.levels.length || b.level,
        name: levelDef?.name,
        emoji: levelDef?.emoji,
        description: levelDef?.description,
        awardedAt: b.updatedAt,
      };
    });
    res.json(badges);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All badges with progress: every series, current level, count, and next threshold
app.get("/api/users/:id/badges/all", async (req, res) => {
  try {
    const humanId = req.params.id;
    const slugs = Object.keys(BADGE_DEFS);
    const allSeries = await BadgeSeries.find({ slug: { $in: slugs } }).lean();
    const seriesMap = Object.fromEntries(allSeries.map((s) => [s.slug, s]));
    const userBadges = await UserBadge.find({ human: humanId }).lean();
    const userLevelMap = Object.fromEntries(userBadges.map((b) => [b.seriesSlug, b]));

    const result = await Promise.all(
      slugs.map(async (slug) => {
        const series = seriesMap[slug];
        const def = BADGE_DEFS[slug];
        const count = await BADGE_COUNTERS[slug](humanId);
        const level = levelForCount(count, def.thresholds);
        const maxLevel = def.thresholds.length;
        const nextThreshold = level < maxLevel ? def.thresholds[level] : null;
        const prevThreshold = level > 0 ? def.thresholds[level - 1] : 0;
        return {
          seriesSlug: slug,
          seriesName: series?.name,
          unit: def.unit,
          level,
          maxLevel,
          count,
          nextThreshold,
          prevThreshold,
          thresholds: def.thresholds,
          levels: series?.levels || [],
          awardedAt: userLevelMap[slug]?.updatedAt || null,
        };
      })
    );
    res.json(result);
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
// ── Search ────────────────────────────────────────────────────────────────────

app.get("/api/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (q.length < 2) return res.json({ models: [], users: [] });

    const rx = new RegExp(escapeRegex(q), "i");

    // Models: derived from Car collection, deduped to unique {manufacturer, model} pairs
    const matchingCars = await Car.find(
      { $or: [{ manufacturer: rx }, { model: rx }] },
      { manufacturer: 1, model: 1 }
    ).lean();
    const seen = new Set();
    const models = [];
    for (const c of matchingCars) {
      const key = `${c.manufacturer}|${c.model}`;
      if (!seen.has(key)) {
        seen.add(key);
        models.push({ manufacturer: c.manufacturer, model: c.model });
        if (models.length >= 10) break;
      }
    }

    // Users: match against name
    const users = await Human.find({ name: rx }).limit(10).lean();

    res.json({ models, users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Wishlist ──────────────────────────────────────────────────────────────────

app.post("/api/wishlist", requireAuth, async (req, res) => {
  try {
    const { manufacturer, model, yearFrom, yearTo } = req.body;
    const human = req.currentHuman._id;
    const yf = yearFrom ?? null;
    const yt = yearTo ?? null;

    // Reject if user already has a drove experience matching this model+range
    const userDroveCars = await Experience.find({ loggedBy: human, type: "drove" }).populate("car").lean();
    const matched = userDroveCars.find((e) => {
      const c = e.car;
      return c && c.manufacturer === manufacturer && c.model === model &&
        yearMatchesWishlist(c.year, yf, yt);
    });
    if (matched) {
      return res.status(409).json({ error: "Already driven a car matching this wishlist entry." });
    }

    const item = await WishlistItem.findOneAndUpdate(
      { human, manufacturer, model },
      { human, manufacturer, model, yearFrom: yf, yearTo: yt },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/wishlist", requireAuth, async (req, res) => {
  try {
    const { manufacturer, model } = req.body;
    await WishlistItem.deleteOne({ human: req.currentHuman._id, manufacturer, model });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/users/:id/wishlist", async (req, res) => {
  try {
    const items = await WishlistItem.find({ human: req.params.id }).sort({ createdAt: -1 }).lean();

    // For each item, find a representative car (preferring one inside the year range)
    // and pick its thumbnail to surface to the gallery.
    const enriched = await Promise.all(items.map(async (item) => {
      const cars = await Car.find({ manufacturer: item.manufacturer, model: item.model }).lean();
      const inRange = cars.filter((c) => yearMatchesWishlist(c.year, item.yearFrom, item.yearTo));
      const candidates = inRange.length > 0 ? inRange : cars;

      let thumbnailUrl = null;
      let representativeYear = null;
      for (const c of candidates) {
        const photos = await Photo.find({ car: c._id }).sort({ createdAt: 1 }).lean();
        const chosen = c.thumbnailPhoto
          ? photos.find((p) => String(p._id) === String(c.thumbnailPhoto)) || photos[0]
          : photos[0];
        if (chosen) {
          thumbnailUrl = chosen.url;
          representativeYear = c.year;
          break;
        }
      }
      return { ...item, thumbnailUrl, representativeYear };
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    const experienceDocs = await Experience.find({ car: { $in: carIds } })
      .populate("car")
      .populate("loggedBy", "name email avatarUrl")
      .sort({ date: -1 })
      .lean();

    // Attach reactions to each experience
    const expIds = experienceDocs.map((e) => e._id);
    const allReactions = await Reaction.find({ experience: { $in: expIds } })
      .populate("human", "name")
      .lean();
    const reactionsByExp = new Map();
    for (const r of allReactions) {
      const k = String(r.experience);
      if (!reactionsByExp.has(k)) reactionsByExp.set(k, []);
      reactionsByExp.get(k).push(r);
    }
    for (const e of experienceDocs) {
      e.reactions = reactionsByExp.get(String(e._id)) ?? [];
    }

    const requester = await getCurrentHuman(req);
    const requesterId = requester ? String(requester._id) : null;
    const experiences = experienceDocs.map((e) => serializeExperience(e, { viewerId: requesterId }));

    // Community rating: average of all rated experiences for this model
    const rated = experiences.filter((e) => e.rating != null);
    const ratingAverage = rated.length
      ? rated.reduce((s, e) => s + e.rating, 0) / rated.length
      : null;

    // Wishlist: count + per-user state
    const wishlistCount = await WishlistItem.countDocuments({ manufacturer, model });
    const userId = req.query.userId;
    let wishlistItem = null;
    let drivenYears = [];
    if (userId) {
      wishlistItem = await WishlistItem.findOne({ human: userId, manufacturer, model }).lean();
      // Years the user has driven for this model (for computing "driven" status against ranges)
      const userDrove = experiences.filter(
        (e) => e.type === "drove" && e.loggedBy && String(e.loggedBy._id) === String(userId)
      );
      drivenYears = userDrove.map((e) => e.car.year);
    }

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
      wishlist: {
        count: wishlistCount,
        wishlisted: !!wishlistItem,
        item: wishlistItem,
        drivenYears,
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
      for (const col of ["humans", "cars", "experiences", "reactions", "userbadges", "follows", "manufacturers", "wishlistitems"]) {
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
        { _id: toId("444444444444444444444444"), name: "Toyota", models: ["Supra", "Tacoma", "Corolla", "Land Cruiser"], colors: {}, trims: {} },
        { _id: toId("555555555555555555555555"), name: "Ford", models: ["Mustang", "F-150", "Bronco"], colors: {}, trims: {} },
        { _id: toId("666666666666666666666666"), name: "Porsche", models: ["911", "Cayenne", "Boxster"], colors: {}, trims: {} },
        { _id: toId("777777777777777777777777"), name: "Subaru", models: ["WRX", "Outback", "BRZ"], colors: {}, trims: {} },
      ]);

      await Car.insertMany([
        { _id: toId("cccccccccccccccccccccccc"), manufacturer: "Honda", model: "Civic", year: 2012, nickname: "Rhonda the Honda", transmission: "Manual", ownershipHistory: [{ owner: toId("aaaaaaaaaaaaaaaaaaaaaaaa"), from: null, to: null }], photos: [] },
        { _id: toId("dddddddddddddddddddddddd"), manufacturer: "Chevrolet", model: "Impala", year: 2015, transmission: "Automatic", ownershipHistory: [], photos: [] },
        { _id: toId("eeeeeeeeeeeeeeeeeeeeeeee"), manufacturer: "Tesla", model: "Model 3", year: 2023, transmission: "Electric", ownershipHistory: [], photos: [] },
        { _id: toId("ff0000000000000000000001"), manufacturer: "Toyota", model: "Supra", year: 1994, nickname: "The Soup", transmission: "Manual", ownershipHistory: [{ owner: toId("bbbbbbbbbbbbbbbbbbbbbbbb"), from: null, to: null }], photos: [] },
        { _id: toId("ff0000000000000000000002"), manufacturer: "Ford", model: "Mustang", year: 2019, transmission: "Manual", ownershipHistory: [], photos: [] },
        { _id: toId("ff0000000000000000000003"), manufacturer: "Porsche", model: "911", year: 2021, trim: "Carrera S", transmission: "Automatic", ownershipHistory: [], photos: [] },
        { _id: toId("ff0000000000000000000004"), manufacturer: "Subaru", model: "WRX", year: 2017, transmission: "Manual", ownershipHistory: [{ owner: toId("aaaaaaaaaaaaaaaaaaaaaaaa"), from: "2017-06-01", to: "2021-03-15" }], photos: [] },
        { _id: toId("ff0000000000000000000005"), manufacturer: "Chevrolet", model: "Camaro", year: 2020, trim: "SS", transmission: "Manual", ownershipHistory: [], photos: [] },
        { _id: toId("ff0000000000000000000006"), manufacturer: "Toyota", model: "Land Cruiser", year: 2005, transmission: "Automatic", ownershipHistory: [], photos: [] },
        { _id: toId("ff0000000000000000000007"), manufacturer: "Tesla", model: "Model S", year: 2022, trim: "Plaid", transmission: "Electric", ownershipHistory: [], photos: [] },
      ]);

      // Drop-then-insertMany doesn't re-create schema indexes — rebuild explicitly
      await Car.syncIndexes();

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
