import { useState } from "react";
import { useLanguage } from "../../lib/i18n.jsx";

const SENSITIVITY_OPTIONS = ["", "S", "I", "R", "NT"];

export default function SectionedFormModal({ config, record, onSave, onCancel }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(() => ({
    header: record?.header ?? {},
    sections: config.sections.map((_, i) => record?.sections?.[i] ?? { fields: {}, checklist: {}, sensitivity: {} }),
    comments: record?.comments ?? "",
    staff_name: record?.staff_name ?? "",
  }));

  function setHeader(key, value) {
    setForm((f) => ({ ...f, header: { ...f.header, [key]: value } }));
  }
  function setSectionField(sIdx, key, value) {
    setForm((f) => ({
      ...f,
      sections: f.sections.map((s, i) => (i === sIdx ? { ...s, fields: { ...s.fields, [key]: value } } : s)),
    }));
  }
  function setChecklistValue(sIdx, key, value) {
    setForm((f) => ({
      ...f,
      sections: f.sections.map((s, i) => (i === sIdx ? { ...s, checklist: { ...s.checklist, [key]: { ...s.checklist[key], value } } } : s)),
    }));
  }
  function setChecklistDate(sIdx, key, date) {
    setForm((f) => ({
      ...f,
      sections: f.sections.map((s, i) => (i === sIdx ? { ...s, checklist: { ...s.checklist, [key]: { ...s.checklist[key], date } } } : s)),
    }));
  }
  function setSensitivity(sIdx, drug, value) {
    setForm((f) => ({
      ...f,
      sections: f.sections.map((s, i) => (i === sIdx ? { ...s, sensitivity: { ...s.sensitivity, [drug]: value } } : s)),
    }));
  }
  function toggleCheckgroup(sIdx, key, option, checked) {
    setSectionField(sIdx, key, checked ? [...(form.sections[sIdx].fields[key] ?? []), option] : (form.sections[sIdx].fields[key] ?? []).filter((o) => o !== option));
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
              {t("Department")}
              <input className="input-cell" value={form.header.department ?? ""} onChange={(e) => setHeader("department", e.target.value)} />
            </label>
          </div>

          {config.sections.map((section, sIdx) => (
            <div key={sIdx} className="mt-5">
              <p className="mb-2 text-xs font-bold text-slate-600">{t(section.title)}</p>

              {section.fields && (
                <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {section.fields.map((f) =>
                    f.type === "radio" ? (
                      <div key={f.key} className="flex flex-col gap-1 text-xs text-slate-500">
                        <span>{t(f.label)}</span>
                        <div className="flex flex-wrap gap-2">
                          {f.options.map((o) => (
                            <label key={o} className="flex items-center gap-1">
                              <input
                                type="radio"
                                name={`${sIdx}-${f.key}`}
                                checked={form.sections[sIdx].fields[f.key] === o}
                                onChange={() => setSectionField(sIdx, f.key, o)}
                              />
                              {t(o)}
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : f.type === "yesno" ? (
                      <label key={f.key} className="flex flex-col gap-1 text-xs text-slate-500">
                        {t(f.label)}
                        <select className="input-cell" value={form.sections[sIdx].fields[f.key] ?? ""} onChange={(e) => setSectionField(sIdx, f.key, e.target.value)}>
                          <option value="">{t("Select")}</option>
                          <option value="yes">{t("Yes")}</option>
                          <option value="no">{t("No")}</option>
                        </select>
                      </label>
                    ) : f.type === "checkgroup" ? (
                      <div key={f.key} className="flex flex-col gap-1 text-xs text-slate-500 sm:col-span-3">
                        <span>{t(f.label)}</span>
                        <div className="flex flex-wrap gap-2">
                          {f.options.map((o) => (
                            <label key={o} className="flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5">
                              <input
                                type="checkbox"
                                checked={(form.sections[sIdx].fields[f.key] ?? []).includes(o)}
                                onChange={(e) => toggleCheckgroup(sIdx, f.key, o, e.target.checked)}
                              />
                              {t(o)}
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <label key={f.key} className="flex flex-col gap-1 text-xs text-slate-500">
                        {t(f.label)}
                        <input type={f.type === "time" ? "time" : "text"} className="input-cell" value={form.sections[sIdx].fields[f.key] ?? ""} onChange={(e) => setSectionField(sIdx, f.key, e.target.value)} />
                      </label>
                    )
                  )}
                </div>
              )}

              {section.checklist && (
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  {section.checklist.map((item, i) => (
                    <div key={item.key} className={`flex items-center justify-between gap-2 px-3 py-1.5 text-xs ${i % 2 ? "bg-slate-50" : ""}`}>
                      <span className="text-slate-700">{t(item.label)}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        {section.withDate && (
                          <input
                            type="date"
                            className="input-cell w-32"
                            value={form.sections[sIdx].checklist[item.key]?.date ?? ""}
                            onChange={(e) => setChecklistDate(sIdx, item.key, e.target.value)}
                          />
                        )}
                        <select
                          className="input-cell w-28"
                          value={form.sections[sIdx].checklist[item.key]?.value ?? ""}
                          onChange={(e) => setChecklistValue(sIdx, item.key, e.target.value)}
                        >
                          <option value="">{t("Select")}</option>
                          {(section.checklistOptions ?? ["met", "not_met"]).map((o) => (
                            <option key={o} value={o}>
                              {t(CHECKLIST_OPTION_LABELS[o] ?? o)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {section.sensitivityDrugs && (
                <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                  {section.sensitivityDrugs.map((drug) => (
                    <div key={drug} className="flex items-center justify-between gap-2 border-b border-slate-100 py-1 text-xs">
                      <span className="text-slate-700">{drug}</span>
                      <select className="input-cell w-20" value={form.sections[sIdx].sensitivity[drug] ?? ""} onChange={(e) => setSensitivity(sIdx, drug, e.target.value)}>
                        {SENSITIVITY_OPTIONS.map((o) => (
                          <option key={o} value={o}>
                            {o || "—"}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
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

const CHECKLIST_OPTION_LABELS = {
  met: "Met",
  not_met: "Not Met",
  yes: "Yes",
  no: "No",
  not_documented: "Not documented",
  na: "N/A",
};
