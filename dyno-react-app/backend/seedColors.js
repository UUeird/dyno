const mongoose = require("mongoose");

mongoose
  .connect("mongodb://localhost:27017/carsDB")
  .then(run)
  .catch((err) => { console.error(err); process.exit(1); });

const colorEntrySchema = new mongoose.Schema({ name: String, hex: String }, { _id: false });
const manufacturerSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  models: [String],
  colors: { type: Map, of: [colorEntrySchema], default: {} },
});
const Manufacturer = mongoose.model("Manufacturer", manufacturerSchema);

// Generic palette — used as "*" fallback for every manufacturer/model
const GENERIC = [
  { name: "Black",       hex: "#1a1a1a" },
  { name: "White",       hex: "#f5f5f5" },
  { name: "Silver",      hex: "#c0c0c0" },
  { name: "Gray",        hex: "#808080" },
  { name: "Red",         hex: "#c0392b" },
  { name: "Blue",        hex: "#2471a3" },
  { name: "Navy",        hex: "#1a2744" },
  { name: "Green",       hex: "#1e8449" },
  { name: "Brown",       hex: "#6e4c2a" },
  { name: "Beige",       hex: "#d4c5a9" },
  { name: "Gold",        hex: "#c9a84c" },
  { name: "Orange",      hex: "#d35400" },
  { name: "Yellow",      hex: "#d4ac0d" },
  { name: "Maroon",      hex: "#6b1a1a" },
  { name: "Purple",      hex: "#6c3483" },
  { name: "Teal",        hex: "#148f77" },
];

// Model-specific palettes (these override the generic fallback)
const MODEL_COLORS = {
  // Toyota
  "Supra": [
    { name: "Renaissance Red 2.0", hex: "#9b1c1c" },
    { name: "Nitro Yellow",        hex: "#d4c013" },
    { name: "Phantom",             hex: "#1a1a1a" },
    { name: "Tungsten",            hex: "#6b6f72" },
    { name: "Downshift Blue",      hex: "#1a3a5c" },
    { name: "Cloudburst",          hex: "#8fa3b1" },
    { name: "White",               hex: "#f5f5f5" },
  ],
  "Corolla": [
    { name: "Midnight Black",      hex: "#1a1a1a" },
    { name: "Blizzard Pearl",      hex: "#f0f0f0" },
    { name: "Supersonic Red",      hex: "#b22222" },
    { name: "Blue Crush",          hex: "#1f5c8b" },
    { name: "Galactic Aqua",       hex: "#2e8b7a" },
    { name: "Precious Metal",      hex: "#8a9099" },
    { name: "Oxide Bronze",        hex: "#7a5c3a" },
  ],
  // Honda
  "Civic": [
    { name: "Sonic Gray Pearl",    hex: "#6b6f72" },
    { name: "Rallye Red",          hex: "#c0392b" },
    { name: "Aegean Blue",         hex: "#1a4a6e" },
    { name: "Lunar Silver",        hex: "#b0b8c1" },
    { name: "Crystal Black Pearl", hex: "#0d0d0d" },
    { name: "Platinum White Pearl",hex: "#f0f0f0" },
    { name: "Boost Blue",          hex: "#1a5276" },
    { name: "Radiant Red",         hex: "#8b1a1a" },
  ],
  // BMW
  "M3": [
    { name: "San Marino Blue",     hex: "#1a3a6e" },
    { name: "Isle of Man Green",   hex: "#2e5c2e" },
    { name: "Imola Red",           hex: "#8b1a1a" },
    { name: "Frozen Black",        hex: "#1a1a1a" },
    { name: "Alpine White",        hex: "#f5f5f5" },
    { name: "Interlagos Blue",     hex: "#1a2f5e" },
    { name: "Sao Paulo Yellow",    hex: "#c8a800" },
  ],
  // Ford
  "Mustang": [
    { name: "Race Red",            hex: "#b22222" },
    { name: "Grabber Blue",        hex: "#1560bd" },
    { name: "Rapid Red",           hex: "#8b2020" },
    { name: "Shadow Black",        hex: "#1a1a1a" },
    { name: "Oxford White",        hex: "#f5f5f5" },
    { name: "Carbonized Gray",     hex: "#4a4a4a" },
    { name: "Grabber Yellow",      hex: "#d4b800" },
    { name: "Eruption Green",      hex: "#2a5c2a" },
  ],
  // Tesla
  "Model 3": [
    { name: "Pearl White",         hex: "#f0f0f0" },
    { name: "Solid Black",         hex: "#1a1a1a" },
    { name: "Midnight Silver",     hex: "#6b7280" },
    { name: "Deep Blue",           hex: "#1a2f5e" },
    { name: "Red Multi-Coat",      hex: "#9b1c1c" },
    { name: "Stealth Grey",        hex: "#4a4a4a" },
  ],
  "Cybertruck": [
    { name: "Stainless Steel",     hex: "#b8bcc0" },
    { name: "Black",               hex: "#1a1a1a" },
    { name: "White",               hex: "#f0f0f0" },
  ],
};

async function run() {
  const manufacturers = await Manufacturer.find();

  for (const mfr of manufacturers) {
    const colorsMap = new Map();

    // Set generic fallback
    colorsMap.set("*", GENERIC);

    // Set any model-specific palettes that apply to this manufacturer
    for (const model of mfr.models) {
      if (MODEL_COLORS[model]) {
        colorsMap.set(model, MODEL_COLORS[model]);
      }
    }

    mfr.colors = colorsMap;
    await mfr.save();
    console.log(`Updated ${mfr.name} (${colorsMap.size - 1} model-specific palettes)`);
  }

  console.log("Done.");
  mongoose.connection.close();
}
