import React, { useState, useEffect, useMemo } from "react";
import { FlaskConical, LayoutGrid, Grid3x3, SlidersHorizontal, LogOut, Check, X, Trash2, Download, ClipboardCheck, Table2, FolderOpen } from "lucide-react";
import { supabase } from "./supabaseClient";
import Login from "./Login";
import Settings from "./Settings";
import CustomTables from "./CustomTables";
import Files from "./Files";
import { evaluateWestgard, zScore, RULE_DESCRIPTIONS } from "./westgard";

const DEPT_PALETTE = ["#0F7173", "#B5473A", "#8A5A2B", "#5A6ACF", "#2F8F5B", "#B8860B", "#7A4FA3", "#C1432B"];
function deptColor(dept, list) {
  const i = Math.max(0, list.indexOf(dept));
  return DEPT_PALETTE[i % DEPT_PALETTE.length];
}
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString() : "");
function daysInMonth(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const COLOR_META = {
  pending: { bg: "#F0F3F2", fg: "#516361" },
  green: { bg: "#E8F2EC", fg: "#2F6B4F" },
  orange: { bg: "#FBF3DF", fg: "#B8860B" },
  red: { bg: "#FBEAE6", fg: "#C1432B" },
};
const colorRank = { pending: 0, green: 0, orange: 1, red: 2 };

const inputStyle = { width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 14, boxSizing: "border-box" };
const labelStyle = { fontSize: 12.5, fontWeight: 600, color: "#516361" };

export default function App() {
  const [config, setConfig] = useState(null);
  const [role, setRole] = useState(() => localStorage.getItem("qc_role") || null);
  const [username, setUsername] = useState(() => localStorage.getItem("qc_username") || "");
  const [panels, setPanels] = useState(null);
  const [entries, setEntries] = useState(null);
  const [staffAccounts, setStaffAccounts] = useState([]);
  const [tab, setTab] = useState("dashboard");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function ensureConfig() {
    let { data } = await supabase.from("app_config").select("*").eq("id", 1).maybeSingle();
    if (!data) {
      await supabase.from("app_config").insert({ id: 1 });
      const r = await supabase.from("app_config").select("*").eq("id", 1).maybeSingle();
      data = r.data;
    }
    setConfig(data);
  }

  async function loadAll() {
    const { data: p, error: e1 } = await supabase.from("qc_panels").select("*").eq("deleted", false).order("name");
    const { data: e, error: e2 } = await supabase.from("qc_entries").select("*").order("date", { ascending: false });
    const { data: s } = await supabase.from("staff_accounts").select("*").order("username");
    if (e1 || e2) {
      setError("Could not connect to the database. Check Supabase settings.");
      setPanels([]);
      setEntries([]);
      return;
    }
    setPanels(p || []);
    setEntries(e || []);
    setStaffAccounts(s || []);
  }

  useEffect(() => {
    ensureConfig();
    loadAll();
  }, []);

  function handleLogin(newRole, newUsername) {
    localStorage.setItem("qc_role", newRole);
    localStorage.setItem("qc_username", newUsername);
    setRole(newRole);
    setUsername(newUsername);
  }
  function logout() {
    localStorage.removeItem("qc_role");
    localStorage.removeItem("qc_username");
    setRole(null);
    setUsername("");
  }

  async function logActivity(action, description) {
    await supabase.from("audit_log").insert({ action, entity: "qc_entry", description, performed_by: username });
  }

  // Evaluate one analyte's value against its Westgard baseline (establishing it
  // automatically from the first 20 points if needed).
  async function evaluateAnalyte(panel, analyteName, lot, value, date) {
    const { data: baseline } = await supabase
      .from("qc_baselines").select("*").eq("panel_id", panel.id).eq("analyte_name", analyteName).eq("lot_number", lot).eq("active", true).maybeSingle();

    if (!baseline) {
      const { data: pastEntries } = await supabase
        .from("qc_entries").select("values").eq("panel_id", panel.id).eq("lot_number", lot).eq("deleted", false);
      const pastValues = (pastEntries || []).map((e) => e.values?.[analyteName]).filter((v) => v !== undefined && v !== null);
      const countAfter = pastValues.length + 1;
      if (countAfter >= 20) {
        const values = [...pastValues, value];
        const mean = values.reduce((s, v) => s + v, 0) / values.length;
        const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
        const sd = Math.sqrt(variance) || 0.0001;
        await supabase.from("qc_baselines").insert({ panel_id: panel.id, analyte_name: analyteName, lot_number: lot, mean, sd, point_count: values.length });
      }
      return { color: "pending", flags: [], z: null };
    }

    const z = zScore(value, baseline.mean, baseline.sd);
    const { data: pastEntries } = await supabase
      .from("qc_entries").select("values,colors,date,created_at").eq("panel_id", panel.id).eq("lot_number", lot).eq("deleted", false).order("created_at", { ascending: true });
    const history = (pastEntries || [])
      .filter((e) => e.colors?.[analyteName] && e.colors[analyteName] !== "pending")
      .map((e) => zScore(e.values[analyteName], baseline.mean, baseline.sd));

    const { flags, color } = evaluateWestgard(z, history, []);
    return { color, flags, z };
  }

  // Submit (or overwrite) the whole day's panel entry — one row per panel per date.
  async function submitEntry(panel, date, valuesInput, note, existingEntryId) {
    setBusy(true);
    try {
      const lot = panel.lot_number || "";
      const values = {};
      const colors = {};
      const flags = {};
      for (const analyte of panel.analytes || []) {
        const raw = valuesInput[analyte.name];
        if (raw === undefined || raw === "" || raw === null) continue;
        const value = Number(raw);
        values[analyte.name] = value;
        const { color, flags: f } = await evaluateAnalyte(panel, analyte.name, lot, value, date);
        colors[analyte.name] = color;
        flags[analyte.name] = f;
      }

      if (existingEntryId) {
        await supabase.from("qc_entries").update({
          values, colors, flags, note: note || "", edited_by: username, edited_at: new Date().toISOString(),
          review_status: "pending", review_note: "", reviewed_by: null, reviewed_at: null,
        }).eq("id", existingEntryId);
        await logActivity("edit", `${panel.name} — ${date} (resubmitted for review)`);
      } else {
        await supabase.from("qc_entries").insert({
          panel_id: panel.id, date, lot_number: lot, values, colors, flags, done_by: username, note: note || "",
        });
        await logActivity("add", `${panel.name} — ${date}`);
      }
      loadAll();
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(entry) {
    if (role !== "admin" && role !== "super") return;
    if (!confirm("Remove this day's entry? It stays visible in Reports for audit purposes.")) return;
    const panel = panels.find((p) => p.id === entry.panel_id);
    await supabase.from("qc_entries").update({ deleted: true, deleted_by: username, deleted_at: new Date().toISOString() }).eq("id", entry.id);
    await logActivity("delete", `${panel ? panel.name : "Unknown"} — ${entry.date}`);
    loadAll();
  }

  async function reviewEntry(entry, decision, note) {
    if (role !== "admin" && role !== "super") return;
    await supabase.from("qc_entries").update({
      review_status: decision, review_note: note || "", reviewed_by: username, reviewed_at: new Date().toISOString(),
    }).eq("id", entry.id);
    const panel = panels.find((p) => p.id === entry.panel_id);
    await logActivity(decision, `${panel ? panel.name : "Unknown"} — ${entry.date} → ${decision.toUpperCase()}`);
    loadAll();
  }

  const activeEntries = useMemo(() => (entries || []).filter((e) => !e.deleted), [entries]);
  const pendingApprovals = useMemo(() => activeEntries.filter((e) => e.review_status === "pending"), [activeEntries]);

  if (!config || panels === null || entries === null) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "IBM Plex Mono, monospace", color: "#4A5A5C" }}>Loading…</div>;
  }
  if (!role) return <Login config={config} staffAccounts={staffAccounts} onLogin={handleLogin} />;

  return (
    <div style={{ minHeight: "100vh", background: "#F0F3F2", fontFamily: "'IBM Plex Sans', sans-serif", color: "#1B2B2E" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        button { font-family: inherit; cursor: pointer; }
        input, select, textarea { font-family: inherit; }
      `}</style>

      <header style={{ borderBottom: "1px solid #D6DEDB", background: "#1B2B2E" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FlaskConical size={22} color="#5FBFB0" />
            <div>
              <div style={{ color: "#F0F3F2", fontWeight: 700, fontSize: 17, letterSpacing: 0.2 }}>QC Log</div>
              <div style={{ color: "#8FA39E", fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" }}>Rabia Hospital · Quality Control</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <NavBtn active={tab === "dashboard"} onClick={() => setTab("dashboard")} icon={<LayoutGrid size={15} />} label="Today" />
            <NavBtn active={tab === "grid"} onClick={() => setTab("grid")} icon={<Grid3x3 size={15} />} label="Monthly grid" />
            <NavBtn active={tab === "export"} onClick={() => setTab("export")} icon={<Download size={15} />} label="Export" />
            {(role === "admin" || role === "super") && (
              <NavBtn active={tab === "approvals"} onClick={() => setTab("approvals")} icon={<ClipboardCheck size={15} />} label={`Approvals${pendingApprovals.length ? ` (${pendingApprovals.length})` : ""}`} />
            )}
            {(role === "admin" || role === "super") && <NavBtn active={tab === "settings"} onClick={() => setTab("settings")} icon={<SlidersHorizontal size={15} />} label="Settings" />}
            <NavBtn active={tab === "tables"} onClick={() => setTab("tables")} icon={<Table2 size={15} />} label="Tables" />
            <NavBtn active={tab === "files"} onClick={() => setTab("files")} icon={<FolderOpen size={15} />} label="Files" />
            <button onClick={logout} title="Log out" style={{ background: "transparent", border: "1px solid #39494A", color: "#8FA39E", borderRadius: 7, padding: "7px 9px" }}><LogOut size={14} /></button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px 80px" }}>
        {tab === "dashboard" && <Dashboard panels={panels} entries={activeEntries} role={role} busy={busy} onSubmit={submitEntry} onDelete={deleteEntry} />}
        {tab === "grid" && <MonthlyGrid panels={panels} entries={activeEntries} />}
        {tab === "export" && <ExportPage panels={panels} entries={activeEntries} />}
        {tab === "approvals" && (role === "admin" || role === "super") && <Approvals pending={pendingApprovals} panels={panels} onReview={reviewEntry} />}
        {tab === "settings" && (role === "admin" || role === "super") && <Settings config={config} panels={panels} role={role} staffAccounts={staffAccounts} reload={() => { ensureConfig(); loadAll(); }} />}
        {tab === "tables" && <CustomTables departments={config.departments || []} role={role} username={username} />}
        {tab === "files" && <Files role={role} username={username} />}
        {error && <div style={{ position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", background: "#C1432B", color: "#fff", padding: "10px 18px", borderRadius: 8, fontSize: 14 }}>{error}</div>}
      </main>
    </div>
  );
}

function NavBtn({ active, onClick, icon, label }) {
  return <button onClick={onClick} style={{ background: active ? "#2A3B3D" : "transparent", color: active ? "#F0F3F2" : "#8FA39E", border: "none", borderRadius: 7, padding: "7px 12px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>{icon} {label}</button>;
}

function ReviewBadge({ status }) {
  const map = { pending: { fg: "#B8860B", bg: "#FBF3DF", label: "Pending review" }, approved: { fg: "#2F6B4F", bg: "#E8F2EC", label: "Approved" }, declined: { fg: "#C1432B", bg: "#FBEAE6", label: "Declined" } };
  const m = map[status] || map.pending;
  return <span style={{ fontSize: 10, fontWeight: 700, color: m.fg, background: m.bg, padding: "3px 8px", borderRadius: 4 }}>{m.label}</span>;
}

// ---------- Dashboard (today's entry) ----------

function Dashboard({ panels, entries, role, busy, onSubmit, onDelete }) {
  const today = todayISO();
  const [selectedPanelId, setSelectedPanelId] = useState(null);
  const departments = [...new Set(panels.map((p) => p.department))];

  if (panels.length === 0) {
    return <div style={{ textAlign: "center", padding: "80px 20px", color: "#7B8E8A" }}>No QC panels set up yet. Ask an admin to add them from Settings.</div>;
  }

  if (selectedPanelId) {
    const panel = panels.find((p) => p.id === selectedPanelId);
    if (!panel) { setSelectedPanelId(null); return null; }
    return (
      <PanelPage
        panel={panel}
        entries={entries.filter((e) => e.panel_id === panel.id)}
        role={role} busy={busy} onSubmit={onSubmit} onDelete={onDelete}
        onBack={() => setSelectedPanelId(null)}
      />
    );
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>Pick a device to enter or review its QC — for today or any other day.</div>
      {departments.map((dept) => (
        <div key={dept} style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: deptColor(dept, departments) }} />
            <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: 0.3 }}>{dept}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {panels.filter((p) => p.department === dept).map((panel) => {
              const todaysEntry = entries.find((e) => e.panel_id === panel.id && e.date === today);
              return (
                <button key={panel.id} onClick={() => setSelectedPanelId(panel.id)} style={{ textAlign: "left", background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14.5 }}>{panel.name}</div>
                    <div style={{ fontSize: 11.5, color: "#8A9694" }}>lot {panel.lot_number || "—"} · {(panel.analytes || []).length} analytes</div>
                  </div>
                  {todaysEntry ? <ReviewBadge status={todaysEntry.review_status} /> : <span style={{ fontSize: 11.5, color: "#B8860B", fontWeight: 600 }}>Not entered today</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function PanelPage({ panel, entries, role, busy, onSubmit, onDelete, onBack }) {
  const [date, setDate] = useState(todayISO());
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({});
  const [note, setNote] = useState("");

  const entry = entries.find((e) => e.date === date);

  useEffect(() => {
    setValues(entry ? entry.values || {} : {});
    setNote(entry ? entry.note || "" : "");
    setEditing(false);
  }, [date, entry?.id]);

  function submit() {
    onSubmit(panel, date, values, note, entry ? entry.id : null);
    setEditing(false);
  }

  const showForm = !entry || editing;

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "#0F7173", fontSize: 13, fontWeight: 600, marginBottom: 14 }}>← Back to devices</button>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>{panel.name}</h2>
          <div style={{ fontSize: 12, color: "#8A9694" }}>lot {panel.lot_number || "—"} · {panel.department}</div>
        </div>
        <label style={{ fontSize: 12.5, fontWeight: 600, color: "#516361" }}>Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inputStyle, marginTop: 2 }} />
        </label>
      </div>

      {entry && !editing && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <ReviewBadge status={entry.review_status} />
            <span style={{ fontSize: 11.5, color: "#8A9694" }}>by {entry.done_by}{entry.reviewed_by ? ` · reviewed by ${entry.reviewed_by}` : ""}</span>
          </div>
          {entry.review_status === "declined" && entry.review_note && (
            <div style={{ background: "#FBEAE6", border: "1px solid #C1432B33", borderRadius: 7, padding: "8px 12px", fontSize: 12.5, color: "#8A2E1F", marginBottom: 10 }}>
              Declined: {entry.review_note}
            </div>
          )}
        </div>
      )}

      <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#F0F3F2" }}>
              <th style={{ padding: "8px 12px", textAlign: "left" }}>Item</th>
              <th style={{ padding: "8px 12px", textAlign: "left" }}>Result</th>
              {!showForm && <th style={{ padding: "8px 12px", textAlign: "left" }}>Status</th>}
            </tr>
          </thead>
          <tbody>
            {(panel.analytes || []).map((a) => {
              const val = entry?.values?.[a.name];
              const color = entry?.colors?.[a.name];
              const m = color ? COLOR_META[color] : null;
              return (
                <tr key={a.name} style={{ borderTop: "1px solid #EEF2F0" }}>
                  <td style={{ padding: "7px 12px", fontWeight: 600 }}>{a.name}{a.unit ? <span style={{ color: "#8A9694", fontWeight: 400 }}> ({a.unit})</span> : ""}</td>
                  <td style={{ padding: "7px 12px" }}>
                    {showForm ? (
                      <input type="number" value={values[a.name] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [a.name]: e.target.value }))} style={{ ...inputStyle, padding: "6px 8px", fontSize: 13, width: 120 }} />
                    ) : (val ?? "—")}
                  </td>
                  {!showForm && (
                    <td style={{ padding: "7px 12px" }}>
                      {m ? <span title={(entry.flags?.[a.name] || []).map((f) => RULE_DESCRIPTIONS[f]).join("; ")} style={{ fontSize: 11, background: m.bg, color: m.fg, padding: "3px 8px", borderRadius: 5, fontWeight: 700 }}>{color}</span> : ""}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showForm ? (
        <div style={{ marginTop: 12 }}>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" style={{ ...inputStyle, marginBottom: 10 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={busy} onClick={submit} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "9px 16px", fontSize: 13, fontWeight: 700, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : entry ? "Resubmit for review" : "Save entry"}</button>
            {entry && <button onClick={() => setEditing(false)} style={{ background: "none", border: "none", color: "#8A9694" }}>Cancel</button>}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={() => setEditing(true)} style={{ background: "none", border: "1px solid #C7D1CE", color: "#516361", borderRadius: 6, padding: "6px 12px", fontSize: 12 }}>
            {entry.review_status === "declined" ? "Edit & resubmit" : "Edit this entry"}
          </button>
          {(role === "admin" || role === "super") && (
            <button onClick={() => onDelete(entry)} style={{ background: "none", border: "1px solid #C1432B", color: "#C1432B", borderRadius: 6, padding: "6px 12px", fontSize: 12 }}><Trash2 size={12} /></button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Monthly grid (matches the paper form) ----------

function MonthlyGrid({ panels, entries }) {
  const [panelId, setPanelId] = useState(panels[0]?.id || "");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const panel = panels.find((p) => p.id === panelId);

  if (panels.length === 0) return <div style={{ textAlign: "center", padding: "60px 20px", color: "#8A9694" }}>No QC panels set up yet.</div>;

  const days = panel ? daysInMonth(month) : 0;
  const dayList = Array.from({ length: days }, (_, i) => i + 1);
  const [year, mo] = month.split("-");

  function entryFor(day) {
    const dateStr = `${year}-${mo}-${String(day).padStart(2, "0")}`;
    return entries.find((e) => e.panel_id === panelId && e.date === dateStr);
  }

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const rows = (panel.analytes || []).map((a) => {
      const row = { Item: a.name };
      dayList.forEach((day) => {
        const e = entryFor(day);
        row[day] = e?.values?.[a.name] ?? "";
      });
      return row;
    });
    const doneRow = { Item: "Done by" };
    const reviewRow = { Item: "Reviewed by" };
    dayList.forEach((day) => {
      const e = entryFor(day);
      doneRow[day] = e?.done_by || "";
      reviewRow[day] = e?.review_status === "approved" ? e.reviewed_by : "";
    });
    rows.push(doneRow, reviewRow);
    const sheet = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, month);
    XLSX.writeFile(wb, `${panel.name.replace(/[^a-z0-9]/gi, "_")}-${month}.xlsx`);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Monthly grid</h2>
        {panel && <button onClick={exportExcel} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "8px 12px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Download size={14} /> Export Excel</button>}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <select value={panelId} onChange={(e) => setPanelId(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          {panels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ ...inputStyle, width: "auto" }} />
      </div>

      {panel && (
        <>
          <div style={{ background: "#1B2B2E", color: "#F0F3F2", borderRadius: "8px 8px 0 0", padding: "10px 14px", fontSize: 13, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div><b>{panel.name}</b></div>
            <div>Lot No: {panel.lot_number || "—"}</div>
            <div>{new Date(month + "-01").toLocaleString("en-US", { month: "long", year: "numeric" })}</div>
          </div>
          <div style={{ overflowX: "auto", border: "1px solid #E1E8E5", borderTop: "none", borderRadius: "0 0 8px 8px", background: "#fff" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 11.5, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ position: "sticky", left: 0, background: "#F0F3F2", padding: "6px 10px", textAlign: "left", borderBottom: "1px solid #E1E8E5", minWidth: 90 }}>Item</th>
                  {dayList.map((d) => <th key={d} style={{ padding: "6px 8px", borderBottom: "1px solid #E1E8E5", minWidth: 40 }}>{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {(panel.analytes || []).map((a) => (
                  <tr key={a.name}>
                    <td style={{ position: "sticky", left: 0, background: "#fff", padding: "5px 10px", fontWeight: 600, borderBottom: "1px solid #EEF2F0" }}>{a.name}</td>
                    {dayList.map((day) => {
                      const e = entryFor(day);
                      const val = e?.values?.[a.name];
                      const color = e?.colors?.[a.name];
                      const m = color ? COLOR_META[color] : null;
                      return (
                        <td key={day} title={e?.flags?.[a.name]?.map((f) => RULE_DESCRIPTIONS[f]).join("; ") || ""} style={{ textAlign: "center", padding: "5px 4px", borderBottom: "1px solid #EEF2F0", background: m ? m.bg : "transparent", color: m ? m.fg : "#1B2B2E", fontWeight: m ? 700 : 400 }}>
                          {val ?? ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td style={{ position: "sticky", left: 0, background: "#F7F9F8", padding: "5px 10px", fontWeight: 700, borderTop: "2px solid #C7D1CE" }}>Done by</td>
                  {dayList.map((day) => <td key={day} style={{ textAlign: "center", padding: "5px 4px", borderTop: "2px solid #C7D1CE", fontSize: 10 }}>{entryFor(day)?.done_by || ""}</td>)}
                </tr>
                <tr>
                  <td style={{ position: "sticky", left: 0, background: "#F7F9F8", padding: "5px 10px", fontWeight: 700 }}>Reviewed by</td>
                  {dayList.map((day) => {
                    const e = entryFor(day);
                    return <td key={day} style={{ textAlign: "center", padding: "5px 4px", fontSize: 10 }}>{e?.review_status === "approved" ? e.reviewed_by : ""}</td>;
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Approvals ----------

function ExportPage({ panels, entries }) {
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(todayISO());
  const [selectedIds, setSelectedIds] = useState(panels.map((p) => p.id));

  function toggle(id) {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function doExport() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const chosen = panels.filter((p) => selectedIds.includes(p.id));
    if (chosen.length === 0) return;

    chosen.forEach((panel) => {
      const panelEntries = entries.filter((e) => e.panel_id === panel.id && e.date >= dateFrom && e.date <= dateTo).sort((a, b) => a.date.localeCompare(b.date));
      const rows = (panel.analytes || []).map((a) => {
        const row = { Item: a.name };
        panelEntries.forEach((e) => { row[e.date] = e.values?.[a.name] ?? ""; });
        return row;
      });
      const doneRow = { Item: "Done by" };
      const reviewRow = { Item: "Reviewed by" };
      panelEntries.forEach((e) => {
        doneRow[e.date] = e.done_by;
        reviewRow[e.date] = e.review_status === "approved" ? e.reviewed_by : "";
      });
      rows.push(doneRow, reviewRow);
      const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Item: "No data in this range" }]);
      let sheetName = panel.name.replace(/[\[\]*/\\?:]/g, "").slice(0, 31) || "Sheet";
      XLSX.utils.book_append_sheet(wb, sheet, sheetName);
    });

    XLSX.writeFile(wb, `qc-export-${dateFrom}-to-${dateTo}.xlsx`);
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Export</h2>
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>Export everything, or pick just the devices you need. Each device becomes its own sheet.</div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#7B8E8A" }}>From</span>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ ...inputStyle, width: "auto" }} />
        <span style={{ fontSize: 12, color: "#7B8E8A" }}>To</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ ...inputStyle, width: "auto" }} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button onClick={() => setSelectedIds(panels.map((p) => p.id))} style={{ background: "none", border: "1px solid #C7D1CE", color: "#516361", borderRadius: 6, padding: "6px 12px", fontSize: 12 }}>Select all</button>
        <button onClick={() => setSelectedIds([])} style={{ background: "none", border: "1px solid #C7D1CE", color: "#516361", borderRadius: 6, padding: "6px 12px", fontSize: 12 }}>Select none</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
        {panels.map((p) => (
          <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #E1E8E5", borderRadius: 8, padding: "9px 14px", fontSize: 13.5, cursor: "pointer" }}>
            <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggle(p.id)} />
            <span style={{ fontWeight: 600 }}>{p.name}</span>
            <span style={{ color: "#8A9694", fontSize: 12 }}>{p.department}</span>
          </label>
        ))}
      </div>

      <button onClick={doExport} disabled={selectedIds.length === 0} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 8, padding: "11px 20px", fontWeight: 700, fontSize: 14, opacity: selectedIds.length === 0 ? 0.5 : 1, display: "flex", alignItems: "center", gap: 8 }}>
        <Download size={15} /> Export {selectedIds.length === panels.length ? "everything" : `${selectedIds.length} device(s)`}
      </button>
    </div>
  );
}

function Approvals({ pending, panels, onReview }) {
  if (pending.length === 0) return <div style={{ textAlign: "center", padding: "60px 20px", color: "#8A9694", fontSize: 13.5 }}>Nothing waiting for review. 🎉</div>;
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Approvals</h2>
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>A note is required to decline, and also required to approve a day that isn't all-green.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[...pending].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((e) => (
          <ApprovalRow key={e.id} entry={e} panel={panels.find((p) => p.id === e.panel_id)} onReview={onReview} />
        ))}
      </div>
    </div>
  );
}

function ApprovalRow({ entry, panel, onReview }) {
  const [note, setNote] = useState("");
  const worst = Object.values(entry.colors || {}).reduce((max, c) => Math.max(max, colorRank[c] ?? 0), 0);
  const needsNote = worst > 0;

  return (
    <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{panel ? panel.name : "Unknown"}</div>
        <div style={{ fontSize: 12, color: "#8A9694" }}>{entry.date} · by {entry.done_by}</div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {Object.entries(entry.values || {}).map(([name, val]) => {
          const color = entry.colors?.[name] || "pending";
          const m = COLOR_META[color];
          return <span key={name} style={{ fontSize: 12, background: m.bg, color: m.fg, padding: "3px 8px", borderRadius: 5, fontWeight: 600 }}>{name}: {val}</span>;
        })}
      </div>
      {needsNote && <div style={{ fontSize: 11.5, color: "#8A2E1F", marginBottom: 6 }}>This day has a non-green result — a note is required even to approve it.</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={needsNote ? "Note (required)" : "Note (optional)"} style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
        <button disabled={needsNote && !note.trim()} onClick={() => onReview(entry, "approved", note)} style={{ background: "#2F6B4F", color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, opacity: needsNote && !note.trim() ? 0.5 : 1, display: "flex", alignItems: "center", gap: 4 }}><Check size={13} /> Approve</button>
        <button disabled={!note.trim()} onClick={() => onReview(entry, "declined", note)} style={{ background: "#C1432B", color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, opacity: !note.trim() ? 0.5 : 1, display: "flex", alignItems: "center", gap: 4 }}><X size={13} /> Decline</button>
      </div>
    </div>
  );
}
