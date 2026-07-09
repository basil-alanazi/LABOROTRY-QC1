import React, { useState } from "react";
import { Upload, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { parseStaffFile } from "./staffFileParser";

const inputStyle = { width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "7px 9px", fontSize: 12.5, boxSizing: "border-box" };

// Lets the user upload an Excel/Word file with a staff roster (name, job
// number, department), preview/edit the parsed rows, then hands the
// confirmed list back via onApply(rows) where rows = [{full_name, job_number, department}].
export default function StaffImport({ departments, onApply }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState(null);

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    setError("");
    setParsed(null);
    try {
      const { rows } = await parseStaffFile(file);
      if (!rows.length) {
        setError("لم أتمكن من التعرف على أي أسماء بالملف. تأكد أن فيه عمود اسم واضح.");
      } else {
        setParsed(rows.map((r) => ({ ...r, department: r.department || departments?.[0] || "" })));
      }
    } catch (err) {
      setError(err.message || "تعذرت قراءة الملف.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  function updateRow(i, key, value) {
    setParsed((rows) => rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }
  function removeRow(i) {
    setParsed((rows) => rows.filter((_, idx) => idx !== i));
  }

  function confirmApply() {
    onApply(parsed.filter((r) => r.full_name.trim()));
    setParsed(null);
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: "1px dashed #0F7173", color: "#0F7173", borderRadius: 7, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
        <Upload size={13} /> {busy ? "جاري القراءة…" : "رفع قائمة موظفين من ملف"}
        <input type="file" accept=".xlsx,.xls,.csv,.docx" onChange={handleFile} disabled={busy} style={{ display: "none" }} />
      </label>
      {error && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: "#C1432B", marginTop: 6 }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
        </div>
      )}

      {parsed && parsed.length > 0 && (
        <div style={{ background: "#FBF8F0", border: "1px solid #E8DCC0", borderRadius: 8, padding: 10, marginTop: 10 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "#8A6D2F", marginBottom: 8 }}>
            راجع القائمة قبل الإضافة ({parsed.length} موظف):
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
            {parsed.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 5, alignItems: "center", background: "#fff", borderRadius: 6, padding: 6 }}>
                <input value={r.full_name} onChange={(e) => updateRow(i, "full_name", e.target.value)} style={{ ...inputStyle, flex: 2 }} placeholder="الاسم" />
                <input value={r.job_number} onChange={(e) => updateRow(i, "job_number", e.target.value)} style={{ ...inputStyle, width: 90 }} placeholder="الرقم الوظيفي" />
                {departments && departments.length > 0 ? (
                  <select value={r.department} onChange={(e) => updateRow(i, "department", e.target.value)} style={{ ...inputStyle, width: 120 }}>
                    {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                ) : (
                  <input value={r.department} onChange={(e) => updateRow(i, "department", e.target.value)} style={{ ...inputStyle, width: 120 }} placeholder="القسم" />
                )}
                <button onClick={() => removeRow(i)} style={{ background: "none", border: "none", color: "#C1432B" }}><X size={14} /></button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={confirmApply} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
              <CheckCircle2 size={13} /> إضافة الكل ({parsed.length})
            </button>
            <button onClick={() => setParsed(null)} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 6, padding: "7px 14px", fontSize: 12 }}>إلغاء</button>
          </div>
        </div>
      )}
    </div>
  );
}
