import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Trash2, FileSpreadsheet, FileText, Paperclip } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
import { downloadExcel } from "../../lib/exportExcel";
import { downloadPdf } from "../../lib/exportPdf";
import { WARD_ROUND_ATTACHMENTS_BUCKET } from "../../lib/compliance";

function attachmentUrl(path) {
  if (!path) return null;
  return supabase.storage.from(WARD_ROUND_ATTACHMENTS_BUCKET).getPublicUrl(path).data.publicUrl;
}

const REPORT_HEADERS = [
  "Date",
  "Department",
  "Checklist",
  "Patient Name",
  "MRN",
  "Age",
  "Diagnosis",
  "Met",
  "Not Met",
  "Applicable",
  "Compliance %",
  "Status",
  "Recorded By",
  "Resolved By",
  "Comments",
  "Attachment",
];

function toReportRow(row) {
  return [
    row.date,
    row.department,
    row.checklist_name_ar,
    row.patient_name,
    row.mrn,
    row.age,
    row.diagnosis,
    row.met_count,
    row.not_met_count,
    row.applicable_count,
    row.compliance_pct != null ? `${row.compliance_pct}%` : "",
    row.not_met_count > 0 ? (row.action_status === "resolved" ? "Resolved" : "Action Needed") : "",
    row.done_by,
    row.resolved_by || "",
    row.comments,
    attachmentUrl(row.attachment_path) || "",
  ];
}

export default function WardRoundRecords() {
  const { config, isAdmin, session } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [filters, setFilters] = useState({ department: "", checklist: "", from: "", to: "" });
  const [checklistTypes, setChecklistTypes] = useState([]);

  useEffect(() => {
    supabase
      .from("checklist_types")
      .select("code,name_ar")
      .order("sort_order")
      .then(({ data }) => setChecklistTypes(data ?? []));
  }, []);

  async function load() {
    setLoading(true);
    let query = supabase
      .from("ward_round_audits")
      .select("*")
      .eq("deleted", false)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (filters.department) query = query.eq("department", filters.department);
    if (filters.checklist) query = query.eq("checklist_code", filters.checklist);
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

  async function markResolved(id) {
    await supabase
      .from("ward_round_audits")
      .update({ action_status: "resolved", resolved_by: session?.username, resolved_at: new Date().toISOString() })
      .eq("id", id);
    load();
  }

  async function remove(id) {
    if (!confirm("Delete this record?")) return;
    await supabase
      .from("ward_round_audits")
      .update({ deleted: true, deleted_by: session?.username, deleted_at: new Date().toISOString() })
      .eq("id", id);
    load();
  }

  function exportExcel() {
    downloadExcel(`infection-control-records-${new Date().toISOString().slice(0, 10)}`, [
      { name: "Records", headers: REPORT_HEADERS, rows: rows.map(toReportRow) },
    ]);
  }

  function exportPdf() {
    downloadPdf(
      `infection-control-records-${new Date().toISOString().slice(0, 10)}`,
      "Infection Control — Ward Round Records",
      [{ headers: REPORT_HEADERS, rows: rows.map(toReportRow) }]
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Ward Round Records</h1>
          <p className="text-sm text-slate-500">Past ward round audits across all departments.</p>
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

      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
        <select className="input" value={filters.department} onChange={(e) => setFilters({ ...filters, department: e.target.value })}>
          <option value="">All Departments</option>
          {(config?.departments ?? []).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select className="input" value={filters.checklist} onChange={(e) => setFilters({ ...filters, checklist: e.target.value })}>
          <option value="">All Checklists</option>
          {checklistTypes.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name_ar}
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
              <th className="px-4 py-2 font-medium">Checklist</th>
              <th className="px-4 py-2 font-medium">Patient</th>
              <th className="px-4 py-2 font-medium">Compliance</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2"></th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <RecordRow
                key={row.id}
                row={row}
                expanded={expanded === row.id}
                onToggle={() => setExpanded(expanded === row.id ? null : row.id)}
                isAdmin={isAdmin}
                onResolve={() => markResolved(row.id)}
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

function RecordRow({ row, expanded, onToggle, isAdmin, onResolve, onDelete }) {
  return (
    <>
      <tr className="border-t border-slate-100 hover:bg-slate-50">
        <td className="px-4 py-2">{row.date}</td>
        <td className="px-4 py-2">{row.department}</td>
        <td className="px-4 py-2">{row.checklist_name_ar}</td>
        <td className="px-4 py-2">{row.patient_name}</td>
        <td className="px-4 py-2">{row.compliance_pct != null ? `${row.compliance_pct}%` : "—"}</td>
        <td className="px-4 py-2">
          {row.not_met_count > 0 ? (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                row.action_status === "resolved" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
              }`}
            >
              {row.action_status === "resolved" ? "Resolved" : "Action Needed"}
            </span>
          ) : (
            <span className="rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-400">—</span>
          )}
        </td>
        <td className="px-4 py-2">{row.attachment_path && <Paperclip className="h-3.5 w-3.5 text-slate-400" />}</td>
        <td className="flex items-center justify-end gap-1 px-4 py-2">
          {isAdmin && row.not_met_count > 0 && row.action_status !== "resolved" && (
            <button onClick={onResolve} className="rounded-lg px-2 py-1 text-xs text-teal-600 hover:bg-teal-50">
              Resolve
            </button>
          )}
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
          <td colSpan={8} className="px-4 py-4">
            <div className="mb-3 grid grid-cols-2 gap-2 text-xs text-slate-500 sm:grid-cols-4">
              <div>MRN: {row.mrn || "—"}</div>
              <div>Age: {row.age || "—"}</div>
              <div>Diagnosis: {row.diagnosis || "—"}</div>
              <div>Recorded by: {row.done_by || "—"}</div>
              {row.action_status === "resolved" && <div>Resolved by: {row.resolved_by || "—"}</div>}
              {row.deleted && <div>Deleted by: {row.deleted_by || "—"}</div>}
            </div>
            <div className="flex flex-col gap-1">
              {(row.items ?? []).map((it, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-xs">
                  <span className="text-slate-700">{it.item}</span>
                  <span
                    className={
                      it.status === "MET"
                        ? "font-medium text-emerald-600"
                        : it.status === "NOT MET"
                        ? "font-medium text-red-600"
                        : "font-medium text-slate-400"
                    }
                  >
                    {it.status === "MET" ? "MET" : it.status === "NOT MET" ? "NOT MET" : "N/A"}
                  </span>
                </div>
              ))}
            </div>
            {row.comments && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{row.comments}</p>}
            {row.attachment_path && (
              <a
                href={attachmentUrl(row.attachment_path)}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-100"
              >
                <Paperclip className="h-3.5 w-3.5" />
                {row.attachment_name || "View attachment"}
              </a>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
