import { useEffect, useMemo } from "react";
import { Printer, X } from "lucide-react";
import { CONDITIONS } from "./PatientForm";
import { CONTEXTS, bpLevel, dayKey, fmtDate, fmtTime, glucoseLevel, tempLevel } from "./dose";

// أعمدة جدول السكر بترتيب اليوم
const COLS = ["fasting", "after_breakfast", "before_lunch", "after_lunch", "before_dinner", "after_dinner", "bedtime", "random"];
const SHORT = { fasting: "صيام", after_breakfast: "بعد الفطور", before_lunch: "قبل الغداء", after_lunch: "بعد الغداء", before_dinner: "قبل العشاء", after_dinner: "بعد العشاء", bedtime: "قبل النوم", random: "عشوائي" };
// علامة تبان حتى في الطباعة الأبيض والأسود
const MARK = { low: "↓", below: "↓", high: "↑", veryhigh: "↑↑" };

// وجبات الهيومالوج بترتيب اليوم
const MEALS = { breakfast: "فطور", lunch: "غداء", dinner: "عشاء" };
const SLOT = { ...MEALS, bedtime: "قبل النوم" };
// جرعة بعد نص الليل (عشاء متأخر أو تريسيبا) تنحسب على اليوم اللي قبله
const doseDay = (d) => dayKey(new Date(new Date(d).getTime() - 4 * 3600e3));

const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
const shortDate = (d) => new Date(`${d}T12:00:00+03:00`).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { weekday: "short", day: "numeric", month: "numeric" });

