// واجهة البيانات (Cloudflare Pages Functions + D1)
// تحتاج ربط قاعدة البيانات dad-health-db باسم DB في إعدادات المشروع.

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });

const CONTEXTS = ["fasting", "after_breakfast", "after_lunch", "after_dinner", "random"];
const SLOTS = { breakfast: "Humalog", lunch: "Humalog", dinner: "Humalog", bedtime: "Tresiba" };
const SETTING_FIELDS = [
  "humalog_breakfast", "humalog_lunch", "humalog_dinner", "tresiba_dose",
  "low_threshold", "fasting_low", "fasting_high", "post_low", "post_high", "bp_sys_high", "bp_dia_high",
];

export async function onRequest({ request, env, params }) {
  const db = env.DB;
  if (!db) return json({ error: "قاعدة البيانات مو مربوطة (DB)" }, 500);
  const [resource, id] = params.path || [];
  const method = request.method;
  const body = method === "POST" || method === "PUT" ? await request.json().catch(() => ({})) : {};

  try {
    if (resource === "all" && method === "GET") {
      const [settings, readings, doses, changes, bp] = await db.batch([
        db.prepare("SELECT * FROM settings WHERE id = 1"),
        db.prepare("SELECT * FROM readings ORDER BY created_at DESC LIMIT 1000"),
        db.prepare("SELECT * FROM doses ORDER BY created_at DESC LIMIT 1000"),
        db.prepare("SELECT * FROM tresiba_changes ORDER BY created_at DESC LIMIT 100"),
        db.prepare("SELECT * FROM bp_readings ORDER BY created_at DESC LIMIT 500"),
      ]);
      return json({ settings: settings.results[0], readings: readings.results, doses: doses.results, changes: changes.results, bp: bp.results });
    }

    if (resource === "readings" && method === "POST") {
      const glucose = Math.round(Number(body.glucose));
      if (!(glucose >= 10 && glucose <= 700)) return json({ error: "قراءة غير صحيحة" }, 400);
      const context = CONTEXTS.includes(body.context) ? body.context : "random";
      const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;
      const row = await db.prepare("INSERT INTO readings (glucose, context, note) VALUES (?, ?, ?) RETURNING *").bind(glucose, context, note).first();
      return json(row);
    }

    if (resource === "doses" && method === "POST") {
      const insulin = SLOTS[body.slot];
      if (!insulin) return json({ error: "جرعة غير معروفة" }, 400);
      const s = await db.prepare("SELECT * FROM settings WHERE id = 1").first();
      const key = body.slot === "bedtime" ? "tresiba_dose" : `humalog_${body.slot}`;
      // الجرعة تنأخذ من خطة الدكتور المحفوظة، مو من المتصفح
      const row = await db.prepare("INSERT INTO doses (insulin, slot, units) VALUES (?, ?, ?) RETURNING *").bind(insulin, body.slot, s[key]).first();
      return json(row);
    }

    if (resource === "bp" && method === "POST") {
      const sys = Math.round(Number(body.systolic));
      const dia = Math.round(Number(body.diastolic));
      const pulse = body.pulse ? Math.round(Number(body.pulse)) : null;
      if (!(sys >= 50 && sys <= 260 && dia >= 30 && dia <= 160 && sys > dia)) return json({ error: "قراءة ضغط غير صحيحة" }, 400);
      if (pulse !== null && !(pulse >= 30 && pulse <= 220)) return json({ error: "النبض غير صحيح" }, 400);
      const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;
      const row = await db.prepare("INSERT INTO bp_readings (systolic, diastolic, pulse, note) VALUES (?, ?, ?, ?) RETURNING *").bind(sys, dia, pulse, note).first();
      return json(row);
    }

    const TABLES = { readings: "readings", doses: "doses", bp: "bp_readings" };
    if (TABLES[resource] && method === "DELETE" && id) {
      await db.prepare(`DELETE FROM ${TABLES[resource]} WHERE id = ?`).bind(Number(id)).run();
      return json({ ok: true });
    }

    if (resource === "settings" && method === "PUT") {
      const old = await db.prepare("SELECT * FROM settings WHERE id = 1").first();
      const values = {};
      for (const k of SETTING_FIELDS) {
        const n = Number(body[k] ?? old[k]);
        if (!(n > 0 && n <= 700)) return json({ error: `قيمة غير صحيحة: ${k}` }, 400);
        values[k] = n;
      }
      const name = typeof body.patient_name === "string" && body.patient_name.trim() ? body.patient_name.trim().slice(0, 60) : old.patient_name;
      const stmts = [
        db.prepare(`UPDATE settings SET patient_name = ?, ${SETTING_FIELDS.map((k) => `${k} = ?`).join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1`)
          .bind(name, ...SETTING_FIELDS.map((k) => values[k])),
      ];
      if (values.tresiba_dose !== Number(old.tresiba_dose)) {
        // أي تغيير في Tresiba ينحفظ في السجل، ويبدأ عدّ الأربعة أيام من جديد
        const reason = typeof body.reason === "string" && body.reason ? body.reason.slice(0, 200) : "تعديل يدوي من الإعدادات";
        stmts.push(db.prepare("INSERT INTO tresiba_changes (old_dose, new_dose, reason) VALUES (?, ?, ?)").bind(old.tresiba_dose, values.tresiba_dose, reason));
      }
      await db.batch(stmts);
      return json(await db.prepare("SELECT * FROM settings WHERE id = 1").first());
    }

    return json({ error: "غير موجود" }, 404);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
