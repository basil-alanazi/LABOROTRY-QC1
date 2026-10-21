// واجهة البيانات (Cloudflare Pages Functions + D1)
import { broadcast, eventMessage, loadVapid, runReminders } from "../../server/notify.js";
import { sendPush } from "../../server/push.js";
// تحتاج ربط قاعدة البيانات dad-health-db باسم DB (مكتوب في wrangler.toml).

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });

class BadRequest extends Error {}
const bad = (msg) => { throw new BadRequest(msg); };

const CONTEXTS = [
  "fasting", "after_breakfast", "before_lunch", "after_lunch", "before_dinner", "after_dinner", "bedtime", "random",
];
const MAX_BACKDATE_DAYS = 14;
const SLOTS = { breakfast: "Humalog", lunch: "Humalog", dinner: "Humalog", bedtime: "Tresiba" };
const KINDS = ["visit", "lab", "other"];
const SETTING_FIELDS = [
  "humalog_breakfast", "humalog_lunch", "humalog_dinner", "tresiba_dose",
  "low_threshold", "fasting_low", "fasting_high", "post_low", "post_high", "bp_sys_high", "bp_dia_high",
];
// الجداول اللي يقدر المستخدم يحذف منها صف
const DELETABLE = {
  readings: "readings", doses: "doses", bp: "bp_readings", "med-doses": "med_doses",
  appointments: "appointments", notes: "notes", labs: "labs", meals: "meals",
};
const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"];
const LAB_TESTS = ["hba1c", "other"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const text = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const int = (v, min, max, label, optional = false) => {
  if (optional && (v === null || v === undefined || v === "")) return null;
  const n = Math.round(Number(v));
  if (!(n >= min && n <= max)) bad(`${label} غير صحيح`);
  return n;
};
// وقت القياس الفعلي إذا انسجل متأخر. فاضي = الحين
const parseAt = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(v);
  if (isNaN(d)) bad("الوقت غير صحيح");
  const diff = Date.now() - d.getTime();
  if (diff < -5 * 60e3) bad("الوقت ما يكون بالمستقبل");
  if (diff > MAX_BACKDATE_DAYS * 864e5) bad(`ما يمديك تسجل أقدم من ${MAX_BACKDATE_DAYS} يوم`);
  return d.toISOString();
};
// يضيف created_at للإدخال إذا فيه وقت محدد
const withAt = (cols, vals, at) => (at ? [[...cols, "created_at"], [...vals, at]] : [cols, vals]);

const parseTimes = (v) => {
  const times = Array.isArray(v) ? v.filter((t) => TIME_RE.test(t)) : [];
  return JSON.stringify([...new Set(times)].sort().slice(0, 8));
};

