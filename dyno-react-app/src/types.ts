export type Human = {
  _id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
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

export type Car = {
  _id: string;
  year: number;
  manufacturer: string;
  model: string;
  nickname?: string;
  transmission?: string;
  color?: string;
  trim?: string;
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
  car: Car;
  type: "spotted" | "drove";
  date: string;
  notes?: string;
  rating?: number | null;
  loggedBy?: Human;
  reactions: Reaction[];
};

export type BadgeInfo = {
  seriesSlug: string;
  seriesName: string;
  level: number;
  name: string;
  emoji: string;
  description: string;
  awardedAt?: string;
};

export type Follow = {
  _id: string;
  follower: Human;
  followee: Human;
  createdAt: string;
};

export type ColorEntry = { name: string; hex: string };

export type YearRange = { from: number | null; to: number | null; features: string[] };
export type TrimEntry = { name: string; years: YearRange[] };

export type Manufacturer = {
  _id: string;
  name: string;
  models: string[];
  // keyed by model name or "*" for the generic fallback
  colors?: Record<string, ColorEntry[]>;
  // keyed by model name; no "*" fallback — trims are always model-specific
  trims?: Record<string, TrimEntry[]>;
};
