import React, { useState, useEffect } from "react";
import { Plus, Trash2, Download, Upload, FileText, X, ListPlus } from "lucide-react";
import { supabase } from "./supabaseClient";
import { playAlertSound } from "./sounds";

const inputStyle = { border: "1px solid #C7D1CE", borderRadius: 7, padding: "8px 10px", fontSize: 13, boxSizing: "border-box", width: "100%" };

function normalize(s) {
  return String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}
function slugify(label) {
  return normalize(label) || `field_${Date.now()}`;
}

async function readFileAsGrid(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (["xlsx", "xls", "csv"].includes(ext)) {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  }
  if (ext === "docx") {
    const mammoth = (await import("mammoth")).default || (await import("mammoth"));
    const buf = await file.arrayBuffer();
    const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buf });
    const grid = [];
    const tableMatch = html.match(/<table[\s\S]*?<\/table>/);
    if (tableMatch) {
      const rowMatches = tableMatch[0].match(/<tr[\s\S]*?<\/tr>/g) || [];
      rowMatches.forEach((rowHtml) => {
        const cellMatches = rowHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g) || [];
        grid.push(cellMatches.map((c) => c.replace(/<[^>]+>/g, "").trim()));
      });
    }
    return grid;
  }
  throw new Error("Unsupported file — use Excel (.xlsx/.xls/.csv) or Word (.docx).");
}

