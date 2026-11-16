// Config for the remaining Ipoc.zip forms whose shape is "named sections of
// fields/checklist items filled once" rather than the repeating daily-grid
// shape used by careBundleConfigs.js. Rendered by SectionedFormModal.jsx.

export const SECTIONED_FORMS = [
  {
    key: "ssi_bundle",
    label: "SSI Care Bundle",
    code: "RH-IPC-03",
    sections: [
      {
        title: "Pre-operative (ward nurse / OR nurse if emergency)",
        fields: [
          { key: "surgery_name", label: "Surgery name" },
          { key: "surgery_type", label: "Type of Surgery", type: "radio", options: ["Elective", "Emergency"] },
          { key: "hair_removed_clippers", label: "Pre-OP Hair Removed by Clippers", type: "yesno" },
          { key: "preop_blood_sugar", label: "Pre-OP Blood Sugar (target <200 mg/dl)" },
          { key: "preop_temp", label: "Pre-op Temp" },
          { key: "preop_rr", label: "Pre-op RR" },
          { key: "preop_pr", label: "Pre-op PR" },
          { key: "preop_spo2", label: "Pre-op SPO2" },
          { key: "antimicrobial_prophylaxis", label: "Antimicrobial Prophylaxis", type: "radio", options: ["Given", "Not Given", "N/A"] },
          { key: "antibiotic_name", label: "Name of the Antibiotics" },
          { key: "given_department", label: "Given Department" },
          { key: "given_time", label: "Given Time", type: "time" },
          { key: "given_dose", label: "Given dose" },
          { key: "preop_staff_name", label: "Staff Name" },
          { key: "preop_staff_id", label: "Staff ID" },
        ],
      },
      {
        title: "Intra-operative (Anaesthetist)",
        fields: [
          { key: "prophylaxis_before_incision", label: "Antimicrobial Prophylaxis given before incision", type: "yesno" },
          { key: "prophylaxis_if_no", label: "If No: given time & antibiotic name" },
          { key: "intraop_temp", label: "Vitals during procedure — Temp" },
          { key: "intraop_rr", label: "Vitals during procedure — RR" },
          { key: "intraop_pr", label: "Vitals during procedure — PR" },
          { key: "intraop_spo2", label: "Vitals during procedure — SPO2" },
          { key: "postop_immediate_temp", label: "Immediate Post-OP Temp" },
          { key: "postop_immediate_rr", label: "Immediate Post-OP RR" },
          { key: "postop_immediate_pr", label: "Immediate Post-OP PR" },
          { key: "postop_immediate_spo2", label: "Immediate Post-OP SPO2" },
          { key: "postop_immediate_glucose", label: "Immediate Post-OP Blood Sugar" },
          { key: "is_diabetic", label: "Patient is diabetic?", type: "yesno" },
          { key: "glucose_during_procedure", label: "Blood Sugar During Procedure" },
          { key: "glucose_immediate_postop", label: "Blood Sugar Immediate Post-op" },
          { key: "anaesthetist_name", label: "Anaesthetist Emp ID or Full Name" },
        ],
      },
      {
        title: "OR Staff Nurse",
        fields: [
          { key: "skin_preparation", label: "Pre-OP Skin Preparation", type: "radio", options: ["Povidone Iodine", "Chlorhexidine"] },
          { key: "time_of_incision", label: "Time of Incision", type: "time" },
          { key: "time_of_closure", label: "Time of Closure", type: "time" },
          { key: "surgeon_name", label: "Surgeon Name" },
          { key: "scrub_nurse_name", label: "Name Of Scrub" },
        ],
      },
      {
        title: "Post-operative (ward nurse)",
        fields: [
          { key: "postop_temp", label: "Post-op Temp" },
          { key: "postop_rr", label: "Post-op RR" },
          { key: "postop_pr", label: "Post-op PR" },
          { key: "postop_spo2", label: "Post-op SPO2" },
          { key: "postop_glucose_day1", label: "Blood Sugar Day 1" },
          { key: "postop_glucose_day2", label: "Blood Sugar Day 2" },
          { key: "antibiotic_over_24h", label: "Antibiotic continued more than 24 hours", type: "yesno" },
          { key: "antibiotic_days", label: "If yes, how many days" },
          { key: "antibiotic_frequency", label: "Antibiotics Frequency", type: "radio", options: ["Single Dose", "2 Dose in 24 hrs", "3 Dose in 24 hrs", ">3 Dose in 24 hrs"] },
          { key: "postop_staff_name", label: "Staff Name" },
          { key: "postop_staff_id", label: "Staff ID" },
        ],
      },
      {
        title: "IPC Department Review",
        checklist: [
          { key: "antibiotic_1h_before", label: "Antibiotic(s) given within 1 hour before surgical incision" },
          { key: "prophylaxis_policy_consistent", label: "Prophylactic antibiotic(s) consistent with hospital policy" },
          { key: "discontinued_24h", label: "Discontinuation of prophylactic antibiotic(s) within 24 hours after surgery" },
          { key: "hair_removal_appropriate", label: "Appropriate hair removal (was hair at the incisional site clipped)" },
          { key: "glucose_control", label: "Maintenance of pre/postoperative glucose control (<200 mg/dl, first 2 post-op days)" },
          { key: "normothermia", label: "Maintenance of pre/postoperative normothermia (for all patients)" },
          { key: "antiseptic_solution", label: "Use of appropriate antiseptic solution" },
        ],
        checklistOptions: ["yes", "no", "not_documented", "na"],
        fields: [{ key: "overall_compliance", label: "Overall compliance (compliant for all 7 components)", type: "yesno" }],
      },
    ],
  },
  {
    key: "ssi_event",
    label: "SSI Event Classification",
    code: "NHSN/MOH",
    sections: [
      {
        title: "SSI Event Summary",
        checklist: [
          { key: "sip", label: "SIP — Superficial Incisional Primary" },
          { key: "sis", label: "SIS — Superficial Incisional Secondary" },
          { key: "dip", label: "DIP — Deep Incisional Primary" },
          { key: "dis", label: "DIS — Deep Incisional Secondary" },
          { key: "os", label: "O/S — Organ/Space" },
        ],
        checklistOptions: ["met", "not_met"],
        withDate: true,
        fields: [{ key: "os_site_specified", label: "If O/S, specify site-specific criteria met" }],
      },
      {
        title: "Superficial Incisional SSI (SIP, SIS)",
        checklist: [
          { key: "within_30_days", label: "Date of event occurs within 30 days following the operative procedure" },
          { key: "skin_subq_only", label: "Involves only skin and subcutaneous tissue of the incision" },
          { key: "purulent_drainage", label: "a. Purulent drainage from the superficial incision" },
          { key: "organism_identified", label: "b. Organism(s) identified from an aseptically-obtained specimen" },
          { key: "deliberately_opened", label: "c. Deliberately opened + localized pain/swelling/erythema/heat" },
          { key: "physician_diagnosis", label: "d. Diagnosis of superficial incisional SSI by a physician/designee" },
        ],
        checklistOptions: ["met", "not_met"],
        withDate: true,
      },
      {
        title: "Deep Incisional SSI (DIP, DIS)",
        checklist: [
          { key: "within_30_90_days", label: "Date of event occurs within 30/90 days following the operative procedure" },
          { key: "deep_tissue", label: "Involves deep soft tissues of the incision (fascial/muscle layers)" },
          { key: "purulent_drainage_deep", label: "a. Purulent drainage from the deep incision" },
          { key: "opened_with_organism", label: "b. Deliberately opened/dehisced + organism identified + fever/pain" },
          { key: "abscess_evidence", label: "c. Abscess or other evidence of infection (gross/histopathologic/imaging)" },
        ],
        checklistOptions: ["met", "not_met"],
        withDate: true,
      },
      {
        title: "Organ/Space SSI (O/S)",
        checklist: [
          { key: "within_30_90_days", label: "Date of event occurs within 30/90 days following the operative procedure" },
          { key: "deeper_than_fascia", label: "Involves any part of the body deeper than the fascial/muscle layers" },
          { key: "purulent_drainage_drain", label: "a. Purulent drainage from a drain placed into the organ/space" },
          { key: "organism_fluid_tissue", label: "b. Organism(s) identified from fluid or tissue in the organ/space" },
          { key: "abscess_organ_space", label: "c. Abscess or other evidence of infection involving the organ/space" },
          { key: "site_specific_criterion", label: "Meets at least one criterion for a specific organ/space infection site" },
        ],
        checklistOptions: ["met", "not_met"],
        withDate: true,
      },
    ],
  },
  {
    key: "vae_event",
    label: "VAE Event Classification",
    code: "NHSN/MOH",
    sections: [
      {
        title: "VAE Summary",
        checklist: [
          { key: "vac", label: "VAC — Ventilator-Associated Condition" },
          { key: "ivac", label: "IVAC — Infection-related Ventilator-Associated Complication" },
          { key: "pvap", label: "PVAP — Possible Ventilator-Associated Pneumonia" },
        ],
        checklistOptions: ["met", "not_met"],
        withDate: true,
      },
      {
        title: "VAC — Ventilator-Associated Condition",
        checklist: [
          { key: "baseline_stability", label: "Baseline period of stability on the ventilator" },
          { key: "baseline_improvement", label: "Baseline period of improvement on the ventilator" },
          { key: "fio2_increase", label: "Increase in daily minimum FiO2 of ≥0.20, sustained ≥2 calendar days" },
          { key: "peep_increase", label: "Increase in daily minimum PEEP of ≥3 cmH2O, sustained ≥2 calendar days" },
        ],
        checklistOptions: ["met", "not_met"],
        withDate: true,
      },
      {
        title: "IVAC — Infection-related Ventilator-Associated Complication",
        checklist: [
          { key: "meets_vac", label: "Patient must meet VAC to be eligible for IVAC" },
          { key: "temp_high", label: "Temperature >38°C (>100.4°F)" },
          { key: "temp_low", label: "Temperature <36°C (<96.8°F)" },
          { key: "wbc_high", label: "White blood cell count ≥12,000 cells/mm³" },
          { key: "wbc_low", label: "White blood cell count ≤4,000 cells/mm³" },
          { key: "new_antimicrobial", label: "A new antimicrobial agent(s) is started" },
          { key: "antimicrobial_4_days", label: "New antimicrobial agent(s) continued for ≥4 qualifying antimicrobial days" },
        ],
        checklistOptions: ["met", "not_met"],
        withDate: true,
      },
      {
        title: "PVAP — Possible Ventilator-Associated Pneumonia",
        checklist: [
          { key: "meets_vac_ivac", label: "Patient must meet VAC and IVAC to be eligible for PVAP" },
          { key: "criterion1_culture", label: "Criterion 1: Positive culture (ETA/BAL/lung tissue/protected specimen brush)" },
          { key: "criterion2_secretions", label: "Criterion 2: Purulent respiratory secretions + organism identified" },
          { key: "criterion3_positive_test", label: "Criterion 3: Positive pleural fluid/histopathology/Legionella/viral test" },
        ],
        checklistOptions: ["met", "not_met"],
        withDate: true,
      },
    ],
  },
  {
    key: "organism_sensitivity",
    label: "Organism & Sensitivity",
    code: "GDIPC Surveillance",
    sections: [
      {
        title: "Specimen",
        fields: [
          { key: "unit_ward", label: "Unit/Ward" },
          { key: "specimen_collection_datetime", label: "Date/Time of Specimen Collection" },
          { key: "record_datetime", label: "Date/Time of Record" },
          { key: "specimen_type", label: "Type of Specimen", type: "checkgroup", options: ["Sputum", "Throat swab", "Nasopharyngeal swab", "Blood", "Urine", "BAL", "Body tissue", "Tracheal aspirate", "Body fluids", "Others", "Stool"] },
          { key: "organism_name", label: "Name of Organism(s)" },
        ],
      },
      {
        title: "Antimicrobial Sensitivity — Gram Positive Organism",
        sensitivityDrugs: ["Ciprofloxacin", "Levofloxacin", "Moxifloxacin", "Clindamycin", "Daptomycin", "Doxycycline", "Minocycline", "Erythromycin", "Gentamicin", "Linezolid", "Oxacillin", "Cefoxitin", "Methicillin", "Rifampicin", "Tetracycline", "Trimethoprim Sulfamethoxazole", "Vancomycin"],
      },
      {
        title: "Antimicrobial Sensitivity — Gram Negative Organism",
        sensitivityDrugs: ["Amikacin", "Ampicillin", "Ampicillin sulbactam", "Aztreonam", "Amoxiclav", "Cefazolin", "Cefepime", "Cefotaxime", "Cefuroxime", "Ceftriaxone", "Ceftazidime", "Cefoxitin", "Cefotetam", "Ciprofloxacin", "Trimethoprim Sulfamethoxazole", "Colistin", "Polymyxin B", "Ertapenem", "Gentamicin", "Imipenem", "Meropenem", "Doripenem", "Piperacillin/Tazobactam", "Tetracycline", "Doxycycline", "Minocycline", "Tigecycline", "Levofloxacin", "Moxifloxacin", "Tobramycin"],
      },
      {
        title: "Antimicrobial Sensitivity — Fungus Organism",
        sensitivityDrugs: ["Amifulafungin", "Caspofungin", "Fluconazole", "Flucytosine", "Itraconazole", "Micafungin", "Variconazole"],
      },
      {
        title: "Antimicrobial Sensitivity — Mycobacterial Organism",
        sensitivityDrugs: ["Ciprofloxacin", "Isoniazid", "Rifampicin", "Ethambutol", "Pyrazinamide", "Clarithromycin", "Capreomycin", "Cycloserine", "Kanamycin", "Amikacin", "Streptomycin"],
      },
    ],
  },
];

export function getSectionedFormConfig(key) {
  return SECTIONED_FORMS.find((f) => f.key === key);
}
