import React, { useState, useEffect } from "react";
import { Trophy, Flame, Award, Star } from "lucide-react";
import { supabase } from "./supabaseClient";
import { todayISO } from "./scheduleUtils";

function Badge({ icon: Icon, title, value, sub, color }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 14, padding: 18, textAlign: "center" }}>
      <div style={{ width: 48, height: 48, borderRadius: "50%", background: color + "22", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
        <Icon size={22} color={color} />
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#1B2B2E", marginTop: 2 }}>{title}</div>
      {sub && <div style={{ fontSize: 11.5, color: "#8A9694", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export default function AchievementSystem() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    async function load() {
      const today = todayISO();
      const monthStart = today.slice(0, 8) + "01";

      const [{ data: lastIncident }, { data: entries }, { data: panels }, { data: assignments }, { data: staff }, { data: completions }] = await Promise.all([
        supabase.from("incident_reports").select("date").eq("deleted", false).order("date", { ascending: false }).limit(1),
        supabase.from("qc_entries").select("date, panel_id").gte("date", monthStart),
        supabase.from("qc_panels").select("id").eq("deleted", false),
        supabase.from("department_assignments").select("department_name, staff_id").gte("date", monthStart),
        supabase.from("staff_members").select("id, full_name").eq("deleted", false),
        supabase.from("checklist_completions").select("completed_by").gte("completed_at", monthStart),
      ]);

      // Days since last incident
      const daysSinceIncident = lastIncident?.[0]?.date
        ? Math.floor((new Date(today) - new Date(lastIncident[0].date)) / 86400000)
        : 999;

      // Consecutive days of 100% QC coverage, counting back from today
      const panelCount = panels?.length || 0;
      const entriesByDate = {};
      (entries || []).forEach((e) => {
        entriesByDate[e.date] = entriesByDate[e.date] || new Set();
        entriesByDate[e.date].add(e.panel_id);
      });
      let qcStreak = 0;
      let d = new Date(today);
      while (panelCount > 0) {
        const key = d.toISOString().slice(0, 10);
        if ((entriesByDate[key]?.size || 0) >= panelCount) { qcStreak++; d.setDate(d.getDate() - 1); }
        else break;
      }

      // Best department this month — most department-assignment entries logged
      const deptCounts = {};
      (assignments || []).forEach((a) => { if (a.department_name) deptCounts[a.department_name] = (deptCounts[a.department_name] || 0) + 1; });
      const bestDept = Object.entries(deptCounts).sort((a, b) => b[1] - a[1])[0];

      // Best employee at completing checklist tasks this month
      const staffNameById = {};
      (staff || []).forEach((s) => { staffNameById[s.id] = s.full_name; });
      const taskCounts = {};
      (completions || []).forEach((c) => { if (c.completed_by) taskCounts[c.completed_by] = (taskCounts[c.completed_by] || 0) + 1; });
      const bestTasker = Object.entries(taskCounts).sort((a, b) => b[1] - a[1])[0];

      setStats({ daysSinceIncident, qcStreak, bestDept, bestTasker });
    }
    load();
  }, []);

  if (!stats) return <div style={{ padding: 40, textAlign: "center", color: "#8A9694" }}>Loading…</div>;

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Achievements</h2>
      <div style={{ fontSize: 12.5, color: "#7B8E8A", marginBottom: 20 }}>Just for motivation — celebrating the streaks and wins that keep the lab running smoothly.</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
        <Badge icon={Flame} color="#C1432B" title="Days incident-free" value={stats.daysSinceIncident >= 999 ? "—" : stats.daysSinceIncident} sub={stats.daysSinceIncident >= 100 ? "🔥 100+ day streak!" : "Keep it going"} />
        <Badge icon={Trophy} color="#2F6B4F" title="Full QC coverage streak" value={`${stats.qcStreak}d`} sub={stats.qcStreak >= 30 ? "🏆 30-day milestone!" : "Consecutive days"} />
        <Badge icon={Award} color="#B8860B" title="Top department (month)" value={stats.bestDept ? stats.bestDept[0] : "—"} sub={stats.bestDept ? `${stats.bestDept[1]} assignments logged` : "No data yet"} />
        <Badge icon={Star} color="#7A4FA3" title="Top task completer (month)" value={stats.bestTasker ? (stats.bestTasker[0]) : "—"} sub={stats.bestTasker ? `${stats.bestTasker[1]} tasks completed` : "No data yet"} />
      </div>
    </div>
  );
}
