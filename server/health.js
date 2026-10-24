// الذكاء الاصطناعي: تحليل صور الأكل، ونصائح الأمراض المزمنة
import { CONDITIONS, HARAM, arWord, callModel, computeTargets, extractJson, readingsSummary } from "./diet.js";

// موديلات تشوف الصور
const VISION_MODELS = ["@cf/google/gemma-4-26b-a4b-it", "@cf/meta/llama-4-scout-17b-16e-instruct"];
const VERDICTS = ["good", "ok", "careful", "avoid"];
const MAX_TRIES = 2;

function patientLines(p, t) {
  return [
    `المريض: ${p.name}، ${p.sex === "female" ? "أنثى" : "ذكر"}${t.age ? `، العمر ${t.age}` : ""}${p.weight_kg ? `، الوزن ${p.weight_kg} كغ` : ""}${t.bmi ? ` (BMI ${t.bmi})` : ""}.`,
    `الأمراض: ${t.conditions.map((c) => CONDITIONS[c] || c).join("، ") || "لا يوجد"}.`,
    p.history ? `التاريخ المرضي: ${p.history}` : "",
    p.allergies ? `حساسية: ${p.allergies}` : "",
    p.dislikes ? `أكل ما ياكله: ${p.dislikes}` : "",
    p.uses_insulin ? "يأخذ إنسولين بجرعات ثابتة قبل الوجبات." : "",
  ];
}

// الكلمات الممنوعة عنده (حساسية + ما ياكله)
const bannedWords = (p) => [p.allergies, p.dislikes].filter(Boolean).join("،").split(/[،,\n]|\sو(?=\S)/).map((x) => x.trim()).filter((x) => x.length >= 2);

// ===== صورة الأكل =====
const MEAL_SYSTEM = `أنت أخصائي تغذية علاجية سعودي. يوصلك صورة أكل لمريض، وتقول وش فيها وكيف تأثر على حالته.
قواعد:
- تعرّف على الأكل اللي في الصورة وقدّر الكمية بمقاييس منزلية (صحن، ملعقة، رغيف، حبة).
- قدّر السعرات والكارب بالجرام للكمية اللي في الصورة.
- الحلال: إذا شكّيت إن فيه خنزير أو كحول أو جيلاتين حيواني قل "doubt" أو "no" مع السبب. غير كذا "ok".
- لا تغيّر ولا تقترح أي جرعة دواء أو إنسولين.
- إذا الصورة مو أكل رجّع is_food=false.
- اكتب بالعربي السعودي البسيط وباختصار.
رجّع JSON بس بهالشكل:
{"is_food":true,"items":[{"name":"اسم الأكلة","amount":"الكمية"}],"kcal":0,"carbs":0,"halal":"ok","halal_note":"","verdict":"good|ok|careful|avoid","verdict_text":"جملة وحدة: مناسب له أو لا وليش","sugar_effect":"كيف بيأثر على سكره أو ضغطه","tips":["نصيحة قصيرة عن هالوجبة بالذات"],"swap":"بديل أصح إذا يحتاج"}`;

