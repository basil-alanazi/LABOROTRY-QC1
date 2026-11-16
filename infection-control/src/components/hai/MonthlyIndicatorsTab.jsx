import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
import { useLanguage } from "../../lib/i18n.jsx";
import { downloadExcel } from "../../lib/exportExcel";
import { downloadPdf } from "../../lib/exportPdf";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtPct(v) {
  return v === null || v === undefined || Number.isNaN(v) ? "—" : `${v.toFixed(1)}%`;
}
function fmtNum(v, digits = 2) {
  return v === null || v === undefined || Number.isNaN(v) ? "—" : v.toFixed(digits);
}
function fmtTarget(v) {
  return v === null ? "—" : v ? "✓" : "✗";
}

function bundleFields() {
  return [
    { key: "bundle_done", label: "Bundle Done", type: "number" },
    { key: "total_patients", label: "Total Patients", type: "number" },
    {
      key: "bundle_compliance",
      label: "Bundle Compliance",
      type: "computed",
      compute: (d) => (Number(d.total_patients) ? (Number(d.bundle_done || 0) / Number(d.total_patients)) * 100 : null),
      format: fmtPct,
    },
    {
      key: "target_met",
      label: "Target Met (100%)",
      type: "computed",
      compute: (d) => (Number(d.total_patients) ? (Number(d.bundle_done || 0) / Number(d.total_patients)) * 100 >= 100 : null),
      format: fmtTarget,
    },
  ];
}

function deviceRateCategory(deviceLabel, rateLabel, benchmark) {
  return {
    benchmark,
    fields: [
      { key: "cases", label: `No. of ${rateLabel} cases detected`, type: "number" },
      { key: "device_days", label: deviceLabel, type: "number" },
      { key: "patient_days", label: "Total Patient Days", type: "number" },
      {
        key: "rate",
        label: `${rateLabel} Rate (per 1000 device-days)`,
        type: "computed",
        compute: (d) => (Number(d.device_days) ? (Number(d.cases || 0) / Number(d.device_days)) * 1000 : 0),
        format: (v) => fmtNum(v),
      },
      {
        key: "utilization",
        label: "Utilization Ratio",
        type: "computed",
        compute: (d) => (Number(d.patient_days) ? Number(d.device_days || 0) / Number(d.patient_days) : 0),
        format: (v) => fmtNum(v),
      },
      ...bundleFields(),
    ],
  };
}

const SURGERY_TYPE_KEYS = [
  ["appendectomy", "Appendectomy"],
  ["hernia_repair", "Hernia Repair"],
  ["laparotomy", "Laparotomy"],
  ["laparoscopy", "Laparoscopy"],
  ["lapchole", "Lap Chole"],
  ["caesarian_section", "Caesarian Section"],
  ["ureteroscopic", "Ureteroscopic Procedures"],
  ["id_procedure", "I&D"],
  ["orif", "ORIF"],
  ["others", "Others"],
];

const CATEGORIES = [
  {
    key: "hand_hygiene",
    label: "Hand Hygiene",
    fields: [
      { key: "total_opportunities", label: "Total HH Opportunities (observed)", type: "number" },
      { key: "hw", label: "HW", type: "number" },
      { key: "hr", label: "HR", type: "number" },
      { key: "total_correct", label: "Total Correct HH Actions (done correctly)", type: "number" },
      {
        key: "percent",
        label: "Total %",
        type: "computed",
        compute: (d) => (Number(d.total_opportunities) ? (Number(d.total_correct || 0) / Number(d.total_opportunities)) * 100 : null),
        format: fmtPct,
      },
    ],
  },
  { key: "clabsi_icu", label: "CLABSI — ICU", ...deviceRateCategory("Central Line Days", "CLABSI", "NHSN 0.8 · MOH 0.95") },
  { key: "cauti_icu", label: "CAUTI — ICU", ...deviceRateCategory("Urinary Catheter Days", "CAUTI", "NHSN 1.71 · MOH 0.54") },
  { key: "clabsi_nicu", label: "CLABSI — NICU", ...deviceRateCategory("Central Line Days", "CLABSI", "NHSN 0.8 · MOH 0.95") },
  { key: "vae_icu", label: "VAE — ICU", ...deviceRateCategory("Ventilator Days", "VAE", "NHSN 1.71 · MOH 0.54") },
  { key: "vae_nicu", label: "VAE — NICU", ...deviceRateCategory("Ventilator Days", "VAE", "NHSN 7.76 · MOH 2.57") },
  {
    key: "ssi_lscs",
    label: "SSI — LSCS (C-Section)",
    benchmark: "MOH 0.59%",
    fields: [
      { key: "cases", label: "No. of SSI cases detected", type: "number" },
      { key: "total_procedures", label: "Total Procedures", type: "number" },
      {
        key: "rate",
        label: "SSI Rate (%)",
        type: "computed",
        compute: (d) => (Number(d.total_procedures) ? (Number(d.cases || 0) / Number(d.total_procedures)) * 100 : 0),
        format: fmtPct,
      },
      ...bundleFields(),
    ],
  },
  {
    key: "surgery_count",
    label: "Surgery Count",
    fields: [
      ...SURGERY_TYPE_KEYS.map(([key, label]) => ({ key, label, type: "number" })),
      {
        key: "total",
        label: "No. of Surgeries",
        type: "computed",
        compute: (d) => SURGERY_TYPE_KEYS.reduce((sum, [key]) => sum + Number(d[key] || 0), 0),
        format: (v) => String(v),
      },
    ],
  },
];

