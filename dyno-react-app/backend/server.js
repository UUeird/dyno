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
    await migrateManufacturerModelsToModelCollection();
    await seedBadgeSeries();
    await seedManufacturers();
    // Ensure schema-declared indexes (e.g. Car.vin unique, Human.clerkId unique) are actually built
    await Car.syncIndexes();
    await Human.syncIndexes();
    // Signals that startup migrations/seeding have finished — app.listen() below
    // fires as soon as the module loads, independent of this promise chain, so
    // callers that need the DB fully settled (e.g. the E2E test harness) should
    // wait for this line rather than "Server running".
    console.log("Startup migrations complete");
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
});
const Manufacturer = mongoose.model("Manufacturer", manufacturerSchema);

const modelSchema = new mongoose.Schema({
  manufacturer: { type: mongoose.Schema.Types.ObjectId, ref: "Manufacturer", required: true },
  name: { type: String, required: true },
  colors: { type: [colorEntrySchema], default: [] },
  trims: { type: [trimEntrySchema], default: [] },
  // Drivetrain doesn't vary by trim or year the way trim availability does, so
  // it's a flat option list at the model level (same tier as `colors`).
  drivetrains: { type: [String], default: [] },
});
modelSchema.index({ manufacturer: 1, name: 1 }, { unique: true });
const Model = mongoose.model("Model", modelSchema);

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
  model: { type: mongoose.Schema.Types.ObjectId, ref: "Model", required: true },
  year: Number,
  nickname: String,
  transmission: String,
  colorInfo: { type: carColorSchema, default: null },
  trim: String,
  drivetrain: String,
  vin: String,
  thumbnailPhoto: { type: mongoose.Schema.Types.ObjectId, ref: "Photo", default: null },
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
  loggedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Human", required: true },
  location: {
    display: { type: String, default: null },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },
  route: {
    type: [{ lat: Number, lng: Number, _id: false }],
    default: undefined,
  },
  weather: {
    tempC: { type: Number, default: null },
    conditions: { type: String, default: null },
    windKph: { type: Number, default: null },
    precipitationMm: { type: Number, default: null },
  },
});
const Experience = mongoose.model("Experience", experienceSchema);

// WMO weather codes (used by Open-Meteo) collapsed to short human-readable labels.
const WMO_CONDITIONS = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Light showers", 81: "Showers", 82: "Violent showers",
  85: "Light snow showers", 86: "Snow showers",
  95: "Thunderstorm", 96: "Thunderstorm w/ hail", 99: "Thunderstorm w/ hail",
};

