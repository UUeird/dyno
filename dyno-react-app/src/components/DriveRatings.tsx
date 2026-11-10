import { Experience } from "../types";

type Option = { value: number; icon?: string; label: string; summary: string };

const SMILE: Option[] = [
  { value: 1, icon: "😐", label: "Meh", summary: "Meh" },
  { value: 2, icon: "🙂", label: "Fine", summary: "Fine" },
  { value: 3, icon: "😊", label: "Good", summary: "Good" },
  { value: 4, icon: "😄", label: "Great", summary: "Great" },
  { value: 5, icon: "🤩", label: "Epic", summary: "Epic" },
];
const PAVEMENT: Option[] = [
  { value: 1, label: "Rough", summary: "Rough pavement" },
  { value: 2, label: "Okay", summary: "Okay pavement" },
  { value: 3, label: "Smooth", summary: "Smooth pavement" },
];
const TRAFFIC: Option[] = [
  { value: 1, label: "Heavy", summary: "Heavy traffic" },
  { value: 2, label: "Some", summary: "Some traffic" },
  { value: 3, label: "Open road", summary: "Open road" },
];

export type DriveRatingValues = { smile: number | null; pavement: number | null; traffic: number | null };

export default function DriveRatings({ experience }: { experience: Experience }) {
  const smile = SMILE.find((o) => o.value === experience.smile);
  const parts = [
    PAVEMENT.find((o) => o.value === experience.pavement)?.summary,
    TRAFFIC.find((o) => o.value === experience.traffic)?.summary,
  ].filter(Boolean);
  if (!smile && parts.length === 0) return null;
  return (
    <p className="drive-ratings" data-testid="drive-ratings">
      {smile && <span title={`Smile score: ${smile.label}`}>{smile.icon} {smile.label}</span>}
      {parts.map((p) => <span key={p}>{p}</span>)}
    </p>
  );
}

function ChipRow({ label, options, value, onChange }: {
  label: string;
  options: Option[];
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="drive-rating-row" role="radiogroup" aria-label={label}>
      <span className="drive-rating-label">{label}</span>
      <div className="drive-rating-chips">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={`drive-rating-chip${value === o.value ? " drive-rating-chip--on" : ""}${o.icon ? " drive-rating-chip--emoji" : ""}`}
            title={o.label}
            onClick={() => onChange(value === o.value ? null : o.value)}
          >
            {o.icon ?? o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DriveRatingPicker({ values, onChange }: {
  values: DriveRatingValues;
  onChange: (v: DriveRatingValues) => void;
}) {
  return (
    <div className="drive-rating-picker">
      <ChipRow label="Smiles" options={SMILE} value={values.smile} onChange={(smile) => onChange({ ...values, smile })} />
      <ChipRow label="Pavement" options={PAVEMENT} value={values.pavement} onChange={(pavement) => onChange({ ...values, pavement })} />
      <ChipRow label="Traffic" options={TRAFFIC} value={values.traffic} onChange={(traffic) => onChange({ ...values, traffic })} />
    </div>
  );
}
