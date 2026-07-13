import React, { useState, useEffect } from "react";
import { FlaskConical, AlertTriangle, ClipboardCheck, Users, Wrench } from "lucide-react";
import { supabase } from "./supabaseClient";
import { todayISO } from "./scheduleUtils";
import DateNav from "./DateNav";

const TYPE_META = {
  qc: { label: "QC Entry", icon: FlaskConical, color: "#3E6ACF" },
  incident: { label: "Incident", icon: AlertTriangle, color: "#C1432B" },
  handover: { label: "Handover", icon: Users, color: "#B8860B" },
  checklist: { label: "Task done", icon: ClipboardCheck, color: "#2F6B4F" },
  equipment: { label: "Equipment event", icon: Wrench, color: "#7A4FA3" },
};

export default function LabTimeline() {
  const [date, setDate] = useState(todayISO());
  const [events, setEvents] = useState(null);

  useEffect(() => {
    async function load() {
      const [{ data: qc }, { data: incidents }, { data: handovers }, { data: completions }, { data: equipEvents }] = await Promise.all([
        supabase.from("qc_entries").select("id, created_at, edited_at, panel_id, edited_by").eq("date", date),
        supabase.from("incident_reports").select("*").eq("deleted", false).eq("date", date),
        supabase.from("shift_handovers").select("*").eq("deleted", false).eq("date", date),
        supabase.from("checklist_completions").select("*, checklist_items(title)").eq("period_key", date),
        supabase.from("equipment_events").select("*, equipment(name)").eq("date", date),
      ]);

      const items = [
        ...(qc || []).map((e) => ({ type: "qc", time: e.edited_at || e.created_at, title: "QC result entered", detail: e.edited_by || "" })),
        ...(incidents || []).map((e) => ({ type: "incident", time: e.created_at, title: e.description || "Incident reported", detail: `${e.severity || ""} · ${e.reported_by || ""}` })),
        ...(handovers || []).map((e) => ({ type: "handover", time: e.created_at, title: `Shift handover — ${e.shift || ""}`, detail: `${e.handover_by || ""} → ${e.received_by || ""}` })),
        ...(completions || []).map((e) => ({ type: "checklist", time: e.completed_at, title: e.checklist_items?.title || "Task completed", detail: e.completed_by || "" })),
        ...(equipEvents || []).map((e) => ({ type: "equipment", time: e.created_at, title: `${e.event_type || "Event"} — ${e.equipment?.name || ""}`, detail: e.performed_by || "" })),
      ].filter((e) => e.time).sort((a, b) => new Date(a.time) - new Date(b.time));

      setEvents(items);
    }
    load();
  }, [date]);

  return (
    <div>
      <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Lab Timeline</h2>
        <button onClick={() => window.print()} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "#516361" }}>🖨️ Print</button>
      </div>
      <div style={{ fontSize: 12.5, color: "#7B8E8A", marginBottom: 16 }}>Everything that happened in the lab on one day, in order — no jumping between pages.</div>

      <div className="no-print" style={{ marginBottom: 18 }}>
        <DateNav value={date} onChange={setDate} />
      </div>

      {events === null ? (
        <div style={{ padding: 30, textAlign: "center", color: "#8A9694" }}>Loading…</div>
      ) : events.length === 0 ? (
        <div style={{ textAlign: "center", padding: "30px 20px", color: "#8A9694" }}>Nothing recorded for this day yet.</div>
      ) : (
        <div className="print-area" style={{ position: "relative", paddingLeft: 20 }}>
          <div style={{ position: "absolute", left: 5, top: 6, bottom: 6, width: 2, background: "#E1E8E5" }} />
          {events.map((e, i) => {
            const meta = TYPE_META[e.type];
            const Icon = meta.icon;
            const time = new Date(e.time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
            return (
              <div key={i} style={{ position: "relative", marginBottom: 16 }}>
                <div style={{ position: "absolute", left: -20, top: 2, width: 12, height: 12, borderRadius: "50%", background: meta.color, border: "2px solid #fff" }} />
                <div style={{ fontSize: 11, color: "#8A9694", marginBottom: 2 }}>{time} · <span style={{ color: meta.color, fontWeight: 700 }}>{meta.label}</span></div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1B2B2E" }}>{e.title}</div>
                {e.detail && <div style={{ fontSize: 12, color: "#8A9694" }}>{e.detail}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
