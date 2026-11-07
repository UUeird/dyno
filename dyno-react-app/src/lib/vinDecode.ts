import { Manufacturer } from "../types";

export type VinDecodeResult = {
  make: string;
  model: string;
  year: string;
  manufacturerName?: string;
  modelId?: string;
};

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function fuzzyFind<T extends { name: string }>(items: T[], target: string): T | undefined {
  const t = normalize(target);
  if (!t) return undefined;
  return (
    items.find((i) => normalize(i.name) === t) ||
    items.find((i) => {
      const n = normalize(i.name);
      return n.length > 0 && (n.startsWith(t) || t.startsWith(n));
    })
  );
}

// Decodes via NHTSA vPIC (free, no key). Returns null on any failure so the
// caller can fall back to the manual new-car form.
export async function decodeVin(vin: string, manufacturers: Manufacturer[]): Promise<VinDecodeResult | null> {
  try {
    const r = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`
    );
    if (!r.ok) return null;
    const data = await r.json();
    const row = data?.Results?.[0];
    const make = (row?.Make || "").trim();
    const model = (row?.Model || "").trim();
    if (!make) return null;
    const result: VinDecodeResult = { make, model, year: (row?.ModelYear || "").trim() };
    const mfr = fuzzyFind(manufacturers, make);
    if (mfr) {
      result.manufacturerName = mfr.name;
      const mdl = fuzzyFind(mfr.models || [], model);
      if (mdl) result.modelId = mdl._id;
    }
    return result;
  } catch {
    return null;
  }
}
