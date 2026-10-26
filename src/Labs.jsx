import { dateLocale } from "./i18n";
import { useState } from "react";
import { api } from "./api";
import { dayKey, relativeDays } from "./dose";

const RECHECK_MONTHS = 3;

// متوسط السكر التقريبي من التراكمي (معادلة ADAG)
export const avgGlucose = (a1c) => Math.round(28.7 * a1c - 46.7);

export function a1cLevel(v) {
  if (v <= 7) return "ok";
  if (v <= 8) return "high";
  return "veryhigh";
}

const fmtDay = (d) =>
  new Date(`${d}T12:00:00+03:00`).toLocaleDateString(dateLocale(), { day: "numeric", month: "long", year: "numeric" });

function addMonths(day, n) {
  const d = new Date(`${day}T12:00:00+03:00`);
  d.setMonth(d.getMonth() + n);
  return dayKey(d);
}

const EMPTY = { taken_on: dayKey(new Date()), test: "hba1c", value: "", unit: "", notes: "" };

export default function Labs({ labs, onChanged }) {
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState("");
  const set = (k, v) => setForm({ ...form, [k]: v });

  const a1c = labs.filter((l) => l.test === "hba1c").sort((a, b) => (a.taken_on < b.taken_on ? 1 : -1));
  const others = labs.filter((l) => l.test !== "hba1c");
  const last = a1c[0];
  const nextDue = last && addMonths(last.taken_on, RECHECK_MONTHS);

  async function save() {
    try {
      if (form.id) await api.updateLab(form.id, form);
      else await api.addLab(form);
      setForm(null);
      setMessage("انحفظت النتيجة ✓");
      onChanged();
    } catch (e) {
      setMessage("ما انحفظت: " + e.message);
    }
  }

  async function remove(l) {
    if (!confirm("تحذف النتيجة؟")) return;
    await api.deleteLab(l.id).catch((e) => alert(e.message));
    setForm(null);
    onChanged();
  }

  if (form) {
    return (
      <section>
        <div className="card">
          <h3>{form.id ? "تعديل النتيجة" : "نتيجة جديدة"}</h3>
          <label>نوع التحليل</label>
          <div className="chips">
            <button className={form.test === "hba1c" ? "chip on" : "chip"} onClick={() => set("test", "hba1c")}>السكر التراكمي</button>
            <button className={form.test === "other" ? "chip on" : "chip"} onClick={() => set("test", "other")}>تحليل ثاني</button>
          </div>
          {form.test === "other" && (
            <>
              <label>اسم التحليل</label>
              <input value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} placeholder="مثلاً وظائف الكلى (Creatinine)" />
            </>
          )}
          <label>تاريخ التحليل</label>
          <input type="date" value={form.taken_on} onChange={(e) => set("taken_on", e.target.value)} />
          <label>النتيجة {form.test === "hba1c" ? "(%)" : ""}</label>
          <input type="number" inputMode="decimal" step="0.1" value={form.value} onChange={(e) => set("value", e.target.value)} placeholder={form.test === "hba1c" ? "مثلاً 9.5" : ""} />
          {form.test === "other" && (
            <>
              <label>الوحدة (اختياري)</label>
              <input value={form.unit || ""} onChange={(e) => set("unit", e.target.value)} placeholder="مثلاً mg/dL" />
            </>
          )}
          {form.test === "hba1c" && (
            <>
              <label>ملاحظة (اختياري)</label>
              <input value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} />
            </>
          )}
          <button className="primary" onClick={save}>احفظ</button>
          {form.id && <button className="link danger-link" onClick={() => remove(form)}>حذف النتيجة</button>}
          <button className="link" onClick={() => setForm(null)}>إلغاء</button>
        </div>
      </section>
    );
  }

  return (
    <section>
      {last ? (
        <div className="card a1c">
          <span className="muted">آخر سكر تراكمي — {fmtDay(last.taken_on)}</span>
          <strong className={`a1c-value ${a1cLevel(last.value)}`}>{last.value}%</strong>
          <p>يعني متوسط السكر تقريبًا <b>{avgGlucose(last.value)}</b> خلال آخر 3 شهور.</p>
          <p className="muted">الهدف المعتاد 7% أو أقل (متوسط 154)، والدكتور يحدد هدفه.</p>
          {nextDue && (
            <p className="next-due">🩸 التحليل الجاي: <b>{fmtDay(nextDue)}</b> ({relativeDays(new Date(`${nextDue}T12:00:00+03:00`))})</p>
          )}
        </div>
      ) : (
        <p className="empty">ما فيه نتائج للحين.</p>
      )}

      <button className="primary" onClick={() => setForm({ ...EMPTY })}>+ أضف نتيجة</button>
      {message && <div className="alert info">{message}</div>}

      {a1c.length > 0 && (
        <div className="card">
          <h3>السكر التراكمي</h3>
          <div className="a1c-bars">
            {[...a1c].reverse().map((l) => (
              <button key={l.id} className="a1c-bar" onClick={() => setForm({ ...l })} title="تعديل">
                <span className={`bar ${a1cLevel(l.value)}`} style={{ height: `${Math.min(100, (l.value / 14) * 100)}%` }} />
                <b>{l.value}%</b>
                <small>{fmtDay(l.taken_on)}</small>
              </button>
            ))}
          </div>
          <p className="hint">اضغط على أي نتيجة لتعديل تاريخها أو رقمها.</p>
        </div>
      )}

      {others.length > 0 && (
        <div className="card">
          <h3>تحاليل ثانية</h3>
          <table>
            <thead><tr><th>التاريخ</th><th>التحليل</th><th>النتيجة</th></tr></thead>
            <tbody>
              {others.map((l) => (
                <tr key={l.id} onClick={() => setForm({ ...l })}>
                  <td>{fmtDay(l.taken_on)}</td>
                  <td>{l.notes}</td>
                  <td><b>{l.value}</b> {l.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
