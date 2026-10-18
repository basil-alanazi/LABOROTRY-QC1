import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { CONTEXTS, calculateDose, fmtDate, fmtTime } from "./dose";

function guessContext(date) {
  const h = Number(date.toLocaleString("en-US", { timeZone: "Asia/Riyadh", hour: "numeric", hour12: false }));
  if (h >= 4 && h < 9) return "fasting";
  if (h >= 22 || h < 4) return "bedtime";
  return "before_meal";
}

export default function Calculator({ settings, readings, onSaved }) {
  const [now, setNow] = useState(new Date());
  const [glucose, setGlucose] = useState("");
  const [context, setContext] = useState(guessContext(new Date()));
  const [taken, setTaken] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const result = glucose ? calculateDose(glucose, settings, readings) : null;

  useEffect(() => {
    // نعبّي "الجرعة اللي أخذها" بالمقترحة، ويقدر يعدّلها لو أخذ غيرها
    setTaken(result?.units != null ? String(result.units) : "");
  }, [result?.units]);

  async function save() {
    const g = Number(glucose);
    if (!g || g < 10 || g > 700) return setMessage("اكتب قراءة سكر صحيحة");
    setSaving(true);
    const { error } = await supabase.from("readings").insert({
      glucose: g,
      context,
      suggested_units: result?.units ?? null,
      insulin_units: taken === "" ? null : Number(taken),
      insulin_type: Number(taken) > 0 ? settings?.rapid_insulin || null : null,
      note: note.trim() || null,
    });
    setSaving(false);
    if (error) return setMessage("ما انحفظت: " + error.message);
    setMessage(`انحفظت ✓ — ${fmtTime(new Date())}`);
    setGlucose("");
    setNote("");
    onSaved();
  }

  return (
    <section>
      <div className="card clock">
        <div className="time">{fmtTime(now)}</div>
        <div className="date">{fmtDate(now)}</div>
      </div>

      <div className="card">
        <label>قراءة السكر (mg/dL)</label>
        <input
          className="big"
          type="number"
          inputMode="numeric"
          value={glucose}
          onChange={(e) => { setGlucose(e.target.value); setMessage(""); }}
          placeholder="مثلاً 180"
        />

        <label>وقت القراءة</label>
        <div className="chips">
          {Object.entries(CONTEXTS).map(([k, v]) => (
            <button key={k} className={context === k ? "chip on" : "chip"} onClick={() => setContext(k)}>{v}</button>
          ))}
        </div>
      </div>

      {result && (
        <div className={`card result ${result.level}`}>
          {result.units != null && (
            <div className="dose">
              <span>الجرعة حسب خطة الدكتور</span>
              <strong>{result.units} وحدة</strong>
              {settings?.rapid_insulin && result.units > 0 && <small>{settings.rapid_insulin}</small>}
            </div>
          )}
          {result.alerts.map((a, i) => <p key={i} className="warn-line">⚠️ {a}</p>)}
        </div>
      )}

      {glucose && (
        <div className="card">
          <label>الجرعة اللي أخذها فعلًا (وحدة)</label>
          <input type="number" inputMode="decimal" step="0.5" value={taken} onChange={(e) => setTaken(e.target.value)} placeholder="اتركها فاضية لو ما أخذ" />
          <label>ملاحظة (اختياري)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: أكل كبسة" />
          <button className="primary" disabled={saving} onClick={save}>
            {saving ? "جاري الحفظ..." : "احفظ القراءة"}
          </button>
          <p className="hint">التاريخ والساعة يتسجلون تلقائيًا لحظة الحفظ.</p>
        </div>
      )}

      {message && <div className="alert info">{message}</div>}

      <p className="disclaimer">الحاسبة تطبّق جدول الدكتور المحفوظ في الإعدادات فقط، وما تغني عن استشارته.</p>
    </section>
  );
}
