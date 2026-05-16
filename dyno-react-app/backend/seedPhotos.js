const mongoose = require("mongoose");

mongoose.connect("mongodb://localhost:27017/carsDB").then(run).catch(console.error);

const Human = mongoose.model("Human", new mongoose.Schema({ name: String, email: String }));
const Car = mongoose.model("Car", new mongoose.Schema({
  manufacturer: String, model: String, year: Number,
  thumbnailPhoto: { type: mongoose.Schema.Types.ObjectId, default: null },
}));
const Photo = mongoose.model("Photo", new mongoose.Schema({
  car: mongoose.Schema.Types.ObjectId,
  uploadedBy: mongoose.Schema.Types.ObjectId,
  url: String,
  caption: String,
  createdAt: { type: Date, default: Date.now },
}));

// Curated Wikimedia Commons image URLs per model
const CAR_PHOTOS = {
  "Honda Civic": [
    { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Honda_Civic_e-HEV_Sport_%28XI%29_%E2%80%93_f_30062024.jpg/960px-Honda_Civic_e-HEV_Sport_%28XI%29_%E2%80%93_f_30062024.jpg", caption: "2024 Honda Civic e-HEV Sport" },
    { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/2022_Honda_Civic_Sport%2C_front_8.14.22.jpg/960px-2022_Honda_Civic_Sport%2C_front_8.14.22.jpg", caption: "2022 Honda Civic Sport" },
    { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/2016_Honda_Civic_EX-T_%28facelift%2C_red%29%2C_front_8.8.19.jpg/960px-2016_Honda_Civic_EX-T_%28facelift%2C_red%29%2C_front_8.8.19.jpg", caption: "2016 Honda Civic EX-T" },
  ],
  "Toyota Corolla": [
    { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Toyota_Corolla_Hybrid_%28E210%29_IMG_4338.jpg/960px-Toyota_Corolla_Hybrid_%28E210%29_IMG_4338.jpg", caption: "Toyota Corolla Hybrid E210" },
    { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/2020_Toyota_Corolla_LE_%28facelift%2C_white%29%2C_front_8.6.20.jpg/960px-2020_Toyota_Corolla_LE_%28facelift%2C_white%29%2C_front_8.6.20.jpg", caption: "2020 Toyota Corolla LE" },
    { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/2017_Toyota_Corolla_%28ZRE172R%29_Ascent_sedan_%282018-09-18%29_01.jpg/960px-2017_Toyota_Corolla_%28ZRE172R%29_Ascent_sedan_%282018-09-18%29_01.jpg", caption: "2017 Toyota Corolla Ascent" },
  ],
  "Chevrolet Impala": [
    { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Chevrolet_Impala_%2814373209694%29_%28cropped%29.jpg/960px-Chevrolet_Impala_%2814373209694%29_%28cropped%29.jpg", caption: "Chevrolet Impala" },
    { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/2014_Chevrolet_Impala_LTZ_%28white%29%2C_front_6.12.19.jpg/960px-2014_Chevrolet_Impala_LTZ_%28white%29%2C_front_6.12.19.jpg", caption: "2014 Chevrolet Impala LTZ" },
    { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/1967_Chevrolet_Impala_SS_hardtop_%28orangered%29%2C_front_left.jpg/960px-1967_Chevrolet_Impala_SS_hardtop_%28orangered%29%2C_front_left.jpg", caption: "1967 Chevrolet Impala SS" },
  ],
};

const FALLBACK_PHOTOS = [
  { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png", caption: "Placeholder" },
];

async function run() {
  try {
    const cars = await Car.find();
    const humans = await Human.find();
    if (!cars.length || !humans.length) {
      console.log("No cars or humans found. Run the main seed first.");
      return;
    }

    await Photo.deleteMany({});
    await Car.updateMany({}, { $unset: { thumbnailPhoto: "" } });
    console.log("Cleared existing photos");

    for (const car of cars) {
      const key = `${car.manufacturer} ${car.model}`;
      const photoDefs = CAR_PHOTOS[key] || FALLBACK_PHOTOS;
      let firstPhotoId = null;

      console.log(`Seeding ${photoDefs.length} photo(s) for ${key}...`);
      for (let i = 0; i < photoDefs.length; i++) {
        const uploader = humans[i % humans.length];
        const photo = await Photo.create({
          car: car._id,
          uploadedBy: uploader._id,
          url: photoDefs[i].url,
          caption: photoDefs[i].caption,
        });
        if (!firstPhotoId) firstPhotoId = photo._id;
      }

      if (firstPhotoId) {
        await Car.updateOne({ _id: car._id }, { thumbnailPhoto: firstPhotoId });
      }
    }

    console.log("Photo seeding complete.");
  } finally {
    mongoose.connection.close();
  }
}
