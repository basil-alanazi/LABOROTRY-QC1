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
        const knownList = staffNames.length ? ` Staff currently on your roster: ${staffNames.join(", ")}.` : " You don't have any staff on the roster yet — add them on the Staff page first.";
        const foundList = unmatchedStaffHeaders.length ? ` Names found in the file that didn't match: ${[...new Set(unmatchedStaffHeaders)].filter(Boolean).join(", ")}.` : "";
        setError(`Couldn't match any data in this file to your current staff.${foundList}${knownList}`);
      } else {
        setResult({
          entries: entries.map((e) => ({ ...e, day: Math.min(e.day, daysInMonth) })).filter((e) => e.day >= 1 && e.day <= daysInMonth),
          unmatchedStaffHeaders: [...new Set(unmatchedStaffHeaders)].filter(Boolean),
        });
      }
    } catch (err) {
      setError(err.message || "Couldn't read this file.");
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
        <Upload size={13} /> {busy ? "Reading…" : "Upload schedule from Excel or Word"}
        <input type="file" accept=".xlsx,.xls,.csv,.docx" onChange={handleFile} disabled={busy} style={{ display: "none" }} />
      </label>
      <div style={{ fontSize: 10.5, color: "#8A9694", marginTop: 4 }}>
        The file needs staff names (matching the names on the Staff page) and the days of the month, with each cell holding the shift code.
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
              Heads up: these names in the file didn't match any staff on your roster, so they were skipped: {result.unmatchedStaffHeaders.join(", ")}
            </div>
          )}
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "#8A6D2F", marginBottom: 8 }}>
            Review the values before saving ({result.entries.length} cells will be filled in for {month}):
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto" }}>
            {result.entries.map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", background: "#fff", borderRadius: 6, padding: 5, fontSize: 11.5 }}>
                <span style={{ flex: 1 }}>{e.staffName}</span>
                <span style={{ width: 40, textAlign: "center", color: "#8A9694" }}>Day {e.day}</span>
                <span style={{ width: 50, textAlign: "center", fontWeight: 700 }}>{e.shift_code || "—"}</span>
                <button onClick={() => removeEntry(i)} style={{ background: "none", border: "none", color: "#C1432B" }}><X size={13} /></button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={confirmApply} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
              <CheckCircle2 size={13} /> Fill in schedule
            </button>
            <button onClick={() => setResult(null)} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 6, padding: "7px 14px", fontSize: 12 }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
