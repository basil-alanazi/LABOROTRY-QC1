import React, { useState, useEffect } from "react";
import { User, Save, CheckCircle2 } from "lucide-react";
import { supabase } from "./supabaseClient";

const inputStyle = { width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 14, boxSizing: "border-box" };
const labelStyle = { fontSize: 12.5, fontWeight: 600, color: "#516361" };

export default function MyProfile({ username }) {
  const [fullName, setFullName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

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
    </div>
  );
}
