import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const GROUPS = [
  {
    title: "Humalog (قبل الوجبات)",
    fields: [
      ["humalog_breakfast", "قبل الفطور (وحدة)"],
      ["humalog_lunch", "قبل الغداء (وحدة)"],
      ["humalog_dinner", "قبل العشاء (وحدة)"],
    ],
  },
  {
    title: "Tresiba (قبل النوم)",
    fields: [["tresiba_dose", "الجرعة الحالية (وحدة)"]],
  },
  {
    title: "الأهداف",
    fields: [
      ["fasting_low", "الصيام من"],
      ["fasting_high", "الصيام إلى"],
      ["post_low", "بعد الأكل بساعتين من"],
      ["post_high", "بعد الأكل بساعتين إلى"],
      ["low_threshold", "حد الهبوط (أقل منه = لا إنسولين)"],
    ],
  },
];

export default function Settings({ settings, onSaved }) {
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => { if (settings) setForm({ ...settings }); }, [settings]);
  if (!form) return <p className="empty">جاري التحميل...</p>;

  const set = (k, v) => setForm({ ...form, [k]: v });

  async function save() {
    const payload = { patient_name: form.patient_name, updated_at: new Date().toISOString() };
    for (const g of GROUPS) for (const [k] of g.fields) {
      const n = Number(form[k]);
      if (!(n > 0)) return setMessage("فيه رقم ناقص أو غلط");
      payload[k] = n;
    }
    if (payload.tresiba_dose !== Number(settings.tresiba_dose)) {
      // أي تغيير يدوي في Tresiba ينحفظ في السجل، ويبدأ عدّ الأربعة أيام من جديد
      const { error } = await supabase.from("tresiba_changes").insert({
        old_dose: settings.tresiba_dose, new_dose: payload.tresiba_dose, reason: "تعديل يدوي من الإعدادات",
      });
      if (error) return setMessage("ما انحفظت: " + error.message);
    }
    const { data, error } = await supabase.from("settings").update(payload).eq("id", 1).select().single();
    if (error) return setMessage("ما انحفظت: " + error.message);
    onSaved(data);
    setMessage("انحفظت الإعدادات ✓");
  }

  return (
    <section>
      <div className="card">
        <label>الاسم</label>
        <input value={form.patient_name || ""} onChange={(e) => set("patient_name", e.target.value)} />
      </div>

      {GROUPS.map((g) => (
        <div key={g.title} className="card">
          <h3>{g.title}</h3>
          {g.fields.map(([k, label]) => (
            <div key={k}>
              <label>{label}</label>
              <input type="number" inputMode="decimal" value={form[k]} onChange={(e) => set(k, e.target.value)} />
            </div>
          ))}
        </div>
      ))}

      <div className="card">
        <h3>قاعدة تعديل Tresiba (من الدكتور)</h3>
        <p>نشوف قراءة الصيام 4 أيام. إذا كلها أو أغلبها (3 من 4):</p>
        <ul>
          <li>فوق 200 → زيد <b>+4</b></li>
          <li>فوق {form.fasting_high} → زيد <b>+2</b></li>
          <li>{form.fasting_high} أو أقل → نفس الجرعة</li>
          <li>أي قراءة صيام أقل من {form.fasting_low} → لا تزيد، وكلّم الدكتور</li>
        </ul>
      </div>

      <button className="primary" onClick={save}>احفظ الإعدادات</button>
      {message && <div className="alert info">{message}</div>}
    </section>
  );
}
