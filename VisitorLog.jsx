import React, { useState, useEffect } from "react";
import { UserPlus, LogOut as CheckOutIcon, Trash2 } from "lucide-react";
import { supabase } from "./supabaseClient";

const inputStyle = { width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 14, boxSizing: "border-box" };

const TYPE_META = {
  engineer: { label: "Engineer", color: "#3E6ACF" },
  sales_rep: { label: "Sales Rep", color: "#2F6B4F" },
  inspector: { label: "Inspector", color: "#C1432B" },
  other: { label: "Other", color: "#8A9694" },
};

export default function VisitorLog({ role, username }) {
  const canEdit = role === "admin" || role === "super";
  const [visitors, setVisitors] = useState(null);
  const [equipment, setEquipment] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(blank());

  function blank() {
    return { visitor_name: "", company: "", visitor_type: "engineer", purpose: "", equipment_id: "", hosted_by: username, notes: "" };
  }

  async function load() {
    const { data: v } = await supabase.from("visitor_log").select("*").eq("deleted", false).order("time_in", { ascending: false }).limit(100);
    const { data: eq } = await supabase.from("equipment").select("id, name").eq("deleted", false);
    setVisitors(v || []);
    setEquipment(eq || []);
  }
  useEffect(() => { load(); }, []);

  async function checkIn() {
    if (!form.visitor_name.trim()) return;
    await supabase.from("visitor_log").insert({ ...form, equipment_id: form.equipment_id || null, hosted_by: form.hosted_by || username });
    setForm(blank());
    setShowAdd(false);
    load();
  }
  async function checkOut(id) {
    await supabase.from("visitor_log").update({ time_out: new Date().toISOString() }).eq("id", id);
    load();
  }
  async function removeEntry(id) {
    if (!confirm("Remove this visitor log entry?")) return;
    await supabase.from("visitor_log").update({ deleted: true }).eq("id", id);
    load();
  }

  if (visitors === null) return <div style={{ padding: 40, textAlign: "center", color: "#8A9694" }}>Loading…</div>;

  const currentlyIn = visitors.filter((v) => !v.time_out);
  const history = visitors.filter((v) => v.time_out);

  return (
    <div>
      <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Visitor Log</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => window.print()} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "#516361" }}>🖨️ Print</button>
          <button onClick={() => setShowAdd(true)} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><UserPlus size={14} /> Check in visitor</button>
        </div>
      </div>
      <div className="no-print" style={{ fontSize: 12.5, color: "#7B8E8A", marginBottom: 18 }}>Engineers, sales reps, and inspectors — who's in the lab and why.</div>

      {currentlyIn.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#7B8E8A", marginBottom: 8 }}>CURRENTLY IN THE LAB</div>
          <div className="print-area" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {currentlyIn.map((v) => {
              const meta = TYPE_META[v.visitor_type] || TYPE_META.other;
              const eq = equipment.find((e) => e.id === v.equipment_id);
              return (
                <div key={v.id} style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 9, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "#fff", background: meta.color, borderRadius: 4, padding: "2px 8px" }}>{meta.label}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{v.visitor_name} {v.company ? `· ${v.company}` : ""}</div>
                    <div style={{ fontSize: 11, color: "#8A9694" }}>
                      {v.purpose}{eq ? ` · ${eq.name}` : ""} · in {new Date(v.time_in).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} · hosted by {v.hosted_by}
                    </div>
                  </div>
                  {canEdit && <button onClick={() => checkOut(v.id)} style={{ background: "#F0F3F2", border: "none", borderRadius: 6, padding: "6px 10px", fontSize: 11.5, fontWeight: 600, color: "#516361", display: "flex", alignItems: "center", gap: 4 }}><CheckOutIcon size={12} /> Check out</button>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#7B8E8A", marginBottom: 8 }}>HISTORY</div>
        {history.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "#8A9694" }}>No past visits logged yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {history.map((v) => {
              const meta = TYPE_META[v.visitor_type] || TYPE_META.other;
              const eq = equipment.find((e) => e.id === v.equipment_id);
              return (
                <div key={v.id} style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 9, padding: "9px 14px", display: "flex", alignItems: "center", gap: 10, opacity: 0.85 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: meta.color, background: meta.color + "22", borderRadius: 4, padding: "2px 8px" }}>{meta.label}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{v.visitor_name} {v.company ? `· ${v.company}` : ""}</div>
                    <div style={{ fontSize: 11, color: "#8A9694" }}>
                      {v.purpose}{eq ? ` · ${eq.name}` : ""} · {new Date(v.time_in).toLocaleDateString()} {new Date(v.time_in).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}–{new Date(v.time_out).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  {canEdit && <button onClick={() => removeEntry(v.id)} style={{ background: "none", border: "none", color: "#C1432B" }}><Trash2 size={14} /></button>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,25,26,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60 }} onClick={() => setShowAdd(false)}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 400, padding: 20, maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Check in a visitor</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input placeholder="Visitor name" value={form.visitor_name} onChange={(e) => setForm((f) => ({ ...f, visitor_name: e.target.value }))} style={inputStyle} />
              <input placeholder="Company" value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} style={inputStyle} />
              <select value={form.visitor_type} onChange={(e) => setForm((f) => ({ ...f, visitor_type: e.target.value }))} style={inputStyle}>
                <option value="engineer">Engineer</option>
                <option value="sales_rep">Sales Rep</option>
                <option value="inspector">Inspector</option>
                <option value="other">Other</option>
              </select>
              <input placeholder="Purpose of visit" value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} style={inputStyle} />
              <select value={form.equipment_id} onChange={(e) => setForm((f) => ({ ...f, equipment_id: e.target.value }))} style={inputStyle}>
                <option value="">Related equipment (optional)</option>
                {equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <input placeholder="Hosted by" value={form.hosted_by} onChange={(e) => setForm((f) => ({ ...f, hosted_by: e.target.value }))} style={inputStyle} />
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button onClick={checkIn} style={{ flex: 1, background: "#0F7173", color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700 }}>Check in</button>
                <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 8, padding: "11px 16px" }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
