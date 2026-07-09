import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";
import { isWithinShift, todayISO, yesterdayISO } from "./scheduleUtils";

function StatCard({ label, value, sub, tone }) {
  const colors = { green: { bg: "#E8F2EC", fg: "#2F6B4F" }, orange: { bg: "#FBF3DF", fg: "#B8860B" }, red: { bg: "#FBEAE6", fg: "#C1432B" }, neutral: { bg: "#F0F3F2", fg: "#516361" } };
  const c = colors[tone] || colors.neutral;
  return (
    <div style={{ background: c.bg, borderRadius: 10, padding: "16px 18px" }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: c.fg }}>{value}</div>
      <div style={{ fontSize: 12, color: c.fg, marginTop: 2, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: c.fg, opacity: 0.8, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function KPI({ panels, entries, baselines }) {
  const [staffOnDuty, setStaffOnDuty] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: staff } = await supabase.from("staff_members").select("*").eq("deleted", false);
      const { data: shifts } = await supabase.from("shift_templates").select("*").eq("deleted", false);
      const { data: sched } = await supabase.from("schedule_entries").select("*").in("date", [todayISO(), yesterdayISO()]);
      const shiftByCode = {};
      (shifts || []).forEach((s) => { shiftByCode[s.code] = s; });
      const now = new Date();
      let count = 0;
      (staff || []).forEach((m) => {
        const tEntry = (sched || []).find((e) => e.staff_id === m.id && e.date === todayISO());
        const tShift = tEntry ? shiftByCode[tEntry.shift_code] : null;
        if (tShift && isWithinShift(tShift, todayISO(), now)) { count++; return; }
        const yEntry = (sched || []).find((e) => e.staff_id === m.id && e.date === yesterdayISO());
        const yShift = yEntry ? shiftByCode[yEntry.shift_code] : null;
        if (yShift?.night_shift && isWithinShift(yShift, yesterdayISO(), now)) count++;
      });
      setStaffOnDuty({ count, total: (staff || []).length });
    })();
  }, []);

  const monthPrefix = new Date().toISOString().slice(0, 7);

  const stats = useMemo(() => {
    const monthEntries = entries.filter((e) => e.date.startsWith(monthPrefix));
    let green = 0, orange = 0, red = 0, pending = 0, approved = 0, declined = 0, total = 0;
    monthEntries.forEach((e) => {
      Object.entries(e.values || {}).forEach(([name, val]) => {
        total++;
        const c = e.colors?.[name];
        if (c === "green") green++;
        else if (c === "orange") orange++;
        else if (c === "red") red++;
        const rv = e.reviews?.[name]?.status || "pending";
        if (rv === "approved") approved++;
        else if (rv === "declined") declined++;
        else pending++;
      });
    });
    const cvs = baselines.filter((b) => b.mean).map((b) => (b.sd / b.mean) * 100);
    const avgCV = cvs.length ? (cvs.reduce((s, v) => s + v, 0) / cvs.length).toFixed(1) : "—";
    return { total, green, orange, red, pending, approved, declined, avgCV, monthEntries: monthEntries.length };
  }, [entries, baselines, monthPrefix]);

  const passRate = stats.total ? Math.round((stats.green / stats.total) * 100) : 0;

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>KPI</h2>
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>Lab-wide snapshot for {new Date().toLocaleString([], { month: "long", year: "numeric" })}.</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
        <StatCard label="QC results this month" value={stats.total} tone="neutral" />
        <StatCard label="Pass rate" value={`${passRate}%`} sub={`${stats.green} green of ${stats.total}`} tone={passRate >= 90 ? "green" : passRate >= 75 ? "orange" : "red"} />
        <StatCard label="Warnings" value={stats.orange} tone={stats.orange > 0 ? "orange" : "green"} />
        <StatCard label="Rejects" value={stats.red} tone={stats.red > 0 ? "red" : "green"} />
        <StatCard label="Avg CV%" value={stats.avgCV === "—" ? "—" : `${stats.avgCV}%`} tone="neutral" />
        <StatCard label="Pending review" value={stats.pending} tone={stats.pending > 0 ? "orange" : "green"} />
        <StatCard label="Approved" value={stats.approved} tone="green" />
        <StatCard label="Declined" value={stats.declined} tone={stats.declined > 0 ? "red" : "green"} />
        <StatCard label="Active devices" value={panels.length} tone="neutral" />
        {staffOnDuty && <StatCard label="Staff on duty now" value={`${staffOnDuty.count}/${staffOnDuty.total}`} tone="neutral" />}
      </div>

      <div style={{ fontSize: 11.5, color: "#8A9694" }}>Avg CV% is calculated across every analyte with an established normal range, using its most recent Mean/SD.</div>
    </div>
  );
}
