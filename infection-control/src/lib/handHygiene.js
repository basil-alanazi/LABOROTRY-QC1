// Hand Hygiene daily monitoring — WHO 5 moments + glove use, matching the
// hospital's "Daily HH Checklist" Excel sheet column-for-column.

export const HH_MOMENTS = [
  { key: "before_touching_patient", label: "Before touching a patient" },
  { key: "before_clean_procedure", label: "Before clean/aseptic procedure" },
  { key: "after_body_fluid_risk", label: "After body fluid exposure risk" },
  { key: "after_touching_patient", label: "After touching a patient" },
  { key: "after_touching_surroundings", label: "After touching patient surroundings" },
  { key: "wearing_glove", label: "Wearing glove" },
];

// Fallback used when app_config.hh_observer_roles isn't set yet. The real
// list (and which roles apply to which department) is configurable from
// Settings — see hh_observer_roles / hh_department_observers.
export const DEFAULT_OBSERVER_ROLES = ["Doctor", "Nurse", "Housekeeping", "Lab Staff", "Radiology"];

export const HH_ATTACHMENTS_BUCKET = "hh-attachments";

// The visit is expected to take 10-20 minutes; used to flag outliers in Records.
export const EXPECTED_VISIT_MIN_MINUTES = 10;
export const EXPECTED_VISIT_MAX_MINUTES = 20;

// Duration in minutes between two "HH:MM" (or "HH:MM:SS") time strings, or
// null if either is missing/invalid. Assumes the visit doesn't cross midnight.
export function visitDurationMinutes(timeFrom, timeTo) {
  if (!timeFrom || !timeTo) return null;
  const toMinutes = (t) => {
    const [h, m] = t.split(":").map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };
  const from = toMinutes(timeFrom);
  const to = toMinutes(timeTo);
  if (from == null || to == null || to < from) return null;
  return to - from;
}

// Each moment (and "missed") is 1 = compliant/performed, 0 = missed/not
// performed, or null/undefined = not applicable to this observation.
// Total Opportunities = filled moments + (1 if "missed" is filled).
// Compliant = sum of the moments marked 1 ("missed" never counts as compliant).
export function computeHHCompliance(fields, missed) {
  const filled = HH_MOMENTS.filter((m) => fields[m.key] === 0 || fields[m.key] === 1);
  const totalOpportunities = filled.length + (missed === 0 || missed === 1 ? 1 : 0);
  const compliant = filled.reduce((sum, m) => sum + (fields[m.key] === 1 ? 1 : 0), 0);
  const compliancePct = totalOpportunities > 0 ? Math.round((compliant / totalOpportunities) * 1000) / 10 : null;
  return { totalOpportunities, compliant, compliancePct };
}
