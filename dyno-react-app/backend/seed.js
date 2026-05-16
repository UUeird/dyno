const mongoose = require("mongoose");

mongoose
  .connect("mongodb://localhost:27017/carsDB")
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Error connecting to MongoDB:", err));

const humanSchema = new mongoose.Schema({ name: String, email: String });
const Human = mongoose.model("Human", humanSchema);

const manufacturerSchema = new mongoose.Schema({ name: { type: String, unique: true }, models: [String] });
const Manufacturer = mongoose.model("Manufacturer", manufacturerSchema);

const carSchema = new mongoose.Schema({
  manufacturer: String,
  model: String,
  year: Number,
  transmission: String,
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "Human", default: null },
});
const Car = mongoose.model("Car", carSchema);

const manufacturerData = [
  { name: "Toyota", models: ["Corolla", "Camry", "RAV4", "Prius", "Supra"] },
  { name: "Honda", models: ["Civic", "Accord", "CR-V", "Pilot", "Fit"] },
  { name: "Chevrolet", models: ["Impala", "Malibu", "Camaro", "Tahoe", "Silverado"] },
  { name: "Ford", models: ["Mustang", "F-150", "Escape", "Explorer", "Bronco"] },
  { name: "Nissan", models: ["Altima", "Sentra", "Maxima", "Rogue", "GT-R"] },
  { name: "BMW", models: ["3 Series", "5 Series", "X3", "X5", "M3"] },
  { name: "Mercedes-Benz", models: ["C-Class", "E-Class", "S-Class", "GLC", "AMG GT"] },
  { name: "Audi", models: ["A3", "A4", "A6", "Q5", "R8"] },
  { name: "Tesla", models: ["Model 3", "Model S", "Model X", "Model Y", "Cybertruck"] },
  { name: "Cadillac", models: ["CT4", "CT5", "Escalade", "XT5", "Lyriq"] },
];

const seedAll = async () => {
  try {
    await Human.deleteMany({});
    await Manufacturer.deleteMany({});
    await Car.deleteMany({});

    const humans = await Human.insertMany([
      { name: "Sam Lawrence", email: "sam@samelawrence.com" },
      { name: "Alex Rivera", email: "alex@example.com" },
      { name: "Jordan Smith", email: "jordan@example.com" },
    ]);
    console.log("Humans successfully inserted");

    await Manufacturer.insertMany(manufacturerData);
    console.log("Manufacturers successfully inserted");

    await Car.insertMany([
      { manufacturer: "Toyota", model: "Corolla", year: 2019, transmission: "Automatic", owner: humans[0]._id },
      { manufacturer: "Honda", model: "Civic", year: 2020, transmission: "Manual", owner: humans[1]._id },
      { manufacturer: "Chevrolet", model: "Impala", year: 2015, transmission: "Automatic" },
    ]);
    console.log("Cars successfully inserted");
  } catch (error) {
    console.error("Error inserting data:", error);
  } finally {
    mongoose.connection.close();
  }
};

seedAll();