// Fetches a weather snapshot for a lat/lng + date from Open-Meteo. Returns null on
// missing coords or any fetch/parse failure — weather is best-effort and must never
// block experience creation.
async function fetchWeatherSnapshot(lat, lng, date) {
  if (lat == null || lng == null) return null;
  try {
    const isoDate = new Date(date ?? Date.now()).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const base = isoDate < today
      ? "https://archive-api.open-meteo.com/v1/archive"
      : "https://api.open-meteo.com/v1/forecast";
    const params = new URLSearchParams({
      latitude: lat,
      longitude: lng,
      start_date: isoDate,
      end_date: isoDate,
      hourly: "temperature_2m,weathercode,windspeed_10m,precipitation",
      timezone: "auto",
    });
    const resp = await fetch(`${base}?${params}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    const hourly = data?.hourly;
    if (!hourly?.time?.length) return null;
    // Pick the hour closest to noon local time as a representative reading.
    const idx = hourly.time.reduce((best, t, i) => {
      const hour = Number(t.slice(11, 13));
      const bestHour = Number(hourly.time[best].slice(11, 13));
      return Math.abs(hour - 12) < Math.abs(bestHour - 12) ? i : best;
    }, 0);
    return {
      tempC: hourly.temperature_2m?.[idx] ?? null,
      conditions: WMO_CONDITIONS[hourly.weathercode?.[idx]] ?? null,
      windKph: hourly.windspeed_10m?.[idx] ?? null,
      precipitationMm: hourly.precipitation?.[idx] ?? null,
    };
  } catch {
    return null;
  }
}

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
  model: { type: mongoose.Schema.Types.ObjectId, ref: "Model", required: true },
  yearFrom: { type: Number, default: null },
  yearTo: { type: Number, default: null },
}, { timestamps: true });
wishlistSchema.index({ human: 1, model: 1 }, { unique: true });
const WishlistItem = mongoose.model("WishlistItem", wishlistSchema);

// True if a car-year falls within a wishlist item's year range.
// null/null = any year. null on one end = open-ended on that side.
function yearMatchesWishlist(carYear, yearFrom, yearTo) {
  if (yearFrom == null && yearTo == null) return true;
  if (yearFrom != null && carYear < yearFrom) return false;
  if (yearTo != null && carYear > yearTo) return false;
  return true;
}

// Validates a trim string against a model's registered trims for a given year.
// Returns null on success, an error message on failure.
//
// Rules:
// - Model has no trims defined at all → free-form (any string OK, blank OK).
// - Model has trims, but none cover the requested year → fall back to free-form.
//   This avoids trapping users on years admins haven't seeded yet.
// - Model has trims that cover the requested year → trim must be one of them.
function validateTrim(modelDoc, year, trim) {
  const trims = Array.isArray(modelDoc?.trims) ? modelDoc.trims : [];
  if (trims.length === 0) return null;
  const trimsForYear =
    year == null
      ? trims
      : trims.filter((t) => t.years.some((y) => yearMatchesWishlist(Number(year), y.from, y.to)));
  if (trimsForYear.length === 0) return null; // nothing to validate against
  if (!trim) return `Trim is required for ${modelDoc.name}`;
  const match = trimsForYear.find((t) => t.name === trim);
  if (!match) return `"${trim}" is not a valid trim for ${modelDoc.name} in ${year}`;
  return null;
}

// Validates a drivetrain string against a model's registered drivetrains.
// Same free-form fallback as validateTrim: a model with no drivetrains
// defined imposes no constraint.
function validateDrivetrain(modelDoc, drivetrain) {
  const drivetrains = Array.isArray(modelDoc?.drivetrains) ? modelDoc.drivetrains : [];
  if (drivetrains.length === 0) return null;
  if (!drivetrain) return `Drivetrain is required for ${modelDoc.name}`;
  if (!drivetrains.includes(drivetrain)) return `"${drivetrain}" is not a valid drivetrain for ${modelDoc.name}`;
  return null;
}

// ── Migration ─────────────────────────────────────────────────────────────────

// One-time backfill: promotes the embedded `Manufacturer.models/colors/trims`
// registry into standalone `Model` documents, then repoints `Car.model` and
// `WishlistItem.model` from free-text strings to `Model` ObjectId refs.
// Reads legacy fields via the raw collection since they're no longer on the
// Mongoose schemas. Once run on a deployment, every query here returns 0 docs
// and this is a fast no-op.
async function migrateManufacturerModelsToModelCollection() {
  const db = mongoose.connection.db;
  const legacyMfrs = await db.collection("manufacturers")
    .find({ models: { $exists: true } })
    .toArray();
  if (legacyMfrs.length === 0) return;

  let modelsCreated = 0;
  for (const mfr of legacyMfrs) {
    const colors = mfr.colors instanceof Map ? Object.fromEntries(mfr.colors) : (mfr.colors || {});
    const trims = mfr.trims instanceof Map ? Object.fromEntries(mfr.trims) : (mfr.trims || {});
    const modelNameToId = new Map();
    for (const name of mfr.models || []) {
      const existing = await Model.findOne({ manufacturer: mfr._id, name });
      const modelDoc = existing || await Model.create({
        manufacturer: mfr._id,
        name,
        colors: colors[name] || [],
        trims: trims[name] || [],
      });
      if (!existing) modelsCreated++;
      modelNameToId.set(name, modelDoc._id);
    }

    const legacyCars = await db.collection("cars")
      .find({ manufacturer: mfr.name, model: { $type: "string" } })
      .toArray();
    for (const car of legacyCars) {
      const modelId = modelNameToId.get(car.model);
      if (!modelId) continue; // model name not in registry — leave for manual cleanup
      await db.collection("cars").updateOne(
        { _id: car._id },
        { $set: { model: modelId }, $unset: { manufacturer: "" } }
      );
    }

    const legacyWishlistItems = await db.collection("wishlistitems")
      .find({ manufacturer: mfr.name, model: { $type: "string" } })
      .toArray();
    for (const item of legacyWishlistItems) {
      const modelId = modelNameToId.get(item.model);
      if (!modelId) continue;
      await db.collection("wishlistitems").updateOne(
        { _id: item._id },
        { $set: { model: modelId }, $unset: { manufacturer: "" } }
      );
    }

    await db.collection("manufacturers").updateOne(
      { _id: mfr._id },
      { $unset: { models: "", colors: "", trims: "" } }
    );
  }
  console.log(`Migrated ${legacyMfrs.length} manufacturer(s) to the Model collection (${modelsCreated} model(s) created)`);
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
    let mfr = await Manufacturer.findOne({ name: s.name });
    if (!mfr) {
      mfr = await Manufacturer.create({ name: s.name });
      inserted++;
    }
    for (const modelName of s.models) {
      const existing = await Model.findOne({ manufacturer: mfr._id, name: modelName });
      if (!existing) await Model.create({ manufacturer: mfr._id, name: modelName });
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
    const exps = await Experience.find({ loggedBy: humanId, type: "drove" })
      .populate({ path: "car", select: "model", populate: { path: "model", select: "manufacturer", populate: { path: "manufacturer", select: "name" } } });
    return new Set(exps.map((e) => e.car?.model?.manufacturer?.name).filter(Boolean)).size;
  },
  "stick-shift": async (humanId) => {
    const exps = await Experience.find({ loggedBy: humanId, type: "drove" }).populate("car", "transmission");
    return exps.filter((e) => e.car?.transmission === "Manual").length;
  },
  "ev-pioneer": async (humanId) => {
    const exps = await Experience.find({ loggedBy: humanId, type: "drove" })
      .populate({ path: "car", select: "model transmission", populate: { path: "model", select: "manufacturer", populate: { path: "manufacturer", select: "name" } } });
    return exps.filter((e) => {
      const t = e.car?.transmission;
      const m = e.car?.model?.manufacturer?.name;
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

// Flattens a populated `car.model` (a Model doc, itself populated with its
// `manufacturer` ref) into plain display fields, so API responses keep the
// familiar `manufacturer`/`model` name strings and callers don't need to know
// about the underlying ref chain. `modelId` is included for write paths (e.g.
// pre-filling an edit form's model select).
function flattenCarModel(car) {
  const modelDoc = car.model;
  if (modelDoc && typeof modelDoc === "object") {
    car.modelId = String(modelDoc._id);
    car.manufacturer = modelDoc.manufacturer?.name ?? null;
    car.model = modelDoc.name;
  }
  return car;
}

async function attachOwnership(carDoc) {
  const car = carDoc.toObject ? carDoc.toObject() : { ...carDoc };
  flattenCarModel(car);
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
  const cars = carDocs.map((c) => flattenCarModel(c.toObject ? c.toObject() : { ...c }));
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
const EXPERIENCE_AUTHOR_ONLY_FIELDS = ["location", "route", "weather"];

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

// Attaches each manufacturer's Model docs as `.models`, sorted by name — mirrors
// the shape of the old embedded `models` array but with full Model documents.
async function attachModels(mfrs) {
  const isArray = Array.isArray(mfrs);
  const list = isArray ? mfrs : [mfrs];
  const models = await Model.find({ manufacturer: { $in: list.map((m) => m._id) } }).sort({ name: 1 }).lean();
  const byMfr = new Map();
  for (const m of models) {
    const k = String(m.manufacturer);
    if (!byMfr.has(k)) byMfr.set(k, []);
    byMfr.get(k).push(m);
  }
  const attached = list.map((m) => ({ ...(m.toObject ? m.toObject() : m), models: byMfr.get(String(m._id)) || [] }));
  return isArray ? attached : attached[0];
}

app.get("/api/manufacturers", async (req, res) => {
  try {
    const mfrs = await Manufacturer.find().sort({ name: 1 }).lean();
    res.json(await attachModels(mfrs));
  } catch {
    res.status(500).send("Error fetching manufacturers");
  }
});

// Admin-only: create a manufacturer with an optional initial models list.
app.post("/api/manufacturers", requireAdmin, async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "name is required" });
    const modelNames = Array.isArray(req.body.models) ? req.body.models.map((m) => String(m).trim()).filter(Boolean) : [];
    const existing = await Manufacturer.findOne({ name });
    if (existing) return res.status(409).json({ error: "Manufacturer already exists" });
    const mfr = await Manufacturer.create({ name });
    for (const modelName of modelNames) {
      await Model.create({ manufacturer: mfr._id, name: modelName });
    }
    res.status(201).json(await attachModels(mfr));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin-only: add a new model to an existing manufacturer (no-op if already present).
app.patch("/api/manufacturers/:id/models", requireAdmin, async (req, res) => {
  try {
    const name = (req.body.model || "").trim();
    if (!name) return res.status(400).json({ error: "model is required" });
    const mfr = await Manufacturer.findById(req.params.id);
    if (!mfr) return res.status(404).json({ error: "Manufacturer not found" });
    const existing = await Model.findOne({ manufacturer: mfr._id, name });
    if (!existing) await Model.create({ manufacturer: mfr._id, name });
    res.json(await attachModels(mfr));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin-only: remove a model from a manufacturer (only if no Cars use it).
app.delete("/api/manufacturers/:id/models/:modelId", requireAdmin, async (req, res) => {
  try {
    const { id, modelId } = req.params;
    const mfr = await Manufacturer.findById(id);
    if (!mfr) return res.status(404).json({ error: "Manufacturer not found" });
    const modelDoc = await Model.findOne({ _id: modelId, manufacturer: id });
    if (!modelDoc) return res.status(404).json({ error: "Model not found" });
    const inUse = await Car.findOne({ model: modelId });
    if (inUse) return res.status(409).json({ error: "Model is in use by one or more cars" });
    await Model.deleteOne({ _id: modelId });
    res.json(await attachModels(mfr));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin-only: replace the full trim list for a model. The request body is the
// canonical new list; existing trims are overwritten. Each trim is
// `{ name, years: [{from, to}] }`. Both `from` and `to` may be null (open-ended
// on that side).
app.put("/api/manufacturers/:id/trims/:modelId", requireAdmin, async (req, res) => {
  try {
    const { id, modelId } = req.params;
    const modelDoc = await Model.findOne({ _id: modelId, manufacturer: id });
    if (!modelDoc) return res.status(404).json({ error: "Model not found" });

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

    modelDoc.trims = normalized;
    await modelDoc.save();
    res.json(modelDoc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin-only: replace the full drivetrain list for a model. The request body
// is the canonical new list of strings; existing drivetrains are overwritten.
app.put("/api/manufacturers/:id/drivetrains/:modelId", requireAdmin, async (req, res) => {
  try {
    const { id, modelId } = req.params;
    const modelDoc = await Model.findOne({ _id: modelId, manufacturer: id });
    if (!modelDoc) return res.status(404).json({ error: "Model not found" });

    const incoming = Array.isArray(req.body.drivetrains) ? req.body.drivetrains : [];
    const normalized = [...new Set(incoming.map((d) => String(d || "").trim()).filter(Boolean))];

    modelDoc.drivetrains = normalized;
    await modelDoc.save();
    res.json(modelDoc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Cars ──────────────────────────────────────────────────────────────────────

// Populate spec shared by every Car read path: resolves `car.model` to a Model
// doc, and that Model's `manufacturer` to a Manufacturer doc, so `flattenCarModel`
// can reduce it back to plain `manufacturer`/`model` name strings for the response.
const CAR_MODEL_POPULATE = { path: "model", populate: { path: "manufacturer" } };

app.get("/api/cars", async (req, res) => {
  try {
    const cars = await Car.find().populate(CAR_MODEL_POPULATE);
    res.json(await attachOwnershipToMany(cars));
  } catch {
    res.status(500).send("Error fetching cars");
  }
});

app.post("/api/cars", requireAuth, async (req, res) => {
  try {
    const { model, year, nickname, transmission, colorInfo, trim, drivetrain, vin } = req.body;
    if (!model || !year) {
      return res.status(400).json({ error: "model and year are required" });
    }
    // VIN is optional. If provided, the sparse unique index still keeps duplicates out.
    // Pass undefined (not empty string) so Mongo doesn't store a "" value that would
    // collide with the unique index against other empty-string VINs.
    const trimmedVin = typeof vin === "string" ? vin.trim() : "";
    const vinValue = trimmedVin || undefined;

    const modelDoc = await Model.findById(model);
    if (!modelDoc) return res.status(400).json({ error: "invalid model" });

    const trimError = validateTrim(modelDoc, year, trim);
    if (trimError) return res.status(400).json({ error: trimError });

    const drivetrainError = validateDrivetrain(modelDoc, drivetrain);
    if (drivetrainError) return res.status(400).json({ error: drivetrainError });

    const normalizedColor = colorInfo && colorInfo.name
      ? { name: String(colorInfo.name).trim(), hex: colorInfo.hex || undefined, isCustom: !!colorInfo.isCustom }
      : null;

    try {
      const car = await new Car({
        model, year, nickname, transmission, trim, drivetrain,
        vin: vinValue,
        colorInfo: normalizedColor,
      }).save();
      await car.populate(CAR_MODEL_POPULATE);
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
    const { model, year, trim, drivetrain } = req.body;
    const car = await Car.findById(req.params.id);
    if (!car) return res.status(404).json({ error: "Car not found" });

    // Compute effective values once for use in both model and trim validation.
    const effectiveModelId = model || car.model;
    const effectiveYear = year != null ? year : car.year;
    const effectiveTrim = trim !== undefined ? trim : car.trim;
    const effectiveDrivetrain = drivetrain !== undefined ? drivetrain : car.drivetrain;

    let modelDoc = null;
    if (model || trim !== undefined || year !== undefined || drivetrain !== undefined) {
      modelDoc = await Model.findById(effectiveModelId);
      if (!modelDoc) return res.status(400).json({ error: "invalid model" });
    }

    if (modelDoc) {
      const trimError = validateTrim(modelDoc, effectiveYear, effectiveTrim);
      if (trimError) return res.status(400).json({ error: trimError });

      const drivetrainError = validateDrivetrain(modelDoc, effectiveDrivetrain);
      if (drivetrainError) return res.status(400).json({ error: drivetrainError });
    }

    const { colorInfo, ...updateFields } = req.body;
    // Normalize colorInfo if supplied
    if (colorInfo !== undefined) {
      updateFields.colorInfo = colorInfo && colorInfo.name
        ? { name: String(colorInfo.name).trim(), hex: colorInfo.hex || undefined, isCustom: !!colorInfo.isCustom }
        : null;
    }
    const updated = await Car.findByIdAndUpdate(req.params.id, updateFields, { new: true, runValidators: true })
      .populate(CAR_MODEL_POPULATE);
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
    ).populate(CAR_MODEL_POPULATE);
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
      .populate({ path: "car", populate: CAR_MODEL_POPULATE })
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
    const { car, type, notes, rating, location, route } = req.body;
    if (!car || !type) return res.status(400).json({ error: "car and type are required" });
    const loggedBy = req.currentHuman._id;
    const loc = location?.display ? { display: location.display, lat: location.lat ?? null, lng: location.lng ?? null } : undefined;
    const weatherOrigin = loc ?? route?.[0];
    const weather = await fetchWeatherSnapshot(weatherOrigin?.lat, weatherOrigin?.lng, undefined);
    const experience = new Experience({ car, type, notes, rating: rating ?? null, loggedBy, location: loc, route, weather });
    await experience.save();
    await experience.populate("loggedBy", "name email avatarUrl");

    // If this is a drove experience, remove any wishlist items that this car satisfies
    if (type === "drove") {
      const carDoc = await Car.findById(car).lean();
      if (carDoc) {
        const items = await WishlistItem.find({ human: loggedBy, model: carDoc.model });
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
      .populate({ path: "car", populate: CAR_MODEL_POPULATE })
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

    const ownerships = await Ownership.find({ owner: humanId, to: null })
      .populate({ path: "car", populate: CAR_MODEL_POPULATE });
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

    // Models: match against the Model registry (by model name or manufacturer name),
    // limited to models that actually have at least one Car logged.
    const matchingModels = await Model.find({ name: rx }).populate("manufacturer").limit(50).lean();
    const matchingMfrs = await Manufacturer.find({ name: rx }).lean();
    const mfrModelDocs = matchingMfrs.length
      ? await Model.find({ manufacturer: { $in: matchingMfrs.map((m) => m._id) } }).populate("manufacturer").limit(50).lean()
      : [];
    const candidates = [...matchingModels, ...mfrModelDocs];
    const seen = new Set();
    const models = [];
    for (const m of candidates) {
      if (seen.has(String(m._id))) continue;
      const hasCar = await Car.exists({ model: m._id });
      if (!hasCar) continue;
      seen.add(String(m._id));
      models.push({ manufacturer: m.manufacturer?.name, model: m.name });
      if (models.length >= 10) break;
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
    const { model, yearFrom, yearTo } = req.body;
    if (!model) return res.status(400).json({ error: "model is required" });
    const human = req.currentHuman._id;
    const yf = yearFrom ?? null;
    const yt = yearTo ?? null;

    // Reject if user already has a drove experience matching this model+range
    const userDroveCars = await Experience.find({ loggedBy: human, type: "drove" }).populate("car").lean();
    const matched = userDroveCars.find((e) => {
      const c = e.car;
      return c && String(c.model) === String(model) && yearMatchesWishlist(c.year, yf, yt);
    });
    if (matched) {
      return res.status(409).json({ error: "Already driven a car matching this wishlist entry." });
    }

    const item = await WishlistItem.findOneAndUpdate(
      { human, model },
      { human, model, yearFrom: yf, yearTo: yt },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/wishlist", requireAuth, async (req, res) => {
  try {
    const { model } = req.body;
    await WishlistItem.deleteOne({ human: req.currentHuman._id, model });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/users/:id/wishlist", async (req, res) => {
  try {
    const items = await WishlistItem.find({ human: req.params.id })
      .populate({ path: "model", populate: { path: "manufacturer" } })
      .sort({ createdAt: -1 })
      .lean();

    // For each item, find a representative car (preferring one inside the year range)
    // and pick its thumbnail to surface to the gallery.
    const enriched = await Promise.all(items.map(async (item) => {
      const cars = await Car.find({ model: item.model._id }).lean();
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
      return {
        ...item,
        manufacturer: item.model.manufacturer?.name,
        model: item.model.name,
        modelId: String(item.model._id),
        thumbnailUrl,
        representativeYear,
      };
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

    const mfrDoc = await Manufacturer.findOne({ name: mfrRegex });
    const modelDoc = mfrDoc && await Model.findOne({ manufacturer: mfrDoc._id, name: modelRegex });
    if (!modelDoc) return res.status(404).json({ error: "Model not found" });

    const carDocs = await Car.find({ model: modelDoc._id }).populate(CAR_MODEL_POPULATE);
    const cars = await attachOwnershipToMany(carDocs);

    if (cars.length === 0) {
      return res.status(404).json({ error: "Model not found" });
    }

    const manufacturer = mfrDoc.name;
    const model = modelDoc.name;
    const modelId = String(modelDoc._id);

    const carIds = cars.map((c) => c._id);

    // All experiences for any instance of this model, newest first
    const experienceDocs = await Experience.find({ car: { $in: carIds } })
      .populate({ path: "car", populate: CAR_MODEL_POPULATE })
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
      if (e.car) flattenCarModel(e.car);
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
    const wishlistCount = await WishlistItem.countDocuments({ model: modelDoc._id });
    const userId = req.query.userId;
    let wishlistItem = null;
    let drivenYears = [];
    if (userId) {
      wishlistItem = await WishlistItem.findOne({ human: userId, model: modelDoc._id }).lean();
      // Years the user has driven for this model (for computing "driven" status against ranges)
      const userDrove = experiences.filter(
        (e) => e.type === "drove" && e.loggedBy && String(e.loggedBy._id) === String(userId)
      );
      drivenYears = userDrove.map((e) => e.car.year);
    }

    res.json({
      manufacturer,
      model,
      modelId,
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
      for (const col of ["humans", "cars", "ownerships", "experiences", "reactions", "userbadges", "follows", "manufacturers", "models", "wishlistitems"]) {
        await db.collection(col).drop().catch(() => {});
      }

      const toId = (hex) => new mongoose.Types.ObjectId(hex);

      await Human.insertMany([
        { _id: toId("aaaaaaaaaaaaaaaaaaaaaaaa"), name: "Sam Lawrence", email: "sam@samelawrence.com", avatarUrl: "https://randomuser.me/api/portraits/men/32.jpg" },
        { _id: toId("bbbbbbbbbbbbbbbbbbbbbbbb"), name: "Alex Rivera", email: "alex@example.com", avatarUrl: "https://randomuser.me/api/portraits/men/45.jpg" },
      ]);

      await Manufacturer.insertMany([
        { _id: toId("111111111111111111111111"), name: "Honda" },
        { _id: toId("222222222222222222222222"), name: "Chevrolet" },
        { _id: toId("333333333333333333333333"), name: "Tesla" },
        { _id: toId("444444444444444444444444"), name: "Toyota" },
        { _id: toId("555555555555555555555555"), name: "Ford" },
        { _id: toId("666666666666666666666666"), name: "Porsche" },
        { _id: toId("777777777777777777777777"), name: "Subaru" },
      ]);

      const civicId = toId("100000000000000000000001");
      const impalaId = toId("100000000000000000000002");
      const model3Id = toId("100000000000000000000003");
      const supraId = toId("100000000000000000000004");
      const mustangId = toId("100000000000000000000005");
      const p911Id = toId("100000000000000000000006");
      const wrxId = toId("100000000000000000000007");
      const camaroId = toId("100000000000000000000008");
      const landCruiserId = toId("100000000000000000000009");
      const modelSId = toId("10000000000000000000000a");

      await Model.insertMany([
        { _id: civicId, manufacturer: toId("111111111111111111111111"), name: "Civic", colors: [{ name: "White", hex: "#ffffff" }, { name: "Black", hex: "#000000" }] },
        { _id: toId("100000000000000000000101"), manufacturer: toId("111111111111111111111111"), name: "Accord" },
        { _id: toId("100000000000000000000102"), manufacturer: toId("111111111111111111111111"), name: "CR-V" },
        { _id: impalaId, manufacturer: toId("222222222222222222222222"), name: "Impala" },
        { _id: camaroId, manufacturer: toId("222222222222222222222222"), name: "Camaro" },
        { _id: toId("100000000000000000000201"), manufacturer: toId("222222222222222222222222"), name: "Silverado" },
        { _id: model3Id, manufacturer: toId("333333333333333333333333"), name: "Model 3" },
        { _id: modelSId, manufacturer: toId("333333333333333333333333"), name: "Model S" },
        { _id: toId("100000000000000000000301"), manufacturer: toId("333333333333333333333333"), name: "Model Y" },
        { _id: supraId, manufacturer: toId("444444444444444444444444"), name: "Supra" },
        { _id: toId("100000000000000000000401"), manufacturer: toId("444444444444444444444444"), name: "Tacoma" },
        { _id: toId("100000000000000000000402"), manufacturer: toId("444444444444444444444444"), name: "Corolla" },
        { _id: landCruiserId, manufacturer: toId("444444444444444444444444"), name: "Land Cruiser" },
        { _id: mustangId, manufacturer: toId("555555555555555555555555"), name: "Mustang" },
        { _id: toId("100000000000000000000501"), manufacturer: toId("555555555555555555555555"), name: "F-150" },
        { _id: toId("100000000000000000000502"), manufacturer: toId("555555555555555555555555"), name: "Bronco" },
        { _id: p911Id, manufacturer: toId("666666666666666666666666"), name: "911" },
        { _id: toId("100000000000000000000601"), manufacturer: toId("666666666666666666666666"), name: "Cayenne" },
        { _id: toId("100000000000000000000602"), manufacturer: toId("666666666666666666666666"), name: "Boxster" },
        { _id: wrxId, manufacturer: toId("777777777777777777777777"), name: "WRX" },
        { _id: toId("100000000000000000000701"), manufacturer: toId("777777777777777777777777"), name: "Outback" },
        { _id: toId("100000000000000000000702"), manufacturer: toId("777777777777777777777777"), name: "BRZ" },
      ]);

      await Car.insertMany([
        { _id: toId("cccccccccccccccccccccccc"), model: civicId, year: 2012, nickname: "Rhonda the Honda", transmission: "Manual", photos: [] },
        { _id: toId("dddddddddddddddddddddddd"), model: impalaId, year: 2015, transmission: "Automatic", photos: [] },
        { _id: toId("eeeeeeeeeeeeeeeeeeeeeeee"), model: model3Id, year: 2023, transmission: "Electric", photos: [] },
        { _id: toId("ff0000000000000000000001"), model: supraId, year: 1994, nickname: "The Soup", transmission: "Manual", photos: [] },
        { _id: toId("ff0000000000000000000002"), model: mustangId, year: 2019, transmission: "Manual", photos: [] },
        { _id: toId("ff0000000000000000000003"), model: p911Id, year: 2021, trim: "Carrera S", transmission: "Automatic", photos: [] },
        { _id: toId("ff0000000000000000000004"), model: wrxId, year: 2017, transmission: "Manual", photos: [] },
        { _id: toId("ff0000000000000000000005"), model: camaroId, year: 2020, trim: "SS", transmission: "Manual", photos: [] },
        { _id: toId("ff0000000000000000000006"), model: landCruiserId, year: 2005, transmission: "Automatic", photos: [] },
        { _id: toId("ff0000000000000000000007"), model: modelSId, year: 2022, trim: "Plaid", transmission: "Electric", photos: [] },
      ]);

      await Ownership.insertMany([
        { car: toId("cccccccccccccccccccccccc"), owner: toId("aaaaaaaaaaaaaaaaaaaaaaaa"), from: null, to: null },
        { car: toId("ff0000000000000000000001"), owner: toId("bbbbbbbbbbbbbbbbbbbbbbbb"), from: null, to: null },
        { car: toId("ff0000000000000000000004"), owner: toId("aaaaaaaaaaaaaaaaaaaaaaaa"), from: "2017-06-01", to: "2021-03-15" },
      ]);

      // Drop-then-insertMany doesn't re-create schema indexes — rebuild explicitly
      await Car.syncIndexes();
      await Model.syncIndexes();

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
