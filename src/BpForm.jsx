import { useState } from "react";
import { api } from "./api";
import { bpLevel, fmtTime } from "./dose";

const LEVEL_NOTE = {
  veryhigh: "مرتفع جدًا — أعد القياس بعد 5 دقايق راحة، وإذا ما نزل كلّم الدكتور.",
  high: "أعلى من الطبيعي.",
  low: "منخفض — إذا معه دوخة كلّم الدكتور.",
};

export default function BpForm({ settings, onChanged }) {
  const [sys, setSys] = useState("");
  const [dia, setDia] = useState("");
  const [pulse, setPulse] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const level = sys && dia ? bpLevel({ systolic: Number(sys), diastolic: Number(dia) }, settings) : null;

  async function save() {
    setBusy(true);
    try {
      await api.addBp({ systolic: Number(sys), diastolic: Number(dia), pulse: pulse ? Number(pulse) : null });
      setMessage(`انحفظت قراءة الضغط ✓ — ${fmtTime(new Date())}`);
      setSys(""); setDia(""); setPulse("");
      onChanged();
    } catch (e) {
      setMessage("ما انحفظت: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3>سجّل قراءة الضغط</h3>
      <div className="bp-inputs">
        <div>
          <label>العالي</label>
          <input className="mid" type="number" inputMode="numeric" value={sys} onChange={(e) => { setSys(e.target.value); setMessage(""); }} placeholder="120" />
        </div>
        <span className="slash">/</span>
        <div>
          <label>الواطي</label>
          <input className="mid" type="number" inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value)} placeholder="80" />
        </div>
        <div>
          <label>النبض</label>
          <input className="mid" type="number" inputMode="numeric" value={pulse} onChange={(e) => setPulse(e.target.value)} placeholder="اختياري" />
        </div>
      </div>
      {level && LEVEL_NOTE[level] && <p className={`level-note ${level}`}>{LEVEL_NOTE[level]}</p>}
      {sys && dia && <button className="primary" disabled={busy} onClick={save}>احفظ الضغط</button>}
      {message && <p className="hint">{message}</p>}
    </div>
  );
}
