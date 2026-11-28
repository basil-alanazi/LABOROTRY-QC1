// OB/GYN post-op follow-up schedule for SSI cases: the 1st visit is due
// within 10 days of the surgery, the 2nd within 20 and the 3rd within 30.
// A visit counts as done once its date is filled in (and not in the future).
export const FOLLOW_UP_DUE_DAYS = [10, 20, 30];
export const FOLLOW_UP_LABELS = ["1st Follow Up", "2nd Follow Up", "3rd Follow Up"];
// How far back the overdue alert looks (by date of surgery), so years-old
// cases that were never followed up in the system don't flood it.
export const ALERT_LOOKBACK_DAYS = 60;
const SOON_DAYS = 3;
const DAY = 86400000;

export const todayIso = () => new Date().toISOString().slice(0, 10);
const toTime = (iso) => new Date(iso + "T00:00:00Z").getTime();
export function addDays(iso, days) {
  return new Date(toTime(iso) + days * DAY).toISOString().slice(0, 10);
}
const daysBetween = (a, b) => Math.round((toTime(b) - toTime(a)) / DAY);

const OTHER_FIELDS = ["type", "fever", "pain_tenderness", "redness", "swelling", "purulent_discharge", "wound_dehiscence", "surgical_site_swab_sent", "wound_status"];

// Before this schedule existed, discharging a patient pre-filled the 1st
// visit's date with discharge + 30/90 days as a reminder. That placeholder
// (nothing else filled in) is not a visit.
function isOldPlaceholder(c, f, i) {
  if (i !== 0 || !f.date || !c.date_of_discharge) return false;
  if (OTHER_FIELDS.some((k) => f[k])) return false;
  return f.date === addDays(c.date_of_discharge, c.follow_up_duration || 30);
}

export function visitDone(c, i, today = todayIso()) {
  const f = (c.follow_ups ?? [])[i] || {};
  return !!f.date && f.date <= today && !isOldPlaceholder(c, f, i);
}

/** {key: "done"|"overdue"|"soon"|"upcoming"|"nodate", due, days} for visit i (0-2). */
export function followUpStatus(c, i, today = todayIso()) {
  if (!c.date_of_procedure) return { key: "nodate", due: "", days: 0 };
  const due = addDays(c.date_of_procedure, FOLLOW_UP_DUE_DAYS[i]);
  if (visitDone(c, i, today)) return { key: "done", due, days: 0 };
  const left = daysBetween(today, due);
  if (left < 0) return { key: "overdue", due, days: -left };
  if (left <= SOON_DAYS) return { key: "soon", due, days: left };
  return { key: "upcoming", due, days: left };
}

/** Overdue visits for the admin/IC alert: [{case, index, due, days}] */
export function overdueFollowUps(cases, today = todayIso()) {
  const since = addDays(today, -ALERT_LOOKBACK_DAYS);
  const out = [];
  for (const c of cases) {
    if (c.deleted || !c.date_of_procedure || c.date_of_procedure < since) continue;
    for (let i = 0; i < FOLLOW_UP_DUE_DAYS.length; i++) {
      const s = followUpStatus(c, i, today);
      if (s.key === "overdue") out.push({ case: c, index: i, due: s.due, days: s.days });
    }
  }
  return out.sort((a, b) => b.days - a.days);
}
