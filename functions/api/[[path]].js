// واجهة البيانات (Cloudflare Pages Functions + D1 + Workers AI)
// كل طلب يتحقق من المستخدم، وما يوصل إلا لبيانات عائلته.
import { broadcast, eventMessage, loadVapid, runReminders } from "../../server/notify.js";
import { sendPush } from "../../server/push.js";
import {
  USERNAME_RE, clearCookie, createSession, currentUser, endSession, hashPassword,
  recordFailure, sessionCookie, tooManyAttempts, verifyPassword,
} from "../../server/auth.js";
import { CONDITIONS, computeTargets, generateDiet } from "../../server/diet.js";
import { analyzeMeal, generateAdvice, mealImage } from "../../server/health.js";

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });

class HttpError extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}
const bad = (msg, status = 400) => { throw new HttpError(msg, status); };

const CONTEXTS = [
  "fasting", "after_breakfast", "before_lunch", "after_lunch", "before_dinner", "after_dinner", "bedtime", "random",
];
const MAX_BACKDATE_DAYS = 14;
const SLOTS = { breakfast: "Humalog", lunch: "Humalog", dinner: "Humalog", bedtime: "Tresiba" };
const KINDS = ["visit", "lab", "other"];
const SEXES = ["male", "female"];
const ACTIVITIES = ["sedentary", "light", "moderate", "active"];
const PLAN_FIELDS = [
  "humalog_breakfast", "humalog_lunch", "humalog_dinner", "tresiba_dose",
  "low_threshold", "fasting_low", "fasting_high", "post_low", "post_high", "bp_sys_high", "bp_dia_high",
];
// الجداول اللي يقدر المستخدم يحذف منها صف (لمريضه بس)
const DELETABLE = {
  readings: "readings", doses: "doses", bp: "bp_readings", "med-doses": "med_doses",
  appointments: "appointments", notes: "notes", labs: "labs", meals: "meals",
};
const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"];
const LAB_TESTS = ["hba1c", "other"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// صورة من الجوال بعد ما صغّرناها (حوالي 50–150 كيلو)
const MAX_PHOTO = 600_000;
const parsePhoto = (v) => {
  if (typeof v !== "string" || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) bad("الصورة غير صحيحة");
  if (v.length > MAX_PHOTO) bad("الصورة كبيرة، جرّب وحدة ثانية");
  return v;
};
const DIET_MEALS = ["breakfast", "snack1", "lunch", "snack2", "dinner"];
// صورة محفوظة كـ data URL ← ملف صورة
const imageResponse = (data) => {
  const m = data?.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
  if (!m) bad("ما فيه صورة", 404);
  const bytes = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0));
  return new Response(bytes, { headers: { "content-type": m[1], "cache-control": "private, max-age=31536000, immutable" } });
};
const text = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const int = (v, min, max, label, optional = false) => {
  if (optional && (v === null || v === undefined || v === "")) return null;
  const n = Math.round(Number(v));
  if (!(n >= min && n <= max)) bad(`${label} غير صحيح`);
  return n;
};
const real = (v, min, max, label) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!(n >= min && n <= max)) bad(`${label} غير صحيح`);
  return Math.round(n * 10) / 10;
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
const withAt = (cols, vals, at) => (at ? [[...cols, "created_at"], [...vals, at]] : [cols, vals]);
const parseTimes = (v) => {
  const times = Array.isArray(v) ? v.filter((t) => TIME_RE.test(t)) : [];
  return JSON.stringify([...new Set(times)].sort().slice(0, 8));
};
const placeholders = (cols) => cols.map(() => "?").join(", ");

function parseReminders(list) {
  if (!Array.isArray(list)) return null;
  return JSON.stringify(list.slice(0, 30).map((r) => {
    if (!TIME_RE.test(r.time)) bad("وقت تذكير غير صحيح");
    if (r.type === "sugar" && CONTEXTS.includes(r.context)) return { time: r.time, type: "sugar", context: r.context, off: !!r.off };
    if (r.type === "dose" && SLOTS[r.slot]) return { time: r.time, type: "dose", slot: r.slot, off: !!r.off };
    return bad("تذكير غير صحيح");
  }).sort((a, b) => (a.time < b.time ? -1 : 1)));
}

