import { useState } from "react";
import { LogoMark } from "./Logo";
import { api } from "./api";
import { Verse } from "./Verse";

export default function Login({ onDone }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.login(username.trim(), password);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-hero">
        <LogoMark className="login-mark" />
        <div className="logo">ود</div>
        <p className="tagline">متابعة صحة من نحب</p>
        <Verse className="on-dark" />
      </div>
      <form className="card login-card" onSubmit={submit}>
        <h2>تسجيل الدخول</h2>
        <label>اليوزر</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" dir="ltr" />
        <label>الباسوورد</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" dir="ltr" />
        {error && <p className="level-note veryhigh">{error}</p>}
        <button className="primary" disabled={busy || !username || !password}>{busy ? "جاري الدخول..." : "دخول"}</button>
        <p className="hint center">ما عندك حساب؟ اطلبه من مدير الموقع.</p>
      </form>
    </div>
  );
}
