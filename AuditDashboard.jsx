import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { todayISO } from "./scheduleUtils";

function StatCard({ label, value, tone }) {
  const colors = { green: ["#E8F2EC", "#2F6B4F"], orange: ["#FBF3DF", "#B8860B"], red: ["#FBEAE6", "#C1432B"], neutral: ["#F0F3F2", "#516361"] };
  const [bg, fg] = colors[tone] || colors.neutral;
  return (
    <div style={{ background: bg, borderRadius: 12, padding: "16px 18px", flex: "1 1 150px" }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: fg }}>{value}</div>
      <div style={{ fontSize: 12, color: fg, marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function AuditDashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    async function load() {
      const today = todayISO();
      const monthStart = today.slice(0, 8) + "01";

      const [{ data: items }, { data: completions }, { data: incidents }, { data: entries }, { data: equipment }, { data: events }] = await Promise.all([
        supabase.from("checklist_items").select("*").eq("deleted", false).eq("frequency", "daily"),
        supabase.from("checklist_completions").select("*").eq("period_key", today),
        supabase.from("incident_reports").select("*").eq("deleted", false).gte("date", monthStart),
        supabase.from("qc_entries").select("colors").gte("date", monthStart),
        supabase.from("equipment").select("id"),
        supabase.from("equipment_events").select("equipment_id, next_due_date").not("next_due_date", "is", null),
      ]);

      const taskPct = items?.length ? Math.round(((completions?.length || 0) / items.length) * 100) : null;

      let totalResults = 0, greenResults = 0;
      (entries || []).forEach((e) => {
        Object.values(e.colors || {}).forEach((c) => { totalResults++; if (c === "green") greenResults++; });
      });
      const qcPassRate = totalResults ? Math.round((greenResults / totalResults) * 100) : null;

      const latestDueByEquip = {};
      (events || []).forEach((ev) => {
        const cur = latestDueByEquip[ev.equipment_id];
        if (!cur || new Date(ev.next_due_date) > new Date(cur)) latestDueByEquip[ev.equipment_id] = ev.next_due_date;
      });
      const overdueCount = Object.values(latestDueByEquip).filter((d) => new Date(d) < new Date(today)).length;
      const totalEquip = equipment?.length || 0;
      const calibCompliance = totalEquip ? Math.round(((totalEquip - overdueCount) / totalEquip) * 100) : null;

      setStats({ taskPct, incidentCount: incidents?.length || 0, qcPassRate, calibCompliance, overdueCount, totalEquip });
    }
    load();
  }, []);

  if (!stats) return <div style={{ padding: 40, textAlign: "center", color: "#8A9694" }}>Loading…</div>;

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Audit Dashboard</h2>
      <div style={{ fontSize: 12.5, color: "#7B8E8A", marginBottom: 20 }}>A quick snapshot of how ready the lab is right now — for surprise audits or a morning check.</div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <StatCard label="Today's tasks completed" value={stats.taskPct === null ? "—" : `${stats.taskPct}%`} tone={stats.taskPct === null ? "neutral" : stats.taskPct >= 80 ? "green" : stats.taskPct >= 50 ? "orange" : "red"} />
        <StatCard label="Incidents this month" value={stats.incidentCount} tone={stats.incidentCount === 0 ? "green" : stats.incidentCount <= 3 ? "orange" : "red"} />
        <StatCard label="QC pass rate (month)" value={stats.qcPassRate === null ? "—" : `${stats.qcPassRate}%`} tone={stats.qcPassRate === null ? "neutral" : stats.qcPassRate >= 95 ? "green" : stats.qcPassRate >= 85 ? "orange" : "red"} />
        <StatCard label="Calibration compliance" value={stats.calibCompliance === null ? "—" : `${stats.calibCompliance}%`} tone={stats.calibCompliance === null ? "neutral" : stats.calibCompliance === 100 ? "green" : stats.calibCompliance >= 80 ? "orange" : "red"} />
      </div>

      {stats.overdueCount > 0 && (
        <div style={{ background: "#FBEAE6", border: "1px solid #C1432B33", borderRadius: 10, padding: 14, fontSize: 13, color: "#C1432B" }}>
          ⚠ {stats.overdueCount} of {stats.totalEquip} equipment items are overdue for maintenance/calibration — check the Equipment page.
        </div>
      )}
    </div>
  );
}
