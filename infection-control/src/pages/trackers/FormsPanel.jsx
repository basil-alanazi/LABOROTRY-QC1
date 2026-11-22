import { useEffect, useState } from "react";
import { Paperclip, Plus, Trash2, Upload } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useLanguage } from "../../lib/i18n.jsx";
import { fetchAllRows } from "../../lib/fetchAll";

const BUCKET = "tracker-attachments";

function attachmentUrl(path) {
  return path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null;
}

// Forms — a library of blank forms (name + file) staff can open and print.
export default function FormsPanel({ session }) {
  const { t } = useLanguage();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadAll() {
    setLoading(true);
    const { data } = await fetchAllRows((from, to) => supabase.from("ipc_forms").select("*").eq("deleted", false).order("created_at").range(from, to));
    setRows(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function uploadFile(id, f) {
    const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `ipc_forms/${id}/${Date.now()}-${safe}`;
    const { error: err } = await supabase.storage.from(BUCKET).upload(path, f);
    if (err) throw err;
    return { path, name: f.name };
  }

  async function save(r, patch) {
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
    const { error: err } = await supabase
      .from("ipc_forms")
      .update({ ...patch, updated_by: session?.username, updated_at: new Date().toISOString() })
      .eq("id", r.id);
    if (err) setError("Could not save: " + err.message);
  }

  async function addForm(e) {
    e.preventDefault();
    const formName = name.trim() || file?.name.replace(/\.[^.]+$/, "") || "";
    if (!formName) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: err } = await supabase.from("ipc_forms").insert({ name: formName, created_by: session?.username }).select().single();
      if (err) throw err;
      let row = data;
      if (file) {
        const att = [await uploadFile(row.id, file)];
        await supabase.from("ipc_forms").update({ attachments: att }).eq("id", row.id);
        row = { ...row, attachments: att };
      }
      setRows((prev) => [...prev, row]);
      setName("");
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

  async function removeForm(r) {
    if (!confirm(`Delete "${r.name}"?`)) return;
    setRows((prev) => prev.filter((x) => x.id !== r.id));
    await supabase.from("ipc_forms").update({ deleted: true, deleted_by: session?.username, deleted_at: new Date().toISOString() }).eq("id", r.id);
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={addForm} className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-4 sm:items-end">
        <label className="flex flex-col gap-1 text-xs sm:col-span-2">
          <span className="font-medium text-slate-600">{t("Name of form")}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
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
      {loading && <p className="p-6 text-center text-sm text-slate-400">{t("Loading...")}</p>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="w-14 px-3 py-2 font-medium">{t("SL No")}</th>
              <th className="px-3 py-2 font-medium">{t("Name of form")}</th>
              <th className="px-3 py-2 font-medium">{t("Attachment")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                <td className="px-3 py-2">
                  <input
                    className="input-cell w-full min-w-[220px]"
                    value={r.name}
                    onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))}
                    onBlur={(e) => e.target.value.trim() && save(r, { name: e.target.value.trim() })}
                  />
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
                  <button onClick={() => removeForm(r)} className="text-slate-400 hover:text-red-500" title={t("Delete")}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <p className="p-6 text-center text-sm text-slate-400">{t("No forms yet.")}</p>}
      </div>
    </div>
  );
}