// تذكيرات افتراضية لمريض جديد حسب حالته
function defaultReminders(conditions, usesInsulin) {
  const diabetic = conditions.some((c) => c.startsWith("diabetes") || c === "prediabetes");
  const list = [];
  if (diabetic) list.push({ time: "07:00", type: "sugar", context: "fasting" }, { time: "15:00", type: "sugar", context: "after_lunch" });
  if (usesInsulin) {
    list.push(
      { time: "07:15", type: "dose", slot: "breakfast" }, { time: "13:00", type: "dose", slot: "lunch" },
      { time: "20:00", type: "dose", slot: "dinner" }, { time: "23:00", type: "dose", slot: "bedtime" },
    );
  }
  return JSON.stringify(list.sort((a, b) => (a.time < b.time ? -1 : 1)));
}

// الملف الصحي من الطلب (للإضافة والتعديل)
function parseProfile(body) {
  const conditions = Array.isArray(body.conditions) ? body.conditions.filter((c) => CONDITIONS[c]) : [];
  const year = new Date().getFullYear();
  return {
    name: text(body.name, 60) || bad("اكتب اسم المريض"),
    sex: SEXES.includes(body.sex) ? body.sex : bad("اختر الجنس"),
    birth_year: int(body.birth_year, year - 115, year, "سنة الميلاد", true),
    height_cm: real(body.height_cm, 50, 250, "الطول"),
    weight_kg: real(body.weight_kg, 10, 350, "الوزن"),
    activity: ACTIVITIES.includes(body.activity) ? body.activity : "light",
    conditions: JSON.stringify([...new Set(conditions)]),
    allergies: text(body.allergies, 300),
    likes: text(body.likes, 300),
    dislikes: text(body.dislikes, 300),
    history: text(body.history, 1500),
    uses_insulin: body.uses_insulin ? 1 : 0,
    tresiba_titration: body.uses_insulin && body.tresiba_titration ? 1 : 0,
  };
}

const publicUser = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, role: u.role, is_admin: !!u.is_admin });

