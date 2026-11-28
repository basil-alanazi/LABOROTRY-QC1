import { useEffect, useMemo, useState } from "react";
import { Award, FileSpreadsheet, Paperclip, Plus, Search, Trash2, Upload } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
import { useLanguage } from "../../lib/i18n.jsx";
import { fetchAllRows } from "../../lib/fetchAll";
import { downloadExcel } from "../../lib/exportExcel";
import { fmtDate } from "../../lib/dates";

const BUCKET = "tracker-attachments";
const todayStr = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => todayStr().slice(0, 7);

function fileUrl(path) {
  return path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null;
}

// Two IC-team-only pages share this list (stored in ic_team_records by kind):
//   award    — certificates of appreciation, best department, best employee
//   schedule — the team's duty schedule, one entry per month with its file
const KINDS = {
  award: {
    title: "Certificates & Awards",
    subtitle: "Certificates of appreciation, best department and best employee — with the certificate file.",
    categories: ["Certificate of Appreciation", "Best Department", "Best Employee"],
    personLabel: "Awarded to",
    empty: "No certificates or awards yet.",
  },
  schedule: {
    title: "Staff Schedule",
    subtitle: "The Infection Control team's duty schedule — upload each month's schedule.",
    categories: null,
    personLabel: "Staff / Team",
    empty: "No schedules yet.",
  },
};

