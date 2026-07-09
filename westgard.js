// Westgard multirule QC evaluation.
// Baseline (mean/SD) must already exist before calling evaluate().
// history: chronological array of past accepted z-scores for the SAME level+lot (oldest -> newest), NOT including the current point.
// otherLevelZs: z-scores of other levels entered today for the same run (for R-4s).

export function zScore(value, mean, sd) {
  if (!sd) return 0;
  return (value - mean) / sd;
}

export function evaluateWestgard(currentZ, history, otherLevelZs) {
  const flags = [];

  // 1_3s — single point beyond 3 SD
  if (Math.abs(currentZ) >= 3) flags.push("1-3s");

  // 2_2s — this point and the previous point both beyond 2 SD on the same side
  const prev = history[history.length - 1];
  if (prev !== undefined && Math.abs(currentZ) >= 2 && Math.sign(currentZ) === Math.sign(prev) && Math.abs(prev) >= 2) {
    flags.push("2-2s");
  }

  // R_4s — range between this point and another level in the same run spans >= 4 SD
  if (otherLevelZs && otherLevelZs.length > 0) {
    const allZ = [currentZ, ...otherLevelZs];
    const range = Math.max(...allZ) - Math.min(...allZ);
    if (range >= 4) flags.push("R-4s");
  }

  // 4_1s — this point + previous 3 points all beyond 1 SD on the same side
  const last3 = history.slice(-3);
  if (last3.length === 3 && Math.abs(currentZ) >= 1) {
    const sameSide = [currentZ, ...last3].every((z) => Math.sign(z) === Math.sign(currentZ) && Math.abs(z) >= 1);
    if (sameSide) flags.push("4-1s");
  }

  // 10x — this point + previous 9 points all on the same side of the mean (any magnitude)
  const last9 = history.slice(-9);
  if (last9.length === 9) {
    const sameSide = [currentZ, ...last9].every((z) => Math.sign(z) === Math.sign(currentZ) && z !== 0);
    if (sameSide) flags.push("10x");
  }

  let color = "green";
  if (flags.length > 0) color = "red";
  else if (Math.abs(currentZ) >= 2) {
    flags.push("1-2s (warning)");
    color = "orange";
  }

  return { flags, color };
}

export const RULE_DESCRIPTIONS = {
  "1-3s": "One point beyond ±3 SD",
  "2-2s": "Two consecutive points beyond ±2 SD, same side",
  "R-4s": "Range between levels in the same run spans ≥4 SD",
  "4-1s": "Four consecutive points beyond ±1 SD, same side",
  "10x": "Ten consecutive points on the same side of the mean",
  "1-2s (warning)": "One point beyond ±2 SD (warning only)",
};
