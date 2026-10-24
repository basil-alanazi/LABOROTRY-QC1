import { useEffect, useState } from "react";
import {
  Activity, Bell, CalendarDays, ChevronDown, ChevronLeft, Droplet, FlaskConical, Home as HomeIcon,
  LineChart, NotebookPen, Pill, Plus, SlidersHorizontal, Syringe, Users, Utensils, X,
} from "lucide-react";
import { todayDiet } from "./Diet";
import { avgGlucose } from "./Labs";
import { getDevice } from "./push";
import { CONTEXTS, SLOTS, apptDate, bpLevel, dayKey, fmtDate, fmtSlot, fmtTime, glucoseLevel, recentLow, relativeDays } from "./dose";
import { VERSE } from "./Verse";
import "./homeNew.css";

export const THEMES = { rahma: "رحمة", sehati: "صحتي", layl: "ليل" };
const THEME_KEY = "wad_theme";
export const savedTheme = () => { try { return THEMES[localStorage.getItem(THEME_KEY)] ? localStorage.getItem(THEME_KEY) : "rahma"; } catch { return "rahma"; } };
const saveTheme = (t) => { try { localStorage.setItem(THEME_KEY, t); } catch { /* التخزين مقفل */ } };

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
  const medList = medications.filter((m) => m.active).flatMap((m) => m.times.map((t) => ({ m, t, taken: takenMeds.has(`${m.id}@${t}`) })));
  const medsLeft = medList.filter((x) => !x.taken).sort((a, b) => (a.t < b.t ? -1 : 1));

  const upcoming = appointments.filter((a) => apptDate(a.at) >= new Date(dayKey(new Date()))).sort((a, b) => (a.at < b.at ? -1 : 1));
  const nextAppt = upcoming[0];
  const meals = todayDiet(diet);
  const now = hhmmNow();
  const nextMeal = meals ? (now < "11:00" ? ["الفطور", meals.breakfast] : now < "17:00" ? ["الغداء", meals.lunch] : ["العشاء", meals.dinner]) : null;

  return { last, level, target, spark, inRange, lastBp, lastA1c, doseList, nextDose, medsLeft, nextAppt, nextMeal, low: recentLow(readings, s) };
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

