import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
import { downloadExcel } from "../../lib/exportExcel";
import { downloadPdf } from "../../lib/exportPdf";
import { HH_MOMENTS } from "../../lib/handHygiene";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const TARGET_PCT = 80;

const DEPT_HEADERS = ["Department", ...MONTHS, "Annual"];
const CATEGORY_HEADERS = ["Month", ...HH_MOMENTS.map((m) => m.label), "Missed", "Total Opportunities", "Compliant", "Compliance %"];

function pct(compliant, total) {
  return total > 0 ? Math.round((compliant / total) * 1000) / 10 : null;
}

function fmtPct(v) {
  return v != null ? `${v}%` : "—";
}

export default function HandHygieneDashboard() {
  const { config } = useAuth();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase
      .from("hh_observations")
      .select("date,department,total_opportunities,compliant,missed," + HH_MOMENTS.map((m) => m.key).join(","))
      .eq("deleted", false)
      .gte("date", `${year}-01-01`)
      .lte("date", `${year}-12-31`)
      .then(({ data }) => {
        setRows(data ?? []);
        setLoading(false);
      });
  }, [year]);

  const departments = config?.hh_departments ?? [];

  const byDeptMonth = useMemo(() => {
    return departments.map((dept) => {
      const perMonth = MONTHS.map((_, idx) => {
        const inMonth = rows.filter((r) => r.department === dept && new Date(r.date).getMonth() === idx);
        const total = inMonth.reduce((s, r) => s + r.total_opportunities, 0);
        const compliant = inMonth.reduce((s, r) => s + r.compliant, 0);
        return pct(compliant, total);
      });
      const deptRows = rows.filter((r) => r.department === dept);
      const annualTotal = deptRows.reduce((s, r) => s + r.total_opportunities, 0);
      const annualCompliant = deptRows.reduce((s, r) => s + r.compliant, 0);
      return { department: dept, months: perMonth, annual: pct(annualCompliant, annualTotal) };
    });
  }, [rows, departments]);

  const byCategoryMonth = useMemo(() => {
    return MONTHS.map((name, idx) => {
      const inMonth = rows.filter((r) => new Date(r.date).getMonth() === idx);
      const categoryCounts = HH_MOMENTS.map((m) => inMonth.reduce((s, r) => s + (r[m.key] === 1 ? 1 : 0), 0));
      const missed = inMonth.reduce((s, r) => s + (r.missed === 1 ? 1 : 0), 0);
      const total = inMonth.reduce((s, r) => s + r.total_opportunities, 0);
      const compliant = inMonth.reduce((s, r) => s + r.compliant, 0);
      return { month: name, categoryCounts, missed, total, compliant, compliancePct: pct(compliant, total) };
    });
  }, [rows]);

  const totals = useMemo(() => {
    const observations = rows.length;
    const total = rows.reduce((s, r) => s + r.total_opportunities, 0);
    const compliant = rows.reduce((s, r) => s + r.compliant, 0);
    const missed = rows.reduce((s, r) => s + (r.missed === 1 ? 1 : 0), 0);
    return { observations, compliance: pct(compliant, total), missed };
  }, [rows]);

  function toDeptRow(e) {
    return [e.department, ...e.months.map(fmtPct), fmtPct(e.annual)];
  }

  function toCategoryRow(e) {
    return [e.month, ...e.categoryCounts, e.missed, e.total, e.compliant, fmtPct(e.compliancePct)];
  }

  function exportExcel() {
    downloadExcel(`infection-control-hh-dashboard-${year}`, [
      { name: "By Department", headers: DEPT_HEADERS, rows: byDeptMonth.map(toDeptRow) },
      { name: "By Category", headers: CATEGORY_HEADERS, rows: byCategoryMonth.map(toCategoryRow) },
    ]);
  }

  function exportPdf() {
    downloadPdf(`infection-control-hh-dashboard-${year}`, `Infection Control — Hand Hygiene Dashboard (${year})`, [
      { title: "Monthly Compliance by Department", headers: DEPT_HEADERS, rows: byDeptMonth.map(toDeptRow) },
      { title: "Monthly Summary by Category", headers: CATEGORY_HEADERS, rows: byCategoryMonth.map(toCategoryRow) },
    ]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Hand Hygiene Dashboard</h1>
          <p className="text-sm text-slate-500">Monthly compliance by department, target {TARGET_PCT}%.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            className="input w-24"
            value={year}
            onChange={(e) => setYear(Number(e.target.value) || year)}
          />
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

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <SummaryCard label="Total Observations" value={totals.observations} />
        <SummaryCard label="Overall Compliance" value={fmtPct(totals.compliance)} />
        <SummaryCard label="Missed Opportunities" value={totals.missed} highlight={totals.missed > 0} />
      </div>

      <Section title="Monthly Compliance by Department">
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 font-medium">Department</th>
                {MONTHS.map((m) => (
                  <th key={m} className="whitespace-nowrap px-3 py-2 font-medium">
                    {m.slice(0, 3)}
                  </th>
                ))}
                <th className="whitespace-nowrap px-3 py-2 font-medium">Annual</th>
              </tr>
            </thead>
            <tbody>
              {byDeptMonth.map((e) => (
                <tr key={e.department} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-700">{e.department}</td>
                  {e.months.map((v, idx) => (
                    <td key={idx} className={`px-3 py-2 ${v != null && v < TARGET_PCT ? "text-red-600" : ""}`}>
                      {fmtPct(v)}
                    </td>
                  ))}
                  <td className={`px-3 py-2 font-semibold ${e.annual != null && e.annual < TARGET_PCT ? "text-red-600" : ""}`}>
                    {fmtPct(e.annual)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && byDeptMonth.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No departments configured</p>}
        </div>
      </Section>

      <Section title="Monthly Summary by Category">
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 font-medium">Month</th>
                {HH_MOMENTS.map((m) => (
                  <th key={m.key} className="whitespace-nowrap px-3 py-2 font-medium">
                    {m.label}
                  </th>
                ))}
                <th className="whitespace-nowrap px-3 py-2 font-medium">Missed</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">Total Opp.</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">Compliant</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">Compliance</th>
              </tr>
            </thead>
            <tbody>
              {byCategoryMonth.map((e) => (
                <tr key={e.month} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-700">{e.month}</td>
                  {e.categoryCounts.map((v, idx) => (
                    <td key={idx} className="px-3 py-2">
                      {v}
                    </td>
                  ))}
                  <td className="px-3 py-2">{e.missed}</td>
                  <td className="px-3 py-2">{e.total}</td>
                  <td className="px-3 py-2">{e.compliant}</td>
                  <td className={`px-3 py-2 font-semibold ${e.compliancePct != null && e.compliancePct < TARGET_PCT ? "text-red-600" : ""}`}>
                    {fmtPct(e.compliancePct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
