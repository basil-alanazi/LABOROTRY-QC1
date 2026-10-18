import { useMemo, useState } from "react";
import { api } from "./api";
import { dayKey, fmtDate, fmtTime } from "./dose";

const QUICK = ["دوخة", "تعب", "صداع", "عطش زيادة", "تنميل بالرجول", "ما نام زين", "أكل برا", "مشى"];

export default function Notes({ notes, onChanged }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const byDay = useMemo(() => {
    const groups = new Map();
    for (const n of notes) {
      const d = dayKey(n.created_at);
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d).push(n);
    }
    return [...groups.values()];
  }, [notes]);

  async function save() {
    setBusy(true);
    try {
      await api.addNote({ text });
      setText("");
      setMessage(`انحفظت ✓ — ${fmtTime(new Date())}`);
      onChanged();
    } catch (e) {
      setMessage("ما انحفظت: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(n) {
    if (!confirm("تحذف الملاحظة؟")) return;
    await api.deleteNote(n.id).catch((e) => alert("ما انحذفت: " + e.message));
    onChanged();
  }

  return (
    <section>
      <div className="card">
        <h3>ملاحظة جديدة</h3>
        <textarea rows={3} value={text} onChange={(e) => { setText(e.target.value); setMessage(""); }}
          placeholder="وش حاس فيه اليوم؟ أي تغيير أو عرض..." />
        <div className="chips quick">
          {QUICK.map((q) => (
            <button key={q} className="chip" onClick={() => setText(text ? `${text}، ${q}` : q)}>{q}</button>
          ))}
        </div>
        {text.trim() && <button className="primary" disabled={busy} onClick={save}>احفظ الملاحظة</button>}
        <p className="hint">{message || "التاريخ والساعة يتسجلون تلقائيًا."}</p>
      </div>

      {byDay.length === 0 && <p className="empty">ما فيه ملاحظات للحين.</p>}
      {byDay.map((items) => (
        <div key={items[0].id} className="card">
          <h3>{fmtDate(items[0].created_at)}</h3>
          {items.map((n) => (
            <div key={n.id} className="note-row">
              <span className="muted">{fmtTime(n.created_at)}</span>
              <p>{n.text}</p>
              <button className="x" onClick={() => remove(n)} aria-label="حذف">×</button>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
