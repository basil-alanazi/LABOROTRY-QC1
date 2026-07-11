import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "./supabaseClient";
import { todayISO, classifyShift, findCloseMatch, shiftDate } from "./scheduleUtils";
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

function startOfWeek(dateStr) {
  // Saturday-start week, matching the rest of the app's schedule conventions.
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day + 1) % 7; // days since last Saturday
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

export default function DailyAssignment({ role }) {
  const canEdit = role === "admin" || role === "super";
  const [staff, setStaff] = useState(null);
  const [viewMode, setViewMode] = useState("week"); // "week" | "month"
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [weekStart, setWeekStart] = useState(startOfWeek(todayISO()));
  const [period, setPeriod] = useState("morning");
  const [assignments, setAssignments] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [scheduleEntries, setScheduleEntries] = useState([]);

  // The range we actually need to fetch — a week, or the whole month.
  const rangeStart = viewMode === "week" ? weekStart : `${month}-01`;
  const rangeEnd = viewMode === "week"
    ? shiftDate(weekStart, 7)
    : (() => { const [y, mm] = month.split("-"); return mm === "12" ? `${Number(y) + 1}-01-01` : `${y}-${String(Number(mm) + 1).padStart(2, "0")}-01`; })();

  async function loadAll() {
    const { data: s } = await supabase.from("staff_members").select("*").eq("deleted", false).order("sort_order", { ascending: true, nullsFirst: false }).order("full_name");
    const { data, error } = await supabase.from("department_assignments").select("*").gte("date", rangeStart).lt("date", rangeEnd).eq("period", period);
    const { data: allNames } = await supabase.from("department_assignments").select("department_name");
    const { data: sh } = await supabase.from("shift_templates").select("*").eq("deleted", false);
    const { data: se, error: seError } = await supabase.from("schedule_entries").select("*").gte("date", rangeStart).lt("date", rangeEnd);
    if (error) console.error("department_assignments load error:", error);
    if (seError) console.error("schedule_entries load error:", seError);
    setStaff(s || []);
    setAssignments(data || []);
    setSuggestions([...new Set((allNames || []).map((a) => a.department_name).filter(Boolean))]);
    setShifts(sh || []);
    setScheduleEntries(se || []);
  }
  useEffect(() => { loadAll(); }, [month, weekStart, viewMode, period]);

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

  const today = todayISO();

  // Build the list of date strings to show as rows.
  let dateList;
  if (viewMode === "week") {
    dateList = Array.from({ length: 7 }, (_, i) => shiftDate(weekStart, i));
  } else {
    const [year, mo] = month.split("-");
    const days = new Date(Number(year), Number(mo), 0).getDate();
    dateList = Array.from({ length: days }, (_, i) => `${year}-${mo}-${String(i + 1).padStart(2, "0")}`);
  }
  const dayLabel = (dateStr) => new Date(dateStr + "T00:00:00").getDate();
  const weekdayLabel = (dateStr) => new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" });

  // Only show staff who are actually scheduled for this period on at least one visible day.
  const visibleStaff = staff.filter((m) =>
    dateList.some((d) => shiftPeriodFor(m.id, d).period === period)
  );

  return (
    <div>
      <h2 className="no-print" style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Daily Assignment</h2>
      <div className="no-print" style={{ fontSize: 12.5, color: "#8A9694", marginBottom: 12 }}>Type any department, bench, or rotation name per employee per day. Only staff actually scheduled for the selected shift are shown.</div>

      <div className="no-print" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setViewMode("week")} style={{ border: "1px solid " + (viewMode === "week" ? "#0F7173" : "#C7D1CE"), background: viewMode === "week" ? "#0F7173" : "#fff", color: viewMode === "week" ? "#fff" : "#516361", borderRadius: 6, padding: "7px 12px", fontSize: 12.5, fontWeight: 600 }}>Week</button>
          <button onClick={() => setViewMode("month")} style={{ border: "1px solid " + (viewMode === "month" ? "#0F7173" : "#C7D1CE"), background: viewMode === "month" ? "#0F7173" : "#fff", color: viewMode === "month" ? "#fff" : "#516361", borderRadius: 6, padding: "7px 12px", fontSize: 12.5, fontWeight: 600 }}>Full month</button>
        </div>

        {viewMode === "week" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => setWeekStart(shiftDate(weekStart, -7))} style={{ background: "#fff", border: "1px solid #C7D1CE", borderRadius: 7, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", color: "#516361" }}><ChevronLeft size={16} /></button>
            <div style={{ fontSize: 13, fontWeight: 600, minWidth: 150, textAlign: "center" }}>{dateList[0]} → {dateList[6]}</div>
            <button onClick={() => setWeekStart(shiftDate(weekStart, 7))} style={{ background: "#fff", border: "1px solid #C7D1CE", borderRadius: 7, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", color: "#516361" }}><ChevronRight size={16} /></button>
          </div>
        ) : (
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ ...inputStyle, width: "auto" }} />
        )}

        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setPeriod("morning")} style={{ border: "1px solid " + (period === "morning" ? "#0F7173" : "#C7D1CE"), background: period === "morning" ? "#0F7173" : "#fff", color: period === "morning" ? "#fff" : "#516361", borderRadius: 6, padding: "7px 14px", fontSize: 12.5, fontWeight: 600 }}>☀️ Morning</button>
          <button onClick={() => setPeriod("evening")} style={{ border: "1px solid " + (period === "evening" ? "#0F7173" : "#C7D1CE"), background: period === "evening" ? "#0F7173" : "#fff", color: period === "evening" ? "#fff" : "#516361", borderRadius: 6, padding: "7px 14px", fontSize: 12.5, fontWeight: 600 }}>🌙 Evening</button>
          <button onClick={() => setPeriod("night")} style={{ border: "1px solid " + (period === "night" ? "#0F7173" : "#C7D1CE"), background: period === "night" ? "#0F7173" : "#fff", color: period === "night" ? "#fff" : "#516361", borderRadius: 6, padding: "7px 14px", fontSize: 12.5, fontWeight: 600 }}>🌃 Night</button>
        </div>
        <button onClick={() => window.print()} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 7, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, color: "#516361" }}>🖨️ Print</button>
      </div>

      {canEdit && <div className="no-print"><DepartmentAssignmentImport staff={staff} month={month} period={period} onApply={applyImportedAssignments} /></div>}

      {visibleStaff.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#8A9694" }}>Nobody is scheduled for {period} in this {viewMode === "week" ? "week" : "month"} yet.</div>
      ) : (
        <div className="print-area" style={{ overflowX: "auto", background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10 }}>
          <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, background: "#F0F3F2", padding: "6px 8px", minWidth: 60, borderBottom: "1px solid #E1E8E5" }}>Day</th>
                {visibleStaff.map((m) => (
                  <th key={m.id} style={{ padding: "6px 6px", borderBottom: "1px solid #E1E8E5", minWidth: 110, fontSize: 10.5 }}>
                    <div>{m.full_name}</div>
                    {m.job_number && <div style={{ fontWeight: 400, color: "#8A9694" }}>#{m.job_number}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dateList.map((dateStr) => (
                <tr key={dateStr} style={{ background: dateStr === today ? "#EAF6F4" : "transparent" }}>
                  <td style={{ position: "sticky", left: 0, background: dateStr === today ? "#EAF6F4" : "#fff", padding: "3px 8px", fontWeight: 600, borderBottom: "1px solid #EEF2F0" }}>
                    {viewMode === "week" ? `${weekdayLabel(dateStr)} ${dayLabel(dateStr)}` : dayLabel(dateStr)}
                  </td>
                  {visibleStaff.map((m) => {
                    const { period: staffPeriod } = shiftPeriodFor(m.id, dateStr);
                    if (staffPeriod !== period) {
                      // Not scheduled for this shift on this day — leave a blank, non-interactive cell.
                      return <td key={m.id} style={{ padding: 2, borderBottom: "1px solid #EEF2F0", background: "#FAFBFB" }} />;
                    }
                    const a = assignmentFor(m.id, dateStr);
                    const deptColor = colorForDept(a?.department_name);
                    return (
                      <td key={m.id} style={{ padding: 2, borderBottom: "1px solid #EEF2F0", background: deptColor ? deptColor.bg : "transparent" }}>
                        {canEdit ? (
                          <input
                            list="dept-suggestions"
                            defaultValue={a?.department_name || ""}
                            onBlur={(e) => e.target.value !== (a?.department_name || "") && setAssignment(m.id, dateStr, e.target.value)}
                            style={{ border: "none", background: "transparent", fontSize: 12, fontWeight: deptColor ? 700 : 400, color: deptColor ? deptColor.fg : "#1B2B2E", width: "100%", padding: "8px 5px", textAlign: "center" }}
                          />
                        ) : (
                          <span style={{ fontSize: 12, fontWeight: deptColor ? 700 : 400, color: deptColor ? deptColor.fg : "#1B2B2E", display: "block", textAlign: "center", padding: "6px 5px" }}>{a?.department_name || ""}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <datalist id="dept-suggestions">
        {suggestions.map((s) => <option key={s} value={s} />)}
      </datalist>

      <div className="no-print" style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#7B8E8A", marginBottom: 8 }}>COLOR KEY</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Object.entries(DEPT_COLORS).map(([name, c]) => (
            <span key={name} style={{ fontSize: 11, fontWeight: 700, background: c.bg, color: c.fg, padding: "4px 9px", borderRadius: 6, textTransform: "capitalize" }}>{name}</span>
          ))}
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: landscape; margin: 8mm; }
          .print-area table { font-size: 8px !important; }
          .print-area th, .print-area td { padding: 1px 2px !important; }
        }
      `}</style>
    </div>
  );
}
