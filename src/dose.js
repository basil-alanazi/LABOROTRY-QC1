// حساب الجرعة المقترحة من جدول Sliding scale اللي حدده الدكتور.
// الموقع ما يخترع جرعة: لو ما فيه جدول، أو القراءة خارج الجدول، ما يقترح شي.

export const CONTEXTS = {
  fasting: "صايم (الصبح)",
  before_meal: "قبل الأكل",
  after_meal: "بعد الأكل بساعتين",
  bedtime: "قبل النوم",
  random: "قراءة عشوائية",
};

const RECENT_DOSE_HOURS = 3;

export function calculateDose(glucose, settings, readings = []) {
  const g = Number(glucose);
  if (!g || !settings) return null;

  const alerts = [];
  if (g < settings.low_threshold) {
    return {
      units: 0,
      level: "danger",
      alerts: [
        `السكر منخفض (${g}) — لا تاخذ إنسولين.`,
        "خذ 15 جرام سكر سريع (نص كوب عصير أو 3 حبات تمر)، وأعد القياس بعد 15 دقيقة.",
      ],
    };
  }
  if (g >= settings.high_alert) {
    alerts.push(`السكر مرتفع جدًا (${g}) — تواصل مع الدكتور.`);
  }

  const lastDose = readings.find((r) => Number(r.insulin_units) > 0);
  if (lastDose) {
    const hours = (Date.now() - new Date(lastDose.created_at).getTime()) / 36e5;
    if (hours < RECENT_DOSE_HOURS) {
      alerts.push(
        `آخر جرعة (${lastDose.insulin_units} وحدة) كانت قبل ${formatHours(hours)} — انتبه من تكرار الجرعة.`
      );
    }
  }

  const scale = settings.sliding_scale || [];
  if (scale.length === 0) {
    return { units: null, level: alerts.length ? "danger" : "info", alerts: [...alerts, "ما فيه خطة دكتور محفوظة — أضفها من الإعدادات عشان تطلع الجرعة."] };
  }

  const row = scale.find((r) => g >= Number(r.from) && g <= Number(r.to));
  if (!row) {
    const inTarget = g < Math.min(...scale.map((r) => Number(r.from)));
    return {
      units: inTarget ? 0 : null,
      level: alerts.length ? "danger" : inTarget ? "ok" : "warn",
      alerts: inTarget ? alerts : [...alerts, "القراءة خارج جدول الدكتور — تواصل مع الدكتور."],
    };
  }

  let units = Number(row.units);
  if (units > Number(settings.max_dose)) {
    alerts.push(`الجرعة في الجدول أعلى من الحد الأقصى (${settings.max_dose}) — تم إيقافها عند الحد. راجع الدكتور.`);
    units = Number(settings.max_dose);
  }

  return { units, level: alerts.length ? "danger" : "ok", alerts };
}

export function glucoseLevel(g, s) {
  if (!s) return "ok";
  if (g < s.low_threshold) return "low";
  if (g >= s.high_alert) return "veryhigh";
  if (g > s.target_high) return "high";
  return "ok";
}

function formatHours(h) {
  const mins = Math.round(h * 60);
  if (mins < 60) return `${mins} دقيقة`;
  return `${Math.floor(mins / 60)} ساعة و ${mins % 60} دقيقة`;
}

const tz = "Asia/Riyadh";
export const fmtDate = (d) =>
  new Date(d).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const fmtTime = (d) =>
  new Date(d).toLocaleTimeString("ar-SA-u-nu-latn", { timeZone: tz, hour: "numeric", minute: "2-digit" });
export const dayKey = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: tz });
