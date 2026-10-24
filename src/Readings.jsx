import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceArea, ResponsiveContainer, CartesianGrid } from "recharts";
import { api } from "./api";
import Report from "./Report";
import { CONTEXTS, SLOTS, bpLevel, spo2Level, sinceMeal, dayKey, fmtDate, fmtShortDate, fmtTime, glucoseLevel } from "./dose";

const RANGES = [
  { days: 7, label: "أسبوع" },
  { days: 14, label: "أسبوعين" },
  { days: 30, label: "شهر" },
];

export default function Readings({ settings, readings, doses, changes, bp, notes, meals, onChanged }) {
  const [days, setDays] = useState(7);
  const [view, setView] = useState("report");
  const since = Date.now() - days * 864e5;

  const shown = useMemo(() => readings.filter((r) => new Date(r.created_at).getTime() >= since), [readings, since]);

  // صف لكل يوم، مثل الورقة
  const rows = useMemo(() => {
    const map = new Map();
    const row = (d) => map.get(d) || map.set(d, { readings: {}, doses: [] }).get(d);
    for (const r of shown) (row(dayKey(r.created_at)).readings[r.context] ||= []).unshift(r);
    for (const d of doses) {
      if (new Date(d.created_at).getTime() >= since) row(dayKey(d.created_at)).doses.unshift(d);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [shown, doses, since]);

  const stats = useMemo(() => {
    if (!shown.length || !settings) return null;
    const fasting = shown.filter((r) => r.context === "fasting").map((r) => r.glucose);
    const vals = shown.map((r) => r.glucose);
    return {
      fastingAvg: fasting.length ? Math.round(fasting.reduce((a, b) => a + b, 0) / fasting.length) : "—",
      inRange: Math.round((shown.filter((r) => ["ok"].includes(glucoseLevel(r.glucose, r.context, settings))).length / vals.length) * 100),
      lows: vals.filter((g) => g < settings.low_threshold).length,
      count: vals.length,
    };
  }, [shown, settings]);

  const chartData = shown.filter((r) => r.context === "fasting").reverse().map((r) => ({ t: new Date(r.created_at).getTime(), glucose: r.glucose }));

  const bpShown = bp.filter((r) => new Date(r.created_at).getTime() >= since);
  const notesShown = notes.filter((n) => new Date(n.created_at).getTime() >= since);

  async function removeBp(r) {
    if (!confirm(`تحذف قراءة الضغط ${r.systolic}/${r.diastolic} (${fmtTime(r.created_at)})؟`)) return;
    await api.deleteBp(r.id).catch((e) => alert("ما انحذفت: " + e.message));
    onChanged();
  }

  async function removeReading(r) {
    if (!confirm(`تحذف قراءة ${r.glucose} (${fmtTime(r.created_at)})؟`)) return;
    await api.deleteReading(r.id).catch((e) => alert("ما انحذفت: " + e.message));
    onChanged();
  }

  return (
    <section>
      <div className="chips no-print">
        {RANGES.map((r) => (
          <button key={r.days} className={days === r.days ? "chip on" : "chip"} onClick={() => setDays(r.days)}>{r.label}</button>
        ))}
        <button className="chip" onClick={() => window.print()}>طباعة للدكتور</button>
      </div>
      <div className="segmented no-print">
        <button className={view === "report" ? "on" : ""} onClick={() => setView("report")}>التقرير اليومي</button>
        <button className={view === "sheet" ? "on" : ""} onClick={() => setView("sheet")}>جدول الورقة</button>
      </div>

      <h2 className="print-only">جدول متابعة السكر — {settings?.patient_name}</h2>

      {stats && (
        <div className="stats">
          <div><strong>{stats.fastingAvg}</strong><span>متوسط الصيام</span></div>
          <div><strong>{stats.inRange}%</strong><span>ضمن الهدف</span></div>
          <div><strong className={stats.lows ? "low-text" : ""}>{stats.lows}</strong><span>هبوط</span></div>
          <div><strong>{stats.count}</strong><span>قراءة</span></div>
        </div>
      )}

      {chartData.length > 1 && settings && (
        <div className="card chart">
          <h3>قراءات الصيام (قبل الفطور)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="#e2e8f0" vertical={false} />
              <ReferenceArea y1={settings.fasting_low} y2={settings.fasting_high} fill="#10b981" fillOpacity={0.1} />
              <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} reversed fontSize={11}
                tickFormatter={(t) => new Date(t).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "numeric" })} />
              <YAxis fontSize={11} orientation="right" />
              <Tooltip labelFormatter={(t) => `${fmtDate(t)} — ${fmtTime(t)}`} formatter={(v) => [v, "الصيام"]} />
              <Line dataKey="glucose" stroke="#A0703E" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {view === "report" && <Report settings={settings} readings={readings} doses={doses} bp={bp} meals={meals} since={since} />}

      {view === "sheet" && (rows.length === 0 ? (
        <p className="empty">ما فيه قراءات سكر في هالفترة.</p>
      ) : (
        <div className="card sheet-wrap">
          <table className="sheet">
            <thead>
              <tr>
                <th>التاريخ</th>
                {Object.values(CONTEXTS).map((c) => <th key={c}>{c}</th>)}
                <th>الإنسولين</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([day, row]) => (
                <tr key={day}>
                  <td className="day-cell">{fmtShortDate(day + "T12:00:00+03:00")}</td>
                  {Object.keys(CONTEXTS).map((c) => (
                    <td key={c}>
                      {(row.readings[c] || []).map((r) => (
                        <button key={r.id} className="cell" onClick={() => removeReading(r)} title={r.note || "اضغط للحذف"}>
                          <span className={`badge ${glucoseLevel(r.glucose, c, settings)}`}>{r.glucose}</span>
                          <small>{fmtTime(r.created_at)}</small>
                          {sinceMeal(r) && <small className="note">{sinceMeal(r)}</small>}
                          {r.note && <small className="note">{r.note}</small>}
                        </button>
                      ))}
                    </td>
                  ))}
                  <td className="dose-cell">
                    {row.doses.map((d) => (
                      <div key={d.id}>
                        <b>{d.units}</b> {d.insulin === "Tresiba" ? "T" : "H"} <small>{fmtTime(d.created_at)}</small>
                        {d.planned_units != null && Number(d.planned_units) !== Number(d.units) && <small className="planned"> (الخطة {d.planned_units})</small>}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">H = Humalog ، T = Tresiba. اضغط على أي قراءة لحذفها.</p>
        </div>
      ))}

      {bpShown.length > 0 && (
        <div className="card">
          <h3>القياسات الحيوية</h3>
          <table>
            <thead><tr><th>التاريخ</th><th>الساعة</th><th>الضغط</th><th>النبض</th><th>الأكسجين</th><th className="no-print"></th></tr></thead>
            <tbody>
              {bpShown.map((r) => (
                <tr key={r.id}>
                  <td>{fmtShortDate(r.created_at)}</td>
                  <td>{fmtTime(r.created_at)}</td>
                  <td>{r.systolic ? <span className={`badge ${bpLevel(r, settings)}`}>{r.systolic}/{r.diastolic}</span> : "—"}</td>
                  <td>{r.pulse ?? "—"}</td>
                  <td>{r.spo2 ? <span className={`badge ${spo2Level(r.spo2)}`}>{r.spo2}%</span> : "—"}</td>
                  <td className="no-print"><button className="x" onClick={() => removeBp(r)} aria-label="حذف">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {notesShown.length > 0 && (
        <div className="card">
          <h3>الملاحظات</h3>
          {notesShown.map((n) => (
            <div key={n.id} className="note-row">
              <span className="muted">{fmtShortDate(n.created_at)} {fmtTime(n.created_at)}</span>
              <p>{n.text}</p>
            </div>
          ))}
        </div>
      )}

      {settings && (
        <div className="card targets">
          <p>معدل السكر قبل الفطور: من <b>{settings.fasting_low}</b> إلى <b>{settings.fasting_high}</b></p>
          <p>معدل السكر بعد الوجبات بساعتين: من <b>{settings.post_low}</b> إلى <b>{settings.post_high}</b></p>
          <p>الضغط: أقل من <b>{settings.bp_sys_high}/{settings.bp_dia_high}</b></p>
          <p className="hint">
            الخطة: Humalog {Object.entries(SLOTS).filter(([, s]) => s.insulin === "Humalog").map(([, s]) => settings[s.key]).join(" / ")} — Tresiba {settings.tresiba_dose} قبل النوم
          </p>
        </div>
      )}

      {changes.length > 0 && (
        <div className="card">
          <h3>سجل تعديل Tresiba</h3>
          <table>
            <thead><tr><th>التاريخ</th><th>من</th><th>إلى</th><th>السبب</th></tr></thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.id}>
                  <td>{fmtShortDate(c.created_at)}</td>
                  <td>{c.old_dose ?? "—"}</td>
                  <td><b>{c.new_dose}</b></td>
                  <td className="muted">{c.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
