// الإشعارات: فورية لما أحد يسجل شي، وتذكيرات بالمواعيد (يشغلها المنبّه كل كم دقيقة).
import { sendPush } from "./push.js";

const CONTEXTS = {
  fasting: "قبل الفطور", after_breakfast: "بعد الفطور بساعتين", before_lunch: "قبل الغداء",
  after_lunch: "بعد الغداء بساعتين", before_dinner: "قبل العشاء", after_dinner: "بعد العشاء بساعتين",
  bedtime: "قبل النوم", random: "عشوائية",
};
const SLOTS = {
  breakfast: { label: "قبل الفطور", insulin: "Humalog", key: "humalog_breakfast" },
  lunch: { label: "قبل الغداء", insulin: "Humalog", key: "humalog_lunch" },
  dinner: { label: "قبل العشاء", insulin: "Humalog", key: "humalog_dinner" },
  bedtime: { label: "قبل النوم", insulin: "Tresiba", key: "tresiba_dose" },
};
const MEALS = { breakfast: "الفطور", lunch: "الغداء", dinner: "العشاء", snack: "سناك" };
const REMINDER_WINDOW_MIN = 60; // إذا تأخر المنبّه، يرسل التذكير خلال ساعة من وقته
const LATE_DOSE_MIN = 45; // إذا الجرعة ما انسجلت بعد كذا دقيقة من التذكير، يرسل تنبيه ثاني