// تقرير للدكتور: صفحة A4 تنطبع أو تنحفظ PDF
export default function DoctorReport({ patient, readings, doses, bp, notes, labs, days, onClose }) {
  const since = Date.now() - days * 864e5;
  const inRange = (x) => new Date(x.created_at).getTime() >= since;

  useEffect(() => {
    document.body.classList.add("doc-open");
    return () => document.body.classList.remove("doc-open");
  }, []);

  const data = useMemo(() => {
    const rs = readings.filter(inRange);
    const ds = doses.filter(inRange);
    const vitals = bp.filter(inRange).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    const bs = vitals.filter((b) => b.systolic);
    const level = (r) => glucoseLevel(r.glucose, r.context, patient);
    // صف لكل يوم: القراءات في أعمدتها + مجموع الإنسولين
    const map = new Map();
    const row = (k) => map.get(k) || map.set(k, { cells: {}, meals: {}, tresiba: [] }).get(k);
    for (const r of rs) (row(dayKey(r.created_at)).cells[r.context] ||= []).push(r);
    for (const d of ds) {
      const rw = row(doseDay(d.created_at));
      if (d.insulin === "Tresiba") rw.tresiba.push(d);
      else (rw.meals[d.slot] ||= []).push(d);
    }
    // سجل كل جرعة: وقتها، والمخطط، وآخر قراءة سكر قبلها بساعتين
    const log = [...ds].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).map((d) => {
      const t = new Date(d.created_at).getTime();
      const before = rs.filter((r) => { const rt = new Date(r.created_at).getTime(); return rt <= t && t - rt <= 2 * 3600e3; })
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
      return { ...d, before };
    });
    const humalog = ds.filter((d) => d.insulin !== "Tresiba");
    const fasting = rs.filter((r) => r.context === "fasting").map((r) => r.glucose);
    const post = rs.filter((r) => r.context.startsWith("after_")).map((r) => r.glucose);
    return {
      days: [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
      count: rs.length,
      fastingAvg: avg(fasting),
      postAvg: avg(post),
      allAvg: avg(rs.map((r) => r.glucose)),
      ok: rs.length ? Math.round((rs.filter((r) => level(r) === "ok").length / rs.length) * 100) : null,
      highs: rs.filter((r) => r.glucose >= 250).length,
      lows: rs.filter((r) => r.glucose < patient.low_threshold).length,
      max: rs.length ? Math.max(...rs.map((r) => r.glucose)) : null,
      min: rs.length ? Math.min(...rs.map((r) => r.glucose)) : null,
      bp: vitals,
      bpCount: bs.length,
      temps: vitals.filter((b) => b.temp).map((b) => b.temp),
      bpAvg: bs.length ? `${avg(bs.map((b) => b.systolic))}/${avg(bs.map((b) => b.diastolic))}` : null,
      bpHigh: bs.filter((b) => b.systolic >= patient.bp_sys_high || b.diastolic >= patient.bp_dia_high).length,
      log,
      humalogTotal: humalog.reduce((x, d) => x + Number(d.units), 0),
      humalogOff: humalog.filter((d) => d.planned_units && Number(d.units) !== Number(d.planned_units)).length,
      today: dayKey(new Date()),
      notes: notes.filter(inRange).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
      level,
    };
  }, [readings, doses, bp, notes, days, patient]);

  const uses = !!patient.uses_insulin;
  const conditions = JSON.parse(patient.conditions || "[]");
  const meds = JSON.parse(patient.condition_meds || "{}");
  const age = patient.birth_year ? new Date().getFullYear() - patient.birth_year : null;
  const bmi = patient.weight_kg && patient.height_cm ? (patient.weight_kg / (patient.height_cm / 100) ** 2).toFixed(1) : null;
  const a1c = [...labs].filter((l) => l.test === "hba1c").sort((a, b) => (a.taken_on < b.taken_on ? 1 : -1))[0];
  const from = new Date(since), to = new Date();

  return (
    <div className="doc-overlay">
      <div className="doc-toolbar">
        <button className="secondary" onClick={onClose}><X size={18} /> رجوع</button>
        <button className="primary" onClick={() => window.print()}><Printer size={18} /> اطبع أو احفظ PDF</button>
      </div>

      <article className="doc">
        <header className="doc-head">
          <img src="/icon-192.png" alt="" width="54" height="54" />
          <div>
            <h1>تقرير متابعة السكر والضغط</h1>
            <p>من {fmtDate(from)} إلى {fmtDate(to)} · {days} يوم</p>
          </div>
        </header>

        <section className="doc-patient">
          <div><span>المريض</span><b>{patient.name}</b></div>
          {age && <div><span>العمر</span><b>{age} سنة</b></div>}
          {patient.weight_kg && <div><span>الوزن</span><b>{patient.weight_kg} كغ{bmi ? ` (BMI ${bmi})` : ""}</b></div>}
          {a1c && <div><span>التراكمي</span><b>{a1c.value}% ({a1c.taken_on})</b></div>}
        </section>

        {conditions.length > 0 && (
          <section>
            <h2>الأمراض والأدوية</h2>
            <table className="doc-table doc-meds">
              <tbody>
                {conditions.map((c) => (
                  <tr key={c}><th>{CONDITIONS[c] || c}</th><td>{[meds[c] ?? []].flat().join("، ") || "—"}</td></tr>
                ))}
                {patient.uses_insulin ? (
                  <tr><th>خطة الإنسولين</th><td>Humalog {patient.humalog_breakfast} / {patient.humalog_lunch} / {patient.humalog_dinner} قبل الوجبات · Tresiba {patient.tresiba_dose} قبل النوم</td></tr>
                ) : null}
              </tbody>
            </table>
            {patient.history && <p className="doc-note">ملاحظات: {patient.history}</p>}
          </section>
        )}

        <section>
          <h2>ملخص الفترة</h2>
          <div className="doc-stats">
            <div><b>{data.count}</b><span>قراءة سكر</span></div>
            <div><b>{data.fastingAvg ?? "—"}</b><span>متوسط الصيام (الهدف {patient.fasting_low}–{patient.fasting_high})</span></div>
            <div><b>{data.postAvg ?? "—"}</b><span>متوسط بعد الأكل (الهدف {patient.post_low}–{patient.post_high})</span></div>
            <div><b>{data.ok ?? "—"}%</b><span>ضمن الهدف</span></div>
            <div><b>{data.highs}</b><span>قراءات 250 وفوق</span></div>
            <div><b>{data.lows}</b><span>هبوط تحت {patient.low_threshold}</span></div>
            <div><b>{data.min ?? "—"} – {data.max ?? "—"}</b><span>أقل – أعلى</span></div>
            <div><b>{data.bpAvg ?? "—"}</b><span>متوسط الضغط ({data.bpHigh} من {data.bpCount} عالية)</span></div>
          </div>
        </section>

        <section>
          <h2>قراءات السكر (mg/dL)</h2>
          {data.days.length ? (
            <table className="doc-table doc-sugar">
              <thead>
                <tr><th>اليوم</th>{COLS.map((c) => <th key={c}>{SHORT[c]}</th>)}{Object.values(MEALS).map((m) => <th key={m} className="doc-ins">Humalog {m}</th>)}<th className="doc-ins">Tresiba</th></tr>
              </thead>
              <tbody>
                {data.days.map(([k, d]) => (
                  <tr key={k}>
                    <td className="doc-day">{shortDate(k)}</td>
                    {COLS.map((c) => (
                      <td key={c}>
                        {(d.cells[c] || []).map((r) => {
                          const l = data.level(r);
                          return <span key={r.id} className={`v ${l}`} title={fmtTime(r.created_at)}>{r.glucose}{MARK[l] || ""}</span>;
                        })}
                      </td>
                    ))}
                    {Object.keys(MEALS).map((m) => (
                      <td key={m} className="doc-ins">
                        {d.meals[m] ? d.meals[m].map((x) => <Units key={x.id} d={x} />) : uses && k < data.today ? <span className="v miss">✗</span> : ""}
                      </td>
                    ))}
                    <td className="doc-ins">{d.tresiba.length ? d.tresiba.map((x) => <Units key={x.id} d={x} />) : uses && k < data.today ? <span className="v miss">✗</span> : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p>ما فيه قراءات في هالفترة.</p>}
          <p className="doc-legend">↑ أعلى من الهدف · ↑↑ فوق 300 · ↓ أقل من الهدف أو هبوط · الإنسولين بالوحدات لكل جرعة، وبين قوسين المخطط إذا اختلف · ✗ ما انسجلت الجرعة · جرعة بعد نص الليل تنحسب على اليوم اللي قبله</p>
        </section>

        {data.log.length > 0 && (
          <section>
            <h2>سجل جرعات الإنسولين</h2>
            <p className="doc-note">مجموع الهيومالوج {data.humalogTotal} وحدة في {data.log.filter((d) => d.insulin !== "Tresiba").length} جرعة{data.humalogOff ? ` · ${data.humalogOff} جرعة مختلفة عن المخطط` : ""}</p>
            <table className="doc-table doc-doses">
              <thead><tr><th>التاريخ</th><th>الساعة</th><th>الإنسولين</th><th>الوجبة</th><th>الجرعة</th><th>المخطط</th><th>السكر قبلها</th></tr></thead>
              <tbody>
                {data.log.map((d) => {
                  const off = d.planned_units && Number(d.units) !== Number(d.planned_units);
                  const l = d.before && data.level(d.before);
                  return (
                    <tr key={d.id}>
                      <td>{shortDate(dayKey(d.created_at))}</td>
                      <td>{fmtTime(d.created_at)}</td>
                      <td>{d.insulin}</td>
                      <td>{SLOT[d.slot] || d.slot}</td>
                      <td><b className={off ? "v high" : ""}>{d.units}</b></td>
                      <td>{d.planned_units ?? "—"}</td>
                      <td>{d.before ? <span className={`v ${l}`}>{d.before.glucose}{MARK[l] || ""} <small>({fmtTime(d.before.created_at)})</small></span> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {data.bp.length > 0 && (
          <section>
            <h2>الضغط والقياسات الحيوية</h2>
            <table className="doc-table doc-bp">
              <thead><tr><th>التاريخ</th><th>الساعة</th><th>الضغط</th><th>النبض</th><th>الأكسجين</th><th>الحرارة</th></tr></thead>
              <tbody>
                {data.bp.map((b) => {
                  const l = bpLevel(b, patient);
                  return (
                    <tr key={b.id}>
                      <td>{shortDate(dayKey(b.created_at))}</td>
                      <td>{fmtTime(b.created_at)}</td>
                      <td>{b.systolic ? <span className={`v ${l}`}>{b.systolic}/{b.diastolic}{MARK[l] || ""}</span> : ""}</td>
                      <td>{b.pulse || ""}</td>
                      <td>{b.spo2 ? `${b.spo2}%` : ""}</td>
                      <td>{b.temp ? <span className={`v ${tempLevel(b.temp)}`}>{b.temp}°{MARK[tempLevel(b.temp)] || ""}</span> : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {data.notes.length > 0 && (
          <section>
            <h2>ملاحظات العائلة</h2>
            <ul className="doc-notes">
              {data.notes.map((n) => <li key={n.id}><b>{shortDate(dayKey(n.created_at))}:</b> {n.text}</li>)}
            </ul>
          </section>
        )}

        <footer className="doc-foot">تقرير من تطبيق ود · {fmtDate(to)} {fmtTime(to)} · القراءات مسجلة من العائلة في البيت</footer>
      </article>
    </div>
  );
}

// وحدات الجرعة، وبين قوسين المخطط إذا اختلف
function Units({ d }) {
  const off = d.planned_units && Number(d.units) !== Number(d.planned_units);
  return <span className={`v${off ? " high" : ""}`}>{d.units}{off ? <small> ({d.planned_units})</small> : ""}</span>;
}
