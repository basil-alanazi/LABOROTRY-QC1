import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
import { useLanguage } from "../../lib/i18n.jsx";
import { fetchAllRows } from "../../lib/fetchAll";
import { BUNDLE_TYPES, getBundleConfig } from "../../components/hai/careBundleConfigs";
import CareBundleFormModal from "../../components/hai/CareBundleFormModal";

export default function CareBundles() {
  const { session, isAdmin } = useAuth();
  const { t } = useLanguage();
  const [bundleType, setBundleType] = useState(BUNDLE_TYPES[0].key);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // existing record, or {} for new
  const [message, setMessage] = useState(null);

  const config = getBundleConfig(bundleType);

  function flash(msg) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }

  async function load() {
    setLoading(true);
    const { data } = await fetchAllRows((from, to) =>
      supabase.from("hai_care_bundle_forms").select("*").eq("bundle_type", bundleType).eq("deleted", false).order("created_at", { ascending: false }).range(from, to)
    );
    setRows(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundleType]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (r.header?.patient_name || "").toLowerCase().includes(q) || (r.header?.file_no || "").toLowerCase().includes(q));
  }, [rows, search]);

  async function handleSave(form) {
    try {
      if (editing?.id) {
        const { error } = await supabase
          .from("hai_care_bundle_forms")
          .update({ ...form, updated_by: session?.username, updated_at: new Date().toISOString() })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hai_care_bundle_forms").insert({ ...form, bundle_type: bundleType, created_by: session?.username, updated_by: session?.username });
        if (error) throw error;
      }
      setEditing(null);
      flash({ type: "success", text: "Saved" });
      load();
    } catch (err) {
      flash({ type: "error", text: "Could not save: " + err.message });
    }
  }

  async function handleDelete(row) {
    if (!confirm(`Delete this ${t(config.label)} for ${row.header?.patient_name || "—"}?`)) return;
    await supabase.from("hai_care_bundle_forms").update({ deleted: true, deleted_by: session?.username, deleted_at: new Date().toISOString() }).eq("id", row.id);
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t("IPC Care Bundles")}</h1>
        <p className="text-sm text-slate-500">{t("Electronic versions of the hospital's device-insertion and daily-maintenance care bundle forms.")}</p>
      </div>

      {message && <p className={`rounded-lg px-3 py-2 text-sm ${message.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{message.text}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap rounded-lg border border-slate-200 p-0.5 text-xs">
          {BUNDLE_TYPES.map((b) => (
            <button
              key={b.key}
              onClick={() => setBundleType(b.key)}
              className={`rounded-md px-3 py-1 font-medium ${bundleType === b.key ? "bg-teal-600 text-white" : "text-slate-500"}`}
            >
              {t(b.label)}
            </button>
          ))}
        </div>
        <button onClick={() => setEditing({})} className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700">
          <Plus className="h-4 w-4" />
          {t("New Form")}
        </button>
      </div>

      <input className="input w-full max-w-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search patient name / file #")} />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs text-slate-500">
              <th className="border-b border-slate-200 px-3 py-2 text-start font-medium">{t("Patient Name")}</th>
              <th className="border-b border-slate-200 px-3 py-2 text-start font-medium">{t("Patient File No")}</th>
              <th className="border-b border-slate-200 px-3 py-2 text-start font-medium">{t("Department")}</th>
              <th className="border-b border-slate-200 px-3 py-2 text-start font-medium">{t("Days recorded")}</th>
              <th className="border-b border-slate-200 px-3 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-slate-400">
                  {t("Loading...")}
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-slate-400">
                  {t("No forms yet.")}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="cursor-pointer px-3 py-2" onClick={() => setEditing(row)}>
                    {row.header?.patient_name || "—"}
                  </td>
                  <td className="cursor-pointer px-3 py-2" onClick={() => setEditing(row)}>
                    {row.header?.file_no || "—"}
                  </td>
                  <td className="cursor-pointer px-3 py-2" onClick={() => setEditing(row)}>
                    {row.header?.department || "—"}
                  </td>
                  <td className="cursor-pointer px-3 py-2" onClick={() => setEditing(row)}>
                    {(row.daily_rows ?? []).length}
                  </td>
                  <td className="px-3 py-2 text-end">
                    {isAdmin && (
                      <button onClick={() => handleDelete(row)} className="text-slate-300 hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && <CareBundleFormModal config={config} record={editing.id ? editing : null} onSave={handleSave} onCancel={() => setEditing(null)} />}
    </div>
  );
}
