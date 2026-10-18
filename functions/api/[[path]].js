// واجهة البيانات (Cloudflare Pages Functions + D1)
// تحتاج ربط قاعدة البيانات dad-health-db باسم DB (مكتوب في wrangler.toml).

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });

class BadRequest extends Error {}
const bad = (msg) => { throw new BadRequest(msg); };

const CONTEXTS = ["fasting", "after_breakfast", "after_lunch", "after_dinner", "random"];
const SLOTS = { breakfast: "Humalog", lunch: "Humalog", dinner: "Humalog", bedtime: "Tresiba" };
const KINDS = ["visit", "lab", "other"];
const SETTING_FIELDS = [
  "humalog_breakfast", "humalog_lunch", "humalog_dinner", "tresiba_dose",
  "low_threshold", "fasting_low", "fasting_high", "post_low", "post_high", "bp_sys_high", "bp_dia_high",
];
// الجداول اللي يقدر المستخدم يحذف منها صف
const DELETABLE = {
  readings: "readings", doses: "doses", bp: "bp_readings", "med-doses": "med_doses",
  appointments: "appointments", notes: "notes",
};
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const text = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const int = (v, min, max, label, optional = false) => {
  if (optional && (v === null || v === undefined || v === "")) return null;
  const n = Math.round(Number(v));
  if (!(n >= min && n <= max)) bad(`${label} غير صحيح`);
  return n;
};
const parseTimes = (v) => {
  const times = Array.isArray(v) ? v.filter((t) => TIME_RE.test(t)) : [];
  return JSON.stringify([...new Set(times)].sort().slice(0, 8));
};

