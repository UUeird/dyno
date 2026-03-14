const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

// Initialize the app
const app = express();
app.use(express.json());
app.use(cors());

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
  manufacturer: String,
  model: String,
  year: Number,
  transmission: String,
});

const Car = mongoose.model("Car", carSchema);

// Define a schema and model for manufacturers
const manufacturerSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  models: [String],
});

const Manufacturer = mongoose.model("Manufacturer", manufacturerSchema);

// Endpoint to fetch manufacturers
app.get("/api/manufacturers", async (req, res) => {
  try {
    const manufacturers = await Manufacturer.find().sort({ name: 1 });
    res.json(manufacturers);
  } catch (error) {
    res.status(500).send("Error fetching manufacturers");
  }
});

// Endpoint to fetch cars
app.get("/api/cars", async (req, res) => {
  try {
    const cars = await Car.find();
    res.json(cars);
  } catch (error) {
    res.status(500).send("Error fetching cars");
  }
});

// Endpoint to create a car
app.post("/api/cars", async (req, res) => {
  try {
    const { manufacturer, model, year, transmission } = req.body;
    if (!manufacturer || !model || !year) {
      return res
        .status(400)
        .json({ error: "manufacturer, model, and year are required" });
    }

    const manufacturerDoc = await Manufacturer.findOne({ name: manufacturer });
    if (!manufacturerDoc) {
      return res.status(400).json({ error: "invalid manufacturer" });
    }
    if (!manufacturerDoc.models.includes(model)) {
      return res
        .status(400)
        .json({ error: `invalid model for manufacturer ${manufacturer}` });
    }

    const car = new Car({ manufacturer, model, year, transmission });
    const saved = await car.save();
    res.status(201).json(saved);
  } catch (error) {
    res.status(500).send("Error creating car");
  }
});

// Endpoint to update a car
app.put("/api/cars/:id", async (req, res) => {
  try {
    const { manufacturer, model } = req.body;
    if (manufacturer || model) {
      const car = await Car.findById(req.params.id);
      if (!car) return res.status(404).json({ error: "Car not found" });

      const effectiveManufacturer = manufacturer || car.manufacturer;
      const effectiveModel = model || car.model;
      const manufacturerDoc = await Manufacturer.findOne({ name: effectiveManufacturer });
      if (!manufacturerDoc) {
        return res.status(400).json({ error: "invalid manufacturer" });
      }
      if (!manufacturerDoc.models.includes(effectiveModel)) {
        return res
          .status(400)
          .json({ error: `invalid model for manufacturer ${effectiveManufacturer}` });
      }
    }

    const updated = await Car.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!updated) return res.status(404).json({ error: "Car not found" });
    res.json(updated);
  } catch (error) {
    res.status(500).send("Error updating car");
  }
});

// Endpoint to delete a car
app.delete("/api/cars/:id", async (req, res) => {
  try {
    const deleted = await Car.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Car not found" });
    res.json({ message: "Car deleted" });
  } catch (error) {
    res.status(500).send("Error deleting car");
  }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
