import React, { useState, useEffect } from "react";
import { Download, FileText } from "lucide-react";
import { supabase } from "./supabaseClient";

const inputStyle = { border: "1px solid #C7D1CE", borderRadius: 7, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" };

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function BreakHistory() {
  const [breaks, setBreaks] = useState(null);
  const [staff, setStaff] = useState([]);
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(todayISO());

  async function loadAll() {
    const { data: b } = await supabase.from("break_sessions").select("*").order("requested_at", { ascending: false });
    const { data: s } = await supabase.from("staff_members").select("*");
    setBreaks(b || []);
    setStaff(s || []);
  }
  useEffect(() => { loadAll(); }, []);

  function nameFor(id) {
    return staff.find((s) => s.id === id)?.full_name || "—";
  }

  if (breaks === null) return <div style={{ padding: 40, textAlign: "center", color: "#8A9694" }}>Loading…</div>;

  const filtered = breaks.filter((b) => b.date >= dateFrom && b.date <= dateTo);

  function exportPDF() { window.print(); }

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const header = ["Date", "Staff", "Covering", "Duration (min)", "Status", "Requested By", "Approved By", "Requested At", "Started At", "Ended At"];
    const aoa = [header, ...filtered.map((b) => [
      b.date, nameFor(b.staff_id), nameFor(b.covering_staff_id), b.duration_minutes, b.status,
      b.requested_by, b.approved_by || "", b.requested_at || "", b.started_at || "", b.ended_at || "",
    ])];
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Break History");
    XLSX.writeFile(wb, `break-history-${dateFrom}-to-${dateTo}.xlsx`);
  }

  return (
    <div>
      <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Break History</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportPDF} style={{ background: "none", border: "1px solid #C7D1CE", color: "#516361", borderRadius: 7, padding: "8px 12px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><FileText size={14} /> Save as PDF</button>
          <button onClick={exportExcel} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "8px 12px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Download size={14} /> Export Excel</button>
        </div>
      </div>
      <div className="no-print" style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>Every break request, who covered, and who approved it — for audit or reference.</div>

      <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: "#7B8E8A", alignSelf: "center" }}>From</span>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
        <span style={{ fontSize: 12, color: "#7B8E8A", alignSelf: "center" }}>To</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#8A9694" }}>No break records in this range.</div>
      ) : (
        <div className="print-area" style={{ overflowX: "auto", background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#F0F3F2" }}>
                <th style={{ padding: "7px 10px", textAlign: "left" }}>Date</th>
                <th style={{ padding: "7px 10px", textAlign: "left" }}>Staff</th>
                <th style={{ padding: "7px 10px", textAlign: "left" }}>Covering</th>
                <th style={{ padding: "7px 10px", textAlign: "left" }}>Duration</th>
                <th style={{ padding: "7px 10px", textAlign: "left" }}>Status</th>
                <th style={{ padding: "7px 10px", textAlign: "left" }}>Requested By</th>
                <th style={{ padding: "7px 10px", textAlign: "left" }}>Approved By</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id} style={{ borderTop: "1px solid #EEF2F0" }}>
                  <td style={{ padding: "6px 10px" }}>{b.date}</td>
                  <td style={{ padding: "6px 10px" }}>{nameFor(b.staff_id)}</td>
                  <td style={{ padding: "6px 10px" }}>{nameFor(b.covering_staff_id)}</td>
                  <td style={{ padding: "6px 10px" }}>{b.duration_minutes} min</td>
                  <td style={{ padding: "6px 10px", textTransform: "capitalize" }}>{b.status}</td>
                  <td style={{ padding: "6px 10px" }}>{b.requested_by}</td>
                  <td style={{ padding: "6px 10px" }}>{b.approved_by || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
