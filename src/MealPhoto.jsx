import { useRef, useState } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { api } from "./api";
import { shrink } from "./photo";
import { fmtTime, relativeDays } from "./dose";

const SLOTS = [["breakfast", "فطور"], ["lunch", "غداء"], ["dinner", "عشاء"], ["snack", "سناك"]];
const VERDICT = {
  good: ["مناسب له", "ok"],
  ok: ["لا بأس بكمية معتدلة", "mid"],
  careful: ["انتبهوا", "warn"],
  avoid: ["الأفضل يتجنبه", "bad"],
};

// الوجبة الحالية حسب الساعة بالرياض
function slotNow() {
  const h = Number(new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", hour12: false }));
  return h >= 4 && h < 11 ? "breakfast" : h < 16 ? "lunch" : h < 19 ? "snack" : "dinner";
}


export function Analysis({ a }) {
  if (!a) return null;
  if (!a.is_food) return <p className="hint">الصورة ما فيها أكل واضح. جرّب صورة ثانية للصحن من فوق.</p>;
  const [label, tone] = VERDICT[a.verdict] || VERDICT.ok;
  return (
    <div className="analysis">
      <div className={`verdict ${tone}`}><b>{label}</b>{a.verdict_text && <span>{a.verdict_text}</span>}</div>
      {a.warnings?.map((w, i) => <div key={i} className="alert danger">{w}</div>)}
      <ul className="food-items">{a.items.map((x, i) => <li key={i}><b>{x.name}</b>{x.amount && <span>{x.amount}</span>}</li>)}</ul>
      <div className="target-chips">
        {a.kcal != null && <span>حوالي <b>{a.kcal}</b> سعرة</span>}
        {a.carbs != null && <span><b>{a.carbs}</b> جم كارب</span>}
      </div>
      {a.sugar_effect && <p>📈 {a.sugar_effect}</p>}
      {a.tips?.length > 0 && <ul>{a.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>}
      {a.swap && <p className="ok-line">🔄 بديل أحسن: {a.swap}</p>}
    </div>
  );
}

export default function MealPhoto({ meals, patient, onChanged }) {
  const camRef = useRef(null);
  const fileRef = useRef(null);
  const [photo, setPhoto] = useState(null);
  const [slot, setSlot] = useState(slotNow);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(null);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(""); setMsg(""); setResult(null);
    try {
      const data = await shrink(file);
      setPhoto(data);
      setBusy("analyze");
      setResult(await api.analyzeMeal(data, slot));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function save() {
    setBusy("save");
    try {
      const { model, ...analysis } = result;
      const text = analysis.items.map((x) => x.name).join("، ") || "وجبة بالصورة";
      await api.addMeal({ slot, followed: false, text, photo, analysis });
      setPhoto(null); setResult(null);
      setMsg(`انسجلت ✓ — ${fmtTime(new Date())}`);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const history = meals.filter((m) => m.has_photo).slice(0, 12);

  return (
    <>
      <div className="card photo-card">
        <h3>📸 صوّر أكله</h3>
        <p className="hint">صوّر الصحن، والذكاء الاصطناعي يقول وش فيه، وكم سعرة وكارب، وهل يناسب {patient.name}.</p>
        <div className="chips">
          {SLOTS.map(([k, l]) => <button key={k} className={`chip ${slot === k ? "on" : ""}`} onClick={() => setSlot(k)}>{l}</button>)}
        </div>
        <div className="photo-btns">
          <button className="primary" disabled={!!busy} onClick={() => camRef.current.click()}><Camera size={20} /> صوّر الحين</button>
          <button className="secondary" disabled={!!busy} onClick={() => fileRef.current.click()}><ImagePlus size={20} /> من الصور</button>
        </div>
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />

        {photo && <img className="meal-photo" src={photo} alt="صورة الأكل" />}
        {busy === "analyze" && <p className="hint">✨ جاري تحليل الصورة... (ثواني)</p>}
        {result && (
          <>
            <Analysis a={result} />
            {result.is_food && (
              <div className="meal-actions">
                <button className="take" disabled={!!busy} onClick={save}>{busy === "save" ? "جاري الحفظ..." : "سجّل إنه أكلها"}</button>
                <button className="secondary" onClick={() => { setPhoto(null); setResult(null); }}>ما أكلها</button>
              </div>
            )}
          </>
        )}
        {error && <div className="alert danger">{error}</div>}
        {msg && <p className="ok-line">{msg}</p>}
      </div>

      {history.length > 0 && (
        <div className="card">
          <h3>صور أكله</h3>
          <div className="photo-grid">
            {history.map((m) => {
              const tone = (VERDICT[m.analysis?.verdict] || VERDICT.ok)[1];
              return (
                <button key={m.id} className={`photo-tile ${open === m.id ? "on" : ""}`} onClick={() => setOpen(open === m.id ? null : m.id)}>
                  <img src={api.mealPhotoUrl(m.id)} alt={m.text || "وجبة"} loading="lazy" />
                  <i className={`dot ${tone}`} />
                  <small>{relativeDays(new Date(m.created_at))} {fmtTime(m.created_at)}</small>
                </button>
              );
            })}
          </div>
          {open && (() => {
            const m = history.find((x) => x.id === open);
            return m && (
              <div className="photo-detail">
                <img className="meal-photo" src={api.mealPhotoUrl(m.id)} alt="" />
                <Analysis a={m.analysis} />
                <button className="link danger-link" onClick={async () => { if (confirm("تحذف هالوجبة؟")) { await api.deleteMeal(m.id); setOpen(null); onChanged(); } }}>حذف</button>
              </div>
            );
          })()}
        </div>
      )}
    </>
  );
}
