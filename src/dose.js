// منطق خطة الدكتور: جرعات Humalog ثابتة، وتعديل Tresiba حسب قراءات الصيام.

// نفس أعمدة ورقة "جدول متابعة السكر في الدم"
export const CONTEXTS = {
  fasting: "قبل الفطور",
  after_breakfast: "بعد الفطور بساعتين",
  after_lunch: "بعد الغداء بساعتين",
  after_dinner: "بعد العشاء بساعتين",
  random: "عشوائية",
};

export const SLOTS = {
  breakfast: { label: "قبل الفطور", insulin: "Humalog", key: "humalog_breakfast" },
  lunch: { label: "قبل الغداء", insulin: "Humalog", key: "humalog_lunch" },
  dinner: { label: "قبل العشاء", insulin: "Humalog", key: "humalog_dinner" },
  bedtime: { label: "قبل النوم", insulin: "Tresiba", key: "tresiba_dose" },
};

export const TITRATION_DAYS = 4;
const RECENT_LOW_HOURS = 2;

export function glucoseLevel(g, context, s) {
  if (!s) return "ok";
  if (g < s.low_threshold) return "low";
  const [lo, hi] = context === "fasting" ? [s.fasting_low, s.fasting_high] : context === "random" ? [s.fasting_low, s.post_high] : [s.post_low, s.post_high];
  if (g > 300) return "veryhigh";
  if (g > hi) return "high";
  if (g < lo) return "below";
  return "ok";
}

// آخر قراءة خلال ساعتين لو كانت هبوط → لا إنسولين
export function recentLow(readings, s) {
  const r = readings[0];
  if (!r || !s) return null;
  const hours = (Date.now() - new Date(r.created_at).getTime()) / 36e5;
  return hours <= RECENT_LOW_HOURS && r.glucose < s.low_threshold ? r : null;
}

// أول قراءة صيام لكل يوم، بعد آخر تغيير في جرعة Tresiba
export function fastingDaysSince(readings, sinceIso) {
  const sinceDay = sinceIso ? dayKey(sinceIso) : null;
  const byDay = new Map();
  for (const r of [...readings].reverse()) {
    if (r.context !== "fasting") continue;
    const d = dayKey(r.created_at);
    if (sinceDay && d <= sinceDay) continue;
    if (!byDay.has(d)) byDay.set(d, r);
  }
  return [...byDay.values()].slice(-TITRATION_DAYS);
}

// قاعدة الدكتور: الأيام الأربعة كلها أو أغلبها (3 من 4)
//   فوق 200 → +4 ، فوق 130 → +2 ، غير كذا → نفس الجرعة
export function tresibaSuggestion(readings, s, lastChange) {
  if (!s) return null;
  const days = fastingDaysSince(readings, lastChange?.created_at);
  const current = Number(s.tresiba_dose);
  if (days.length < TITRATION_DAYS) {
    return { status: "waiting", days, current, remaining: TITRATION_DAYS - days.length };
  }
  const vals = days.map((r) => r.glucose);
  const majority = TITRATION_DAYS - 1;
  if (vals.some((g) => g < s.fasting_low)) {
    return { status: "low", days, current, message: `فيه قراءة صيام أقل من ${s.fasting_low} — لا تزيد الجرعة، وكلّم الدكتور.` };
  }
  const over200 = vals.filter((g) => g > 200).length;
  const over130 = vals.filter((g) => g > s.fasting_high).length;
  if (over200 >= majority) return { status: "increase", days, current, step: 4, next: current + 4, message: `${over200} من ${TITRATION_DAYS} أيام فوق 200` };
  if (over130 >= majority) return { status: "increase", days, current, step: 2, next: current + 2, message: `${over130} من ${TITRATION_DAYS} أيام فوق ${s.fasting_high}` };
  if (over130 === 0) return { status: "keep", days, current, message: "السكر الصايم في الهدف — نفس الجرعة." };
  return { status: "keep", days, current, message: `${over130} من ${TITRATION_DAYS} أيام بس فوق ${s.fasting_high} (مو أغلبها) — نفس الجرعة، وكمّل القياس.` };
}

const tz = "Asia/Riyadh";
export const fmtDate = (d) =>
  new Date(d).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const fmtShortDate = (d) =>
  new Date(d).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { timeZone: tz, weekday: "short", day: "numeric", month: "numeric" });
export const fmtTime = (d) =>
  new Date(d).toLocaleTimeString("ar-SA-u-nu-latn", { timeZone: tz, hour: "numeric", minute: "2-digit" });
export const dayKey = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: tz });
export const riyadhHour = (d = new Date()) =>
  Number(d.toLocaleString("en-US", { timeZone: tz, hour: "numeric", hour12: false })) % 24;

// تصنيف الضغط: الحدود من الإعدادات (الافتراضي 140/90)
export function bpLevel(r, s) {
  if (!s) return "ok";
  if (r.systolic >= 180 || r.diastolic >= 120) return "veryhigh";
  if (r.systolic >= s.bp_sys_high || r.diastolic >= s.bp_dia_high) return "high";
  if (r.systolic < 90 || r.diastolic < 60) return "low";
  return "ok";
}