const THIS_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1];

function monthStr(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
}

export default function MonthlyIndicatorsTab({ isAdmin }) {
  const { session } = useAuth();
  const { t } = useLanguage();
  const [category, setCategory] = useState(CATEGORIES[0].key);
  const [year, setYear] = useState(THIS_YEAR);
  const [rowsByMonth, setRowsByMonth] = useState({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  const activeCategory = CATEGORIES.find((c) => c.key === category);

  function flash(msg) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("hai_monthly_indicators")
        .select("*")
        .eq("category", category)
        .gte("month", `${year}-01-01`)
        .lte("month", `${year}-12-01`);
      if (cancelled) return;
      const map = {};
      (data ?? []).forEach((r) => {
        map[r.month] = r.data || {};
      });
      setRowsByMonth(map);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [category, year]);

  function fieldValue(data, key) {
    return data?.[key] ?? "";
  }

  function updateLocal(month, key, value) {
    setRowsByMonth((prev) => ({ ...prev, [month]: { ...prev[month], [key]: value } }));
  }

  async function saveMonth(month) {
    const data = rowsByMonth[month] || {};
    const { error } = await supabase
      .from("hai_monthly_indicators")
      .upsert({ category, month, data, updated_by: session?.username, updated_at: new Date().toISOString() }, { onConflict: "category,month" });
    if (error) flash({ type: "error", text: "Could not save: " + error.message });
  }

  const monthRows = useMemo(() => MONTH_LABELS.map((label, i) => ({ label, month: monthStr(year, i), data: rowsByMonth[monthStr(year, i)] || {} })), [rowsByMonth, year]);

  function exportRows() {
    const headers = ["Month", ...activeCategory.fields.map((f) => t(f.label))];
    const rows = monthRows.map((r) => [
      `${t(r.label)} ${year}`,
      ...activeCategory.fields.map((f) => (f.type === "computed" ? f.format(f.compute(r.data)) : fieldValue(r.data, f.key))),
    ]);
    return { headers, rows };
  }

  function handleExportExcel() {
    const { headers, rows } = exportRows();
    downloadExcel(`${activeCategory.key}-${year}`, [{ name: activeCategory.label.slice(0, 28), headers, rows }]);
  }
  function handleExportPdf() {
    const { headers, rows } = exportRows();
    downloadPdf(`${activeCategory.key}-${year}`, `${t(activeCategory.label)} — ${year}`, [{ title: null, headers, rows }]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <select className="input-cell w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {t(c.label)}
              </option>
            ))}
          </select>
          <select className="input-cell w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {activeCategory.benchmark && <span className="text-xs font-medium text-slate-500">{t("Benchmark")}: {activeCategory.benchmark}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportExcel} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            {t("Excel")}
          </button>
          <button onClick={handleExportPdf} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            <FileText className="h-3.5 w-3.5" />
            {t("PDF")}
          </button>
        </div>
      </div>

      {message && <p className={`rounded-lg px-3 py-2 text-sm ${message.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{message.text}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[60rem] text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              <th className="sticky left-0 z-10 border-b border-r border-slate-200 bg-slate-50 px-2 py-1.5 text-start font-medium">{t("Month")}</th>
              {activeCategory.fields.map((f) => (
                <th key={f.key} className="border-b border-slate-200 px-2 py-1.5 text-center font-medium whitespace-nowrap">
                  {t(f.label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={activeCategory.fields.length + 1} className="px-3 py-4 text-center text-slate-400">
                  {t("Loading...")}
                </td>
              </tr>
            ) : (
              monthRows.map((r) => (
                <tr key={r.month} className="border-t border-slate-100">
                  <td className="sticky left-0 z-10 border-r border-slate-100 bg-white px-2 py-1 font-medium text-slate-700">{t(r.label)}</td>
                  {activeCategory.fields.map((f) => (
                    <td key={f.key} className="border-r border-slate-50 px-1.5 py-1 text-center">
                      {f.type === "computed" ? (
                        <span className="text-slate-500">{f.format(f.compute(r.data))}</span>
                      ) : (
                        <input
                          type="number"
                          className="input-cell w-20 text-center"
                          disabled={!isAdmin}
                          value={fieldValue(r.data, f.key)}
                          onChange={(e) => updateLocal(r.month, f.key, e.target.value)}
                          onBlur={() => saveMonth(r.month)}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
