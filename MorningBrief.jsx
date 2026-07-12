import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { todayISO } from "./scheduleUtils";

export default function MorningBrief({ displayName }) {
  const [brief, setBrief] = useState(null);

  useEffect(() => {
    async function load() {
      const today = todayISO();
      const [{ data: equipment }, { data: events }, { data: incidents }] = await Promise.all([
        supabase.from("equipment").select("id, name"),
        supabase.from("equipment_events").select("equipment_id, next_due_date").not("next_due_date", "is", null),
        supabase.from("incident_reports").select("id").eq("deleted", false).eq("status", "open"),
      ]);

      const latestDueByEquip = {};
      (events || []).forEach((ev) => {
        const cur = latestDueByEquip[ev.equipment_id];
        if (!cur || new Date(ev.next_due_date) > new Date(cur)) latestDueByEquip[ev.equipment_id] = ev.next_due_date;
      });
      let overdue = 0, dueSoon = 0;
      Object.values(latestDueByEquip).forEach((d) => {
        const days = Math.round((new Date(d) - new Date(today)) / 86400000);
        if (days < 0) overdue++;
        else if (days <= 5) dueSoon++;
      });

      setBrief({ overdue, dueSoon, openIncidents: (incidents || []).length });
    }
    load();
  }, []);

  if (!brief) return null;
  const lines = [];
  if (brief.overdue > 0) lines.push(`⚠ ${brief.overdue} equipment item${brief.overdue === 1 ? " is" : "s are"} overdue for calibration/maintenance.`);
  if (brief.dueSoon > 0) lines.push(`🔧 ${brief.dueSoon} equipment item${brief.dueSoon === 1 ? "" : "s"} need${brief.dueSoon === 1 ? "s" : ""} attention within 5 days.`);
  if (brief.openIncidents > 0) lines.push(`📋 ${brief.openIncidents} open incident${brief.openIncidents === 1 ? "" : "s"} to review.`);
  if (lines.length === 0) lines.push("✅ Nothing urgent — equipment and incidents all look good.");

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 12, padding: 16, marginBottom: 18 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{greeting}, {displayName} — here's your brief</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {lines.map((l, i) => (
          <div key={i} style={{ fontSize: 13, color: "#516361" }}>{l}</div>
        ))}
      </div>
    </div>
  );
}
