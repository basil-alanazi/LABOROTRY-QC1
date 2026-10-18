import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceArea, ResponsiveContainer, CartesianGrid } from "recharts";
import { supabase } from "./supabaseClient";
import { CONTEXTS, dayKey, fmtDate, fmtTime, glucoseLevel } from "./dose";

const RANGES = [
  { days: 7, label: "أسبوع" },
  { days: 14, label: "أسبوعين" },
  { days: 30, label: "شهر" },
];

export default function Readings({ settings, readings, onChanged }) {
  const [days, setDays] = useState(7);

  const shown = useMemo(() => {
    const since = Date.now() - days * 864e5;
    return readings.filter((r) => new Date(r.created_at).getTime() >= since);
  }, [readings, days]);

  const byDay = useMemo(() => {
    const groups = {};
    for (const r of shown) (groups[dayKey(r.created_at)] ||= []).push(r);
    return Object.entries(groups);
  }, [shown]);

  const stats = useMemo(() => {
    if (!shown.length || !settings) return null;
    const vals = shown.map((r) => r.glucose);
    const inRange = vals.filter((g) => g >= settings.target_low && g <= settings.target_high).length;
    return {
      avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
      inRange: Math.round((inRange / vals.length) * 100),
      lows: vals.filter((g) => g < settings.low_threshold).length,
      count: vals.length,
    };
  }, [shown, settings]);

  const chartData = [...shown].reverse().map((r) => ({
    t: new Date(r.created_at).getTime(),
    glucose: r.glucose,
  }));

  async function remove(r) {
    if (!confirm(`تحذف قراءة ${r.glucose} (${fmtTime(r.created_at)})؟`)) return;
    await supabase.from("readings").delete().eq("id", r.id);
    onChanged();
  }

  return (
    <section>
      <div className="chips">
        {RANGES.map((r) => (
          <button key={r.days} className={days === r.days ? "chip on" : "chip"} onClick={() => setDays(r.days)}>{r.label}</button>
        ))}
        <button className="chip" onClick={() => window.print()}>طباعة للدكتور</button>
      </div>

      {stats && (
        <div className="stats">
          <div><strong>{stats.avg}</strong><span>المتوسط</span></div>
          <div><strong>{stats.inRange}%</strong><span>ضمن الهدف</span></div>
          <div><strong className={stats.lows ? "low-text" : ""}>{stats.lows}</strong><span>هبوط</span></div>
          <div><strong>{stats.count}</strong><span>قراءة</span></div>
        </div>
      )}

      {chartData.length > 1 && (
        <div className="card chart">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="#e2e8f0" vertical={false} />
              {settings && <ReferenceArea y1={settings.target_low} y2={settings.target_high} fill="#10b981" fillOpacity={0.08} />}
              <XAxis
                dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]}
                tickFormatter={(t) => new Date(t).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "numeric" })}
                fontSize={11} reversed
              />
              <YAxis fontSize={11} orientation="right" />
              <Tooltip labelFormatter={(t) => `${fmtDate(t)} — ${fmtTime(t)}`} formatter={(v) => [v, "السكر"]} />
              <Line dataKey="glucose" stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {byDay.length === 0 && <p className="empty">ما فيه قراءات في هالفترة.</p>}

      {byDay.map(([day, rows]) => (
        <div key={day} className="card day">
          <h3>{fmtDate(rows[0].created_at)}</h3>
          <table>
            <thead>
              <tr><th>الساعة</th><th>السكر</th><th>الوقت</th><th>الإنسولين</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmtTime(r.created_at)}</td>
                  <td><span className={`badge ${glucoseLevel(r.glucose, settings)}`}>{r.glucose}</span></td>
                  <td className="muted">{CONTEXTS[r.context] || r.context}{r.note && <div className="note">{r.note}</div>}</td>
                  <td>{r.insulin_units != null ? `${r.insulin_units} وحدة` : "—"}</td>
                  <td className="no-print"><button className="x" onClick={() => remove(r)} aria-label="حذف">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}
