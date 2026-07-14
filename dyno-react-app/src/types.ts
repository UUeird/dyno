export type Human = {
  _id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  username?: string | null;
  // Only set on /api/me responses, never on bulk humans list.
  isAdmin?: boolean;
};

export type Photo = {
  _id: string;
  car: string;
  uploadedBy: { _id: string; name: string };
  url: string;
  caption?: string;
  createdAt: string;
};

export type Ownership = {
  _id: string;
  car: string;
  owner: Human;
  from: string | null;
  to: string | null;
};

export type CarColor = {
  name: string;
  hex?: string;
  isCustom?: boolean;
};

export type Car = {
  _id: string;
  year: number;
  manufacturer: string;
  model: string;
  modelId?: string;
  nickname?: string;
  transmission?: string;
  // Legacy plain string. Use colorInfo for new code; fall back to color if unset.
  color?: string;
  colorInfo?: CarColor | null;
  trim?: string;
  drivetrain?: string;
  vin?: string;
  thumbnailPhoto?: string | null;
  currentOwners: Human[];
  ownershipHistory: Ownership[];
  photos: Photo[];
  thumbnail: Photo | null;
};

export type Reaction = {
  _id: string;
  experience: string;
  human: Human;
  emoji: string;
};

export type Experience = {
  _id: string;
  // Exactly one of `car` / `vehicleModel` is set. `car` is a VIN-identified,
  // strongly-linked vehicle. `vehicleModel` is the loose "spotted it, didn't
  // ID the exact car" case — "drove" experiences always have `car`.
  car?: Car | null;
  vehicleModel?: string;
  vehicleModelId?: string;
  vehicleManufacturer?: string;
  yearGuess?: number | null;
  colorGuess?: string | null;
  type: "spotted" | "drove";
  date: string;
  notes?: string;
  rating?: number | null;
  loggedBy?: Human;
  reactions: Reaction[];
  location?: { display: string; lat: number | null; lng: number | null } | null;
  route?: { lat: number; lng: number }[];
  weather?: { tempC: number | null; conditions: string | null; windKph: number | null; precipitationMm: number | null } | null;
};

export type BadgeInfo = {
  seriesSlug: string;
  seriesName: string;
  level: number;
  maxLevel: number;
  name: string;
  emoji: string;
  description: string;
  awardedAt?: string;
};

export type BadgeLevelDef = {
  level: number;
  name: string;
  emoji: string;
  description: string;
};

export type BadgeProgress = {
  seriesSlug: string;
  seriesName: string;
  unit: string;
  level: number;
  maxLevel: number;
  count: number;
  nextThreshold: number | null;
  prevThreshold: number;
  thresholds: number[];
  levels: BadgeLevelDef[];
  awardedAt: string | null;
};

export type Follow = {
  _id: string;
  follower: Human;
  followee: Human;
  createdAt: string;
};

export type WishlistItem = {
  _id: string;
  human: string;
  manufacturer: string;
  model: string;
  modelId: string;
  yearFrom?: number | null;
  yearTo?: number | null;
  createdAt: string;
  thumbnailUrl?: string | null;
  representativeYear?: number | null;
};

export type ColorEntry = { name: string; hex: string };

export type YearRange = { from: number | null; to: number | null; features: string[] };
export type TrimEntry = { name: string; years: YearRange[] };
export type ModelYearRange = { from: number | null; to: number | null };

export type CarModel = {
  _id: string;
  manufacturer: string;
  name: string;
  colors?: ColorEntry[];
  trims?: TrimEntry[];
  drivetrains?: string[];
  years?: ModelYearRange[];
};

export type Manufacturer = {
  _id: string;
  name: string;
  models: CarModel[];
};
