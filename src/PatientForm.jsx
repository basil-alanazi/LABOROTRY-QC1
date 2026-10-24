import { useState } from "react";
import { api, setPatient } from "./api";

// نفس القائمة اللي في السيرفر (server/diet.js)
export const CONDITIONS = {
  diabetes2: "سكري النوع الثاني",
  diabetes1: "سكري النوع الأول",
  prediabetes: "مقدمات السكري",
  hypertension: "ضغط مرتفع",
  cholesterol: "كوليسترول مرتفع",
  heart: "أمراض القلب",
  kidney: "أمراض الكلى",
  gout: "النقرس",
  obesity: "السمنة",
  anemia: "فقر الدم",
  thyroid: "الغدة الدرقية",
  celiac: "حساسية القمح",
};
const ACTIVITY = {
  sedentary: "قليل الحركة (أغلب وقته جالس)",
  light: "حركة خفيفة (مشي بسيط)",
  moderate: "متوسط (رياضة 3 مرات بالأسبوع)",
  active: "نشيط (رياضة يومية)",
};

const empty = {
  name: "", sex: "", birth_year: "", height_cm: "", weight_kg: "", activity: "light", conditions: [],
  allergies: "", likes: "", dislikes: "", history: "", uses_insulin: false, tresiba_titration: false,
  humalog_breakfast: "", humalog_lunch: "", humalog_dinner: "", tresiba_dose: "",
};

export default function PatientForm({ patient, onSaved, onCancel }) {
  const [form, setForm] = useState(() => patient
    ? { ...empty, ...patient, conditions: JSON.parse(patient.conditions || "[]"), uses_insulin: !!patient.uses_insulin, tresiba_titration: !!patient.tresiba_titration }
    : empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (c) => set("conditions", form.conditions.includes(c) ? form.conditions.filter((x) => x !== c) : [...form.conditions, c]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const saved = patient ? await api.updatePatient(patient.id, form) : await api.addPatient(form);
      if (!patient && form.uses_insulin) {
        // جرعات الإنسولين تنحفظ في خطة العلاج
        setPatient(saved.id);
        await api.savePlan({
          humalog_breakfast: Number(form.humalog_breakfast) || 0,
          humalog_lunch: Number(form.humalog_lunch) || 0,
          humalog_dinner: Number(form.humalog_dinner) || 0,
          tresiba_dose: Number(form.tresiba_dose) || 0,
          reason: "الخطة الأولى",
        });
      }
      onSaved(saved);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const year = new Date().getFullYear();

  return (
    <section>
      <div className="card">
        <h3>👤 المعلومات الأساسية</h3>
        <label>الاسم</label>
        <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="مثلاً الوالد، أو أم أحمد" />
        <label>الجنس</label>
        <div className="chips">
          <button className={form.sex === "male" ? "chip on" : "chip"} onClick={() => set("sex", "male")}>ذكر</button>
          <button className={form.sex === "female" ? "chip on" : "chip"} onClick={() => set("sex", "female")}>أنثى</button>
        </div>
        <div className="three-col">
          <div>
            <label>سنة الميلاد</label>
            <input type="number" inputMode="numeric" value={form.birth_year ?? ""} onChange={(e) => set("birth_year", e.target.value)} placeholder={String(year - 60)} />
          </div>
          <div>
            <label>الطول (سم)</label>
            <input type="number" inputMode="decimal" value={form.height_cm ?? ""} onChange={(e) => set("height_cm", e.target.value)} placeholder="170" />
          </div>
          <div>
            <label>الوزن (كغ)</label>
            <input type="number" inputMode="decimal" value={form.weight_kg ?? ""} onChange={(e) => set("weight_kg", e.target.value)} placeholder="80" />
          </div>
        </div>
        <label>الحركة اليومية</label>
        <div className="radio-list">
          {Object.entries(ACTIVITY).map(([k, v]) => (
            <button key={k} className={form.activity === k ? "radio on" : "radio"} onClick={() => set("activity", k)}>{v}</button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>🩺 الحالة الصحية</h3>
        <label>الأمراض (اختر كل اللي عنده)</label>
        <div className="chips">
          {Object.entries(CONDITIONS).map(([k, v]) => (
            <button key={k} className={form.conditions.includes(k) ? "chip on" : "chip"} onClick={() => toggle(k)}>{v}</button>
          ))}
        </div>
        <label>التاريخ المرضي (عمليات، أمراض سابقة، أي شي مهم)</label>
        <textarea rows={3} value={form.history || ""} onChange={(e) => set("history", e.target.value)} placeholder="مثلاً: عملية قلب مفتوح 2020، جلطة خفيفة..." />
        <label>حساسية من أكل أو دواء</label>
        <input value={form.allergies || ""} onChange={(e) => set("allergies", e.target.value)} placeholder="مثلاً: المكسرات، البنسلين" />
      </div>

      <div className="card">
        <h3>🍽️ الأكل</h3>
        <label>أكل ما ياكله أو ممنوع عنه</label>
        <input value={form.dislikes || ""} onChange={(e) => set("dislikes", e.target.value)} placeholder="مثلاً: الرز، الشاي، السمك" />
        <label>أكل يحبه</label>
        <input value={form.likes || ""} onChange={(e) => set("likes", e.target.value)} placeholder="مثلاً: المرقوق، الفول، الدجاج" />
        <p className="hint">ما يطلع في الحمية أي شي من الممنوع.</p>
      </div>

      <div className="card">
        <h3>💉 الإنسولين</h3>
        <button className={`toggle-row ${form.uses_insulin ? "on" : ""}`} onClick={() => set("uses_insulin", !form.uses_insulin)}>
          <span>ياخذ إنسولين؟</span><b>{form.uses_insulin ? "إي" : "لا"}</b>
        </button>
        {form.uses_insulin && !patient && (
          <>
            <p className="hint">اكتب الجرعات حسب ورقة الدكتور (تقدر تعدلها بعدين من خطة العلاج).</p>
            <div className="three-col">
              <div><label>Humalog الفطور</label><input type="number" inputMode="decimal" value={form.humalog_breakfast} onChange={(e) => set("humalog_breakfast", e.target.value)} /></div>
              <div><label>Humalog الغداء</label><input type="number" inputMode="decimal" value={form.humalog_lunch} onChange={(e) => set("humalog_lunch", e.target.value)} /></div>
              <div><label>Humalog العشاء</label><input type="number" inputMode="decimal" value={form.humalog_dinner} onChange={(e) => set("humalog_dinner", e.target.value)} /></div>
            </div>
            <label>Tresiba قبل النوم</label>
            <input type="number" inputMode="decimal" value={form.tresiba_dose} onChange={(e) => set("tresiba_dose", e.target.value)} />
          </>
        )}
        {form.uses_insulin && (
          <button className={`toggle-row ${form.tresiba_titration ? "on" : ""}`} onClick={() => set("tresiba_titration", !form.tresiba_titration)}>
            <span>الدكتور عطاه قاعدة لزيادة Tresiba حسب قراءات الصيام؟</span><b>{form.tresiba_titration ? "إي" : "لا"}</b>
          </button>
        )}
      </div>

      {error && <div className="alert danger">{error}</div>}
      <button className="primary" disabled={busy || !form.name || !form.sex} onClick={save}>{busy ? "جاري الحفظ..." : patient ? "احفظ التعديل" : "أضف المريض"}</button>
      {onCancel && <button className="link" onClick={onCancel}>إلغاء</button>}
    </section>
  );
}
