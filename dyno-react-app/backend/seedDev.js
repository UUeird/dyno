// Fills the local dev database (carsDB) with dummy users, cars, and activity.
//
//   node seedDev.js           # (re)seed
//   node seedDev.js --clear   # remove seeded data only
//
// Every inserted doc is tagged `seed: true`, so re-running replaces the seeded
// data and leaves anything created through the app alone. The real logged-in
// user (the Human with a clerkId) is kept and gets cars, experiences, follows,
// and a wishlist attached. Pass --email you@example.com if there's more than one.
//
// Requires the model registry, which the backend seeds on first startup.

const mongoose = require("mongoose");

// Hardcoded on purpose: this must never run against anything but local dev.
const URI = "mongodb://localhost:27017/carsDB";
const COLLECTIONS = ["humans", "cars", "ownerships", "experiences", "photos", "follows", "reactions", "wishlistitems", "userbadges"];

const args = process.argv.slice(2);
const CLEAR_ONLY = args.includes("--clear");
const emailArg = args.includes("--email") ? args[args.indexOf("--email") + 1] : null;

// Stable ids so seeded profile/car URLs survive a reseed.
const oid = (kind, n) => new mongoose.Types.ObjectId(`5eed${kind}${String(n).padStart(19, "0")}`);
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

const HUMANS = [
  { key: "alex",   name: "Alex Rivera",  username: "alexrivera", avatarUrl: "https://randomuser.me/api/portraits/men/45.jpg" },
  { key: "jordan", name: "Jordan Smith", username: "jsmith",     avatarUrl: "https://randomuser.me/api/portraits/women/65.jpg" },
  { key: "priya",  name: "Priya Patel",  username: "priyadrives", avatarUrl: "https://randomuser.me/api/portraits/women/44.jpg" },
  { key: "marcus", name: "Marcus Chen",  username: "mchen",      avatarUrl: "https://randomuser.me/api/portraits/men/22.jpg" },
  { key: "dana",   name: "Dana Okafor",  username: "danao",      avatarUrl: "https://randomuser.me/api/portraits/women/12.jpg" },
  { key: "tom",    name: "Tom Becker",   username: "tbecker",    avatarUrl: "https://randomuser.me/api/portraits/men/71.jpg" },
];

const CARS = [
  { key: "civic",    model: "Honda Civic",       year: 2012, nickname: "Rhonda the Honda", transmission: "Manual",    trim: "Si",         color: ["Rallye Red", "#c8102e"],      vin: "2HGFG4A59CH700101" },
  { key: "wrx",      model: "Subaru WRX",        year: 2017, transmission: "Manual",    trim: "Premium",    drivetrain: "AWD", color: ["World Rally Blue", "#0b3d91"], vin: "JF1VA1E64H9800102" },
  { key: "supra",    model: "Toyota Supra",      year: 1994, nickname: "The Soup", transmission: "Manual", trim: "Turbo", drivetrain: "RWD", color: ["Renaissance Red", "#a4161a"], vin: "JT2JA82J4R0000103" },
  { key: "mustang",  model: "Ford Mustang",      year: 2019, transmission: "Manual",    trim: "GT",         drivetrain: "RWD", color: ["Kona Blue", "#1b2a4e"],        vin: "1FA6P8CF5K5100104" },
  { key: "p911",     model: "Porsche 911",       year: 2021, transmission: "Automatic", trim: "Carrera S",  drivetrain: "RWD", color: ["GT Silver", "#b8bcc2"],        vin: "WP0AB2A93MS200105" },
  { key: "model3",   model: "Tesla Model 3",     year: 2023, transmission: "Electric",  trim: "Long Range", drivetrain: "AWD", color: ["Pearl White", "#f2f2f0"],      vin: "5YJ3E1EB4PF300106" },
  { key: "impala",   model: "Chevrolet Impala",  year: 1967, nickname: "Baby", transmission: "Automatic", trim: "SS", drivetrain: "RWD", color: ["Tuxedo Black", "#111111"], vin: "168877J10000107" },
  { key: "miata",    model: "Mazda MX-5 Miata",  year: 1999, nickname: "Mx. Miata", transmission: "Manual", drivetrain: "RWD", color: ["Emerald Mica", "#0f5132"],     vin: "JM1NB3537X0100108" },
  { key: "m3",       model: "BMW M3",            year: 2008, transmission: "Manual",    drivetrain: "RWD", color: ["Interlagos Blue", "#16335c"],                    vin: "WBSWD93538P500109" },
  { key: "r1t",      model: "Rivian R1T",        year: 2024, transmission: "Electric",  trim: "Adventure",  drivetrain: "AWD", color: ["Forest Green", "#2f4f3a"],     vin: "7FCTGAAA1RN000110" },
  { key: "wrangler", model: "Jeep Wrangler",     year: 2015, transmission: "Manual",    trim: "Rubicon",    drivetrain: "4WD", color: ["Tank", "#6b6f5e"],             vin: "1C4BJWFG4FL600111" },
  { key: "corolla",  model: "Toyota Corolla",    year: 2020, transmission: "Automatic", trim: "LE",         drivetrain: "FWD", color: ["Super White", "#ffffff"],      vin: "5YFEPRAE5LP000112" },
  { key: "gtr",      model: "Nissan GT-R",       year: 2010, nickname: "Godzilla", transmission: "Automatic", drivetrain: "AWD", color: ["Gun Metallic", "#4a4d52"],  vin: "JN1AR5EF8AM230113" },
  { key: "golf",     model: "Volkswagen Golf",   year: 1986, transmission: "Manual",    trim: "GTI",        drivetrain: "FWD", color: ["Mars Red", "#b3261e"],         vin: "1VWDC0177GV000114" },
];

