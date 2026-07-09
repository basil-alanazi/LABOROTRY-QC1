import React, { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "./supabaseClient";

const inputStyle = { width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 14, boxSizing: "border-box" };

export default function StaffMembers({ departments, role }) {
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
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>The employee roster used by the schedule.</div>

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
    </div>
  );
}