export default function RecordModule({ table, moduleKey, title, description, fields: coreFields, role, username }) {
  const [rows, setRows] = useState(null);
  const [customFields, setCustomFields] = useState([]);
  const [fieldOptions, setFieldOptions] = useState([]); // [{field_key, option_value, sort_order}]
  const [showAdd, setShowAdd] = useState(false);
  const [showFieldAdd, setShowFieldAdd] = useState(false);
  const [showListManager, setShowListManager] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldPosition, setNewFieldPosition] = useState("end");
  const [form, setForm] = useState({});
  const [importing, setImporting] = useState(false);
  const canEdit = role === "admin" || role === "super";

  // Core fields get spaced-out order numbers (0, 10, 20…) so custom fields
  // can slot in between them.
  const orderedCore = coreFields.map((f, i) => ({ ...f, order: i * 10 }));
  const orderedCustom = customFields.map((c) => ({ key: c.field_key, label: c.field_label, type: "text", isCustom: true, order: c.sort_order }));
  const fields = [...orderedCore, ...orderedCustom].sort((a, b) => a.order - b.order);

  function optionsFor(fieldKey) {
    return fieldOptions.filter((o) => o.field_key === fieldKey).sort((a, b) => a.sort_order - b.sort_order);
  }

  function blankForm() {
    return Object.fromEntries(fields.map((f) => [f.key, f.type === "date" ? new Date().toISOString().slice(0, 10) : ""]));
  }

  async function loadAll() {
    const { data } = await supabase.from(table).select("*").eq("deleted", false).order("date", { ascending: false });
    const { data: cf } = await supabase.from("module_custom_fields").select("*").eq("module_key", moduleKey).order("sort_order");
    const { data: fo } = await supabase.from("module_field_options").select("*").eq("module_key", moduleKey).order("sort_order");
    setRows(data || []);
    setCustomFields(cf || []);
    setFieldOptions(fo || []);
  }
  useEffect(() => { loadAll(); }, [table]);
  useEffect(() => { setForm(blankForm()); }, [customFields.length]);

  function valueOf(row, f) {
    return f.isCustom ? (row.extra_data?.[f.key] ?? "") : (row[f.key] ?? "");
  }

  async function addRow() {
    const record = {};
    const extra_data = {};
    coreFields.forEach((f) => { record[f.key] = form[f.key] ?? ""; });
    customFields.forEach((c) => { extra_data[c.field_key] = form[c.field_key] ?? ""; });
    if (moduleKey === "panic") playAlertSound();
    await supabase.from(table).insert({ ...record, extra_data });
    setForm(blankForm());
    setShowAdd(false);
    loadAll();
  }
  async function deleteRow(id) {
    if (!confirm("Remove this record?")) return;
    await supabase.from(table).update({ deleted: true }).eq("id", id);
    loadAll();
  }

  // Position picker resolves to a numeric sort_order between whichever two
  // fields it should sit between.
  function resolveOrder(position) {
    if (position === "start") return (fields[0]?.order ?? 0) - 10;
    if (position === "end") return (fields[fields.length - 1]?.order ?? 0) + 10;
    const afterIdx = fields.findIndex((f) => f.key === position);
    if (afterIdx === -1) return (fields[fields.length - 1]?.order ?? 0) + 10;
    const nextOrder = fields[afterIdx + 1]?.order ?? fields[afterIdx].order + 10;
    return (fields[afterIdx].order + nextOrder) / 2;
  }

  async function addCustomField() {
    const label = newFieldLabel.trim();
    if (!label) return;
    await supabase.from("module_custom_fields").insert({ module_key: moduleKey, field_key: slugify(label), field_label: label, sort_order: resolveOrder(newFieldPosition) });
    setNewFieldLabel("");
    setNewFieldPosition("end");
    setShowFieldAdd(false);
    loadAll();
  }
  async function removeCustomField(id) {
    if (!confirm("Remove this field? Existing data in it stays saved but hidden.")) return;
    await supabase.from("module_custom_fields").delete().eq("id", id);
    loadAll();
  }

  function exportPDF() { window.print(); }

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const header = fields.map((f) => f.label);
    const aoa = [header, ...rows.map((r) => fields.map((f) => valueOf(r, f)))];
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, title.slice(0, 31));
    XLSX.writeFile(wb, `${title.replace(/[^a-z0-9]/gi, "_")}.xlsx`);
  }

  async function importFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    try {
      const grid = await readFileAsGrid(file);
      if (!grid.length) { alert("No rows found in that file."); return; }
      const header = grid[0].map(normalize);
      const fieldIndexes = fields.map((f) => {
        const idx = header.findIndex((h) => h === normalize(f.label) || h === normalize(f.key));
        return { field: f, idx };
      });
      const looksMapped = fieldIndexes.some((f) => f.idx !== -1);
      const dataRows = looksMapped ? grid.slice(1) : grid;

      const newRows = dataRows.filter((r) => r.some((c) => String(c ?? "").trim() !== "")).map((r) => {
        const record = {};
        const extra_data = {};
        fields.forEach((f, i) => {
          const mapped = fieldIndexes.find((x) => x.field.key === f.key);
          const idx = looksMapped ? mapped.idx : i;
          const val = idx !== -1 && idx !== undefined ? String(r[idx] ?? "").trim() : "";
          if (f.isCustom) extra_data[f.key] = val;
          else record[f.key] = val;
        });
        return { ...record, extra_data };
      }).filter((rec) => Object.values(rec).some((v) => (typeof v === "object" ? Object.values(v).some((x) => x) : v)));

      if (newRows.length === 0) { alert("Couldn't match any rows to the expected columns."); return; }
      await supabase.from(table).insert(newRows);
      loadAll();
    } catch (err) {
      alert(err.message || "Could not read that file.");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  if (rows === null) return <div style={{ padding: 40, textAlign: "center", color: "#8A9694" }}>Loading…</div>;

  return (
    <div>
      <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>{title}</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canEdit && (
            <label style={{ background: "none", border: "1px solid #C7D1CE", color: "#516361", borderRadius: 7, padding: "8px 12px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <Upload size={14} /> {importing ? "Importing…" : "Import Excel/Word"}
              <input type="file" accept=".xlsx,.xls,.csv,.docx" onChange={importFile} disabled={importing} style={{ display: "none" }} />
            </label>
          )}
          <button onClick={exportPDF} style={{ background: "none", border: "1px solid #C7D1CE", color: "#516361", borderRadius: 7, padding: "8px 12px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><FileText size={14} /> Save as PDF</button>
          <button onClick={exportExcel} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "8px 12px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Download size={14} /> Export Excel</button>
          {canEdit && <button onClick={() => setShowListManager(true)} style={{ background: "none", border: "1px dashed #C7D1CE", color: "#0F7173", borderRadius: 7, padding: "8px 12px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><ListPlus size={14} /> Preset lists</button>}
          {canEdit && <button onClick={() => setShowFieldAdd(true)} style={{ background: "none", border: "1px dashed #C7D1CE", color: "#0F7173", borderRadius: 7, padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>+ Field</button>}
          {canEdit && <button onClick={() => setShowAdd(true)} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "8px 12px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Plus size={14} /> Add</button>}
        </div>
      </div>
      {description && <div className="no-print" style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>{description}</div>}

      {showFieldAdd && (
        <div className="no-print" style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 14, marginBottom: 20 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#7B8E8A", marginBottom: 8 }}>ADD A FIELD (e.g. "Patient Name")</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <input value={newFieldLabel} onChange={(e) => setNewFieldLabel(e.target.value)} placeholder="Field name" style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
            <select value={newFieldPosition} onChange={(e) => setNewFieldPosition(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
              <option value="start">Place at the start</option>
              <option value="end">Place at the end</option>
              {fields.map((f) => <option key={f.key} value={f.key}>After "{f.label}"</option>)}
            </select>
            <button onClick={addCustomField} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>Add field</button>
            <button onClick={() => setShowFieldAdd(false)} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 7, padding: "8px 14px", fontSize: 13, whiteSpace: "nowrap" }}>Close</button>
          </div>
          {customFields.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {customFields.map((c) => (
                <span key={c.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, background: "#F0F3F2", padding: "4px 9px", borderRadius: 6 }}>
                  {c.field_label}
                  <button onClick={() => removeCustomField(c.id)} style={{ background: "none", border: "none", color: "#C1432B", display: "flex" }}><X size={11} /></button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {showListManager && <ListManager moduleKey={moduleKey} fields={fields} fieldOptions={fieldOptions} onClose={() => setShowListManager(false)} reload={loadAll} />}

      {showAdd && (
        <div className="no-print" style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 14, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8, marginBottom: 10 }}>
            {fields.map((f) => {
              const presetOptions = optionsFor(f.key);
              return (
                <label key={f.key} style={{ fontSize: 11.5, fontWeight: 600, color: "#516361" }}>
                  {f.label}
                  {f.type === "select" || presetOptions.length > 0 ? (
                    <select style={inputStyle} value={form[f.key] || ""} onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))}>
                      <option value=""></option>
                      {(f.type === "select" ? f.options.map((o) => ({ option_value: o })) : presetOptions).map((o) => <option key={o.option_value} value={o.option_value}>{o.option_value}</option>)}
                    </select>
                  ) : (
                    <input type={f.type === "date" ? "date" : "text"} style={inputStyle} value={form[f.key] || ""} onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))} />
                  )}
                </label>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={addRow} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 700 }}>Save</button>
            <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 7, padding: "8px 14px", fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#8A9694" }}>No records yet.</div>
      ) : (
        <div className="print-area" style={{ overflowX: "auto", background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#F0F3F2" }}>
                {fields.map((f) => <th key={f.key} style={{ padding: "7px 10px", textAlign: "left", borderRight: "1px solid #E1E8E5" }}>{f.label}</th>)}
                {canEdit && <th className="no-print"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #EEF2F0" }}>
                  {fields.map((f) => <td key={f.key} style={{ padding: "6px 10px", borderRight: "1px solid #EEF2F0" }}>{valueOf(r, f)}</td>)}
                  {canEdit && <td className="no-print" style={{ padding: "6px 10px" }}><button onClick={() => deleteRow(r.id)} style={{ background: "none", border: "none", color: "#C1432B" }}><Trash2 size={13} /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ListManager({ moduleKey, fields, fieldOptions, onClose, reload }) {
  const [fieldKey, setFieldKey] = useState(fields[0]?.key || "");
  const [newValue, setNewValue] = useState("");

  const options = fieldOptions.filter((o) => o.field_key === fieldKey).sort((a, b) => a.sort_order - b.sort_order);

  async function addOption() {
    const val = newValue.trim();
    if (!val) return;
    const maxOrder = options.length ? Math.max(...options.map((o) => o.sort_order)) : 0;
    await supabase.from("module_field_options").insert({ module_key: moduleKey, field_key: fieldKey, option_value: val, sort_order: maxOrder + 1 });
    setNewValue("");
    reload();
  }
  async function removeOption(id) {
    await supabase.from("module_field_options").delete().eq("id", id);
    reload();
  }

  return (
    <div className="no-print" style={{ position: "fixed", inset: 0, background: "rgba(15,25,26,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 420, maxHeight: "85vh", overflowY: "auto", padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Preset lists</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#8A9694" }}><X size={18} /></button>
        </div>
        <div style={{ fontSize: 12, color: "#8A9694", marginBottom: 12 }}>Pick a field. If it has any values here, that field becomes a dropdown instead of free text.</div>
        <select value={fieldKey} onChange={(e) => setFieldKey(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }}>
          {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="e.g. Hemolyzed sample" style={{ ...inputStyle, flex: 1 }} onKeyDown={(e) => e.key === "Enter" && addOption()} />
          <button onClick={addOption} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 700 }}>Add</button>
        </div>

        {options.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "#8A9694" }}>No preset values yet — this field is still free text.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {options.map((o) => (
              <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#F7F9F8", borderRadius: 6, padding: "6px 10px" }}>
                <div style={{ flex: 1, fontSize: 13 }}>{o.option_value}</div>
                <button onClick={() => removeOption(o.id)} style={{ background: "none", border: "none", color: "#C1432B" }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
