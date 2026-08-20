import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Trash2, FileSpreadsheet, FileText } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
import { downloadExcel } from "../../lib/exportExcel";
import { downloadPdf } from "../../lib/exportPdf";
import { HH_MOMENTS } from "../../lib/handHygiene";

const REPORT_HEADERS = [
  "Date",
  "Department",
  "Observer",
  ...HH_MOMENTS.map((m) => m.label),
  "Missed",
  "Hand Wash",
  "Hand Rub",
  "Total Opportunities",
  "Compliant",
  "Compliance %",
  "Recorded By",
];

function cell(v) {
  return v === 1 ? "1" : v === 0 ? "0" : "";
}

function toReportRow(row) {
  return [
    row.date,
    row.department,
    row.observer,
    ...HH_MOMENTS.map((m) => cell(row[m.key])),
    cell(row.missed),
    cell(row.hand_wash),
    cell(row.hand_rub),
    row.total_opportunities,
    row.compliant,
    row.compliance_pct != null ? `${row.compliance_pct}%` : "",
    row.done_by,
  ];
}

export default function HandHygieneRecords() {
  const { config, isAdmin, session } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [filters, setFilters] = useState({ department: "", from: "", to: "" });

  async function load() {
    setLoading(true);
    let query = supabase
      .from("hh_observations")
      .select("*")
      .eq("deleted", false)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (filters.department) query = query.eq("department", filters.department);
    if (filters.from) query = query.gte("date", filters.from);
    if (filters.to) query = query.lte("date", filters.to);

    const { data } = await query;
    setRows(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  async function remove(id) {
    if (!confirm("Delete this observation?")) return;
    await supabase
      .from("hh_observations")
      .update({ deleted: true, deleted_by: session?.username, deleted_at: new Date().toISOString() })
      .eq("id", id);
    load();
  }

  function exportExcel() {
    downloadExcel(`infection-control-hh-records-${new Date().toISOString().slice(0, 10)}`, [
      { name: "HH Records", headers: REPORT_HEADERS, rows: rows.map(toReportRow) },
    ]);
  }

  function exportPdf() {
    downloadPdf(
      `infection-control-hh-records-${new Date().toISOString().slice(0, 10)}`,
      "Infection Control — Hand Hygiene Records",
      [{ headers: REPORT_HEADERS, rows: rows.map(toReportRow) }]
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Hand Hygiene Records</h1>
          <p className="text-sm text-slate-500">Past hand hygiene observations across all departments.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportExcel}
            disabled={rows.length === 0}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Export Excel
          </button>
          <button
            onClick={exportPdf}
            disabled={rows.length === 0}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <FileText className="h-3.5 w-3.5" />
            Export PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <select className="input" value={filters.department} onChange={(e) => setFilters({ ...filters, department: e.target.value })}>
          <option value="">All Departments</option>
          {(config?.hh_departments ?? []).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <input type="date" className="input" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        <input type="date" className="input" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Department</th>
              <th className="px-4 py-2 font-medium">Observer</th>
              <th className="px-4 py-2 font-medium">Compliance</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <ObservationRow
                key={row.id}
                row={row}
                expanded={expanded === row.id}
                onToggle={() => setExpanded(expanded === row.id ? null : row.id)}
                isAdmin={isAdmin}
                onDelete={() => remove(row.id)}
              />
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No matching records</p>}
        {loading && <p className="p-6 text-center text-sm text-slate-400">Loading...</p>}
      </div>
    </div>
  );
}

function ObservationRow({ row, expanded, onToggle, isAdmin, onDelete }) {
  return (
    <>
      <tr className="border-t border-slate-100 hover:bg-slate-50">
        <td className="px-4 py-2">{row.date}</td>
        <td className="px-4 py-2">{row.department}</td>
        <td className="px-4 py-2">{row.observer}</td>
        <td className="px-4 py-2">{row.compliance_pct != null ? `${row.compliance_pct}%` : "—"}</td>
        <td className="flex items-center justify-end gap-1 px-4 py-2">
          {isAdmin && (
            <button onClick={onDelete} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button onClick={onToggle} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-slate-100 bg-slate-50/60">
          <td colSpan={5} className="px-4 py-4">
            <div className="mb-3 grid grid-cols-2 gap-2 text-xs text-slate-500 sm:grid-cols-4">
              <div>Hand wash: {row.hand_wash === 1 ? "Yes" : "—"}</div>
              <div>Hand rub: {row.hand_rub === 1 ? "Yes" : "—"}</div>
              <div>Total opportunities: {row.total_opportunities}</div>
              <div>Recorded by: {row.done_by || "—"}</div>
              {row.deleted && <div>Deleted by: {row.deleted_by || "—"}</div>}
            </div>
            <div className="flex flex-col gap-1">
              {HH_MOMENTS.map((m) => (
                <div key={m.key} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-xs">
                  <span className="text-slate-700">{m.label}</span>
                  <span
                    className={
                      row[m.key] === 1
                        ? "font-medium text-emerald-600"
                        : row[m.key] === 0
                        ? "font-medium text-red-600"
                        : "font-medium text-slate-400"
                    }
                  >
                    {row[m.key] === 1 ? "Done" : row[m.key] === 0 ? "Missed" : "N/A"}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-xs">
                <span className="text-slate-700">Missed opportunity</span>
                <span className={row.missed === 1 ? "font-medium text-red-600" : "font-medium text-slate-400"}>
                  {row.missed === 1 ? "Yes" : "—"}
                </span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
