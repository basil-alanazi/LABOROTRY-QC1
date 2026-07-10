import React, { useState, useEffect } from "react";
import { LayoutGrid, ClipboardCheck, Users, Calendar, Table2, FolderOpen, MessageCircle } from "lucide-react";
import { supabase } from "./supabaseClient";
import { isWithinShift, todayISO, yesterdayISO } from "./scheduleUtils";
import { loadProfilesMap } from "./userProfiles";

function greeting(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomePage({ username, role, config, panels, activeEntries, pendingCount, onNavigate }) {
  const [now, setNow] = useState(new Date());
  const [onDuty, setOnDuty] = useState([]);
  const [mine, setMine] = useState(null); // { department, shiftCode }

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: staff } = await supabase.from("staff_members").select("*").eq("deleted", false);
      const { data: shifts } = await supabase.from("shift_templates").select("*").eq("deleted", false);
      const { data: sched } = await supabase.from("schedule_entries").select("*").in("date", [todayISO(), yesterdayISO()]);
      const { data: assignments } = await supabase.from("department_assignments").select("*").eq("date", todayISO());

      const shiftByCode = {};
      (shifts || []).forEach((s) => { shiftByCode[s.code] = s; });
      const nowT = new Date();
      const available = [];
      let myShiftCode = null;
      let myDeptAM = null;
      let myDeptPM = null;
      let myDeptNight = null;

      const profiles = await loadProfilesMap();
      const myEmployeeId = profiles[username]?.employee_id;

      (staff || []).forEach((m) => {
        const tEntry = (sched || []).find((e) => e.staff_id === m.id && e.date === todayISO());
        const tShift = tEntry ? shiftByCode[tEntry.shift_code] : null;
        let isOnDuty = false;
        let activeCode = null;
        if (tShift && isWithinShift(tShift, todayISO(), nowT)) { isOnDuty = true; activeCode = tShift.code; }
        else {
          const yEntry = (sched || []).find((e) => e.staff_id === m.id && e.date === yesterdayISO());
          const yShift = yEntry ? shiftByCode[yEntry.shift_code] : null;
          if (yShift?.night_shift && isWithinShift(yShift, yesterdayISO(), nowT)) { isOnDuty = true; activeCode = yShift.code; }
        }
        if (isOnDuty) available.push({ name: m.full_name, code: activeCode });

        if (myEmployeeId && m.job_number === myEmployeeId) {
          myShiftCode = tEntry?.shift_code || null;
          myDeptAM = (assignments || []).find((a) => a.staff_id === m.id && a.period === "morning")?.department_name || null;
          myDeptPM = (assignments || []).find((a) => a.staff_id === m.id && a.period === "evening")?.department_name || null;
          myDeptNight = (assignments || []).find((a) => a.staff_id === m.id && a.period === "night")?.department_name || null;
        }
      });

      setOnDuty(available);
      setMine({ departmentAM: myDeptAM, departmentPM: myDeptPM, departmentNight: myDeptNight, shiftCode: myShiftCode });
    })();
  }, [username]);

  const today = now.toISOString().slice(0, 10);
  const enteredToday = panels.filter((p) => activeEntries.some((e) => e.panel_id === p.id && e.date === today)).length;

  const tiles = [
    { key: "qc", label: "QC Entry", icon: LayoutGrid },
    { key: "chat", label: "Chat", icon: MessageCircle },
    ...(role === "admin" || role === "super" ? [{ key: "approvals", label: "Approvals", icon: ClipboardCheck }] : []),
    { key: "staff", label: "Staff", icon: Users },
    { key: "myschedule", label: "My Schedule", icon: Calendar },
    ...(role === "admin" || role === "super" ? [{ key: "tables", label: "Tables", icon: Table2 }] : []),
    ...(role === "admin" || role === "super" ? [{ key: "files", label: "Files", icon: FolderOpen }] : []),
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{greeting(now.getHours())}, {username} 👋</div>
        <div style={{ fontSize: 13, color: "#8A9694", marginTop: 4 }}>{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · {now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</div>
      </div>

      {mine && (mine.departmentAM || mine.departmentPM || mine.departmentNight || mine.shiftCode) && (
        <div style={{ background: "#E8F2EC", border: "1px solid #2F6B4F33", borderRadius: 10, padding: "14px 18px", marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "#2F6B4F", fontWeight: 700, marginBottom: 4 }}>YOU TODAY</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1B2B2E" }}>
            ☀️ Morning: {mine.departmentAM || "not set"} &nbsp;·&nbsp; 🌙 Evening: {mine.departmentPM || "not set"} &nbsp;·&nbsp; 🌃 Night: {mine.departmentNight || "not set"}
            {mine.shiftCode ? ` · Shift: ${mine.shiftCode}` : ""}
          </div>
          <button onClick={() => onNavigate("myschedule")} style={{ marginTop: 8, background: "none", border: "1px solid #2F6B4F55", color: "#2F6B4F", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600 }}>View My Schedule</button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
        <StatCard label="QC entered today" value={`${enteredToday}/${panels.length}`} tone={enteredToday === panels.length ? "green" : "orange"} />
        {(role === "admin" || role === "super") && <StatCard label="Pending approvals" value={pendingCount} tone={pendingCount > 0 ? "orange" : "green"} />}
        <StatCard label="On duty now" value={onDuty.length} tone="neutral" />
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#7B8E8A", marginBottom: 8 }}>WHO'S AVAILABLE NOW</div>
        {onDuty.length === 0 ? (
          <div style={{ fontSize: 13, color: "#8A9694" }}>Nobody is showing as on duty right now.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {onDuty.map((p, i) => (
              <span key={i} style={{ fontSize: 12.5, fontWeight: 600, background: "#E8F2EC", color: "#2F6B4F", padding: "5px 10px", borderRadius: 6 }}>🟢 {p.name} ({p.code})</span>
            ))}
          </div>
        )}
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
