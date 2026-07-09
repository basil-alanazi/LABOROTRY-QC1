import React, { useState } from "react";
import { FlaskConical, Lock } from "lucide-react";
import { supabase } from "./supabaseClient";

export default function Login({ config, staffAccounts, portalAccounts, onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [forcedAccount, setForcedAccount] = useState(null); // { table, id, username, role, permissions }

  async function logAuth(action, who) {
    await supabase.from("audit_log").insert({ action, entity: "auth", description: who, performed_by: who });
  }

  async function finishLogin(role, who, permissions) {
    await logAuth("login", who);
    onLogin(role, who, permissions);
  }

  function submit(e) {
    e.preventDefault();
    if (username === config.super_username && password === config.super_password) {
      finishLogin("super", username);
      return;
    }
    if (username === config.admin_username && password === config.admin_password) {
      finishLogin("admin", username);
      return;
    }
    if (username === config.admin2_username && password === config.admin2_password) {
      finishLogin("admin", username);
      return;
    }
    if (username === config.lab_username && password === config.lab_password) {
      finishLogin("staff", username);
      return;
    }
    const staffMatch = (staffAccounts || []).find((s) => s.username === username && s.password === password);
    if (staffMatch) {
      if (staffMatch.must_change_password) {
        setForcedAccount({ table: "staff_accounts", id: staffMatch.id, username, role: "staff" });
        return;
      }
      finishLogin("staff", username);
      return;
    }
    const portalMatch = (portalAccounts || []).find((s) => s.username === username && s.password === password);
    if (portalMatch) {
      if (portalMatch.must_change_password) {
        setForcedAccount({ table: "portal_accounts", id: portalMatch.id, username, role: "portal", permissions: portalMatch.permissions || [] });
        return;
      }
      finishLogin("portal", username, portalMatch.permissions || []);
      return;
    }
    setError("Incorrect username or password.");
  }

  if (forcedAccount) {
    return <ForcePasswordChange account={forcedAccount} onDone={(role, who, permissions) => finishLogin(role, who, permissions)} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F0F3F2", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'IBM Plex Sans', sans-serif", padding: 16 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');`}</style>
      <form onSubmit={submit} style={{ background: "#fff", borderRadius: 14, padding: 32, width: "100%", maxWidth: 360, border: "1px solid #E1E8E5" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div style={{ background: "#1B2B2E", borderRadius: 8, padding: 8 }}>
            <FlaskConical size={20} color="#5FBFB0" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{config.app_title || "QC Log"}</div>
            <div style={{ fontSize: 12, color: "#7B8E8A" }}>{config.app_subtitle || "Rabia Hospital · Quality Control"}</div>
          </div>
        </div>

        <label style={{ fontSize: 12.5, fontWeight: 600, color: "#516361" }}>Username
          <input style={inputStyle} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label style={{ fontSize: 12.5, fontWeight: 600, color: "#516361", display: "block", marginTop: 12 }}>Password
          <input type="password" style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        {error && <div style={{ color: "#C1432B", fontSize: 12.5, marginTop: 10 }}>{error}</div>}

        <button type="submit" style={{ marginTop: 18, width: "100%", background: "#0F7173", color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Lock size={14} /> Sign in
        </button>
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
    if (!pw1 || pw1.length < 4) { setError("Choose a password at least 4 characters long."); return; }
    if (pw1 !== pw2) { setError("Passwords don't match."); return; }
    setBusy(true);
    await supabase.from(account.table).update({ password: pw1, must_change_password: false }).eq("id", account.id);
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

const inputStyle = { width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 14, marginTop: 4, boxSizing: "border-box" };
