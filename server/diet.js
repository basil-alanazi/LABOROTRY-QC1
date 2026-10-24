// الحمية بالذكاء الاصطناعي (Cloudflare Workers AI).
// الكود يحسب السعرات والأهداف، والذكاء الاصطناعي يختار الأكل، وبعدها الكود يفحص الحلال والممنوع.

const MODELS = ["@cf/google/gemma-4-26b-a4b-it", "@cf/zai-org/glm-4.7-flash"];
const MAX_TRIES = 3;
const DAYS = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
const MEALS = ["breakfast", "snack1", "lunch", "snack2", "dinner"];
export const CONDITIONS = {
  diabetes1: "سكري النوع الأول",
  diabetes2: "سكري النوع الثاني",
  prediabetes: "مقدمات السكري",
  hypertension: "ضغط الدم المرتفع",
  kidney: "أمراض الكلى",
  cholesterol: "ارتفاع الكوليسترول",
  heart: "أمراض القلب",
  gout: "النقرس",
  obesity: "السمنة",
  anemia: "فقر الدم",
  thyroid: "الغدة الدرقية",
  celiac: "حساسية القمح (السيلياك)",
};
const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 };

// كلمة عربية كاملة (مع ال/و/ب قبلها)، عشان "كبيرة" ما تنحسب "بيرة"
const AR = "\\u0600-\\u06FF";
const arWord = (term) => {
  const t = term.replace(/^(ال|بال|وال)/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![${AR}])(?:ال|بال|وال|و|ب|لل|فال)?${t}(?![${AR}])`);
};

// أي ذكر لهذي = الحمية مرفوضة (الحلال)
const HARAM = [
  ...["خنزير", "بيكون", "سلامي", "ببروني", "نبيذ", "كحول", "كحولي", "بيرة", "ويسكي", "فودكا", "ميرين", "ساكي", "جيلاتين"].map(arWord),
  /\bbacon\b/i, /\bpork\b/i, /\bham\b/i, /\bprosciutto\b/i, /\bpepperoni\b/i, /\bsalami\b/i,
  /\bwine\b/i, /\balcohol\b/i, /\bbeer\b/i, /\brum\b/i, /\bvodka\b/i, /\bmirin\b/i, /\bgelatin\b/i, /\blard\b/i,
];

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

// السعرات والأهداف من بيانات المريض (معادلة Mifflin-St Jeor)
export function computeTargets(p) {
  const conditions = JSON.parse(p.conditions || "[]");
  const has = (c) => conditions.includes(c);
  const diabetic = has("diabetes1") || has("diabetes2") || has("prediabetes");
  const w = num(p.weight_kg), h = num(p.height_cm);
  const age = p.birth_year ? new Date().getFullYear() - p.birth_year : null;
  let kcal = null, bmi = null, goal = "maintain";
  if (w && h && age) {
    const bmr = 10 * w + 6.25 * h - 5 * age + (p.sex === "female" ? -161 : 5);
    const tdee = bmr * (ACTIVITY[p.activity] || 1.375);
    bmi = w / (h / 100) ** 2;
    kcal = tdee;
    if (bmi >= 25 || has("obesity")) { kcal = tdee - 400; goal = "lose"; }
    else if (bmi < 18.5) { kcal = tdee + 300; goal = "gain"; }
    kcal = Math.max(kcal, p.sex === "female" ? 1200 : 1500);
    kcal = Math.round(kcal / 50) * 50;
  }
  const carbPct = diabetic ? 0.4 : 0.5;
  const proteinPerKg = has("kidney") ? 0.8 : 1.1;
  return {
    kcal,
    bmi: bmi ? Math.round(bmi * 10) / 10 : null,
    age,
    goal,
    carbs_g: kcal ? Math.round((kcal * carbPct) / 4) : null,
    protein_g: w ? Math.round(w * proteinPerKg) : null,
    sodium_mg: has("hypertension") || has("kidney") || has("heart") ? 2000 : 2300,
    diabetic,
    conditions,
  };
}

// ملخص قراءات آخر أسبوعين، عشان الحمية تبني على أرقامه الفعلية
export async function readingsSummary(db, patientId) {
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const [rd, bp, labs, meals, meds] = (await db.batch([
    db.prepare("SELECT glucose, context, note, created_at FROM readings WHERE patient_id = ? AND created_at >= ? ORDER BY created_at").bind(patientId, since),
    db.prepare("SELECT systolic, diastolic FROM bp_readings WHERE patient_id = ? AND created_at >= ? AND systolic IS NOT NULL").bind(patientId, since),
    db.prepare("SELECT test, value, unit, notes, taken_on FROM labs WHERE patient_id = ? ORDER BY taken_on DESC LIMIT 6").bind(patientId),
    db.prepare("SELECT slot, followed, text, created_at FROM meals WHERE patient_id = ? AND created_at >= ? AND followed = 0").bind(patientId, since),
    db.prepare("SELECT name, dose FROM medications WHERE patient_id = ? AND active = 1").bind(patientId),
  ])).map((r) => r.results);
  const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
  const fasting = rd.filter((r) => r.context === "fasting").map((r) => r.glucose);
  const post = rd.filter((r) => r.context.startsWith("after_")).map((r) => r.glucose);
  // قراءات عالية معها ملاحظة عن الأكل: أوضح مؤشر على الأكل اللي يرفع سكره
  const spikes = rd.filter((r) => r.glucose >= 250 && r.note).slice(-8).map((r) => `${r.glucose}: ${r.note}`);
  const offPlan = meals.slice(-8).map((m) => m.text).filter(Boolean);
  return {
    count: rd.length,
    fasting_avg: avg(fasting),
    after_meal_avg: avg(post),
    all_avg: avg(rd.map((r) => r.glucose)),
    highs: rd.filter((r) => r.glucose >= 250).length,
    lows: rd.filter((r) => r.glucose < 70).length,
    spikes,
    off_plan_meals: offPlan,
    bp_avg: bp.length ? `${avg(bp.map((b) => b.systolic))}/${avg(bp.map((b) => b.diastolic))}` : null,
    labs: labs.map((l) => `${l.test === "hba1c" ? "السكر التراكمي" : l.notes}: ${l.value}${l.unit || ""} (${l.taken_on})`),
    meds: meds.map((m) => `${m.name}${m.dose ? ` ${m.dose}` : ""}`),
  };
}

function buildPrompt(p, t, s) {
  const lines = [
    `المريض: ${p.name}، ${p.sex === "female" ? "أنثى" : "ذكر"}${t.age ? `، العمر ${t.age}` : ""}${p.height_cm ? `، الطول ${p.height_cm} سم` : ""}${p.weight_kg ? `، الوزن ${p.weight_kg} كغ` : ""}${t.bmi ? ` (BMI ${t.bmi})` : ""}.`,
    `الأمراض: ${t.conditions.map((c) => CONDITIONS[c] || c).join("، ") || "لا يوجد"}.`,
    p.history ? `التاريخ المرضي: ${p.history}` : "",
    p.allergies ? `حساسية (ممنوع نهائيًا): ${p.allergies}` : "",
    p.dislikes ? `أكل ما ياكله (لا تذكره أبدًا): ${p.dislikes}` : "",
    p.likes ? `أكل يحبه (استخدمه إذا كان صحي): ${p.likes}` : "",
    t.kcal ? `السعرات اليومية المستهدفة: ${t.kcal} سعرة (${t.goal === "lose" ? "تنزيل وزن تدريجي" : t.goal === "gain" ? "زيادة وزن" : "ثبات الوزن"}). الكارب: حوالي ${t.carbs_g} جرام باليوم. البروتين: حوالي ${t.protein_g} جرام.` : "السعرات غير محسوبة (ناقص الطول أو الوزن أو العمر): خلها معتدلة حوالي 1800 سعرة.",
    `الصوديوم: أقل من ${t.sodium_mg} ملغ باليوم.`,
    p.uses_insulin ? `يأخذ إنسولين سريع بجرعات ثابتة قبل الفطور والغداء والعشاء: لازم كمية الكارب في كل وجبة رئيسية تكون متقاربة كل يوم، والعشاء أخف من الغداء.` : "",
    s.meds.length ? `أدويته: ${s.meds.join("، ")}.` : "",
    s.count ? `قراءات السكر آخر أسبوعين (${s.count} قراءة): متوسط الصيام ${s.fasting_avg ?? "—"}، متوسط بعد الأكل ${s.after_meal_avg ?? "—"}، المتوسط العام ${s.all_avg ?? "—"}، قراءات فوق 250: ${s.highs}، هبوط تحت 70: ${s.lows}.` : "",
    s.spikes.length ? `قراءات عالية مع وش أكل قبلها:\n- ${s.spikes.join("\n- ")}` : "",
    s.off_plan_meals.length ? `أكلات أكلها برا الخطة: ${s.off_plan_meals.join("، ")}.` : "",
    s.bp_avg ? `متوسط الضغط: ${s.bp_avg}.` : "",
    s.labs.length ? `التحاليل: ${s.labs.join("، ")}.` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

const SYSTEM = `أنت أخصائي تغذية علاجية للعائلات السعودية. تسوي جدول أكل أسبوعي صحي حسب حالة المريض وقراءاته.
قواعد لازمة:
- الأكل حلال 100%: ممنوع الخنزير ومشتقاته والكحول بكل أنواعه والجيلاتين.
- لا تذكر أي أكل من الحساسية أو اللي ما ياكله، ولا حتى كبديل.
- أكلات سعودية وخليجية مألوفة ومتوفرة، بكميات منزلية واضحة (رغيف، ملعقة، كوب، حبة).
- لا تغيّر ولا تقترح أي جرعة دواء أو إنسولين. التغذية بس.
- إذا القراءات عالية بعد أكلة معينة، قلّلها أو بدّلها واذكر السبب في why.
- اكتب بالعربي السعودي البسيط.
رجّع JSON بس، بدون أي كلام قبله أو بعده، بهالشكل بالضبط:
{"summary":"سطرين عن فكرة الحمية","why":["سبب مربوط بقراءاته أو حالته"],"days":[{"day":"السبت","breakfast":{"items":"...","kcal":0,"carbs":0},"snack1":{"items":"...","kcal":0,"carbs":0},"lunch":{"items":"...","kcal":0,"carbs":0},"snack2":{"items":"...","kcal":0,"carbs":0},"dinner":{"items":"...","kcal":0,"carbs":0}}],"avoid":["أكل يتجنبه"],"tips":["نصيحة"],"shopping":["مقاضي الأسبوع"]}
الأيام سبعة بالترتيب: ${DAYS.join("، ")}.`;

function extractJson(text) {
  if (typeof text === "object" && text) return text;
  const s = String(text || "");
  const start = s.indexOf("{"), end = s.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("الرد ما فيه JSON");
  return JSON.parse(s.slice(start, end + 1));
}

// يرجع قائمة المشاكل (فاضية = الحمية سليمة)
export function validatePlan(plan, p) {
  const problems = [];
  if (!Array.isArray(plan.days) || plan.days.length !== 7) problems.push("لازم سبعة أيام");
  for (const d of plan.days || []) {
    for (const m of MEALS) {
      if (!d[m] || typeof d[m].items !== "string" || !d[m].items.trim()) problems.push(`${d.day || "يوم"}: ناقص ${m}`);
    }
  }
  const all = JSON.stringify(plan);
  for (const re of HARAM) {
    const m = all.match(re);
    if (m) problems.push(`فيه شي غير حلال: "${m[0]}"`);
  }
  const banned = [p.allergies, p.dislikes].filter(Boolean).join("،").split(/[،,\n]|\sو(?=\S)/).map((x) => x.trim()).filter((x) => x.length >= 2);
  const daysText = JSON.stringify(plan.days || []);
  for (const b of banned) if (arWord(b).test(daysText)) problems.push(`ذكر "${b}" وهو ممنوع عنده`);
  return problems;
}

async function callModel(env, messages) {
  if (env.MOCK_AI === "1") return { text: mockPlan(), model: "mock" };
  if (!env.AI) throw new Error("الذكاء الاصطناعي مو مربوط (AI binding)");
  let lastErr;
  for (const model of MODELS) {
    try {
      const res = await env.AI.run(model, { messages, max_tokens: 6000, temperature: 0.4 });
      const text = res?.response ?? res?.choices?.[0]?.message?.content ?? res;
      return { text, model };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("ما قدرنا نوصل للذكاء الاصطناعي");
}

export async function generateDiet(env, db, patient) {
  const targets = computeTargets(patient);
  const summary = await readingsSummary(db, patient.id);
  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: buildPrompt(patient, targets, summary) },
  ];
  let lastProblems = [];
  for (let i = 0; i < MAX_TRIES; i++) {
    const { text, model } = await callModel(env, messages);
    let plan;
    try {
      plan = extractJson(text);
    } catch {
      lastProblems = ["الرد ما كان JSON صحيح"];
      messages.push({ role: "assistant", content: String(text).slice(0, 4000) }, { role: "user", content: "رجّع JSON صحيح بس، بنفس الشكل المطلوب." });
      continue;
    }
    const problems = validatePlan(plan, patient);
    if (!problems.length) {
      plan.days = DAYS.map((name, idx) => ({ ...(plan.days.find((d) => d.day === name) || plan.days[idx]), day: name }));
      return { plan: { ...plan, targets, readings: summary }, model };
    }
    lastProblems = problems;
    messages.push({ role: "assistant", content: JSON.stringify(plan).slice(0, 6000) }, { role: "user", content: `فيه مشاكل لازم تصلحها: ${problems.join("؛ ")}. رجّع الجدول كامل JSON من جديد.` });
  }
  throw new Error(`ما طلعت حمية سليمة بعد ${MAX_TRIES} محاولات: ${lastProblems.slice(0, 3).join("؛ ")}`);
}

// للتجربة المحلية بدون ذكاء اصطناعي
function mockPlan() {
  const meal = (items, kcal, carbs) => ({ items, kcal, carbs });
  return JSON.stringify({
    summary: "حمية قليلة الكارب ومتوازنة، والكميات ثابتة كل يوم عشان تمشي مع جرعات الإنسولين.",
    why: ["سكر الصيام متوسطه عالي، فخففنا الخبز في العشاء", "الضغط فوق 140، فالحمية قليلة الملح"],
    days: DAYS.map((day) => ({
      day,
      breakfast: meal("بيضتين مسلوقة + نص رغيف بر + خيار وطماطم", 380, 35),
      snack1: meal("تفاحة صغيرة", 80, 20),
      lunch: meal("دجاج مشوي + سلطة كبيرة + 3 ملاعق برغل", 550, 45),
      snack2: meal("زبادي قليل الدسم", 100, 10),
      dinner: meal("شوربة عدس + خيار", 300, 30),
    })),
    avoid: ["العصيرات", "الخبز الأبيض", "الحلويات"],
    tips: ["امشِ 15 دقيقة بعد الغداء", "اشرب مويه كفاية"],
    shopping: ["بيض", "دجاج", "برغل", "عدس", "خيار", "طماطم", "زبادي"],
  });
}
