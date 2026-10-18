import { useState } from "react";
import { api } from "./api";
import { dayKey, fmtTime } from "./dose";
import { DRINKS, MEAL_SLOTS, PLATE, SNACKS, TIPS, WEEK, todayPlan } from "./mealPlan";

export default function Diet({ meals, onChanged }) {
  const [other, setOther] = useState(null); // الوجبة اللي يكتب لها "أكل شي ثاني"
  const [otherText, setOtherText] = useState("");
  const [message, setMessage] = useState("");
  const plan = todayPlan();
  const today = dayKey(new Date());
  const todayMeals = meals.filter((m) => dayKey(m.created_at) === today);

  async function log(slot, followed, text = null) {
    try {
      await api.addMeal({ slot, followed, text });
      setOther(null);
      setOtherText("");
      setMessage(`انسجلت ✓ — ${fmtTime(new Date())}`);
      onChanged();
    } catch (e) {
      setMessage("ما انسجلت: " + e.message);
    }
  }

  async function undo(m) {
    if (!confirm("تلغي التسجيل؟")) return;
    await api.deleteMeal(m.id).catch((e) => alert(e.message));
    onChanged();
  }

  return (
    <section>
      <div className="card">
        <h3>أكل اليوم — {plan.name}</h3>
        {["breakfast", "lunch", "dinner"].map((slot) => {
          const done = todayMeals.find((m) => m.slot === slot);
          return (
            <div key={slot} className={`meal ${done ? "taken" : ""}`}>
              <div className="meal-head">
                <strong>{MEAL_SLOTS[slot].label}</strong>
                <span className="muted">{MEAL_SLOTS[slot].insulin}</span>
              </div>
              <p>{plan[slot]}</p>
              {done ? (
                <button className="done" onClick={() => undo(done)}>
                  ✓ {done.followed ? "أكلها" : `أكل: ${done.text}`} — {fmtTime(done.created_at)}
                </button>
              ) : other === slot ? (
                <div className="other">
                  <input autoFocus value={otherText} onChange={(e) => setOtherText(e.target.value)} placeholder="وش أكل بداله؟" />
                  <button className="take" onClick={() => log(slot, false, otherText)} disabled={!otherText.trim()}>حفظ</button>
                </div>
              ) : (
                <div className="meal-actions">
                  <button className="take" onClick={() => log(slot, true)}>أكلها</button>
                  <button className="secondary" onClick={() => setOther(slot)}>أكل شي ثاني</button>
                </div>
              )}
            </div>
          );
        })}
        {message && <p className="hint">{message}</p>}
      </div>

      <div className="card warn-card">
        <p>⚠️ <b>لا ياخذ Humalog إلا إذا بياكل وجبته فعلًا.</b> إذا ما بياكل، يسأل الدكتور وش يسوي بالجرعة.</p>
      </div>

      <div className="card">
        <h3>الصحن المقسوم</h3>
        {PLATE.map((p) => (
          <div key={p.what} className="plate-row">
            <strong>{p.part}: {p.what}</strong>
            <span className="muted">{p.examples}</span>
          </div>
        ))}
      </div>

      <div className="card sheet-wrap">
        <h3>الجدول الأسبوعي</h3>
        <table className="sheet week">
          <thead><tr><th>اليوم</th><th>الفطور</th><th>الغداء</th><th>العشاء</th></tr></thead>
          <tbody>
            {WEEK.map((d) => (
              <tr key={d.day} className={d.day === plan.day ? "today-row" : ""}>
                <td className="day-cell"><b>{d.name}</b></td>
                <td>{d.breakfast}</td>
                <td>{d.lunch}</td>
                <td>{d.dinner}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">بدون رز وبدون شاي.</p>
      </div>

      <div className="card">
        <h3>السناك (إذا جاع بين الوجبات)</h3>
        <ul>{SNACKS.map((s) => <li key={s}>{s}</li>)}</ul>
        <h3>المشروبات</h3>
        <ul>
          {DRINKS.yes.map((s) => <li key={s}>✅ {s}</li>)}
          {DRINKS.no.map((s) => <li key={s}>❌ {s}</li>)}
        </ul>
      </div>

      <div className="card">
        <h3>نصائح مهمة</h3>
        <ul>{TIPS.map((t) => <li key={t}>{t}</li>)}</ul>
      </div>

      <p className="disclaimer">الجدول إرشادات عامة لمرضى السكري. اعرضوه على دكتوره أو أخصائي التغذية، خصوصًا إذا عنده مشكلة في الكلى.</p>
    </section>
  );
}
