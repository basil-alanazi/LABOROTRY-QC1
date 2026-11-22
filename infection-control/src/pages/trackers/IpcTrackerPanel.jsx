import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Paperclip, Plus, Trash2, Upload } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useLanguage } from "../../lib/i18n.jsx";
import { fetchAllRows } from "../../lib/fetchAll";
import { downloadExcel } from "../../lib/exportExcel";

const BUCKET = "tracker-attachments";
// The reminder appears this many days before the next due date.
const REMIND_DAYS = 15;
const todayStr = () => new Date().toISOString().slice(0, 10);
const emptyForm = { item: "", done_on: "", next_due: "" };

function attachmentUrl(path) {
  return path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null;
}

function daysUntil(dateStr) {
  return Math.round((new Date(dateStr) - new Date(todayStr())) / 86400000);
}

// "Expired" once the next due date has passed, "Expires in N days" inside
// the last 15 days, nothing before that.
function reminder(r) {
  if (!r.due_date) return null;
  const d = daysUntil(r.due_date);
  if (d < 0) return { label: `Expired ${-d} day${d === -1 ? "" : "s"} ago`, cls: "bg-red-50 text-red-700", key: "expired" };
  if (d === 0) return { label: "Expires today", cls: "bg-red-50 text-red-700", key: "soon" };
  if (d <= REMIND_DAYS) return { label: `Expires in ${d} day${d === 1 ? "" : "s"}`, cls: "bg-amber-50 text-amber-700", key: "soon" };
  return null;
}

// IPC Tracker — recurring infection-control items: when each was last done
// and when it is next due, with a reminder from 15 days before.
// (Stored in ipc_tracker; the "next due" date is the due_date column.)
export default function IpcTrackerPanel({ session }) {
  const { t } = useLanguage();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");

  async function loadAll() {
    setLoading(true);
    const { data } = await fetchAllRows((from, to) =>
      supabase.from("ipc_tracker").select("*").eq("deleted", false).order("created_at").range(from, to)
    );
    setRows(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  function patchLocal(id, patch) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function save(r, patch) {
    patchLocal(r.id, patch);
    const { error: err } = await supabase
      .from("ipc_tracker")
      .update({ ...patch, updated_by: session?.username, updated_at: new Date().toISOString() })
      .eq("id", r.id);
    if (err) setError("Could not save: " + err.message);
  }

  async function addItem(e) {
    e.preventDefault();
    if (!form.item.trim()) return;
    setError("");
    const { data, error: err } = await supabase
      .from("ipc_tracker")
      .insert({ item: form.item.trim(), done_on: form.done_on || null, due_date: form.next_due || null, created_by: session?.username })
      .select()
      .single();
    if (err) {
      setError("Could not add: " + err.message);
      return;
    }
    setRows((prev) => [...prev, data]);
    setForm(emptyForm);
  }

  async function removeItem(r) {
    if (!confirm(`Delete "${r.item}"?`)) return;
    setRows((prev) => prev.filter((x) => x.id !== r.id));
    await supabase
      .from("ipc_tracker")
      .update({ deleted: true, deleted_by: session?.username, deleted_at: new Date().toISOString() })
      .eq("id", r.id);
  }

  async function addAttachments(r, files) {
    try {
      const uploaded = await Promise.all(
        Array.from(files).map(async (file) => {
          const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `ipc_tracker/${r.id}/${Date.now()}-${safe}`;
          const { error: err } = await supabase.storage.from(BUCKET).upload(path, file);
          if (err) throw err;
          return { path, name: file.name };
        })
      );
      await save(r, { attachments: [...(r.attachments ?? []), ...uploaded] });
    } catch (err) {
      setError("Could not upload: " + err.message);
    }
  }

  const counts = useMemo(() => {
    const c = { all: rows.length, soon: 0, expired: 0 };
    for (const r of rows) {
      const k = reminder(r)?.key;
      if (k) c[k] += 1;
    }
    return c;
  }, [rows]);

  const visible = useMemo(() => (filter === "all" ? rows : rows.filter((r) => reminder(r)?.key === filter)), [rows, filter]);

  function exportExcel() {
    downloadExcel(`infection-control-ipc-tracker-${todayStr()}`, [
      {
        name: "IPC Tracker",
        headers: ["SL No", "Item", "Done On", "Next Due", "Reminder"],
        rows: rows.map((r, i) => [i + 1, r.item, r.done_on || "", r.due_date || "", reminder(r)?.label || ""]),
      },
    ]);
  }

  const FILTERS = [
    ["all", `${t("All")} (${counts.all})`],
    ["soon", `${t("Expiring soon")} (${counts.soon})`],
    ["expired", `${t("Expired")} (${counts.expired})`],
  ];

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={addItem} className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-5 sm:items-end">
        <label className="flex flex-col gap-1 text-xs sm:col-span-2">
          <span className="font-medium text-slate-600">{t("Item")} *</span>
          <input className="input" value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-600">{t("Done On")}</span>
          <input type="date" className="input" value={form.done_on} onChange={(e) => setForm({ ...form, done_on: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-600">{t("Next Due")}</span>
          <input type="date" className="input" value={form.next_due} onChange={(e) => setForm({ ...form, next_due: e.target.value })} />
        </label>
        <button type="submit" className="flex items-center justify-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
          <Plus className="h-4 w-4" />
          {t("Add")}
        </button>
      </form>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${filter === key ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button onClick={exportExcel} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
          <FileSpreadsheet className="h-3.5 w-3.5" />
          {t("Export Excel")}
        </button>
      </div>

      {loading && <p className="p-6 text-center text-sm text-slate-400">{t("Loading...")}</p>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="w-14 px-3 py-2 font-medium">{t("SL No")}</th>
              <th className="px-3 py-2 font-medium">{t("Item")}</th>
              <th className="px-3 py-2 font-medium">{t("Done On")}</th>
              <th className="px-3 py-2 font-medium">{t("Next Due")}</th>
              <th className="px-3 py-2 font-medium">{t("Reminder")}</th>
              <th className="px-3 py-2 font-medium">{t("Attachments")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const rem = reminder(r);
              return (
                <tr key={r.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2 text-slate-500">{rows.indexOf(r) + 1}</td>
                  <td className="px-3 py-2">
                    <input
                      className="input-cell w-full min-w-[220px]"
                      value={r.item}
                      onChange={(e) => patchLocal(r.id, { item: e.target.value })}
                      onBlur={(e) => e.target.value.trim() && save(r, { item: e.target.value.trim() })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input type="date" className="input-cell w-36" value={r.done_on || ""} onChange={(e) => save(r, { done_on: e.target.value || null })} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="date" className="input-cell w-36" value={r.due_date || ""} onChange={(e) => save(r, { due_date: e.target.value || null })} />
                  </td>
                  <td className="px-3 py-2">
                    {rem ? <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${rem.cls}`}>{rem.label}</span> : <span className="text-xs text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className="flex flex-col gap-1">
                      {(r.attachments ?? []).map((a, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <a href={attachmentUrl(a.path)} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-teal-700 hover:underline">
                            <Paperclip className="h-3.5 w-3.5" />
                            {a.name}
                          </a>
                          <button onClick={() => save(r, { attachments: (r.attachments ?? []).filter((_, j) => j !== i) })} className="text-slate-400 hover:text-red-500">
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
                    <button onClick={() => removeItem(r)} className="text-slate-400 hover:text-red-500" title={t("Delete")}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && visible.length === 0 && <p className="p-6 text-center text-sm text-slate-400">{t("No items yet.")}</p>}
      </div>
    </div>
  );
}
