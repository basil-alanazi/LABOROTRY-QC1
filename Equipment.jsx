import React, { useState, useEffect } from "react";
import { Plus, Trash2, Wrench, AlertTriangle, CheckCircle2, Download, FileText, Upload } from "lucide-react";
import { supabase } from "./supabaseClient";
import { todayISO } from "./scheduleUtils";

const inputStyle = { width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 14, boxSizing: "border-box" };

const TYPE_META = {
  maintenance: { label: "Maintenance", icon: Wrench, bg: "#E7F0FB", fg: "#3E6ACF" },
  calibration: { label: "Calibration", icon: CheckCircle2, bg: "#E8F2EC", fg: "#2F6B4F" },
  fault: { label: "Fault", icon: AlertTriangle, bg: "#FBEAE6", fg: "#C1432B" },
};

export default function Equipment({ departments, role, username, onNavigate }) {
  const [list, setList] = useState(null);
  const [events, setEvents] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", department: departments?.[0] || "", serial_number: "", install_date: "" });
  const canEdit = role === "admin" || role === "super";

  async function loadAll() {
    const { data: e } = await supabase.from("equipment").select("*").eq("deleted", false).order("name");
    const { data: ev } = await supabase.from("equipment_events").select("*").eq("deleted", false).order("date", { ascending: false });
    setList(e || []);
    setEvents(ev || []);
  }
  useEffect(() => { loadAll(); }, []);

  async function addEquipment() {
    if (!form.name) return;
    await supabase.from("equipment").insert({ ...form, install_date: form.install_date || null });
    setForm({ name: "", department: departments?.[0] || "", serial_number: "", install_date: "" });
    setShowAdd(false);
    loadAll();
  }
  async function removeEquipment(id) {
    if (!confirm("Remove this equipment? Its history stays for audit purposes.")) return;
    await supabase.from("equipment").update({ deleted: true }).eq("id", id);
    loadAll();
  }

  if (list === null || events === null) return <div style={{ padding: 40, textAlign: "center", color: "#8A9694" }}>Loading…</div>;

  if (selected) {
    const eq = list.find((x) => x.id === selected);
    if (!eq) { setSelected(null); return null; }
    return <EquipmentDetail equipment={eq} events={events.filter((e) => e.equipment_id === eq.id)} canEdit={canEdit} username={username} onBack={() => setSelected(null)} reload={loadAll} onNavigate={onNavigate} />;
  }

  function dueStatus(eqId) {
    const upcoming = events.filter((e) => e.equipment_id === eqId && e.next_due_date).sort((a, b) => new Date(a.next_due_date) - new Date(b.next_due_date))[0];
    if (!upcoming) return null;
    const days = Math.round((new Date(upcoming.next_due_date) - new Date(todayISO())) / 86400000);
    if (days < 0) return { label: `overdue ${Math.abs(days)}d`, bg: "#FBEAE6", fg: "#C1432B", days };
    if (days <= 14) return { label: `due in ${days}d`, bg: "#FBF3DF", fg: "#B8860B", days };
    return { label: `due in ${days}d`, bg: "#E8F2EC", fg: "#2F6B4F", days };
  }

  function exportPDF() { window.print(); }

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const header = ["Name", "Department", "Serial Number", "Install Date", "Open Faults", "Next Due"];
    const aoa = [header, ...list.map((eq) => {
      const upcoming = events.filter((e) => e.equipment_id === eq.id && e.next_due_date).sort((a, b) => new Date(a.next_due_date) - new Date(b.next_due_date))[0];
      const faultCount = events.filter((e) => e.equipment_id === eq.id && e.event_type === "fault" && !e.resolved).length;
      return [eq.name, eq.department, eq.serial_number, eq.install_date || "", faultCount, upcoming?.next_due_date || ""];
    })];
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Equipment");
    XLSX.writeFile(wb, "equipment.xlsx");
  }

  return (
    <div>
      <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Equipment</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportPDF} style={{ background: "none", border: "1px solid #C7D1CE", color: "#516361", borderRadius: 7, padding: "8px 12px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><FileText size={14} /> Save as PDF</button>
          <button onClick={exportExcel} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "8px 12px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Download size={14} /> Export Excel</button>
          {canEdit && <button onClick={() => setShowAdd(true)} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Plus size={14} /> Add equipment</button>}
        </div>
      </div>
      <div className="no-print" style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>Maintenance, calibration, and fault history for every device. Attach manuals and PDFs from the Files page.</div>

      {showAdd && (
        <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 14, marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input placeholder="Equipment name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={{ ...inputStyle, flex: 2, minWidth: 140 }} />
            <select value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} style={{ ...inputStyle, flex: 1, minWidth: 120 }}>
              {(departments || []).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <input placeholder="Serial number" value={form.serial_number} onChange={(e) => setForm((f) => ({ ...f, serial_number: e.target.value }))} style={{ ...inputStyle, flex: 1, minWidth: 120 }} />
            <input type="date" value={form.install_date} onChange={(e) => setForm((f) => ({ ...f, install_date: e.target.value }))} style={{ ...inputStyle, width: 150 }} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={addEquipment} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 700 }}>Save</button>
            <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 7, padding: "8px 14px", fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}

      {list.length > 0 && (() => {
        const withDue = list.map((eq) => ({ eq, due: dueStatus(eq.id) })).filter((x) => x.due);
        withDue.sort((a, b) => a.due.days - b.due.days);
        if (withDue.length === 0) return null;
        return (
          <div className="no-print" style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#7B8E8A", marginBottom: 8 }}>MAINTENANCE DUE REMINDERS</div>
            <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, overflow: "hidden" }}>
              {withDue.map(({ eq, due }) => (
                <button key={eq.id} onClick={() => setSelected(eq.id)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "none", border: "none", borderBottom: "1px solid #EEF2F0", textAlign: "left" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{eq.name}</div>
                    <div style={{ fontSize: 11, color: "#8A9694" }}>{eq.department}</div>
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: due.fg, background: due.bg, padding: "4px 9px", borderRadius: 5 }}>{due.label}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {list.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#8A9694" }}>No equipment added yet.</div>
      ) : (
        <div className="print-area" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {list.map((eq) => {
            const due = dueStatus(eq.id);
            const faultCount = events.filter((e) => e.equipment_id === eq.id && e.event_type === "fault" && !e.resolved).length;
            return (
              <div key={eq.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: "12px 16px" }}>
                <button onClick={() => setSelected(eq.id)} style={{ flex: 1, textAlign: "left", background: "none", border: "none", cursor: "pointer" }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{eq.name}</div>
                  <div style={{ fontSize: 11.5, color: "#8A9694" }}>{eq.department}{eq.serial_number ? ` · SN ${eq.serial_number}` : ""}</div>
                </button>
                {faultCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: "#C1432B", background: "#FBEAE6", padding: "3px 8px", borderRadius: 5 }}>{faultCount} open fault{faultCount > 1 ? "s" : ""}</span>}
                {due && <span style={{ fontSize: 11, fontWeight: 700, color: due.fg, background: due.bg, padding: "3px 8px", borderRadius: 5 }}>{due.label}</span>}
                {canEdit && <button onClick={() => removeEquipment(eq.id)} style={{ background: "none", border: "none", color: "#C1432B" }}><Trash2 size={15} /></button>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EquipmentDetail({ equipment, events, canEdit, username, onBack, reload, onNavigate }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ event_type: "maintenance", date: todayISO(), description: "", engineer_name: "", resolved: true, next_due_date: "", file_note: "" });

  async function addEvent() {
    if (!form.description) return;
    await supabase.from("equipment_events").insert({
      equipment_id: equipment.id, ...form, performed_by: username,
      next_due_date: form.next_due_date || null,
    });
    setForm({ event_type: "maintenance", date: todayISO(), description: "", engineer_name: "", resolved: true, next_due_date: "", file_note: "" });
    setShowAdd(false);
    reload();
  }
  async function toggleResolved(ev) {
    await supabase.from("equipment_events").update({ resolved: !ev.resolved }).eq("id", ev.id);
    reload();
  }
  async function deleteEvent(id) {
    if (!confirm("Remove this log entry?")) return;
    await supabase.from("equipment_events").update({ deleted: true }).eq("id", id);
    reload();
  }

  const sorted = [...events].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "#0F7173", fontSize: 13, fontWeight: 600, marginBottom: 14 }}>← Back to equipment</button>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>{equipment.name}</h2>
        {canEdit && <button onClick={() => setShowAdd(true)} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Plus size={14} /> Log event</button>}
      </div>
      <div style={{ fontSize: 12, color: "#8A9694", marginBottom: 14 }}>{equipment.department}{equipment.serial_number ? ` · SN ${equipment.serial_number}` : ""}{equipment.install_date ? ` · installed ${equipment.install_date}` : ""}</div>

      {canEdit && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#8A9694", width: "100%" }}>QUICK ACTIONS</div>
          <button onClick={() => { setForm((f) => ({ ...f, event_type: "maintenance" })); setShowAdd(true); }} style={{ background: "#F0F3F2", border: "none", borderRadius: 7, padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "#516361" }}>🔧 Log maintenance</button>
          <button onClick={() => { setForm((f) => ({ ...f, event_type: "calibration" })); setShowAdd(true); }} style={{ background: "#F0F3F2", border: "none", borderRadius: 7, padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "#516361" }}>✅ Log calibration</button>
          <button onClick={() => { setForm((f) => ({ ...f, event_type: "fault" })); setShowAdd(true); }} style={{ background: "#FBEAE6", border: "none", borderRadius: 7, padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "#C1432B" }}>⚠ Log fault</button>
          {onNavigate && <button onClick={() => onNavigate("incident")} style={{ background: "#FBEAE6", border: "none", borderRadius: 7, padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "#C1432B" }}>📋 Create incident</button>}
        </div>
      )}

      <EquipmentDocuments equipmentId={equipment.id} canEdit={canEdit} username={username} />
      <EquipmentPPMSchedule equipmentId={equipment.id} canEdit={canEdit} />
      <EquipmentComplianceRecords equipmentId={equipment.id} canEdit={canEdit} username={username} />

      {showAdd && (
        <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 14, marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <select value={form.event_type} onChange={(e) => setForm((f) => ({ ...f, event_type: e.target.value }))} style={{ ...inputStyle, width: 150 }}>
              <option value="maintenance">Maintenance</option>
              <option value="calibration">Calibration</option>
              <option value="fault">Fault</option>
            </select>
            <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} style={{ ...inputStyle, width: 150 }} />
            <input placeholder="Engineer name" value={form.engineer_name} onChange={(e) => setForm((f) => ({ ...f, engineer_name: e.target.value }))} style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
          </div>
          <textarea placeholder="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} style={{ ...inputStyle, minHeight: 60, marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            <label style={{ fontSize: 12.5, color: "#516361" }}>Next due <input type="date" value={form.next_due_date} onChange={(e) => setForm((f) => ({ ...f, next_due_date: e.target.value }))} style={{ ...inputStyle, width: 150, display: "inline-block", marginLeft: 6 }} /></label>
            <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={form.resolved} onChange={(e) => setForm((f) => ({ ...f, resolved: e.target.checked }))} /> Resolved</label>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={addEvent} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 700 }}>Save</button>
            <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 7, padding: "8px 14px", fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#8A9694" }}>No history logged yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {sorted.map((ev) => {
            const m = TYPE_META[ev.event_type];
            const Icon = m.icon;
            return (
              <div key={ev.id} style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: m.fg, background: m.bg, padding: "3px 8px", borderRadius: 5, display: "flex", alignItems: "center", gap: 4 }}><Icon size={11} /> {m.label}</span>
                  <span style={{ fontSize: 12, color: "#8A9694" }}>{ev.date}{ev.engineer_name ? ` · ${ev.engineer_name}` : ""}</span>
                  {ev.event_type === "fault" && (
                    <button onClick={() => toggleResolved(ev)} style={{ fontSize: 10.5, fontWeight: 700, color: ev.resolved ? "#2F6B4F" : "#C1432B", background: ev.resolved ? "#E8F2EC" : "#FBEAE6", border: "none", borderRadius: 5, padding: "2px 8px" }}>{ev.resolved ? "Resolved" : "Open"}</button>
                  )}
                  {canEdit && <button onClick={() => deleteEvent(ev.id)} style={{ background: "none", border: "none", color: "#C1432B", marginLeft: "auto" }}><Trash2 size={13} /></button>}
                </div>
                <div style={{ fontSize: 13 }}>{ev.description}</div>
                {ev.next_due_date && <div style={{ fontSize: 11, color: "#8A9694", marginTop: 4 }}>Next due: {ev.next_due_date}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Device documents — validation/verification reports, why-we-chose-this-device
// notes, manuals, or any other file tied to a specific piece of equipment.
function EquipmentPPMSchedule({ equipmentId, canEdit }) {
  const [items, setItems] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ task_name: "", frequency: "monthly", last_done: "", next_due: "", notes: "" });

  async function load() {
    const { data } = await supabase.from("equipment_ppm_schedule").select("*").eq("equipment_id", equipmentId).eq("deleted", false).order("next_due");
    setItems(data || []);
  }
  useEffect(() => { load(); }, [equipmentId]);

  async function addTask() {
    if (!form.task_name.trim()) return;
    await supabase.from("equipment_ppm_schedule").insert({ equipment_id: equipmentId, ...form, last_done: form.last_done || null, next_due: form.next_due || null });
    setForm({ task_name: "", frequency: "monthly", last_done: "", next_due: "", notes: "" });
    setShowAdd(false);
    load();
  }
  async function markDoneToday(item) {
    const today = todayISO();
    const days = { daily: 1, weekly: 7, monthly: 30, quarterly: 91, biannual: 182, annual: 365 }[item.frequency] || 30;
    const next = new Date(today); next.setDate(next.getDate() + days);
    await supabase.from("equipment_ppm_schedule").update({ last_done: today, next_due: next.toISOString().slice(0, 10) }).eq("id", item.id);
    load();
  }
  async function removeTask(id) {
    if (!confirm("Remove this PPM task?")) return;
    await supabase.from("equipment_ppm_schedule").update({ deleted: true }).eq("id", id);
    load();
  }

  const today = todayISO();

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#7B8E8A" }}>PPM SCHEDULE (Planned Preventive Maintenance)</div>
        {canEdit && <button onClick={() => setShowAdd(true)} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 6, padding: "5px 10px", fontSize: 11.5, fontWeight: 600, color: "#516361" }}>+ Add task</button>}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "#8A9694", marginBottom: 10 }}>No PPM tasks scheduled yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {items.map((it) => {
            const overdue = it.next_due && it.next_due < today;
            return (
              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, background: overdue ? "#FBEAE6" : "#fff", border: "1px solid " + (overdue ? "#C1432B33" : "#E1E8E5"), borderRadius: 8, padding: "9px 12px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{it.task_name} <span style={{ fontSize: 10.5, color: "#8A9694", fontWeight: 400 }}>({it.frequency})</span></div>
                  <div style={{ fontSize: 11, color: overdue ? "#C1432B" : "#8A9694" }}>
                    {it.last_done ? `Last: ${it.last_done}` : "Never done"} {it.next_due ? `· Next due: ${it.next_due}${overdue ? " (OVERDUE)" : ""}` : ""}
                  </div>
                </div>
                {canEdit && <button onClick={() => markDoneToday(it)} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 600 }}>Done today</button>}
                {canEdit && <button onClick={() => removeTask(it.id)} style={{ background: "none", border: "none", color: "#C1432B" }}><Trash2 size={13} /></button>}
              </div>
            );
          })}
        </div>
      )}
      {showAdd && (
        <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <input placeholder="Task name (e.g. Filter cleaning)" value={form.task_name} onChange={(e) => setForm((f) => ({ ...f, task_name: e.target.value }))} style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
            <select value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))} style={{ ...inputStyle, width: 130 }}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="biannual">Every 6 months</option>
              <option value="annual">Annual</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <label style={{ fontSize: 12, color: "#516361" }}>Last done <input type="date" value={form.last_done} onChange={(e) => setForm((f) => ({ ...f, last_done: e.target.value }))} style={{ ...inputStyle, width: 150, display: "inline-block", marginLeft: 6 }} /></label>
            <label style={{ fontSize: 12, color: "#516361" }}>Next due <input type="date" value={form.next_due} onChange={(e) => setForm((f) => ({ ...f, next_due: e.target.value }))} style={{ ...inputStyle, width: 150, display: "inline-block", marginLeft: 6 }} /></label>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={addTask} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 700 }}>Save</button>
            <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 7, padding: "8px 14px", fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function EquipmentComplianceRecords({ equipmentId, canEdit, username }) {
  const [items, setItems] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ record_type: "Acceptance", date: todayISO(), performed_by: "", result: "pass", findings: "", attachment_path: "" });

  async function load() {
    const { data } = await supabase.from("equipment_compliance_records").select("*").eq("equipment_id", equipmentId).eq("deleted", false).order("date", { ascending: false });
    setItems(data || []);
  }
  useEffect(() => { load(); }, [equipmentId]);

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const extMatch = /\.[a-zA-Z0-9]{1,8}$/.exec(file.name || "");
    const path = `equipment-compliance/${equipmentId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extMatch ? extMatch[0] : ""}`;
    const { error } = await supabase.storage.from("attachments").upload(path, file);
    if (!error) setForm((f) => ({ ...f, attachment_path: path }));
    setUploading(false);
  }

  async function addRecord() {
    await supabase.from("equipment_compliance_records").insert({ equipment_id: equipmentId, ...form, performed_by: form.performed_by || username });
    setForm({ record_type: "Acceptance", date: todayISO(), performed_by: "", result: "pass", findings: "", attachment_path: "" });
    setShowAdd(false);
    load();
  }
  async function removeRecord(id) {
    if (!confirm("Remove this record?")) return;
    await supabase.from("equipment_compliance_records").update({ deleted: true }).eq("id", id);
    load();
  }
  function fileUrl(path) {
    return supabase.storage.from("attachments").getPublicUrl(path).data.publicUrl;
  }

  const RESULT_COLOR = { pass: "#2F6B4F", fail: "#C1432B", pending: "#B8860B" };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#7B8E8A" }}>ACCEPTANCE / VALIDATION / VERIFICATION</div>
        {canEdit && <button onClick={() => setShowAdd(true)} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 6, padding: "5px 10px", fontSize: 11.5, fontWeight: 600, color: "#516361" }}>+ Add record</button>}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "#8A9694", marginBottom: 10 }}>No records yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {items.map((r) => (
            <div key={r.id} style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 8, padding: "9px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "#fff", background: RESULT_COLOR[r.result], borderRadius: 4, padding: "2px 7px" }}>{r.result?.toUpperCase()}</span>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{r.record_type}</div>
                <div style={{ fontSize: 11, color: "#8A9694" }}>{r.date} · {r.performed_by}</div>
                {canEdit && <button onClick={() => removeRecord(r.id)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#C1432B" }}><Trash2 size={13} /></button>}
              </div>
              {r.findings && <div style={{ fontSize: 12, color: "#516361", marginTop: 4 }}>{r.findings}</div>}
              {r.attachment_path && <a href={fileUrl(r.attachment_path)} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: "#0F7173", fontWeight: 600 }}>📎 View attachment</a>}
            </div>
          ))}
        </div>
      )}
      {showAdd && (
        <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <select value={form.record_type} onChange={(e) => setForm((f) => ({ ...f, record_type: e.target.value }))} style={{ ...inputStyle, width: 140 }}>
              <option value="Acceptance">Acceptance</option>
              <option value="Validation">Validation</option>
              <option value="Verification">Verification</option>
            </select>
            <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} style={{ ...inputStyle, width: 140 }} />
            <select value={form.result} onChange={(e) => setForm((f) => ({ ...f, result: e.target.value }))} style={{ ...inputStyle, width: 120 }}>
              <option value="pass">Pass</option>
              <option value="fail">Fail</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <input placeholder="Performed by (defaults to you)" value={form.performed_by} onChange={(e) => setForm((f) => ({ ...f, performed_by: e.target.value }))} style={{ ...inputStyle, marginBottom: 8 }} />
          <textarea placeholder="Findings / notes" value={form.findings} onChange={(e) => setForm((f) => ({ ...f, findings: e.target.value }))} style={{ ...inputStyle, minHeight: 60, marginBottom: 8 }} />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#F0F3F2", border: "1px dashed #C7D1CE", borderRadius: 7, padding: "8px 12px", fontSize: 12.5, cursor: "pointer", marginBottom: 10 }}>
            {uploading ? "Uploading…" : form.attachment_path ? "✅ File attached" : "Attach a file (optional)"}
            <input type="file" onChange={handleUpload} disabled={uploading} style={{ display: "none" }} />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={addRecord} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 700 }}>Save</button>
            <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 7, padding: "8px 14px", fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function EquipmentDocuments({ equipmentId, canEdit, username }) {
  const [files, setFiles] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState("");

  async function load() {
    const { data } = await supabase.from("equipment_files").select("*").eq("equipment_id", equipmentId).order("uploaded_at", { ascending: false });
    setFiles(data || []);
  }
  useEffect(() => { load(); }, [equipmentId]);

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const extMatch = /\.[a-zA-Z0-9]{1,8}$/.exec(file.name || "");
    const ext = extMatch ? extMatch[0] : "";
    const path = `equipment/${equipmentId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
    const { error: upErr } = await supabase.storage.from("attachments").upload(path, file);
    if (!upErr) {
      await supabase.from("equipment_files").insert({ equipment_id: equipmentId, filename: file.name, storage_path: path, description, uploaded_by: username });
      setDescription("");
    }
    setUploading(false);
    e.target.value = "";
    load();
  }

  async function removeFile(f) {
    if (!confirm(`Remove "${f.filename}"?`)) return;
    await supabase.storage.from("attachments").remove([f.storage_path]);
    await supabase.from("equipment_files").delete().eq("id", f.id);
    load();
  }

  function urlFor(f) {
    return supabase.storage.from("attachments").getPublicUrl(f.storage_path).data.publicUrl;
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 14, marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Documents (validation, verification, why this device was chosen, manuals…)</div>

      {canEdit && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <input placeholder="Optional note (e.g. 'Verification report 2026')" value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#0F7173", color: "#fff", borderRadius: 7, padding: "9px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
            <Upload size={13} /> {uploading ? "Uploading…" : "Upload file"}
            <input type="file" onChange={handleUpload} disabled={uploading} style={{ display: "none" }} />
          </label>
        </div>
      )}

      {files === null ? (
        <div style={{ fontSize: 12.5, color: "#8A9694" }}>Loading…</div>
      ) : files.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "#8A9694" }}>No documents uploaded yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {files.map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#F8FAF9", borderRadius: 7, padding: "8px 12px" }}>
              <FileText size={14} color="#8A9694" />
              <a href={urlFor(f)} target="_blank" rel="noreferrer" style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: "#0F7173", textDecoration: "none" }}>{f.filename}</a>
              {f.description && <span style={{ fontSize: 11, color: "#8A9694" }}>{f.description}</span>}
              {canEdit && <button onClick={() => removeFile(f)} style={{ background: "none", border: "none", color: "#C1432B" }}><Trash2 size={13} /></button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
