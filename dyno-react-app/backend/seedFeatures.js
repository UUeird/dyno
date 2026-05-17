const mongoose = require("mongoose");

mongoose
  .connect("mongodb://localhost:27017/carsDB")
  .then(run)
  .catch((err) => { console.error(err); process.exit(1); });

const yearRangeSchema = new mongoose.Schema({
  from: Number, to: Number, features: { type: [String], default: [] },
}, { _id: false });
const trimEntrySchema = new mongoose.Schema({
  name: String,
  years: { type: [yearRangeSchema], default: [] },
}, { _id: false });
const colorEntrySchema = new mongoose.Schema({ name: String, hex: String }, { _id: false });
const manufacturerSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  models: [String],
  colors: { type: Map, of: [colorEntrySchema], default: {} },
  trims: { type: Map, of: [trimEntrySchema], default: {} },
});
const Manufacturer = mongoose.model("Manufacturer", manufacturerSchema);

// Shorthand helpers
const r = (from, to, features = []) => ({ from, to, features });
const open = (from, features = []) => ({ from, to: null, features });

// Features keyed by manufacturer name > model name > trim name > year spans
// Only models/trims that have feature data are listed here.
// Run this script again as new data is added — it merges into existing trims.
const FEATURES = {
  Honda: {
    Civic: {
      // ── 9th gen (2012–2015) ────────────────────────────────────────────────
      DX: [
        r(2001, 2011, ["Air conditioning", "CD player", "Power windows", "Power locks"]),
        r(2012, 2012, ["Air conditioning", "CD player", "Power windows", "Power locks"]),
      ],
      LX: [
        r(2001, 2011, ["Air conditioning", "CD player", "Power windows", "Power locks", "Cruise control"]),
        r(2012, 2015, ["Air conditioning", "CD player", "Power windows", "Power locks", "Cruise control", "Rearview camera"]),
        open(2016,    ["Air conditioning", "Apple CarPlay", "Android Auto", "Power windows", "Power locks", "Cruise control", "Rearview camera", "Honda Sensing"]),
      ],
      EX: [
        r(2001, 2011, ["Sunroof", "Alloy wheels", "Power windows", "Power locks", "Cruise control", "CD player"]),
        r(2012, 2015, ["Sunroof", "Alloy wheels", "Power windows", "Power locks", "Cruise control", "Bluetooth"]),
        r(2016, 2021, ["Sunroof", "Alloy wheels", "Apple CarPlay", "Android Auto", "Power windows", "Power locks", "Adaptive cruise control", "Lane keeping assist", "Rearview camera", "Honda Sensing"]),
        open(2022,    ["Sunroof", "Alloy wheels", "Apple CarPlay", "Android Auto", "Power windows", "Power locks", "Adaptive cruise control", "Lane keeping assist", "Rearview camera", "Honda Sensing", "Remote start"]),
      ],
      "EX-L": [
        r(2016, 2021, ["Sunroof", "Alloy wheels", "Leather seats", "Heated front seats", "Apple CarPlay", "Android Auto", "Adaptive cruise control", "Lane keeping assist", "Rearview camera", "Honda Sensing"]),
      ],
      Touring: [
        r(2016, 2021, ["Sunroof", "Alloy wheels", "Leather seats", "Heated front seats", "Navigation", "Apple CarPlay", "Android Auto", "Adaptive cruise control", "Lane keeping assist", "Rearview camera", "Honda Sensing", "Remote start"]),
        open(2022,    ["Sunroof", "Alloy wheels", "Leather seats", "Heated front seats", "Navigation", "Apple CarPlay", "Android Auto", "Wireless charging", "Adaptive cruise control", "Lane keeping assist", "Rearview camera", "Honda Sensing", "Remote start"]),
      ],
      Si: [
        r(2002, 2015, ["Alloy wheels", "Sport-tuned suspension", "6-speed manual", "Cruise control"]),
        open(2016,    ["Alloy wheels", "Sport-tuned suspension", "6-speed manual", "Cruise control", "Apple CarPlay", "Android Auto", "Rearview camera", "Honda Sensing"]),
      ],
      "Type R": [
        open(2017, ["Alloy wheels", "Brembo brakes", "Adaptive suspension", "6-speed manual", "Limited-slip differential", "Apple CarPlay", "Android Auto", "Rearview camera"]),
      ],
    },

    Accord: {
      LX: [
        r(1990, 2012, ["Air conditioning", "Power windows", "Power locks", "Cruise control"]),
        r(2013, 2017, ["Air conditioning", "Power windows", "Power locks", "Cruise control", "Rearview camera", "Bluetooth"]),
        open(2018,    ["Air conditioning", "Power windows", "Power locks", "Adaptive cruise control", "Lane keeping assist", "Rearview camera", "Apple CarPlay", "Android Auto", "Honda Sensing"]),
      ],
      EX: [
        r(1990, 2012, ["Sunroof", "Alloy wheels", "Power windows", "Power locks", "Cruise control"]),
        r(2013, 2017, ["Sunroof", "Alloy wheels", "Power windows", "Power locks", "Cruise control", "Rearview camera", "Bluetooth"]),
        open(2018,    ["Sunroof", "Alloy wheels", "Adaptive cruise control", "Lane keeping assist", "Rearview camera", "Apple CarPlay", "Android Auto", "Honda Sensing"]),
      ],
    },
  },

  Toyota: {
    Supra: {
      // A80 gen
      Base: [
        r(1993, 1998, ["Alloy wheels", "Power windows", "Power locks", "Cruise control", "Air conditioning"]),
      ],
      Turbo: [
        r(1993, 1998, ["Alloy wheels", "Twin-turbocharged engine", "Power windows", "Power locks", "Cruise control", "Air conditioning", "Sport-tuned suspension", "Brembo brakes"]),
      ],
      // A90 gen
      "2.0": [
        open(2020, ["Alloy wheels", "8.8\" touchscreen", "Apple CarPlay", "JBL audio", "Adaptive suspension", "Active differential"]),
      ],
      "3.0": [
        open(2020, ["Alloy wheels", "8.8\" touchscreen", "Apple CarPlay", "JBL audio", "Adaptive suspension", "Active differential", "Head-up display", "Wireless charging"]),
      ],
      "3.0 Premium": [
        open(2020, ["Alloy wheels", "8.8\" touchscreen", "Apple CarPlay", "JBL audio", "Adaptive suspension", "Active differential", "Head-up display", "Wireless charging", "12-speaker audio", "Heated seats", "Surround-view camera"]),
      ],
    },

    Corolla: {
      LE: [
        r(1993, 2013, ["Air conditioning", "Power windows", "Power locks", "Cruise control"]),
        r(2014, 2018, ["Air conditioning", "Power windows", "Power locks", "Cruise control", "Rearview camera", "Bluetooth"]),
        open(2019,    ["Air conditioning", "Rearview camera", "Bluetooth", "Apple CarPlay", "Android Auto", "Pre-collision system", "Lane departure alert", "Adaptive cruise control"]),
      ],
      SE: [
        r(2014, 2018, ["Alloy wheels", "Sport seats", "Power windows", "Power locks", "Cruise control", "Rearview camera", "Bluetooth"]),
        open(2019,    ["Alloy wheels", "Sport seats", "Rearview camera", "Apple CarPlay", "Android Auto", "Pre-collision system", "Lane departure alert", "Adaptive cruise control"]),
      ],
    },
  },

  Ford: {
    Mustang: {
      GT: [
        r(1964, 2004, ["V8 engine", "Alloy wheels", "Power windows"]),
        r(2005, 2014, ["V8 engine", "Alloy wheels", "Power windows", "Bluetooth", "Rearview camera"]),
        open(2015,    ["V8 engine", "Alloy wheels", "Power windows", "Bluetooth", "Rearview camera", "Apple CarPlay", "Android Auto", "Launch control"]),
      ],
      "Shelby GT500": [
        r(1967, 1970, ["Supercharged V8", "Alloy wheels"]),
        r(2007, 2009, ["Supercharged V8", "Alloy wheels", "Brembo brakes", "Bluetooth"]),
        open(2020,    ["Supercharged V8", "Alloy wheels", "Brembo brakes", "Apple CarPlay", "Android Auto", "MagneRide suspension", "Launch control", "Line-lock"]),
      ],
    },
  },

  BMW: {
    M3: {
      Base: [
        r(1986, 1991, ["Sport-tuned suspension", "Limited-slip differential", "Alloy wheels"]),
        r(1995, 1999, ["Sport-tuned suspension", "Limited-slip differential", "Alloy wheels", "Air conditioning"]),
        r(2001, 2006, ["Sport-tuned suspension", "Limited-slip differential", "Alloy wheels", "SMG transmission option", "Head-up display"]),
        r(2008, 2013, ["V8 engine", "Sport-tuned suspension", "Limited-slip differential", "Alloy wheels", "iDrive", "Bluetooth"]),
        r(2015, 2018, ["Sport-tuned suspension", "Limited-slip differential", "Alloy wheels", "iDrive", "Apple CarPlay", "Adaptive suspension", "Carbon fiber roof"]),
        open(2021,    ["Sport-tuned suspension", "Limited-slip differential", "Alloy wheels", "iDrive 7", "Apple CarPlay", "Android Auto", "Adaptive M suspension", "M xDrive available", "Wireless charging", "Head-up display"]),
      ],
      Competition: [
        r(2016, 2020, ["Sport-tuned suspension", "Limited-slip differential", "Alloy wheels", "iDrive", "Apple CarPlay", "Adaptive suspension", "Carbon fiber roof", "Higher redline"]),
        open(2021,    ["Sport-tuned suspension", "Limited-slip differential", "Alloy wheels", "iDrive 7", "Apple CarPlay", "Android Auto", "Adaptive M suspension", "Higher redline", "Wireless charging", "Head-up display"]),
      ],
    },
  },
};

async function run() {
  const manufacturers = await Manufacturer.find();

  for (const mfr of manufacturers) {
    const modelFeatures = FEATURES[mfr.name];
    if (!modelFeatures) continue;

    let updatedModels = 0;
    const trimsMap = new Map(mfr.trims || []);

    for (const [model, trimFeatures] of Object.entries(modelFeatures)) {
      const existingTrims = trimsMap.get(model) || [];

      const updatedTrims = existingTrims.map((trim) => {
        const featureSpans = trimFeatures[trim.name];
        // If this script defines spans for this trim, replace them wholesale —
        // the feature spans ARE the authoritative year-range definition.
        if (featureSpans) return { name: trim.name, years: featureSpans };
        return trim;
      });

      trimsMap.set(model, updatedTrims);
      updatedModels++;
    }

    mfr.trims = trimsMap;
    await mfr.save();
    console.log(`Updated ${mfr.name} (${updatedModels} model(s) with features)`);
  }

  console.log("Done.");
  mongoose.connection.close();
}
