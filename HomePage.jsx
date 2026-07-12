import React, { useState, useEffect } from "react";
import { LayoutGrid, ClipboardCheck, Users, Calendar, Table2, FolderOpen, MessageCircle, FlaskConical, AlertTriangle, ClipboardList, Wrench, CheckCircle2 } from "lucide-react";
import { supabase } from "./supabaseClient";
import { isWithinShift, todayISO, yesterdayISO } from "./scheduleUtils";
import { loadProfilesMap } from "./userProfiles";
import MorningBrief from "./MorningBrief";
import ShiftCountdown from "./ShiftCountdown";

function greeting(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomePage({ username, role, config, panels, activeEntries, pendingCount, onNavigate, profiles }) {
  const [now, setNow] = useState(new Date());
  const [onDuty, setOnDuty] = useState([]);
  const displayName = (profiles?.[username]?.full_name || "").trim().split(" ")[0] || username;
  const [mine, setMine] = useState(null); // { department, shiftCode }
  const [backupDaysAgo, setBackupDaysAgo] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [finishedMsg, setFinishedMsg] = useState("");
  const isAdmin = role === "admin" || role === "super";

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from("backup_log").select("created_at").order("created_at", { ascending: false }).limit(1).then(({ data }) => {
      if (!data || data.length === 0) { setBackupDaysAgo(Infinity); return; }
      const days = Math.floor((Date.now() - new Date(data[0].created_at).getTime()) / 86400000);
      setBackupDaysAgo(days);
    });
  }, [isAdmin]);

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

  useEffect(() => {
    (async () => {
      const today = todayISO();
      const [{ data: items }, { data: completions }, { data: incidents }, { data: handover }] = await Promise.all([
        supabase.from("checklist_items").select("id").eq("deleted", false).eq("frequency", "daily"),
        supabase.from("checklist_completions").select("item_id").eq("period_key", today),
        supabase.from("incident_reports").select("id").eq("deleted", false).eq("status", "open"),
        supabase.from("shift_handovers").select("id").eq("deleted", false).eq("date", today).eq("handover_by", username).maybeSingle(),
      ]);
      setTasks({
        checklistLeft: Math.max(0, (items?.length || 0) - (completions?.length || 0)),
        openIncidents: incidents?.length || 0,
        handedOver: !!handover,
      });
    })();
  }, [username]);

  const today = now.toISOString().slice(0, 10);
  const enteredToday = panels.filter((p) => activeEntries.some((e) => e.panel_id === p.id && e.date === today)).length;
  const qcDone = panels.length > 0 && enteredToday === panels.length;

  const quickActions = [
    { key: "qc", label: "New QC", icon: FlaskConical },
    { key: "incident", label: "New Incident", icon: AlertTriangle },
    { key: "handover", label: "Handover", icon: Users },
    ...(isAdmin ? [{ key: "equipment", label: "Maintenance", icon: Wrench }] : []),
    { key: "checklists", label: "Checklist", icon: ClipboardList },
  ];

  const tiles = [
    { key: "qc", label: "QC Entry", icon: LayoutGrid },
    { key: "chat", label: "Chat", icon: MessageCircle },
    ...(isAdmin ? [{ key: "approvals", label: "Approvals", icon: ClipboardCheck }] : []),
    { key: "staff", label: "Staff", icon: Users },
    { key: "myschedule", label: "My Schedule", icon: Calendar },
    ...(isAdmin ? [{ key: "tables", label: "Tables", icon: Table2 }] : []),
    ...(isAdmin ? [{ key: "files", label: "Files", icon: FolderOpen }] : []),
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>
          {profiles?.[username]?.custom_welcome_message
            ? profiles[username].custom_welcome_message.replace(/{name}/g, displayName)
            : `${greeting(now.getHours())}, ${displayName} 👋`}
        </div>
        {isAdmin && backupDaysAgo !== null && backupDaysAgo >= 7 && (
          <button onClick={() => onNavigate("backup")} style={{ display: "block", width: "100%", textAlign: "left", marginTop: 10, background: "#FBF3DF", border: "1px solid #E8D9A8", borderRadius: 8, padding: "10px 14px", fontSize: 12.5, color: "#8A6D2F" }}>
            💾 {backupDaysAgo === Infinity ? "You haven't taken a backup yet" : `It's been ${backupDaysAgo} days since your last backup`} — tap to download one now.
          </button>
        )}
        <div style={{ fontSize: 13, color: "#8A9694", marginTop: 4 }}>{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · {now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</div>
      </div>

      <ShiftCountdown username={username} />

      {/* Today's tasks — the whole point of the workspace: what needs doing, right now */}
      <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 12, padding: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#7B8E8A", marginBottom: 10 }}>TODAY YOU HAVE</div>
        {tasks === null ? (
          <div style={{ fontSize: 12.5, color: "#8A9694" }}>Loading…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <TaskRow done={qcDone} icon={FlaskConical} label={`QC entry — ${enteredToday}/${panels.length} panels`} onClick={() => onNavigate("qc")} />
            <TaskRow done={tasks.checklistLeft === 0} icon={ClipboardList} label={tasks.checklistLeft === 0 ? "Daily checklist — all done" : `Daily checklist — ${tasks.checklistLeft} task${tasks.checklistLeft === 1 ? "" : "s"} left`} onClick={() => onNavigate("checklists")} />
            {tasks.openIncidents > 0 && <TaskRow done={false} warn icon={AlertTriangle} label={`${tasks.openIncidents} open incident${tasks.openIncidents === 1 ? "" : "s"} to review`} onClick={() => onNavigate("incident")} />}
            <TaskRow done={tasks.handedOver} icon={Users} label={tasks.handedOver ? "Shift handover — submitted" : "Shift handover — not submitted yet"} onClick={() => onNavigate("handover")} />
          </div>
        )}
      </div>

      <MorningBrief displayName={displayName} />

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

      {/* Big, thumb-friendly quick actions — the core of the workspace */}
      <div style={{ fontSize: 13, fontWeight: 700, color: "#7B8E8A", marginBottom: 10 }}>QUICK ACTIONS</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 12, marginBottom: 16 }}>
        {quickActions.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => onNavigate(t.key)} style={{ background: "#0F7173", border: "none", borderRadius: 12, padding: "18px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <Icon size={22} color="#fff" />
              <div style={{ fontWeight: 700, fontSize: 13, textAlign: "center", color: "#fff" }}>{t.label}</div>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => setFinishedMsg("Nice work today — hope the rest of your shift is smooth! 👋")}
        style={{ width: "100%", background: "#1B2B2E", color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontWeight: 700, fontSize: 14, marginBottom: finishedMsg ? 8 : 24 }}
      >
        ✅ Finish My Shift
      </button>
      {finishedMsg && <div style={{ fontSize: 12.5, color: "#2F6B4F", textAlign: "center", marginBottom: 24 }}>{finishedMsg}</div>}

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

      <div style={{ fontSize: 13, fontWeight: 700, color: "#7B8E8A", marginBottom: 10 }}>MORE PAGES</div>
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

function TaskRow({ done, warn, icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: "8px 4px", textAlign: "left", width: "100%" }}>
      {done ? <CheckCircle2 size={18} color="#2F6B4F" /> : <Icon size={18} color={warn ? "#C1432B" : "#B8860B"} />}
      <span style={{ fontSize: 13.5, color: done ? "#8A9694" : "#1B2B2E", textDecoration: done ? "line-through" : "none", fontWeight: done ? 400 : 600 }}>{label}</span>
    </button>
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
