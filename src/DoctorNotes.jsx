import { useState } from "react";
import { api } from "./api";
import { fmtShortDate, fmtTime } from "./dose";

// ملاحظات بين العائلة والدكتور عن المريض: كل طرف يكتب، والثاني يوصله إشعار
export default function DoctorNotes({ doctorNotes = [], me, onChanged }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const doctor = me.user.is_doctor;
  const list = [...doctorNotes].reverse();

  async function send() {
    setBusy(true); setMessage("");
    try { await api.addDoctorNote({ text }); setText(""); onChanged(); } catch (e) { setMessage("⚠️ " + e.message); }
    setBusy(false);
  }

  return (
    <section>
      <p className="hint">{doctor ? "اكتب ملاحظاتك وتعليماتك للعائلة، ويوصلهم إشعار." : "اكتبوا للدكتور أي سؤال أو ملاحظة عن حالته، ويوصله إشعار. وردوده تطلع هنا."}</p>
      <div className="dn-thread">
        {!list.length && <p className="empty">ما فيه ملاحظات للحين.</p>}
        {list.map((n) => (
          <div key={n.id} className={`dn-msg ${n.from_doctor ? "doc" : "fam"}`}>
            <b>{n.from_doctor ? "🩺 " : ""}{n.author}</b>
            <p>{n.text}</p>
            <small>{fmtShortDate(n.created_at)} {fmtTime(n.created_at)}
              {n.user_id === me.user.id && <button className="link small danger-link" onClick={() => confirm("تحذف الملاحظة؟") && api.deleteDoctorNote(n.id).then(onChanged)}>حذف</button>}
            </small>
          </div>
        ))}
      </div>
      <div className="card dn-new">
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={doctor ? "مثلاً: خفّفوا جرعة العشاء وحدتين، وقيسوا السكر الساعة 3 الفجر يومين" : "مثلاً: السكر يرتفع الصبح رغم الجرعة، وش نسوي؟"} />
        {message && <div className="alert danger">{message}</div>}
        <button className="primary" disabled={busy || !text.trim()} onClick={send}>{busy ? "جاري الإرسال..." : doctor ? "أرسل للعائلة" : "أرسل للدكتور"}</button>
      </div>
    </section>
  );
}
