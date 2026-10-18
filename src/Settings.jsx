import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const NUMBER_FIELDS = [
  ["low_threshold", "حد الهبوط (أقل منه = لا إنسولين)"],
  ["high_alert", "حد الارتفاع الخطير (تنبيه للدكتور)"],
  ["target_low", "الهدف من"],
  ["target_high", "الهدف إلى"],
  ["max_dose", "أقصى جرعة سريعة بالمرة (وحدة)"],
];

export default function Settings({ settings, onSaved }) {
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => { if (settings) setForm(structuredClone(settings)); }, [settings]);
  if (!form) return <p className="empty">جاري التحميل...</p>;

  const set = (k, v) => setForm({ ...form, [k]: v });
  const setRow = (i, k, v) => set("sliding_scale", form.sliding_scale.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const addRow = () => {
    const last = form.sliding_scale.at(-1);
    const from = last ? Number(last.to) + 1 : 150;
    set("sliding_scale", [...form.sliding_scale, { from, to: from + 49, units: "" }]);
  };

  async function save() {
    const scale = form.sliding_scale
      .map((r) => ({ from: Number(r.from), to: Number(r.to), units: Number(r.units) }))
      .filter((r) => r.to >= r.from)
      .sort((a, b) => a.from - b.from);
    for (let i = 1; i < scale.length; i++) {
      if (scale[i].from <= scale[i - 1].to) return setMessage("فيه صفوف متداخلة في الجدول — صحح الأرقام.");
    }
    const payload = {
      patient_name: form.patient_name,
      rapid_insulin: form.rapid_insulin,
      sliding_scale: scale,
      updated_at: new Date().toISOString(),
      ...Object.fromEntries(NUMBER_FIELDS.map(([k]) => [k, Number(form[k])])),
    };
    const { data, error } = await supabase.from("settings").update(payload).eq("id", 1).select().single();
    if (error) return setMessage("ما انحفظت: " + error.message);
    onSaved(data);
    setMessage("انحفظت الإعدادات ✓");
  }

  return (
    <section>
      <div className="card">
        <h3>المعلومات</h3>
        <label>الاسم</label>
        <input value={form.patient_name || ""} onChange={(e) => set("patient_name", e.target.value)} />
        <label>نوع الإنسولين السريع</label>
        <input value={form.rapid_insulin || ""} onChange={(e) => set("rapid_insulin", e.target.value)} />
        {NUMBER_FIELDS.map(([k, label]) => (
          <div key={k}>
            <label>{label}</label>
            <input type="number" inputMode="decimal" value={form[k]} onChange={(e) => set(k, e.target.value)} />
          </div>
        ))}
      </div>

      <div className="card">
        <h3>جدول الدكتور (Sliding scale)</h3>
        <p className="hint">انسخه من ورقة الدكتور بالضبط. أي قراءة أقل من أول صف = صفر وحدة.</p>
        <table className="scale">
          <thead><tr><th>من</th><th>إلى</th><th>وحدات</th><th></th></tr></thead>
          <tbody>
            {form.sliding_scale.map((r, i) => (
              <tr key={i}>
                <td><input type="number" value={r.from} onChange={(e) => setRow(i, "from", e.target.value)} /></td>
                <td><input type="number" value={r.to} onChange={(e) => setRow(i, "to", e.target.value)} /></td>
                <td><input type="number" step="0.5" value={r.units} onChange={(e) => setRow(i, "units", e.target.value)} /></td>
                <td><button className="x" onClick={() => set("sliding_scale", form.sliding_scale.filter((_, j) => j !== i))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="secondary" onClick={addRow}>+ أضف صف</button>
      </div>

      <button className="primary" onClick={save}>احفظ الإعدادات</button>
      {message && <div className="alert info">{message}</div>}
    </section>
  );
}