// [carKey, ownerKey, fromDaysAgo, toDaysAgo|null]. "me" is the logged-in user.
const OWNERSHIPS = [
  ["civic", "me", 2400, null],
  ["wrx", "me", 3000, 900],
  ["supra", "alex", 1500, null],
  ["mustang", "jordan", 800, null],
  ["p911", "marcus", 600, null],
  ["model3", "priya", 400, null],
  ["impala", "tom", 5000, null],
  ["miata", "dana", 2000, null],
  ["m3", "marcus", 3500, 700],
  ["m3", "alex", 700, null],
  ["r1t", "priya", 200, null],
  ["wrangler", "dana", 1200, null],
  ["corolla", "jordan", 1800, 850],
  ["golf", "tom", 4000, null],
];

const PLACES = {
  atl:   { display: "Atlanta, GA",              lat: 33.749,  lng: -84.388 },
  dragon:{ display: "Tail of the Dragon, NC",   lat: 35.4676, lng: -83.9207 },
  cc:    { display: "Caffeine & Octane, Kennesaw, GA", lat: 34.0195, lng: -84.5655 },
  sav:   { display: "Savannah, GA",             lat: 32.0809, lng: -81.0912 },
  la:    { display: "Malibu, CA",               lat: 34.0259, lng: -118.7798 },
  nyc:   { display: "Brooklyn, NY",             lat: 40.6782, lng: -73.9442 },
  road:  { display: "Road Atlanta, Braselton, GA", lat: 34.1487, lng: -83.8156 },
};
const WEATHER = [
  { tempC: 24, conditions: "Clear sky", windKph: 8, precipitationMm: 0 },
  { tempC: 17, conditions: "Partly cloudy", windKph: 14, precipitationMm: 0 },
  { tempC: 11, conditions: "Light rain", windKph: 20, precipitationMm: 1.2 },
  { tempC: 29, conditions: "Mainly clear", windKph: 5, precipitationMm: 0 },
];

