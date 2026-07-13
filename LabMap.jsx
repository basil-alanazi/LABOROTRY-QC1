import React, { useState, useEffect } from "react";
import { Wrench } from "lucide-react";
import { supabase } from "./supabaseClient";
import { todayISO } from "./scheduleUtils";

export default function LabMap({ onNavigate }) {
  const [equipment, setEquipment] = useState(null);
  const [statusById, setStatusById] = useState({});

  useEffect(() => {
    async function load() {
      const today = todayISO();
      const [{ data: equip }, { data: events }] = await Promise.all([
        supabase.from("equipment").select("*"),
        supabase.from("equipment_events").select("equipment_id, next_due_date, event_type").not("next_due_date", "is", null),
      ]);

      const latestDueByEquip = {};
      (events || []).forEach((ev) => {
        const cur = latestDueByEquip[ev.equipment_id];
        if (!cur || new Date(ev.next_due_date) > new Date(cur)) latestDueByEquip[ev.equipment_id] = ev.next_due_date;
      });
      // A fault logged with no resolution shows as broken (red), regardless of due dates.
      const faultedIds = new Set((events || []).filter((e) => e.event_type === "fault").map((e) => e.equipment_id));

      const statuses = {};
      (equip || []).forEach((eq) => {
        if (faultedIds.has(eq.id)) { statuses[eq.id] = "red"; return; }
        const due = latestDueByEquip[eq.id];
        if (!due) { statuses[eq.id] = "green"; return; }
        const days = Math.round((new Date(due) - new Date(today)) / 86400000);
        statuses[eq.id] = days < 0 ? "red" : days <= 14 ? "yellow" : "green";
      });

      setEquipment(equip || []);
      setStatusById(statuses);
    }
    load();
  }, []);

  if (equipment === null) return <div style={{ padding: 40, textAlign: "center", color: "#8A9694" }}>Loading…</div>;

  const byDept = {};
  equipment.forEach((eq) => {
    const dept = eq.department || "Other";
    byDept[dept] = byDept[dept] || [];
    byDept[dept].push(eq);
  });

  const STATUS_META = {
    green: { color: "#2F6B4F", bg: "#E8F2EC", label: "Working" },
    yellow: { color: "#B8860B", bg: "#FBF3DF", label: "Needs attention" },
    red: { color: "#C1432B", bg: "#FBEAE6", label: "Down" },
  };

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Lab Map</h2>
      <div style={{ fontSize: 12.5, color: "#7B8E8A", marginBottom: 8 }}>Every device, grouped by department, colored by status. Tap one to open it.</div>

      <div style={{ display: "flex", gap: 14, marginBottom: 20, fontSize: 11.5 }}>
        {Object.entries(STATUS_META).map(([k, m]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: m.color, display: "inline-block" }} /> {m.label}
          </div>
        ))}
      </div>

      {equipment.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#8A9694" }}>No equipment added yet.</div>
      ) : (
        Object.entries(byDept).map(([dept, items]) => (
          <div key={dept} style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#7B8E8A", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.3 }}>{dept}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10 }}>
              {items.map((eq) => {
                const meta = STATUS_META[statusById[eq.id] || "green"];
                return (
                  <button
                    key={eq.id}
                    onClick={() => onNavigate && onNavigate("equipment")}
                    style={{ background: meta.bg, border: `1.5px solid ${meta.color}55`, borderRadius: 12, padding: "16px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer" }}
                  >
                    <Wrench size={20} color={meta.color} />
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: "#1B2B2E", textAlign: "center" }}>{eq.name}</div>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: meta.color }} />
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
