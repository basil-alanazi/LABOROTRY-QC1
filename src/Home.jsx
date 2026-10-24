import { useEffect, useState } from "react";
import { Droplet, Activity, Pill, CalendarDays, NotebookPen, History, Salad, FlaskConical } from "lucide-react";
import { todayDiet } from "./Diet";
import { avgGlucose } from "./Labs";
import { getDevice } from "./push";
import { CONTEXTS, apptDate, dayKey, fmtDate, fmtSlot, fmtTime, recentLow, relativeDays } from "./dose";

function lastText(list, render, empty) {
  const r = list[0];
  return r ? `${render(r)} · ${relativeDays(new Date(r.created_at))} ${fmtTime(r.created_at)}` : empty;
}

// الأدوية اللي وقتها عدّى اليوم وما انأخذت
function dueMeds(medications, medDoses) {
  const today = dayKey(new Date());
  const now = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", hour12: false });
  const taken = new Set(medDoses.filter((d) => dayKey(d.created_at) === today).map((d) => `${d.medication_id}@${d.time_slot}`));
  return medications
    .filter((m) => m.active)
    .flatMap((m) => m.times.filter((t) => t <= now && !taken.has(`${m.id}@${t}`)).map((t) => ({ m, t })));
}

export default function Home({ settings, readings, bp, medications, medDoses, appointments, notes, labs, diet, go }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  const low = recentLow(readings, settings);
  const due = dueMeds(medications, medDoses);
  const upcoming = appointments
    .filter((a) => apptDate(a.at) >= new Date(dayKey(now)))
    .sort((a, b) => (a.at < b.at ? -1 : 1));
  const next = upcoming[0];
  const lastA1c = [...labs].filter((l) => l.test === "hba1c").sort((a, b) => (a.taken_on < b.taken_on ? 1 : -1))[0];
  const activeMeds = medications.filter((m) => m.active).length;

  const tiles = [
    {
      key: "sugar", wide: true, color: "teal", Icon: Droplet, title: settings?.uses_insulin ? "السكر والإنسولين" : "السكر",
      sub: lastText(readings, (r) => `آخر قراءة ${r.glucose} (${CONTEXTS[r.context]})`, settings?.uses_insulin ? "القراءات والجرعات" : "سجّل قراءات السكر"),
    },
    {
      key: "vitals", color: "blue", Icon: Activity, title: "القياسات الحيوية",
      sub: bp[0]?.systolic ? `آخر ضغط ${bp[0].systolic}/${bp[0].diastolic}` : "الضغط · النبض · الأكسجين",
    },
    {
      key: "meds", color: "purple", Icon: Pill, title: "الأدوية",
      sub: due.length ? `${due.length} باقية من اليوم` : activeMeds ? `${activeMeds} أدوية` : "الجرعات ومواعيدها",
      badge: due.length || null,
    },
    {
      key: "diet", color: "orange", Icon: Salad, title: "الخطة الغذائية",
      sub: diet ? `غداء اليوم: ${todayDiet(diet, now)?.lunch?.items || ""}` : "✨ سوّ له حمية بالذكاء الاصطناعي",
    },
    {
      key: "labs", color: "indigo", Icon: FlaskConical, title: "نتائج التحاليل",
      sub: lastA1c ? `التراكمي ${lastA1c.value}% (متوسط ${avgGlucose(lastA1c.value)})` : "السكر التراكمي والتحاليل",
    },
    {
      key: "appointments", color: "amber", Icon: CalendarDays, title: "المواعيد الطبية",
      sub: next ? `${next.title} · ${relativeDays(apptDate(next.at))}` : "المراجعات والتحاليل",
    },
    {
      key: "notes", color: "rose", Icon: NotebookPen, title: "الملاحظات اليومية",
      sub: notes[0] ? notes[0].text.slice(0, 40) : "الأعراض والتغيرات",
    },
    {
      key: "record", wide: true, color: "green", Icon: History, title: "السجل الصحي",
      sub: "تاريخ القياسات والجرعات، وطباعة تقرير للدكتور",
    },
  ];

  return (
    <section>
      <div className="card clock small">
        <div className="time">{fmtTime(now)}</div>
        <div className="date">{fmtDate(now)}</div>
      </div>

      {!getDevice() && (
        <button className="alert info as-btn" onClick={() => go("notifications")}>
          🔔 فعّل الإشعارات عشان توصلك القراءات والتنبيهات وتذكيرات القياس
        </button>
      )}
      {low && (
        <button className="alert danger as-btn" onClick={() => go("sugar")}>
          ⚠️ آخر قراءة سكر {low.glucose} — هبوط. لا تاخذ إنسولين، وعالج الهبوط.
        </button>
      )}
      {due.length > 0 && (
        <button className="alert warn as-btn" onClick={() => go("meds")}>
          💊 باقي: {due.slice(0, 3).map(({ m, t }) => `${m.name} (${fmtSlot(t)})`).join("، ")}{due.length > 3 ? "…" : ""}
        </button>
      )}
      {next && relativeDays(apptDate(next.at)).match(/اليوم|بكرة/) && (
        <button className="alert info as-btn" onClick={() => go("appointments")}>
          📅 موعد {relativeDays(apptDate(next.at))}: {next.title} — {fmtTime(apptDate(next.at))}
        </button>
      )}

      <div className="tiles">
        {tiles.map(({ key, wide, color, Icon, title, sub, badge }) => (
          <button key={key} className={`tile ${color} ${wide ? "wide" : ""}`} onClick={() => go(key)}>
            <span className="tile-icon"><Icon size={26} strokeWidth={2} /></span>
            {badge && <span className="tile-badge">{badge}</span>}
            <strong>{title}</strong>
            <span className="tile-sub">{sub}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