// [who, type, carKey, daysAgo, rating, placeKey, notes]
const EXPERIENCES = [
  ["me", "drove", "civic", 1, 4, "atl", "Commute, but the long way. Still the best shifter I've owned."],
  ["me", "drove", "supra", 3, 5, "dragon", "Alex tossed me the keys. 318 curves in 11 miles — I get the hype now."],
  ["me", "spotted", "p911", 5, null, "cc", "GT Silver on a grey morning. Perfect spec."],
  ["me", "drove", "model3", 9, 3, "atl", "Instant torque is fun, steering is numb."],
  ["me", "drove", "miata", 14, 5, "sav", "Top down, 55mph, zero complaints. Miata is always the answer."],
  ["me", "spotted", "impala", 20, null, "sav", "Rumbling through the historic district."],
  ["me", "drove", "wrx", 400, 4, "atl", "Last drive before I sold it. Miss the turbo whoosh."],
  ["me", "drove", "mustang", 30, 4, "road", "Track day with Jordan. Coyote V8 sounds unreal at 7k."],
  ["me", "spotted", "gtr", 44, null, "atl", null],
  ["alex", "drove", "supra", 2, 5, "dragon", "2JZ no cap."],
  ["alex", "drove", "m3", 6, 5, "road", "S65 V8 to 8,400rpm. Nothing like it."],
  ["alex", "spotted", "golf", 12, null, "nyc", "Mk2 GTI in the wild, mint."],
  ["alex", "drove", "civic", 25, 4, "atl", "Borrowed Sam's Si. VTEC kicked in, yo."],
  ["jordan", "drove", "mustang", 1, 4, "road", "New tires, new lap record (for me)."],
  ["jordan", "spotted", "r1t", 4, null, "atl", "Rivians everywhere now."],
  ["jordan", "drove", "p911", 18, 5, "la", "PCH at sunset in a 911. Peak."],
  ["jordan", "drove", "corolla", 900, 2, "atl", "It was a car."],
  ["priya", "drove", "model3", 2, 4, "atl", "Road trip to Savannah on one charge."],
  ["priya", "drove", "r1t", 7, 5, "dragon", "Shouldn't handle this well. It does."],
  ["priya", "spotted", "supra", 15, null, "cc", "Mk4 crowd was three deep."],
  ["marcus", "drove", "p911", 3, 5, "la", "Canyon run before work."],
  ["marcus", "drove", "gtr", 10, 4, "road", "Brutal launch. Feels like a video game."],
  ["marcus", "spotted", "miata", 22, null, "cc", null],
  ["dana", "drove", "miata", 5, 5, "sav", "Autocross season opener."],
  ["dana", "drove", "wrangler", 8, 4, "dragon", "Doors off, forest roads."],
  ["dana", "spotted", "mustang", 16, null, "atl", "Kona Blue GT, loud."],
  ["tom", "drove", "impala", 6, 5, "sav", "Sunday cruise. 327 running sweet."],
  ["tom", "drove", "golf", 11, 4, "nyc", "85 horsepower of pure joy."],
  ["tom", "spotted", "p911", 28, null, "nyc", null],
];

// Spotted-only, no canonical car: [who, model, yearGuess, colorGuess, daysAgo, placeKey, notes]
const LOOSE_SPOTS = [
  ["me", "Ferrari Roma", 2022, "Blu Corsa", 2, "atl", "Blew past me on 85."],
  ["me", "Mercedes-Benz G-Class", null, "Matte black", 11, "atl", null],
  ["alex", "Nissan Z", 2023, "Yellow", 9, "nyc", "New Z looks great in person."],
  ["jordan", "Chevrolet Corvette", 2020, "Torch Red", 13, "la", "C8 on Mulholland."],
  ["priya", "Porsche Taycan", null, "Frozen Blue", 19, "cc", null],
];

const FOLLOWS = [
  ["me", "alex"], ["me", "jordan"], ["me", "priya"], ["me", "dana"],
  ["alex", "me"], ["jordan", "me"], ["marcus", "me"],
  ["alex", "marcus"], ["jordan", "alex"], ["priya", "dana"], ["dana", "tom"], ["tom", "alex"], ["marcus", "priya"],
];

// [who, model, yearFrom, yearTo]
const WISHLIST = [
  ["me", "Porsche 911", null, null],
  ["me", "Nissan GT-R", 2009, 2015],
  ["me", "Acura NSX", 1991, 2005],
  ["alex", "Ferrari F8", null, null],
  ["jordan", "Toyota Supra", 1993, 1998],
  ["priya", "Rivian R1S", null, null],
  ["dana", "Honda Civic", null, 2015],
];

const PHOTOS = [
  ["civic", "me", "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/2016_Honda_Civic_EX-T_%28facelift%2C_red%29%2C_front_8.8.19.jpg/960px-2016_Honda_Civic_EX-T_%28facelift%2C_red%29%2C_front_8.8.19.jpg", "Fresh wash"],
  ["civic", "alex", "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/2022_Honda_Civic_Sport%2C_front_8.14.22.jpg/960px-2022_Honda_Civic_Sport%2C_front_8.14.22.jpg", "Borrowed for the day"],
  ["corolla", "jordan", "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/2020_Toyota_Corolla_LE_%28facelift%2C_white%29%2C_front_8.6.20.jpg/960px-2020_Toyota_Corolla_LE_%28facelift%2C_white%29%2C_front_8.6.20.jpg", "Appliance white"],
  ["impala", "tom", "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/1967_Chevrolet_Impala_SS_hardtop_%28orangered%29%2C_front_left.jpg/960px-1967_Chevrolet_Impala_SS_hardtop_%28orangered%29%2C_front_left.jpg", "Before the respray"],
];

const EMOJIS = ["🔥", "👀", "🤙"];

