import React from "react";
import { Link } from "react-router-dom";
import { Experience } from "../types";
import { modelPath } from "../lib/modelSlug";

// Renders the vehicle portion of an experience row. VIN-linked experiences
// (exp.car set) show the real Car's year/manufacturer/model and link to the
// model page. Loose experiences (exp.vehicleModel set, no exp.car) show the
// guessed year/manufacturer/model with no owner info, since there's no Car
// record to attach ownership to.
export default function ExperienceVehicleLabel({
  experience,
  ownerNames,
}: {
  experience: Experience;
  ownerNames?: string;
}) {
  if (experience.car) {
    const car = experience.car;
    return (
      <span className="experience-car">
        {car.year}{" "}
        <Link to={modelPath(car.manufacturer, car.model)} className="model-name-link">
          {car.manufacturer} {car.model}
        </Link>
        {ownerNames && <span className="experience-owner">{" · "}{ownerNames}</span>}
      </span>
    );
  }

  return (
    <span className="experience-car">
      {experience.yearGuess != null && `${experience.yearGuess} `}
      <Link
        to={modelPath(experience.vehicleManufacturer || "", experience.vehicleModel || "")}
        className="model-name-link"
      >
        {experience.vehicleManufacturer} {experience.vehicleModel}
      </Link>
      <span className="experience-loose-badge" title="Vehicle not individually identified">
        {" "}(spotted, unidentified)
      </span>
    </span>
  );
}