export default function IcTeamRecords({ kind }) {
  const cfg = KINDS[kind];
  const { session } = useAuth();
  const { t } = useLanguage();
  const blank = () => ({ category: cfg.categories?.[0] || "", title: "", person: "", department: "", period: thisMonth(), record_date: todayStr(), notes: "" });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(blank);
  const [files, setFiles] = useState([]);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");

  async function loadAll() {
    setLoading(true);
    const { data } = await fetchAllRows((from, to) =>
      supabase.from("ic_team_records").select("*").eq("kind", kind).eq("deleted", false).order("period", { ascending: false }).order("created_at", { ascending: false }).range(from, to)
    );
    setRows(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    setForm(blank());
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  async function uploadFile(id, f) {
    const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, ".");
    const path = `ic-team/${kind}/${id}/${Date.now()}-${safe}`;
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
      .from("ic_team_records")
      .update({ ...patch, updated_by: session?.username, updated_at: new Date().toISOString() })
      .eq("id", r.id);
    if (err) setError("Could not save: " + err.message);
  }

  async function addRecord(e) {
    e.preventDefault();
    const title = form.title.trim() || (kind === "schedule" ? `Schedule ${form.period}` : files[0]?.name.replace(/\.[^.]+$/, "") || "");
    if (kind === "award" && !form.person.trim()) return setError(t("Enter who the award is for."));
    setBusy(true);
    setError("");
    try {
      const { data, error: err } = await supabase
        .from("ic_team_records")
        .insert({
          kind,
          category: form.category,
          title,
          person: form.person.trim(),
          department: form.department.trim(),
          period: form.period || "",
          record_date: form.record_date || null,
          notes: form.notes.trim(),
          created_by: session?.username,
        })
        .select()
        .single();
      if (err) throw err;
      let row = data;
      if (files.length) {
        const att = await Promise.all(files.map((f) => uploadFile(row.id, f)));
        await supabase.from("ic_team_records").update({ attachments: att }).eq("id", row.id);
        row = { ...row, attachments: att };
      }
      setRows((prev) => [row, ...prev]);
      setForm({ ...blank(), category: form.category, period: form.period });
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

  async function removeRecord(r) {
    if (!confirm(`${t("Delete")} "${r.title || r.person}"?`)) return;
    setRows((prev) => prev.filter((x) => x.id !== r.id));
    await supabase.from("ic_team_records").update({ deleted: true, deleted_by: session?.username, deleted_at: new Date().toISOString() }).eq("id", r.id);
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => catFilter === "all" || r.category === catFilter)
      .filter((r) => !q || `${r.title} ${r.person} ${r.department} ${r.notes}`.toLowerCase().includes(q));
  }, [rows, search, catFilter]);

  function exportExcel() {
    const headers = kind === "award" ? ["SL No", "Type", "Awarded to", "Department", "Month", "Date", "Title", "Notes"] : ["SL No", "Month", "Title", "Staff / Team", "Notes"];
    downloadExcel(`infection-control-${kind === "award" ? "awards" : "schedule"}-${todayStr()}`, [
      {
        name: kind === "award" ? "Awards" : "Schedule",
        headers,
        rows: visible.map((r, i) =>
          kind === "award" ? [i + 1, r.category, r.person, r.department, r.period, r.record_date || "", r.title, r.notes] : [i + 1, r.period, r.title, r.person, r.notes]
        ),
      },
    ]);
  }

  const catCls = { "Certificate of Appreciation": "bg-sky-50 text-sky-700", "Best Department": "bg-amber-50 text-amber-700", "Best Employee": "bg-emerald-50 text-emerald-700" };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{t(cfg.title)}</h1>
          <p className="text-sm text-slate-500">{t(cfg.subtitle)}</p>
        </div>
        <button onClick={exportExcel} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
          <FileSpreadsheet className="h-3.5 w-3.5" />
          {t("Export Excel")}
        </button>
      </div>

      <form onSubmit={addRecord} className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-6 sm:items-end">
        {cfg.categories && (
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-slate-600">{t("Type")}</span>
            <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {cfg.categories.map((c) => (
                <option key={c} value={c}>{t(c)}</option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-600">{t("Month")}</span>
          <input type="month" className="input" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} />
        </label>
        {kind === "award" ? (
          <>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-slate-600">{t(cfg.personLabel)}</span>
              <input className="input" placeholder={form.category === "Best Department" ? t("Department name") : t("Employee name")} value={form.person} onChange={(e) => setForm({ ...form, person: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-slate-600">{t("Department")}</span>
              <input className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-slate-600">{t("Date")}</span>
              <input type="date" className="input" value={form.record_date} onChange={(e) => setForm({ ...form, record_date: e.target.value })} />
            </label>
          </>
        ) : (
          <label className="flex flex-col gap-1 text-xs sm:col-span-2">
            <span className="font-medium text-slate-600">{t("Title")}</span>
            <input className="input" placeholder={t("e.g. IC team duty schedule")} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
        )}
        <label className={`flex flex-col gap-1 text-xs ${kind === "award" ? "" : "sm:col-span-2"}`}>
          <span className="font-medium text-slate-600">{kind === "award" ? t("Certificate file") : t("Schedule file")}</span>
          <input key={fileKey} type="file" multiple className="text-xs" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
        </label>
        <label className="flex flex-col gap-1 text-xs sm:col-span-5">
          <span className="font-medium text-slate-600">{t("Notes")}</span>
          <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
        <button type="submit" disabled={busy} className="flex items-center justify-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60">
          <Plus className="h-4 w-4" />
          {busy ? t("Saving...") : t("Add")}
        </button>
      </form>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input ps-9" placeholder={t("Search...")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {cfg.categories && (
          <div className="tab-bar flex rounded-lg border border-slate-200 p-0.5 text-xs w-fit">
            {["all", ...cfg.categories].map((c) => (
              <button key={c} onClick={() => setCatFilter(c)} className={`rounded-md px-3 py-1 font-medium ${catFilter === c ? "bg-teal-600 text-white" : "text-slate-500"}`}>
                {t(c === "all" ? "All" : c)}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <p className="p-6 text-center text-sm text-slate-400">{t("Loading...")}</p>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="w-12 px-3 py-2 font-medium">{t("SL No")}</th>
              {kind === "award" && <th className="px-3 py-2 font-medium">{t("Type")}</th>}
              <th className="px-3 py-2 font-medium">{t("Month")}</th>
              {kind === "award" ? (
                <>
                  <th className="px-3 py-2 font-medium">{t(cfg.personLabel)}</th>
                  <th className="px-3 py-2 font-medium">{t("Department")}</th>
                  <th className="px-3 py-2 font-medium">{t("Date")}</th>
                </>
              ) : (
                <th className="px-3 py-2 font-medium">{t("Title")}</th>
              )}
              <th className="px-3 py-2 font-medium">{t("Notes")}</th>
              <th className="px-3 py-2 font-medium">{t("Attachment")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.id} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                {kind === "award" && (
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${catCls[r.category] || "bg-slate-100 text-slate-600"}`}>
                      <Award className="h-3 w-3" />
                      {t(r.category)}
                    </span>
                  </td>
                )}
                <td className="px-3 py-2">
                  <input type="month" className="input-cell w-36" value={r.period || ""} onChange={(e) => save(r, { period: e.target.value })} />
                </td>
                {kind === "award" ? (
                  <>
                    <td className="px-3 py-2">
                      <input className="input-cell w-full min-w-[160px] font-medium" value={r.person || ""} onChange={(e) => patchLocal(r.id, { person: e.target.value })} onBlur={(e) => save(r, { person: e.target.value.trim() })} />
                    </td>
                    <td className="px-3 py-2">
                      <input className="input-cell w-full min-w-[120px]" value={r.department || ""} onChange={(e) => patchLocal(r.id, { department: e.target.value })} onBlur={(e) => save(r, { department: e.target.value.trim() })} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="date" className="input-cell w-36" title={fmtDate(r.record_date)} value={r.record_date || ""} onChange={(e) => save(r, { record_date: e.target.value || null })} />
                    </td>
                  </>
                ) : (
                  <td className="px-3 py-2">
                    <input className="input-cell w-full min-w-[200px] font-medium" value={r.title || ""} onChange={(e) => patchLocal(r.id, { title: e.target.value })} onBlur={(e) => save(r, { title: e.target.value.trim() })} />
                  </td>
                )}
                <td className="px-3 py-2">
                  <input className="input-cell w-full min-w-[160px]" value={r.notes || ""} onChange={(e) => patchLocal(r.id, { notes: e.target.value })} onBlur={(e) => save(r, { notes: e.target.value.trim() })} />
                </td>
                <td className="px-3 py-2 text-xs">
                  <div className="flex flex-col gap-1">
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
                    <label className="flex w-fit cursor-pointer items-center gap-1 font-medium text-teal-700 hover:underline">
                      <Upload className="h-3.5 w-3.5" />
                      {t("Attach")}
                      <input type="file" multiple className="hidden" onChange={(e) => e.target.files?.length && addAttachments(r, e.target.files)} />
                    </label>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <button onClick={() => removeRecord(r)} className="text-slate-400 hover:text-red-500" title={t("Delete")}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && visible.length === 0 && <p className="p-6 text-center text-sm text-slate-400">{t(cfg.empty)}</p>}
      </div>
    </div>
  );
}
