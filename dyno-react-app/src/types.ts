export type Human = {
  _id: string;
  name: string;
  email?: string;
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
  thumbnailPhoto?: string | null;
  currentOwners: Human[];
  ownershipHistory: Ownership[];
  photos: Photo[];
  thumbnail: Photo | null;
};

export type Experience = {
  _id: string;
  car: Car;
  type: "spotted" | "drove";
  date: string;
  notes?: string;
};

export type Manufacturer = {
  _id: string;
  name: string;
  models: string[];
};
