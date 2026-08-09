import React, { useState, useEffect } from "react";
import { FlaskConical, Lock } from "lucide-react";
import { supabase } from "./supabaseClient";
import { playWelcomeChime } from "./sounds";

// Login credentials are verified entirely through Supabase Auth
// (supabase.auth.signInWithPassword) — never by fetching passwords into
// the browser and comparing them in JS. login_lookup is a view (safe to
// read while signed out — see ADD_LOGIN_LOOKUP_VIEWS.sql) that maps a
// typed username to the internal synthetic email Auth knows it by; it
// exposes no passwords or other account data. public_branding is the
// same idea for the handful of Settings fields the sign-in screen itself
// needs to render before anyone is authenticated.
export default function Login({ onLogin }) {
  const [rawUsername, setUsername] = useState("");
  const [rawPassword, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forcedAccount, setForcedAccount] = useState(null); // { table, id, username, role, permissions }
  const [otpPending, setOtpPending] = useState(null); // { role, who, permissions, maskedEmail }
  const [branding, setBranding] = useState({});

  useEffect(() => {
    supabase.from("public_branding").select("*").maybeSingle().then(({ data }) => setBranding(data || {}));
  }, []);

  async function logAuth(action, who) {
    await supabase.from("audit_log").insert({ action, entity: "auth", description: who, performed_by: who });
  }

  async function finishLogin(role, who, permissions) {
    playWelcomeChime();
    await logAuth("login", who);
    onLogin(role, who, permissions);
  }

  async function proceedAfterPassword(role, who, permissions) {
    setError("");
    const { data: profile } = await supabase.from("user_profiles").select("email").eq("username", who).maybeSingle();
    const email = (profile?.email || "").trim();
    if (!email) {
      finishLogin(role, who, permissions);
      return;
    }
    try {
      const res = await fetch("/api/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: who }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't send the verification code. Try again.");
        return;
      }
      setOtpPending({ role, who, permissions, maskedEmail: data.email });
    } catch {
      setError("Couldn't send the verification code. Try again.");
    }
  }

  async function submit(e) {
    e.preventDefault();
    const username = rawUsername.trim();
    const password = rawPassword.trim();
    if (!username || !password) return;
    setError("");
    setBusy(true);
    try {
      const { data: lookup } = await supabase.from("login_lookup").select("*").eq("username", username).maybeSingle();
      if (!lookup) { setError("Incorrect username or password."); return; }

      const { error: authError } = await supabase.auth.signInWithPassword({ email: lookup.auth_email, password });
      if (authError) { setError("Incorrect username or password."); return; }

      // Shared/fixed logins (super, admin, admin2, the shared staff login)
      // have no individual row to check — nothing more to look up.
      if (!lookup.account_id) {
        proceedAfterPassword(lookup.kind, username);
        return;
      }

      // Individual staff/portal login — now that we have a verified
      // session, read the actual row to get must_change_password/permissions.
      const table = lookup.kind === "portal" ? "portal_accounts" : "staff_accounts";
      const { data: account } = await supabase.from(table).select("*").eq("id", lookup.account_id).maybeSingle();
      if (!account) { setError("Account not found."); return; }
      if (account.must_change_password) {
        setForcedAccount({ table, id: account.id, username, role: lookup.kind, permissions: account.permissions || [] });
        return;
      }
      proceedAfterPassword(lookup.kind, username, account.permissions || []);
    } finally {
      setBusy(false);
    }
  }

  if (otpPending) {
    return (
      <OtpVerify
        pending={otpPending}
        onBack={() => setOtpPending(null)}
        onVerified={() => finishLogin(otpPending.role, otpPending.who, otpPending.permissions)}
      />
    );
  }

  if (forcedAccount) {
    return <ForcePasswordChange account={forcedAccount} onDone={(role, who, permissions) => proceedAfterPassword(role, who, permissions)} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: branding.page_bg_color || "#F0F3F2", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'IBM Plex Sans', sans-serif", padding: 16 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');`}</style>
      <form onSubmit={submit} style={{ background: "#fff", borderRadius: 14, padding: 32, width: "100%", maxWidth: 360, border: "1px solid #E1E8E5" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div style={{ background: branding.sidebar_color || "#1B2B2E", borderRadius: 8, padding: 8 }}>
            {branding.logo_url ? <img src={branding.logo_url} alt="logo" style={{ width: 28, height: 28, borderRadius: 5, objectFit: "contain" }} /> : <FlaskConical size={20} color="#5FBFB0" />}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{branding.app_title || "QC Log"}</div>
            <div style={{ fontSize: 12, color: "#7B8E8A" }}>{branding.app_subtitle || "Rabia Hospital · Quality Control"}</div>
          </div>
        </div>

        <label style={{ fontSize: 12.5, fontWeight: 600, color: "#516361" }}>Username
          <input style={inputStyle} value={rawUsername} onChange={(e) => setUsername(e.target.value)} autoFocus autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck="false" />
        </label>
        <label style={{ fontSize: 12.5, fontWeight: 600, color: "#516361", display: "block", marginTop: 12 }}>Password
          <input type="password" style={inputStyle} value={rawPassword} onChange={(e) => setPassword(e.target.value)} />
        </label>

        {error && <div style={{ color: "#C1432B", fontSize: 12.5, marginTop: 10 }}>{error}</div>}

        <button type="submit" disabled={busy} style={{ marginTop: 18, width: "100%", background: "#0F7173", color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: busy ? 0.7 : 1 }}>
          <Lock size={14} /> {busy ? "Signing in…" : "Sign in"}
        </button>

        <div style={{ marginTop: 18, textAlign: "center", fontSize: 12, color: "#8FA39E", letterSpacing: 0.3 }}>
          Welcome to Rabia Hospital Lab Family
        </div>
      </form>
    </div>
  );
}

function ForcePasswordChange({ account, onDone }) {
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    const trimmed = pw1.trim();
    if (!trimmed || trimmed.length < 4) { setError("Choose a password at least 4 characters long."); return; }
    if (trimmed !== pw2.trim()) { setError("Passwords don't match."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: account.table, id: account.id, password: trimmed, mustChangePassword: false }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      const prefix = account.table === "staff_accounts" ? "staff" : "portal";
      await supabase.auth.signInWithPassword({ email: `${prefix}-${account.id}@rabia-lab.internal`, password: trimmed }).catch(() => {});
    } catch (err) {
      setError(err.message || "Couldn't save the new password. Try again.");
      setBusy(false);
      return;
    }
    setBusy(false);
    onDone(account.role, account.username, account.permissions);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F0F3F2", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'IBM Plex Sans', sans-serif", padding: 16 }}>
      <form onSubmit={save} style={{ background: "#fff", borderRadius: 14, padding: 32, width: "100%", maxWidth: 360, border: "1px solid #E1E8E5" }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Set a new password</div>
        <div style={{ fontSize: 12.5, color: "#7B8E8A", marginBottom: 20 }}>First time signing in as <b>{account.username}</b> — choose your own password before continuing.</div>

        <label style={{ fontSize: 12.5, fontWeight: 600, color: "#516361" }}>New password
          <input type="password" style={inputStyle} value={pw1} onChange={(e) => setPw1(e.target.value)} autoFocus />
        </label>
        <label style={{ fontSize: 12.5, fontWeight: 600, color: "#516361", display: "block", marginTop: 12 }}>Confirm password
          <input type="password" style={inputStyle} value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </label>

        {error && <div style={{ color: "#C1432B", fontSize: 12.5, marginTop: 10 }}>{error}</div>}

        <button type="submit" disabled={busy} style={{ marginTop: 18, width: "100%", background: "#0F7173", color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, fontSize: 14, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Saving…" : "Save & continue"}
        </button>
      </form>
    </div>
  );
}

function OtpVerify({ pending, onBack, onVerified }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function verify(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: pending.who, code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setError(data.error || "Incorrect code.");
        return;
      }
      onVerified();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setResending(true);
    setError("");
    setResent(false);
    try {
      const res = await fetch("/api/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: pending.who }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Couldn't resend the code."); return; }
      setResent(true);
    } catch {
      setError("Couldn't resend the code.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F0F3F2", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'IBM Plex Sans', sans-serif", padding: 16 }}>
      <form onSubmit={verify} style={{ background: "#fff", borderRadius: 14, padding: 32, width: "100%", maxWidth: 360, border: "1px solid #E1E8E5" }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Enter verification code</div>
        <div style={{ fontSize: 12.5, color: "#7B8E8A", marginBottom: 20 }}>We sent a 6-digit code to <b>{pending.maskedEmail}</b>.</div>

        <label style={{ fontSize: 12.5, fontWeight: 600, color: "#516361" }}>Code
          <input style={inputStyle} value={code} onChange={(e) => setCode(e.target.value)} autoFocus inputMode="numeric" maxLength={6} />
        </label>

        {error && <div style={{ color: "#C1432B", fontSize: 12.5, marginTop: 10 }}>{error}</div>}
        {resent && <div style={{ color: "#2F6B4F", fontSize: 12.5, marginTop: 10 }}>New code sent.</div>}

        <button type="submit" disabled={busy} style={{ marginTop: 18, width: "100%", background: "#0F7173", color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, fontSize: 14, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Verifying…" : "Verify & continue"}
        </button>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
          <button type="button" onClick={onBack} style={{ background: "none", border: "none", color: "#8FA39E", fontSize: 12.5, fontWeight: 600 }}>← Back</button>
          <button type="button" onClick={resend} disabled={resending} style={{ background: "none", border: "none", color: "#0F7173", fontSize: 12.5, fontWeight: 600 }}>{resending ? "Sending…" : "Resend code"}</button>
        </div>
      </form>
    </div>
  );
}

const inputStyle = { width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 14, marginTop: 4, boxSizing: "border-box" };
