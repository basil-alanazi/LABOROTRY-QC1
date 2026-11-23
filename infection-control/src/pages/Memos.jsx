import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Paperclip, Plus, Search, Trash2, Upload } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth.jsx";
import { useLanguage } from "../lib/i18n.jsx";
import { fetchAllRows } from "../lib/fetchAll";
import { downloadExcel } from "../lib/exportExcel";
import { fmtDate } from "../lib/dates";

const BUCKET = "tracker-attachments";
const todayStr = () => new Date().toISOString().slice(0, 10);
const emptyForm = { memo_no: "", subject: "", memo_date: todayStr() };

function attachmentUrl(path) {
  return path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null;
}

// Memos — the IC department's issued / received memos: number, subject,
// date and the memo file(s). Newest first; searchable.
export default function Memos() {
  const { session } = useAuth();
  const { t } = useLanguage();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function loadAll() {
    setLoading(true);
    const { data } = await fetchAllRows((from, to) =>
      supabase.from("memos").select("*").eq("deleted", false).order("memo_date", { ascending: false }).range(from, to)
    );
    setRows(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function uploadFile(id, f) {
    const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, ".");
    const path = `memos/${id}/${Date.now()}-${safe}`;
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
      .from("memos")
      .update({ ...patch, updated_by: session?.username, updated_at: new Date().toISOString() })
      .eq("id", r.id);
    if (err) setError("Could not save: " + err.message);
  }

  async function addMemo(e) {
    e.preventDefault();
    const subject = form.subject.trim() || file?.name.replace(/\.[^.]+$/, "") || "";
    if (!subject) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: err } = await supabase
        .from("memos")
        .insert({ memo_no: form.memo_no.trim(), subject, memo_date: form.memo_date || null, created_by: session?.username })
        .select()
        .single();
      if (err) throw err;
      let row = data;
      if (file) {
        const att = [await uploadFile(row.id, file)];
        await supabase.from("memos").update({ attachments: att }).eq("id", row.id);
        row = { ...row, attachments: att };
      }
      setRows((prev) => [row, ...prev]);
      setForm({ ...emptyForm, memo_date: form.memo_date });
      setFile(null);
      setFileKey((k) => k + 1);
    } catch (err) {
      setError("Could not add: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addAttachments(r, files) {
    try {
      const uploaded = await Promise.all(Array.from(files).map((f) => uploadFile(r.id, f)));
      await save(r, { attachments: [...(r.attachments ?? []), ...uploaded] });
    } catch (err) {
      setError("Could not upload: " + err.message);
    }
  }

  async function removeMemo(r) {
    if (!confirm(`Delete "${r.subject}"?`)) return;
    setRows((prev) => prev.filter((x) => x.id !== r.id));
    await supabase.from("memos").update({ deleted: true, deleted_by: session?.username, deleted_at: new Date().toISOString() }).eq("id", r.id);
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.memo_no} ${r.subject}`.toLowerCase().includes(q));
  }, [rows, search]);

  function exportExcel() {
    downloadExcel(`infection-control-memos-${todayStr()}`, [
      {
        name: "Memos",
        headers: ["SL No", "Memo No", "Subject", "Date"],
        rows: visible.map((r, i) => [i + 1, r.memo_no || "", r.subject, r.memo_date || ""]),
      },
    ]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{t("Memo")}</h1>
          <p className="text-sm text-slate-500">{t("Infection Control memos — number, subject, date and file.")}</p>
        </div>
        <button onClick={exportExcel} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
          <FileSpreadsheet className="h-3.5 w-3.5" />
          {t("Export Excel")}
        </button>
      </div>

      <form onSubmit={addMemo} className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-6 sm:items-end">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-600">{t("Memo No")}</span>
          <input className="input" value={form.memo_no} onChange={(e) => setForm({ ...form, memo_no: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs sm:col-span-2">
          <span className="font-medium text-slate-600">{t("Subject")}</span>
          <input className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-600">{t("Date")}</span>
          <input type="date" className="input" value={form.memo_date} onChange={(e) => setForm({ ...form, memo_date: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-600">{t("Attachment")}</span>
          <input key={fileKey} type="file" className="text-xs" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
        <button type="submit" disabled={busy} className="flex items-center justify-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60">
          <Plus className="h-4 w-4" />
          {busy ? t("Saving...") : t("Add")}
        </button>
      </form>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="relative w-full sm:w-72">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="input ps-9" placeholder={t("Search memo no or subject...")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading && <p className="p-6 text-center text-sm text-slate-400">{t("Loading...")}</p>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="w-14 px-3 py-2 font-medium">{t("SL No")}</th>
              <th className="px-3 py-2 font-medium">{t("Memo No")}</th>
              <th className="px-3 py-2 font-medium">{t("Subject")}</th>
              <th className="px-3 py-2 font-medium">{t("Date")}</th>
              <th className="px-3 py-2 font-medium">{t("Attachment")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.id} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                <td className="px-3 py-2">
                  <input className="input-cell w-28" value={r.memo_no || ""} onChange={(e) => patchLocal(r.id, { memo_no: e.target.value })} onBlur={(e) => save(r, { memo_no: e.target.value.trim() })} />
                </td>
                <td className="px-3 py-2">
                  <input
                    className="input-cell w-full min-w-[260px]"
                    value={r.subject}
                    onChange={(e) => patchLocal(r.id, { subject: e.target.value })}
                    onBlur={(e) => e.target.value.trim() && save(r, { subject: e.target.value.trim() })}
                  />
                </td>
                <td className="px-3 py-2">
                  <input type="date" className="input-cell w-36" title={fmtDate(r.memo_date)} value={r.memo_date || ""} onChange={(e) => save(r, { memo_date: e.target.value || null })} />
                </td>
                <td className="px-3 py-2 text-xs">
                  <div className="flex flex-col gap-1">
                    {(r.attachments ?? []).map((a, j) => (
                      <span key={j} className="flex items-center gap-1">
                        <a href={attachmentUrl(a.path)} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-teal-700 hover:underline">
                          <Paperclip className="h-3.5 w-3.5" />
                          {a.name}
                        </a>
                        <button onClick={() => save(r, { attachments: (r.attachments ?? []).filter((_, k) => k !== j) })} className="text-slate-400 hover:text-red-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                    <label className="flex w-fit cursor-pointer items-center gap-1 font-medium text-teal-700 hover:underline">
                      <Upload className="h-3.5 w-3.5" />
                      {t("Attach")}
                      <input type="file" multiple className="hidden" onChange={(e) => e.target.files?.length && addAttachments(r, e.target.files)} />
                    </label>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <button onClick={() => removeMemo(r)} className="text-slate-400 hover:text-red-500" title={t("Delete")}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && visible.length === 0 && <p className="p-6 text-center text-sm text-slate-400">{t("No memos yet.")}</p>}
      </div>
    </div>
  );
}