// Mirrors BADGE_DEFS in server.js — thresholds[i] is the count needed for level i+1.
const BADGE_THRESHOLDS = {
  "drive-count": [1, 10, 50, 100, 250],
  "spot-count": [1, 10, 50, 100],
  "brand-explorer": [2, 5, 10],
  "stick-shift": [1, 10, 25],
  "ev-pioneer": [1, 5, 10],
  "community": [1, 5, 10],
  "decade-collector": [2, 3, 5],
};

async function run() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  const col = (name) => db.collection(name);

  // Also drop app-created docs that point at seeded ones (e.g. you followed a
  // dummy user) — they'd be orphaned, and would collide with the reinsert.
  const seededIds = async (name) => (await col(name).find({ seed: true }, { projection: { _id: 1 } }).toArray()).map((d) => d._id);
  const [oldHumans, oldCars, oldExperiences] = await Promise.all(["humans", "cars", "experiences"].map(seededIds));
  await col("follows").deleteMany({ $or: [{ follower: { $in: oldHumans } }, { followee: { $in: oldHumans } }] });
  await col("reactions").deleteMany({ $or: [{ human: { $in: oldHumans } }, { experience: { $in: oldExperiences } }] });
  await col("experiences").deleteMany({ $or: [{ loggedBy: { $in: oldHumans } }, { car: { $in: oldCars } }] });
  await col("ownerships").deleteMany({ $or: [{ owner: { $in: oldHumans } }, { car: { $in: oldCars } }] });
  await col("photos").deleteMany({ car: { $in: oldCars } });
  await col("wishlistitems").deleteMany({ human: { $in: oldHumans } });
  for (const name of COLLECTIONS) await col(name).deleteMany({ seed: true });
  if (CLEAR_ONLY) {
    console.log("Cleared seeded data.");
    return;
  }

  const realHumans = await col("humans").find({ clerkId: { $type: "string" } }).toArray();
  const me = emailArg ? realHumans.find((h) => h.email === emailArg) : realHumans[0];
  if (emailArg && !me) throw new Error(`No logged-in user with email ${emailArg}`);
  if (!emailArg && realHumans.length > 1) {
    console.log(`Multiple logged-in users; attaching data to ${me.email}. Use --email to pick another.`);
  }

  const manufacturers = await col("manufacturers").find().toArray();
  const mfrName = Object.fromEntries(manufacturers.map((m) => [String(m._id), m.name]));
  const models = await col("models").find().toArray();
  const modelByName = Object.fromEntries(models.map((m) => [`${mfrName[String(m.manufacturer)]} ${m.name}`, m]));
  if (models.length === 0) throw new Error("No models in carsDB — start the backend once so it seeds the registry, then re-run.");

  const humanId = { ...(me ? { me: me._id } : {}) };
  HUMANS.forEach((h, i) => { humanId[h.key] = oid("a", i + 1); });
  const has = (who) => humanId[who] != null;

  await col("humans").insertMany(HUMANS.map((h) => ({
    _id: humanId[h.key], name: h.name, email: `${h.key}@example.com`, username: h.username, avatarUrl: h.avatarUrl, seed: true,
  })));

  const cars = {};
  CARS.forEach((c, i) => {
    const model = modelByName[c.model];
    if (!model) throw new Error(`Model "${c.model}" is not in the registry`);
    cars[c.key] = {
      _id: oid("c", i + 1), model: model._id, year: c.year, nickname: c.nickname, transmission: c.transmission,
      colorInfo: { name: c.color[0], hex: c.color[1], isCustom: false },
      trim: c.trim, drivetrain: c.drivetrain, vin: c.vin, thumbnailPhoto: null, seed: true,
      manufacturerName: mfrName[String(model.manufacturer)],
    };
  });

  const photos = PHOTOS.filter(([, who]) => has(who)).map(([carKey, who, url, caption], i) => ({
    _id: oid("f", i + 1), car: cars[carKey]._id, uploadedBy: humanId[who], url, cloudinaryPublicId: null, caption, createdAt: daysAgo(40 - i), seed: true,
  }));
  for (const p of photos) {
    const car = Object.values(cars).find((c) => c._id.equals(p.car));
    if (!car.thumbnailPhoto) car.thumbnailPhoto = p._id;
  }
  await col("cars").insertMany(Object.values(cars).map(({ manufacturerName, ...doc }) => doc));
  if (photos.length) await col("photos").insertMany(photos);

  await col("ownerships").insertMany(OWNERSHIPS.filter(([, who]) => has(who)).map(([carKey, who, from, to]) => ({
    car: cars[carKey]._id, owner: humanId[who], from: daysAgo(from), to: to == null ? null : daysAgo(to), seed: true,
  })));

  const experiences = [
    ...EXPERIENCES.filter(([who]) => has(who)).map(([who, type, carKey, ago, rating, place, notes], i) => ({
      car: cars[carKey]._id, vehicleModel: null, yearGuess: null, colorGuess: null,
      type, date: daysAgo(ago), notes, rating, loggedBy: humanId[who],
      location: PLACES[place], weather: WEATHER[i % WEATHER.length],
    })),
    ...LOOSE_SPOTS.filter(([who]) => has(who)).map(([who, modelName, yearGuess, colorGuess, ago, place, notes], i) => {
      const model = modelByName[modelName];
      if (!model) throw new Error(`Model "${modelName}" is not in the registry`);
      return {
        car: null, vehicleModel: model._id, yearGuess, colorGuess,
        type: "spotted", date: daysAgo(ago), notes, rating: null, loggedBy: humanId[who],
        location: PLACES[place], weather: WEATHER[(i + 1) % WEATHER.length],
      };
    }),
  ].map((e, i) => ({ _id: oid("e", i + 1), ...e, seed: true }));
  await col("experiences").insertMany(experiences);

  const follows = FOLLOWS.filter(([a, b]) => has(a) && has(b)).map(([a, b], i) => ({
    follower: humanId[a], followee: humanId[b], createdAt: daysAgo(60 - i), updatedAt: daysAgo(60 - i), seed: true,
  }));
  await col("follows").insertMany(follows);

  // Everyone reacts to roughly every third experience that isn't their own.
  const everyone = Object.keys(humanId);
  const reactions = [];
  experiences.forEach((e, i) => {
    everyone.forEach((who, j) => {
      if (humanId[who].equals(e.loggedBy) || (i + j) % 3 !== 0) return;
      reactions.push({ experience: e._id, human: humanId[who], emoji: EMOJIS[(i + j) % EMOJIS.length], createdAt: e.date, updatedAt: e.date, seed: true });
    });
  });
  await col("reactions").insertMany(reactions);

  // Skip models the real user already has on their own wishlist (unique per human+model).
  const taken = new Set((me ? await col("wishlistitems").find({ human: me._id }).toArray() : []).map((w) => String(w.model)));
  const wishlist = WISHLIST.filter(([who, modelName]) => has(who) && !(who === "me" && taken.has(String(modelByName[modelName]._id)))).map(([who, modelName, yearFrom, yearTo], i) => ({
    human: humanId[who], model: modelByName[modelName]._id, yearFrom, yearTo, createdAt: daysAgo(50 - i), updatedAt: daysAgo(50 - i), seed: true,
  }));
  if (wishlist.length) await col("wishlistitems").insertMany(wishlist);

  const carById = Object.fromEntries(Object.values(cars).map((c) => [String(c._id), c]));
  const badges = [];
  for (const who of everyone) {
    const id = humanId[who];
    const mine = experiences.filter((e) => e.loggedBy.equals(id));
    const drives = mine.filter((e) => e.type === "drove").map((e) => carById[String(e.car)]);
    const counts = {
      "drive-count": drives.length,
      "spot-count": mine.filter((e) => e.type === "spotted").length,
      "brand-explorer": new Set(drives.map((c) => c.manufacturerName)).size,
      "stick-shift": drives.filter((c) => c.transmission === "Manual").length,
      "ev-pioneer": drives.filter((c) => c.transmission === "Electric").length,
      "community": follows.filter((f) => f.follower.equals(id)).length,
      "decade-collector": new Set(drives.map((c) => Math.floor(c.year / 10))).size,
    };
    for (const [seriesSlug, thresholds] of Object.entries(BADGE_THRESHOLDS)) {
      const level = thresholds.filter((t) => counts[seriesSlug] >= t).length;
      if (level > 0) badges.push({ human: id, seriesSlug, level, createdAt: new Date(), updatedAt: new Date(), seed: true });
    }
  }
  // The real user may already hold badges from app activity; seeded ones replace them.
  if (me) await col("userbadges").deleteMany({ human: me._id });
  await col("userbadges").insertMany(badges);

  console.log(`Seeded ${HUMANS.length} users, ${CARS.length} cars, ${experiences.length} experiences, ${follows.length} follows, ${reactions.length} reactions, ${wishlist.length} wishlist items, ${photos.length} photos, ${badges.length} badges.`);
  console.log(me
    ? `Attached data to ${me.name} <${me.email}>.`
    : "No logged-in user found — sign in at http://localhost:3000 once, then re-run to attach data to your account.");
}

run()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => mongoose.connection.close());