function Ring({ value, total = 100, color, track, label }) {
  const c = 2 * Math.PI * 31;
  const frac = total ? Math.min(1, value / total) : 0;
  return (
    <div className="hn-ring">
      <svg width="74" height="74" viewBox="0 0 74 74">
        <circle cx="37" cy="37" r="31" fill="none" stroke={track} strokeWidth="10" />
        <circle cx="37" cy="37" r="31" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${frac * c} ${c}`} transform="rotate(-90 37 37)" />
      </svg>
      <b>{label}</b>
    </div>
  );
}

function Gauge({ value }) {
  // من 40 إلى 400
  const frac = value ? Math.min(1, Math.max(0, (value - 40) / 360)) : 0;
  const len = Math.PI * 100;
  const ang = Math.PI * (1 - frac);
  const x = 120 + 100 * Math.cos(ang), y = 130 - 100 * Math.sin(ang);
  return (
    <svg width="240" height="140" viewBox="0 0 240 140">
      <defs><linearGradient id="hn-g" x1="0" x2="1"><stop offset="0" stopColor="#2EE6C5" /><stop offset=".45" stopColor="#FBBF24" /><stop offset="1" stopColor="#FB7185" /></linearGradient></defs>
      <path d="M20 130 A100 100 0 0 1 220 130" fill="none" stroke="rgb(255 255 255 / .08)" strokeWidth="16" strokeLinecap="round" />
      <path d="M20 130 A100 100 0 0 1 220 130" fill="none" stroke="url(#hn-g)" strokeWidth="16" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - frac)} />
      {value && <circle cx={x} cy={y} r="9" fill="#0A1220" stroke="#fff" strokeWidth="4" />}
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
  ["meds", "الأدوية", Pill],
  ["appointments", "المواعيد", CalendarDays],
  ["labs", "التحاليل", FlaskConical],
  ["notes", "الملاحظات", NotebookPen],
  ["notifications", "الإشعارات", Bell],
  ["settings", "خطة العلاج", SlidersHorizontal],
];

export default function HomeNew(props) {
  const { patient, me, go } = props;
  const [theme, setTheme] = useState(savedTheme);
  const [sheet, setSheet] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    document.body.dataset.hn = theme;
    return () => { delete document.body.dataset.hn; };
  }, [theme]);
  const pick = (t) => { setTheme(t); saveTheme(t); };
  const m = useModel(props);
  const name = me.user.display_name;
  const quick = QUICK.filter(([, , , insulin]) => !insulin || props.settings?.uses_insulin);

  const switcher = (
    <div className="hn-switch">
      <span>جرّب التصميم:</span>
      {Object.entries(THEMES).map(([k, v]) => <button key={k} className={theme === k ? "on" : ""} onClick={() => pick(k)}>{v}</button>)}
    </div>
  );
  const alerts = (
    <>
      {m.low && <button className="hn-alert danger" onClick={() => go("sugar")}>⚠️ آخر قراءة {m.low.glucose} هبوط. لا تعطونه إنسولين، وعالجوا الهبوط.</button>}
      {!getDevice() && <button className="hn-alert" onClick={() => go("notifications")}>🔔 فعّل الإشعارات عشان توصلك القراءات والتذكيرات</button>}
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
    m.nextMeal?.[1] && { icon: Utensils, title: `${m.nextMeal[0]}: ${m.nextMeal[1].items}`, sub: [m.nextMeal[1].kcal && `${m.nextMeal[1].kcal} سعرة`, m.nextMeal[1].carbs && `${m.nextMeal[1].carbs} جم كارب`].filter(Boolean).join(" · "), to: "diet", action: "أكلها" },
    m.nextAppt && { icon: CalendarDays, title: m.nextAppt.title, sub: `${relativeDays(apptDate(m.nextAppt.at))} · ${fmtTime(apptDate(m.nextAppt.at))}`, to: "appointments" },
  ].filter(Boolean);
  if (!props.diet) todayItems.push({ icon: Utensils, title: "✨ سوّ له حمية بالذكاء الاصطناعي", sub: "حسب حالته وقراءاته، وحلال", to: "diet" });

  const bottomNav = (
    <>
      <nav className="hn-nav">
        <button className="on"><HomeIcon size={22} />الرئيسية</button>
        <button onClick={() => go("record")}><LineChart size={22} />التقارير</button>
        <button className="hn-plus" onClick={() => setSheet(true)} aria-label="سجّل"><Plus size={26} strokeWidth={2.6} /></button>
        <button onClick={() => go("diet")}><Utensils size={22} />الحمية</button>
        <button onClick={() => go("account")}><Users size={22} />العائلة</button>
      </nav>
      {sheet && (
        <div className="hn-sheet-bg" onClick={() => setSheet(false)}>
          <div className="hn-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="hn-sheet-head"><b>وش تبي تسجل لـ{patient.name}؟</b><button onClick={() => setSheet(false)}><X size={20} /></button></div>
            <div className="hn-sheet-grid">
              {[["sugar", "قراءة سكر", Droplet], ["vitals", "ضغط ونبض", Activity], ...(props.settings?.uses_insulin ? [["sugar", "جرعة إنسولين", Syringe]] : []), ["meds", "دواء", Pill], ["diet", "وجبة", Utensils], ["notes", "ملاحظة", NotebookPen]].map(([to, label, Icon]) => (
                <button key={label} onClick={() => { setSheet(false); go(to); }}><span><Icon size={24} /></span>{label}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );

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

  // ===== رحمة =====
  if (theme === "rahma") {
    return (
      <div className="hn hn-rahma">
        {switcher}
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
          <Spark values={m.spark} color="#F6E7C4" />
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
              <span className="ic"><it.icon size={22} /></span>
              <div><b>{it.title}</b><small>{it.sub}</small></div>
              <ChevronLeft size={18} className="end" />
            </button>
          ))}
        </div>
        <h3 className="hn-h">الأقسام</h3>
        {sections}
        {bottomNav}
      </div>
    );
  }

  // ===== صحتي =====
  if (theme === "sehati") {
    const bars = m.spark.length ? m.spark : [];
    const maxBar = Math.max(...bars, 250);
    return (
      <div className="hn hn-sehati">
        {switcher}
        <div className="hn-head">
          <div><small>{fmtDate(new Date())}</small><h1>صحة {patient.name}</h1></div>
          {patientPill}
        </div>
        <div className="hn-verse">﴿وَقُلْ رَبِّ ارْحَمْهُمَا كَمَا رَبَّيَانِي صَغِيرًا﴾</div>
        {alerts}
        <button className="hn-card hn-sugar" onClick={() => go("sugar")}>
          <div className="ttl"><i style={{ background: "var(--red)" }} />السكر <time>{m.last ? fmtTime(m.last.created_at) : ""}</time></div>
          <div className="row">
            <div className="num"><b>{m.last?.glucose ?? "—"}</b> <span>mg/dL</span>{m.level && <p className={m.level}>{m.level === "ok" ? "✓" : "▲"} {LEVEL_TEXT[m.level]} · {CONTEXTS[m.last.context]}</p>}</div>
            <div className="bars">{bars.map((v, i) => <i key={i} className={glucoseLevel(v, "random", props.settings) !== "ok" ? "hi" : ""} style={{ height: `${Math.max(12, (v / maxBar) * 100)}%` }} />)}</div>
          </div>
        </button>
        <div className="hn-grid">
          {props.settings?.uses_insulin ? (
            <button className="hn-card" onClick={() => go("sugar")}>
              <div className="ttl"><i style={{ background: "var(--teal)" }} />جرعات اليوم</div>
              <Ring value={m.doseList.filter((d) => d.taken).length} total={m.doseList.length} color="var(--teal)" track="#E2F7F5" label={`${m.doseList.filter((d) => d.taken).length}/${m.doseList.length}`} />
              <div className="sub">{m.nextDose ? `الجاية: ${m.nextDose.label} ${m.nextDose.units}` : "خلصت جرعات اليوم ✓"}</div>
            </button>
          ) : (
            <button className="hn-card" onClick={() => go("meds")}>
              <div className="ttl"><i style={{ background: "var(--teal)" }} />الأدوية</div>
              <div className="big-num">{m.medsLeft.length}</div>
              <div className="sub">باقية اليوم</div>
            </button>
          )}
          <button className="hn-card" onClick={() => go("record")}>
            <div className="ttl"><i style={{ background: "var(--violet)" }} />ضمن الهدف</div>
            <Ring value={m.inRange ?? 0} color="var(--violet)" track="#EFE9FE" label={m.inRange === null ? "—" : `${m.inRange}%`} />
            <div className="sub">آخر 7 أيام</div>
          </button>
          <button className="hn-card small" onClick={() => go("vitals")}>
            <div className="ttl"><i style={{ background: "var(--orange)" }} />الضغط</div>
            <b>{m.lastBp ? `${m.lastBp.systolic}/${m.lastBp.diastolic}` : "—"}</b>
            {m.lastBp && <span className={`chip ${bpLevel(m.lastBp, props.settings)}`}>{bpLevel(m.lastBp, props.settings) === "ok" ? "طبيعي" : bpLevel(m.lastBp, props.settings) === "low" ? "منخفض" : "مرتفع"}</span>}
          </button>
          <button className="hn-card small" onClick={() => go("labs")}>
            <div className="ttl"><i style={{ background: "var(--blue)" }} />التراكمي</div>
            <b>{m.lastA1c ? `${m.lastA1c.value}%` : "—"}</b>
            {m.lastA1c && <span className="chip info">متوسط {avgGlucose(m.lastA1c.value)}</span>}
          </button>
        </div>
        <div className="hn-card hn-left">
          <div className="ttl">اللي باقي اليوم</div>
          {todayItems.length === 0 && <p className="sub">ما فيه شي باقي ✓</p>}
          {todayItems.map((it, i) => (
            <div key={i} className="r">
              <span className="sq"><it.icon size={19} /></span>
              <div><b>{it.title}</b><small>{it.sub}</small></div>
              {it.action && <button className="btn" onClick={() => go(it.to)}>{it.action}</button>}
            </div>
          ))}
        </div>
        {sections}
        {bottomNav}
      </div>
    );
  }

  // ===== ليل =====
  return (
    <div className="hn hn-layl">
      {switcher}
      <div className="hn-verse">﴿وَقُلْ رَبِّ ارْحَمْهُمَا كَمَا رَبَّيَانِي صَغِيرًا﴾</div>
      <div className="hn-top">
        <div><small>{greeting()} يا {name}</small><h1>ود</h1></div>
        {patientPill}
      </div>
      {alerts}
      <button className="hn-glass hn-gauge" onClick={() => go("sugar")}>
        <div className="g"><Gauge value={m.last?.glucose} /><div className="v"><b>{m.last?.glucose ?? "—"}</b><span>{m.last ? `mg/dL · ${CONTEXTS[m.last.context]} · ${fmtTime(m.last.created_at)}` : "ما فيه قراءات"}</span></div></div>
        {m.level && <div className={`state ${m.level}`}>{LEVEL_TEXT[m.level]} ({m.target})</div>}
        <div className="stats">
          <div><b>{m.lastBp ? `${m.lastBp.systolic}/${m.lastBp.diastolic}` : "—"}</b><small>الضغط</small></div>
          <div><b>{props.settings?.uses_insulin ? `${m.doseList.filter((d) => d.taken).length}/${m.doseList.length}` : m.inRange === null ? "—" : `${m.inRange}%`}</b><small>{props.settings?.uses_insulin ? "جرعات اليوم" : "ضمن الهدف"}</small></div>
          <div><b>{m.lastA1c ? `${m.lastA1c.value}%` : "—"}</b><small>التراكمي</small></div>
        </div>
      </button>
      <h3 className="hn-h">جدول اليوم</h3>
      <div className="hn-tl">
        {[
          ...m.doseList.map((d) => ({ key: d.slot, time: d.time, el: (
            <button className="c" onClick={() => go("sugar")}>
              <em className={d.taken ? "done" : d === m.nextDose ? "soon" : d.insulin === "Tresiba" ? "night" : ""} />
              <div><b>{d.insulin} {d.units}</b><small>{d.label} · {d.taken ? `انأخذت ✓ ${fmtTime(d.taken.created_at)}` : untilText(d.time)}</small></div>
              {!d.taken && d === m.nextDose && <span className="go">أخذها</span>}
            </button>
          ), next: !d.taken && d === m.nextDose })),
          ...m.medsLeft.slice(0, 3).map((x) => ({ key: `${x.m.id}${x.t}`, time: x.t, el: (
            <button className="c" onClick={() => go("meds")}><em className="med" /><div><b>{x.m.name}</b><small>{x.m.dose || "دواء"} · {untilText(x.t)}</small></div></button>
          ) })),
        ].sort((a, b) => (a.time < b.time ? -1 : 1)).map((e) => (
          <div key={e.key} className={`ev ${e.next ? "next" : ""}`}>
            <span className="t">{fmtSlot(e.time)}</span>
            {e.el}
          </div>
        ))}
        {m.nextMeal?.[1] && (
          <div className="ev">
            <span className="t">{m.nextMeal[0]}</span>
            <button className="c" onClick={() => go("diet")}><em className="meal" /><div><b>{m.nextMeal[1].items}</b><small>{m.nextMeal[1].carbs ? `${m.nextMeal[1].carbs} جم كارب` : "من الحمية"}</small></div></button>
          </div>
        )}
        {!m.doseList.length && !m.medsLeft.length && !m.nextMeal && <p className="empty-l">ما فيه شي مجدول اليوم.</p>}
      </div>
      {sections}
      {bottomNav}
    </div>
  );
}
