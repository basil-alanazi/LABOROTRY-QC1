import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, FileSpreadsheet, FileText, Paperclip, Plus, Trash2, Upload } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
import { downloadExcel } from "../../lib/exportExcel";
import { downloadPdf } from "../../lib/exportPdf";
import { fetchAllRows } from "../../lib/fetchAll";

const IC_ROUND_ATTACHMENTS_BUCKET = "ic-round-attachments";

function attachmentUrl(path) {
  if (!path) return null;
  return supabase.storage.from(IC_ROUND_ATTACHMENTS_BUCKET).getPublicUrl(path).data.publicUrl;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

const emptyForm = {
  date: todayStr(),
  department: "",
  result: "met",
  finding: "",
  corrective_action: "",
  date_of_discussion: "",
};

const REPORT_HEADERS = ["Date", "Department", "Result", "Finding / Observation", "Corrective Action", "Date of Discussion", "Status", "Recorded By"];

function toReportRow(r) {
  return [
    r.date,
    r.department,
    r.result === "not_met" ? "NOT MET" : "MET",
    r.finding,
    r.corrective_action,
    r.date_of_discussion || "",
    r.result === "not_met" ? (r.status === "closed" ? "Closed" : "Open") : "",
    r.done_by,
  ];
}

export default function ICRounds() {
  const { session, config } = useAuth();
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [attachment, setAttachment] = useState(null);
  const [message, setMessage] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [filterStatus, setFilterStatus] = useState("");

  const departments = config?.ic_round_departments ?? [];

  async function loadAll() {
    setLoading(true);
    const { data } = await fetchAllRows((from, to) =>
      supabase.from("ic_rounds").select("*").eq("deleted", false).order("date", { ascending: false }).order("created_at", { ascending: false }).range(from, to)
    );
    setRounds(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  function flash(msg) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }

  const openCount = useMemo(() => rounds.filter((r) => r.result === "not_met" && r.status !== "closed").length, [rounds]);
  const visibleRounds = useMemo(() => {
    if (!filterStatus) return rounds;
    if (filterStatus === "not_met") return rounds.filter((r) => r.result === "not_met");
    return rounds.filter((r) => r.result === "not_met" && r.status === filterStatus);
  }, [rounds, filterStatus]);

  async function uploadFile(file, department) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${department || "round"}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from(IC_ROUND_ATTACHMENTS_BUCKET).upload(path, file);
    if (error) throw error;
    return { path, name: file.name };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.department) {
      flash({ type: "error", text: "Department is required" });
      return;
    }
    if (form.result === "not_met" && !form.finding.trim()) {
      flash({ type: "error", text: "Finding / Observation is required for a NOT MET round" });
      return;
    }

    let a = { path: null, name: null };
    try {
      if (attachment) a = await uploadFile(attachment, form.department);
    } catch (err) {
      flash({ type: "error", text: "Could not upload attachment: " + err.message });
      return;
    }

    const { error } = await supabase.from("ic_rounds").insert({
      date: form.date,
      department: form.department,
      result: form.result,
      finding: form.result === "not_met" ? form.finding.trim() : "",
      attachment_path: a.path,
      attachment_name: a.name,
      corrective_action: form.result === "not_met" ? form.corrective_action.trim() : "",
      date_of_discussion: form.result === "not_met" ? form.date_of_discussion || null : null,
      status: "open",
      done_by: session?.username,
    });

    if (error) {
      flash({ type: "error", text: "Could not save: " + error.message });
    } else {
      flash({ type: "success", text: "Round saved" });
      setForm({ ...emptyForm, date: form.date });
      setAttachment(null);
      loadAll();
    }
  }

  function updateRoundField(id, patch) {
    setRounds((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function saveRoundFields(r) {
    await supabase
      .from("ic_rounds")
      .update({ finding: r.finding, corrective_action: r.corrective_action, date_of_discussion: r.date_of_discussion || null })
      .eq("id", r.id);
  }

  async function toggleStatus(r) {
    await supabase.from("ic_rounds").update({ status: r.status === "closed" ? "open" : "closed" }).eq("id", r.id);
    loadAll();
  }

  async function uploadMissing(r, file) {
    try {
      const { path, name } = await uploadFile(file, r.department);
      await supabase.from("ic_rounds").update({ attachment_path: path, attachment_name: name }).eq("id", r.id);
      loadAll();
    } catch (err) {
      flash({ type: "error", text: "Could not upload: " + err.message });
    }
  }

  async function removeRound(r) {
    if (!confirm(`Delete the ${r.date} round for "${r.department}"?`)) return;
    await supabase.from("ic_rounds").update({ deleted: true, deleted_by: session?.username, deleted_at: new Date().toISOString() }).eq("id", r.id);
    loadAll();
  }

  function exportExcel() {
    downloadExcel(`infection-control-ic-rounds-${todayStr()}`, [{ name: "IC Rounds", headers: REPORT_HEADERS, rows: rounds.map(toReportRow) }]);
  }

  function exportPdf() {
    downloadPdf(`infection-control-ic-rounds-${todayStr()}`, "Infection Control — Daily IC Rounds", [{ headers: REPORT_HEADERS, rows: rounds.map(toReportRow) }]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Daily IC Rounds</h1>
          <p className="text-sm text-slate-500">Quick MET / NOT MET check per department, with finding &amp; corrective-action tracking.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportExcel}
            disabled={rounds.length === 0}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Export Excel
          </button>
          <button
            onClick={exportPdf}
            disabled={rounds.length === 0}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <FileText className="h-3.5 w-3.5" />
            Export PDF
          </button>
        </div>
      </div>

      {openCount > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <AlertTriangle className="h-4 w-4" />
          {openCount} open finding{openCount > 1 ? "s" : ""} needing follow-up
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">New Round</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Date">
            <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </Field>
          <Field label="Department">
            <select className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} required>
              <option value="">Select department</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Result">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, result: "met" })}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  form.result === "met" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500"
                }`}
              >
                MET
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, result: "not_met" })}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  form.result === "not_met" ? "border-red-500 bg-red-50 text-red-700" : "border-slate-200 text-slate-500"
                }`}
              >
                NOT MET
              </button>
            </div>
          </Field>
        </div>

        {form.result === "not_met" && (
          <div className="flex flex-col gap-4 rounded-xl border border-red-100 bg-red-50/40 p-4">
            <Field label="Finding / Observation">
              <textarea className="input min-h-[70px]" value={form.finding} onChange={(e) => setForm({ ...form, finding: e.target.value })} required />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Attachment">
                <input type="file" className="input" onChange={(e) => setAttachment(e.target.files?.[0] ?? null)} />
              </Field>
              <Field label="Date of Discussion">
                <input type="date" className="input" value={form.date_of_discussion} onChange={(e) => setForm({ ...form, date_of_discussion: e.target.value })} />
              </Field>
            </div>
            <Field label="Corrective Action">
              <textarea className="input min-h-[70px]" value={form.corrective_action} onChange={(e) => setForm({ ...form, corrective_action: e.target.value })} />
            </Field>
          </div>
        )}

        {message && (
          <p className={`rounded-lg px-3 py-2 text-sm ${message.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
            {message.text}
          </p>
        )}

        <button type="submit" className="flex items-center gap-1 self-start rounded-lg bg-teal-600 px-6 py-2 text-sm font-semibold text-white hover:bg-teal-700">
          <Plus className="h-4 w-4" />
          Save Round
        </button>
      </form>

      <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs w-fit">
        {[
          { key: "", label: "All" },
          { key: "not_met", label: "NOT MET" },
          { key: "open", label: "Open" },
          { key: "closed", label: "Closed" },
        ].map((o) => (
          <button
            key={o.key}
            onClick={() => setFilterStatus(o.key)}
            className={`rounded-md px-3 py-1 font-medium ${filterStatus === o.key ? "bg-teal-600 text-white" : "text-slate-500"}`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Department</th>
              <th className="px-4 py-2 font-medium">Result</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {visibleRounds.map((r) => (
              <RoundRow
                key={r.id}
                r={r}
                expanded={expanded === r.id}
                onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                onDelete={() => removeRound(r)}
                onToggleStatus={() => toggleStatus(r)}
                onUpload={(f) => uploadMissing(r, f)}
                onFieldChange={(patch) => updateRoundField(r.id, patch)}
                onFieldSave={() => saveRoundFields(rounds.find((x) => x.id === r.id))}
              />
            ))}
          </tbody>
        </table>
        {!loading && visibleRounds.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No rounds recorded</p>}
        {loading && <p className="p-6 text-center text-sm text-slate-400">Loading...</p>}
      </div>
    </div>
  );
}

function RoundRow({ r, expanded, onToggle, onDelete, onToggleStatus, onUpload, onFieldChange, onFieldSave }) {
  const notMet = r.result === "not_met";
  return (
    <>
      <tr className="border-t border-slate-100 hover:bg-slate-50">
        <td className="px-4 py-2">{r.date}</td>
        <td className="px-4 py-2">{r.department}</td>
        <td className="px-4 py-2">
          <span className={`flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${notMet ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
            {notMet ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
            {notMet ? "NOT MET" : "MET"}
          </span>
        </td>
        <td className="px-4 py-2">
          {notMet && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.status === "closed" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700"}`}>
              {r.status === "closed" ? "Closed" : "Open"}
            </span>
          )}
        </td>
        <td className="flex items-center justify-end gap-1 px-4 py-2">
          <button onClick={onDelete} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
            <Trash2 className="h-4 w-4" />
          </button>
          {notMet && (
            <button onClick={onToggle} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
        </td>
      </tr>
      {expanded && notMet && (
        <tr className="border-t border-slate-100 bg-slate-50/60">
          <td colSpan={5} className="px-4 py-4">
            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-white px-3 py-2 text-xs">
                <p className="mb-1 font-medium text-slate-500">Finding / Observation</p>
                <textarea
                  className="input min-h-[60px] text-xs"
                  value={r.finding || ""}
                  onChange={(e) => onFieldChange({ finding: e.target.value })}
                  onBlur={onFieldSave}
                />
              </div>
              <div className="rounded-lg bg-white px-3 py-2 text-xs">
                <p className="mb-1 font-medium text-slate-500">Corrective Action</p>
                <textarea
                  className="input min-h-[60px] text-xs"
                  value={r.corrective_action || ""}
                  onChange={(e) => onFieldChange({ corrective_action: e.target.value })}
                  onBlur={onFieldSave}
                />
              </div>
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <label className="flex items-center gap-1.5">
                Date of discussion:
                <input
                  type="date"
                  className="input-cell w-32"
                  value={r.date_of_discussion || ""}
                  onChange={(e) => onFieldChange({ date_of_discussion: e.target.value })}
                  onBlur={onFieldSave}
                />
              </label>
              <span>Recorded by: {r.done_by || "—"}</span>
              <AttachmentSlot path={r.attachment_path} name={r.attachment_name} onUpload={onUpload} />
              <button
                onClick={onToggleStatus}
                className={`ml-auto rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  r.status === "closed" ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-teal-600 text-white hover:bg-teal-700"
                }`}
              >
                {r.status === "closed" ? "Reopen" : "Mark Closed"}
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function AttachmentSlot({ path, name, onUpload }) {
  return path ? (
    <a href={attachmentUrl(path)} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-teal-700 hover:underline">
      <Paperclip className="h-3.5 w-3.5" />
      {name || "View attachment"}
    </a>
  ) : (
    <label className="flex cursor-pointer items-center gap-1 font-medium text-red-600 hover:underline">
      <Upload className="h-3.5 w-3.5" />
      Upload attachment
      <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
    </label>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
