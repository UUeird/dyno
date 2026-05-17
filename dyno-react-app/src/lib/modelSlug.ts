// Convert a manufacturer or model name to a URL slug.
// "Honda" -> "honda", "Mercedes-Benz" -> "mercedes-benz", "Aston Martin" -> "aston-martin".
// Backend matches the slug back to canonical names case-insensitively.
export function modelSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

// Build a model page URL from a car's manufacturer + model.
export function modelPath(manufacturer: string, model: string): string {
  return `/cars/${modelSlug(manufacturer)}/${modelSlug(model)}`;
}
