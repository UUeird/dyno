const mongoose = require("mongoose");

mongoose
  .connect("mongodb://localhost:27017/carsDB")
  .then(run)
  .catch((err) => { console.error(err); process.exit(1); });

const yearRangeSchema = new mongoose.Schema({ from: Number, to: Number }, { _id: false });
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

// Helper: open-ended range (e.g. still in production)
const from = (yr) => ({ from: yr, to: null });
const range = (f, t) => ({ from: f, to: t });

const MODEL_TRIMS = {
  // ── Honda ──────────────────────────────────────────────────────────────────

  "Civic": [
    // 7th gen (2001–2005): DX, LX, EX, Si
    // 8th gen (2006–2011): DX, LX, EX, Si, Hybrid
    // 9th gen (2012–2015): DX, LX, EX, Si, Hybrid (DX exits after 2012)
    // 10th gen (2016–2021): LX, Sport, EX, EX-T, EX-L, Touring, Si, Type R
    // 11th gen (2022–):    LX, Sport, EX, Sport-L, Touring, Si, Type R
    { name: "DX",       years: [range(2001, 2012)] },
    { name: "LX",       years: [range(2001, null)] },
    { name: "EX",       years: [range(2001, null)] },
    { name: "EX-L",     years: [range(2016, 2021)] },
    { name: "EX-T",     years: [range(2016, 2021)] },
    { name: "Sport",    years: [range(2016, null)] },
    { name: "Sport-L",  years: [range(2022, null)] },
    { name: "Touring",  years: [range(2016, null)] },
    { name: "Hybrid",   years: [range(2003, 2015)] },
    { name: "Si",       years: [range(2002, null)] },
    { name: "Type R",   years: [range(2017, null)] },
  ],

  "Accord": [
    { name: "LX",       years: [range(1990, null)] },
    { name: "Sport",    years: [range(2013, null)] },
    { name: "EX",       years: [range(1990, null)] },
    { name: "EX-L",     years: [range(2003, null)] },
    { name: "Touring",  years: [range(2013, null)] },
    { name: "Hybrid",   years: [range(2005, 2007), range(2014, null)] },
  ],

  // ── Toyota ─────────────────────────────────────────────────────────────────

  "Corolla": [
    { name: "L",        years: [range(2014, null)] },
    { name: "LE",       years: [range(1993, null)] },
    { name: "XLE",      years: [range(1993, 2018)] },
    { name: "SE",       years: [range(2014, null)] },
    { name: "XSE",      years: [range(2017, null)] },
    { name: "Hybrid LE",years: [range(2020, null)] },
  ],

  "Camry": [
    { name: "L",        years: [range(2018, null)] },
    { name: "LE",       years: [range(1992, null)] },
    { name: "SE",       years: [range(2002, null)] },
    { name: "XLE",      years: [range(1992, null)] },
    { name: "XSE",      years: [range(2015, null)] },
    { name: "TRD",      years: [range(2020, null)] },
    { name: "Hybrid LE",years: [range(2007, null)] },
    { name: "Hybrid XLE",years:[range(2007, null)] },
  ],

  "Supra": [
    // A80 (1993–1998): base, Sport Roof, Turbo, Turbo Sport Roof
    // A90 (2020–): 2.0, 3.0, 3.0 Premium, A91 Edition, 45th Anniversary
    { name: "Base",             years: [range(1993, 1998)] },
    { name: "Turbo",            years: [range(1993, 1998)] },
    { name: "2.0",              years: [range(2020, null)] },
    { name: "3.0",              years: [range(2020, null)] },
    { name: "3.0 Premium",      years: [range(2020, null)] },
    { name: "A91 Edition",      years: [range(2021, 2022)] },
    { name: "45th Anniversary", years: [range(2023, 2023)] },
  ],

  // ── Ford ───────────────────────────────────────────────────────────────────

  "Mustang": [
    { name: "EcoBoost",          years: [range(2015, null)] },
    { name: "EcoBoost Premium",  years: [range(2015, null)] },
    { name: "GT",                years: [range(1964, null)] },
    { name: "GT Premium",        years: [range(2005, null)] },
    { name: "Mach 1",            years: [range(1969, 1973), range(2021, null)] },
    { name: "Shelby GT350",      years: [range(2015, 2020)] },
    { name: "Shelby GT500",      years: [range(1967, 1970), range(2007, 2009), range(2020, null)] },
    { name: "Mach-E",            years: [range(2021, null)] },
  ],

  // ── BMW ────────────────────────────────────────────────────────────────────

  "M3": [
    // E30 (1986–1991), E36 (1995–1999), E46 (2001–2006),
    // E90/92/93 (2008–2013), F80 (2015–2018), G80 (2021–)
    { name: "Base",           years: [range(1986, 1991), range(1995, 1999), range(2001, 2006), range(2008, 2013), range(2015, 2018), range(2021, null)] },
    { name: "Competition",    years: [range(2016, null)] },
    { name: "CS",             years: [range(2018, 2018), range(2023, null)] },
    { name: "xDrive",         years: [range(2021, null)] },
  ],

  // ── Chevrolet ──────────────────────────────────────────────────────────────

  "Camaro": [
    { name: "LS",       years: [range(2010, null)] },
    { name: "LT",       years: [range(2010, null)] },
    { name: "LT1",      years: [range(2016, null)] },
    { name: "SS",       years: [range(1967, 2002), range(2010, null)] },
    { name: "ZL1",      years: [range(1969, 1969), range(2012, null)] },
    { name: "Z/28",     years: [range(1967, 2002), range(2014, 2015)] },
    { name: "1LE",      years: [range(2012, null)] },
  ],
};

async function run() {
  const manufacturers = await Manufacturer.find();

  for (const mfr of manufacturers) {
    const trimsMap = new Map(mfr.trims || []);
    let updated = 0;

    for (const model of mfr.models) {
      if (MODEL_TRIMS[model]) {
        trimsMap.set(model, MODEL_TRIMS[model]);
        updated++;
      }
    }

    mfr.trims = trimsMap;
    await mfr.save();
    console.log(`Updated ${mfr.name} (${updated} model trim lists)`);
  }

  console.log("Done.");
  mongoose.connection.close();
}
