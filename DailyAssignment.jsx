import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { todayISO, classifyShift, findCloseMatch } from "./scheduleUtils";
import DepartmentAssignmentImport from "./DepartmentAssignmentImport";

const inputStyle = { width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 14, boxSizing: "border-box" };

// Same palette used when exporting to Excel — keeps the on-screen table and
// the downloaded file looking like the same document.
const DEPT_COLORS = {
  chemistry: { bg: "#BBDEFB", fg: "#0D3C6E" },
  hematology: { bg: "#FFCDD2", fg: "#7A1F1F" },
  microbiology: { bg: "#C8E6C9", fg: "#1B5E20" },
  phlebotomy: { bg: "#FFE0B2", fg: "#7A4A00" },
  registration: { bg: "#E1BEE7", fg: "#4A148C" },
  etb: { bg: "#B2EBF2", fg: "#00363A" },
  "hema+micro": { bg: "#D7CCC8", fg: "#3E2723" },
  "results entry": { bg: "#F0F4C3", fg: "#33691E" },
  off: { bg: "#E0E0E0", fg: "#424242" },
  "v.c": { bg: "#CFD8DC", fg: "#263238" },
};
function colorForDept(name) {
  if (!name) return null;
  const base = String(name).split(" (")[0].trim().toLowerCase();
  return DEPT_COLORS[base] || null;
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
  const [editingCell, setEditingCell] = useState(null);

  async function loadAll() {
    const [y, mm] = month.split("-");
    const monthStart = `${month}-01`;
    const nextMonth = mm === "12" ? `${Number(y) + 1}-01-01` : `${y}-${String(Number(mm) + 1).padStart(2, "0")}-01`;

    const { data: s } = await supabase.from("staff_members").select("*").eq("deleted", false).order("sort_order", { ascending: true, nullsFirst: false }).order("full_name");
    const { data, error } = await supabase.from("department_assignments").select("*").gte("date", monthStart).lt("date", nextMonth).eq("period", period);
    const { data: allNames } = await supabase.from("department_assignments").select("department_name");
    const { data: sh } = await supabase.from("shift_templates").select("*").eq("deleted", false);
    const { data: se, error: seError } = await supabase.from("schedule_entries").select("*").gte("date", monthStart).lt("date", nextMonth);
    if (error) console.error("department_assignments load error:", error);
    if (seError) console.error("schedule_entries load error:", seError);
    setStaff(s || []);
    setAssignments(data || []);
    setSuggestions([...new Set((allNames || []).map((a) => a.department_name).filter(Boolean))]);
    setShifts(sh || []);
    setScheduleEntries(se || []);
  }
  useEffect(() => { loadAll(); }, [month, period]);

  function shiftPeriodFor(staffId, date) {
    const entry = scheduleEntries.find((e) => e.staff_id === staffId && e.date === date);
    if (!entry) return { period: null, shift: null };
    const shift = shifts.find((s) => s.code === entry.shift_code);
    return { period: classifyShift(shift), shift };
  }

  function assignmentFor(staffId, date) {
    return (assignments || []).find((a) => a.staff_id === staffId && a.date === date);
  }

  async function setAssignment(staffId, date, deptName) {
    if (!deptName) { loadAll(); return; }

    const match = findCloseMatch(deptName, suggestions);
    let finalValue = deptName;
    if (match?.exact) {
      finalValue = match.exact; // same word, just fix the casing/spacing to the existing standard
    } else if (match?.suggestion) {
      const useSuggestion = confirm(`You typed "${deptName}" — did you mean "${match.suggestion}"?\n\nOK = use "${match.suggestion}"\nCancel = keep "${deptName}" as a new value`);
      if (useSuggestion) finalValue = match.suggestion;
    }

    const { error } = await supabase.from("department_assignments").upsert(
      { staff_id: staffId, date, period, department_name: finalValue },
      { onConflict: "staff_id,date,period" }
    );
    if (error) alert(`Save failed: ${error.message}`);
    loadAll();
  }

  async function applyImportedAssignments(entries) {
    const [y, mm] = month.split("-");
    const rows = entries.map((e) => ({
      staff_id: e.staffId,
      date: `${y}-${mm}-${String(e.day).padStart(2, "0")}`,
      period,
      department_name: e.department_name,
    }));
    const { error } = await supabase.from("department_assignments").upsert(rows, { onConflict: "staff_id,date,period" });
    if (error) throw new Error(error.message || "Database write failed");
    await loadAll();
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
      <div style={{ fontSize: 11.5, fontWeight: 700, color: "#C1432B", background: "#FBEAE6", padding: "6px 10px", borderRadius: 6, marginBottom: 12 }}>
        DEBUG: querying period="{period}" — {(assignments || []).length} rows loaded.
        {assignments && assignments.length > 0 && (
          <div style={{ marginTop: 4, fontWeight: 400 }}>
            Actual period values in loaded rows: {[...new Set(assignments.map((a) => a.period))].map((p) => `"${p}"`).join(", ")}
            <br />First row: date={assignments[0].date}, period="{assignments[0].period}", dept="{assignments[0].department_name}"
          </div>
        )}
      </div>
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
                    const { period: staffPeriod } = shiftPeriodFor(m.id, dateStr);
                    const matches = staffPeriod === null ? true : staffPeriod === period;
                    const periodLabel = { morning: "AM", evening: "PM", night: "Night" }[staffPeriod] || "";
                    const deptColor = colorForDept(a?.department_name);
                    return (
                      <td key={m.id} style={{ padding: 2, borderBottom: "1px solid #EEF2F0", background: deptColor ? deptColor.bg : (matches ? "transparent" : "#F7F7F7"), opacity: matches ? 1 : 0.45 }}>
                        {shiftCode && (
                          <div style={{ fontSize: 8.5, color: deptColor ? deptColor.fg : (matches ? "#0F7173" : "#B0B8B6"), textAlign: "center", fontWeight: 700, opacity: 0.8 }}>{shiftCode}{periodLabel ? ` · ${periodLabel}` : ""}</div>
                        )}
                        {canEdit ? (
                          <button
                            onClick={() => setEditingCell({ staffId: m.id, date: dateStr, name: m.full_name, day: d, current: a?.department_name || "" })}
                            style={{ border: "none", background: "transparent", fontSize: 12, fontWeight: deptColor ? 700 : 400, color: deptColor ? deptColor.fg : "#1B2B2E", width: "100%", padding: "8px 5px", textAlign: "center", minHeight: 32, cursor: "pointer" }}
                            title={!matches ? `Not scheduled for ${period} on this day` : ""}
                          >
                            {a?.department_name || ""}
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, fontWeight: deptColor ? 700 : 400, color: deptColor ? deptColor.fg : "#1B2B2E", display: "block", textAlign: "center", padding: "6px 5px" }}>{a?.department_name || ""}</span>
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

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#7B8E8A", marginBottom: 8 }}>COLOR KEY</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Object.entries(DEPT_COLORS).map(([name, c]) => (
            <span key={name} style={{ fontSize: 11, fontWeight: 700, background: c.bg, color: c.fg, padding: "4px 9px", borderRadius: 6, textTransform: "capitalize" }}>{name}</span>
          ))}
        </div>
      </div>

      <datalist id="dept-suggestions">
        {suggestions.map((s) => <option key={s} value={s} />)}
      </datalist>

      {editingCell && (
        <CellEditorModal
          cell={editingCell}
          suggestions={suggestions}
          onClose={() => setEditingCell(null)}
          onSave={(value) => { setAssignment(editingCell.staffId, editingCell.date, value); setEditingCell(null); }}
        />
      )}
    </div>
  );
}

function CellEditorModal({ cell, suggestions, onClose, onSave }) {
  const [value, setValue] = useState(cell.current);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,25,26,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 360, padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{cell.name}</div>
        <div style={{ fontSize: 12.5, color: "#8A9694", marginBottom: 16 }}>Day {cell.day}</div>
        <input
          list="dept-suggestions"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSave(value)}
          placeholder="Type a department…"
          style={{ width: "100%", border: "1px solid #C7D1CE", borderRadius: 8, padding: "14px 14px", fontSize: 16, boxSizing: "border-box", marginBottom: 14 }}
        />
        {suggestions.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {suggestions.slice(0, 8).map((s) => (
              <button key={s} onClick={() => setValue(s)} style={{ background: "#F0F3F2", border: "none", borderRadius: 6, padding: "6px 10px", fontSize: 12, color: "#516361" }}>{s}</button>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => onSave(value)} style={{ flex: 1, background: "#0F7173", color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontWeight: 700, fontSize: 14 }}>Save</button>
          <button onClick={onClose} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 8, padding: "12px 16px", fontSize: 14 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
