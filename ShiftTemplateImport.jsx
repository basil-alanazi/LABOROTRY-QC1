import React, { useState } from "react";
import { Upload, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { parseShiftTemplateFile } from "./shiftTemplateFileParser";

const inputStyle = { border: "1px solid #C7D1CE", borderRadius: 6, padding: "5px 7px", fontSize: 12, boxSizing: "border-box" };

const DEFAULT_COLOR_CYCLE = ["#0F7173", "#2F8F5B", "#D8862B", "#3E6ACF", "#8A5A2B", "#7A4FA3", "#B8860B", "#4A90D9", "#B5473A", "#5A9BD9"];

// Lets the user upload an Excel/Word file defining shift codes + times,
// preview/edit before applying, then hands the confirmed list back via
// onApply(rows) where rows = [{code, name, start_time, end_time, color, night_shift, is_off}].
export default function ShiftTemplateImport({ existingCodes, onApply }) {
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
      const { rows } = await parseShiftTemplateFile(file);
      if (!rows.length) {
        setError("لم أتمكن من التعرف على أي شيفتات بالملف. تأكد أن فيه عمود لكود الشيفت وأوقات البداية والنهاية (أو نطاق زمني بخلية واحدة مثل 7:00AM-4:30PM).");
      } else {
        setParsed(rows.map((r, i) => ({ ...r, color: r.color || DEFAULT_COLOR_CYCLE[i % DEFAULT_COLOR_CYCLE.length], duplicate: existingCodes.includes(r.code) })));
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
    onApply(parsed.filter((r) => r.code.trim() && !r.duplicate));
    setParsed(null);
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: "1px dashed #0F7173", color: "#0F7173", borderRadius: 7, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
        <Upload size={13} /> {busy ? "جاري القراءة…" : "رفع الشيفتات من ملف Excel أو Word"}
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
            راجع الشيفتات قبل الإضافة ({parsed.length}). الشيفتات المكررة (كود موجود عندك أصلاً) ملوّنة محمر وبيتم تجاهلها تلقائياً:
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 340, overflowY: "auto" }}>
            {parsed.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 5, alignItems: "center", background: r.duplicate ? "#FBEAE6" : "#fff", borderRadius: 6, padding: 6 }}>
                <input value={r.code} onChange={(e) => updateRow(i, "code", e.target.value)} style={{ ...inputStyle, width: 55 }} placeholder="Code" />
                <input value={r.name} onChange={(e) => updateRow(i, "name", e.target.value)} style={{ ...inputStyle, width: 90 }} placeholder="Name" />
                <input type="time" value={r.start_time} onChange={(e) => updateRow(i, "start_time", e.target.value)} disabled={r.is_off} style={{ ...inputStyle, width: 90 }} />
                <input type="time" value={r.end_time} onChange={(e) => updateRow(i, "end_time", e.target.value)} disabled={r.is_off} style={{ ...inputStyle, width: 90 }} />
                <input type="color" value={r.color} onChange={(e) => updateRow(i, "color", e.target.value)} style={{ width: 30, height: 26, border: "1px solid #C7D1CE", borderRadius: 5 }} />
                <label style={{ fontSize: 10.5, display: "flex", alignItems: "center", gap: 2 }}>
                  <input type="checkbox" checked={r.is_off} onChange={(e) => updateRow(i, "is_off", e.target.checked)} /> Off
                </label>
                {r.duplicate && <span style={{ fontSize: 10, color: "#C1432B" }}>مكرر</span>}
                <button onClick={() => removeRow(i)} style={{ background: "none", border: "none", color: "#C1432B" }}><X size={13} /></button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={confirmApply} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
              <CheckCircle2 size={13} /> إضافة الشيفتات
            </button>
            <button onClick={() => setParsed(null)} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 6, padding: "7px 14px", fontSize: 12 }}>إلغاء</button>
          </div>
        </div>
      )}
    </div>
  );
}
