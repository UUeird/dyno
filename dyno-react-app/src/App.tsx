import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";

function App() {
  const [cars, setCars] = useState([]);

  useEffect(() => {
    // Fetch car data from the API
    axios
      .get("http://localhost:5000/api/cars")
      .then((response) => {
        setCars(response.data);
      })
      .catch((error) => {
        console.error("Error fetching cars:", error);
      });
  }, []);

  return (
    <div className="App">
      <h1>Dyno</h1>

      <div className="section-container">
        {/* Section 1: Experiences */}
        <div className="section">
          <h2>Experiences</h2>
          <p>Track the cars you've seen, driven, or owned.</p>
        </div>

        {/* Section 2: Cars */}
        <div className="section">
          <h2>Cars</h2>
          {cars.length > 0 ? (
            <ul>
              {cars.map((car) => (
                <li key={car._id}>
                  {car.year} {car.make} {car.model}
                </li>
              ))}
            </ul>
          ) : (
            <p>No cars available.</p>
          )}
        </div>

        {/* Section 3: Friends */}
        <div className="section">
          <h2>Friends</h2>
          <p>Share your passion with others.</p>
        </div>
      </div>
    </div>
  );
}

export default App;
