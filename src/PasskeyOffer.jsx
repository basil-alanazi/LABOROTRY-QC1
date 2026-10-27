import { useEffect, useState } from "react";
import { api } from "./api";
import { biometricName, cancelled, getOffer, hasBiometrics, registerPasskey, setOffer } from "./passkey";
import { fmtShortDate } from "./dose";

// بعد أول دخول بالباسوورد: نعرض تفعيل الدخول بالبصمة مرة وحدة
export function PasskeyOffer() {
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { if (!getOffer()) hasBiometrics().then(setShow); }, []);
  if (!show) return null;
  async function enable() {
    setMsg("");
    try { await registerPasskey(); setMsg(`تفعّل ✓ المرة الجاية ادخل بـ${biometricName()}`); setTimeout(() => setShow(false), 2500); }
    catch (e) { if (!cancelled(e)) setMsg("⚠️ " + e.message); }
  }
  return (
    <div className="card bio-offer">
      <b>🔐 تبي تدخل بـ{biometricName()}؟</b>
      <p className="muted">بدل اليوزر والباسوورد كل مرة. البصمة تبقى في جوالك وما تنرسل لأحد.</p>
      {msg && <div className={msg.startsWith("⚠️") ? "alert danger" : "alert info"}>{msg}</div>}
      {!msg.includes("✓") && <div className="bio-actions">
        <button className="primary" onClick={enable}>فعّل</button>
        <button className="secondary" onClick={() => { setOffer("no"); setShow(false); }}>مو الحين</button>
      </div>}
    </div>
  );
}

// صفحة الحساب: الأجهزة اللي تدخل بالبصمة
export function PasskeysCard() {
  const [list, setList] = useState([]);
  const [bio, setBio] = useState(false);
  const [msg, setMsg] = useState("");
  const load = () => api.passkeys().then(setList).catch(() => {});
  useEffect(() => { load(); hasBiometrics().then(setBio); }, []);
  if (!bio && !list.length) return null;
  async function add() {
    setMsg("");
    try { await registerPasskey(); setMsg("تفعّل على هالجوال ✓"); load(); } catch (e) { if (!cancelled(e)) setMsg("⚠️ " + e.message); }
  }
  return (
    <div className="card">
      <h3>🔐 الدخول بالبصمة أو الوجه</h3>
      {list.map((k) => (
        <div key={k.id} className="row-between member">
          <span>{k.name} <small className="muted">· {fmtShortDate(k.created_at)}</small></span>
          <button className="link small danger-link" onClick={() => confirm("توقف الدخول بالبصمة من هالجهاز؟") && api.removePasskey(k.id).then(load)}>إيقاف</button>
        </div>
      ))}
      {!list.length && <p className="muted">ادخل بـ{biometricName()} بدل الباسوورد. البصمة تبقى في جوالك.</p>}
      {msg && <div className={msg.startsWith("⚠️") ? "alert danger" : "alert info"}>{msg}</div>}
      {bio && <button className="secondary" onClick={add}>+ فعّل على هالجوال</button>}
    </div>
  );
}
