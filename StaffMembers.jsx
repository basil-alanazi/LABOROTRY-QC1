import React, { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "./supabaseClient";
import { todayISO } from "./scheduleUtils";

const inputStyle = { width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 14, boxSizing: "border-box" };

export default function StaffMembers({ departments, role }) {
  const [subTab, setSubTab] = useState("roster");
  const [staff, setStaff] = useState(null);
  const [form, setForm] = useState({ full_name: "", job_number: "", department: departments?.[0] || "" });
  const canEdit = role === "admin" || role === "super";

  async function loadAll() {
    const { data } = await supabase.from("staff_members").select("*").eq("deleted", false).order("full_name");
    setStaff(data || []);
  }
  useEffect(() => { loadAll(); }, []);

  async function addStaff() {
    if (!form.full_name) return;
    await supabase.from("staff_members").insert(form);
    setForm({ full_name: "", job_number: "", department: departments?.[0] || "" });
    loadAll();
  }
  async function removeStaff(id) {
    if (!confirm("Remove this employee from the roster? Their past schedule history stays.")) return;
    await supabase.from("staff_members").update({ deleted: true }).eq("id", id);
    loadAll();
  }

  if (staff === null) return <div style={{ padding: 40, textAlign: "center", color: "#8A9694" }}>Loading…</div>;

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Staff</h2>
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 16 }}>The employee roster, and where they're working each day.</div>

      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        <TabBtn active={subTab === "roster"} onClick={() => setSubTab("roster")} label="Roster" />
        <TabBtn active={subTab === "assignment"} onClick={() => setSubTab("assignment")} label="Daily Assignment" />
      </div>

      {subTab === "roster" && (
        <>
          {canEdit && (
            <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 14, marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input placeholder="Full name" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} style={{ ...inputStyle, flex: 2, minWidth: 140 }} />
                <input placeholder="Job number" value={form.job_number} onChange={(e) => setForm((f) => ({ ...f, job_number: e.target.value }))} style={{ ...inputStyle, flex: 1, minWidth: 100 }} />
                <select value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} style={{ ...inputStyle, flex: 1, minWidth: 120 }}>
                  {(departments || []).map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <button onClick={addStaff} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "0 14px", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}><Plus size={14} /> Add</button>
              </div>
            </div>
          )}

          {staff.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#8A9694" }}>No employees added yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {staff.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "1px solid #E1E8E5", borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.full_name}</div>
                    <div style={{ fontSize: 11.5, color: "#8A9694" }}>{s.job_number ? `#${s.job_number} · ` : ""}{s.department}</div>
                  </div>
                  {canEdit && <button onClick={() => removeStaff(s.id)} style={{ background: "none", border: "none", color: "#C1432B" }}><Trash2 size={15} /></button>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {subTab === "assignment" && <DailyAssignment staff={staff} canEdit={canEdit} />}
    </div>
  );
}

function TabBtn({ active, onClick, label }) {
  return <button onClick={onClick} style={{ background: active ? "#0F7173" : "#fff", color: active ? "#fff" : "#516361", border: "1px solid " + (active ? "#0F7173" : "#E1E8E5"), borderRadius: 7, padding: "7px 14px", fontSize: 13, fontWeight: 600 }}>{label}</button>;
}

// Free-text daily department assignment — independent of the Settings
// department list, so any label can be typed here (bench names, rotations...).
function DailyAssignment({ staff, canEdit }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [assignments, setAssignments] = useState(null);
  const [suggestions, setSuggestions] = useState([]);

  async function loadAll() {
    const { data } = await supabase.from("department_assignments").select("*").like("date", `${month}%`);
    const { data: allNames } = await supabase.from("department_assignments").select("department_name");
    setAssignments(data || []);
    setSuggestions([...new Set((allNames || []).map((a) => a.department_name).filter(Boolean))]);
  }
  useEffect(() => { loadAll(); }, [month]);

  function assignmentFor(staffId, date) {
    return (assignments || []).find((a) => a.staff_id === staffId && a.date === date);
  }

  async function setAssignment(staffId, date, deptName) {
    const existing = assignmentFor(staffId, date);
    if (existing) {
      await supabase.from("department_assignments").update({ department_name: deptName }).eq("id", existing.id);
    } else if (deptName) {
      await supabase.from("department_assignments").insert({ staff_id: staffId, date, department_name: deptName });
    }
    loadAll();
  }

  if (assignments === null) return <div style={{ padding: 20, textAlign: "center", color: "#8A9694" }}>Loading…</div>;
  if (!staff || staff.length === 0) return <div style={{ textAlign: "center", padding: "40px 20px", color: "#8A9694" }}>Add employees to the roster first.</div>;

  const [year, mo] = month.split("-");
  const days = new Date(Number(year), Number(mo), 0).getDate();
  const dayList = Array.from({ length: days }, (_, i) => i + 1);
  const today = todayISO();

  return (
    <div>
      <div style={{ fontSize: 12.5, color: "#8A9694", marginBottom: 12 }}>Type any department, bench, or rotation name per employee per day — not limited to the fixed department list.</div>
      <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ ...inputStyle, width: "auto", marginBottom: 16 }} />

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
                    return (
                      <td key={m.id} style={{ padding: 2, borderBottom: "1px solid #EEF2F0" }}>
                        {canEdit ? (
                          <input
                            list="dept-suggestions"
                            defaultValue={a?.department_name || ""}
                            onBlur={(e) => e.target.value !== (a?.department_name || "") && setAssignment(m.id, dateStr, e.target.value)}
                            style={{ border: "none", background: "transparent", fontSize: 10.5, width: "100%", padding: "3px 4px" }}
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
