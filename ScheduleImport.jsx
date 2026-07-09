import React, { useState } from "react";
import { Upload, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { parseScheduleFile } from "./scheduleFileParser";

const inputStyle = { border: "1px solid #C7D1CE", borderRadius: 6, padding: "5px 7px", fontSize: 12, boxSizing: "border-box" };

// Lets the user upload an Excel/Word schedule grid (staff x days = shift
// codes, optionally with L/A/S flags in the same cell). Matches staff by
// name against the existing roster, previews the parsed entries, then
// hands them back via onApply(entries) where entries = [{staffId, day, shift_code, is_late, is_absent, is_sick}].
export default function ScheduleImport({ staff, month, onApply }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { entries, unmatchedStaffHeaders }

  const staffNames = staff.map((s) => s.full_name);
  const [year, mo] = month.split("-");
  const daysInMonth = new Date(Number(year), Number(mo), 0).getDate();

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const { entries, unmatchedStaffHeaders } = await parseScheduleFile(file, staffNames);
      if (!entries.length) {
        setError("لم أتمكن من مطابقة أي بيانات بالملف مع الموظفين الحاليين. تأكد أن أسماء الموظفين بالملف تطابق (أو تشابه) الأسماء بقسم Staff.");
      } else {
        setResult({
          entries: entries.map((e) => ({ ...e, day: Math.min(e.day, daysInMonth) })).filter((e) => e.day >= 1 && e.day <= daysInMonth),
          unmatchedStaffHeaders: [...new Set(unmatchedStaffHeaders)].filter(Boolean),
        });
      }
    } catch (err) {
      setError(err.message || "تعذرت قراءة الملف.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  function removeEntry(i) {
    setResult((r) => ({ ...r, entries: r.entries.filter((_, idx) => idx !== i) }));
  }

  function confirmApply() {
    const withIds = result.entries.map((e) => {
      const staffMember = staff.find((s) => s.full_name === e.staffName);
      return { ...e, staffId: staffMember?.id };
    }).filter((e) => e.staffId);
    onApply(withIds);
    setResult(null);
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: "1px dashed #0F7173", color: "#0F7173", borderRadius: 7, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
        <Upload size={13} /> {busy ? "جاري القراءة…" : "رفع جدول من ملف Excel أو Word"}
        <input type="file" accept=".xlsx,.xls,.csv,.docx" onChange={handleFile} disabled={busy} style={{ display: "none" }} />
      </label>
      <div style={{ fontSize: 10.5, color: "#8A9694", marginTop: 4 }}>
        الملف لازم يكون فيه أسماء الموظفين (تطابق أسماءهم بقسم Staff) وأيام الشهر، والخلية فيها كود الشيفت — وممكن تضيف L أو A أو S بنفس الخلية (مثلاً "M L").
      </div>
      {error && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: "#C1432B", marginTop: 6 }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
        </div>
      )}

      {result && result.entries.length > 0 && (
        <div style={{ background: "#FBF8F0", border: "1px solid #E8DCC0", borderRadius: 8, padding: 10, marginTop: 10 }}>
          {result.unmatchedStaffHeaders.length > 0 && (
            <div style={{ fontSize: 11.5, color: "#C1432B", marginBottom: 8 }}>
              تنبيه: هذي الأسماء بالملف ما طابقت أي موظف موجود بقسم Staff، وتم تجاهلها: {result.unmatchedStaffHeaders.join("، ")}
            </div>
          )}
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "#8A6D2F", marginBottom: 8 }}>
            راجع القيم قبل الحفظ ({result.entries.length} خلية بيتم تعبيتها لشهر {month}):
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto" }}>
            {result.entries.map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", background: "#fff", borderRadius: 6, padding: 5, fontSize: 11.5 }}>
                <span style={{ flex: 1 }}>{e.staffName}</span>
                <span style={{ width: 40, textAlign: "center", color: "#8A9694" }}>يوم {e.day}</span>
                <span style={{ width: 50, textAlign: "center", fontWeight: 700 }}>{e.shift_code || "—"}</span>
                <span style={{ width: 60, color: "#B8860B" }}>{[e.is_late && "L", e.is_absent && "A", e.is_sick && "S"].filter(Boolean).join(" ")}</span>
                <button onClick={() => removeEntry(i)} style={{ background: "none", border: "none", color: "#C1432B" }}><X size={13} /></button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={confirmApply} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
              <CheckCircle2 size={13} /> تعبية الجدول
            </button>
            <button onClick={() => setResult(null)} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 6, padding: "7px 14px", fontSize: 12 }}>إلغاء</button>
          </div>
        </div>
      )}
    </div>
  );
}
