import React, { useState, useEffect } from "react";
import { Plus, Trash2, Check, X, Pencil } from "lucide-react";
import { supabase } from "./supabaseClient";

const inputStyle = { width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 14, boxSizing: "border-box" };
const labelStyle = { fontSize: 12.5, fontWeight: 600, color: "#516361" };

const STATUS_META = {
  normal: { bg: "#E8F2EC", fg: "#2F6B4F", label: "Normal" },
  warning: { bg: "#FBF3DF", fg: "#B8860B", label: "Warning" },
  critical: { bg: "#FBEAE6", fg: "#C1432B", label: "Critical" },
};
const REVIEW_META = {
  pending: { bg: "#FBF3DF", fg: "#B8860B", label: "Pending" },
  approved: { bg: "#E8F2EC", fg: "#2F6B4F", label: "Approved" },
  declined: { bg: "#FBEAE6", fg: "#C1432B", label: "Declined" },
};

export default function CustomTables({ departments, role, username }) {
  const [tables, setTables] = useState(null);
  const [rows, setRows] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  async function loadAll() {
    const { data: t } = await supabase.from("custom_tables").select("*").eq("deleted", false).order("title");
    const { data: r } = await supabase.from("custom_rows").select("*").eq("deleted", false).order("created_at", { ascending: false });
    setTables(t || []);
    setRows(r || []);
  }

  useEffect(() => { loadAll(); }, []);

  if (tables === null || rows === null) return <div style={{ padding: 40, textAlign: "center", color: "#8A9694" }}>Loading…</div>;

  if (selected) {
    const table = tables.find((t) => t.id === selected);
    if (!table) { setSelected(null); return null; }
    return <TableView table={table} rows={rows.filter((r) => r.table_id === table.id)} role={role} username={username} onBack={() => setSelected(null)} reload={loadAll} />;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Custom tables</h2>
        {(role === "admin" || role === "super") && (
          <button onClick={() => setShowCreate(true)} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Plus size={14} /> New table</button>
        )}
      </div>
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>Design any table you need — critical values, sample rejection, schedules, whatever. Not tied to any fixed structure.</div>

      {tables.length === 0 && <div style={{ textAlign: "center", padding: "60px 20px", color: "#8A9694" }}>No custom tables yet.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tables.map((t) => (
          <button key={t.id} onClick={() => setSelected(t.id)} style={{ textAlign: "left", background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{t.title}</div>
              <div style={{ fontSize: 12, color: "#8A9694", marginTop: 2 }}>{t.department} · {(t.columns || []).join(", ")}</div>
            </div>
            <div style={{ fontSize: 12, color: "#7B8E8A" }}>{rows.filter((r) => r.table_id === t.id).length} rows</div>
          </button>
        ))}
      </div>

      {showCreate && <CreateTableModal departments={departments} onClose={() => setShowCreate(false)} onCreated={loadAll} />}
    </div>
  );
}

function CreateTableModal({ departments, onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState(departments[0] || "");
  const [columns, setColumns] = useState(["", ""]);

  function updateCol(i, val) {
    setColumns((c) => c.map((x, idx) => (idx === i ? val : x)));
  }
  function addCol() { setColumns((c) => [...c, ""]); }
  function removeCol(i) { setColumns((c) => c.filter((_, idx) => idx !== i)); }

  async function save() {
    const cleanCols = columns.map((c) => c.trim()).filter(Boolean);
    if (!title || cleanCols.length === 0) return;
    await supabase.from("custom_tables").insert({ title, department, columns: cleanCols });
    onCreated();
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,25,26,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 440, maxHeight: "88vh", overflowY: "auto", padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>New custom table</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#8A9694" }}><X size={18} /></button>
        </div>
        <label style={labelStyle}>Title<input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Critical Values Log" /></label>
        <label style={{ ...labelStyle, display: "block", marginTop: 12 }}>Department
          <select style={inputStyle} value={department} onChange={(e) => setDepartment(e.target.value)}>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "#7B8E8A", marginTop: 14, marginBottom: 6 }}>COLUMNS (add as many as you want)</div>
        {columns.map((c, i) => (
          <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input style={{ ...inputStyle, flex: 1 }} value={c} onChange={(e) => updateCol(i, e.target.value)} placeholder={`Column ${i + 1} name`} />
            {columns.length > 1 && <button onClick={() => removeCol(i)} style={{ background: "none", border: "none", color: "#C1432B" }}><Trash2 size={15} /></button>}
          </div>
        ))}
        <button onClick={addCol} style={{ background: "none", border: "1px dashed #C7D1CE", color: "#0F7173", borderRadius: 7, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, marginTop: 4 }}>+ Add column</button>
        <button onClick={save} style={{ marginTop: 18, width: "100%", background: "#0F7173", color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, fontSize: 14 }}>Create table</button>
      </div>
    </div>
  );
}

function TableView({ table, rows, role, username, onBack, reload }) {
  const [showAdd, setShowAdd] = useState(false);
  const canModerate = role === "admin" || role === "super";

  async function reviewRow(row, decision, note) {
    await supabase.from("custom_rows").update({ review_status: decision, review_note: note || "", reviewed_by: username, reviewed_at: new Date().toISOString() }).eq("id", row.id);
    reload();
  }
  async function deleteRow(row) {
    if (!canModerate) return;
    if (!confirm("Remove this row?")) return;
    await supabase.from("custom_rows").update({ deleted: true, deleted_by: username, deleted_at: new Date().toISOString() }).eq("id", row.id);
    reload();
  }

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "#0F7173", fontSize: 13, fontWeight: 600, marginBottom: 14 }}>← Back to tables</button>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>{table.title}</h2>
        <button onClick={() => setShowAdd(true)} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Plus size={14} /> Add row</button>
      </div>

      <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: "#F0F3F2" }}>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>Status</th>
              {table.columns.map((c) => <th key={c} style={{ padding: "8px 10px", textAlign: "left" }}>{c}</th>)}
              <th style={{ padding: "8px 10px", textAlign: "left" }}>Date</th>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>By</th>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>Review</th>
              {canModerate && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={table.columns.length + 4} style={{ padding: 20, textAlign: "center", color: "#8A9694" }}>No rows yet.</td></tr>}
            {rows.map((r) => {
              const sm = STATUS_META[r.status] || STATUS_META.normal;
              const rm = REVIEW_META[r.review_status] || REVIEW_META.pending;
              return (
                <tr key={r.id} style={{ borderTop: "1px solid #EEF2F0" }}>
                  <td style={{ padding: "8px 10px" }}><span style={{ background: sm.bg, color: sm.fg, padding: "3px 8px", borderRadius: 5, fontWeight: 700, fontSize: 11 }}>{sm.label}</span></td>
                  {table.columns.map((c) => <td key={c} style={{ padding: "8px 10px" }}>{r.data?.[c] ?? ""}</td>)}
                  <td style={{ padding: "8px 10px", color: "#8A9694" }}>{r.date}</td>
                  <td style={{ padding: "8px 10px", color: "#8A9694" }}>{r.entered_by}</td>
                  <td style={{ padding: "8px 10px" }}>
                    {canModerate && r.review_status === "pending" ? (
                      <InlineReview onApprove={(note) => reviewRow(r, "approved", note)} onDecline={(note) => reviewRow(r, "declined", note)} needsNote={r.status !== "normal"} />
                    ) : (
                      <span style={{ background: rm.bg, color: rm.fg, padding: "3px 8px", borderRadius: 5, fontWeight: 700, fontSize: 11 }}>{rm.label}</span>
                    )}
                  </td>
                  {canModerate && <td style={{ padding: "8px 10px" }}><button onClick={() => deleteRow(r)} style={{ background: "none", border: "none", color: "#C1432B" }}><Trash2 size={13} /></button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showAdd && <AddRowModal table={table} username={username} onClose={() => setShowAdd(false)} onAdded={reload} />}
    </div>
  );
}

function InlineReview({ onApprove, onDecline, needsNote }) {
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  if (!showNote) {
    return (
      <div style={{ display: "flex", gap: 4 }}>
        <button onClick={() => (needsNote ? setShowNote(true) : onApprove(""))} style={{ background: "#2F6B4F", color: "#fff", border: "none", borderRadius: 5, padding: "4px 8px" }}><Check size={12} /></button>
        <button onClick={() => setShowNote(true)} style={{ background: "#C1432B", color: "#fff", border: "none", borderRadius: 5, padding: "4px 8px" }}><X size={12} /></button>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" style={{ ...inputStyle, width: 100, padding: "4px 6px", fontSize: 11 }} />
      <button onClick={() => note.trim() && onApprove(note)} style={{ background: "#2F6B4F", color: "#fff", border: "none", borderRadius: 5, padding: "4px 8px" }}><Check size={12} /></button>
      <button onClick={() => note.trim() && onDecline(note)} style={{ background: "#C1432B", color: "#fff", border: "none", borderRadius: 5, padding: "4px 8px" }}><X size={12} /></button>
    </div>
  );
}

function AddRowModal({ table, username, onClose, onAdded }) {
  const [data, setData] = useState({});
  const [status, setStatus] = useState("normal");
  const [note, setNote] = useState("");

  async function save() {
    await supabase.from("custom_rows").insert({ table_id: table.id, data, status, note, entered_by: username });
    onAdded();
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,25,26,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 420, maxHeight: "88vh", overflowY: "auto", padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>Add row — {table.title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#8A9694" }}><X size={18} /></button>
        </div>
        {table.columns.map((c) => (
          <label key={c} style={{ ...labelStyle, display: "block", marginBottom: 10 }}>{c}
            <input style={inputStyle} value={data[c] || ""} onChange={(e) => setData((d) => ({ ...d, [c]: e.target.value }))} />
          </label>
        ))}
        <label style={{ ...labelStyle, display: "block", marginBottom: 10 }}>Status
          <select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="normal">Normal</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <label style={labelStyle}>Note (optional)<input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <button onClick={save} style={{ marginTop: 16, width: "100%", background: "#0F7173", color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, fontSize: 14 }}>Save row</button>
      </div>
    </div>
  );
}
