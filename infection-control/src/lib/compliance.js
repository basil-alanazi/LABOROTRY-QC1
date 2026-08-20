// Given [{ item, status }] where status is "MET" | "NOT MET" | "NA",
// compute the same MET / Applicable / NOT MET / Compliance% columns as the
// paper/Excel ward round form.
export function computeCompliance(items) {
  const met = items.filter((i) => i.status === "MET").length;
  const notMet = items.filter((i) => i.status === "NOT MET").length;
  const applicable = met + notMet;
  const compliancePct = applicable > 0 ? Math.round((met / applicable) * 1000) / 10 : null;
  return { met, notMet, applicable, compliancePct };
}
