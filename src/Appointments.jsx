import { useState } from "react";
import { api } from "./api";
import { apptDate, dayKey, fmtDate, fmtTime, relativeDays } from "./dose";

const KINDS = { visit: "مراجعة", lab: "تحاليل", other: "غيره" };

export default function Appointments({ appointments, onChanged }) {
  const [form, setForm] = useState({ at: "", title: "", kind: "visit", place: "", notes: "" });
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const set = (k, v) => setForm({ ...form, [k]: v });

  const todayStart = new Date(dayKey(new Date()));
  const upcoming = appointments.filter((a) => apptDate(a.at) >= todayStart).sort((a, b) => (a.at < b.at ? -1 : 1));
  const past = appointments.filter((a) => apptDate(a.at) < todayStart);

  async function save() {
    try {
      await api.addAppointment(form);
      setForm({ at: "", title: "", kind: "visit", place: "", notes: "" });
      setOpen(false);
      setMessage("انحفظ الموعد ✓");
      onChanged();
    } catch (e) {
      setMessage("ما انحفظ: " + e.message);
    }
  }

  async function remove(a) {
    if (!confirm(`تحذف موعد "${a.title}"؟`)) return;
    await api.deleteAppointment(a.id).catch((e) => alert("ما انحذف: " + e.message));
    onChanged();
  }

  const item = (a) => (
    <div key={a.id} className="card appt">
      <div className="appt-when">
        <strong>{relativeDays(apptDate(a.at))}</strong>
        <span>{fmtTime(apptDate(a.at))}</span>
      </div>
      <div className="appt-body">
        <h3>{a.title} <span className="tag">{KINDS[a.kind]}</span></h3>
        <div className="muted">{fmtDate(apptDate(a.at))}</div>
        {a.place && <div className="muted">📍 {a.place}</div>}
        {a.notes && <p>{a.notes}</p>}
      </div>
      <button className="x" onClick={() => remove(a)} aria-label="حذف">×</button>
    </div>
  );

  return (
    <section>
      {open ? (
        <div className="card">
          <h3>موعد جديد</h3>
          <label>التاريخ والساعة</label>
          <input type="datetime-local" value={form.at} onChange={(e) => set("at", e.target.value)} />
          <label>النوع</label>
          <div className="chips">
            {Object.entries(KINDS).map(([k, v]) => (
              <button key={k} className={form.kind === k ? "chip on" : "chip"} onClick={() => set("kind", k)}>{v}</button>
            ))}
          </div>
          <label>العنوان</label>
          <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="مثلاً مراجعة عيادة السكري" />
          <label>المكان (اختياري)</label>
          <input value={form.place} onChange={(e) => set("place", e.target.value)} placeholder="مثلاً المستشفى أو العيادة" />
          <label>ملاحظات (اختياري)</label>
          <input value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="مثلاً صايم 8 ساعات، وخذ ورقة السكر" />
          <button className="primary" onClick={save}>احفظ الموعد</button>
          <button className="link" onClick={() => setOpen(false)}>إلغاء</button>
        </div>
      ) : (
        <button className="primary" onClick={() => setOpen(true)}>+ أضف موعد</button>
      )}

      {message && <div className="alert info">{message}</div>}

      <h3 className="section-title">الجاية</h3>
      {upcoming.length ? upcoming.map(item) : <p className="empty">ما فيه مواعيد جاية.</p>}

      {past.length > 0 && (
        <>
          <h3 className="section-title">السابقة</h3>
          <div className="past">{past.map(item)}</div>
        </>
      )}
    </section>
  );
}
