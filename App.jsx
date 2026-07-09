import React, { useState, useEffect, useMemo } from "react";
import { FlaskConical, LayoutGrid, Grid3x3, SlidersHorizontal, LogOut, Check, X, Trash2, Download, ClipboardCheck, Table2, FolderOpen, BarChart3, PackageCheck, Award, FileText, Users, Calendar, Menu, Home, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "./supabaseClient";
import Login from "./Login";
import Settings from "./Settings";
import OwnerSettings from "./OwnerSettings";
import CustomTables from "./CustomTables";
import Files from "./Files";
import LeveyJennings from "./Charts";
import Riqas from "./Riqas";
import StaffMembers from "./StaffMembers";
import Schedule from "./Schedule";
import ShiftTemplates from "./ShiftTemplates";
import HomePage from "./HomePage";
import AuditTrail from "./AuditTrail";
import SmartSearch from "./SmartSearch";
import KPI from "./KPI";
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
  const [permissions, setPermissions] = useState(() => {
    try { return JSON.parse(localStorage.getItem("qc_permissions") || "[]"); } catch { return []; }
  });
  const [panels, setPanels] = useState(null);
  const [baselines, setBaselines] = useState([]);
  const [controlLots, setControlLots] = useState([]);
  const [entries, setEntries] = useState(null);
  const [staffAccounts, setStaffAccounts] = useState([]);
  const [portalAccounts, setPortalAccounts] = useState([]);
  const [pinnedTables, setPinnedTables] = useState([]);
  const [allTables, setAllTables] = useState([]);
  const [tab, setTab] = useState("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    const { data: b } = await supabase.from("qc_baselines").select("*").eq("active", true);
    const { data: cl } = await supabase.from("qc_control_lots").select("*").order("received_date", { ascending: false });
    const { data: pa } = await supabase.from("portal_accounts").select("*").order("username");
    const { data: ct } = await supabase.from("custom_tables").select("id,title,department,pinned,nav_icon").eq("deleted", false).order("title");
    if (e1 || e2) {
      setError("Could not connect to the database. Check Supabase settings.");
      setPanels([]);
      setEntries([]);
      return;
    }
    setPanels(p || []);
    setEntries(e || []);
    setStaffAccounts(s || []);
    setBaselines(b || []);
    setControlLots(cl || []);
    setPortalAccounts(pa || []);
    setPinnedTables((ct || []).filter((t) => t.pinned));
    setAllTables(ct || []);
  }

  useEffect(() => {
    ensureConfig();
    loadAll();
  }, []);

  function handleLogin(newRole, newUsername, newPermissions) {
    localStorage.setItem("qc_role", newRole);
    localStorage.setItem("qc_username", newUsername);
    localStorage.setItem("qc_permissions", JSON.stringify(newPermissions || []));
    setRole(newRole);
    setUsername(newUsername);
    setPermissions(newPermissions || []);
  }
  function logout() {
    supabase.from("audit_log").insert({ action: "logout", entity: "auth", description: username, performed_by: username });
    localStorage.removeItem("qc_role");
    localStorage.removeItem("qc_username");
    localStorage.removeItem("qc_permissions");
    setRole(null);
    setUsername("");
    setPermissions([]);
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
    const { flags, color } = evaluateWestgard(z);
    return { color, flags, z };
  }

  // Submit (or overwrite) the whole day's panel entry — one row per panel per date.
  async function submitEntry(panel, date, valuesInput, note, existingEntry) {
    setBusy(true);
    try {
      const lot = panel.lot_number || "";
      const values = {};
      const colors = {};
      const flags = {};
      const reviews = { ...(existingEntry?.reviews || {}) };
      for (const analyte of panel.analytes || []) {
        const raw = valuesInput[analyte.name];
        if (raw === undefined || raw === "" || raw === null) continue;
        const value = Number(raw);
        values[analyte.name] = value;
        const { color, flags: f } = await evaluateAnalyte(panel, analyte.name, lot, value, date);
        colors[analyte.name] = color;
        flags[analyte.name] = f;
        const prevValue = existingEntry?.values?.[analyte.name];
        if (prevValue === undefined || prevValue !== value) {
          reviews[analyte.name] = { status: "pending", note: "", by: null, at: null };
        }
      }

      if (existingEntry) {
        await supabase.from("qc_entries").update({
          values, colors, flags, note: note || "", edited_by: username, edited_at: new Date().toISOString(), reviews,
        }).eq("id", existingEntry.id);
        await logActivity("edit", `${panel.name} — ${date} (edited by ${username})`);
      } else {
        for (const name of Object.keys(values)) reviews[name] = { status: "pending", note: "", by: null, at: null };
        await supabase.from("qc_entries").insert({
          panel_id: panel.id, date, lot_number: lot, values, colors, flags, reviews, done_by: username, note: note || "",
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

  // Approve or decline ONE analyte's result within a day's entry — the rest are untouched.
  async function reviewAnalyte(entry, analyteName, decision, note) {
    if (role !== "admin" && role !== "super") return;
    const reviews = { ...(entry.reviews || {}) };
    reviews[analyteName] = { status: decision, note: note || "", by: username, at: new Date().toISOString() };
    await supabase.from("qc_entries").update({ reviews }).eq("id", entry.id);
    const panel = panels.find((p) => p.id === entry.panel_id);
    await logActivity(decision, `${panel ? panel.name : "Unknown"} — ${entry.date} — ${analyteName} → ${decision.toUpperCase()}`);
    loadAll();
  }

  async function reviewAnalytesBulk(entry, analyteNames, decision, note) {
    if (role !== "admin" && role !== "super") return;
    const reviews = { ...(entry.reviews || {}) };
    const at = new Date().toISOString();
    analyteNames.forEach((name) => {
      reviews[name] = { status: decision, note: note || "", by: username, at };
    });
    await supabase.from("qc_entries").update({ reviews }).eq("id", entry.id);
    const panel = panels.find((p) => p.id === entry.panel_id);
    await logActivity(decision, `${panel ? panel.name : "Unknown"} — ${entry.date} — ${analyteNames.join(", ")} → ${decision.toUpperCase()}`);
    loadAll();
  }

  // One-time cleanup: recompute every saved result's color/flags with the
  // current (simplified) single-point rule, using whatever baseline is
  // active right now. Doesn't touch values, reviews, or anything else.
  async function recalculateAllColors() {
    if (role !== "admin" && role !== "super") return;
    if (!confirm("Recalculate colors for every saved result using the current normal ranges? This can take a minute.")) return;
    setBusy(true);
    try {
      const { data: allEntries } = await supabase.from("qc_entries").select("*").eq("deleted", false);
      const { data: allBaselines } = await supabase.from("qc_baselines").select("*").eq("active", true);
      for (const e of allEntries || []) {
        const colors = { ...e.colors };
        const flags = { ...e.flags };
        let changed = false;
        for (const [name, value] of Object.entries(e.values || {})) {
          const baseline = allBaselines.find((b) => b.panel_id === e.panel_id && b.analyte_name === name && b.lot_number === e.lot_number);
          if (!baseline) continue;
          const z = zScore(value, baseline.mean, baseline.sd);
          const { color, flags: f } = evaluateWestgard(z);
          if (colors[name] !== color) changed = true;
          colors[name] = color;
          flags[name] = f;
        }
        if (changed) await supabase.from("qc_entries").update({ colors, flags }).eq("id", e.id);
      }
      await logActivity("recalculate", "Recalculated all result colors with current normal ranges");
      loadAll();
    } finally {
      setBusy(false);
    }
  }

  const activeEntries = useMemo(() => (entries || []).filter((e) => !e.deleted), [entries]);
  const pendingItems = useMemo(() => {
    const items = [];
    activeEntries.forEach((e) => {
      Object.keys(e.values || {}).forEach((analyteName) => {
        const status = e.reviews?.[analyteName]?.status || "pending";
        if (status === "pending") items.push({ entry: e, analyteName });
      });
    });
    return items;
  }, [activeEntries]);

  if (!config || panels === null || entries === null) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "IBM Plex Mono, monospace", color: "#4A5A5C" }}>Loading…</div>;
  }
  if (!role) return <Login config={config} staffAccounts={staffAccounts} portalAccounts={portalAccounts} onLogin={handleLogin} />;

  if (role === "portal") {
    return (
      <Portal
        config={config} permissions={permissions} allTables={allTables} username={username}
        panels={panels} entries={activeEntries} baselines={baselines} controlLots={controlLots}
        busy={busy} pendingItems={pendingItems}
        onSubmit={submitEntry} onDelete={deleteEntry} onReview={reviewAnalyte} onReviewBulk={reviewAnalytesBulk}
        onRecalculate={recalculateAllColors} onLogout={logout}
      />
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F0F3F2", fontFamily: "'IBM Plex Sans', sans-serif", color: "#1B2B2E" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        button { font-family: inherit; cursor: pointer; }
        input, select, textarea { font-family: inherit; }
        .app-sidebar { position: fixed; top: 0; left: 0; height: 100vh; width: 240px; transform: translateX(-100%); transition: transform 0.2s; z-index: 50; overflow-y: auto; }
        .app-sidebar.open { transform: translateX(0); }
        .app-sidebar-overlay { position: fixed; inset: 0; background: rgba(15,25,26,0.5); z-index: 40; }
        .app-main { padding: 24px 20px 80px; max-width: 900px; margin: 0 auto; }
        .app-topbar { display: flex; }
        @media (min-width: 880px) {
          .app-sidebar { transform: translateX(0); }
          .app-sidebar-overlay { display: none !important; }
          .app-main { margin-left: 240px; max-width: 1000px; }
          .app-topbar { display: none !important; }
        }
        @media print {
          .app-sidebar, .app-topbar, .app-sidebar-overlay, .no-print { display: none !important; }
          body, html { background: #fff !important; }
          .app-main { padding: 0 !important; max-width: 100% !important; margin-left: 0 !important; }
          .print-area { border: none !important; }
          .print-area table { font-size: 10px !important; }
          .print-only { display: inline !important; }
        }
      `}</style>

      <div className="app-topbar" style={{ background: "#1B2B2E", padding: "14px 16px", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 30 }}>
        <button onClick={() => setSidebarOpen(true)} style={{ background: "none", border: "none", color: "#F0F3F2" }}><Menu size={22} /></button>
        <div style={{ color: "#F0F3F2", fontWeight: 700, fontSize: 15 }}>{config.app_title || "QC Log"}</div>
        <button onClick={logout} style={{ background: "none", border: "none", color: "#8FA39E" }}><LogOut size={18} /></button>
      </div>

      {sidebarOpen && <div className="app-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <AppSidebar
        config={config} role={role} username={username} tab={tab}
        onNavigate={(k) => { setTab(k); setSidebarOpen(false); }}
        onLogout={logout} pendingCount={pendingItems.length} pinnedTables={pinnedTables}
        className={sidebarOpen ? "app-sidebar open" : "app-sidebar"}
      />

      <main className="app-main">
        {tab === "home" && <HomePage username={username} role={role} config={config} panels={panels} activeEntries={activeEntries} pendingCount={pendingItems.length} onNavigate={setTab} />}
        {tab === "qc" && <Dashboard panels={panels} entries={activeEntries} baselines={baselines} role={role} busy={busy} onSubmit={submitEntry} onDelete={deleteEntry} />}
        {tab === "staff" && <StaffMembers departments={config.departments || []} role={role} />}
        {tab === "schedule" && <Schedule departments={config.departments || []} role={role} username={username} />}
        {tab === "shifts" && (role === "admin" || role === "super") && <ShiftTemplates role={role} />}
        {tab === "grid" && (role === "admin" || role === "super") && <MonthlyGrid panels={panels} entries={activeEntries} controlLots={controlLots} />}
        {tab === "controls" && (role === "admin" || role === "super") && <ControlStock panels={panels} entries={activeEntries} controlLots={controlLots} onRecalculate={recalculateAllColors} busy={busy} />}
        {tab === "riqas" && (role === "admin" || role === "super") && <Riqas departments={config.departments || []} role={role} username={username} />}
        {tab === "chart" && (role === "admin" || role === "super") && <LeveyJennings panels={panels} entries={activeEntries} baselines={baselines} />}
        {tab === "export" && (role === "admin" || role === "super") && <ExportPage panels={panels} entries={activeEntries} />}
        {tab === "approvals" && (role === "admin" || role === "super") && <Approvals items={pendingItems} panels={panels} onReview={reviewAnalyte} onReviewBulk={reviewAnalytesBulk} />}
        {tab === "settings" && (role === "admin" || role === "super") && <Settings config={config} panels={panels} role={role} staffAccounts={staffAccounts} username={username} baselines={baselines} reload={() => { ensureConfig(); loadAll(); }} />}
        {tab === "audit" && (role === "admin" || role === "super") && <AuditTrail />}
        {tab === "kpi" && (role === "admin" || role === "super") && <KPI panels={panels} entries={activeEntries} baselines={baselines} />}
        {tab === "owner" && role === "super" && <OwnerSettings config={config} reload={() => { ensureConfig(); loadAll(); }} />}
        {tab === "tables" && (role === "admin" || role === "super") && <CustomTables role={role} username={username} onReload={loadAll} />}
        {tab === "files" && (role === "admin" || role === "super") && <Files role={role} username={username} />}
        {tab.startsWith("pinned:") && (() => {
          const t = pinnedTables.find((x) => `pinned:${x.id}` === tab);
          return t ? <CustomTables role={role} username={username} openTableId={t.id} onReload={loadAll} /> : null;
        })()}
        {error && <div style={{ position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", background: "#C1432B", color: "#fff", padding: "10px 18px", borderRadius: 8, fontSize: 14 }}>{error}</div>}
      </main>
    </div>
  );
}

const PORTAL_PAGE_META = {
  qc: { label: "QC Entry", icon: LayoutGrid },
  grid: { label: "Monthly grid", icon: Grid3x3 },
  controls: { label: "Controls", icon: PackageCheck },
  riqas: { label: "RIQAS", icon: Award },
  files: { label: "Files", icon: FolderOpen },
  chart: { label: "Chart", icon: BarChart3 },
  export: { label: "Export", icon: Download },
  tables: { label: "Tables", icon: Table2 },
};

function buildPortalPages(permissions, allTables) {
  const pages = [];
  (permissions || []).forEach(({ page, level }) => {
    if (page === "qc") {
      pages.push({ key: "qc", label: "QC Entry", icon: LayoutGrid, level });
      if (level === "admin") pages.push({ key: "approvals", label: "Approvals", icon: ClipboardCheck, level: "admin" });
    } else if (page.startsWith("table:")) {
      const id = page.slice(6);
      const t = allTables.find((c) => c.id === id);
      pages.push({ key: page, label: t ? t.title : "Table", icon: Table2, level, tableId: id });
    } else if (PORTAL_PAGE_META[page]) {
      pages.push({ key: page, label: PORTAL_PAGE_META[page].label, icon: PORTAL_PAGE_META[page].icon, level });
    }
  });
  return pages;
}

function Portal({ config, permissions, allTables, username, panels, entries, baselines, controlLots, busy, pendingItems, onSubmit, onDelete, onReview, onReviewBulk, onRecalculate, onLogout }) {
  const pages = buildPortalPages(permissions, allTables);
  const [openKey, setOpenKey] = useState(pages.length === 1 ? pages[0].key : null);
  const current = pages.find((p) => p.key === openKey);

  function renderPage(p) {
    const effectiveRole = p.level === "admin" ? "admin" : "staff";
    if (p.key === "qc") return <Dashboard panels={panels} entries={entries} baselines={baselines} role={effectiveRole} busy={busy} onSubmit={onSubmit} onDelete={onDelete} />;
    if (p.key === "approvals") return <Approvals items={pendingItems} panels={panels} onReview={onReview} onReviewBulk={onReviewBulk} />;
    if (p.key === "grid") return <MonthlyGrid panels={panels} entries={entries} controlLots={controlLots} />;
    if (p.key === "controls") return <ControlStock panels={panels} entries={entries} controlLots={controlLots} onRecalculate={onRecalculate} busy={busy} />;
    if (p.key === "riqas") return <Riqas departments={config.departments || []} role={effectiveRole} username={username} />;
    if (p.key === "chart") return <LeveyJennings panels={panels} entries={entries} baselines={baselines} />;
    if (p.key === "export") return <ExportPage panels={panels} entries={entries} />;
    if (p.key === "tables") return <CustomTables role={effectiveRole} username={username} />;
    if (p.key === "files") return <Files role={effectiveRole} username={username} />;
    if (p.key.startsWith("table:")) return <CustomTables role={effectiveRole} username={username} openTableId={p.tableId} />;
    return null;
  }

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
            <FlaskConical size={22} color={config.theme_color || "#5FBFB0"} />
            <div>
              <div style={{ color: "#F0F3F2", fontWeight: 700, fontSize: 17 }}>{config.app_title || "QC Log"}</div>
              <div style={{ color: "#8FA39E", fontSize: 12 }}>{username}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {pages.length > 1 && openKey && (
              <button onClick={() => setOpenKey(null)} style={{ background: "transparent", border: "1px solid #39494A", color: "#8FA39E", borderRadius: 7, padding: "7px 12px", fontSize: 13 }}>Home</button>
            )}
            <button onClick={onLogout} title="Log out" style={{ background: "transparent", border: "1px solid #39494A", color: "#8FA39E", borderRadius: 7, padding: "7px 9px" }}><LogOut size={14} /></button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px 80px" }}>
        {pages.length === 0 && <div style={{ textAlign: "center", padding: "80px 20px", color: "#8A9694" }}>No pages have been assigned to this account yet. Ask the owner to grant access.</div>}
        {current ? renderPage(current) : (
          <div>
            <div style={{ fontSize: 14, color: "#516361", marginBottom: 16 }}>Hi {username} — pick where you want to work.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
              {pages.map((p) => {
                const Icon = p.icon;
                return (
                  <button key={p.key} onClick={() => setOpenKey(p.key)} style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 12, padding: "24px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer" }}>
                    <Icon size={26} color={config.theme_color || "#0F7173"} />
                    <div style={{ fontWeight: 700, fontSize: 14, textAlign: "center" }}>{p.label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function NavBtn({ active, onClick, icon, label }) {
  return <button onClick={onClick} style={{ background: active ? "#2A3B3D" : "transparent", color: active ? "#F0F3F2" : "#8FA39E", border: "none", borderRadius: 7, padding: "7px 12px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>{icon} {label}</button>;
}

function AppSidebar({ config, role, username, tab, onNavigate, onLogout, pendingCount, pinnedTables, className }) {
  const isAdmin = role === "admin" || role === "super";
  const [openGroups, setOpenGroups] = useState({ qc: true, schedule: true, settings: false, tables: true });
  const toggleGroup = (k) => setOpenGroups((g) => ({ ...g, [k]: !g[k] }));

  const qcItems = [
    { key: "qc", label: "QC Entry", icon: LayoutGrid, show: true },
    { key: "kpi", label: "KPI", icon: BarChart3, show: isAdmin },
    { key: "grid", label: "Monthly grid", icon: Grid3x3, show: isAdmin },
    { key: "chart", label: "Charts", icon: BarChart3, show: isAdmin },
    { key: "riqas", label: "RIQAS", icon: Award, show: isAdmin },
    { key: "approvals", label: `Approvals${pendingCount ? ` (${pendingCount})` : ""}`, icon: ClipboardCheck, show: isAdmin },
    { key: "controls", label: "Controls", icon: PackageCheck, show: isAdmin },
    { key: "export", label: "Export", icon: Download, show: isAdmin },
  ].filter((i) => i.show);

  const scheduleItems = [
    { key: "schedule", label: "Schedule", icon: Calendar, show: true },
    { key: "shifts", label: "Shift templates", icon: Calendar, show: isAdmin },
  ].filter((i) => i.show);

  const settingsItems = [
    { key: "settings", label: "Settings", icon: SlidersHorizontal, show: isAdmin },
    { key: "audit", label: "Audit trail", icon: ClipboardCheck, show: isAdmin },
    { key: "owner", label: "Owner", icon: Award, show: role === "super" },
  ].filter((i) => i.show);

  return (
    <div className={className} style={{ background: "#1B2B2E", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "18px 16px", borderBottom: "1px solid #2A3B3D" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <FlaskConical size={22} color={config.theme_color || "#5FBFB0"} />
          <div>
            <div style={{ color: "#F0F3F2", fontWeight: 700, fontSize: 15 }}>{config.app_title || "QC Log"}</div>
            <div style={{ color: "#8FA39E", fontSize: 10.5, fontFamily: "'IBM Plex Mono', monospace" }}>{username}</div>
          </div>
        </div>
      </div>

      <SmartSearch onNavigate={onNavigate} />

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
        <SideItem icon={<Home size={15} />} label="Dashboard" active={tab === "home"} onClick={() => onNavigate("home")} />

        <SideGroup icon="🧪" label="Quality Control" open={openGroups.qc} onToggle={() => toggleGroup("qc")}>
          {qcItems.map((i) => <SideItem key={i.key} icon={<i.icon size={14} />} label={i.label} active={tab === i.key} onClick={() => onNavigate(i.key)} indent />)}
        </SideGroup>

        <SideItem icon={<Users size={15} />} label="Staff" active={tab === "staff"} onClick={() => onNavigate("staff")} />

        <SideGroup icon="📅" label="Schedule" open={openGroups.schedule} onToggle={() => toggleGroup("schedule")}>
          {scheduleItems.map((i) => <SideItem key={i.key} icon={<i.icon size={14} />} label={i.label} active={tab === i.key} onClick={() => onNavigate(i.key)} indent />)}
        </SideGroup>

        {isAdmin && (
          <SideGroup icon="📋" label="Tables" open={openGroups.tables} onToggle={() => toggleGroup("tables")}>
            <SideItem icon={<Table2 size={14} />} label="All tables" active={tab === "tables"} onClick={() => onNavigate("tables")} indent />
            {pinnedTables.map((t) => (
              <SideItem key={t.id} icon={<Table2 size={14} />} label={t.title} active={tab === `pinned:${t.id}`} onClick={() => onNavigate(`pinned:${t.id}`)} indent />
            ))}
          </SideGroup>
        )}
        {!isAdmin && pinnedTables.map((t) => (
          <SideItem key={t.id} icon={<Table2 size={15} />} label={t.title} active={tab === `pinned:${t.id}`} onClick={() => onNavigate(`pinned:${t.id}`)} />
        ))}

        {isAdmin && <SideItem icon={<FolderOpen size={15} />} label="Files" active={tab === "files"} onClick={() => onNavigate("files")} />}

        {settingsItems.length > 0 && (
          <SideGroup icon="⚙" label="Settings" open={openGroups.settings} onToggle={() => toggleGroup("settings")}>
            {settingsItems.map((i) => <SideItem key={i.key} icon={<i.icon size={14} />} label={i.label} active={tab === i.key} onClick={() => onNavigate(i.key)} indent />)}
          </SideGroup>
        )}
      </div>

      <div style={{ padding: 12, borderTop: "1px solid #2A3B3D" }}>
        <button onClick={onLogout} style={{ width: "100%", background: "transparent", border: "1px solid #39494A", color: "#8FA39E", borderRadius: 7, padding: "9px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <LogOut size={14} /> Log out
        </button>
      </div>
    </div>
  );
}

function SideGroup({ icon, label, open, onToggle, children }) {
  return (
    <div>
      <button onClick={onToggle} style={{ width: "100%", background: "transparent", border: "none", color: "#F0F3F2", padding: "8px 10px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, borderRadius: 7 }}>
        <span>{icon}</span>
        <span style={{ flex: 1, textAlign: "left" }}>{label}</span>
        {open ? <ChevronDown size={14} color="#8FA39E" /> : <ChevronRight size={14} color="#8FA39E" />}
      </button>
      {open && <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>{children}</div>}
    </div>
  );
}

function SideItem({ icon, label, active, onClick, indent }) {
  return (
    <button onClick={onClick} style={{ width: "100%", background: active ? "#2A3B3D" : "transparent", border: "none", color: active ? "#F0F3F2" : "#8FA39E", padding: "8px 10px", paddingLeft: indent ? 30 : 10, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, borderRadius: 7, textAlign: "left" }}>
      {icon} {label}
    </button>
  );
}

function reviewSummary(entry) {
  const names = Object.keys(entry.values || {});
  let approved = 0, declined = 0, pending = 0;
  names.forEach((n) => {
    const st = entry.reviews?.[n]?.status || "pending";
    if (st === "approved") approved++;
    else if (st === "declined") declined++;
    else pending++;
  });
  return { approved, declined, pending, total: names.length };
}

// Who most recently reviewed this entry (any analyte) — for display in grids.
function lastReviewerLabel(entry) {
  const reviews = Object.values(entry.reviews || {}).filter((r) => r && r.by && r.status !== "pending");
  if (reviews.length === 0) return "";
  reviews.sort((a, b) => new Date(b.at) - new Date(a.at));
  const s = reviewSummary(entry);
  return `${reviews[0].by} (${s.approved}/${s.total})`;
}

function ReviewSummaryBadge({ entry }) {
  const s = reviewSummary(entry);
  if (s.total === 0) return null;
  if (s.declined > 0) return <span style={{ fontSize: 10, fontWeight: 700, color: "#C1432B", background: "#FBEAE6", padding: "3px 8px", borderRadius: 4 }}>{s.declined} declined</span>;
  if (s.pending > 0) return <span style={{ fontSize: 10, fontWeight: 700, color: "#B8860B", background: "#FBF3DF", padding: "3px 8px", borderRadius: 4 }}>{s.pending} pending review</span>;
  return <span style={{ fontSize: 10, fontWeight: 700, color: "#2F6B4F", background: "#E8F2EC", padding: "3px 8px", borderRadius: 4 }}>All approved</span>;
}

function AnalyteReviewBadge({ status }) {
  const map = { pending: { bg: "#FBF3DF", fg: "#B8860B", label: "Pending" }, approved: { bg: "#E8F2EC", fg: "#2F6B4F", label: "Approved" }, declined: { bg: "#FBEAE6", fg: "#C1432B", label: "Declined" } };
  const m = map[status] || map.pending;
  return <span style={{ fontSize: 9.5, fontWeight: 700, color: m.fg, background: m.bg, padding: "2px 6px", borderRadius: 4 }}>{m.label}</span>;
}

// ---------- Dashboard (today's entry) ----------

function Dashboard({ panels, entries, baselines, role, busy, onSubmit, onDelete }) {
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
        baselines={baselines}
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
                  {todaysEntry ? <ReviewSummaryBadge entry={todaysEntry} /> : <span style={{ fontSize: 11.5, color: "#B8860B", fontWeight: 600 }}>Not entered today</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function PanelPage({ panel, entries, baselines, role, busy, onSubmit, onDelete, onBack }) {
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
    onSubmit(panel, date, values, note, entry || null);
    setEditing(false);
  }

  // Quick live preview color as you type — a single-point check against the
  // baseline (mean/SD). The final saved color also runs the full Westgard
  // multirule check on the server side once you save.
  function livePreviewColor(analyteName, raw) {
    if (raw === undefined || raw === "" || raw === null || isNaN(Number(raw))) return null;
    const baseline = baselines.find((b) => b.panel_id === panel.id && b.analyte_name === analyteName && b.lot_number === panel.lot_number);
    if (!baseline) return null;
    const z = zScore(Number(raw), baseline.mean, baseline.sd);
    if (Math.abs(z) >= 2) return "red";
    if (Math.abs(z) >= 1.5) return "orange";
    return "green";
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
            <ReviewSummaryBadge entry={entry} />
            <span style={{ fontSize: 11.5, color: "#8A9694" }}>entered by {entry.done_by}{entry.edited_by ? ` · last edited by ${entry.edited_by}` : ""}</span>
          </div>
        </div>
      )}

      <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#F0F3F2" }}>
              <th style={{ padding: "8px 12px", textAlign: "left" }}>Item</th>
              <th style={{ padding: "8px 12px", textAlign: "left" }}>Normal Range</th>
              <th style={{ padding: "8px 12px", textAlign: "left" }}>Result</th>
              {!showForm && <th style={{ padding: "8px 12px", textAlign: "left" }}>Review</th>}
            </tr>
          </thead>
          <tbody>
            {(panel.analytes || []).map((a) => {
              const val = entry?.values?.[a.name];
              const color = entry?.colors?.[a.name];
              const m = color ? COLOR_META[color] : null;
              const rev = entry?.reviews?.[a.name];
              const baseline = baselines.find((b) => b.panel_id === panel.id && b.analyte_name === a.name && b.lot_number === panel.lot_number);
              return (
                <tr key={a.name} style={{ borderTop: "1px solid #EEF2F0" }}>
                  <td style={{ padding: "7px 12px", fontWeight: 600 }}>{a.name}{a.unit ? <span style={{ color: "#8A9694", fontWeight: 400 }}> ({a.unit})</span> : ""}</td>
                  <td style={{ padding: "7px 12px", fontSize: 12, color: "#516361" }}>
                    {baseline ? `${(baseline.mean - 2 * baseline.sd).toFixed(2)} – ${(baseline.mean + 2 * baseline.sd).toFixed(2)}` : <span style={{ color: "#B8860B" }}>establishing…</span>}
                  </td>
                  <td style={{ padding: "7px 12px" }}>
                    {showForm ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="number"
                          value={values[a.name] ?? ""}
                          onChange={(e) => setValues((v) => ({ ...v, [a.name]: e.target.value }))}
                          style={{
                            ...inputStyle, padding: "6px 8px", fontSize: 13, width: 120,
                            borderColor: livePreviewColor(a.name, values[a.name]) ? COLOR_META[livePreviewColor(a.name, values[a.name])].fg : "#C7D1CE",
                            background: livePreviewColor(a.name, values[a.name]) ? COLOR_META[livePreviewColor(a.name, values[a.name])].bg : "#fff",
                            borderWidth: 2,
                          }}
                        />
                      </div>
                    ) : (
                      val === undefined ? "—" : (
                        <div>
                          {m ? <span style={{ fontSize: 13, fontWeight: 700, color: m.fg, background: m.bg, padding: "3px 10px", borderRadius: 5 }}>{val}</span> : val}
                          {(color === "orange" || color === "red") && (entry.flags?.[a.name] || []).length > 0 && (
                            <div style={{ fontSize: 10, color: "#8A2E1F", marginTop: 3 }}>{(entry.flags[a.name] || []).map((f) => RULE_DESCRIPTIONS[f] || f).join(" · ")}</div>
                          )}
                        </div>
                      )
                    )}
                  </td>
                  {!showForm && (
                    <td style={{ padding: "7px 12px" }}>
                      {val === undefined ? "" : (
                        <>
                          <AnalyteReviewBadge status={rev?.status || "pending"} />
                          {rev?.status === "declined" && rev?.note && <div style={{ fontSize: 10.5, color: "#8A2E1F", marginTop: 2 }}>{rev.note}</div>}
                          {rev?.by && <div style={{ fontSize: 10, color: "#8A9694", marginTop: 2 }}>by {rev.by}</div>}
                        </>
                      )}
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
            {reviewSummary(entry).declined > 0 ? "Edit & resubmit" : "Edit this entry"}
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

function MonthlyGrid({ panels, entries, controlLots }) {
  const [search, setSearch] = useState("");
  const filteredPanels = panels.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
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
    // Build as an array-of-arrays so column order is guaranteed — plain
    // objects with numeric-looking keys (the day numbers) get silently
    // reordered by JS before "Item", which is what was hiding it.
    const header = ["Item", ...dayList];
    const aoa = [header];
    (panel.analytes || []).forEach((a) => {
      aoa.push([a.name, ...dayList.map((day) => entryFor(day)?.values?.[a.name] ?? "")]);
    });
    aoa.push(["Done by", ...dayList.map((day) => entryFor(day)?.done_by || "")]);
    aoa.push(["Reviewed by", ...dayList.map((day) => { const e = entryFor(day); return e ? lastReviewerLabel(e) : ""; })]);
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, month);
    XLSX.writeFile(wb, `${panel.name.replace(/[^a-z0-9]/gi, "_")}-${month}.xlsx`);
  }

  function exportPDF() {
    window.print();
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }} className="no-print">
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Monthly grid</h2>
        {panel && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={exportPDF} style={{ background: "none", border: "1px solid #C7D1CE", color: "#516361", borderRadius: 7, padding: "8px 12px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><FileText size={14} /> Save as PDF</button>
            <button onClick={exportExcel} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "8px 12px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Download size={14} /> Export Excel</button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }} className="no-print">
        <input placeholder="Search device…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inputStyle, width: 160 }} />
        <select value={panelId} onChange={(e) => setPanelId(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          {filteredPanels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ ...inputStyle, width: "auto" }} />
      </div>

      {panel && (
        <div className="print-area">
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
                  {dayList.map((d) => {
                    const dateStr = `${year}-${mo}-${String(d).padStart(2, "0")}`;
                    const newLot = (controlLots || []).find((c) => c.panel_id === panelId && c.received_date === dateStr);
                    return (
                      <th key={d} style={{ padding: "6px 8px", borderBottom: "1px solid #E1E8E5", minWidth: 40 }}>
                        {d}
                        {newLot && <div title={`New lot: ${newLot.lot_number}`} style={{ fontSize: 8, fontWeight: 700, color: "#0F7173", background: "#EAF6F4", borderRadius: 3, padding: "1px 3px", marginTop: 2 }}>NEW LOT</div>}
                      </th>
                    );
                  })}
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
                    return <td key={day} style={{ textAlign: "center", padding: "5px 4px", fontSize: 10 }}>{e ? lastReviewerLabel(e) : ""}</td>;
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Approvals ----------

function ControlStock({ panels, entries, controlLots, onRecalculate, busy }) {
  const today = todayISO();

  function expiryStatus(dateStr) {
    if (!dateStr) return { label: "no expiry set", color: "#8A9694", bg: "#F0F3F2" };
    const days = Math.round((new Date(dateStr) - new Date(today)) / 86400000);
    if (days < 0) return { label: `expired ${Math.abs(days)}d ago`, color: "#C1432B", bg: "#FBEAE6" };
    if (days <= 14) return { label: `expires in ${days}d`, color: "#B8860B", bg: "#FBF3DF" };
    return { label: `expires in ${days}d`, color: "#2F6B4F", bg: "#E8F2EC" };
  }

  if (panels.length === 0) return <div style={{ textAlign: "center", padding: "60px 20px", color: "#8A9694" }}>No QC panels set up yet.</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Control stock</h2>
        <button disabled={busy} onClick={onRecalculate} style={{ background: "none", border: "1px solid #C7D1CE", color: "#516361", borderRadius: 7, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Recalculating…" : "Recalculate all colors"}
        </button>
      </div>
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>Current control lot, its expiry, and whether today's QC has been entered yet — for every device.</div>
      <div style={{ fontSize: 11.5, color: "#8A9694", marginBottom: 20 }}>Changed how colors are calculated? "Recalculate all colors" re-checks every saved result against the current normal ranges — use it once after any range change.</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {panels.map((p) => {
          const lots = controlLots.filter((c) => c.panel_id === p.id).sort((a, b) => new Date(b.received_date) - new Date(a.received_date));
          const current = lots.find((c) => c.lot_number === p.lot_number) || lots[0];
          const status = expiryStatus(current?.expiry_date);
          const todaysEntry = entries.find((e) => e.panel_id === p.id && e.date === today);

          return (
            <div key={p.id} style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{p.name}</div>
                  <div style={{ fontSize: 11.5, color: "#8A9694" }}>{p.device || "no device set"} · {p.department}</div>
                </div>
                {!todaysEntry && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#C1432B", background: "#FBEAE6", padding: "4px 10px", borderRadius: 5 }}>⚠ Today's QC not entered yet</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5 }}>
                <div><span style={{ color: "#8A9694" }}>Current lot: </span><b>{p.lot_number || "—"}</b></div>
                <div><span style={{ color: "#8A9694" }}>Received: </span>{current?.received_date || "—"} {current?.received_by ? `by ${current.received_by}` : ""}</div>
                <span style={{ fontWeight: 700, color: status.color, background: status.bg, padding: "3px 9px", borderRadius: 5 }}>{status.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
        reviewRow[e.date] = lastReviewerLabel(e);
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

function Approvals({ items, panels, onReview, onReviewBulk }) {
  const groups = useMemo(() => {
    const map = {};
    items.forEach(({ entry, analyteName }) => {
      if (!map[entry.id]) map[entry.id] = { entry, analytes: [] };
      map[entry.id].analytes.push(analyteName);
    });
    return Object.values(map).sort((a, b) => new Date(b.entry.created_at) - new Date(a.entry.created_at));
  }, [items]);

  if (groups.length === 0) return <div style={{ textAlign: "center", padding: "60px 20px", color: "#8A9694", fontSize: 13.5 }}>Nothing waiting for review. 🎉</div>;
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Approvals</h2>
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>All items are pre-selected — just click Approve to accept everything, or untick what you don't want and Decline it.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {groups.map(({ entry, analytes }) => (
          <ApprovalEntryCard key={entry.id} entry={entry} analytes={analytes} panel={panels.find((p) => p.id === entry.panel_id)} onReview={onReview} onReviewBulk={onReviewBulk} />
        ))}
      </div>
    </div>
  );
}

function ApprovalEntryCard({ entry, analytes, panel, onReview, onReviewBulk }) {
  const [selected, setSelected] = useState(() => new Set(analytes));
  const [note, setNote] = useState("");

  function toggle(name) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  const selectedNames = analytes.filter((n) => selected.has(n));
  const needsNote = selectedNames.some((n) => (colorRank[entry.colors?.[n]] ?? 0) > 0);

  return (
    <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{panel ? panel.name : "Unknown"}</div>
        <div style={{ fontSize: 12, color: "#8A9694" }}>{entry.date} · by {entry.done_by}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
        {analytes.map((name) => {
          const color = entry.colors?.[name] || "pending";
          const m = COLOR_META[color];
          const flags = entry.flags?.[name] || [];
          return (
            <label key={name} style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 13, background: "#F7F9F8", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={selected.has(name)} onChange={() => toggle(name)} />
                <span style={{ fontWeight: 600, flex: 1 }}>{name}</span>
                <span>{entry.values?.[name]}{panel?.analytes?.find((a) => a.name === name)?.unit}</span>
                <span style={{ fontSize: 10, background: m.bg, color: m.fg, padding: "2px 7px", borderRadius: 4, fontWeight: 700 }}>{color}</span>
              </div>
              {flags.length > 0 && (
                <div style={{ fontSize: 10.5, color: "#8A2E1F", marginLeft: 24 }}>{flags.map((f) => RULE_DESCRIPTIONS[f] || f).join(" · ")}</div>
              )}
            </label>
          );
        })}
      </div>

      {needsNote && <div style={{ fontSize: 11.5, color: "#8A2E1F", marginBottom: 6 }}>A selected result isn't green — a note is required even to approve it.</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={needsNote ? "Note (required)" : "Note (optional)"} style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
        <button
          disabled={selectedNames.length === 0 || (needsNote && !note.trim())}
          onClick={() => onReviewBulk(entry, selectedNames, "approved", note)}
          style={{ background: "#2F6B4F", color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, opacity: selectedNames.length === 0 || (needsNote && !note.trim()) ? 0.5 : 1, display: "flex", alignItems: "center", gap: 4 }}
        ><Check size={13} /> Approve selected ({selectedNames.length})</button>
        <button
          disabled={selectedNames.length === 0 || !note.trim()}
          onClick={() => onReviewBulk(entry, selectedNames, "declined", note)}
          style={{ background: "#C1432B", color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, opacity: selectedNames.length === 0 || !note.trim() ? 0.5 : 1, display: "flex", alignItems: "center", gap: 4 }}
        ><X size={13} /> Decline selected ({selectedNames.length})</button>
      </div>
    </div>
  );
}
