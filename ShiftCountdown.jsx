import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { todayISO } from "./scheduleUtils";

export default function ShiftCountdown({ username }) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    async function load() {
      const today = todayISO();
      const { data: profile } = await supabase.from("user_profiles").select("employee_id").eq("username", username).maybeSingle();
      if (!profile?.employee_id) { setInfo(null); return; }

      const { data: staff } = await supabase.from("staff_members").select("id").eq("job_number", profile.employee_id).maybeSingle();
      if (!staff) { setInfo(null); return; }

      const { data: entry } = await supabase.from("schedule_entries").select("shift_code").eq("staff_id", staff.id).eq("date", today).maybeSingle();
      if (!entry) { setInfo(null); return; }

      const { data: shift } = await supabase.from("shift_templates").select("*").eq("code", entry.shift_code).maybeSingle();
      if (!shift || shift.is_off) { setInfo(null); return; }

      const { data: items } = await supabase.from("checklist_items").select("id").eq("deleted", false).eq("frequency", "daily");
      const { data: completions } = await supabase.from("checklist_completions").select("item_id").eq("period_key", today);
      const remaining = (items?.length || 0) - (completions?.length || 0);

      const { data: handover } = await supabase.from("shift_handovers").select("id").eq("deleted", false).eq("date", today).eq("handover_by", username).maybeSingle();

      setInfo({ shiftCode: shift.code, endTime: shift.end_time, tasksRemaining: Math.max(0, remaining), handedOver: !!handover });
    }
    load();
  }, [username]);

  if (!info) return null;

  const [endH, endM] = info.endTime.split(":").map(Number);
  const now = new Date();
  let end = new Date(now);
  end.setHours(endH, endM, 0, 0);
  if (end < now) end.setDate(end.getDate() + 1); // overnight shift already past midnight
  const diffMs = end - now;
  const hoursLeft = Math.floor(diffMs / 3600000);
  const minsLeft = Math.floor((diffMs % 3600000) / 60000);
  const isEnding = diffMs > 0 && diffMs <= 30 * 60000;

  return (
    <div style={{ background: isEnding ? "#FBF3DF" : "#fff", border: "1px solid " + (isEnding ? "#E8D9A8" : "#E1E8E5"), borderRadius: 12, padding: 16, marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: "#8A9694", fontWeight: 700, letterSpacing: 0.3 }}>YOUR {info.shiftCode} SHIFT</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: isEnding ? "#B8860B" : "#1B2B2E" }}>
            {diffMs > 0 ? `${hoursLeft}h ${minsLeft}m left` : "Shift ended"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: info.tasksRemaining === 0 ? "#2F6B4F" : "#516361" }}>{info.tasksRemaining}</div>
            <div style={{ fontSize: 10.5, color: "#8A9694" }}>tasks left</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: info.handedOver ? "#2F6B4F" : "#B8860B" }}>{info.handedOver ? "✓" : "—"}</div>
            <div style={{ fontSize: 10.5, color: "#8A9694" }}>handover</div>
          </div>
        </div>
      </div>
    </div>
  );
}
