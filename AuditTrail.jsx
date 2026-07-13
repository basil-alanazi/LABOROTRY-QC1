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

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function AuditTrail() {
  const [logs, setLogs] = useState(null);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState(daysAgo(7));
  const [dateTo, setDateTo] = useState(todayISO());

  async function load() {
    setLogs(null);
    const { data } = await supabase.from("audit_log").select("*")
      .gte("performed_at", `${dateFrom}T00:00:00`)
      .lte("performed_at", `${dateTo}T23:59:59`)
      .order("performed_at", { ascending: false })
      .limit(2000);
    setLogs(data || []);
  }
  useEffect(() => { load(); }, [dateFrom, dateTo]);

  if (logs === null) return <div style={{ padding: 40, textAlign: "center", color: "#8A9694" }}>Loading…</div>;

  const filtered = logs.filter((l) => {
    if (actionFilter && l.action !== actionFilter) return false;
    if (search && !`${l.description} ${l.performed_by}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const actions = [...new Set(logs.map((l) => l.action))];

  return (
    <div>
      <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Audit trail</h2>
        <button onClick={() => window.print()} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "#516361" }}>🖨️ Print</button>
      </div>
      <div className="no-print" style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>Every login, logout, edit, delete, and approval — pick a period to keep it fast as history grows.</div>

      <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#7B8E8A" }}>From</span>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
        <span style={{ fontSize: 12, color: "#7B8E8A" }}>To</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
        {[["Today", 0], ["7 days", 7], ["30 days", 30], ["90 days", 90]].map(([label, n]) => (
          <button key={label} onClick={() => { setDateFrom(daysAgo(n)); setDateTo(todayISO()); }} style={{ background: "#F0F3F2", border: "none", borderRadius: 6, padding: "7px 10px", fontSize: 11.5, fontWeight: 600, color: "#516361" }}>{label}</button>
        ))}
      </div>

      <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={inputStyle}>
          <option value="">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#8A9694" }}>No matching activity in this period.</div>
      ) : (
        <div className="print-area" style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {filtered.map((l) => {
            const m = ACTION_META[l.action] || { bg: "#F0F3F2", fg: "#516361" };
            return (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #E1E8E5", borderRadius: 7, padding: "8px 12px", fontSize: 12.5 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: m.fg, background: m.bg, padding: "3px 8px", borderRadius: 5, textTransform: "uppercase" }}>{l.action}</span>
                <span style={{ flex: 1 }}>{l.description}</span>
                <span style={{ color: "#8A9694" }}>{l.performed_by}</span>
                <span style={{ color: "#8A9694", fontSize: 11 }}>{new Date(l.performed_at).toLocaleString("en-US")}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
