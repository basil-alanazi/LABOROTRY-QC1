import { useEffect, useState } from "react";
import { api } from "./api";

const GROUPS = [
  {
    title: "Humalog (قبل الوجبات)",
    insulin: true,
    fields: [
      ["humalog_breakfast", "قبل الفطور (وحدة)"],
      ["humalog_lunch", "قبل الغداء (وحدة)"],
      ["humalog_dinner", "قبل العشاء (وحدة)"],
    ],
  },
  {
    title: "Tresiba (قبل النوم)",
    insulin: true,
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
  {
    title: "الضغط (من كذا وفوق = مرتفع)",
    fields: [
      ["bp_sys_high", "العالي (الانقباضي)"],
      ["bp_dia_high", "الواطي (الانبساطي)"],
    ],
  },
];

export default function Settings({ settings, onSaved }) {
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState("");

  // التحديث التلقائي كل 20 ثانية ما يمسح اللي تكتبه: نعبّي النموذج بس أول مرة أو لما يتغير المريض
  useEffect(() => { if (settings && (!form || form.id !== settings.id)) setForm({ ...settings }); }, [settings]);
  if (!form) return <p className="empty">جاري التحميل...</p>;

  const set = (k, v) => setForm({ ...form, [k]: v });

  const groups = GROUPS.filter((g) => !g.insulin || form.uses_insulin);

  async function save() {
    const payload = {};
    for (const g of groups) for (const [k] of g.fields) {
      const n = Number(form[k]);
      if (!(n > 0)) return setMessage("فيه رقم ناقص أو غلط");
      payload[k] = n;
    }
    try {
      await api.saveSettings(payload);
      onSaved();
      setMessage("انحفظت الإعدادات ✓");
    } catch (e) {
      setMessage("ما انحفظت: " + e.message);
    }
  }

  return (
    <section>
      <p className="hint">الملف الصحي (الطول والوزن والأمراض والأكل) تعدّله من صفحة العائلة.</p>

      {groups.map((g) => (
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

      {!!form.tresiba_titration && <div className="card">
        <h3>قاعدة تعديل Tresiba (من الدكتور)</h3>
        <p>نشوف قراءة الصيام 4 أيام. إذا كلها أو أغلبها (3 من 4):</p>
        <ul>
          <li>فوق 200 → زيد <b>+4</b></li>
          <li>فوق {form.fasting_high} → زيد <b>+2</b></li>
          <li>{form.fasting_high} أو أقل → نفس الجرعة</li>
          <li>أي قراءة صيام أقل من {form.fasting_low} → لا تزيد، وكلّم الدكتور</li>
        </ul>
      </div>}

      <button className="primary" onClick={save}>احفظ</button>
      {message && <div className="alert info">{message}</div>}
    </section>
  );
}
