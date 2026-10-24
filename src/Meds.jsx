import { useState } from "react";
import { api } from "./api";
import MedScan from "./MedScan";
import { dayKey, fmtSlot, fmtTime, medSupply } from "./dose";

const EMPTY = { name: "", dose: "", times: ["08:00"], notes: "", stock: "", per_dose: 1, unit: "حبة", alert_days: 7 };
const UNITS = ["حبة", "قطرة", "بخة", "إبرة", "كيس", "ملعقة", "مل"];
const SUPPLY = { ok: "", low: "قرب يخلص", out: "خلص" };

function MedForm({ initial, onSave, onCancel, message }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => setForm({ ...form, [k]: v });
  const setTime = (i, v) => set("times", form.times.map((t, j) => (j === i ? v : t)));

  return (
    <div className="card">
      <h3>{initial.id ? "تعديل الدواء" : "أضف دواء"}</h3>
      <label>اسم الدواء</label>
      <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="مثلاً Metformin" />
      <MedScan label="صوّر علبة الدواء وتنعبّى لحالها" onResult={(m) => setForm((f) => ({
        ...f,
        name: [m.name_ar && m.name !== m.name_ar ? `${m.name_ar} (${m.name})` : m.name_ar || m.name, m.generic].filter(Boolean).join(" · "),
        dose: f.dose || m.strength,
        notes: f.notes || m.for,
      }))} />
      <label>الجرعة</label>
      <input value={form.dose || ""} onChange={(e) => set("dose", e.target.value)} placeholder="مثلاً حبة 500 ملغ" />
      <label>المواعيد</label>
      {form.times.map((t, i) => (
        <div key={i} className="time-row">
          <input type="time" value={t} onChange={(e) => setTime(i, e.target.value)} />
          <button className="x" onClick={() => set("times", form.times.filter((_, j) => j !== i))} aria-label="حذف">×</button>
        </div>
      ))}
      <button className="secondary" onClick={() => set("times", [...form.times, "20:00"])}>+ موعد ثاني</button>
      <label>ملاحظة (اختياري)</label>
      <input value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} placeholder="مثلاً بعد الأكل" />

      <div className="stock-box">
        <b>📦 الجرد (اختياري)</b>
        <p className="hint">اكتبوا كم باقي، وينقص لحاله مع كل جرعة، وننبهكم قبل ما يخلص.</p>
        <label>كم باقي عندكم؟</label>
        <div className="stock-row">
          <input type="number" inputMode="decimal" min="0" value={form.stock ?? ""} onChange={(e) => set("stock", e.target.value)} placeholder="مثلاً 30" />
          <select value={form.unit || "حبة"} onChange={(e) => set("unit", e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
        </div>
        <div className="two-col">
          <div>
            <label>كم {form.unit || "حبة"} بكل جرعة؟</label>
            <input type="number" inputMode="decimal" min="0.1" step="0.5" value={form.per_dose ?? 1} onChange={(e) => set("per_dose", e.target.value)} />
          </div>
          <div>
            <label>نبهني قبل بكم يوم؟</label>
            <input type="number" inputMode="numeric" min="1" max="90" value={form.alert_days ?? 7} onChange={(e) => set("alert_days", e.target.value)} />
          </div>
        </div>
      </div>
      <button className="primary" onClick={() => onSave(form)}>احفظ</button>
      {/* لو الحفظ ما زبط، السبب يطلع هنا */}
      {message && <div className="alert danger">{message}</div>}
      <button className="link" onClick={onCancel}>إلغاء</button>
    </div>
  );
}

export default function Meds({ medications, medDoses, onChanged }) {
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");
  const today = dayKey(new Date());
  const takenToday = medDoses.filter((d) => dayKey(d.created_at) === today);

  async function save(form) {
    setMessage("");
    try {
      if (form.id) await api.updateMedication(form.id, { ...form, active: true });
      else await api.addMedication(form);
      setEditing(null);
      setMessage("انحفظ الدواء ✓");
      onChanged();
    } catch (e) {
      setMessage("ما انحفظ: " + e.message);
    }
  }

  async function toggle(m, slot) {
    const taken = takenToday.find((d) => d.medication_id === m.id && d.time_slot === slot);
    try {
      if (taken) {
        if (!confirm(`تلغي تسجيل ${m.name} (${fmtSlot(slot)})؟`)) return;
        await api.deleteMedDose(taken.id);
      } else {
        await api.addMedDose({ medication_id: m.id, time_slot: slot });
      }
      onChanged();
    } catch (e) {
      setMessage("ما انحفظ: " + e.message);
    }
  }

  async function refill(m) {
    const amount = prompt(`كم ${m.unit || "حبة"} في العلبة الجديدة من ${m.name}؟`);
    if (!amount) return;
    try {
      await api.refillMedication(m.id, Number(amount));
      setMessage(`انضاف ${amount} ${m.unit || "حبة"} ✓`);
      onChanged();
    } catch (e) {
      setMessage("ما انحفظ: " + e.message);
    }
  }

  async function stop(m) {
    if (!confirm(`توقف ${m.name}؟ (يبقى في السجل)`)) return;
    await api.updateMedication(m.id, { ...m, active: false });
    onChanged();
  }

  if (editing) return <section><MedForm initial={editing} onSave={save} onCancel={() => { setEditing(null); setMessage(""); }} message={message} /></section>;

  const active = medications.filter((m) => m.active);
  const stopped = medications.filter((m) => !m.active);

  return (
    <section>
      <div className="card info-card">
        <p>الإنسولين (Humalog وTresiba) تلقاه في قسم <b>السكر والإنسولين</b>. هنا الأدوية الثانية.</p>
      </div>

      {active.length === 0 && <p className="empty">ما فيه أدوية مضافة للحين.</p>}

      {active.map((m) => (
        <div key={m.id} className="card med">
          <div className="med-head">
            <div>
              <h3>{m.name}</h3>
              {m.dose && <span className="muted">{m.dose}</span>}
              {m.notes && <div className="muted">{m.notes}</div>}
            </div>
            <button className="link" onClick={() => setEditing(m)}>تعديل</button>
          </div>
          <div className="med-times">
            {m.times.map((slot) => {
              const taken = takenToday.find((d) => d.medication_id === m.id && d.time_slot === slot);
              return (
                <button key={slot} className={`med-slot ${taken ? "taken" : ""}`} onClick={() => toggle(m, slot)}>
                  <span>{fmtSlot(slot)}</span>
                  <small>{taken ? `✓ ${fmtTime(taken.created_at)}` : "أخذه"}</small>
                </button>
              );
            })}
          </div>
          {(() => {
            const s = medSupply(m);
            if (!s) return <button className="link small" onClick={() => setEditing(m)}>📦 تابعوا الجرد (كم باقي)</button>;
            return (
              <div className={`supply ${s.state}`}>
                <span>📦 باقي <b>{s.stock}</b> {s.unit}{s.days !== null && s.stock > 0 ? ` · يكفي ${s.days} يوم` : ""}{SUPPLY[s.state] ? ` · ${SUPPLY[s.state]}` : ""}</span>
                <button className="link small" onClick={() => refill(m)}>+ علبة جديدة</button>
              </div>
            );
          })()}
          <button className="link danger-link" onClick={() => stop(m)}>إيقاف الدواء</button>
        </div>
      ))}

      <button className="primary" onClick={() => setEditing(EMPTY)}>+ أضف دواء</button>
      {message && <div className="alert info">{message}</div>}

      {stopped.length > 0 && (
        <div className="card">
          <h3>أدوية موقوفة</h3>
          {stopped.map((m) => (
            <div key={m.id} className="row-between">
              <span className="muted">{m.name} {m.dose && `— ${m.dose}`}</span>
              <button className="link" onClick={() => save({ ...m })}>رجّعه</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
