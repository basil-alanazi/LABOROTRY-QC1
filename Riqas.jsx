import React, { useState, useEffect } from "react";
import { Plus, Trash2, Check, X, Award } from "lucide-react";
import { supabase } from "./supabaseClient";

const inputStyle = { width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 14, boxSizing: "border-box" };
const labelStyle = { fontSize: 12.5, fontWeight: 600, color: "#516361" };
const todayISO = () => new Date().toISOString().slice(0, 10);

const SCORE_META = {
  pending: { bg: "#F0F3F2", fg: "#516361", label: "Awaiting score" },
  satisfactory: { bg: "#E8F2EC", fg: "#2F6B4F", label: "Satisfactory" },
  unsatisfactory: { bg: "#FBEAE6", fg: "#C1432B", label: "Unsatisfactory" },
};

function deadlineStatus(cycle) {
  if (cycle.submitted) return null;
  if (!cycle.submission_deadline) return { label: "no deadline set", color: "#8A9694", bg: "#F0F3F2" };
  const days = Math.round((new Date(cycle.submission_deadline) - new Date(todayISO())) / 86400000);
  if (days < 0) return { label: `⚠ overdue by ${Math.abs(days)}d`, color: "#C1432B", bg: "#FBEAE6" };
  if (days <= 5) return { label: `due in ${days}d`, color: "#B8860B", bg: "#FBF3DF" };
  return { label: `due in ${days}d`, color: "#2F6B4F", bg: "#E8F2EC" };
}

export default function Riqas({ departments, role, username }) {
  const [programs, setPrograms] = useState(null);
  const [cycles, setCycles] = useState(null);
  const [showNewProgram, setShowNewProgram] = useState(false);

  async function loadAll() {
    const { data: p } = await supabase.from("riqas_programs").select("*").eq("deleted", false).order("name");
    const { data: c } = await supabase.from("riqas_cycles").select("*").eq("deleted", false).order("received_date", { ascending: false });
    setPrograms(p || []);
    setCycles(c || []);
  }
  useEffect(() => { loadAll(); }, []);

  async function addProgram(name, department) {
    if (!name) return;
    await supabase.from("riqas_programs").insert({ name, department });
    loadAll();
  }
  async function deleteProgram(id) {
    if (!confirm("Remove this RIQAS program? Its cycle history stays for audit purposes.")) return;
    await supabase.from("riqas_programs").update({ deleted: true }).eq("id", id);
    loadAll();
  }
  async function addCycle(programId, fields) {
    await supabase.from("riqas_cycles").insert({ program_id: programId, ...fields });
    loadAll();
  }
  async function markSubmitted(cycle) {
    await supabase.from("riqas_cycles").update({ submitted: true, submitted_date: todayISO(), submitted_by: username }).eq("id", cycle.id);
    loadAll();
  }
  async function saveScore(cycle, status, summary) {
    await supabase.from("riqas_cycles").update({ score_status: status, score_summary: summary }).eq("id", cycle.id);
    loadAll();
  }
  async function deleteCycle(id) {
    if (role !== "admin" && role !== "super") return;
    if (!confirm("Remove this cycle?")) return;
    await supabase.from("riqas_cycles").update({ deleted: true }).eq("id", id);
    loadAll();
  }

  if (programs === null || cycles === null) return <div style={{ padding: 40, textAlign: "center", color: "#8A9694" }}>Loading…</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>RIQAS</h2>
        <button onClick={() => setShowNewProgram(true)} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Plus size={14} /> New program</button>
      </div>
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>External quality assessment cycles — receiving, submission deadlines, and scores back from Randox.</div>

      {programs.length === 0 && <div style={{ textAlign: "center", padding: "60px 20px", color: "#8A9694" }}>No RIQAS programs yet.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {programs.map((p) => (
          <ProgramCard
            key={p.id}
            program={p}
            cycles={cycles.filter((c) => c.program_id === p.id)}
            role={role}
            onAddCycle={addCycle}
            onMarkSubmitted={markSubmitted}
            onSaveScore={saveScore}
            onDeleteCycle={deleteCycle}
            onDeleteProgram={deleteProgram}
          />
        ))}
      </div>

      {showNewProgram && <NewProgramModal departments={departments} onClose={() => setShowNewProgram(false)} onCreate={addProgram} />}
    </div>
  );
}

function NewProgramModal({ departments, onClose, onCreate }) {
  const [name, setName] = useState("");
  const [department, setDepartment] = useState(departments[0] || "");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,25,26,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 400, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>New RIQAS program</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#8A9694" }}><X size={18} /></button>
        </div>
        <label style={labelStyle}>Program name<input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. RIQAS Clinical Chemistry" /></label>
        <label style={{ ...labelStyle, display: "block", marginTop: 12 }}>Department
          <select style={inputStyle} value={department} onChange={(e) => setDepartment(e.target.value)}>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <button onClick={() => { onCreate(name, department); onClose(); }} style={{ marginTop: 16, width: "100%", background: "#0F7173", color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, fontSize: 14 }}>Create</button>
      </div>
    </div>
  );
}

