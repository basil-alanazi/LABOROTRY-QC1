import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { ChevronDown, ChevronRight, Download, FileSpreadsheet, Paperclip, Plus, Printer, QrCode, Search, Trash2, Upload, Users } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
import { useLanguage } from "../../lib/i18n.jsx";
import { fetchAllRows } from "../../lib/fetchAll";
import { downloadExcel } from "../../lib/exportExcel";
import { fmtDate } from "../../lib/dates";

const BUCKET = "tracker-attachments";
const todayStr = () => new Date().toISOString().slice(0, 10);
const emptyForm = { title: "", presenter: "", lecture_date: todayStr(), location: "", audience: "" };

function fileUrl(path) {
  return path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null;
}
export function attendUrl(id) {
  return `${window.location.origin}/lecture/${id}`;
}

// Lectures — the IC team's lectures (slides/files) and, for each one, the
// attendance staff record themselves by scanning its QR code: employee
// number, name and signature. IC team only.
export default function Lectures() {
  const { session } = useAuth();
  const { t } = useLanguage();
  const [rows, setRows] = useState([]);
  const [attendance, setAttendance] = useState({}); // lecture id -> rows
  const [open, setOpen] = useState(null);
  const [qr, setQr] = useState(null); // {lecture, dataUrl}
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [files, setFiles] = useState([]);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function loadAll() {
    setLoading(true);
    const [{ data: lectures }, { data: att }] = await Promise.all([
      fetchAllRows((from, to) => supabase.from("lectures").select("*").eq("deleted", false).order("lecture_date", { ascending: false }).range(from, to)),
      fetchAllRows((from, to) => supabase.from("lecture_attendance").select("*").order("created_at").range(from, to)),
    ]);
    const byLecture = {};
    for (const a of att ?? []) (byLecture[a.lecture_id] ||= []).push(a);
    setRows(lectures ?? []);
    setAttendance(byLecture);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function uploadFile(id, f) {
    const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, ".");
    const path = `lectures/${id}/${Date.now()}-${safe}`;
    const { error: err } = await supabase.storage.from(BUCKET).upload(path, f);
    if (err) throw err;
    return { path, name: f.name };
  }

  function patchLocal(id, patch) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function save(r, patch) {
    patchLocal(r.id, patch);
    const { error: err } = await supabase
      .from("lectures")
      .update({ ...patch, updated_by: session?.username, updated_at: new Date().toISOString() })
      .eq("id", r.id);
    if (err) setError("Could not save: " + err.message);
  }

  async function addLecture(e) {
    e.preventDefault();
    const title = form.title.trim() || files[0]?.name.replace(/\.[^.]+$/, "") || "";
    if (!title) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: err } = await supabase
        .from("lectures")
        .insert({
          title,
          presenter: form.presenter.trim(),
          lecture_date: form.lecture_date || null,
          location: form.location.trim(),
          audience: form.audience.trim(),
          created_by: session?.username,
        })
        .select()
        .single();
      if (err) throw err;
      let row = data;
      if (files.length) {
        const att = await Promise.all(files.map((f) => uploadFile(row.id, f)));
        await supabase.from("lectures").update({ attachments: att }).eq("id", row.id);
        row = { ...row, attachments: att };
      }
      setRows((prev) => [row, ...prev]);
      setForm({ ...emptyForm, lecture_date: form.lecture_date });
      setFiles([]);
      setFileKey((k) => k + 1);
    } catch (err) {
      setError("Could not add: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addAttachments(r, list) {
    try {
      const uploaded = await Promise.all(Array.from(list).map((f) => uploadFile(r.id, f)));
      await save(r, { attachments: [...(r.attachments ?? []), ...uploaded] });
    } catch (err) {
      setError("Could not upload: " + err.message);
    }
  }

  async function removeLecture(r) {
    if (!confirm(`${t("Delete")} "${r.title}"?`)) return;
    setRows((prev) => prev.filter((x) => x.id !== r.id));
    await supabase.from("lectures").update({ deleted: true, deleted_by: session?.username, deleted_at: new Date().toISOString() }).eq("id", r.id);
  }

  async function removeAttendee(a) {
    if (!confirm(`${t("Remove")} ${a.employee_name || a.employee_no}?`)) return;
    const { error: err } = await supabase.from("lecture_attendance").delete().eq("id", a.id);
    if (err) return setError("Could not remove: " + err.message);
    setAttendance((m) => ({ ...m, [a.lecture_id]: (m[a.lecture_id] ?? []).filter((x) => x.id !== a.id) }));
  }

  async function showQr(r) {
    const dataUrl = await QRCode.toDataURL(attendUrl(r.id), { width: 480, margin: 1 });
    setQr({ lecture: r, dataUrl });
  }

  function printQr() {
    const w = window.open("", "_blank");
    if (!w) return;
    const { lecture, dataUrl } = qr;
    w.document.write(`<!doctype html><html><head><title>Attendance — ${lecture.title}</title>
      <style>body{font-family:sans-serif;text-align:center;padding:40px}img{width:320px;height:320px}h1{font-size:22px;margin:0 0 6px}p{color:#555;margin:4px 0}</style></head>
      <body><h1>${lecture.title.replace(/</g, "&lt;")}</h1><p>${fmtDate(lecture.lecture_date) || ""}${lecture.presenter ? " · " + lecture.presenter.replace(/</g, "&lt;") : ""}</p>
      <img src="${dataUrl}" alt="QR"><p><b>Scan to sign the attendance</b></p><p>Infection Control — Rabia Hospital</p>
      <script>window.onload=()=>{window.print()}</script></body></html>`);
    w.document.close();
  }

  function exportAttendance(r) {
    const list = attendance[r.id] ?? [];
    downloadExcel(`lecture-attendance-${(r.lecture_date || "").slice(0, 10)}-${r.title.slice(0, 30)}`, [
      {
        name: "Attendance",
        headers: ["No", "Employee No", "Name", "Department", "Signed At"],
        rows: list.map((a, i) => [i + 1, a.employee_no, a.employee_name, a.department, (a.created_at || "").replace("T", " ").slice(0, 16)]),
      },
    ]);
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.title} ${r.presenter} ${r.location} ${r.audience}`.toLowerCase().includes(q));
  }, [rows, search]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t("Lectures & Attendance")}</h1>
        <p className="text-sm text-slate-500">{t("Upload lectures, print the attendance QR, and staff sign in with their employee number and signature.")}</p>
      </div>

      <form onSubmit={addLecture} className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-6 sm:items-end">
        <label className="flex flex-col gap-1 text-xs sm:col-span-2">
          <span className="font-medium text-slate-600">{t("Lecture title")}</span>
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-600">{t("Presenter")}</span>
          <input className="input" value={form.presenter} onChange={(e) => setForm({ ...form, presenter: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-600">{t("Date")}</span>
          <input type="date" className="input" value={form.lecture_date} onChange={(e) => setForm({ ...form, lecture_date: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-600">{t("Location")}</span>
          <input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-600">{t("Target staff")}</span>
          <input className="input" placeholder={t("e.g. Nurses")} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs sm:col-span-4">
          <span className="font-medium text-slate-600">{t("Lecture files (slides, PDF, video)")}</span>
          <input key={fileKey} type="file" multiple className="text-xs" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
        </label>
        <button type="submit" disabled={busy} className="flex items-center justify-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60 sm:col-span-2">
          <Plus className="h-4 w-4" />
          {busy ? t("Saving...") : t("Add lecture")}
        </button>
      </form>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="relative w-full sm:w-72">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="input ps-9" placeholder={t("Search lectures...")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading && <p className="p-6 text-center text-sm text-slate-400">{t("Loading...")}</p>}

      <div className="flex flex-col gap-3">
        {visible.map((r) => {
          const list = attendance[r.id] ?? [];
          const isOpen = open === r.id;
          return (
            <div key={r.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-start gap-3 p-4">
                <button onClick={() => setOpen(isOpen ? null : r.id)} className="mt-1 text-slate-400 hover:text-slate-700" aria-label={t("Attendance")}>
                  {isOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </button>
                <div className="flex min-w-[240px] flex-1 flex-col gap-1">
                  <input
                    className="input-cell w-full text-base font-semibold text-slate-800"
                    value={r.title}
                    onChange={(e) => patchLocal(r.id, { title: e.target.value })}
                    onBlur={(e) => e.target.value.trim() && save(r, { title: e.target.value.trim() })}
                  />
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <input type="date" className="input-cell w-36" value={r.lecture_date || ""} onChange={(e) => save(r, { lecture_date: e.target.value || null })} />
                    <input className="input-cell w-40" placeholder={t("Presenter")} value={r.presenter || ""} onChange={(e) => patchLocal(r.id, { presenter: e.target.value })} onBlur={(e) => save(r, { presenter: e.target.value.trim() })} />
                    <input className="input-cell w-36" placeholder={t("Location")} value={r.location || ""} onChange={(e) => patchLocal(r.id, { location: e.target.value })} onBlur={(e) => save(r, { location: e.target.value.trim() })} />
                    <input className="input-cell w-36" placeholder={t("Target staff")} value={r.audience || ""} onChange={(e) => patchLocal(r.id, { audience: e.target.value })} onBlur={(e) => save(r, { audience: e.target.value.trim() })} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                    {(r.attachments ?? []).map((a, j) => (
                      <span key={j} className="flex items-center gap-1">
                        <a href={fileUrl(a.path)} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-teal-700 hover:underline">
                          <Paperclip className="h-3.5 w-3.5" />
                          {a.name}
                        </a>
                        <button onClick={() => save(r, { attachments: (r.attachments ?? []).filter((_, k) => k !== j) })} className="text-slate-400 hover:text-red-500" title={t("Delete")}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                    <label className="flex cursor-pointer items-center gap-1 font-medium text-teal-700 hover:underline">
                      <Upload className="h-3.5 w-3.5" />
                      {t("Attach")}
                      <input type="file" multiple className="hidden" onChange={(e) => e.target.files?.length && addAttachments(r, e.target.files)} />
                    </label>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => setOpen(isOpen ? null : r.id)} className="flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200">
                    <Users className="h-3.5 w-3.5" />
                    {list.length} {t("attended")}
                  </button>
                  <button onClick={() => showQr(r)} className="flex items-center gap-1 rounded-lg border border-teal-600 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-50">
                    <QrCode className="h-3.5 w-3.5" />
                    {t("Attendance QR")}
                  </button>
                  <button onClick={() => removeLecture(r)} className="text-slate-400 hover:text-red-500" title={t("Delete")}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-slate-100 px-4 pb-4">
                  <div className="flex items-center justify-between py-2">
                    <p className="text-sm font-semibold text-slate-700">{t("Attendance")} ({list.length})</p>
                    <button onClick={() => exportAttendance(r)} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      {t("Export Excel")}
                    </button>
                  </div>
                  {list.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-400">{t("No one has signed yet. Print the QR and put it at the lecture.")}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-left text-sm">
                        <thead className="bg-slate-50 text-xs text-slate-500">
                          <tr>
                            <th className="w-10 px-2 py-1.5 font-medium">#</th>
                            <th className="px-2 py-1.5 font-medium">{t("Employee No.")}</th>
                            <th className="px-2 py-1.5 font-medium">{t("Name")}</th>
                            <th className="px-2 py-1.5 font-medium">{t("Department")}</th>
                            <th className="px-2 py-1.5 font-medium">{t("Signed At")}</th>
                            <th className="px-2 py-1.5 font-medium">{t("Signature")}</th>
                            <th className="px-2 py-1.5" />
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((a, i) => (
                            <tr key={a.id} className="border-t border-slate-100">
                              <td className="px-2 py-1.5 text-slate-500">{i + 1}</td>
                              <td className="px-2 py-1.5 font-mono text-xs">{a.employee_no}</td>
                              <td className="px-2 py-1.5">{a.employee_name}</td>
                              <td className="px-2 py-1.5 text-slate-600">{a.department}</td>
                              <td className="px-2 py-1.5 text-xs text-slate-500">{fmtDate(a.created_at)} {(a.created_at || "").slice(11, 16)}</td>
                              <td className="px-2 py-1.5">{a.signature_path ? <img src={fileUrl(a.signature_path)} alt="" className="h-10 w-auto rounded border border-slate-100 bg-white" /> : "—"}</td>
                              <td className="px-2 py-1.5">
                                <button onClick={() => removeAttendee(a)} className="text-slate-400 hover:text-red-500" title={t("Remove")}>
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!loading && visible.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">{t("No lectures yet.")}</p>}
      </div>

      {qr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={() => setQr(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-slate-800">{qr.lecture.title}</p>
            <p className="text-xs text-slate-500">{fmtDate(qr.lecture.lecture_date)}</p>
            <img src={qr.dataUrl} alt="QR" className="mx-auto my-3 h-64 w-64" />
            <p className="break-all text-[11px] text-slate-400">{attendUrl(qr.lecture.id)}</p>
            <div className="mt-4 flex justify-center gap-2">
              <button onClick={printQr} className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700">
                <Printer className="h-4 w-4" />
                {t("Print")}
              </button>
              <a href={qr.dataUrl} download={`attendance-qr-${qr.lecture.title.slice(0, 30)}.png`} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                <Download className="h-4 w-4" />
                {t("Download")}
              </a>
              <button onClick={() => setQr(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">{t("Close")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