export async function onRequest({ request, env, params, waitUntil }) {
  const db = env.DB;
  if (!db) return json({ error: "قاعدة البيانات مو مربوطة (DB)" }, 500);
  const path = params.path || [];
  const method = request.method;
  const secure = new URL(request.url).protocol === "https:";
  const body = method === "POST" || method === "PUT" ? await request.json().catch(() => ({})) : {};
  const insert = (sql, ...args) => db.prepare(sql + " RETURNING *").bind(...args).first();

  try {
    const [a, b, c, d, e] = path;

    // ===== بدون تسجيل دخول =====
    if (a === "auth" && b === "login" && method === "POST") {
      const username = text(body.username, 30) || bad("اكتب اليوزر");
      const ip = request.headers.get("cf-connecting-ip") || "local";
      const key = `${username.toLowerCase()}|${ip}`;
      if (await tooManyAttempts(db, key)) bad("محاولات كثيرة غلط. جرّب بعد ربع ساعة.", 429);
      const user = await db.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
      if (!user || !(await verifyPassword(String(body.password || ""), user))) {
        await recordFailure(db, key);
        bad("اليوزر أو الباسوورد غلط", 401);
      }
      const { token, expires } = await createSession(db, user.id);
      return json({ ok: true }, 200, { "set-cookie": sessionCookie(token, expires, secure) });
    }

    if (a === "push" && b === "key" && method === "GET") {
      const row = await db.prepare("SELECT v FROM secrets WHERE k = 'vapid_public'").first();
      return json({ key: row?.v || null });
    }

    // المنبّه: يستدعيه Worker كل كم دقيقة
    if (a === "cron") {
      const row = await db.prepare("SELECT v FROM secrets WHERE k = 'cron_key'").first();
      const key = request.headers.get("x-cron-key") || new URL(request.url).searchParams.get("key");
      if (!row || key !== row.v) return json({ error: "غير مصرح" }, 401);
      return json({ ok: true, sent: await runReminders(db) });
    }

    // ===== لازم تسجيل دخول =====
    const me = await currentUser(db, request);
    if (!me) return json({ error: "سجّل دخولك" }, 401);

    if (a === "auth" && b === "logout" && method === "POST") {
      await endSession(db, request);
      return json({ ok: true }, 200, { "set-cookie": clearCookie(secure) });
    }

    if (a === "auth" && b === "me" && method === "GET") {
      const patients = (await db.prepare("SELECT * FROM patients WHERE family_id = ? AND archived = 0 ORDER BY id").bind(me.family_id).all()).results;
      return json({ user: publicUser(me), family: { id: me.family_id, name: me.family_name }, patients });
    }

    if (a === "auth" && b === "password" && method === "POST") {
      const user = await db.prepare("SELECT * FROM users WHERE id = ?").bind(me.id).first();
      if (!(await verifyPassword(String(body.old || ""), user))) bad("الباسوورد الحالي غلط");
      const next = String(body.new || "");
      if (next.length < 4) bad("الباسوورد الجديد لازم 4 حروف أو أكثر");
      const h = await hashPassword(next);
      await db.prepare("UPDATE users SET pass_salt = ?, pass_hash = ? WHERE id = ?").bind(h.salt, h.hash, me.id).run();
      return json({ ok: true });
    }

    // ===== أفراد العائلة =====
    if (a === "family" && b === "members") {
      if (method === "GET") {
        const rows = (await db.prepare("SELECT id, username, display_name, role, created_at, created_by FROM users WHERE family_id = ? ORDER BY id").bind(me.family_id).all()).results;
        return json(rows);
      }
      if (method === "POST") {
        const username = text(body.username, 30) || bad("اكتب اليوزر");
        if (!USERNAME_RE.test(username)) bad("اليوزر حروف وأرقام بس، من 3 إلى 30");
        const password = String(body.password || "");
        if (password.length < 4) bad("الباسوورد لازم 4 حروف أو أكثر");
        if (await db.prepare("SELECT 1 FROM users WHERE username = ?").bind(username).first()) bad("هاليوزر مأخوذ، اختر غيره");
        const h = await hashPassword(password);
        const row = await insert(
          "INSERT INTO users (family_id, username, display_name, pass_salt, pass_hash, role, created_by) VALUES (?, ?, ?, ?, ?, 'member', ?)",
          me.family_id, username, text(body.display_name, 40) || username, h.salt, h.hash, me.id,
        );
        return json(publicUser(row));
      }
      if (method === "DELETE" && c) {
        const target = await db.prepare("SELECT * FROM users WHERE id = ? AND family_id = ?").bind(Number(c), me.family_id).first();
        if (!target) bad("مو موجود", 404);
        if (target.id === me.id) bad("ما تقدر تحذف نفسك");
        if (target.role === "owner") bad("ما ينحذف صاحب الحساب");
        if (me.role !== "owner" && target.created_by !== me.id) bad("بس صاحب الحساب أو اللي أضافه يقدر يحذفه", 403);
        await db.batch([
          db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(target.id),
          db.prepare("DELETE FROM push_subs WHERE user_id = ?").bind(target.id),
          db.prepare("DELETE FROM users WHERE id = ?").bind(target.id),
        ]);
        return json({ ok: true });
      }
    }

    // ===== مدير الموقع: حسابات العائلات =====
    if (a === "admin") {
      if (!me.is_admin) bad("للمدير بس", 403);
      if (b === "families" && method === "GET") {
        const rows = (await db.prepare(
          `SELECT f.id, f.name, f.created_at,
            (SELECT count(*) FROM users u WHERE u.family_id = f.id) AS users,
            (SELECT count(*) FROM patients p WHERE p.family_id = f.id AND p.archived = 0) AS patients,
            (SELECT username FROM users u WHERE u.family_id = f.id AND u.role = 'owner' ORDER BY u.id LIMIT 1) AS owner
           FROM families f ORDER BY f.id`,
        ).all()).results;
        return json(rows);
      }
      if (b === "families" && method === "POST") {
        const name = text(body.name, 60) || bad("اكتب اسم العائلة");
        const username = text(body.username, 30) || bad("اكتب يوزر صاحب الحساب");
        if (!USERNAME_RE.test(username)) bad("اليوزر حروف وأرقام بس، من 3 إلى 30");
        const password = String(body.password || "");
        if (password.length < 3) bad("الباسوورد قصير");
        if (await db.prepare("SELECT 1 FROM users WHERE username = ?").bind(username).first()) bad("هاليوزر مأخوذ، اختر غيره");
        const fam = await insert("INSERT INTO families (name) VALUES (?)", name);
        const h = await hashPassword(password);
        await db.prepare("INSERT INTO users (family_id, username, display_name, pass_salt, pass_hash, role, created_by) VALUES (?, ?, ?, ?, ?, 'owner', ?)")
          .bind(fam.id, username, text(body.display_name, 40) || username, h.salt, h.hash, me.id).run();
        return json({ id: fam.id, name: fam.name, owner: username });
      }
    }

    // ===== المرضى =====
    if (a === "patients") {
      if (method === "POST" && !b) {
        const p = parseProfile(body);
        const cols = Object.keys(p);
        const row = await insert(
          `INSERT INTO patients (family_id, ${cols.join(", ")}, reminders) VALUES (?, ${placeholders(cols)}, ?)`,
          me.family_id, ...Object.values(p), defaultReminders(JSON.parse(p.conditions), p.uses_insulin),
        );
        return json(row);
      }
      if (method === "PUT" && b) {
        const existing = await db.prepare("SELECT * FROM patients WHERE id = ? AND family_id = ?").bind(Number(b), me.family_id).first();
        if (!existing) bad("المريض مو موجود", 404);
        const p = parseProfile(body);
        const sets = Object.keys(p).map((k) => `${k} = ?`).join(", ");
        await db.prepare(`UPDATE patients SET ${sets}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).bind(...Object.values(p), existing.id).run();
        return json(await db.prepare("SELECT * FROM patients WHERE id = ?").bind(existing.id).first());
      }
      if (method === "DELETE" && b) {
        await db.prepare("UPDATE patients SET archived = 1 WHERE id = ? AND family_id = ?").bind(Number(b), me.family_id).run();
        return json({ ok: true });
      }
    }

    // ===== الإشعارات (لأجهزة العائلة) =====
    if (a === "push") {
      if (b === "subscribe" && method === "POST") {
        const sub = body.subscription || {};
        const endpoint = typeof sub.endpoint === "string" && sub.endpoint.startsWith("https://") ? sub.endpoint : bad("اشتراك غير صحيح");
        const p256dh = text(sub.keys?.p256dh, 200) || bad("اشتراك غير صحيح");
        const auth = text(sub.keys?.auth, 100) || bad("اشتراك غير صحيح");
        const mode = body.mode === "alerts" ? "alerts" : "all";
        const row = await insert(
          `INSERT INTO push_subs (endpoint, p256dh, auth, name, mode, family_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, name = excluded.name,
             mode = excluded.mode, family_id = excluded.family_id, user_id = excluded.user_id`,
          endpoint, p256dh, auth, text(body.name, 40) || me.display_name, mode, me.family_id, me.id,
        );
        return json({ id: row.id, name: row.name, mode: row.mode });
      }
      if (b === "unsubscribe" && method === "POST") {
        await db.prepare("DELETE FROM push_subs WHERE id = ? AND family_id = ?").bind(Number(body.id), me.family_id).run();
        return json({ ok: true });
      }
      if (b === "devices" && method === "GET") {
        return json((await db.prepare("SELECT id, created_at, name, mode FROM push_subs WHERE family_id = ? ORDER BY created_at").bind(me.family_id).all()).results);
      }
      if (b === "test" && method === "POST") {
        const sub = await db.prepare("SELECT * FROM push_subs WHERE id = ? AND family_id = ?").bind(Number(body.id), me.family_id).first();
        if (!sub) bad("هالجهاز مو مشترك");
        const status = await sendPush(sub, { title: "✅ الإشعارات شغالة", body: "بيوصلك كل جديد عن عائلتك هنا.", tag: "test", url: "/" }, await loadVapid(db), { urgent: true });
        if (status >= 300) bad(`خدمة الإشعارات رجّعت ${status}`);
        return json({ ok: true });
      }
    }

    // ===== بيانات مريض: /api/p/:pid/... =====
    if (a === "p" && b) {
      const patient = await db.prepare("SELECT * FROM patients WHERE id = ? AND family_id = ? AND archived = 0").bind(Number(b), me.family_id).first();
      if (!patient) bad("المريض مو موجود", 404);
      return await patientRoute(c, d, patient, e);
    }

    return json({ error: "غير موجود" }, 404);

    // ===== مسارات المريض =====
    async function patientRoute(resource, id, patient, sub) {
      const pid = patient.id;
      const device = request.headers.get("x-device");
      // بعد أي تسجيل: إشعار فوري لباقي العائلة (الجهاز اللي سجّل ما يوصله)
      const created = (kind, row) => {
        const ev = eventMessage(kind, row, patient);
        if (ev) waitUntil(broadcast(db, patient.family_id, ev.msg, { alert: ev.alert, exclude: device }).catch(() => {}));
        return json(row);
      };
      const add = (table, cols, vals, at) => {
        const [c2, v2] = withAt([...cols, "patient_id"], [...vals, pid], at);
        return insert(`INSERT INTO ${table} (${c2.join(", ")}) VALUES (${placeholders(c2)})`, ...v2);
      };

      if (resource === "all" && method === "GET") {
        const q = (sql) => db.prepare(sql).bind(pid);
        const [readings, doses, changes, bp, medications, medDoses, appointments, notes, labs, meals, diet, advice] = await db.batch([
          q("SELECT * FROM readings WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1000"),
          q("SELECT * FROM doses WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1000"),
          q("SELECT * FROM tresiba_changes WHERE patient_id = ? ORDER BY created_at DESC LIMIT 100"),
          q("SELECT * FROM bp_readings WHERE patient_id = ? ORDER BY created_at DESC LIMIT 500"),
          q("SELECT * FROM medications WHERE patient_id = ? ORDER BY active DESC, name"),
          q("SELECT * FROM med_doses WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1000"),
          q("SELECT * FROM appointments WHERE patient_id = ? ORDER BY at DESC LIMIT 200"),
          q("SELECT * FROM notes WHERE patient_id = ? ORDER BY created_at DESC LIMIT 500"),
          q("SELECT * FROM labs WHERE patient_id = ? ORDER BY taken_on DESC LIMIT 200"),
          // الصور نفسها ما تنحمّل هنا، كل صورة لها رابط
          q("SELECT id, created_at, slot, followed, text, analysis, patient_id, user_id, photo IS NOT NULL AS has_photo FROM meals WHERE patient_id = ? ORDER BY created_at DESC LIMIT 500"),
          q("SELECT * FROM diet_plans WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1"),
          q("SELECT * FROM health_advice WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1"),
        ]);
        const plan = diet.results[0];
        return json({
          settings: patient,
          targets: computeTargets(patient),
          readings: readings.results,
          doses: doses.results,
          changes: changes.results,
          bp: bp.results,
          medications: medications.results.map((m) => ({ ...m, times: JSON.parse(m.times || "[]") })),
          medDoses: medDoses.results,
          appointments: appointments.results,
          notes: notes.results,
          labs: labs.results,
          meals: meals.results.map((m) => ({ ...m, analysis: m.analysis ? JSON.parse(m.analysis) : null })),
          advice: advice.results[0] ? { ...JSON.parse(advice.results[0].advice), created_at: advice.results[0].created_at, model: advice.results[0].model } : null,
          diet: plan ? { ...JSON.parse(plan.plan), created_at: plan.created_at, model: plan.model } : null,
        });
      }

      if (resource === "readings" && method === "POST") {
        const glucose = int(body.glucose, 10, 700, "قراءة السكر");
        const context = CONTEXTS.includes(body.context) ? body.context : "random";
        const lastMeal = context === "random" && TIME_RE.test(body.last_meal_at) ? body.last_meal_at : null;
        return created("readings", await add("readings", ["glucose", "context", "note", "last_meal_at", "user_id"], [glucose, context, text(body.note, 300), lastMeal, me.id], parseAt(body.at)));
      }

      if (resource === "doses" && method === "POST") {
        if (!patient.uses_insulin) bad("المريض ما عنده خطة إنسولين");
        const insulin = SLOTS[body.slot] || bad("جرعة غير معروفة");
        const key = body.slot === "bedtime" ? "tresiba_dose" : `humalog_${body.slot}`;
        let units = patient[key];
        if (body.units !== undefined && body.units !== null && body.units !== "") {
          units = Number(body.units);
          if (!(units >= 0.5 && units <= 100) || (units * 2) % 1 !== 0) bad("الكمية لازم تكون بين 0.5 و100 (بنص وحدة)");
        }
        if (!(units > 0)) bad("الجرعة في الخطة صفر. حدّث خطة العلاج أو اكتب الكمية.");
        return created("doses", await add("doses", ["insulin", "slot", "units", "planned_units", "user_id"], [insulin, body.slot, units, patient[key], me.id], parseAt(body.at)));
      }

      if (resource === "doses" && method === "PUT" && id) {
        const row = await db.prepare("SELECT * FROM doses WHERE id = ? AND patient_id = ?").bind(Number(id), pid).first();
        if (!row) bad("الجرعة مو موجودة", 404);
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
        return created("bp", await add("bp_readings", ["systolic", "diastolic", "pulse", "spo2", "note", "user_id"], [sys, dia, pulse, spo2, text(body.note, 300), me.id], parseAt(body.at)));
      }

      if (resource === "medications" && method === "POST") {
        const name = text(body.name, 80) || bad("اكتب اسم الدواء");
        return json(await add("medications", ["name", "dose", "times", "notes"], [name, text(body.dose, 80), parseTimes(body.times), text(body.notes, 300)]));
      }

      if (resource === "medications" && method === "PUT" && id) {
        const name = text(body.name, 80) || bad("اكتب اسم الدواء");
        await db.prepare("UPDATE medications SET name = ?, dose = ?, times = ?, notes = ?, active = ? WHERE id = ? AND patient_id = ?")
          .bind(name, text(body.dose, 80), parseTimes(body.times), text(body.notes, 300), body.active === false ? 0 : 1, Number(id), pid).run();
        return json({ ok: true });
      }

      if (resource === "med-doses" && method === "POST") {
        const med = await db.prepare("SELECT id FROM medications WHERE id = ? AND patient_id = ?").bind(Number(body.medication_id), pid).first();
        if (!med) bad("الدواء مو موجود");
        const slot = TIME_RE.test(body.time_slot) ? body.time_slot : bad("الموعد غير صحيح");
        return json(await add("med_doses", ["medication_id", "time_slot", "user_id"], [med.id, slot, me.id]));
      }

      if (resource === "appointments" && method === "POST") {
        const at = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(body.at) ? body.at : bad("اختر التاريخ والساعة");
        const title = text(body.title, 120) || bad("اكتب عنوان الموعد");
        const kind = KINDS.includes(body.kind) ? body.kind : "visit";
        return json(await add("appointments", ["at", "title", "kind", "place", "notes"], [at, title, kind, text(body.place, 120), text(body.notes, 500)]));
      }

      if (resource === "notes" && method === "POST") {
        const t = text(body.text, 1000) || bad("اكتب الملاحظة");
        return created("notes", await add("notes", ["text", "user_id"], [t, me.id]));
      }

      if (resource === "labs" && (method === "POST" || (method === "PUT" && id))) {
        const takenOn = DATE_RE.test(body.taken_on) ? body.taken_on : bad("اختر تاريخ التحليل");
        const test = LAB_TESTS.includes(body.test) ? body.test : "hba1c";
        const value = Number(body.value);
        if (!(value > 0 && value < 10000)) bad("النتيجة غير صحيحة");
        if (test === "hba1c" && !(value >= 3 && value <= 20)) bad("السكر التراكمي لازم يكون بين 3 و20");
        const unit = test === "hba1c" ? "%" : text(body.unit, 20);
        const notes = test === "other" ? (text(body.notes, 300) || bad("اكتب اسم التحليل")) : text(body.notes, 300);
        if (method === "POST") return json(await add("labs", ["taken_on", "test", "value", "unit", "notes"], [takenOn, test, value, unit, notes]));
        await db.prepare("UPDATE labs SET taken_on = ?, test = ?, value = ?, unit = ?, notes = ? WHERE id = ? AND patient_id = ?")
          .bind(takenOn, test, value, unit, notes, Number(id), pid).run();
        return json({ ok: true });
      }

      // تحليل صورة أكل (بدون حفظ): يقول وش فيها ويناسبه أو لا
      if (resource === "meals" && id === "analyze" && method === "POST") {
        const slot = MEAL_SLOTS.includes(body.slot) ? body.slot : null;
        const { analysis, model } = await analyzeMeal(env, db, patient, parsePhoto(body.photo), slot);
        return json({ ...analysis, model });
      }
      if (resource === "meals" && id && sub === "photo" && method === "GET") {
        const row = await db.prepare("SELECT photo FROM meals WHERE id = ? AND patient_id = ?").bind(Number(id), pid).first();
        return imageResponse(row?.photo);
      }
      // صورة أكلة من الحمية: /diet/image?day=السبت&meal=lunch
      if (resource === "diet" && id === "image" && method === "GET") {
        const qs = new URL(request.url).searchParams;
        const row = await db.prepare("SELECT plan FROM diet_plans WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1").bind(pid).first();
        const day = row && JSON.parse(row.plan).days?.find((x) => x.day === qs.get("day"));
        const items = DIET_MEALS.includes(qs.get("meal")) ? day?.[qs.get("meal")]?.items : null;
        if (!items) bad("الأكلة مو موجودة", 404);
        return imageResponse(await mealImage(env, db, items));
      }
      if (resource === "meals" && !id && method === "POST") {
        const slot = MEAL_SLOTS.includes(body.slot) ? body.slot : bad("الوجبة غير معروفة");
        const followed = body.followed === false ? 0 : 1;
        const t = text(body.text, 300);
        if (!followed && !t) bad("اكتب وش أكل");
        const photo = body.photo ? parsePhoto(body.photo) : null;
        const analysis = body.analysis && typeof body.analysis === "object" ? JSON.stringify(body.analysis).slice(0, 8000) : null;
        const { photo: _, ...row } = await add("meals", ["slot", "followed", "text", "user_id", "photo", "analysis"], [slot, followed, t, me.id, photo, analysis], parseAt(body.at));
        return created("meals", { ...row, has_photo: photo ? 1 : 0 });
      }

      // خطة العلاج والأهداف والتذكيرات
      if (resource === "plan" && method === "PUT") {
        const values = {};
        for (const k of PLAN_FIELDS) {
          const n = Number(body[k] ?? patient[k]);
          if (!(n >= 0 && n <= 700)) bad(`قيمة غير صحيحة: ${k}`);
          values[k] = n;
        }
        const reminders = parseReminders(body.reminders) ?? patient.reminders;
        const stmts = [
          db.prepare(`UPDATE patients SET reminders = ?, ${PLAN_FIELDS.map((k) => `${k} = ?`).join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`)
            .bind(reminders, ...PLAN_FIELDS.map((k) => values[k]), pid),
        ];
        if (values.tresiba_dose !== Number(patient.tresiba_dose)) {
          // أي تغيير في Tresiba ينحفظ في السجل، ويبدأ عدّ الأربعة أيام من جديد
          stmts.push(db.prepare("INSERT INTO tresiba_changes (old_dose, new_dose, reason, patient_id) VALUES (?, ?, ?, ?)")
            .bind(patient.tresiba_dose, values.tresiba_dose, text(body.reason, 200) || "تعديل يدوي", pid));
        }
        await db.batch(stmts);
        return json(await db.prepare("SELECT * FROM patients WHERE id = ?").bind(pid).first());
      }

      if (resource === "diet" && id === "generate" && method === "POST") {
        const { plan, model } = await generateDiet(env, db, patient);
        const row = await insert("INSERT INTO diet_plans (patient_id, plan, model, user_id) VALUES (?, ?, ?, ?)", pid, JSON.stringify(plan), model, me.id);
        return json({ ...plan, created_at: row.created_at, model });
      }

      if (resource === "advice" && id === "generate" && method === "POST") {
        const { advice, model } = await generateAdvice(env, db, patient);
        const row = await insert("INSERT INTO health_advice (patient_id, advice, model, user_id) VALUES (?, ?, ?, ?)", pid, JSON.stringify(advice), model, me.id);
        return json({ ...advice, created_at: row.created_at, model });
      }

      if (DELETABLE[resource] && method === "DELETE" && id) {
        await db.prepare(`DELETE FROM ${DELETABLE[resource]} WHERE id = ? AND patient_id = ?`).bind(Number(id), pid).run();
        return json({ ok: true });
      }

      return json({ error: "غير موجود" }, 404);
    }
  } catch (e) {
    return json({ error: e.message }, e instanceof HttpError ? e.status : 500);
  }
}
