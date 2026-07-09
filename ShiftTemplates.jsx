import React, { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "./supabaseClient";
import { shiftDurationHours } from "./scheduleUtils";

const inputStyle = { width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" };

const DEFAULT_SHIFTS = [
  { code: "A", name: "A", start_time: "08:00", end_time: "16:00", color: "#2F8F5B" },
  { code: "A2", name: "A2", start_time: "09:00", end_time: "21:00", color: "#3EA36B" },
  { code: "B", name: "B", start_time: "16:00", end_time: "00:00", color: "#D8862B" },
  { code: "C", name: "C", start_time: "20:00", end_time: "00:00", color: "#C1702B" },
  { code: "D", name: "D", start_time: "07:00", end_time: "16:30", color: "#3E6ACF" },
  { code: "D2", name: "D2", start_time: "07:00", end_time: "17:00", color: "#5A7FE0" },
  { code: "E", name: "E", start_time: "07:00", end_time: "15:00", color: "#4A90D9" },
  { code: "F", name: "F", start_time: "12:00", end_time: "20:00", color: "#B8860B" },
  { code: "G", name: "G", start_time: "18:00", end_time: "02:00", color: "#8A5A2B", night_shift: true },
  { code: "M", name: "M", start_time: "08:00", end_time: "20:00", color: "#0F7173" },
  { code: "N", name: "N", start_time: "00:00", end_time: "08:00", color: "#7A4FA3", night_shift: true },
  { code: "N*", name: "N*", start_time: "22:00", end_time: "08:00", color: "#8A5FB3", night_shift: true },
  { code: "N**", name: "N**", start_time: "20:00", end_time: "08:00", color: "#9A6FC3", night_shift: true },
  { code: "N***", name: "N***", start_time: "16:00", end_time: "04:00", color: "#AA7FD3", night_shift: true },
  { code: "N2", name: "N2", start_time: "22:30", end_time: "08:00", color: "#6A3F93", night_shift: true },
  { code: "U", name: "U", start_time: "16:00", end_time: "01:30", color: "#B5473A", night_shift: true },
  { code: "W", name: "W", start_time: "08:00", end_time: "15:00", color: "#5A9BD9" },
  { code: "X", name: "X", start_time: "07:30", end_time: "16:00", color: "#4A80C9" },
  { code: "OFF", name: "Day Off", start_time: "", end_time: "", color: "#8A9694", is_off: true },
  { code: "V.C", name: "Vacation", start_time: "", end_time: "", color: "#D8B31A", is_off: true },
];

function emptyShift() {
  return { code: "", name: "", start_time: "", end_time: "", color: "#0F7173", night_shift: false, is_off: false };
}

export default function ShiftTemplates({ role }) {
  const [shifts, setShifts] = useState(null);
  const [form, setForm] = useState(emptyShift());
  const canEdit = role === "admin" || role === "super";

  async function loadAll() {
    const { data } = await supabase.from("shift_templates").select("*").eq("deleted", false).order("code");
    setShifts(data || []);
  }
  useEffect(() => { loadAll(); }, []);

  async function loadDefaults() {
    if (!confirm("Load the standard shift list? This adds any shift codes you don't already have.")) return;
    const existingCodes = new Set((shifts || []).map((s) => s.code));
    const toInsert = DEFAULT_SHIFTS.filter((s) => !existingCodes.has(s.code)).map((s) => ({
      ...s, total_hours: s.is_off ? 0 : shiftDurationHours(s.start_time, s.end_time),
    }));
    if (toInsert.length) await supabase.from("shift_templates").insert(toInsert);
    loadAll();
  }

  async function saveShift() {
    if (!form.code || !form.name) return;
    const total_hours = form.is_off ? 0 : shiftDurationHours(form.start_time, form.end_time);
    const { error } = await supabase.from("shift_templates").insert({ ...form, total_hours });
    if (error) { alert("That shift code may already exist."); return; }
    setForm(emptyShift());
    loadAll();
  }

  async function updateShift(id, fields) {
    if (fields.start_time !== undefined || fields.end_time !== undefined) {
      const s = shifts.find((x) => x.id === id);
      const start = fields.start_time ?? s.start_time;
      const end = fields.end_time ?? s.end_time;
      fields.total_hours = s.is_off ? 0 : shiftDurationHours(start, end);
    }
    await supabase.from("shift_templates").update(fields).eq("id", id);
    loadAll();
  }

  async function deleteShift(id) {
    if (!confirm("Remove this shift? It stays on past schedules but can't be assigned going forward.")) return;
    await supabase.from("shift_templates").update({ deleted: true }).eq("id", id);
    loadAll();
  }

  if (shifts === null) return <div style={{ padding: 40, textAlign: "center", color: "#8A9694" }}>Loading…</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Shift templates</h2>
        {canEdit && shifts.length === 0 && (
          <button onClick={loadDefaults} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 700 }}>Load standard shift list</button>
        )}
      </div>
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>Define every shift code once here — every schedule and the shift key reads from this automatically.</div>

      {canEdit && (
        <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, marginBottom: 20 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: "#F0F3F2" }}>
                <th style={{ padding: "7px 8px", textAlign: "left" }}>Code</th>
                <th style={{ padding: "7px 8px", textAlign: "left" }}>Name</th>
                <th style={{ padding: "7px 8px", textAlign: "left" }}>Start</th>
                <th style={{ padding: "7px 8px", textAlign: "left" }}>End</th>
                <th style={{ padding: "7px 8px", textAlign: "left" }}>Hours</th>
                <th style={{ padding: "7px 8px", textAlign: "left" }}>Color</th>
                <th style={{ padding: "7px 8px", textAlign: "left" }}>Night</th>
                <th style={{ padding: "7px 8px", textAlign: "left" }}>Off/Vac</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.id} style={{ borderTop: "1px solid #EEF2F0" }}>
                  <td style={{ padding: "5px 8px", fontWeight: 700 }}>{s.code}</td>
                  <td style={{ padding: "5px 8px" }}><input defaultValue={s.name} onBlur={(e) => e.target.value !== s.name && updateShift(s.id, { name: e.target.value })} style={{ ...inputStyle, width: 100 }} /></td>
                  <td style={{ padding: "5px 8px" }}><input type="time" defaultValue={s.start_time} onBlur={(e) => e.target.value !== s.start_time && updateShift(s.id, { start_time: e.target.value })} style={{ ...inputStyle, width: 100 }} disabled={s.is_off} /></td>
                  <td style={{ padding: "5px 8px" }}><input type="time" defaultValue={s.end_time} onBlur={(e) => e.target.value !== s.end_time && updateShift(s.id, { end_time: e.target.value })} style={{ ...inputStyle, width: 100 }} disabled={s.is_off} /></td>
                  <td style={{ padding: "5px 8px", color: "#8A9694" }}>{s.total_hours}h</td>
                  <td style={{ padding: "5px 8px" }}><input type="color" defaultValue={s.color} onChange={(e) => updateShift(s.id, { color: e.target.value })} style={{ width: 34, height: 28, border: "1px solid #C7D1CE", borderRadius: 5 }} /></td>
                  <td style={{ padding: "5px 8px" }}><input type="checkbox" checked={s.night_shift} onChange={(e) => updateShift(s.id, { night_shift: e.target.checked })} /></td>
                  <td style={{ padding: "5px 8px" }}><input type="checkbox" checked={s.is_off} onChange={(e) => updateShift(s.id, { is_off: e.target.checked })} /></td>
                  <td style={{ padding: "5px 8px" }}><button onClick={() => deleteShift(s.id)} style={{ background: "none", border: "none", color: "#C1432B" }}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!canEdit && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {shifts.map((s) => (
            <span key={s.id} style={{ fontSize: 12, fontWeight: 700, background: s.color + "22", color: s.color, padding: "5px 10px", borderRadius: 6 }}>{s.code} — {s.is_off ? s.name : `${s.start_time}–${s.end_time}`}</span>
          ))}
        </div>
      )}

      {canEdit && (
        <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#7B8E8A", marginBottom: 10 }}>ADD A SHIFT</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input placeholder="Code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} style={{ ...inputStyle, width: 80 }} />
            <input placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={{ ...inputStyle, width: 130 }} />
            <input type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} style={{ ...inputStyle, width: 110 }} disabled={form.is_off} />
            <input type="time" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} style={{ ...inputStyle, width: 110 }} disabled={form.is_off} />
            <input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} style={{ width: 34, height: 32, border: "1px solid #C7D1CE", borderRadius: 5 }} />
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={form.night_shift} onChange={(e) => setForm((f) => ({ ...f, night_shift: e.target.checked }))} /> Night</label>
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={form.is_off} onChange={(e) => setForm((f) => ({ ...f, is_off: e.target.checked }))} /> Off/Vacation</label>
            <button onClick={saveShift} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}><Plus size={13} /> Add</button>
          </div>
        </div>
      )}
    </div>
  );
}
