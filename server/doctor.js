// ===== حساب الدكتور: ملخص كل مريض يتابعه =====
const riyadh = (d) => new Date(new Date(d).getTime() + 3 * 36e5);
const dayKey = (d) => riyadh(d).toISOString().slice(0, 10);
// جرعة بعد نص الليل تنحسب على اليوم اللي قبله
const doseDay = (d) => dayKey(new Date(new Date(d).getTime() - 4 * 36e5));
const DAYS = 14;
const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);

// المرضى اللي يقدر يشوفهم المستخدم: عائلته، والعائلات اللي يتابعها لو كان دكتور
export const access = (t = "") => `(${t}family_id = ? OR ${t}family_id IN (SELECT df.family_id FROM doctor_families df WHERE df.doctor_id = ?))`;

// هل القراءة ضمن الهدف حسب وقتها
function inTarget(r, p) {
  if (r.context === "fasting") return r.glucose >= p.fasting_low && r.glucose <= p.fasting_high;
  if (r.context.startsWith("after_")) return r.glucose >= p.post_low && r.glucose <= p.post_high;
  return r.glucose >= p.low_threshold && r.glucose <= p.post_high;
}

// الأيام الكاملة اللي ننحسب فيها الالتزام: آخر 14 يوم قبل اليوم، ومن أول يوم بدأ يسجل
function adherenceDays(first, now) {
  const today = dayKey(now);
  const days = [];
  for (let i = DAYS; i >= 1; i--) {
    const k = dayKey(new Date(now.getTime() - i * 864e5));
    if (first && k >= first && k < today) days.push(k);
  }
  return days;
}

export async function patientSummary(db, p, now = new Date()) {
  const since = new Date(now.getTime() - (DAYS + 1) * 864e5).toISOString();
  const q = (sql) => db.prepare(sql).bind(p.id, since);
  const [readings, doses, bp, meds, medDoses, first, notes] = (await db.batch([
    q("SELECT glucose, context, created_at FROM readings WHERE patient_id = ? AND created_at >= ?"),
    q("SELECT slot, units, planned_units, created_at FROM doses WHERE patient_id = ? AND created_at >= ?"),
    q("SELECT systolic, diastolic, created_at FROM bp_readings WHERE patient_id = ? AND created_at >= ?"),
    db.prepare("SELECT id, times, weekdays, created_at FROM medications WHERE patient_id = ? AND active = 1").bind(p.id),
    q("SELECT medication_id, time_slot, created_at FROM med_doses WHERE patient_id = ? AND created_at >= ?"),
    db.prepare(`SELECT min(t) AS t FROM (SELECT min(created_at) t FROM readings WHERE patient_id = ?1
      UNION ALL SELECT min(created_at) FROM doses WHERE patient_id = ?1 UNION ALL SELECT min(created_at) FROM med_doses WHERE patient_id = ?1)`).bind(p.id),
    db.prepare("SELECT text, created_at, from_doctor FROM doctor_notes WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1").bind(p.id),
  ])).map((r) => r.results);
  // آخر ملاحظة من العائلة ما رد عليها الدكتور
  const familyNote = notes[0] && !notes[0].from_doctor ? notes[0] : null;
  const start = first[0]?.t ? dayKey(first[0].t) : null;
  const days = adherenceDays(start, now);
  const daySet = new Set(days);
  const rs = readings.filter((r) => new Date(r.created_at) >= new Date(now.getTime() - DAYS * 864e5));

  // الإنسولين: كل جرعة في الخطة لكل يوم
  const planSlots = p.uses_insulin
    ? [["breakfast", p.humalog_breakfast], ["lunch", p.humalog_lunch], ["dinner", p.humalog_dinner], ["bedtime", p.tresiba_dose]].filter(([, u]) => u > 0).map(([s]) => s)
    : [];
  const taken = new Set(doses.map((d) => `${doseDay(d.created_at)}|${d.slot}`));
  const insulinExpected = planSlots.length * days.length;
  const insulinTaken = days.reduce((n, k) => n + planSlots.filter((s) => taken.has(`${k}|${s}`)).length, 0);
  const missed = days.flatMap((k) => planSlots.filter((s) => !taken.has(`${k}|${s}`)).map((s) => ({ day: k, slot: s })));

  // الأدوية: كل وقت لكل دواء في أيامه
  const medTaken = new Set(medDoses.map((d) => `${dayKey(d.created_at)}|${d.medication_id}|${d.time_slot}`));
  let medExpected = 0, medDone = 0;
  for (const m of meds) {
    const times = JSON.parse(m.times || "[]");
    const wd = m.weekdays ? JSON.parse(m.weekdays) : null;
    const from = dayKey(m.created_at);
    for (const k of days) {
      if (k < from) continue;
      if (wd && !wd.includes(new Date(`${k}T12:00:00Z`).getUTCDay())) continue;
      for (const t of times) { medExpected++; if (medTaken.has(`${k}|${m.id}|${t}`)) medDone++; }
    }
  }

  const bs = bp.filter((b) => b.systolic && new Date(b.created_at) >= new Date(now.getTime() - DAYS * 864e5));
  const last = [...readings, ...doses, ...bp, ...medDoses].map((x) => x.created_at).sort().pop() || null;
  const lows = rs.filter((r) => r.glucose < p.low_threshold).length;
  const veryHigh = rs.filter((r) => r.glucose >= 300).length;
  const fasting = rs.filter((r) => r.context === "fasting").map((r) => r.glucose);
  const insulinPct = pct(insulinTaken, insulinExpected);
  const medPct = pct(medDone, medExpected);
  const bpAvg = bs.length ? [avg(bs.map((b) => b.systolic)), avg(bs.map((b) => b.diastolic))] : null;

  // تنبيهات للدكتور، الأهم أول
  const flags = [];
  if (familyNote) flags.push({ level: "info", text: "💬 ملاحظة جديدة من العائلة" });
  if (lows) flags.push({ level: "danger", text: `${lows} هبوط` });
  if (veryHigh) flags.push({ level: "danger", text: `${veryHigh} قراءة فوق 300` });
  if (insulinPct !== null && insulinPct < 80) flags.push({ level: "warn", text: `فوّت ${missed.length} جرعة إنسولين` });
  if (medPct !== null && medPct < 80) flags.push({ level: "warn", text: `التزام الأدوية ${medPct}%` });
  if (bpAvg && (bpAvg[0] >= p.bp_sys_high || bpAvg[1] >= p.bp_dia_high)) flags.push({ level: "warn", text: `الضغط عالي ${bpAvg.join("/")}` });
  const quietDays = last ? Math.floor((now - new Date(last)) / 864e5) : null;
  if (quietDays === null || quietDays >= 3) flags.push({ level: "warn", text: quietDays === null ? "ما سجّل شي للحين" : `ما سجّل من ${quietDays} أيام` });

  return {
    days: DAYS,
    last,
    readings: rs.length,
    glucoseAvg: avg(rs.map((r) => r.glucose)),
    fastingAvg: avg(fasting),
    inTarget: pct(rs.filter((r) => inTarget(r, p)).length, rs.length),
    lows,
    veryHigh,
    bpAvg: bpAvg ? bpAvg.join("/") : null,
    bpCount: bs.length,
    insulin: insulinExpected ? { pct: insulinPct, taken: insulinTaken, expected: insulinExpected, missed: missed.slice(-6) } : null,
    meds: medExpected ? { pct: medPct, taken: medDone, expected: medExpected } : null,
    familyNote,
    flags,
    score: flags.reduce((n, f) => n + (f.level === "danger" ? 10 : 1), 0),
  };
}
