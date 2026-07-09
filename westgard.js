// Single-point QC evaluation against the normal range (mean ± 2 SD).
// Color is based ONLY on the current value's distance from the mean —
// not on patterns across previous results.

export function zScore(value, mean, sd) {
  if (!sd) return 0;
  return (value - mean) / sd;
}

export function evaluateWestgard(currentZ) {
  const abs = Math.abs(currentZ);
  let color = "green";
  let flags = [];

  if (abs >= 2) {
    color = "red";
    flags = ["outside-range"];
  } else if (abs >= 1.5) {
    color = "orange";
    flags = ["near-edge"];
  }

  return { flags, color };
}

export const RULE_DESCRIPTIONS = {
  "outside-range": "Outside the normal range (beyond ±2 SD)",
  "near-edge": "Close to the edge of the normal range (beyond ±1.5 SD)",
};
