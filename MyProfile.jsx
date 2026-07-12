import React, { useState, useEffect } from "react";
import { User, Save, CheckCircle2, Bell, BellOff } from "lucide-react";
import { supabase } from "./supabaseClient";
import { pushSupported, getSubscriptionStatus, enablePushReminders, disablePushReminders } from "./pushNotifications";

const inputStyle = { width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 14, boxSizing: "border-box" };
const labelStyle = { fontSize: 12.5, fontWeight: 600, color: "#516361" };

export default function MyProfile({ username }) {
  const [fullName, setFullName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [pushStatus, setPushStatus] = useState("checking"); // checking | subscribed | unsubscribed | unsupported
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");
  const [pushStep, setPushStep] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testMsg, setTestMsg] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState("");

  useEffect(() => {
    getSubscriptionStatus().then(setPushStatus);
    const swErr = localStorage.getItem("qc_sw_error");
    if (swErr) setPushError(`Background service failed to start: ${swErr}`);
  }, []);

  async function changePassword() {
    setPwMsg("");
    const trimmed = newPassword.trim();
    if (trimmed.length < 4) { setPwMsg("Password should be at least 4 characters."); return; }
    if (trimmed !== confirmPassword.trim()) { setPwMsg("Passwords don't match."); return; }
    setPwSaving(true);
    try {
      const { data: s } = await supabase.from("staff_accounts").update({ password: trimmed, must_change_password: false }).eq("username", username).select();
      if (s && s.length > 0) { setPwMsg("Password updated."); setNewPassword(""); setConfirmPassword(""); return; }
      const { data: p } = await supabase.from("portal_accounts").update({ password: trimmed, must_change_password: false }).eq("username", username).select();
      if (p && p.length > 0) { setPwMsg("Password updated."); setNewPassword(""); setConfirmPassword(""); return; }
      setPwMsg("Couldn't find an individual login for this username — shared accounts (like the main staff/admin logins) can't be changed here.");
    } catch (err) {
      setPwMsg(`Save failed: ${err.message}`);
    } finally {
      setPwSaving(false);
    }
  }

  async function sendTestNotification() {
    setTestSending(true);
    setTestMsg("");
    try {
      const res = await fetch(`/api/send-test-notification?username=${encodeURIComponent(username)}`);
      const data = await res.json();
      if (!res.ok) { setTestMsg(`❌ ${data.error || "Failed to send"}`); return; }
      setTestMsg(data.sent > 0 ? "✅ Sent! Check your notifications." : "❌ Nothing to send to — try re-enabling reminders.");
    } catch (err) {
      setTestMsg(`❌ ${err.message}`);
    } finally {
      setTestSending(false);
    }
  }

  async function togglePush() {
    setPushBusy(true);
    setPushError("");
    setPushStep("");
    try {
      if (pushStatus === "subscribed") {
        setPushStep("Turning off…");
        await disablePushReminders(username);
        setPushStatus("unsubscribed");
      } else {
        await enablePushReminders(username, setPushStep);
        setPushStatus("subscribed");
      }
    } catch (err) {
      setPushError(err.message || "Couldn't change notification settings.");
    } finally {
      setPushBusy(false);
      setPushStep("");
    }
  }

  useEffect(() => {
    let active = true;
    async function load() {
      const { data } = await supabase.from("user_profiles").select("*").eq("username", username).maybeSingle();
      if (!active) return;
      if (data) {
        setFullName(data.full_name || "");
        setEmployeeId(data.employee_id || "");
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [username]);

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    const { error: err } = await supabase.from("user_profiles").upsert({
      username,
      full_name: fullName.trim(),
      employee_id: employeeId.trim(),
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (err) {
      setError("Could not save. Please try again.");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#8A9694" }}>Loading…</div>;

  const previewSignature = fullName.trim() ? (employeeId.trim() ? `${fullName.trim()} (${employeeId.trim()})` : fullName.trim()) : username;

  return (
    <div style={{ maxWidth: 480 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        <User size={19} /> My profile
      </h2>
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 24 }}>
        This shows up as your signature instead of your username, everywhere you log a result, approve something, or sign in.
      </div>

      <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={labelStyle}>
          Full name
          <input style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Basil Alenizi" />
        </label>
        <label style={labelStyle}>
          Employee ID
          <input style={inputStyle} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="e.g. 4521" />
        </label>

        <div style={{ background: "#F7F9F8", borderRadius: 7, padding: "10px 12px", fontSize: 12.5, color: "#516361" }}>
          Your signature will appear as: <b>{previewSignature}</b>
        </div>

        <button onClick={save} disabled={saving} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: saving ? 0.7 : 1 }}>
          {saved ? <><CheckCircle2 size={15} /> Saved</> : <><Save size={14} /> {saving ? "Saving…" : "Save"}</>}
        </button>
        {error && <div style={{ fontSize: 12.5, color: "#C1432B" }}>{error}</div>}
      </div>

      <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 16, marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <Bell size={16} /> Shift reminders
        </div>
        <div style={{ fontSize: 12.5, color: "#7B8E8A", marginBottom: 12 }}>
          Get a notification an hour before your shift starts, and again when it ends — even if this tab is closed. Requires your Employee ID above to match your entry on the Staff roster.
        </div>
        {pushStatus === "unsupported" ? (
          <div style={{ fontSize: 12.5, color: "#B8860B" }}>Notifications aren't supported in this browser. Try Chrome or Safari on iOS 16.4+.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                onClick={togglePush}
                disabled={pushBusy || pushStatus === "checking"}
                aria-label="Toggle shift reminders"
                style={{
                  position: "relative", width: 52, height: 30, borderRadius: 15, border: "none",
                  background: pushStatus === "subscribed" ? "#0F7173" : "#D6DEDA",
                  transition: "background 0.2s", flexShrink: 0, opacity: pushBusy ? 0.6 : 1,
                }}
              >
                <span style={{
                  position: "absolute", top: 3, left: pushStatus === "subscribed" ? 25 : 3,
                  width: 24, height: 24, borderRadius: "50%", background: "#fff",
                  transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                }} />
              </button>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1B2B2E", display: "flex", alignItems: "center", gap: 6 }}>
                {pushStatus === "subscribed" ? <Bell size={14} /> : <BellOff size={14} />}
                {pushBusy ? (pushStep || "Working…") : (pushStatus === "subscribed" ? "Shift reminders on" : "Shift reminders off")}
              </div>
            </div>
            {pushStatus === "subscribed" && (
              <button onClick={sendTestNotification} disabled={testSending} style={{ alignSelf: "flex-start", background: "none", border: "1px solid #C7D1CE", color: "#516361", borderRadius: 8, padding: "10px 16px", fontWeight: 700, fontSize: 13.5, opacity: testSending ? 0.6 : 1 }}>
                {testSending ? "Sending…" : "Send test notification"}
              </button>
            )}
          </div>
        )}
        {testMsg && <div style={{ fontSize: 12.5, color: testMsg.startsWith("✅") ? "#2F6B4F" : "#C1432B", marginTop: 8 }}>{testMsg}</div>}
        {pushError && <div style={{ fontSize: 12.5, color: "#C1432B", marginTop: 8 }}>{pushError}</div>}
      </div>

      <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 16, marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Change my password</div>
        <label style={labelStyle}>New password
          <input type="password" style={{ ...inputStyle, marginTop: 4 }} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </label>
        <label style={{ ...labelStyle, display: "block", marginTop: 10 }}>Confirm new password
          <input type="password" style={{ ...inputStyle, marginTop: 4 }} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </label>
        <button onClick={changePassword} disabled={pwSaving} style={{ marginTop: 14, background: "#0F7173", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 700, fontSize: 13.5, opacity: pwSaving ? 0.6 : 1 }}>
          {pwSaving ? "Saving…" : "Update password"}
        </button>
        {pwMsg && <div style={{ fontSize: 12.5, color: pwMsg === "Password updated." ? "#2F6B4F" : "#C1432B", marginTop: 8 }}>{pwMsg}</div>}
      </div>
    </div>
  );
}
