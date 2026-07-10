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
