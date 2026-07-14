import { ColorEntry, CarModel } from "../types";

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

// Returns the color picker options for a model. Prefers the model's own
// canonical color list; falls back to BASIC_COLORS when it has none.
export function getColorOptions(
  model: CarModel | null | undefined,
): { options: ColorEntry[]; isCanonical: boolean } {
  if (model?.colors && model.colors.length > 0) {
    return { options: model.colors, isCanonical: true };
  }
  return { options: BASIC_COLORS, isCanonical: false };
}
