import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

const inputStyle = { border: "1px solid #C7D1CE", borderRadius: 7, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" };

const ACTION_META = {
  login: { bg: "#E8F2EC", fg: "#2F6B4F" },
  logout: { bg: "#F0F3F2", fg: "#516361" },
  add: { bg: "#E7F0FB", fg: "#3E6ACF" },
  edit: { bg: "#FBF3DF", fg: "#B8860B" },
  delete: { bg: "#FBEAE6", fg: "#C1432B" },
  approved: { bg: "#E8F2EC", fg: "#2F6B4F" },
  declined: { bg: "#FBEAE6", fg: "#C1432B" },
};

export default function AuditTrail() {
  const [logs, setLogs] = useState(null);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  async function load() {
    const { data } = await supabase.from("audit_log").select("*").order("performed_at", { ascending: false }).limit(500);
    setLogs(data || []);
  }
  useEffect(() => { load(); }, []);

  if (logs === null) return <div style={{ padding: 40, textAlign: "center", color: "#8A9694" }}>Loading…</div>;

  const filtered = logs.filter((l) => {
    if (actionFilter && l.action !== actionFilter) return false;
    if (search && !`${l.description} ${l.performed_by}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const actions = [...new Set(logs.map((l) => l.action))];

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Audit trail</h2>
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>Every login, logout, edit, delete, and approval — most recent 500.</div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={inputStyle}>
          <option value="">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#8A9694" }}>No matching activity.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {filtered.map((l) => {
            const m = ACTION_META[l.action] || { bg: "#F0F3F2", fg: "#516361" };
            return (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #E1E8E5", borderRadius: 7, padding: "8px 12px", fontSize: 12.5 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: m.fg, background: m.bg, padding: "3px 8px", borderRadius: 5, textTransform: "uppercase" }}>{l.action}</span>
                <span style={{ flex: 1 }}>{l.description}</span>
                <span style={{ color: "#8A9694" }}>{l.performed_by}</span>
                <span style={{ color: "#8A9694", fontSize: 11 }}>{new Date(l.performed_at).toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
