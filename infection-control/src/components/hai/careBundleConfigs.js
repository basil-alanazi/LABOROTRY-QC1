// Config for each Rabia Hospital IPC care bundle form, digitized from the
// hospital's own paper forms (RH-IPC-02/04/05 and the ICU/NICU ventilator
// bundle sheets). Each type has one-time header fields, an optional
// insertion checklist (filled once, at device insertion), and a recurring
// daily (optionally per-shift) maintenance checklist grid.

export const BUNDLE_TYPES = [
  {
    key: "clabsi",
    label: "CLABSI Care Bundle",
    code: "RH-IPC-02",
    headerFields: [
      { key: "central_line_type", label: "Central line type" },
      { key: "inserted_department", label: "Inserted Department" },
      { key: "inserted_date", label: "Inserted Date", type: "date" },
      { key: "neonate_weight", label: "Neonate birth weight (g)", type: "select", options: ["", "<750", "751-1000", "1001-1500", "1501-2500", ">2500"] },
      { key: "insertion_site", label: "Insertion site", type: "select", options: ["", "R Jugular", "R Subclavian", "R Femoral", "Umbilical", "L Jugular", "L Subclavian", "L Femoral", "Other"] },
    ],
    insertionChecklist: [
      { key: "hand_hygiene", label: "Hand hygiene" },
      { key: "barrier_cap", label: "Maximal barrier precautions — Cap (provider)" },
      { key: "barrier_mask", label: "Maximal barrier precautions — Mask (provider)" },
      { key: "barrier_gloves", label: "Maximal barrier precautions — Sterile gloves (provider)" },
      { key: "barrier_gown", label: "Maximal barrier precautions — Sterile gown (provider)" },
      { key: "barrier_drape", label: "Maximal barrier precautions — Large sterile drape (patient)" },
      { key: "chlorhexidine", label: "Chlorhexidine skin antisepsis" },
      { key: "site_selection", label: "Optimal catheter site selection" },
    ],
    dailyItems: [
      { key: "daily_assessment", label: "Daily assessment of catheter necessity with prompt removal" },
      { key: "dressing_choice", label: "Proper dressing choice" },
      { key: "dressing_frequency", label: "Proper frequency of dressing change" },
      { key: "admin_sets", label: "Proper replacement of administrative sets" },
      { key: "hand_hygiene_daily", label: "Hand Hygiene" },
    ],
    shifts: null,
  },
  {
    key: "cauti",
    label: "CAUTI Care Bundle",
    code: "RH-IPC-05",
    headerFields: [
      { key: "admission_date", label: "Admission Date", type: "date" },
      { key: "place_of_insertion", label: "Place of Insertion" },
      { key: "reason_of_insertion", label: "Reason of Insertion" },
      { key: "catheter_type", label: "Type of Catheter" },
      { key: "inserted_by", label: "Inserted By" },
      { key: "insertion_date", label: "Insertion Date", type: "date" },
      { key: "removed_by", label: "Removed By" },
      { key: "removal_date", label: "Removal Date", type: "date" },
    ],
    insertionChecklist: [
      { key: "avoid_unnecessary", label: "Avoid unnecessary urinary catheters" },
      { key: "hand_hygiene", label: "Hand hygiene before insertion of UC" },
      { key: "sterile_equipment", label: "Use sterile equipment (gloves, drape, sponges, antiseptic solution, sterile lubricant)" },
      { key: "small_catheter", label: "Use of small catheter as possible" },
    ],
    dailyItems: [
      { key: "hand_hygiene", label: "Hand Hygiene" },
      { key: "maintain_guidelines", label: "Maintain catheters based on recommended guidelines (sterile closed system, secured, bag below bladder, unobstructed flow, emptied regularly, aseptic sampling)" },
      { key: "review_necessity", label: "Review urinary catheter necessity daily and remove promptly" },
    ],
    dailyTextFields: [
      { key: "nurse_name", label: "Nurse Name" },
      { key: "nurse_signature", label: "Nurse Signature" },
    ],
    shifts: ["M", "E", "N"],
  },
  {
    key: "mdro",
    label: "MDRO Care Bundle",
    code: "RH-IPC-04",
    headerFields: [
      { key: "admission_date", label: "Date of Admission", type: "date" },
      { key: "mdro_isolated", label: "Type of MDRO isolated" },
      { key: "specimen_type", label: "Type of specimen" },
      { key: "ward_unit", label: "Ward/Unit" },
      { key: "prior_antibiotics", label: "Previous antibiotic treatment in last 90 days", type: "yesno" },
      { key: "prior_admission", label: "Previous hospital admission in last 90 days", type: "yesno" },
      { key: "prior_icu", label: "Previous ICU admission in last 90 days", type: "yesno" },
      { key: "comorbidities", label: "Comorbidities (specify, or leave blank for none)" },
    ],
    insertionChecklist: null,
    dailyItems: [
      { key: "hand_hygiene", label: "Strict adherence to hand hygiene" },
      { key: "contact_precaution", label: "Contact precaution" },
      { key: "dedicated_equipment", label: "Dedicate medical equipment for patient and disinfect thoroughly after each use" },
      { key: "environmental_cleaning", label: "Daily environmental cleaning and disinfection" },
      { key: "antibiotic_optimization", label: "Optimizing antibiotic use/restriction" },
      { key: "patient_education", label: "Patient/sitter education" },
    ],
    dailyOptions: ["yes", "no"],
    shifts: null,
  },
  {
    key: "vae_icu",
    label: "ICU VAE Care Bundle",
    code: "RH-IPC-02(ICU)",
    headerFields: [
      { key: "inserted_department", label: "Inserted in Department" },
      { key: "insertion_date", label: "Insertion Date", type: "date" },
      { key: "insertion_done_by", label: "Insertion done by" },
      { key: "removal_date", label: "Removal Date", type: "date" },
      { key: "removal_reason", label: "Removal Reason" },
    ],
    insertionChecklist: null,
    dailyItems: [
      { key: "head_of_bed", label: "Elevation of the head of the bed to between 30 and 45 degrees" },
      { key: "sedative_interruption", label: 'Daily "sedative interruption" & daily assessment of readiness to extubate' },
      { key: "pud_prophylaxis", label: "Peptic ulcer disease (PUD) prophylaxis" },
      { key: "dvt_prophylaxis", label: "Deep venous thrombosis (DVT) prophylaxis (unless contraindicated)" },
      { key: "oral_care", label: "Daily oral care with appropriate antiseptic solution" },
    ],
    shifts: null,
  },
  {
    key: "vae_nicu",
    label: "NICU & PICU Ventilator Bundle",
    code: "RH-IPC-02(NICU/PICU)",
    headerFields: [
      { key: "unit", label: "Unit" },
      { key: "bed_no", label: "Bed No." },
      { key: "admission_date", label: "Admission date", type: "date" },
      { key: "admission_diagnosis", label: "Admission diagnosis" },
      { key: "insertion_date", label: "Ventilator insertion date", type: "date" },
      { key: "place_of_insertion", label: "Place of insertion" },
      { key: "neonate_weight", label: "Neonate birth weight (g)", type: "select", options: ["", "<750", "751-1000", "1001-1500", "1501-2500", ">2500"] },
    ],
    insertionChecklist: null,
    dailyItems: [
      { key: "hand_hygiene", label: "Hand Hygiene" },
      { key: "semi_recumbent", label: "Semi-recumbent position" },
      { key: "mouth_rinse", label: "Mouth rinse with an appropriate solution" },
      { key: "circuit_care", label: "Appropriate ventilator circuit care" },
      { key: "extubate_readiness", label: "Daily assessment of readiness to extubate" },
    ],
    shifts: null,
  },
];

export function getBundleConfig(key) {
  return BUNDLE_TYPES.find((b) => b.key === key);
}
