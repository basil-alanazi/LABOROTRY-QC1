import { dateLocale } from "./i18n";
// منطق خطة الدكتور: جرعات Humalog ثابتة، وتعديل Tresiba حسب قراءات الصيام.

// نفس أعمدة ورقة "جدول متابعة السكر في الدم"
export const CONTEXTS = {
  fasting: "قبل الفطور",
  after_breakfast: "بعد الفطور بساعتين",
  before_lunch: "قبل الغداء",
  after_lunch: "بعد الغداء بساعتين",
  before_dinner: "قبل العشاء",
  after_dinner: "بعد العشاء بساعتين",
  bedtime: "قبل النوم",
  random: "عشوائية",
};
const PRE_MEAL = ["fasting", "before_lunch", "before_dinner"];

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
  const [lo, hi] = PRE_MEAL.includes(context) ? [s.fasting_low, s.fasting_high]
    : context === "random" ? [s.fasting_low, s.post_high]
    : [s.post_low, s.post_high];
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
  new Date(d).toLocaleDateString(dateLocale(), { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const fmtShortDate = (d) =>
  new Date(d).toLocaleDateString(dateLocale(), { timeZone: tz, weekday: "short", day: "numeric", month: "numeric" });
export const fmtTime = (d) =>
  new Date(d).toLocaleTimeString(dateLocale(), { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true });
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

// أيام الأسبوع (0 = الأحد)، واليوم بتوقيت الرياض
export const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
export const todayWeekday = () => new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" })).getDay();
export const medDueToday = (m) => !m.weekdays || m.weekdays.includes(todayWeekday());

// الجرد: كم باقي ويكفي كم يوم
export function medSupply(m) {
  if (m.stock === null || m.stock === undefined) return null;
  const perDay = (Number(m.per_dose || 1) * (m.times?.length || 0) * (m.weekdays?.length || 7)) / 7;
  const days = perDay ? Math.floor(m.stock / perDay) : null;
  const state = m.stock <= 0 ? "out" : days !== null && days <= (m.alert_days ?? 7) ? "low" : "ok";
  return { stock: m.stock, unit: m.unit || "حبة", days, state };
}

// الحرارة: 37.8 وفوق حرارة، 39 وفوق عالية جدًا
export function tempLevel(t) {
  if (t == null) return "ok";
  if (t >= 39 || t < 35) return "veryhigh";
  if (t >= 37.8) return "high";
  if (t < 36) return "below";
  return "ok";
}

export function spo2Level(v) {
  if (v == null) return "ok";
  if (v < 90) return "veryhigh";
  if (v < 94) return "high";
  return "ok";
}

// المواعيد تنحفظ بتوقيت الرياض بدون منطقة زمنية (مثل 2026-11-02T09:30)
export const apptDate = (at) => new Date(`${at}:00+03:00`);

export function relativeDays(date) {
  const days = Math.round((new Date(dayKey(date)) - new Date(dayKey(new Date()))) / 864e5);
  if (days === 0) return "اليوم";
  if (days === 1) return "بكرة";
  if (days === -1) return "أمس";
  if (days > 1) return days <= 10 ? `بعد ${days} أيام` : `بعد ${days} يوم`;
  return `قبل ${-days} ${-days <= 10 ? "أيام" : "يوم"}`;
}

export const fmtSlot = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "ص" : "م"}`;
};

// قيمة datetime-local (بتوقيت الرياض) ← ISO
export const riyadhLocalToIso = (v) => (v ? new Date(`${v}:00+03:00`).toISOString() : null);
export const nowRiyadhLocal = () =>
  new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 16);

// كم ساعة بين آخر وجبة ووقت القياس
export function sinceMeal(reading) {
  if (!reading.last_meal_at) return null;
  const at = new Date(reading.created_at);
  const [h, m] = reading.last_meal_at.split(":").map(Number);
  const meal = new Date(`${dayKey(at)}T${reading.last_meal_at}:00+03:00`);
  if (meal > at) meal.setDate(meal.getDate() - 1);
  const mins = Math.round((at - meal) / 6e4);
  const label = `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "ص" : "م"}`;
  const ago = mins < 60 ? `${mins} دقيقة` : `${Math.floor(mins / 60)} ساعة${mins % 60 ? ` و${mins % 60} د` : ""}`;
  return `آخر وجبة ${label} (قبل ${ago})`;
}
