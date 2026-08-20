import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { downloadExcel } from "../lib/exportExcel";
import { downloadPdf } from "../lib/exportPdf";

const CHECKLIST_HEADERS = ["Checklist", "Audits", "Met", "Not Met", "Applicable", "Compliance %"];
const DEPARTMENT_HEADERS = ["Department", "Audits", "Met", "Not Met", "Compliance %"];

function toChecklistRow(e) {
  return [e.name, e.audits, e.met, e.notMet, e.applicable, e.compliance != null ? `${e.compliance}%` : ""];
}

function toDepartmentRow(e) {
  return [e.department, e.audits, e.met, e.notMet, e.compliance != null ? `${e.compliance}%` : ""];
}

function monthBounds(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const from = `${monthStr}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${monthStr}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function Dashboard() {
  const [mode, setMode] = useState("month"); // "month" | "range"
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [range, setRange] = useState(() => ({ from: todayStr(), to: todayStr() }));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const { from, to } = mode === "month" ? monthBounds(month) : range;
  const periodLabel = mode === "month" ? month : `${from} to ${to}`;

  useEffect(() => {
    if (!from || !to) return;
    setLoading(true);
    supabase
      .from("ward_round_audits")
      .select("checklist_code,checklist_name_ar,department,met_count,applicable_count,not_met_count")
      .eq("deleted", false)
      .gte("date", from)
      .lte("date", to)
      .then(({ data }) => {
        setRows(data ?? []);
        setLoading(false);
      });
  }, [from, to]);

  const byChecklist = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const key = r.checklist_code;
      if (!map.has(key)) map.set(key, { name: r.checklist_name_ar, audits: 0, met: 0, applicable: 0, notMet: 0 });
      const entry = map.get(key);
      entry.audits += 1;
      entry.met += r.met_count;
      entry.applicable += r.applicable_count;
      entry.notMet += r.not_met_count;
    }
    return [...map.values()].map((e) => ({
      ...e,
      compliance: e.applicable > 0 ? Math.round((e.met / e.applicable) * 1000) / 10 : null,
    }));
  }, [rows]);

  const totals = useMemo(() => {
    const audits = rows.length;
    const met = rows.reduce((s, r) => s + r.met_count, 0);
    const applicable = rows.reduce((s, r) => s + r.applicable_count, 0);
    const notMet = rows.reduce((s, r) => s + r.not_met_count, 0);
    const compliance = applicable > 0 ? Math.round((met / applicable) * 1000) / 10 : null;
    return { audits, compliance, notMet, checklistTypes: byChecklist.length };
  }, [rows, byChecklist]);

  const byDepartment = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.department)) map.set(r.department, { audits: 0, met: 0, applicable: 0, notMet: 0 });
      const entry = map.get(r.department);
      entry.audits += 1;
      entry.met += r.met_count;
      entry.applicable += r.applicable_count;
      entry.notMet += r.not_met_count;
    }
    return [...map.entries()].map(([department, e]) => ({
      department,
      ...e,
      compliance: e.applicable > 0 ? Math.round((e.met / e.applicable) * 1000) / 10 : null,
    }));
  }, [rows]);

  function exportExcel() {
    downloadExcel(`infection-control-dashboard-${from}-to-${to}`, [
      { name: "By Checklist", headers: CHECKLIST_HEADERS, rows: byChecklist.map(toChecklistRow) },
      { name: "By Department", headers: DEPARTMENT_HEADERS, rows: byDepartment.map(toDepartmentRow) },
    ]);
  }

  function exportPdf() {
    downloadPdf(`infection-control-dashboard-${from}-to-${to}`, `Infection Control — Dashboard (${periodLabel})`, [
      { title: "By Checklist Type", headers: CHECKLIST_HEADERS, rows: byChecklist.map(toChecklistRow) },
      { title: "By Department", headers: DEPARTMENT_HEADERS, rows: byDepartment.map(toDepartmentRow) },
    ]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500">Compliance summary across checklists and departments.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
            <button
              onClick={() => setMode("month")}
              className={`rounded-md px-3 py-1 font-medium ${mode === "month" ? "bg-teal-600 text-white" : "text-slate-500"}`}
            >
              Month
            </button>
            <button
              onClick={() => setMode("range")}
              className={`rounded-md px-3 py-1 font-medium ${mode === "range" ? "bg-teal-600 text-white" : "text-slate-500"}`}
            >
              Custom range
            </button>
          </div>
          {mode === "month" ? (
            <input type="month" className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />
          ) : (
            <>
              <input
                type="date"
                className="input w-auto"
                value={range.from}
                onChange={(e) => setRange({ ...range, from: e.target.value })}
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                className="input w-auto"
                value={range.to}
                onChange={(e) => setRange({ ...range, to: e.target.value })}
              />
            </>
          )}
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

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard label="Total Audits" value={totals.audits} />
        <SummaryCard label="Overall Compliance" value={totals.compliance != null ? `${totals.compliance}%` : "—"} />
        <SummaryCard label="NOT MET Items" value={totals.notMet} highlight={totals.notMet > 0} />
        <SummaryCard label="Active Checklist Types" value={totals.checklistTypes} />
      </div>

      <Section title="By Checklist Type">
        <Table
          rows={byChecklist}
          columns={[
            { key: "name", label: "Checklist" },
            { key: "audits", label: "Audits" },
            { key: "met", label: "Met" },
            { key: "notMet", label: "Not Met" },
            { key: "applicable", label: "Applicable" },
            { key: "compliance", label: "Compliance", render: (v) => (v != null ? `${v}%` : "—") },
          ]}
          loading={loading}
        />
      </Section>

      <Section title="By Department">
        <Table
          rows={byDepartment}
          columns={[
            { key: "department", label: "Department" },
            { key: "audits", label: "Audits" },
            { key: "met", label: "Met" },
            { key: "notMet", label: "Not Met" },
            { key: "compliance", label: "Compliance", render: (v) => (v != null ? `${v}%` : "—") },
          ]}
          loading={loading}
        />
      </Section>
    </div>
  );
}

function SummaryCard({ label, value, highlight }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`text-2xl font-bold ${highlight ? "text-red-600" : "text-slate-800"}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </div>
  );
}

function Table({ rows, columns, loading }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="px-4 py-2 font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-t border-slate-100">
              {columns.map((c) => (
                <td key={c.key} className="px-4 py-2">
                  {c.render ? c.render(row[c.key]) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && rows.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No data for this period</p>}
    </div>
  );
}