const riyadh = (d = new Date()) => new Date(d.getTime() + 3 * 36e5);
const dayKey = (d = new Date()) => riyadh(d).toISOString().slice(0, 10);
const hhmm = (d = new Date()) => riyadh(d).toISOString().slice(11, 16);
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fmt12 = (t) => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "ص" : "م"}`; };
// "اليوم" للجرعات يبدأ 4 الفجر (جرعة Tresiba بعد 12 الليل تحسب لليلة نفسها)
const doseDay = (d) => dayKey(new Date(new Date(d).getTime() - 4 * 36e5));

export async function loadVapid(db) {
  const rows = (await db.prepare("SELECT k, v FROM secrets WHERE k IN ('vapid_public', 'vapid_private')").all()).results;
  const s = Object.fromEntries(rows.map((r) => [r.k, r.v]));
  if (!s.vapid_public || !s.vapid_private) return null;
  return { publicKey: s.vapid_public, privateJwk: JSON.parse(s.vapid_private), subject: "mailto:wad-health@users.noreply.github.com" };
}

// يرسل لأجهزة العائلة. alert = تنبيه مهم (يوصل حتى لوضع "المهم بس")
export async function broadcast(db, familyId, message, { alert = false, exclude = null } = {}) {
  const vapid = await loadVapid(db);
  if (!vapid) return 0;
  const subs = (await db.prepare("SELECT * FROM push_subs WHERE family_id = ?").bind(familyId).all()).results
    .filter((s) => String(s.id) !== String(exclude) && (alert || s.mode === "all"));
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      const status = await sendPush(s, message, vapid, { urgent: alert });
      if (status === 404 || status === 410) await db.prepare("DELETE FROM push_subs WHERE id = ?").bind(s.id).run();
      else if (status < 300) sent++;
    } catch { /* جهاز واحد فشل ما يوقف الباقي */ }
  }));
  return sent;
}

const atLabel = (iso) => {
  const late = Date.now() - new Date(iso).getTime() > 10 * 6e4;
  return late ? ` (الساعة ${fmt12(hhmm(new Date(iso)))})` : "";
};

// رسالة الإشعار الفوري لكل نوع تسجيل
export function eventMessage(kind, row, patient) {
  const ev = baseMessage(kind, row, patient);
  if (ev) ev.msg.body = `${patient.name} · ${ev.msg.body}`;
  return ev;
}

function baseMessage(kind, row, patient) {
  const s = patient;
  if (kind === "readings") {
    const g = row.glucose;
    const ctx = CONTEXTS[row.context] || "";
    if (g < s.low_threshold) return { alert: true, msg: { title: `⚠️ هبوط سكر ${g}`, body: `${ctx}${atLabel(row.created_at)}. لا إنسولين، وعالج الهبوط: نص كوب عصير أو 3 تمرات، وأعد القياس بعد 15 دقيقة.`, tag: `low-${row.id}`, url: "/#sugar", alert: true } };
    if (g >= 300) return { alert: true, msg: { title: `⚠️ سكر مرتفع جدًا ${g}`, body: `${ctx}${atLabel(row.created_at)}. إذا تكرر أو معه أعراض كلّموا الدكتور.`, tag: `high-${row.id}`, url: "/#sugar", alert: true } };
    return { alert: false, msg: { title: `🩸 سكر ${g}`, body: `${ctx}${atLabel(row.created_at)}`, tag: `r-${row.id}`, url: "/#record" } };
  }
  if (kind === "doses") {
    const slot = SLOTS[row.slot];
    const diff = row.planned_units != null && Number(row.planned_units) !== Number(row.units) ? ` (الخطة ${row.planned_units})` : "";
    return { alert: false, msg: { title: `💉 ${row.insulin} ${row.units} وحدة`, body: `${slot?.label || ""}${diff}${atLabel(row.created_at)}`, tag: `d-${row.id}`, url: "/#record" } };
  }
  if (kind === "bp") {
    const parts = [];
    if (row.systolic) parts.push(`ضغط ${row.systolic}/${row.diastolic}`);
    if (row.pulse) parts.push(`نبض ${row.pulse}`);
    if (row.spo2) parts.push(`أكسجين ${row.spo2}%`);
    const danger = (row.systolic && (row.systolic >= 180 || row.diastolic >= 120)) || (row.spo2 && row.spo2 < 90);
    if (danger) return { alert: true, msg: { title: "⚠️ قياس خطير", body: `${parts.join(" · ")}. أعد القياس بعد 5 دقايق راحة، وإذا ما تحسن كلّموا الدكتور.`, tag: `bp-${row.id}`, url: "/#vitals", alert: true } };
    return { alert: false, msg: { title: "🩺 قياس جديد", body: parts.join(" · "), tag: `bp-${row.id}`, url: "/#vitals" } };
  }
  if (kind === "meals") {
    const verdict = row.analysis ? JSON.parse(row.analysis).verdict_text : "";
    const body = [row.followed ? "أكلها حسب الخطة" : `أكل: ${row.text}`, verdict].filter(Boolean).join(" — ");
    return { alert: false, msg: { title: `${row.has_photo ? "📸" : "🍽️"} ${MEALS[row.slot] || "وجبة"}`, body, tag: `m-${row.id}`, url: "/#diet" } };
  }
  if (kind === "notes") {
    return { alert: false, msg: { title: "📝 ملاحظة جديدة", body: row.text.slice(0, 120), tag: `n-${row.id}`, url: "/#notes" } };
  }
  return null;
}

// يسجل إن التذكير انرسل، ويرجع false إذا كان مرسل قبل
async function once(db, key) {
  const r = await db.prepare("INSERT OR IGNORE INTO sent_log (k) VALUES (?)").bind(key).run();
  return r.meta.changes > 0;
}

// التذكيرات لكل المرضى: قياس السكر، والجرعات، والأدوية، والمواعيد
export async function runReminders(db) {
  const patients = (await db.prepare("SELECT * FROM patients WHERE archived = 0").all()).results;
  const out = [];
  for (const p of patients) out.push(...await patientReminders(db, p));
  // تنظيف السجلات القديمة
  const week = new Date(Date.now() - 7 * 864e5).toISOString();
  await db.batch([
    db.prepare("DELETE FROM sent_log WHERE created_at < ?").bind(week),
    db.prepare("DELETE FROM login_attempts WHERE created_at < ?").bind(week),
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(new Date().toISOString()),
  ]);
  return out;
}

async function patientReminders(db, p) {
  const now = new Date();
  const today = dayKey(now);
  const nowMin = toMin(hhmm(now));
  const due = (t) => nowMin >= toMin(t) && nowMin - toMin(t) < REMINDER_WINDOW_MIN;
  const reminders = JSON.parse(p.reminders || "[]");
  const since = new Date(now.getTime() - 36 * 36e5).toISOString();
  const [readings, doses, meds, medDoses, appts] = (await db.batch([
    db.prepare("SELECT * FROM readings WHERE patient_id = ? AND created_at >= ?").bind(p.id, since),
    db.prepare("SELECT * FROM doses WHERE patient_id = ? AND created_at >= ?").bind(p.id, since),
    db.prepare("SELECT * FROM medications WHERE patient_id = ? AND active = 1").bind(p.id),
    db.prepare("SELECT * FROM med_doses WHERE patient_id = ? AND created_at >= ?").bind(p.id, since),
    db.prepare("SELECT * FROM appointments WHERE patient_id = ? AND at >= ?").bind(p.id, today),
  ])).map((r) => r.results);

  const out = [];
  const send = async (key, msg, alert = true) => {
    msg.body = `${p.name} · ${msg.body}`;
    if (await once(db, `p${p.id}:${key}`)) out.push({ key: `p${p.id}:${key}`, sent: await broadcast(db, p.family_id, msg, { alert }) });
  };

  for (const r of reminders) {
    if (r.off) continue;
    if (r.type === "sugar") {
      const done = readings.some((x) => x.context === r.context && dayKey(new Date(x.created_at)) === today);
      if (!done && due(r.time)) {
        await send(`${today}:sugar:${r.context}:${r.time}`, { title: "⏰ وقت قياس السكر", body: `${CONTEXTS[r.context]} — سجّلوا القراءة في ود.`, tag: `rem-sugar-${p.id}-${r.context}`, url: "/#sugar" });
      }
    }
    if (r.type === "dose" && p.uses_insulin) {
      const slot = SLOTS[r.slot];
      const day = r.slot === "bedtime" ? doseDay(now) : today;
      const done = doses.some((x) => x.slot === r.slot && (r.slot === "bedtime" ? doseDay(x.created_at) : dayKey(new Date(x.created_at))) === day);
      if (!done && due(r.time) && nowMin - toMin(r.time) < LATE_DOSE_MIN) {
        await send(`${day}:dose:${r.slot}:${r.time}`, { title: `💉 جرعة ${slot.insulin} ${p[slot.key]} وحدة`, body: `${slot.label}. قيسوا السكر قبلها، وإذا كان تحت ${p.low_threshold} لا تعطونه.`, tag: `rem-dose-${p.id}-${r.slot}`, url: "/#sugar" });
      }
      // إذا تأخرت الجرعة: تنبيه ثاني
      const late = toMin(r.time) + LATE_DOSE_MIN;
      if (!done && nowMin >= late && nowMin - late < REMINDER_WINDOW_MIN) {
        await send(`${day}:dose-late:${r.slot}:${r.time}`, { title: `⚠️ جرعة ${slot.label} ما انسجلت`, body: `${slot.insulin} ${p[slot.key]} وحدة. إذا أخذها سجّلوها، وإذا ما أخذها انتبهوا.`, tag: `rem-dose-${p.id}-${r.slot}`, url: "/#sugar" });
      }
    }
  }

  // التذكيرات الشهرية (مثل: احجزوا موعد إبرة العين)
  const dom = Number(today.slice(8, 10));
  for (const [i, r] of reminders.entries()) {
    if (r.off || r.type !== "monthly" || r.day !== dom || !due(r.time)) continue;
    await send(`${today}:monthly:${i}:${r.time}`, { title: "📅 تذكير شهري", body: r.text, tag: `rem-monthly-${p.id}-${i}`, url: "/#appointments" });
  }

  for (const m of meds) {
    for (const t of JSON.parse(m.times || "[]")) {
      const done = medDoses.some((x) => x.medication_id === m.id && x.time_slot === t && dayKey(new Date(x.created_at)) === today);
      if (!done && due(t)) {
        await send(`${today}:med:${m.id}:${t}`, { title: `💊 ${m.name}`, body: `${m.dose || ""} — موعده ${fmt12(t)}`.trim(), tag: `rem-med-${m.id}`, url: "/#meds" });
      }
    }
  }

  // المواعيد: الساعة 8 الليل قبلها بيوم، وقبل الموعد بساعتين
  const tomorrow = dayKey(new Date(now.getTime() + 864e5));
  for (const a of appts) {
    const [d, t] = a.at.split("T");
    if (d === tomorrow && due("20:00")) {
      await send(`appt-eve:${a.id}`, { title: "📅 موعد بكرة", body: `${a.title} — ${fmt12(t)}${a.place ? ` · ${a.place}` : ""}${a.notes ? `\n${a.notes}` : ""}`, tag: `appt-${a.id}`, url: "/#appointments" });
    }
    if (d === today && nowMin >= toMin(t) - 120 && nowMin < toMin(t)) {
      await send(`appt-2h:${a.id}`, { title: "📅 موعد بعد شوي", body: `${a.title} — ${fmt12(t)}${a.place ? ` · ${a.place}` : ""}`, tag: `appt-${a.id}`, url: "/#appointments" });
    }
  }
  return out;
}
