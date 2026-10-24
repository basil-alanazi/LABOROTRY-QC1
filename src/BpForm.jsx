import { useState } from "react";
import { api } from "./api";
import { bpLevel, fmtTime, spo2Level, tempLevel } from "./dose";

const BP_NOTE = {
  veryhigh: "الضغط مرتفع جدًا — أعد القياس بعد 5 دقايق راحة، وإذا ما نزل كلّم الدكتور.",
  high: "الضغط أعلى من الطبيعي.",
  low: "الضغط منخفض — إذا معه دوخة كلّم الدكتور.",
};
const TEMP_NOTE = {
  veryhigh: "الحرارة عالية جدًا أو منخفضة جدًا — كلّموا الدكتور، وإذا معها تعب شديد أو تشوش روحوا الطوارئ.",
  high: "عنده حرارة. اشربوه سوائل، وأعيدوا القياس بعد ساعة، وإذا استمرت كلّموا الدكتور. ومع السكري: قيسوا السكر أكثر.",
};
const SPO2_NOTE = {
  veryhigh: "الأكسجين منخفض (أقل من 90%) — كلّم الدكتور أو الإسعاف.",
  high: "الأكسجين أقل من الطبيعي — أعد القياس.",
};

export default function BpForm({ settings, onChanged }) {
  const [sys, setSys] = useState("");
  const [dia, setDia] = useState("");
  const [pulse, setPulse] = useState("");
  const [spo2, setSpo2] = useState("");
  const [temp, setTemp] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const bpNote = sys && dia ? BP_NOTE[bpLevel({ systolic: Number(sys), diastolic: Number(dia) }, settings)] : null;
  const spo2Note = spo2 ? SPO2_NOTE[spo2Level(Number(spo2))] : null;
  const tempNote = temp ? TEMP_NOTE[tempLevel(Number(temp))] : null;
  const ready = (sys && dia) || pulse || spo2 || temp;

  async function save() {
    setBusy(true);
    try {
      await api.addBp({ systolic: sys || null, diastolic: dia || null, pulse: pulse || null, spo2: spo2 || null, temp: temp || null });
      setMessage(`انحفظت القراءة ✓ — ${fmtTime(new Date())}`);
      setSys(""); setDia(""); setPulse(""); setSpo2(""); setTemp("");
      onChanged();
    } catch (e) {
      setMessage("ما انحفظت: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  const field = (label, value, set, placeholder, decimal = false) => (
    <div>
      <label>{label}</label>
      <input className="mid" type="number" inputMode={decimal ? "decimal" : "numeric"} step={decimal ? "0.1" : "1"} value={value}
        onChange={(e) => { set(e.target.value); setMessage(""); }} placeholder={placeholder} />
    </div>
  );

  return (
    <div className="card">
      <h3>سجّل قراءة</h3>
      <div className="bp-inputs">
        {field("الضغط العالي", sys, setSys, "120")}
        <span className="slash">/</span>
        {field("الضغط الواطي", dia, setDia, "80")}
      </div>
      <div className="two-col">
        {field("النبض", pulse, setPulse, "75")}
        {field("الأكسجين %", spo2, setSpo2, "97")}
      </div>
      <div className="two-col">
        {field("الحرارة °C", temp, setTemp, "36.8", true)}
        <div />
      </div>
      {bpNote && <p className="level-note veryhigh">{bpNote}</p>}
      {spo2Note && <p className="level-note veryhigh">{spo2Note}</p>}
      {tempNote && <p className="level-note veryhigh">{tempNote}</p>}
      {ready && <button className="primary" disabled={busy} onClick={save}>احفظ القراءة</button>}
      <p className="hint">{message || "تقدر تسجل الضغط بس، أو النبض، أو الأكسجين، أو الحرارة. والتاريخ والساعة يتسجلون تلقائيًا."}</p>
    </div>
  );
}
