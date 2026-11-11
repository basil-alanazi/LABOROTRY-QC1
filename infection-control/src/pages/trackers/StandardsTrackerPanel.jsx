import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Paperclip, Trash2, Upload } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { fetchAllRows } from "../../lib/fetchAll";
import { downloadExcel } from "../../lib/exportExcel";

const STANDARDS_ATTACHMENTS_BUCKET = "tracker-attachments";

const STATUS_OPTIONS = ["", "Compliant", "Partially Compliant", "Non-Compliant", "Not Applicable"];
const STATUS_LABELS = {
  "": "Not Assessed",
  Compliant: "Compliant",
  "Partially Compliant": "Partially Compliant",
  "Non-Compliant": "Non-Compliant",
  "Not Applicable": "Not Applicable",
};
const STATUS_BADGE_CLASS = {
  "": "bg-slate-100 text-slate-500",
  Compliant: "bg-emerald-50 text-emerald-700",
  "Partially Compliant": "bg-amber-50 text-amber-700",
  "Non-Compliant": "bg-red-50 text-red-700",
  "Not Applicable": "bg-slate-100 text-slate-500",
};

function attachmentUrl(path) {
  if (!path) return null;
  return supabase.storage.from(STANDARDS_ATTACHMENTS_BUCKET).getPublicUrl(path).data.publicUrl;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

// Shared by the ICA Tool and CBAHI Tool tabs — both are a long, fixed list
// of regulatory standards (seeded once from the source documents) that
// staff assess and annotate over time, not a list users add entries to
// themselves like the other trackers.
export default function StandardsTrackerPanel({ table, exportName, session }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  async function loadAll() {
    setLoading(true);
    const { data } = await fetchAllRows((from, to) => supabase.from(table).select("*").eq("deleted", false).order("seq").range(from, to));
    setRows(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  function updateField(id, patch) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function saveStatus(r, status) {
    updateField(r.id, { status });
    await supabase.from(table).update({ status, updated_by: session?.username, updated_at: new Date().toISOString() }).eq("id", r.id);
  }

  async function saveNotes(r) {
    await supabase.from(table).update({ notes: r.notes, updated_by: session?.username, updated_at: new Date().toISOString() }).eq("id", r.id);
  }

  async function uploadFile(code, file) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${table}/${(code || "item").replace(/[^a-zA-Z0-9._-]/g, "_")}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from(STANDARDS_ATTACHMENTS_BUCKET).upload(path, file);
    if (error) throw error;
    return { path, name: file.name };
  }

  async function addAttachments(r, files) {
    try {
      const uploaded = await Promise.all(Array.from(files).map((f) => uploadFile(r.code, f)));
      const next = [...(r.attachments ?? []), ...uploaded];
      updateField(r.id, { attachments: next });
      await supabase.from(table).update({ attachments: next }).eq("id", r.id);
    } catch (err) {
      alert("Could not upload: " + err.message);
    }
  }

  async function removeAttachment(r, index) {
    const next = (r.attachments ?? []).filter((_, i) => i !== index);
    updateField(r.id, { attachments: next });
    await supabase.from(table).update({ attachments: next }).eq("id", r.id);
  }

  const standards = useMemo(() => rows.filter((r) => !r.is_header), [rows]);

  const counts = useMemo(() => {
    const by = { total: standards.length };
    for (const s of STATUS_OPTIONS) {
      by[s] = standards.filter((r) => (r.status || "") === s).length;
    }
    return by;
  }, [standards]);

  const visibleRows = useMemo(() => {
    if (filter === "all") return rows;
    // Keep a header visible only if at least one of its following standards
    // (up to the next header) matches the active filter — otherwise the
    // list would show empty section titles for sections with no matches.
    const kept = [];
    let pendingHeaders = [];
    for (const r of rows) {
      if (r.is_header) {
        pendingHeaders.push(r);
        continue;
      }
      if ((r.status || "") === filter) {
        kept.push(...pendingHeaders, r);
        pendingHeaders = [];
      }
    }
    return kept;
  }, [rows, filter]);

  function exportExcel() {
    downloadExcel(`infection-control-${exportName}-${todayStr()}`, [
      {
        name: exportName,
        headers: ["Code", "Standard", "Status", "Notes"],
        rows: standards.map((r) => [r.code, r.label, STATUS_LABELS[r.status || ""], r.notes || ""]),
      },
    ]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-semibold text-slate-700">{counts.total} standards</span>
          <span className="text-emerald-700">{counts["Compliant"]} compliant</span>
          <span className="text-amber-700">{counts["Partially Compliant"]} partial</span>
          <span className="text-red-700">{counts["Non-Compliant"]} non-compliant</span>
          <span className="text-slate-400">{counts["Not Applicable"]} N/A</span>
          <span className="text-slate-400">{counts[""]} not assessed</span>
        </div>
        <button onClick={exportExcel} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Export Excel
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {["all", ...STATUS_OPTIONS].map((f, i) => (
          <button
            key={i === 0 ? "all" : f || "none"}
            onClick={() => setFilter(f)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
              filter === f ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {f === "all" ? "All" : STATUS_LABELS[f]}
          </button>
        ))}
      </div>

      {loading && <p className="p-6 text-center text-sm text-slate-400">Loading...</p>}

      <div className="flex flex-col gap-2">
        {visibleRows.map((r) =>
          r.is_header ? (
            <div key={r.id} className="mt-3 flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white first:mt-0">
              <span>
                {r.code}
                {r.code && r.label ? " — " : ""}
                {r.label}
              </span>
              {r.esr && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-amber-900">ESR</span>}
            </div>
          ) : (
            <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <p className="min-w-0 flex-1 text-sm text-slate-700">
                  {r.code && <span className="mr-2 inline-block rounded bg-slate-100 px-1.5 py-0.5 align-middle text-[11px] font-mono font-semibold text-slate-500">{r.code}</span>}
                  {r.label}
                </p>
                <select
                  className={`input-cell w-full shrink-0 text-xs font-medium sm:w-44 ${STATUS_BADGE_CLASS[r.status || ""]}`}
                  value={r.status || ""}
                  onChange={(e) => saveStatus(r, e.target.value)}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  className="input-cell flex-1 text-xs"
                  placeholder="Notes / evidence..."
                  value={r.notes || ""}
                  onChange={(e) => updateField(r.id, { notes: e.target.value })}
                  onBlur={() => saveNotes(r)}
                />
                <AttachmentList attachments={r.attachments} onAdd={(files) => addAttachments(r, files)} onRemove={(i) => removeAttachment(r, i)} />
              </div>
            </div>
          )
        )}
        {!loading && visibleRows.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No standards match this filter.</p>}
      </div>
    </div>
  );
}

function AttachmentList({ attachments, onAdd, onRemove }) {
  const list = attachments ?? [];
  return (
    <div className="flex shrink-0 flex-col gap-1 text-xs">
      {list.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {list.map((a, i) => (
            <span key={i} className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-slate-600">
              <a href={attachmentUrl(a.path)} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-teal-700 hover:underline">
                <Paperclip className="h-3.5 w-3.5" />
                {a.name || "View"}
              </a>
              <button onClick={() => onRemove(i)} className="text-slate-400 hover:text-red-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <label className="flex w-fit cursor-pointer items-center gap-1 font-medium text-red-600 hover:underline">
        <Upload className="h-3.5 w-3.5" />
        {list.length > 0 ? "Add evidence" : "Attach evidence"}
        <input type="file" multiple className="hidden" onChange={(e) => e.target.files?.length && onAdd(e.target.files)} />
      </label>
    </div>
  );
}
