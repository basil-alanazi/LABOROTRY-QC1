import { useState } from "react";
import { Sparkles } from "lucide-react";
import { api } from "./api";
import { dayKey, fmtDate, fmtTime } from "./dose";
import MealPhoto from "./MealPhoto";

const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const MEALS = [
  ["breakfast", "الفطور", "breakfast"],
  ["snack1", "سناك الضحى", "snack"],
  ["lunch", "الغداء", "lunch"],
  ["snack2", "سناك العصر", "snack"],
  ["dinner", "العشاء", "dinner"],
];
const GOALS = { lose: "تنزيل وزن تدريجي", gain: "زيادة وزن", maintain: "ثبات الوزن" };

// أكل اليوم من الحمية (حسب يوم الأسبوع بتوقيت الرياض)
export function todayDiet(diet, date = new Date()) {
  const wd = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Riyadh" })).getDay();
  return diet?.days?.find((d) => d.day === DAY_NAMES[wd]);
}

export default function Diet({ diet, targets, meals, patient, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [other, setOther] = useState(null);
  const [otherText, setOtherText] = useState("");
  const [message, setMessage] = useState("");
  const [showWeek, setShowWeek] = useState(false);

  const today = todayDiet(diet);
  const todayKey = dayKey(new Date());
  const todayMeals = meals.filter((m) => dayKey(m.created_at) === todayKey);

  async function generate() {
    if (diet && !confirm("تسوي حمية جديدة على آخر القراءات؟ الحمية الحالية تنحفظ في السجل.")) return;
    setBusy(true);
    setError("");
    try {
      await api.generateDiet();
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

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

  const targetChips = targets && (
    <div className="target-chips">
      {targets.kcal && <span><b>{targets.kcal}</b> سعرة</span>}
      {targets.carbs_g && <span><b>{targets.carbs_g}</b> جم كارب</span>}
      {targets.protein_g && <span><b>{targets.protein_g}</b> جم بروتين</span>}
      <span>ملح أقل من <b>{targets.sodium_mg}</b> ملغ</span>
      {targets.bmi && <span>BMI <b>{targets.bmi}</b></span>}
    </div>
  );

  const generateButton = (
    <button className="primary ai-btn" disabled={busy} onClick={generate}>
      <Sparkles size={18} /> {busy ? "جاري تجهيز الحمية... (دقيقة تقريبًا)" : diet ? "حدّث الحمية على آخر القراءات" : `سوّ حمية لـ${patient.name}`}
    </button>
  );

  if (!diet) {
    return (
      <section>
        <div className="card ai-intro">
          <h3>✨ حمية مخصصة بالذكاء الاصطناعي</h3>
          <p>نسوي جدول أكل أسبوعي لـ<b>{patient.name}</b> يبني على:</p>
          <ul>
            <li>الطول والوزن والعمر والحركة، والسعرات محسوبة بمعادلة طبية</li>
            <li>الأمراض والحساسية، والأكل اللي ما ياكله أو اللي يحبه</li>
            <li>قراءات السكر والضغط آخر أسبوعين، والأكلات اللي رفعت السكر</li>
            <li>التحاليل، وأوقات الإنسولين إذا ياخذ</li>
          </ul>
          <p className="ok-line">☪️ حلال 100%، والكود يفحص كل حمية قبل ما توصلك.</p>
          {targetChips}
          {!targets?.kcal && <p className="hint">💡 حط الطول والوزن وسنة الميلاد في ملفه (صفحة العائلة) عشان السعرات تنحسب بدقة.</p>}
        </div>
        {generateButton}
        {error && <div className="alert danger">{error}</div>}
        <MealPhoto meals={meals} patient={patient} onChanged={onChanged} />
        <p className="disclaimer">الحمية إرشادية، وما تغني عن الدكتور أو أخصائي التغذية، خصوصًا لمرضى الكلى. وما تغيّر أي جرعة دواء.</p>
      </section>
    );
  }

  return (
    <section>
      <MealPhoto meals={meals} patient={patient} onChanged={onChanged} />
      <div className="card">
        <h3>أكل اليوم{today ? ` — ${today.day}` : ""}</h3>
        {MEALS.map(([key, label, slot]) => {
          const m = today?.[key];
          if (!m) return null;
          const done = slot !== "snack" && todayMeals.find((x) => x.slot === slot);
          return (
            <div key={key} className={`meal ${done ? "taken" : ""} ${slot === "snack" ? "snack" : ""}`}>
              <div className="meal-head">
                <strong>{label}</strong>
                <span className="muted">{m.kcal ? `${m.kcal} سعرة` : ""}{m.carbs ? ` · ${m.carbs} جم كارب` : ""}</span>
              </div>
              <p>{m.items}</p>
              {slot === "snack" ? null : done ? (
                <p className="ok-line">✓ {done.has_photo ? "📸 " : ""}{done.followed ? "أكلها" : `أكل: ${done.text}`} — {fmtTime(done.created_at)}</p>
              ) : other === key ? (
                <div className="other">
                  <input autoFocus value={otherText} onChange={(e) => setOtherText(e.target.value)} placeholder="وش أكل بداله؟" />
                  <button className="take" onClick={() => log(slot, false, otherText)} disabled={!otherText.trim()}>حفظ</button>
                </div>
              ) : (
                <div className="meal-actions">
                  <button className="take" onClick={() => log(slot, true)}>أكلها</button>
                  <button className="secondary" onClick={() => setOther(key)}>أكل شي ثاني</button>
                </div>
              )}
            </div>
          );
        })}
        {message && <p className="hint">{message}</p>}
      </div>

      <div className="card">
        <h3>فكرة الحمية</h3>
        <p>{diet.summary}</p>
        {diet.targets && (
          <div className="target-chips">
            {diet.targets.kcal && <span><b>{diet.targets.kcal}</b> سعرة</span>}
            {diet.targets.carbs_g && <span><b>{diet.targets.carbs_g}</b> جم كارب</span>}
            {diet.targets.goal && <span>{GOALS[diet.targets.goal]}</span>}
          </div>
        )}
        {diet.why?.length > 0 && (
          <>
            <h4>ليش كذا؟</h4>
            <ul>{diet.why.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </>
        )}
        <p className="hint">انسوت {fmtDate(diet.created_at)} على {diet.readings?.count ?? 0} قراءة سكر.</p>
      </div>

      <div className="card sheet-wrap">
        <button className="row-between link full" onClick={() => setShowWeek(!showWeek)}>
          <span>📅 جدول الأسبوع كامل</span><span>{showWeek ? "▲" : "▼"}</span>
        </button>
        {showWeek && (
          <table className="sheet week">
            <thead><tr><th>اليوم</th><th>الفطور</th><th>الغداء</th><th>العشاء</th><th>السناك</th></tr></thead>
            <tbody>
              {diet.days.map((d) => (
                <tr key={d.day} className={d.day === today?.day ? "today-row" : ""}>
                  <td className="day-cell"><b>{d.day}</b></td>
                  <td>{d.breakfast?.items}</td>
                  <td>{d.lunch?.items}</td>
                  <td>{d.dinner?.items}</td>
                  <td>{[d.snack1?.items, d.snack2?.items].filter(Boolean).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {diet.avoid?.length > 0 && (
        <div className="card warn-card">
          <h3>🚫 يتجنب</h3>
          <ul>{diet.avoid.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}
      {diet.tips?.length > 0 && (
        <div className="card">
          <h3>💡 نصائح</h3>
          <ul>{diet.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
      {diet.shopping?.length > 0 && (
        <div className="card">
          <h3>🛒 مقاضي الأسبوع</h3>
          <div className="chips">{diet.shopping.map((x, i) => <span key={i} className="chip static">{x}</span>)}</div>
        </div>
      )}

      {generateButton}
      {error && <div className="alert danger">{error}</div>}
      <p className="disclaimer">☪️ حلال · الحمية إرشادية وما تغني عن الدكتور أو أخصائي التغذية. وما تغيّر أي جرعة دواء.</p>
    </section>
  );
}