export async function analyzeMeal(env, db, patient, image, slot) {
  const t = computeTargets(patient);
  const s = await readingsSummary(db, patient.id);
  const context = [
    ...patientLines(patient, t),
    s.count ? `متوسط سكره آخر أسبوعين: ${s.all_avg}، الصيام ${s.fasting_avg ?? "—"}، بعد الأكل ${s.after_meal_avg ?? "—"}.` : "",
    s.bp_avg ? `متوسط ضغطه: ${s.bp_avg}.` : "",
    t.carbs_g ? `الكارب المستهدف باليوم: حوالي ${t.carbs_g} جرام.` : "",
    slot ? `الوجبة: ${{ breakfast: "فطور", lunch: "غداء", dinner: "عشاء", snack: "سناك" }[slot]}.` : "",
    "حلل الصورة.",
  ].filter(Boolean).join("\n");
  const messages = [
    { role: "system", content: MEAL_SYSTEM },
    { role: "user", content: [{ type: "text", text: context }, { type: "image_url", image_url: { url: image } }] },
  ];
  let lastErr;
  for (let i = 0; i < MAX_TRIES; i++) {
    const { text, model } = await callModel(env, messages, { models: VISION_MODELS, mock: mockMeal, maxTokens: 1500 });
    try {
      return { analysis: cleanMeal(extractJson(text), patient), model };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error("ما قدر الذكاء الاصطناعي يقرا الصورة، جرّب صورة أوضح. " + (lastErr?.message || ""));
}

function cleanMeal(a, p) {
  if (!a || typeof a !== "object") throw new Error("رد غير مفهوم");
  const str = (v, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const n = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : null);
  const out = {
    is_food: a.is_food !== false,
    items: (Array.isArray(a.items) ? a.items : []).slice(0, 12).map((x) => ({ name: str(x?.name, 60), amount: str(x?.amount, 60) })).filter((x) => x.name),
    kcal: n(a.kcal),
    carbs: n(a.carbs),
    halal: ["ok", "doubt", "no"].includes(a.halal) ? a.halal : "ok",
    halal_note: str(a.halal_note),
    verdict: VERDICTS.includes(a.verdict) ? a.verdict : "ok",
    verdict_text: str(a.verdict_text),
    sugar_effect: str(a.sugar_effect),
    tips: (Array.isArray(a.tips) ? a.tips : []).map((x) => str(x, 200)).filter(Boolean).slice(0, 4),
    swap: str(a.swap),
    warnings: [],
  };
  if (out.is_food && !out.items.length) throw new Error("ما تعرّف على الأكل");
  // فحص الكود نفسه، ما نعتمد على الموديل بس
  const names = out.items.map((x) => x.name).join("، ");
  for (const re of HARAM) {
    const m = names.match(re);
    if (m) { out.halal = "no"; out.warnings.push(`فيه "${m[0]}" وهو غير حلال`); }
  }
  for (const b of bannedWords(p)) {
    if (arWord(b).test(names)) { out.warnings.push(`فيه "${b}" وهو مسجّل إنه ما ياكله أو عنده حساسية منه`); out.verdict = "avoid"; }
  }
  if (out.halal === "no") out.verdict = "avoid";
  return out;
}

// ===== نصائح الأمراض المزمنة =====
const ADVICE_SYSTEM = `أنت طبيب أسرة سعودي تكتب لعائلة مريض نصائح عملية عن أمراضه المزمنة، مبنية على قراءاته وملاحظاتهم.
قواعد لازمة:
- لا تغيّر ولا تقترح أي جرعة دواء أو إنسولين، ولا توقف دواء. أي شي يخص الدواء: "اسألوا الدكتور".
- لا تشخّص. إذا لاحظت شي في القراءات أو الملاحظات أو التاريخ المرضي يدل على مرض مو مسجّل أو مضاعفة، حطه في noticed بصيغة "يستاهل تسألون الدكتور عن...".
- تعرّف على الأمراض من القائمة ومن التاريخ المرضي المكتوب، وحط لكل مرض بطاقة.
- علامات الخطر (warning_signs) لازم تكون واضحة: متى يروحون الطوارئ فورًا.
- الأكل حلال، وأكلات سعودية مألوفة.
- اكتب بالعربي السعودي البسيط، وجمل قصيرة.
رجّع JSON بس بهالشكل:
{"overview":"سطرين عن وضعه العام من الأرقام","conditions":[{"name":"اسم المرض","status":"وضعه الحالي من قراءاته","do":["سوّوا"],"avoid":["تجنبوا"],"warning_signs":["روحوا الطوارئ إذا..."],"ask_doctor":["سؤال للدكتور بالزيارة الجاية"]}],"noticed":[{"title":"شي لاحظته","detail":"ليش ووش تسوون"}],"daily":["عادة يومية تساعده"]}`;

async function adviceContext(db, patient) {
  const t = computeTargets(patient);
  const s = await readingsSummary(db, patient.id);
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [notes, bp] = (await db.batch([
    db.prepare("SELECT text, created_at FROM notes WHERE patient_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 15").bind(patient.id, since),
    db.prepare("SELECT systolic, diastolic, pulse, spo2 FROM bp_readings WHERE patient_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 30").bind(patient.id, since),
  ])).map((r) => r.results);
  const pulses = bp.map((b) => b.pulse).filter(Boolean);
  const spo2 = bp.map((b) => b.spo2).filter(Boolean);
  return [
    ...patientLines(patient, t),
    s.meds.length ? `أدويته: ${s.meds.join("، ")}.` : "",
    s.count ? `السكر آخر أسبوعين (${s.count} قراءة): متوسط الصيام ${s.fasting_avg ?? "—"} (الهدف ${patient.fasting_low}–${patient.fasting_high})، بعد الأكل ${s.after_meal_avg ?? "—"} (الهدف ${patient.post_low}–${patient.post_high})، فوق 250: ${s.highs} مرة، هبوط تحت 70: ${s.lows} مرة.` : "ما فيه قراءات سكر آخر أسبوعين.",
    s.spikes.length ? `قراءات عالية مع ملاحظاتها:\n- ${s.spikes.join("\n- ")}` : "",
    s.bp_avg ? `متوسط الضغط: ${s.bp_avg} (الحد ${patient.bp_sys_high}/${patient.bp_dia_high}).` : "",
    pulses.length ? `النبض: من ${Math.min(...pulses)} إلى ${Math.max(...pulses)}.` : "",
    spo2.length ? `الأكسجين: أقل قراءة ${Math.min(...spo2)}%.` : "",
    s.labs.length ? `التحاليل: ${s.labs.join("، ")}.` : "",
    notes.length ? `ملاحظات العائلة آخر شهر:\n- ${notes.map((n) => n.text).join("\n- ")}` : "",
  ].filter(Boolean).join("\n");
}

export async function generateAdvice(env, db, patient) {
  const messages = [
    { role: "system", content: ADVICE_SYSTEM },
    { role: "user", content: await adviceContext(db, patient) },
  ];
  let lastErr;
  for (let i = 0; i < MAX_TRIES; i++) {
    const { text, model } = await callModel(env, messages, { mock: mockAdvice, maxTokens: 4000 });
    try {
      return { advice: cleanAdvice(extractJson(text)), model };
    } catch (e) {
      lastErr = e;
      messages.push({ role: "assistant", content: String(text).slice(0, 3000) }, { role: "user", content: "رجّع JSON صحيح بس، بنفس الشكل المطلوب." });
    }
  }
  throw new Error("ما طلعت النصائح: " + (lastErr?.message || ""));
}

function cleanAdvice(a) {
  const str = (v, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const list = (v, n = 8) => (Array.isArray(v) ? v : []).map((x) => str(x, 250)).filter(Boolean).slice(0, n);
  const out = {
    overview: str(a?.overview, 600),
    conditions: (Array.isArray(a?.conditions) ? a.conditions : []).slice(0, 8).map((c) => ({
      name: str(c?.name, 60), status: str(c?.status), do: list(c?.do), avoid: list(c?.avoid), warning_signs: list(c?.warning_signs), ask_doctor: list(c?.ask_doctor, 5),
    })).filter((c) => c.name),
    noticed: (Array.isArray(a?.noticed) ? a.noticed : []).slice(0, 6).map((x) => ({ title: str(x?.title, 100), detail: str(x?.detail) })).filter((x) => x.title),
    daily: list(a?.daily),
  };
  if (!out.conditions.length && !out.overview) throw new Error("الرد فاضي");
  // "تجنبوا ..." عادي، بس اللي ينصح فيه لازم حلال
  const recommended = JSON.stringify([out.daily, out.conditions.map((c) => c.do)]);
  for (const re of HARAM) if (re.test(recommended)) throw new Error("فيه شي غير حلال");
  return out;
}

// ===== للتجربة المحلية =====
function mockMeal() {
  return JSON.stringify({
    is_food: true,
    items: [{ name: "دجاج مشوي", amount: "ربع دجاجة" }, { name: "سلطة خضار", amount: "صحن صغير" }, { name: "خبز بر", amount: "نص رغيف" }],
    kcal: 520, carbs: 38, halal: "ok", halal_note: "",
    verdict: "good", verdict_text: "وجبة مناسبة له: بروتين عالي وكارب معتدل.",
    sugar_effect: "ارتفاع خفيف ومتوقع بعد ساعتين، خصوصًا من الخبز.",
    tips: ["خلوه ياكل السلطة أول", "امشوا معه ١٠ دقايق بعد الأكل"],
    swap: "",
  });
}

function mockAdvice() {
  return JSON.stringify({
    overview: "السكر أعلى من الهدف أغلب الوقت، والضغط على الحد. التراكمي ١١٪ يعني يحتاج متابعة لصيقة مع الدكتور.",
    conditions: [
      { name: "سكري النوع الثاني", status: "متوسط الصيام فوق ٢٠٠ وفيه قراءات فوق ٤٠٠", do: ["قيسوا الصيام كل يوم", "وجبات بمواعيد ثابتة"], avoid: ["العصيرات والتمر الكثير", "السهر والأكل المتأخر"], warning_signs: ["سكر فوق ٤٠٠ مع دوخة أو استفراغ: طوارئ", "سكر تحت ٧٠ وما تحسّن بعد العلاج: طوارئ"], ask_doctor: ["هل يحتاج نعدل خطة الإنسولين؟"] },
      { name: "ضغط الدم المرتفع", status: "المتوسط حوالي ١٤٥/٨٨", do: ["قيسوه الصبح والمسا", "قللوا الملح"], avoid: ["المخللات والشوربات الجاهزة"], warning_signs: ["ضغط فوق ١٨٠ مع صداع قوي أو ألم صدر: طوارئ"], ask_doctor: ["هل جرعة دواء الضغط كافية؟"] },
    ],
    noticed: [{ title: "ألم العين مع السكر العالي", detail: "يستاهل تسألون الدكتور عن فحص قاع العين." }],
    daily: ["مشي ١٥ دقيقة بعد الغداء", "مويه كفاية", "تفقدوا قدميه كل يوم"],
  });
}
