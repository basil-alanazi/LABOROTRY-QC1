import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, FileSpreadsheet, FileText, Paperclip, Plus, Trash2, Upload } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
import { downloadExcel } from "../../lib/exportExcel";
import { downloadPdf } from "../../lib/exportPdf";

const CASE_ATTACHMENTS_BUCKET = "case-attachments";

function attachmentUrl(path) {
  if (!path) return null;
  return supabase.storage.from(CASE_ATTACHMENTS_BUCKET).getPublicUrl(path).data.publicUrl;
}

function isComplete(c) {
  return !!c.attachment1_path && (!!c.attachment2_path || c.attachment2_not_required);
}

const todayStr = () => new Date().toISOString().slice(0, 10);

const emptyForm = {
  patient_name: "",
  rh_no: "",
  status: "suspected",
  disease_type_id: "",
  disease_other: "",
  reported_at: "",
  ipc_note: "",
  attachment2_not_required: false,
};

const REPORT_HEADERS = ["Date", "Patient Name", "RH No", "Status", "Disease", "Reported To Health Authority", "Attachment Status", "IPC Note", "Recorded By"];

function toReportRow(c) {
  return [
    c.date,
    c.patient_name,
    c.rh_no,
    c.status,
    c.disease_name === "Other" ? c.disease_other : c.disease_name,
    c.reported_at || "",
    isComplete(c) ? "Complete" : "Attachment Missing",
    c.ipc_note,
    c.done_by,
  ];
}

