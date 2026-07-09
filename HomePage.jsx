import React, { useState, useEffect } from "react";
import { LayoutGrid, ClipboardCheck, Users, Calendar, Table2, FolderOpen } from "lucide-react";

function greeting(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomePage({ username, role, config, panels, activeEntries, pendingCount, onNavigate }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const today = now.toISOString().slice(0, 10);
  const enteredToday = panels.filter((p) => activeEntries.some((e) => e.panel_id === p.id && e.date === today)).length;
  const notEnteredToday = panels.length - enteredToday;

  const tiles = [
    { key: "qc", label: "QC Entry", icon: LayoutGrid },
    ...(role === "admin" || role === "super" ? [{ key: "approvals", label: "Approvals", icon: ClipboardCheck }] : []),
    { key: "staff", label: "Staff", icon: Users },
    { key: "schedule", label: "Schedule", icon: Calendar },
    ...(role === "admin" || role === "super" ? [{ key: "tables", label: "Tables", icon: Table2 }] : []),
    ...(role === "admin" || role === "super" ? [{ key: "files", label: "Files", icon: FolderOpen }] : []),
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{greeting(now.getHours())}, {username} 👋</div>
        <div style={{ fontSize: 13, color: "#8A9694", marginTop: 4 }}>{now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })} · {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 28 }}>
        <StatCard label="QC entered today" value={`${enteredToday}/${panels.length}`} tone={notEnteredToday === 0 ? "green" : "orange"} />
        {(role === "admin" || role === "super") && <StatCard label="Pending approvals" value={pendingCount} tone={pendingCount > 0 ? "orange" : "green"} />}
        <StatCard label="Active devices" value={panels.length} tone="neutral" />
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: "#7B8E8A", marginBottom: 10 }}>QUICK LAUNCH</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 12 }}>
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => onNavigate(t.key)} style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 12, padding: "20px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <Icon size={22} color={config?.theme_color || "#0F7173"} />
              <div style={{ fontWeight: 700, fontSize: 13, textAlign: "center" }}>{t.label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }) {
  const colors = { green: { bg: "#E8F2EC", fg: "#2F6B4F" }, orange: { bg: "#FBF3DF", fg: "#B8860B" }, neutral: { bg: "#F0F3F2", fg: "#516361" } };
  const c = colors[tone] || colors.neutral;
  return (
    <div style={{ background: c.bg, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: c.fg }}>{value}</div>
      <div style={{ fontSize: 11.5, color: c.fg, marginTop: 2 }}>{label}</div>
    </div>
  );
}
