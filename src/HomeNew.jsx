import { useEffect, useState } from "react";
import {
  Activity, Bell, CalendarDays, ChevronDown, ChevronLeft, Droplet, FlaskConical,
  HeartPulse, NotebookPen, Pill, SlidersHorizontal, Sparkles, Syringe, Utensils,
} from "lucide-react";
import { DishImage, todayDiet } from "./Diet";
import { getDevice } from "./push";
import { CONTEXTS, SLOTS, apptDate, medDueToday, medSupply, dayKey, fmtSlot, fmtTime, glucoseLevel, recentLow, relativeDays } from "./dose";
import { VERSE } from "./Verse";
import { isIOS, standalone } from "./InstallCard";
import "./homeNew.css";

const DOSE_TIMES = { breakfast: "07:15", lunch: "13:00", dinner: "20:00", bedtime: "23:00" };
const doseDay = (d) => dayKey(new Date(d).getTime() - 4 * 36e5);
const hhmmNow = () => new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", hour12: false });
const LEVEL_TEXT = { ok: "في الهدف", high: "أعلى من الهدف", veryhigh: "مرتفع جدًا", below: "أقل من الهدف", low: "هبوط" };
const greeting = () => { const h = Number(hhmmNow().slice(0, 2)); return h < 12 ? "صباح الخير" : "مساء الخير"; };

function untilText(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const [nh, nm] = hhmmNow().split(":").map(Number);
  let mins = h * 60 + m - (nh * 60 + nm);
  if (mins <= 0) return "وقتها الحين";
  if (mins < 60) return `بعد ${mins} دقيقة`;
  const hrs = Math.round(mins / 60);
  return hrs === 1 ? "بعد ساعة" : hrs === 2 ? "بعد ساعتين" : `بعد ${hrs} ساعات`;
}

// كل الأرقام اللي تحتاجها التصاميم الثلاثة
function useModel({ settings, readings, doses, bp, medications, medDoses, appointments, labs, diet }) {
  const s = settings;
  const last = readings[0];
  const level = last ? glucoseLevel(last.glucose, last.context, s) : null;
  const target = last && s ? (["fasting", "before_lunch", "before_dinner"].includes(last.context) ? `${s.fasting_low}–${s.fasting_high}` : `${s.post_low}–${s.post_high}`) : "";
  const spark = readings.slice(0, 7).reverse().map((r) => r.glucose);
  const week = readings.filter((r) => Date.now() - new Date(r.created_at) < 7 * 864e5);
  const inRange = week.length ? Math.round((week.filter((r) => glucoseLevel(r.glucose, r.context, s) === "ok").length / week.length) * 100) : null;
  const lastBp = bp.find((b) => b.systolic);
  const lastA1c = [...labs].filter((l) => l.test === "hba1c").sort((a, b) => (a.taken_on < b.taken_on ? 1 : -1))[0];

  // الجرعات: وقتها من التذكيرات إذا موجودة
  const today = doseDay(new Date());
  const reminderTimes = Object.fromEntries(JSON.parse(s?.reminders || "[]").filter((r) => r.type === "dose").map((r) => [r.slot, r.time]));
  const doseList = s?.uses_insulin ? Object.entries(SLOTS).map(([slot, d]) => {
    const taken = doses.find((x) => x.slot === slot && doseDay(x.created_at) === today);
    return { slot, ...d, units: s[d.key], time: reminderTimes[slot] || DOSE_TIMES[slot], taken };
  }) : [];
  const nextDose = doseList.find((d) => !d.taken);

  // الأدوية الباقية اليوم
  const todayKey = dayKey(new Date());
  const takenMeds = new Set(medDoses.filter((d) => dayKey(d.created_at) === todayKey).map((d) => `${d.medication_id}@${d.time_slot}`));
  const medList = medications.filter((m) => m.active && medDueToday(m)).flatMap((m) => m.times.map((t) => ({ m, t, taken: takenMeds.has(`${m.id}@${t}`) })));
  const medsLeft = medList.filter((x) => !x.taken).sort((a, b) => (a.t < b.t ? -1 : 1));

  const upcoming = appointments.filter((a) => apptDate(a.at) >= new Date(dayKey(new Date()))).sort((a, b) => (a.at < b.at ? -1 : 1));
  const nextAppt = upcoming[0];
  const meals = todayDiet(diet);
  const now = hhmmNow();
  const nextMeal = meals ? (now < "11:00" ? ["الفطور", meals.breakfast, "breakfast"] : now < "17:00" ? ["الغداء", meals.lunch, "lunch"] : ["العشاء", meals.dinner, "dinner"]) : null;

  return { last, level, target, spark, inRange, lastBp, lastA1c, doseList, nextDose, medsLeft, nextAppt, nextMeal, meals, low: recentLow(readings, s) };
}

