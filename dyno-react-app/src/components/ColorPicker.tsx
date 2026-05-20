import React from "react";
import { CarColor, ColorEntry } from "../types";

// Picker for a CarColor. Displays each `colors` entry as a swatch (with hex bg).
// An "Other" button reveals a free-text input for aftermarket / unknown colors —
// chosen Other entries are flagged isCustom: true. Selecting an empty value
// passes onChange(null) to clear.
export default function ColorPicker({
  colors,
  value,
  onChange,
}: {
  colors: ColorEntry[];
  value: CarColor | null;
  onChange: (color: CarColor | null) => void;
}) {
  const [customMode, setCustomMode] = React.useState(!!value?.isCustom);
  const [customDraft, setCustomDraft] = React.useState(value?.isCustom ? value.name : "");

  // Keep local state synced if parent resets the value (e.g. manufacturer changes)
  React.useEffect(() => {
    if (!value) {
      setCustomMode(false);
      setCustomDraft("");
    } else if (value.isCustom) {
      setCustomMode(true);
      setCustomDraft(value.name);
    } else {
      setCustomMode(false);
    }
  }, [value]);

  const selectSwatch = (c: ColorEntry) => {
    setCustomMode(false);
    setCustomDraft("");
    // Toggle off if re-clicking the same one
    if (value && !value.isCustom && value.name === c.name) {
      onChange(null);
    } else {
      onChange({ name: c.name, hex: c.hex, isCustom: false });
    }
  };

  const startOther = () => {
    setCustomMode(true);
    setCustomDraft(value?.isCustom ? value.name : "");
  };

  const commitCustom = (name: string) => {
    setCustomDraft(name);
    const trimmed = name.trim();
    if (trimmed) {
      onChange({ name: trimmed, isCustom: true });
    } else {
      onChange(null);
    }
  };

  const selectedSwatch = value && !value.isCustom ? value.name : null;

  return (
    <div className="color-picker">
      <div className="color-swatches">
        {colors.map((c) => (
          <button
            key={c.name}
            type="button"
            className={`color-swatch${selectedSwatch === c.name ? " color-swatch--selected" : ""}`}
            style={{ background: c.hex }}
            title={c.name}
            onClick={() => selectSwatch(c)}
          />
        ))}
        <button
          type="button"
          className={`color-swatch color-swatch--other${customMode ? " color-swatch--selected" : ""}`}
          title="Other (custom color)"
          onClick={startOther}
        >
          +
        </button>
      </div>
      {customMode && (
        <input
          type="text"
          className="color-custom-input"
          placeholder="Custom color name (e.g. Matte Black Wrap)"
          value={customDraft}
          onChange={(e) => commitCustom(e.target.value)}
        />
      )}
      {value && !customMode && (
        <span className="color-picker-label">
          <span
            className="color-picker-dot"
            style={{ background: value.hex || "#888" }}
          />
          {value.name}
        </span>
      )}
    </div>
  );
}