function ProgramCard({ program, cycles, role, onAddCycle, onMarkSubmitted, onSaveScore, onDeleteCycle, onDeleteProgram }) {
  const [showAdd, setShowAdd] = useState(false);
  const sorted = [...cycles].sort((a, b) => new Date(b.received_date) - new Date(a.received_date));

  return (
    <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{program.name}</div>
          <div style={{ fontSize: 11.5, color: "#8A9694" }}>{program.department}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowAdd(true)} style={{ background: "none", border: "1px dashed #C7D1CE", color: "#0F7173", borderRadius: 7, padding: "6px 12px", fontSize: 12.5, fontWeight: 600 }}>+ New cycle</button>
          {(role === "admin" || role === "super") && <button onClick={() => onDeleteProgram(program.id)} style={{ background: "none", border: "none", color: "#C1432B" }}><Trash2 size={15} /></button>}
        </div>
      </div>

      {showAdd && <NewCycleForm onCancel={() => setShowAdd(false)} onSave={(fields) => { onAddCycle(program.id, fields); setShowAdd(false); }} />}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sorted.length === 0 && <div style={{ fontSize: 13, color: "#8A9694" }}>No cycles logged yet.</div>}
        {sorted.map((c) => (
          <CycleRow key={c.id} cycle={c} role={role} onMarkSubmitted={onMarkSubmitted} onSaveScore={onSaveScore} onDelete={onDeleteCycle} />
        ))}
      </div>
    </div>
  );
}

function NewCycleForm({ onCancel, onSave }) {
  const [lot, setLot] = useState("");
  const [received, setReceived] = useState(todayISO());
  const [expiry, setExpiry] = useState("");
  const [deadline, setDeadline] = useState("");

  return (
    <div style={{ background: "#F7F9F8", borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <label style={{ ...labelStyle, flex: 1, minWidth: 120 }}>Sample lot<input style={inputStyle} value={lot} onChange={(e) => setLot(e.target.value)} /></label>
        <label style={{ ...labelStyle, flex: 1, minWidth: 120 }}>Received<input type="date" style={inputStyle} value={received} onChange={(e) => setReceived(e.target.value)} /></label>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <label style={{ ...labelStyle, flex: 1, minWidth: 120 }}>Sample expiry<input type="date" style={inputStyle} value={expiry} onChange={(e) => setExpiry(e.target.value)} /></label>
        <label style={{ ...labelStyle, flex: 1, minWidth: 120 }}>Submission deadline<input type="date" style={inputStyle} value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => onSave({ lot_number: lot, received_date: received, expiry_date: expiry || null, submission_deadline: deadline || null })} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", fontSize: 12.5, fontWeight: 700 }}>Save cycle</button>
        <button onClick={onCancel} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 6, padding: "7px 14px", fontSize: 12.5 }}>Cancel</button>
      </div>
    </div>
  );
}

function CycleRow({ cycle, role, onMarkSubmitted, onSaveScore, onDelete }) {
  const [editingScore, setEditingScore] = useState(false);
  const [status, setStatus] = useState(cycle.score_status);
  const [summary, setSummary] = useState(cycle.score_summary);
  const dStatus = deadlineStatus(cycle);
  const sMeta = SCORE_META[cycle.score_status] || SCORE_META.pending;

  return (
    <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 8, padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Lot {cycle.lot_number || "—"}</div>
        <div style={{ fontSize: 11.5, color: "#8A9694" }}>received {cycle.received_date}{cycle.expiry_date ? ` · expires ${cycle.expiry_date}` : ""}</div>
        {!cycle.submitted && dStatus && <span style={{ fontSize: 11, fontWeight: 700, color: dStatus.color, background: dStatus.bg, padding: "3px 8px", borderRadius: 5 }}>{dStatus.label}</span>}
        {cycle.submitted && <span style={{ fontSize: 11, fontWeight: 700, color: "#2F6B4F", background: "#E8F2EC", padding: "3px 8px", borderRadius: 5 }}>Submitted {cycle.submitted_date} by {cycle.submitted_by}</span>}
        <span style={{ fontSize: 11, fontWeight: 700, color: sMeta.fg, background: sMeta.bg, padding: "3px 8px", borderRadius: 5, display: "flex", alignItems: "center", gap: 4 }}><Award size={11} /> {sMeta.label}</span>
        {(role === "admin" || role === "super") && <button onClick={() => onDelete(cycle.id)} style={{ background: "none", border: "none", color: "#C1432B", marginLeft: "auto" }}><Trash2 size={14} /></button>}
      </div>

      {cycle.score_summary && !editingScore && <div style={{ fontSize: 12.5, color: "#516361", marginBottom: 8 }}>{cycle.score_summary}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {!cycle.submitted && <button onClick={() => onMarkSubmitted(cycle)} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}><Check size={12} /> Mark submitted</button>}
        {!editingScore ? (
          <button onClick={() => setEditingScore(true)} style={{ background: "none", border: "1px solid #C7D1CE", color: "#516361", borderRadius: 6, padding: "6px 12px", fontSize: 12 }}>Record score</button>
        ) : (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", width: "100%" }}>
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
              <option value="pending">Awaiting score</option>
              <option value="satisfactory">Satisfactory</option>
              <option value="unsatisfactory">Unsatisfactory</option>
            </select>
            <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Score summary (e.g. SDI, notes)" style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
            <button onClick={() => { onSaveScore(cycle, status, summary); setEditingScore(false); }} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 6, padding: "7px 12px", fontSize: 12, fontWeight: 700 }}>Save</button>
            <button onClick={() => setEditingScore(false)} style={{ background: "none", border: "none", color: "#8A9694" }}><X size={14} /></button>
          </div>
        )}
      </div>
    </div>
  );
}
