import React, { useState } from "react";
import { Upload, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { parseRangeFile } from "./rangeFileParser";

const inputStyle = { width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "7px 9px", fontSize: 12.5, boxSizing: "border-box" };

// Lets the user upload an Excel/Word file with normal-range data, matches
// each parsed row to one of the panel's existing analyte names (fuzzy, by
// name), shows an editable preview, then hands the confirmed values back
// via onApply(valuesByAnalyteName).
export default function RangeImport({ analyteNames, onApply }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState(null); // array of { matchedName, unit, rangeLow, rangeHigh, mean, sd }

  function bestMatch(rawName) {
    const norm = rawName.trim().toLowerCase();
    let exact = analyteNames.find((n) => n.toLowerCase() === norm);
    if (exact) return exact;
    let partial = analyteNames.find((n) => norm.includes(n.toLowerCase()) || n.toLowerCase().includes(norm));
    return partial || null;
  }

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    setError("");
    setParsed(null);
    try {
      const { rows } = await parseRangeFile(file);
      if (!rows.length) {
        setError("لم أتمكن من التعرف على أي بيانات بالملف. تأكد أن فيه اسم تحليل وقيمة Low/High أو Mean/SD واضحة.");
      } else {
        setParsed(rows.map((r) => ({ ...r, matchedName: bestMatch(r.name) || analyteNames[0] || "" })));
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
    const values = {};
    parsed.forEach((r) => {
      if (!r.matchedName) return;
      values[r.matchedName] = {
        mean: r.mean !== null && r.mean !== undefined ? String(r.mean) : "",
        sd: r.sd !== null && r.sd !== undefined ? String(r.sd) : "",
        rangeLow: r.rangeLow !== null && r.rangeLow !== undefined ? String(r.rangeLow) : "",
        rangeHigh: r.rangeHigh !== null && r.rangeHigh !== undefined ? String(r.rangeHigh) : "",
        target: "",
      };
    });
    onApply(values);
    setParsed(null);
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: "1px dashed #0F7173", color: "#0F7173", borderRadius: 7, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
        <Upload size={13} /> {busy ? "جاري القراءة…" : "رفع من ملف Excel أو Word"}
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
            راجع الأرقام قبل الحفظ — تأكد أن كل صف مربوط بالتحليل الصحيح:
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
            {parsed.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 5, alignItems: "center", background: "#fff", borderRadius: 6, padding: 6 }}>
                <select value={r.matchedName} onChange={(e) => updateRow(i, "matchedName", e.target.value)} style={{ ...inputStyle, width: 100 }}>
                  <option value="">— تجاهل —</option>
                  {analyteNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <input placeholder="Low" type="number" value={r.rangeLow ?? ""} onChange={(e) => updateRow(i, "rangeLow", e.target.value === "" ? null : Number(e.target.value))} style={{ ...inputStyle, width: 60 }} />
                <input placeholder="High" type="number" value={r.rangeHigh ?? ""} onChange={(e) => updateRow(i, "rangeHigh", e.target.value === "" ? null : Number(e.target.value))} style={{ ...inputStyle, width: 60 }} />
                <input placeholder="Mean" type="number" value={r.mean ?? ""} onChange={(e) => updateRow(i, "mean", e.target.value === "" ? null : Number(e.target.value))} style={{ ...inputStyle, width: 60 }} />
                <input placeholder="SD" type="number" value={r.sd ?? ""} onChange={(e) => updateRow(i, "sd", e.target.value === "" ? null : Number(e.target.value))} style={{ ...inputStyle, width: 55 }} />
                <button onClick={() => removeRow(i)} style={{ background: "none", border: "none", color: "#C1432B" }}><X size={14} /></button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={confirmApply} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
              <CheckCircle2 size={13} /> تعبية الحقول
            </button>
            <button onClick={() => setParsed(null)} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 6, padding: "7px 14px", fontSize: 12 }}>إلغاء</button>
          </div>
        </div>
      )}
    </div>
  );
}