export default function CommunicableCases() {
  const { session } = useAuth();
  const [diseaseTypes, setDiseaseTypes] = useState([]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [attachment1, setAttachment1] = useState(null);
  const [attachment2, setAttachment2] = useState(null);
  const [message, setMessage] = useState(null);
  const [expanded, setExpanded] = useState(null);

  async function loadAll() {
    setLoading(true);
    const [{ data: types }, { data: rows }] = await Promise.all([
      supabase.from("disease_types").select("*").eq("active", true).order("sort_order"),
      supabase.from("communicable_cases").select("*").eq("deleted", false).order("date", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    setDiseaseTypes(types ?? []);
    setCases(rows ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  function flash(msg) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }

  const missingCount = useMemo(() => cases.filter((c) => !isComplete(c)).length, [cases]);

  async function uploadFile(file, patientName) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${patientName || "case"}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from(CASE_ATTACHMENTS_BUCKET).upload(path, file);
    if (error) throw error;
    return { path, name: file.name };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const name = form.patient_name.trim();
    if (!name) {
      flash({ type: "error", text: "Patient name is required" });
      return;
    }
    const diseaseType = diseaseTypes.find((d) => d.id === form.disease_type_id);
    if (diseaseType?.name === "Other" && !form.disease_other.trim()) {
      flash({ type: "error", text: "Specify the disease name" });
      return;
    }

    let a1 = { path: null, name: null };
    let a2 = { path: null, name: null };
    try {
      if (attachment1) a1 = await uploadFile(attachment1, name);
      if (attachment2) a2 = await uploadFile(attachment2, name);
    } catch (err) {
      flash({ type: "error", text: "Could not upload attachment: " + err.message });
      return;
    }

    const { error } = await supabase.from("communicable_cases").insert({
      date: todayStr(),
      patient_name: name,
      rh_no: form.rh_no,
      status: form.status,
      disease_type_id: diseaseType?.id ?? null,
      disease_name: diseaseType?.name ?? "",
      disease_other: diseaseType?.name === "Other" ? form.disease_other.trim() : "",
      reported_at: form.reported_at || null,
      attachment1_path: a1.path,
      attachment1_name: a1.name,
      attachment2_path: a2.path,
      attachment2_name: a2.name,
      attachment2_not_required: form.attachment2_not_required,
      ipc_note: form.ipc_note,
      done_by: session?.username,
    });

    if (error) {
      flash({ type: "error", text: "Could not save: " + error.message });
    } else {
      flash({ type: "success", text: "Case saved" });
      setForm(emptyForm);
      setAttachment1(null);
      setAttachment2(null);
      loadAll();
    }
  }

  async function toggleNotRequired(c) {
    await supabase.from("communicable_cases").update({ attachment2_not_required: !c.attachment2_not_required }).eq("id", c.id);
    loadAll();
  }

  async function uploadMissing(c, slot, file) {
    try {
      const { path, name } = await uploadFile(file, c.patient_name);
      await supabase
        .from("communicable_cases")
        .update(slot === 1 ? { attachment1_path: path, attachment1_name: name } : { attachment2_path: path, attachment2_name: name })
        .eq("id", c.id);
      loadAll();
    } catch (err) {
      flash({ type: "error", text: "Could not upload: " + err.message });
    }
  }

  async function removeCase(c) {
    if (!confirm(`Delete the case for "${c.patient_name}"?`)) return;
    await supabase.from("communicable_cases").update({ deleted: true, deleted_by: session?.username, deleted_at: new Date().toISOString() }).eq("id", c.id);
    loadAll();
  }

  function exportExcel() {
    downloadExcel(`infection-control-cases-${todayStr()}`, [{ name: "Cases", headers: REPORT_HEADERS, rows: cases.map(toReportRow) }]);
  }

  function exportPdf() {
    downloadPdf(`infection-control-cases-${todayStr()}`, "Infection Control — Suspected/Confirmed Cases", [
      { headers: REPORT_HEADERS, rows: cases.map(toReportRow) },
    ]);
  }

  const selectedType = diseaseTypes.find((d) => d.id === form.disease_type_id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Suspected / Confirmed Cases</h1>
          <p className="text-sm text-slate-500">Track communicable disease cases and required documentation.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportExcel}
            disabled={cases.length === 0}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Export Excel
          </button>
          <button
            onClick={exportPdf}
            disabled={cases.length === 0}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <FileText className="h-3.5 w-3.5" />
            Export PDF
          </button>
        </div>
      </div>

      {missingCount > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <AlertTriangle className="h-4 w-4" />
          {missingCount} case{missingCount > 1 ? "s" : ""} with missing attachments
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">New Case</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Patient Name">
            <input className="input" value={form.patient_name} onChange={(e) => setForm({ ...form, patient_name: e.target.value })} required />
          </Field>
          <Field label="RH No">
            <input className="input" value={form.rh_no} onChange={(e) => setForm({ ...form, rh_no: e.target.value })} />
          </Field>
          <Field label="Status">
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="suspected">Suspected</option>
              <option value="confirmed">Confirmed</option>
            </select>
          </Field>
          <Field label="Disease">
            <select className="input" value={form.disease_type_id} onChange={(e) => setForm({ ...form, disease_type_id: e.target.value })}>
              <option value="">Select disease</option>
              {diseaseTypes.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          {selectedType?.name === "Other" && (
            <Field label="Specify Disease">
              <input className="input" value={form.disease_other} onChange={(e) => setForm({ ...form, disease_other: e.target.value })} required />
            </Field>
          )}
          <Field label="Reported to Health Authority">
            <input type="date" className="input" value={form.reported_at} onChange={(e) => setForm({ ...form, reported_at: e.target.value })} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Attachment 1">
            <input type="file" className="input" onChange={(e) => setAttachment1(e.target.files?.[0] ?? null)} />
          </Field>
          <Field label="Attachment 2">
            <input
              type="file"
              className="input"
              disabled={form.attachment2_not_required}
              onChange={(e) => setAttachment2(e.target.files?.[0] ?? null)}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.attachment2_not_required}
            onChange={(e) => setForm({ ...form, attachment2_not_required: e.target.checked })}
          />
          Second attachment not required for this case
        </label>

        <Field label="IPC Note">
          <textarea className="input min-h-[80px]" value={form.ipc_note} onChange={(e) => setForm({ ...form, ipc_note: e.target.value })} />
        </Field>

        {message && (
          <p className={`rounded-lg px-3 py-2 text-sm ${message.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
            {message.text}
          </p>
        )}

        <button type="submit" className="flex items-center gap-1 self-start rounded-lg bg-teal-600 px-6 py-2 text-sm font-semibold text-white hover:bg-teal-700">
          <Plus className="h-4 w-4" />
          Save Case
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Patient</th>
              <th className="px-4 py-2 font-medium">RH No</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Disease</th>
              <th className="px-4 py-2 font-medium">Attachments</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <CaseRow
                key={c.id}
                c={c}
                expanded={expanded === c.id}
                onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
                onDelete={() => removeCase(c)}
                onToggleNotRequired={() => toggleNotRequired(c)}
                onUpload={(slot, file) => uploadMissing(c, slot, file)}
              />
            ))}
          </tbody>
        </table>
        {!loading && cases.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No cases recorded</p>}
        {loading && <p className="p-6 text-center text-sm text-slate-400">Loading...</p>}
      </div>
    </div>
  );
}

function CaseRow({ c, expanded, onToggle, onDelete, onToggleNotRequired, onUpload }) {
  const complete = isComplete(c);
  return (
    <>
      <tr className="border-t border-slate-100 hover:bg-slate-50">
        <td className="px-4 py-2">{c.date}</td>
        <td className="px-4 py-2">{c.patient_name}</td>
        <td className="px-4 py-2">{c.rh_no}</td>
        <td className="px-4 py-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              c.status === "confirmed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            {c.status === "confirmed" ? "Confirmed" : "Suspected"}
          </span>
        </td>
        <td className="px-4 py-2">{c.disease_name === "Other" ? c.disease_other : c.disease_name}</td>
        <td className="px-4 py-2">
          <span
            className={`flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
              complete ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            {complete ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
            {complete ? "Complete" : "Attachment Missing"}
          </span>
        </td>
        <td className="flex items-center justify-end gap-1 px-4 py-2">
          <button onClick={onDelete} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
            <Trash2 className="h-4 w-4" />
          </button>
          <button onClick={onToggle} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-slate-100 bg-slate-50/60">
          <td colSpan={7} className="px-4 py-4">
            <div className="mb-3 grid grid-cols-2 gap-2 text-xs text-slate-500 sm:grid-cols-3">
              <div>Reported to health authority: {c.reported_at || "—"}</div>
              <div>Recorded by: {c.done_by || "—"}</div>
              {c.deleted && <div>Deleted by: {c.deleted_by || "—"}</div>}
            </div>

            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <AttachmentSlot label="Attachment 1" path={c.attachment1_path} name={c.attachment1_name} onUpload={(f) => onUpload(1, f)} />
              {c.attachment2_not_required ? (
                <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs">
                  <span className="text-slate-500">Attachment 2 — not required for this case</span>
                  <button onClick={onToggleNotRequired} className="text-teal-600 hover:underline">
                    Undo
                  </button>
                </div>
              ) : (
                <AttachmentSlot label="Attachment 2" path={c.attachment2_path} name={c.attachment2_name} onUpload={(f) => onUpload(2, f)} />
              )}
            </div>

            {!c.attachment2_path && !c.attachment2_not_required && (
              <button onClick={onToggleNotRequired} className="mb-3 text-xs text-teal-600 hover:underline">
                Mark 2nd attachment as not required for this case
              </button>
            )}

            {c.ipc_note && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{c.ipc_note}</p>}
          </td>
        </tr>
      )}
    </>
  );
}

function AttachmentSlot({ label, path, name, onUpload }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs">
      <span className="text-slate-500">{label}</span>
      {path ? (
        <a href={attachmentUrl(path)} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-teal-700 hover:underline">
          <Paperclip className="h-3.5 w-3.5" />
          {name || "View"}
        </a>
      ) : (
        <label className="flex cursor-pointer items-center gap-1 font-medium text-red-600 hover:underline">
          <Upload className="h-3.5 w-3.5" />
          Upload
          <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
        </label>
      )}
    </div>
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