export async function onRequest({ request, env, params, waitUntil }) {
  const db = env.DB;
  if (!db) return json({ error: "قاعدة البيانات مو مربوطة (DB)" }, 500);
  const [resource, id] = params.path || [];
  const method = request.method;
  const body = method === "POST" || method === "PUT" ? await request.json().catch(() => ({})) : {};
  const insert = (sql, ...args) => db.prepare(sql + " RETURNING *").bind(...args).first();
  // بعد أي تسجيل: إشعار فوري لباقي العائلة (الجهاز اللي سجّل ما يوصله)
  const device = request.headers.get("x-device");
  const created = async (kind, row) => {
    const settings = await db.prepare("SELECT * FROM settings WHERE id = 1").first();
    const ev = eventMessage(kind, row, settings);
    if (ev) waitUntil(broadcast(db, ev.msg, { alert: ev.alert, exclude: device }).catch(() => {}));
    return json(row);
  };

  try {
    if (resource === "all" && method === "GET") {
      const q = (sql) => db.prepare(sql);
      const [settings, readings, doses, changes, bp, medications, medDoses, appointments, notes, labs, meals] = await db.batch([
        q("SELECT * FROM settings WHERE id = 1"),
        q("SELECT * FROM readings ORDER BY created_at DESC LIMIT 1000"),
        q("SELECT * FROM doses ORDER BY created_at DESC LIMIT 1000"),
        q("SELECT * FROM tresiba_changes ORDER BY created_at DESC LIMIT 100"),
        q("SELECT * FROM bp_readings ORDER BY created_at DESC LIMIT 500"),
        q("SELECT * FROM medications ORDER BY active DESC, name"),
        q("SELECT * FROM med_doses ORDER BY created_at DESC LIMIT 1000"),
        q("SELECT * FROM appointments ORDER BY at DESC LIMIT 200"),
        q("SELECT * FROM notes ORDER BY created_at DESC LIMIT 500"),
        q("SELECT * FROM labs ORDER BY taken_on DESC LIMIT 200"),
        q("SELECT * FROM meals ORDER BY created_at DESC LIMIT 500"),
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
        labs: labs.results,
        meals: meals.results,
      });
    }

    if (resource === "readings" && method === "POST") {
      const glucose = int(body.glucose, 10, 700, "قراءة السكر");
      const context = CONTEXTS.includes(body.context) ? body.context : "random";
      const lastMeal = context === "random" && TIME_RE.test(body.last_meal_at) ? body.last_meal_at : null;
      const [cols, vals] = withAt(["glucose", "context", "note", "last_meal_at"], [glucose, context, text(body.note, 300), lastMeal], parseAt(body.at));
      return created("readings", await insert(`INSERT INTO readings (${cols}) VALUES (${cols.map(() => "?")})`, ...vals));
    }

    if (resource === "doses" && method === "POST") {
      const insulin = SLOTS[body.slot] || bad("جرعة غير معروفة");
      const s = await db.prepare("SELECT * FROM settings WHERE id = 1").first();
      const key = body.slot === "bedtime" ? "tresiba_dose" : `humalog_${body.slot}`;
      // الجرعة الافتراضية من خطة الدكتور المحفوظة، وإذا عطاه كمية ثانية تنحفظ مع رقم الخطة للمقارنة
      let units = s[key];
      if (body.units !== undefined && body.units !== null && body.units !== "") {
        units = Number(body.units);
        if (!(units >= 0.5 && units <= 100) || (units * 2) % 1 !== 0) bad("الكمية لازم تكون بين 0.5 و100 (بنص وحدة)");
      }
      const [cols, vals] = withAt(["insulin", "slot", "units", "planned_units"], [insulin, body.slot, units, s[key]], parseAt(body.at));
      return created("doses", await insert(`INSERT INTO doses (${cols}) VALUES (${cols.map(() => "?")})`, ...vals));
    }

    // تعديل جرعة مسجلة (الوقت أو الكمية)
    if (resource === "doses" && method === "PUT" && id) {
      const row = await db.prepare("SELECT * FROM doses WHERE id = ?").bind(Number(id)).first();
      if (!row) bad("الجرعة مو موجودة");
      const units = body.units === undefined || body.units === "" ? row.units : Number(body.units);
      if (!(units >= 0.5 && units <= 100) || (units * 2) % 1 !== 0) bad("الكمية لازم تكون بين 0.5 و100 (بنص وحدة)");
      const at = parseAt(body.at) || row.created_at;
      await db.prepare("UPDATE doses SET units = ?, created_at = ? WHERE id = ?").bind(units, at, row.id).run();
      return json({ ...row, units, created_at: at });
    }

    if (resource === "bp" && method === "POST") {
      const sys = int(body.systolic, 50, 260, "الضغط العالي", true);
      const dia = int(body.diastolic, 30, 160, "الضغط الواطي", true);
      const pulse = int(body.pulse, 30, 220, "النبض", true);
      const spo2 = int(body.spo2, 50, 100, "الأكسجين", true);
      if ((sys === null) !== (dia === null)) bad("اكتب الضغط العالي والواطي مع بعض");
      if (sys !== null && sys <= dia) bad("الضغط العالي لازم يكون أكبر من الواطي");
      if (sys === null && pulse === null && spo2 === null) bad("اكتب قراءة وحدة على الأقل");
      const [cols, vals] = withAt(["systolic", "diastolic", "pulse", "spo2", "note"], [sys, dia, pulse, spo2, text(body.note, 300)], parseAt(body.at));
      return created("bp", await insert(`INSERT INTO bp_readings (${cols}) VALUES (${cols.map(() => "?")})`, ...vals));
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
      return created("notes", await insert("INSERT INTO notes (text) VALUES (?)", t));
    }

    if (resource === "labs" && (method === "POST" || (method === "PUT" && id))) {
      const takenOn = DATE_RE.test(body.taken_on) ? body.taken_on : bad("اختر تاريخ التحليل");
      const test = LAB_TESTS.includes(body.test) ? body.test : "hba1c";
      const value = Number(body.value);
      if (!(value > 0 && value < 10000)) bad("النتيجة غير صحيحة");
      if (test === "hba1c" && !(value >= 3 && value <= 20)) bad("السكر التراكمي لازم يكون بين 3 و20");
      const unit = test === "hba1c" ? "%" : text(body.unit, 20);
      const notes = test === "other" ? (text(body.notes, 300) || bad("اكتب اسم التحليل")) : text(body.notes, 300);
      if (method === "POST") {
        return json(await insert("INSERT INTO labs (taken_on, test, value, unit, notes) VALUES (?, ?, ?, ?, ?)", takenOn, test, value, unit, notes));
      }
      await db.prepare("UPDATE labs SET taken_on = ?, test = ?, value = ?, unit = ?, notes = ? WHERE id = ?")
        .bind(takenOn, test, value, unit, notes, Number(id)).run();
      return json({ ok: true });
    }

    if (resource === "meals" && method === "POST") {
      const slot = MEAL_SLOTS.includes(body.slot) ? body.slot : bad("الوجبة غير معروفة");
      const followed = body.followed === false ? 0 : 1;
      const t = text(body.text, 300);
      if (!followed && !t) bad("اكتب وش أكل");
      return created("meals", await insert("INSERT INTO meals (slot, followed, text) VALUES (?, ?, ?)", slot, followed, t));
    }

    // ===== الإشعارات =====
    if (resource === "push" && id === "key" && method === "GET") {
      const row = await db.prepare("SELECT v FROM secrets WHERE k = 'vapid_public'").first();
      return json({ key: row?.v || null });
    }

    if (resource === "push" && id === "subscribe" && method === "POST") {
      const sub = body.subscription || {};
      const endpoint = typeof sub.endpoint === "string" && sub.endpoint.startsWith("https://") ? sub.endpoint : bad("اشتراك غير صحيح");
      const p256dh = text(sub.keys?.p256dh, 200) || bad("اشتراك غير صحيح");
      const auth = text(sub.keys?.auth, 100) || bad("اشتراك غير صحيح");
      const mode = body.mode === "alerts" ? "alerts" : "all";
      const row = await insert(
        `INSERT INTO push_subs (endpoint, p256dh, auth, name, mode) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, name = excluded.name, mode = excluded.mode`,
        endpoint, p256dh, auth, text(body.name, 40), mode,
      );
      return json({ id: row.id, name: row.name, mode: row.mode });
    }

    if (resource === "push" && id === "unsubscribe" && method === "POST") {
      await db.prepare("DELETE FROM push_subs WHERE id = ?").bind(Number(body.id)).run();
      return json({ ok: true });
    }

    if (resource === "push" && id === "devices" && method === "GET") {
      const rows = (await db.prepare("SELECT id, created_at, name, mode FROM push_subs ORDER BY created_at").all()).results;
      return json(rows);
    }

    if (resource === "push" && id === "test" && method === "POST") {
      const sub = await db.prepare("SELECT * FROM push_subs WHERE id = ?").bind(Number(body.id)).first();
      if (!sub) bad("هالجهاز مو مشترك");
      const status = await sendPush(sub, { title: "✅ الإشعارات شغالة", body: "بيوصلك كل جديد عن الوالد هنا.", tag: "test", url: "/" }, await loadVapid(db), { urgent: true });
      if (status >= 300) bad(`خدمة الإشعارات رجّعت ${status}`);
      return json({ ok: true });
    }

    // المنبّه: يستدعيه Worker كل كم دقيقة
    if (resource === "cron") {
      const row = await db.prepare("SELECT v FROM secrets WHERE k = 'cron_key'").first();
      const key = request.headers.get("x-cron-key") || new URL(request.url).searchParams.get("key");
      if (!row || key !== row.v) return json({ error: "غير مصرح" }, 401);
      return json({ ok: true, sent: await runReminders(db) });
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
      let reminders = old.reminders;
      if (Array.isArray(body.reminders)) {
        reminders = JSON.stringify(body.reminders.slice(0, 30).map((r) => {
          if (!TIME_RE.test(r.time)) bad("وقت تذكير غير صحيح");
          if (r.type === "sugar" && CONTEXTS.includes(r.context)) return { time: r.time, type: "sugar", context: r.context, off: !!r.off };
          if (r.type === "dose" && SLOTS[r.slot]) return { time: r.time, type: "dose", slot: r.slot, off: !!r.off };
          return bad("تذكير غير صحيح");
        }).sort((a, b) => (a.time < b.time ? -1 : 1)));
      }
      const stmts = [
        db.prepare(`UPDATE settings SET patient_name = ?, reminders = ?, ${SETTING_FIELDS.map((k) => `${k} = ?`).join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1`)
          .bind(name, reminders, ...SETTING_FIELDS.map((k) => values[k])),
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
