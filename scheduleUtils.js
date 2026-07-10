// Parses "HH:MM" (24h) into minutes since midnight.
function toMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Duration in hours for a shift, correctly handling shifts that cross midnight
// (e.g. 22:00 -> 06:00 is 8 hours, not negative).
export function shiftDurationHours(startTime, endTime) {
  const s = toMinutes(startTime);
  const e = toMinutes(endTime);
  if (s === null || e === null) return 0;
  let diff = e - s;
  if (diff <= 0) diff += 24 * 60; // crossed midnight
  return Math.round((diff / 60) * 100) / 100;
}

// Is "now" (a Date) currently within this shift's window, given the shift's
// calendar date? Handles overnight shifts by checking both "today's window"
// and "spillover from yesterday's shift".
export function isWithinShift(shift, entryDate, now) {
  if (!shift || shift.is_off || !shift.start_time || !shift.end_time) return false;
  const s = toMinutes(shift.start_time);
  const e = toMinutes(shift.end_time);
  const crossesMidnight = e <= s;

  const entry = new Date(entryDate + "T00:00:00");
  const startsAt = new Date(entry);
  startsAt.setHours(Math.floor(s / 60), s % 60, 0, 0);
  const endsAt = new Date(entry);
  if (crossesMidnight) endsAt.setDate(endsAt.getDate() + 1);
  endsAt.setHours(Math.floor(e / 60), e % 60, 0, 0);

  return now >= startsAt && now <= endsAt;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Moves an ISO date string ("2026-07-10") forward or backward by N days.
export function shiftDate(isoDate, deltaDays) {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
export function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Formats a stored "HH:MM" (24h) string for display as 12h AM/PM, e.g. "07:00" -> "7:00 AM".
// Storage stays 24h everywhere — this is display-only.
export function formatTime12(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

// Levenshtein edit distance — how many single-character edits turn a into b.
function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// Compares typed text against a list of known values. Returns:
//  - { exact: "Chemistry" } if it matches one exactly (ignoring case/spacing)
//  - { suggestion: "Chemistry" } if it's a likely typo of one (close but not exact)
//  - null if it looks like a genuinely new value
export function findCloseMatch(typed, knownValues) {
  const clean = String(typed || "").trim().toLowerCase();
  if (!clean) return null;
  for (const known of knownValues) {
    if (String(known).trim().toLowerCase() === clean) return { exact: known };
  }
  let best = null, bestDist = Infinity;
  for (const known of knownValues) {
    const k = String(known).trim().toLowerCase();
    if (Math.abs(k.length - clean.length) > 2) continue; // skip unrelated lengths early
    const dist = editDistance(clean, k);
    if (dist < bestDist) { bestDist = dist; best = known; }
  }
  // Close enough to flag as a likely typo, but not so close it's basically the same word by chance.
  if (best && bestDist > 0 && bestDist <= 2 && clean.length >= 4) return { suggestion: best };
  return null;
}

// Classifies a shift template into "morning" / "evening" / "night" / null (off).
// Kept for places that only need one label (e.g. the small on-screen badge).
export function classifyShift(shift) {
  const periods = periodsForShift(shift);
  return periods[0] || null;
}

// Named windows: Night 00:00–08:00, Morning 08:00–16:00, Evening 16:00–24:00.
const PERIOD_WINDOWS = {
  night: [0, 8 * 60],
  morning: [8 * 60, 16 * 60],
  evening: [16 * 60, 24 * 60],
};
const OVERLAP_THRESHOLD_MIN = 150; // ~2.5h — long shifts crossing a boundary show in every window they meaningfully cover.

function toMinutes12(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Returns every period a shift meaningfully overlaps — so a 4pm–4am shift
// shows under both Evening and Night, a 12pm–8pm shift under both Morning
// and Evening, while a normal 07:00 start still lands only in Morning.
export function periodsForShift(shift) {
  if (!shift || shift.is_off || !shift.start_time || !shift.end_time) return [];
  const s = toMinutes12(shift.start_time);
  let e = toMinutes12(shift.end_time);
  if (e <= s) e += 24 * 60; // crosses midnight

  const periods = [];
  for (const [name, [wStart, wEnd]] of Object.entries(PERIOD_WINDOWS)) {
    let overlap = Math.max(0, Math.min(e, wEnd) - Math.max(s, wStart));
    if (e > 24 * 60) {
      // Also check the "next day" instance of this window, for shifts that run past midnight.
      overlap += Math.max(0, Math.min(e, wEnd + 24 * 60) - Math.max(s, wStart + 24 * 60));
    }
    if (overlap >= OVERLAP_THRESHOLD_MIN) periods.push(name);
  }
  if (shift.night_shift && !periods.includes("night")) periods.push("night");
  return periods;
}
