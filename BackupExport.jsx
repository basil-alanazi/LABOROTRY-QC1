import React, { useState } from "react";
import { Download, DatabaseBackup } from "lucide-react";
import { supabase } from "./supabaseClient";

// Every table worth backing up, and a readable sheet name for each.
// (Login credentials, push subscriptions, and notification logs are left out —
// not useful in a data backup and best not duplicated into a downloadable file.)
const TABLES = [
  { table: "qc_panels", sheet: "QC Panels" },
  { table: "qc_baselines", sheet: "QC Baselines" },
  { table: "qc_entries", sheet: "QC Entries" },
  { table: "qc_control_lots", sheet: "Control Lots" },
  { table: "staff_members", sheet: "Staff" },
  { table: "shift_templates", sheet: "Shift Templates" },
  { table: "schedule_entries", sheet: "Schedule" },
  { table: "department_assignments", sheet: "Daily Assignment" },
  { table: "break_sessions", sheet: "Break History" },
  { table: "department_swap_requests", sheet: "Dept Swap Requests" },
  { table: "custom_tables", sheet: "Custom Tables (list)" },
  { table: "custom_rows", sheet: "Custom Table Rows" },
  { table: "riqas_programs", sheet: "RIQAS Programs" },
  { table: "riqas_cycles", sheet: "RIQAS Cycles" },
  { table: "reject_samples", sheet: "Reject Sample" },
  { table: "panic_values", sheet: "Panic Value" },
  { table: "corrective_actions", sheet: "Corrective Action" },
  { table: "infection_diseases", sheet: "Infection Disease" },
  { table: "equipment", sheet: "Equipment" },
  { table: "equipment_events", sheet: "Equipment Events" },
  { table: "user_profiles", sheet: "User Profiles" },
  { table: "audit_log", sheet: "Audit Log" },
];

function flattenValue(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

export default function BackupExport() {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [lastResult, setLastResult] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [downloadName, setDownloadName] = useState("");

  async function runBackup() {
    setBusy(true);
    setLastResult(null);
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const summary = [];

    for (const { table, sheet } of TABLES) {
      setProgress(`Fetching ${sheet}…`);
      const { data, error } = await supabase.from(table).select("*");
      if (error) {
        summary.push({ sheet, rows: 0, note: "error: " + error.message });
        continue;
      }
      const rows = data || [];
      summary.push({ sheet, rows: rows.length, note: "" });
      if (rows.length === 0) {
        const ws = XLSX.utils.aoa_to_sheet([["No rows"]]);
        XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
        continue;
      }
      const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      const aoa = [headers, ...rows.map((r) => headers.map((h) => flattenValue(r[h])))];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
    }

    setProgress("Saving file…");
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `qc-log-full-backup-${stamp}.xlsx`;
    const wbArray = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([wbArray], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setDownloadUrl(url);
    setDownloadName(filename);
    setLastResult(summary);
    setProgress("");
    setBusy(false);
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        <DatabaseBackup size={19} /> Full Backup
      </h2>
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>
        Downloads every table — QC, schedule, staff, records, equipment, and more — as one Excel file with a sheet per table. Do this regularly, especially before any big change.
      </div>

      <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 20 }}>
        <button onClick={runBackup} disabled={busy} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 8, padding: "12px 20px", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8, opacity: busy ? 0.7 : 1 }}>
          <Download size={16} /> {busy ? (progress || "Working…") : "Download full backup"}
        </button>

        {lastResult && (
          <div style={{ marginTop: 16, fontSize: 12.5 }}>
            <div style={{ fontWeight: 700, color: "#2F6B4F", marginBottom: 8 }}>✅ Done — {lastResult.reduce((s, r) => s + r.rows, 0)} rows across {lastResult.length} sheets.</div>
            {downloadUrl && (
              <a href={downloadUrl} download={downloadName} style={{ display: "inline-block", marginBottom: 12, background: "#0F7173", color: "#fff", borderRadius: 7, padding: "9px 16px", fontWeight: 700, textDecoration: "none", fontSize: 13 }}>
                📥 Tap here if the download didn't start — {downloadName}
              </a>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 240, overflowY: "auto" }}>
              {lastResult.map((r) => (
                <div key={r.sheet} style={{ display: "flex", justifyContent: "space-between", color: r.note ? "#C1432B" : "#516361" }}>
                  <span>{r.sheet}</span>
                  <span>{r.note || `${r.rows} rows`}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
