const mongoose = require("mongoose");

// Connect to MongoDB
mongoose
  .connect("mongodb://localhost:27017/carsDB", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Error connecting to MongoDB:", err));

// Define a schema and model for cars
const carSchema = new mongoose.Schema({
  make: String,
  model: String,
  year: Number,
});

const Car = mongoose.model("Car", carSchema);

// Seed data
const carData = [
  { make: "Toyota", model: "Corolla", year: 2019 },
  { make: "Honda", model: "Civic", year: 2020 },
  { make: "Chevrolet", model: "Impala", year: 2015 },
];

// Insert the data
Car.insertMany(carData)
  .then(() => {
    console.log("Data successfully inserted");
    mongoose.connection.close();
  })
  .catch((error) => {
    console.error("Error inserting data:", error);
    mongoose.connection.close();
  });
