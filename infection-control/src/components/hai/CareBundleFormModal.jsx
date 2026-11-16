import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useLanguage } from "../../lib/i18n.jsx";

const todayStr = () => new Date().toISOString().slice(0, 10);

function emptyDailyRow(config) {
  const row = { date: todayStr(), values: {} };
  if (config.shifts) row.shift = config.shifts[0];
  config.dailyTextFields?.forEach((f) => {
    row[f.key] = "";
  });
  return row;
}

export default function CareBundleFormModal({ config, record, onSave, onCancel }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(() => ({
    header: record?.header ?? {},
    insertion_checklist: record?.insertion_checklist ?? {},
    daily_rows: record?.daily_rows ?? [],
    comments: record?.comments ?? "",
    staff_name: record?.staff_name ?? "",
  }));

  function setHeader(key, value) {
    setForm((f) => ({ ...f, header: { ...f.header, [key]: value } }));
  }
  function setInsertion(key, value) {
    setForm((f) => ({ ...f, insertion_checklist: { ...f.insertion_checklist, [key]: value } }));
  }
  function addDailyRow() {
    setForm((f) => ({ ...f, daily_rows: [...f.daily_rows, emptyDailyRow(config)] }));
  }
  function updateDailyRow(index, patch) {
    setForm((f) => ({ ...f, daily_rows: f.daily_rows.map((r, i) => (i === index ? { ...r, ...patch } : r)) }));
  }
  function updateDailyValue(index, key, value) {
    setForm((f) => ({ ...f, daily_rows: f.daily_rows.map((r, i) => (i === index ? { ...r, values: { ...r.values, [key]: value } } : r)) }));
  }
  function removeDailyRow(index) {
    setForm((f) => ({ ...f, daily_rows: f.daily_rows.filter((_, i) => i !== index) }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onCancel}>
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
          <div>
            <h3 className="text-base font-semibold text-slate-800">{t(config.label)}</h3>
            <p className="text-xs text-slate-400">{config.code}</p>
          </div>
          <button onClick={onCancel} className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-50">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-2 text-xs font-bold text-slate-600">{t("Patient Information")}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Patient File No")}
              <input className="input-cell" value={form.header.file_no ?? ""} onChange={(e) => setHeader("file_no", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Patient Name")}
              <input className="input-cell" value={form.header.patient_name ?? ""} onChange={(e) => setHeader("patient_name", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Age")}
              <input className="input-cell" value={form.header.age ?? ""} onChange={(e) => setHeader("age", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Sex")}
              <input className="input-cell" value={form.header.sex ?? ""} onChange={(e) => setHeader("sex", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Nationality")}
              <input className="input-cell" value={form.header.nationality ?? ""} onChange={(e) => setHeader("nationality", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Treating Physician")}
              <input className="input-cell" value={form.header.treating_physician ?? ""} onChange={(e) => setHeader("treating_physician", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Department")}
              <input className="input-cell" value={form.header.department ?? ""} onChange={(e) => setHeader("department", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Area")}
              <input className="input-cell" value={form.header.area ?? ""} onChange={(e) => setHeader("area", e.target.value)} />
            </label>
          </div>

          <p className="mb-2 mt-4 text-xs font-bold text-slate-600">{t("Bundle details")}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {config.headerFields.map((f) =>
              f.type === "select" ? (
                <label key={f.key} className="flex flex-col gap-1 text-xs text-slate-500">
                  {t(f.label)}
                  <select className="input-cell" value={form.header[f.key] ?? ""} onChange={(e) => setHeader(f.key, e.target.value)}>
                    {f.options.map((o) => (
                      <option key={o} value={o}>
                        {o || t("Select")}
                      </option>
                    ))}
                  </select>
                </label>
              ) : f.type === "yesno" ? (
                <label key={f.key} className="flex flex-col gap-1 text-xs text-slate-500">
                  {t(f.label)}
                  <select className="input-cell" value={form.header[f.key] ?? ""} onChange={(e) => setHeader(f.key, e.target.value)}>
                    <option value="">{t("Select")}</option>
                    <option value="yes">{t("Yes")}</option>
                    <option value="no">{t("No")}</option>
                  </select>
                </label>
              ) : (
                <label key={f.key} className="flex flex-col gap-1 text-xs text-slate-500">
                  {t(f.label)}
                  <input type={f.type === "date" ? "date" : "text"} className="input-cell" value={form.header[f.key] ?? ""} onChange={(e) => setHeader(f.key, e.target.value)} />
                </label>
              )
            )}
          </div>

          {config.insertionChecklist && (
            <>
              <p className="mb-2 mt-4 text-xs font-bold text-slate-600">{t("Insertion checklist")}</p>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                {config.insertionChecklist.map((item, i) => (
                  <div key={item.key} className={`flex items-center justify-between gap-2 px-3 py-1.5 text-xs ${i % 2 ? "bg-slate-50" : ""}`}>
                    <span className="text-slate-700">{t(item.label)}</span>
                    <select className="input-cell w-28 shrink-0" value={form.insertion_checklist[item.key] ?? ""} onChange={(e) => setInsertion(item.key, e.target.value)}>
                      <option value="">{t("Select")}</option>
                      <option value="met">{t("Met")}</option>
                      <option value="not_met">{t("Not Met")}</option>
                      <option value="na">{t("N/A")}</option>
                    </select>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-600">{t("Daily maintenance checklist")}</p>
            <button type="button" onClick={addDailyRow} className="flex items-center gap-1 rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-teal-700">
              <Plus className="h-3.5 w-3.5" />
              {t("Add day")}
            </button>
          </div>
          <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <th className="border-b border-r border-slate-200 px-2 py-1 whitespace-nowrap">{t("Date")}</th>
                  {config.shifts && <th className="border-b border-r border-slate-200 px-2 py-1 whitespace-nowrap">{t("Shift")}</th>}
                  {config.dailyItems.map((item) => (
                    <th key={item.key} className="min-w-[8rem] border-b border-r border-slate-200 px-2 py-1 font-medium">
                      {t(item.label)}
                    </th>
                  ))}
                  {config.dailyTextFields?.map((f) => (
                    <th key={f.key} className="min-w-[6rem] border-b border-r border-slate-200 px-2 py-1 font-medium">
                      {t(f.label)}
                    </th>
                  ))}
                  <th className="border-b border-slate-200 px-2 py-1 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {form.daily_rows.map((row, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="border-r border-slate-100 px-1 py-1">
                      <input type="date" className="input-cell w-32" value={row.date ?? ""} onChange={(e) => updateDailyRow(i, { date: e.target.value })} />
                    </td>
                    {config.shifts && (
                      <td className="border-r border-slate-100 px-1 py-1">
                        <select className="input-cell w-16" value={row.shift ?? ""} onChange={(e) => updateDailyRow(i, { shift: e.target.value })}>
                          {config.shifts.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                    {config.dailyItems.map((item) => (
                      <td key={item.key} className="border-r border-slate-100 px-1 py-1">
                        <select className="input-cell w-20" value={row.values[item.key] ?? ""} onChange={(e) => updateDailyValue(i, item.key, e.target.value)}>
                          <option value="">—</option>
                          <option value="yes">{t("Yes")}</option>
                          <option value="no">{t("No")}</option>
                          <option value="na">{t("N/A")}</option>
                        </select>
                      </td>
                    ))}
                    {config.dailyTextFields?.map((f) => (
                      <td key={f.key} className="border-r border-slate-100 px-1 py-1">
                        <input className="input-cell w-24" value={row[f.key] ?? ""} onChange={(e) => updateDailyRow(i, { [f.key]: e.target.value })} />
                      </td>
                    ))}
                    <td className="px-1 py-1 text-center">
                      <button onClick={() => removeDailyRow(i)} className="text-slate-300 hover:text-red-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {form.daily_rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-3 py-3 text-center text-slate-400">
                      {t("No days added yet.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Staff Nurse Name and ID")}
              <input className="input-cell" value={form.staff_name} onChange={(e) => setForm((f) => ({ ...f, staff_name: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Comments")}
              <input className="input-cell" value={form.comments} onChange={(e) => setForm((f) => ({ ...f, comments: e.target.value }))} />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-50">
            {t("Cancel")}
          </button>
          <button onClick={() => onSave(form)} className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-700">
            {t("Save")}
          </button>
        </div>
      </div>
    </div>
  );
}
