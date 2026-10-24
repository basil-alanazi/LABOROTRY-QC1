import { useState } from "react";
import { Sparkles } from "lucide-react";
import { api } from "./api";
import { fmtDate } from "./dose";

// نصائح الأمراض المزمنة بالذكاء الاصطناعي، مبنية على قراءاته وملاحظاتكم
export default function Advice({ advice, patient, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setBusy(true);
    setError("");
    try {
      await api.generateAdvice();
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const button = (
    <button className="primary ai-btn" disabled={busy} onClick={generate}>
      <Sparkles size={18} /> {busy ? "جاري قراءة ملفه... (نص دقيقة تقريبًا)" : advice ? "حدّث النصائح على آخر القراءات" : `طلّع نصائح لـ${patient.name}`}
    </button>
  );
  const disclaimer = <p className="disclaimer">النصائح إرشادية وما تغني عن الدكتور، وما تغيّر أي جرعة دواء. في الحالات الطارئة اتصلوا ٩٩٧.</p>;

  if (!advice) {
    return (
      <section>
        <div className="card ai-intro">
          <h3>✨ نصائح لأمراضه المزمنة</h3>
          <p>الذكاء الاصطناعي يقرا ملف <b>{patient.name}</b> ويطلّع لكل مرض:</p>
          <ul>
            <li>وضعه الحالي من قراءات السكر والضغط والتحاليل</li>
            <li>وش تسوون ووش تتجنبون</li>
            <li>علامات الخطر: متى تروحون الطوارئ</li>
            <li>أسئلة تسألونها الدكتور بالزيارة الجاية</li>
            <li>أشياء لاحظها في القراءات أو ملاحظاتكم تستاهل تسألون عنها</li>
          </ul>
          <p className="hint">💡 كل ما كتبتوا أكثر في التاريخ المرضي والملاحظات (دوخة، ألم، تنميل...)، صارت النصائح أدق.</p>
        </div>
        {button}
        {error && <div className="alert danger">{error}</div>}
        {disclaimer}
      </section>
    );
  }

  return (
    <section>
      {advice.overview && (
        <div className="card">
          <h3>وضعه العام</h3>
          <p>{advice.overview}</p>
          <p className="hint">انسوت {fmtDate(advice.created_at)}</p>
        </div>
      )}

      {advice.noticed?.length > 0 && (
        <div className="card warn-card">
          <h3>👀 لاحظنا</h3>
          {advice.noticed.map((n, i) => <p key={i}><b>{n.title}</b><br />{n.detail}</p>)}
        </div>
      )}

      {advice.conditions.map((c, i) => (
        <div key={i} className="card condition">
          <h3>{c.name}</h3>
          {c.status && <p className="cond-status">{c.status}</p>}
          {c.do.length > 0 && <><h4>✅ سوّوا</h4><ul>{c.do.map((x, j) => <li key={j}>{x}</li>)}</ul></>}
          {c.avoid.length > 0 && <><h4>🚫 تجنبوا</h4><ul>{c.avoid.map((x, j) => <li key={j}>{x}</li>)}</ul></>}
          {c.warning_signs.length > 0 && (
            <div className="alert danger"><b>🚑 علامات الخطر</b><ul>{c.warning_signs.map((x, j) => <li key={j}>{x}</li>)}</ul></div>
          )}
          {c.ask_doctor.length > 0 && <><h4>🩺 اسألوا الدكتور</h4><ul>{c.ask_doctor.map((x, j) => <li key={j}>{x}</li>)}</ul></>}
        </div>
      ))}

      {advice.daily?.length > 0 && (
        <div className="card">
          <h3>💡 عادات يومية</h3>
          <ul>{advice.daily.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      )}

      {button}
      {error && <div className="alert danger">{error}</div>}
      {disclaimer}
    </section>
  );
}