export async function onRequest({ request, env, params }) {
  const db = env.DB;
  if (!db) return json({ error: "قاعدة البيانات مو مربوطة (DB)" }, 500);
  const [resource, id] = params.path || [];
  const method = request.method;
  const body = method === "POST" || method === "PUT" ? await request.json().catch(() => ({})) : {};
  const insert = (sql, ...args) => db.prepare(sql + " RETURNING *").bind(...args).first();

  try {
    if (resource === "all" && method === "GET") {
      const q = (sql) => db.prepare(sql);
      const [settings, readings, doses, changes, bp, medications, medDoses, appointments, notes] = await db.batch([
        q("SELECT * FROM settings WHERE id = 1"),
        q("SELECT * FROM readings ORDER BY created_at DESC LIMIT 1000"),
        q("SELECT * FROM doses ORDER BY created_at DESC LIMIT 1000"),
        q("SELECT * FROM tresiba_changes ORDER BY created_at DESC LIMIT 100"),
        q("SELECT * FROM bp_readings ORDER BY created_at DESC LIMIT 500"),
        q("SELECT * FROM medications ORDER BY active DESC, name"),
        q("SELECT * FROM med_doses ORDER BY created_at DESC LIMIT 1000"),
        q("SELECT * FROM appointments ORDER BY at DESC LIMIT 200"),
        q("SELECT * FROM notes ORDER BY created_at DESC LIMIT 500"),
      ]);
      return json({
        settings: settings.results[0],
        readings: readings.results,
        doses: doses.results,
        changes: changes.results,
        bp: bp.results,
        medications: medications.results.map((m) => ({ ...m, times: JSON.parse(m.times || "[]") })),
        medDoses: medDoses.results,
        appointments: appointments.results,
        notes: notes.results,
      });
    }

    if (resource === "readings" && method === "POST") {
      const glucose = int(body.glucose, 10, 700, "قراءة السكر");
      const context = CONTEXTS.includes(body.context) ? body.context : "random";
      return json(await insert("INSERT INTO readings (glucose, context, note) VALUES (?, ?, ?)", glucose, context, text(body.note, 300)));
    }

    if (resource === "doses" && method === "POST") {
      const insulin = SLOTS[body.slot] || bad("جرعة غير معروفة");
      const s = await db.prepare("SELECT * FROM settings WHERE id = 1").first();
      const key = body.slot === "bedtime" ? "tresiba_dose" : `humalog_${body.slot}`;
      // الجرعة تنأخذ من خطة الدكتور المحفوظة، مو من المتصفح
      return json(await insert("INSERT INTO doses (insulin, slot, units) VALUES (?, ?, ?)", insulin, body.slot, s[key]));
    }

    if (resource === "bp" && method === "POST") {
      const sys = int(body.systolic, 50, 260, "الضغط العالي", true);
      const dia = int(body.diastolic, 30, 160, "الضغط الواطي", true);
      const pulse = int(body.pulse, 30, 220, "النبض", true);
      const spo2 = int(body.spo2, 50, 100, "الأكسجين", true);
      if ((sys === null) !== (dia === null)) bad("اكتب الضغط العالي والواطي مع بعض");
      if (sys !== null && sys <= dia) bad("الضغط العالي لازم يكون أكبر من الواطي");
      if (sys === null && pulse === null && spo2 === null) bad("اكتب قراءة وحدة على الأقل");
      return json(await insert(
        "INSERT INTO bp_readings (systolic, diastolic, pulse, spo2, note) VALUES (?, ?, ?, ?, ?)",
        sys, dia, pulse, spo2, text(body.note, 300),
      ));
    }

    if (resource === "medications" && method === "POST") {
      const name = text(body.name, 80) || bad("اكتب اسم الدواء");
      return json(await insert(
        "INSERT INTO medications (name, dose, times, notes) VALUES (?, ?, ?, ?)",
        name, text(body.dose, 80), parseTimes(body.times), text(body.notes, 300),
      ));
    }

    if (resource === "medications" && method === "PUT" && id) {
      const name = text(body.name, 80) || bad("اكتب اسم الدواء");
      await db.prepare("UPDATE medications SET name = ?, dose = ?, times = ?, notes = ?, active = ? WHERE id = ?")
        .bind(name, text(body.dose, 80), parseTimes(body.times), text(body.notes, 300), body.active === false ? 0 : 1, Number(id)).run();
      return json({ ok: true });
    }

    if (resource === "med-doses" && method === "POST") {
      const medId = int(body.medication_id, 1, 1e9, "الدواء");
      const slot = TIME_RE.test(body.time_slot) ? body.time_slot : bad("الموعد غير صحيح");
      return json(await insert("INSERT INTO med_doses (medication_id, time_slot) VALUES (?, ?)", medId, slot));
    }

    if (resource === "appointments" && method === "POST") {
      const at = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(body.at) ? body.at : bad("اختر التاريخ والساعة");
      const title = text(body.title, 120) || bad("اكتب عنوان الموعد");
      const kind = KINDS.includes(body.kind) ? body.kind : "visit";
      return json(await insert(
        "INSERT INTO appointments (at, title, kind, place, notes) VALUES (?, ?, ?, ?, ?)",
        at, title, kind, text(body.place, 120), text(body.notes, 500),
      ));
    }

    if (resource === "notes" && method === "POST") {
      const t = text(body.text, 1000) || bad("اكتب الملاحظة");
      return json(await insert("INSERT INTO notes (text) VALUES (?)", t));
    }

    if (DELETABLE[resource] && method === "DELETE" && id) {
      await db.prepare(`DELETE FROM ${DELETABLE[resource]} WHERE id = ?`).bind(Number(id)).run();
      return json({ ok: true });
    }

    if (resource === "settings" && method === "PUT") {
      const old = await db.prepare("SELECT * FROM settings WHERE id = 1").first();
      const values = {};
      for (const k of SETTING_FIELDS) {
        const n = Number(body[k] ?? old[k]);
        if (!(n > 0 && n <= 700)) bad(`قيمة غير صحيحة: ${k}`);
        values[k] = n;
      }
      const name = text(body.patient_name, 60) || old.patient_name;
      const stmts = [
        db.prepare(`UPDATE settings SET patient_name = ?, ${SETTING_FIELDS.map((k) => `${k} = ?`).join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1`)
          .bind(name, ...SETTING_FIELDS.map((k) => values[k])),
      ];
      if (values.tresiba_dose !== Number(old.tresiba_dose)) {
        // أي تغيير في Tresiba ينحفظ في السجل، ويبدأ عدّ الأربعة أيام من جديد
        stmts.push(db.prepare("INSERT INTO tresiba_changes (old_dose, new_dose, reason) VALUES (?, ?, ?)")
          .bind(old.tresiba_dose, values.tresiba_dose, text(body.reason, 200) || "تعديل يدوي من الإعدادات"));
      }
      await db.batch(stmts);
      return json(await db.prepare("SELECT * FROM settings WHERE id = 1").first());
    }

    return json({ error: "غير موجود" }, 404);
  } catch (e) {
    return json({ error: e.message }, e instanceof BadRequest ? 400 : 500);
  }
}
