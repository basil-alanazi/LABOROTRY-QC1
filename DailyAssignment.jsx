import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { todayISO } from "./scheduleUtils";
import DepartmentAssignmentImport from "./DepartmentAssignmentImport";

const inputStyle = { width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 14, boxSizing: "border-box" };

function classifyShift(shift) {
  if (!shift || shift.is_off) return null;
  if (shift.night_shift) return "night";
  const startHour = Number((shift.start_time || "00:00").split(":")[0]);
  return startHour < 12 ? "morning" : "evening";
}

export default function DailyAssignment({ role }) {
  const canEdit = role === "admin" || role === "super";
  const [staff, setStaff] = useState(null);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [period, setPeriod] = useState("morning");
  const [assignments, setAssignments] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [scheduleEntries, setScheduleEntries] = useState([]);

  async function loadAll() {
    const { data: s } = await supabase.from("staff_members").select("*").eq("deleted", false).order("sort_order", { ascending: true, nullsFirst: false }).order("full_name");
    const { data } = await supabase.from("department_assignments").select("*").like("date", `${month}%`).eq("period", period);
    const { data: allNames } = await supabase.from("department_assignments").select("department_name");
    const { data: sh } = await supabase.from("shift_templates").select("*").eq("deleted", false);
    const { data: se } = await supabase.from("schedule_entries").select("*").like("date", `${month}%`);
    setStaff(s || []);
    setAssignments(data || []);
    setSuggestions([...new Set((allNames || []).map((a) => a.department_name).filter(Boolean))]);
    setShifts(sh || []);
    setScheduleEntries(se || []);
  }
  useEffect(() => { loadAll(); }, [month, period]);

  function shiftPeriodFor(staffId, date) {
    const entry = scheduleEntries.find((e) => e.staff_id === staffId && e.date === date);
    if (!entry) return null;
    const shift = shifts.find((s) => s.code === entry.shift_code);
    return classifyShift(shift);
  }

  function assignmentFor(staffId, date) {
    return (assignments || []).find((a) => a.staff_id === staffId && a.date === date);
  }

  async function setAssignment(staffId, date, deptName) {
    const existing = assignmentFor(staffId, date);
    if (existing) {
      await supabase.from("department_assignments").update({ department_name: deptName }).eq("id", existing.id);
    } else if (deptName) {
      await supabase.from("department_assignments").insert({ staff_id: staffId, date, period, department_name: deptName });
    }
    loadAll();
  }

  async function applyImportedAssignments(entries) {
    const [y, mm] = month.split("-");
    for (const e of entries) {
      const dateStr = `${y}-${mm}-${String(e.day).padStart(2, "0")}`;
      const existing = (assignments || []).find((a) => a.staff_id === e.staffId && a.date === dateStr);
      if (existing) {
        await supabase.from("department_assignments").update({ department_name: e.department_name }).eq("id", existing.id);
      } else {
        await supabase.from("department_assignments").insert({ staff_id: e.staffId, date: dateStr, period, department_name: e.department_name });
      }
    }
    loadAll();
  }

  if (staff === null || assignments === null) return <div style={{ padding: 40, textAlign: "center", color: "#8A9694" }}>Loading…</div>;
  if (staff.length === 0) return <div style={{ textAlign: "center", padding: "40px 20px", color: "#8A9694" }}>Add employees on the Staff page first.</div>;

  const [year, mo] = month.split("-");
  const days = new Date(Number(year), Number(mo), 0).getDate();
  const dayList = Array.from({ length: days }, (_, i) => i + 1);
  const today = todayISO();

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Daily Assignment</h2>
      <div style={{ fontSize: 12.5, color: "#8A9694", marginBottom: 12 }}>Type any department, bench, or rotation name per employee per day — not limited to the fixed department list. Morning, evening, and night are tracked separately. Cells fade out for anyone not actually scheduled in that shift on that day (based on their shift code in Schedule).</div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ ...inputStyle, width: "auto" }} />
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setPeriod("morning")} style={{ border: "1px solid " + (period === "morning" ? "#0F7173" : "#C7D1CE"), background: period === "morning" ? "#0F7173" : "#fff", color: period === "morning" ? "#fff" : "#516361", borderRadius: 6, padding: "7px 14px", fontSize: 12.5, fontWeight: 600 }}>☀️ Morning</button>
          <button onClick={() => setPeriod("evening")} style={{ border: "1px solid " + (period === "evening" ? "#0F7173" : "#C7D1CE"), background: period === "evening" ? "#0F7173" : "#fff", color: period === "evening" ? "#fff" : "#516361", borderRadius: 6, padding: "7px 14px", fontSize: 12.5, fontWeight: 600 }}>🌙 Evening</button>
          <button onClick={() => setPeriod("night")} style={{ border: "1px solid " + (period === "night" ? "#0F7173" : "#C7D1CE"), background: period === "night" ? "#0F7173" : "#fff", color: period === "night" ? "#fff" : "#516361", borderRadius: 6, padding: "7px 14px", fontSize: 12.5, fontWeight: 600 }}>🌃 Night</button>
        </div>
      </div>

      {canEdit && <DepartmentAssignmentImport staff={staff} month={month} period={period} onApply={applyImportedAssignments} />}

      <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
          <thead>
            <tr>
              <th style={{ position: "sticky", left: 0, background: "#F0F3F2", padding: "6px 8px", minWidth: 60, borderBottom: "1px solid #E1E8E5" }}>Day</th>
              {staff.map((m) => (
                <th key={m.id} style={{ padding: "6px 6px", borderBottom: "1px solid #E1E8E5", minWidth: 110, fontSize: 10.5 }}>
                  <div>{m.full_name}</div>
                  {m.job_number && <div style={{ fontWeight: 400, color: "#8A9694" }}>#{m.job_number}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dayList.map((d) => {
              const dateStr = `${year}-${mo}-${String(d).padStart(2, "0")}`;
              return (
                <tr key={d} style={{ background: dateStr === today ? "#EAF6F4" : "transparent" }}>
                  <td style={{ position: "sticky", left: 0, background: dateStr === today ? "#EAF6F4" : "#fff", padding: "3px 8px", fontWeight: 600, borderBottom: "1px solid #EEF2F0" }}>{d}</td>
                  {staff.map((m) => {
                    const a = assignmentFor(m.id, dateStr);
                    const shiftCode = scheduleEntries.find((e) => e.staff_id === m.id && e.date === dateStr)?.shift_code;
                    const staffPeriod = shiftPeriodFor(m.id, dateStr);
                    const matches = staffPeriod === null ? true : staffPeriod === period;
                    const periodLabel = { morning: "AM", evening: "PM", night: "Night" }[staffPeriod] || "";
                    return (
                      <td key={m.id} style={{ padding: 2, borderBottom: "1px solid #EEF2F0", background: matches ? "transparent" : "#F7F7F7", opacity: matches ? 1 : 0.35 }}>
                        {shiftCode && (
                          <div style={{ fontSize: 8.5, color: matches ? "#0F7173" : "#B0B8B6", textAlign: "center", fontWeight: 700 }}>{shiftCode}{periodLabel ? ` · ${periodLabel}` : ""}</div>
                        )}
                        {canEdit ? (
                          <input
                            list="dept-suggestions"
                            defaultValue={a?.department_name || ""}
                            onBlur={(e) => e.target.value !== (a?.department_name || "") && setAssignment(m.id, dateStr, e.target.value)}
                            style={{ border: "none", background: "transparent", fontSize: 10.5, width: "100%", padding: "3px 4px" }}
                            title={!matches ? `Not scheduled for ${period} on this day` : ""}
                          />
                        ) : (
                          <span style={{ fontSize: 10.5 }}>{a?.department_name || ""}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <datalist id="dept-suggestions">
        {suggestions.map((s) => <option key={s} value={s} />)}
      </datalist>
    </div>
  );
}
