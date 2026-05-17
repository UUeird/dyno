import React from "react";
import { ColorEntry } from "../types";

export default function ColorPicker({
  colors,
  value,
  onChange,
}: {
  colors: ColorEntry[];
  value: string;
  onChange: (name: string) => void;
}) {
  return (
    <div className="color-picker">
      <div className="color-swatches">
        {colors.map((c) => (
          <button
            key={c.name}
            type="button"
            className={`color-swatch${value === c.name ? " color-swatch--selected" : ""}`}
            style={{ background: c.hex }}
            title={c.name}
            onClick={() => onChange(value === c.name ? "" : c.name)}
          />
        ))}
      </div>
      {value && (
        <span className="color-picker-label">
          <span
            className="color-picker-dot"
            style={{ background: colors.find((c) => c.name === value)?.hex ?? "#888" }}
          />
          {value}
        </span>
      )}
    </div>
  );
}
