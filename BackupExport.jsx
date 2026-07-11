import React, { useState } from "react";
import { Download, DatabaseBackup, CheckSquare, Square } from "lucide-react";
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

// A few columns hold JSON or raw IDs that aren't readable as plain text in
// Excel — turn them into a human-readable summary using lookups built once.
function flattenValue(table, key, v, lookups) {
  if (v === null || v === undefined) return "";
  if (table === "qc_panels" && key === "analytes" && Array.isArray(v)) {
    return v.map((a) => `${a.name}${a.unit ? ` (${a.unit})` : ""}`).join(", ");
  }
  if (table === "custom_tables" && key === "columns" && Array.isArray(v)) {
    return v.join(", ");
  }
  if (key === "extra_data" && v && typeof v === "object" && !Array.isArray(v)) {
    const entries = Object.entries(v).filter(([, val]) => val !== "" && val !== null);
    return entries.length ? entries.map(([k, val]) => `${k}: ${val}`).join(" | ") : "";
  }
  if (key === "staff_id" && lookups.staff[v]) return `${lookups.staff[v]} (${v.slice(0, 8)})`;
  if (key === "equipment_id" && lookups.equipment[v]) return `${lookups.equipment[v]} (${v.slice(0, 8)})`;
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

export default function BackupExport() {
  const [selected, setSelected] = useState(() => new Set(TABLES.map((t) => t.table)));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [lastResult, setLastResult] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [downloadName, setDownloadName] = useState("");

  function toggle(table) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(table)) next.delete(table); else next.add(table);
      return next;
    });
  }

  const chosenTables = TABLES.filter((t) => selected.has(t.table));

  async function runBackup() {
    if (chosenTables.length === 0) return;
    setBusy(true);
    setLastResult(null);
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const summary = [];

    setProgress("Preparing name lookups…");
    const [{ data: staffRows }, { data: equipRows }] = await Promise.all([
      supabase.from("staff_members").select("id, full_name"),
      supabase.from("equipment").select("id, name"),
    ]);
    const lookups = {
      staff: Object.fromEntries((staffRows || []).map((s) => [s.id, s.full_name])),
      equipment: Object.fromEntries((equipRows || []).map((e) => [e.id, e.name])),
    };

    for (const { table, sheet } of chosenTables) {
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
      const aoa = [headers, ...rows.map((r) => headers.map((h) => flattenValue(table, h, r[h], lookups)))];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
    }

    setProgress("Saving file…");
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = chosenTables.length === TABLES.length
      ? `qc-log-full-backup-${stamp}.xlsx`
      : `qc-log-backup-${chosenTables.length === 1 ? chosenTables[0].sheet.replace(/\s+/g, "-").toLowerCase() : "selected"}-${stamp}.xlsx`;
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
    await supabase.from("backup_log").insert({ row_count: summary.reduce((s, r) => s + r.rows, 0) });
    setProgress("");
    setBusy(false);
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        <DatabaseBackup size={19} /> Full Backup
      </h2>
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 16 }}>
        Pick which tables to include — each one becomes its own sheet in one Excel file. Leave everything checked for a full backup, or narrow it down to just what you need (e.g. only "Control Lots").
      </div>

      <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 20 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button onClick={() => setSelected(new Set(TABLES.map((t) => t.table)))} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 6, padding: "5px 10px", fontSize: 11.5, fontWeight: 600, color: "#516361" }}>Select all</button>
          <button onClick={() => setSelected(new Set())} style={{ background: "none", border: "1px solid #C7D1CE", borderRadius: 6, padding: "5px 10px", fontSize: 11.5, fontWeight: 600, color: "#516361" }}>Select none</button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16, maxHeight: 220, overflowY: "auto", padding: "4px 2px" }}>
          {TABLES.map((t) => {
            const on = selected.has(t.table);
            return (
              <button key={t.table} onClick={() => toggle(t.table)} style={{ display: "flex", alignItems: "center", gap: 6, background: on ? "#E8F2EC" : "#F0F3F2", border: "1px solid " + (on ? "#2F6B4F33" : "#E1E8E5"), color: on ? "#2F6B4F" : "#8A9694", borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 600 }}>
                {on ? <CheckSquare size={13} /> : <Square size={13} />} {t.sheet}
              </button>
            );
          })}
        </div>

        <button onClick={runBackup} disabled={busy || chosenTables.length === 0} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 8, padding: "12px 20px", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8, opacity: (busy || chosenTables.length === 0) ? 0.6 : 1 }}>
          <Download size={16} /> {busy ? (progress || "Working…") : `Download ${chosenTables.length === TABLES.length ? "full backup" : `${chosenTables.length} table${chosenTables.length === 1 ? "" : "s"}`}`}
        </button>

        {lastResult && (
          <div style={{ marginTop: 16, fontSize: 12.5 }}>
            <div style={{ fontWeight: 700, color: "#2F6B4F", marginBottom: 8 }}>✅ Done — {lastResult.reduce((s, r) => s + r.rows, 0)} rows across {lastResult.length} sheet{lastResult.length === 1 ? "" : "s"}.</div>
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
