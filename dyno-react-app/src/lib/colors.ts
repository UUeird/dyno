import { ColorEntry, Manufacturer } from "../types";

// Universal fallback palette used when a manufacturer hasn't seeded canonical colors
// for a model. Hexes are approximate and just give the UI a swatch to render.
export const BASIC_COLORS: ColorEntry[] = [
  { name: "Black", hex: "#0a0a0a" },
  { name: "White", hex: "#ffffff" },
  { name: "Silver", hex: "#c0c0c0" },
  { name: "Gray", hex: "#7d7d7d" },
  { name: "Red", hex: "#c92a2a" },
  { name: "Blue", hex: "#1971c2" },
  { name: "Green", hex: "#2f9e44" },
  { name: "Yellow", hex: "#f0c400" },
  { name: "Orange", hex: "#e8590c" },
  { name: "Brown", hex: "#704214" },
  { name: "Beige", hex: "#d4c5a0" },
  { name: "Purple", hex: "#5f3dc4" },
];

// Returns the color picker options for a (manufacturer, model). Prefers the
// canonical list from the manufacturer registry; falls back to BASIC_COLORS when
// no canonical list exists for this model (or for the manufacturer at all).
export function getColorOptions(
  manufacturers: Manufacturer[],
  manufacturer: string,
  model: string,
): { options: ColorEntry[]; isCanonical: boolean } {
  const mfr = manufacturers.find((m) => m.name === manufacturer);
  if (mfr?.colors) {
    const list = mfr.colors[model] ?? mfr.colors["*"];
    if (list && list.length > 0) {
      return { options: list, isCanonical: true };
    }
  }
  return { options: BASIC_COLORS, isCanonical: false };
}