function Spark({ values, color, height = 48, fill = true }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 200), min = Math.min(...values, 70);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 340, height - 6 - ((v - min) / (max - min || 1)) * (height - 12)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  return (
    <svg className="hn-spark" width="100%" height={height} viewBox={`0 0 340 ${height}`} preserveAspectRatio="none">
      {fill && <path d={`${d} L340 ${height} L0 ${height}Z`} fill={color} opacity=".14" />}
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const QUICK = [
  ["sugar", "سكر", Droplet],
  ["vitals", "ضغط", Activity],
  ["sugar", "جرعة", Syringe, true],
  ["diet", "وجبة", Utensils],
];
const SECTIONS = [
  ["advice", "نصائح صحية", Sparkles],
  ["meds", "الأدوية", Pill],
  ["appointments", "المواعيد", CalendarDays],
  ["labs", "التحاليل", FlaskConical],
  ["notes", "الملاحظات", NotebookPen],
  ["vitals", "الضغط والنبض", HeartPulse],
  ["notifications", "الإشعارات", Bell],
  ["settings", "خطة العلاج", SlidersHorizontal],
];

export default function HomeNew(props) {
  const { patient, me, go } = props;
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  const m = useModel(props);
  const name = me.user.display_name;
  const quick = QUICK.filter(([, , , insulin]) => !insulin || props.settings?.uses_insulin);

  // أدوية قربت تخلص أو خلصت
  const supply = props.medications.filter((x) => x.active).map((x) => [x, medSupply(x)]).filter(([, s]) => s && s.state !== "ok");
  const alerts = (
    <>
      {supply.map(([x, s]) => (
        <button key={`stock-${x.id}`} className={`hn-alert ${s.state === "out" ? "danger" : "warn"}`} onClick={() => go("meds")}>
          {s.state === "out" ? `⛔ ${x.name} خلص. اصرفوه من الصيدلية.` : `📦 ${x.name} قرب يخلص: باقي ${s.stock} ${s.unit} (يكفي ${s.days} يوم).`}
        </button>
      ))}
      {m.low && <button className="hn-alert danger" onClick={() => go("sugar")}>⚠️ آخر قراءة {m.low.glucose} هبوط. لا تعطونه إنسولين، وعالجوا الهبوط.</button>}
      {/* الآيفون: الإشعارات تشتغل بس لما يكون مثبت كتطبيق */}
      {!getDevice() && (isIOS() && !standalone()
        ? <button className="hn-alert" onClick={() => go("account")}>📱 ثبّت ود كتطبيق عشان توصلك الإشعارات</button>
        : <button className="hn-alert" onClick={() => go("notifications")}>🔔 فعّل الإشعارات عشان توصلك القراءات والتذكيرات</button>)}
    </>
  );
  const patientPill = (
    <button className="hn-pill" onClick={() => go("account")}>
      <i>{patient.name.slice(0, 1)}</i>{patient.name}<ChevronDown size={15} />
    </button>
  );
  const lastLine = m.last ? `${CONTEXTS[m.last.context]} · ${relativeDays(new Date(m.last.created_at))} ${fmtTime(m.last.created_at)}` : "ما فيه قراءات للحين";

  // ===== قائمة "اليوم" =====
  const todayItems = [
    m.nextDose && { icon: Syringe, title: `${m.nextDose.insulin} ${m.nextDose.units} وحدة`, sub: `${m.nextDose.label} · ${fmtSlot(m.nextDose.time)} · ${untilText(m.nextDose.time)}`, to: "sugar", action: "أخذها" },
    ...m.medsLeft.slice(0, 2).map((x) => ({ icon: Pill, title: `${x.m.name}${x.m.dose ? ` ${x.m.dose}` : ""}`, sub: `الساعة ${fmtSlot(x.t)}`, to: "meds", action: "أخذه" })),
    m.nextMeal?.[1] && { image: <DishImage diet={props.diet} day={m.meals.day} meal={m.nextMeal[2]} className="ic dish-ic" />, icon: Utensils, title: `${m.nextMeal[0]}: ${m.nextMeal[1].items}`, sub: [m.nextMeal[1].kcal && `${m.nextMeal[1].kcal} سعرة`, m.nextMeal[1].carbs && `${m.nextMeal[1].carbs} جم كارب`].filter(Boolean).join(" · "), to: "diet", action: "أكلها" },
    m.nextAppt && { icon: CalendarDays, title: m.nextAppt.title, sub: `${relativeDays(apptDate(m.nextAppt.at))} · ${fmtTime(apptDate(m.nextAppt.at))}`, to: "appointments" },
  ].filter(Boolean);
  if (!props.diet) todayItems.push({ icon: Utensils, title: "✨ سوّ له حمية بالذكاء الاصطناعي", sub: "حسب حالته وقراءاته", to: "diet" });
  if (!props.advice) todayItems.push({ icon: Sparkles, title: "✨ نصائح لأمراضه المزمنة", sub: "وش تسوون، وعلامات الخطر، وأسئلة للدكتور", to: "advice" });

  const sections = (
    <div className="hn-sections">
      {SECTIONS.map(([to, label, Icon]) => (
        <button key={to} onClick={() => go(to)}>
          <span><Icon size={20} /></span>{label}
          {to === "meds" && m.medsLeft.length > 0 && <em>{m.medsLeft.length}</em>}
        </button>
      ))}
    </div>
  );

  return (
      <div className="hn hn-rahma">
        <div className="hn-verse">﴿{VERSE}﴾</div>
        <div className="hn-top">
          <div className="hn-hello"><small>{greeting()}</small><b>{name}</b></div>
          {patientPill}
        </div>
        {alerts}
        <button className="hn-hero" onClick={() => go("sugar")}>
          <div className="lbl">آخر قراءة سكر · {lastLine}</div>
          <div className="big"><b>{m.last?.glucose ?? "—"}</b><span>mg/dL</span></div>
          {m.level && <span className={`badge ${m.level}`}>{LEVEL_TEXT[m.level]} ({m.target})</span>}
          <Spark values={m.spark} color="#FBEBD2" />
          <div className="minis">
            <div className="mini"><small>الضغط</small><b>{m.lastBp ? `${m.lastBp.systolic}/${m.lastBp.diastolic}` : "—"}</b></div>
            <div className="mini">
              {m.nextDose ? <><small>الجرعة الجاية · {untilText(m.nextDose.time)}</small><b>{m.nextDose.insulin} {m.nextDose.units}</b></>
                : <><small>التراكمي</small><b>{m.lastA1c ? `${m.lastA1c.value}%` : "—"}</b></>}
            </div>
          </div>
        </button>
        <div className="hn-quick">
          {quick.map(([to, label, Icon]) => <button key={label} onClick={() => go(to)}><span><Icon size={24} /></span>{label}</button>)}
        </div>
        <h3 className="hn-h">اليوم <button onClick={() => go("record")}>السجل كامل</button></h3>
        <div className="hn-list">
          {todayItems.map((it, i) => (
            <button key={i} className="hn-item" onClick={() => go(it.to)}>
              {it.image || <span className="ic"><it.icon size={22} /></span>}
              <div><b>{it.title}</b><small>{it.sub}</small></div>
              <ChevronLeft size={18} className="end" />
            </button>
          ))}
        </div>
        <h3 className="hn-h">الأقسام</h3>
        {sections}
        <button className="hn-help" onClick={() => go("help")}>
          <span>🎬</span><div><b>طريقة الاستخدام</b><small>فيديو يشرح التطبيق خطوة خطوة</small></div><ChevronLeft size={18} />
        </button>
      </div>
  );
}
