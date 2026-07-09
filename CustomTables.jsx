import React, { useState, useEffect } from "react";
import { Plus, Trash2, Check, X } from "lucide-react";
import { supabase } from "./supabaseClient";

const inputStyle = { width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 14, boxSizing: "border-box" };

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

export default function CustomTables({ role, username, openTableId, onReload }) {
  const [tables, setTables] = useState(null);
  const [rows, setRows] = useState(null);
  const [selected, setSelected] = useState(openTableId || null);
  const [showCreate, setShowCreate] = useState(false);

  async function loadAll() {
    const { data: t } = await supabase.from("custom_tables").select("*").eq("deleted", false).order("title");
    const { data: r } = await supabase.from("custom_rows").select("*").eq("deleted", false).order("created_at", { ascending: true });
    setTables(t || []);
    setRows(r || []);
    if (onReload) onReload();
  }

  useEffect(() => { loadAll(); }, []);

  if (tables === null || rows === null) return <div style={{ padding: 40, textAlign: "center", color: "#8A9694" }}>Loading…</div>;

  if (selected) {
    const table = tables.find((t) => t.id === selected);
    if (!table) { setSelected(null); return null; }
    return <TableView table={table} rows={rows.filter((r) => r.table_id === table.id)} role={role} username={username} onBack={openTableId ? null : () => setSelected(null)} reload={loadAll} />;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Tables</h2>
        {(role === "admin" || role === "super") && (
          <button onClick={() => setShowCreate(true)} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Plus size={14} /> New table</button>
        )}
      </div>
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>Any table you need — schedules, leave, critical values, whatever. Just pick how many rows and columns, like starting a table in Word.</div>

      {tables.length === 0 && <div style={{ textAlign: "center", padding: "60px 20px", color: "#8A9694" }}>No tables yet.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tables.map((t) => (
          <div key={t.id} style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <button onClick={() => setSelected(t.id)} style={{ textAlign: "left", background: "none", border: "none", flex: 1, cursor: "pointer" }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{t.title}</div>
                <div style={{ fontSize: 12, color: "#8A9694", marginTop: 2 }}>{(t.columns || []).length} columns · {rows.filter((r) => r.table_id === t.id).length} rows</div>
              </button>
              {(role === "admin" || role === "super") && (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "#516361", cursor: "pointer" }}>
                    <input type="checkbox" checked={!!t.pinned} onChange={async () => { await supabase.from("custom_tables").update({ pinned: !t.pinned }).eq("id", t.id); loadAll(); }} />
                    Pin to main menu
                  </label>
                  <button onClick={async () => { if (confirm(`Delete the whole "${t.title}" table? This removes all its rows too.`)) { await supabase.from("custom_tables").update({ deleted: true }).eq("id", t.id); loadAll(); } }} style={{ background: "none", border: "none", color: "#C1432B" }}><Trash2 size={15} /></button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {showCreate && <CreateTableModal onClose={() => setShowCreate(false)} onCreated={loadAll} />}
    </div>
  );
}

function CreateTableModal({ onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [numColumns, setNumColumns] = useState(3);
  const [numRows, setNumRows] = useState(5);

  async function save() {
    if (!title || numColumns < 1) return;
    const columns = Array.from({ length: numColumns }, (_, i) => `Column ${i + 1}`);
    const { data: newTable } = await supabase.from("custom_tables").insert({ title, department: "General", columns }).select().single();
    if (newTable && numRows > 0) {
      const blankRows = Array.from({ length: numRows }, () => ({ table_id: newTable.id, data: {}, status: "normal", entered_by: "—", review_status: "approved" }));
      await supabase.from("custom_rows").insert(blankRows);
    }
    onCreated();
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,25,26,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 380, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>New table</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#8A9694" }}><X size={18} /></button>
        </div>
        <label style={{ fontSize: 12.5, fontWeight: 600, color: "#516361" }}>Title
          <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Leave Schedule" autoFocus />
        </label>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: "#516361", flex: 1 }}>Columns
            <input type="number" min="1" style={inputStyle} value={numColumns} onChange={(e) => setNumColumns(Number(e.target.value))} />
          </label>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: "#516361", flex: 1 }}>Rows
            <input type="number" min="0" style={inputStyle} value={numRows} onChange={(e) => setNumRows(Number(e.target.value))} />
          </label>
        </div>
        <div style={{ fontSize: 11, color: "#8A9694", marginTop: 8 }}>You can rename column headers and add more rows anytime once it's created.</div>
        <button onClick={save} style={{ marginTop: 18, width: "100%", background: "#0F7173", color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, fontSize: 14 }}>Create table</button>
      </div>
    </div>
  );
}

function TableView({ table, rows, role, username, onBack, reload }) {
  const canModerate = role === "admin" || role === "super";
  const [columns, setColumns] = useState(table.columns || []);
  useEffect(() => { setColumns(table.columns || []); }, [table.id, table.columns]);

  async function renameColumn(idx, newName) {
    const next = columns.map((c, i) => (i === idx ? newName : c));
    setColumns(next);
    await supabase.from("custom_tables").update({ columns: next }).eq("id", table.id);
  }

  async function addColumn() {
    const next = [...columns, `Column ${columns.length + 1}`];
    setColumns(next);
    await supabase.from("custom_tables").update({ columns: next }).eq("id", table.id);
  }

  async function removeColumn(idx) {
    if (!confirm(`Remove column "${columns[idx]}"? Data in that column is lost.`)) return;
    const removedName = columns[idx];
    const next = columns.filter((_, i) => i !== idx);
    setColumns(next);
    await supabase.from("custom_tables").update({ columns: next }).eq("id", table.id);
    for (const r of rows) {
      if (r.data && removedName in r.data) {
        const d = { ...r.data };
        delete d[removedName];
        await supabase.from("custom_rows").update({ data: d }).eq("id", r.id);
      }
    }
    reload();
  }

  async function addRow() {
    await supabase.from("custom_rows").insert({ table_id: table.id, data: {}, status: "normal", entered_by: username, review_status: "approved" });
    reload();
  }

  async function updateCell(row, columnName, value) {
    await supabase.from("custom_rows").update({ data: { ...row.data, [columnName]: value }, entered_by: username }).eq("id", row.id);
    reload();
  }

  async function setStatus(row, status) {
    await supabase.from("custom_rows").update({ status }).eq("id", row.id);
    reload();
  }

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
      {onBack && <button onClick={onBack} style={{ background: "none", border: "none", color: "#0F7173", fontSize: 13, fontWeight: 600, marginBottom: 14 }}>← Back to tables</button>}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>{table.title}</h2>
        <button onClick={addRow} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Plus size={14} /> Add row</button>
      </div>

      <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: "#F0F3F2" }}>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>Status</th>
              {columns.map((c, idx) => (
                <th key={idx} style={{ padding: "6px 8px", textAlign: "left" }}>
                  {canModerate ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input value={c} onChange={(e) => renameColumn(idx, e.target.value)} style={{ ...inputStyle, padding: "4px 6px", fontSize: 12, fontWeight: 700, marginTop: 0, minWidth: 70 }} />
                      <button onClick={() => removeColumn(idx)} style={{ background: "none", border: "none", color: "#C1432B" }}><X size={12} /></button>
                    </div>
                  ) : c}
                </th>
              ))}
              {canModerate && (
                <th style={{ padding: "8px 10px" }}>
                  <button onClick={addColumn} style={{ background: "none", border: "1px dashed #C7D1CE", color: "#0F7173", borderRadius: 5, padding: "4px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>+ Column</button>
                </th>
              )}
              <th style={{ padding: "8px 10px", textAlign: "left" }}>By</th>
              <th style={{ padding: "8px 10px", textAlign: "left" }}>Review</th>
              {canModerate && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={columns.length + 4} style={{ padding: 20, textAlign: "center", color: "#8A9694" }}>No rows yet — click "Add row".</td></tr>}
            {rows.map((r) => {
              const rm = REVIEW_META[r.review_status] || REVIEW_META.pending;
              return (
                <tr key={r.id} style={{ borderTop: "1px solid #EEF2F0" }}>
                  <td style={{ padding: "6px 8px" }}>
                    <select value={r.status} onChange={(e) => setStatus(r, e.target.value)} style={{ ...inputStyle, padding: "4px 6px", fontSize: 11, fontWeight: 700, marginTop: 0, background: STATUS_META[r.status]?.bg, color: STATUS_META[r.status]?.fg, border: "none" }}>
                      <option value="normal">Normal</option>
                      <option value="warning">Warning</option>
                      <option value="critical">Critical</option>
                    </select>
                  </td>
                  {columns.map((c, idx) => (
                    <td key={idx} style={{ padding: "4px 6px" }}>
                      <EditableCell value={r.data?.[c] ?? ""} onSave={(v) => updateCell(r, c, v)} />
                    </td>
                  ))}
                  {canModerate && <td></td>}
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
    </div>
  );
}

function EditableCell({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  useEffect(() => { setVal(value); }, [value]);

  if (!editing) {
    return (
      <div onClick={() => setEditing(true)} style={{ padding: "5px 8px", minHeight: 28, cursor: "text", borderRadius: 4 }} title="Click to edit">
        {value || <span style={{ color: "#C7D1CE" }}>—</span>}
      </div>
    );
  }
  return (
    <input
      autoFocus
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => { setEditing(false); if (val !== value) onSave(val); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") { setVal(value); setEditing(false); } }}
      style={{ ...inputStyle, padding: "5px 8px", fontSize: 12.5, marginTop: 0 }}
    />
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
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" style={{ ...inputStyle, width: 100, padding: "4px 6px", fontSize: 11, marginTop: 0 }} />
      <button onClick={() => note.trim() && onApprove(note)} style={{ background: "#2F6B4F", color: "#fff", border: "none", borderRadius: 5, padding: "4px 8px" }}><Check size={12} /></button>
      <button onClick={() => note.trim() && onDecline(note)} style={{ background: "#C1432B", color: "#fff", border: "none", borderRadius: 5, padding: "4px 8px" }}><X size={12} /></button>
    </div>
  );
}
