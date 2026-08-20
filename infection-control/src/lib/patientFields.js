// The optional per-patient fields a checklist can show on the entry form.
// A checklist's `fields` column holds a subset of these keys.
export const PATIENT_FIELDS = [
  { key: "patient_name", label: "Patient Name" },
  { key: "mrn", label: "MRN" },
  { key: "age", label: "Age" },
  { key: "diagnosis", label: "Diagnosis" },
];

export const DEFAULT_PATIENT_FIELDS = PATIENT_FIELDS.map((f) => f.key);
