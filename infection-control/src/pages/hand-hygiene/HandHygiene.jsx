import { useEffect, useMemo, useState } from "react";
import { Droplets, FileSpreadsheet, FileText, Paperclip, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
import { useLanguage } from "../../lib/i18n.jsx";
import { downloadExcel } from "../../lib/exportExcel";
import { downloadPdf } from "../../lib/exportPdf";
import { fetchAllRows } from "../../lib/fetchAll";

const HH_ATTACHMENTS_BUCKET = "hh-attachments";

function attachmentUrl(path) {
  if (!path) return null;
  return supabase.storage.from(HH_ATTACHMENTS_BUCKET).getPublicUrl(path).data.publicUrl;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

const OBSERVER_SUGGESTIONS = ["Doctor", "Nurse", "Housekeeping", "Other"];

// Matches the official WHO Hand Hygiene Observation Form exactly: one page
// holds up to 4 Prof.cat columns (one observed worker each), each with 8
// numbered opportunities — every opportunity is a real checkmark (Indication
// + HH Action), never a pre-counted number, mirroring how the paper form is
// actually filled in.
const INDICATIONS = [
  { key: "bef_pat", label: "bef-pat." },
  { key: "bef_asept", label: "bef-asept." },
  { key: "aft_bf", label: "aft-b.f." },
  { key: "aft_pat", label: "aft-pat." },
  { key: "aft_surr", label: "aft.p.surr." },
];
const OPP_ROWS = 8;
const PROF_COLUMNS = 4;

function emptyOpp() {
  return { bef_pat: false, bef_asept: false, aft_bf: false, aft_pat: false, aft_surr: false, hr: false, hw: false, missed: false, gloves: false };
}
function emptyColumn() {
  return { prof_cat: "", code: "", no: "", opps: Array.from({ length: OPP_ROWS }, emptyOpp) };
}
function emptySessionForm() {
  return { date: todayStr(), department: "", time_from: "", time_to: "", columns: Array.from({ length: PROF_COLUMNS }, emptyColumn) };
}

function columnHasData(col) {
  return !!col.prof_cat.trim() || col.opps.some((o) => Object.values(o).some(Boolean));
}

function computeColumnTotals(col) {
  const count = (key) => col.opps.filter((o) => o[key]).length;
  const before_touching_patient = count("bef_pat");
  const before_clean_procedure = count("bef_asept");
  const after_body_fluid_risk = count("aft_bf");
  const after_touching_patient = count("aft_pat");
  const after_touching_surroundings = count("aft_surr");
  const hand_rub = count("hr");
  const hand_wash = count("hw");
  const missed = count("missed");
  const wearing_glove = count("gloves");
  const total_opportunities = hand_rub + hand_wash + missed;
  const compliant = hand_rub + hand_wash;
  const compliance_pct = total_opportunities > 0 ? Number(((compliant / total_opportunities) * 100).toFixed(1)) : null;
  return {
    before_touching_patient, before_clean_procedure, after_body_fluid_risk, after_touching_patient, after_touching_surroundings,
    hand_rub, hand_wash, missed, wearing_glove, total_opportunities, compliant, compliance_pct,
  };
}

const REPORT_HEADERS = [
  "Date", "Department", "Observer", "Time From", "Time To",
  "Before Patient Contact", "Before Aseptic Procedure", "After Body Fluid Exposure Risk", "After Patient Contact", "After Touching Surroundings",
  "Hand Rub", "Hand Wash", "Missed", "Wearing Glove", "Total Opportunities", "Compliant", "Compliance %", "Recorded By",
];

function toReportRow(r) {
  return [
    r.date, r.department, r.observer, r.time_from || "", r.time_to || "",
    r.before_touching_patient ?? "", r.before_clean_procedure ?? "", r.after_body_fluid_risk ?? "", r.after_touching_patient ?? "", r.after_touching_surroundings ?? "",
    r.hand_rub ?? "", r.hand_wash ?? "", r.missed ?? "", r.wearing_glove ?? "", r.total_opportunities, r.compliant, r.compliance_pct ?? "", r.done_by,
  ];
}

export default function HandHygiene() {
  const { session, config } = useAuth();
  const { t } = useLanguage();
  const [observations, setObservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptySessionForm);
  const [newAttachment, setNewAttachment] = useState(null);
  const [message, setMessage] = useState(null);
  const [filterDept, setFilterDept] = useState("");
  const [reportMonth, setReportMonth] = useState(() => todayStr().slice(0, 7));

  const departments = config?.ic_round_departments ?? [];

  async function loadAll() {
    setLoading(true);
    const { data } = await fetchAllRows((from, to) =>
      supabase.from("hh_observations").select("*").eq("deleted", false).order("date", { ascending: false }).order("created_at", { ascending: false }).range(from, to)
    );
    setObservations(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  function flash(msg) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }

  const visibleObservations = useMemo(
    () => (filterDept ? observations.filter((o) => o.department === filterDept) : observations),
    [observations, filterDept]
  );

  const avgCompliance = useMemo(() => {
    const withPct = visibleObservations.filter((o) => o.compliance_pct != null);
    if (withPct.length === 0) return null;
    return (withPct.reduce((sum, o) => sum + Number(o.compliance_pct), 0) / withPct.length).toFixed(1);
  }, [visibleObservations]);

  const monthlyReport = useMemo(() => {
    const rows = observations.filter((o) => o.date?.slice(0, 7) === reportMonth);
    const totalObservations = rows.length;
    const totalOpportunities = rows.reduce((s, o) => s + (o.total_opportunities || 0), 0);
    const totalCompliant = rows.reduce((s, o) => s + (o.compliant || 0), 0);
    const totalMissed = rows.reduce((s, o) => s + (o.missed || 0), 0);
    const overallPct = totalOpportunities > 0 ? Number(((totalCompliant / totalOpportunities) * 100).toFixed(1)) : null;

    const byDept = {};
    rows.forEach((o) => {
      const d = o.department || "—";
      if (!byDept[d]) byDept[d] = { department: d, observations: 0, opportunities: 0, compliant: 0, missed: 0 };
      byDept[d].observations += 1;
      byDept[d].opportunities += o.total_opportunities || 0;
      byDept[d].compliant += o.compliant || 0;
      byDept[d].missed += o.missed || 0;
    });
    const deptStats = Object.values(byDept)
      .map((d) => ({ ...d, compliance_pct: d.opportunities > 0 ? Number(((d.compliant / d.opportunities) * 100).toFixed(1)) : null }))
      .sort((a, b) => (b.compliance_pct ?? -1) - (a.compliance_pct ?? -1));
    const withData = deptStats.filter((d) => d.opportunities > 0);
    const best = withData[0] ?? null;
    const worst = withData.length > 1 ? withData[withData.length - 1] : null;

    return { totalObservations, totalOpportunities, totalCompliant, totalMissed, overallPct, deptStats, best, worst };
  }, [observations, reportMonth]);

  function exportMonthlyExcel() {
    downloadExcel(`infection-control-hand-hygiene-report-${reportMonth}`, [
      {
        name: "Monthly Report",
        headers: ["Department", "Observations", "Opportunities", "Compliant", "Missed", "Compliance %"],
        rows: monthlyReport.deptStats.map((d) => [d.department, d.observations, d.opportunities, d.compliant, d.missed, d.compliance_pct ?? ""]),
      },
    ]);
  }

  function exportMonthlyPdf() {
    downloadPdf(`infection-control-hand-hygiene-report-${reportMonth}`, `Infection Control — Hand Hygiene Monthly Report (${reportMonth})`, [
      {
        headers: ["Department", "Observations", "Opportunities", "Compliant", "Missed", "Compliance %"],
        rows: monthlyReport.deptStats.map((d) => [d.department, d.observations, d.opportunities, d.compliant, d.missed, d.compliance_pct ?? ""]),
      },
    ]);
  }

  async function uploadFile(file, department) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${department || "session"}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from(HH_ATTACHMENTS_BUCKET).upload(path, file);
    if (error) throw error;
    return { path, name: file.name };
  }

  function toggleOpp(colIndex, oppIndex, field) {
    setForm((f) => ({
      ...f,
      columns: f.columns.map((col, ci) =>
        ci !== colIndex ? col : { ...col, opps: col.opps.map((o, oi) => (oi !== oppIndex ? o : { ...o, [field]: !o[field] })) }
      ),
    }));
  }

  function updateColumnField(colIndex, patch) {
    setForm((f) => ({ ...f, columns: f.columns.map((col, ci) => (ci === colIndex ? { ...col, ...patch } : col)) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.department) {
      flash({ type: "error", text: "Department is required" });
      return;
    }
    const activeColumns = form.columns.filter(columnHasData);
    if (activeColumns.length === 0) {
      flash({ type: "error", text: "Check at least one opportunity in a Prof.cat column first" });
      return;
    }
    if (activeColumns.some((col) => !col.prof_cat.trim())) {
      flash({ type: "error", text: "Every column with a checkmark needs a Prof.cat name" });
      return;
    }

    let attachment = null;
    if (newAttachment) {
      try {
        attachment = await uploadFile(newAttachment, form.department);
      } catch (err) {
        flash({ type: "error", text: "Could not upload attachment: " + err.message });
        return;
      }
    }

    const rows = activeColumns.map((col) => {
      const t = computeColumnTotals(col);
      const observer = [col.prof_cat.trim(), col.code.trim() && `Code: ${col.code.trim()}`, col.no.trim() && `N°: ${col.no.trim()}`]
        .filter(Boolean)
        .join(" · ");
      return {
        date: form.date,
        department: form.department,
        observer,
        time_from: form.time_from || null,
        time_to: form.time_to || null,
        attachment_path: attachment?.path ?? null,
        attachment_name: attachment?.name ?? null,
        ...t,
        done_by: session?.username,
      };
    });

    const { error } = await supabase.from("hh_observations").insert(rows);

    if (error) {
      flash({ type: "error", text: "Could not save: " + error.message });
    } else {
      flash({ type: "success", text: `${rows.length} observation${rows.length > 1 ? "s" : ""} saved` });
      setForm({ ...emptySessionForm(), date: form.date, department: form.department });
      setNewAttachment(null);
      loadAll();
    }
  }

  async function removeObservation(o) {
    if (!confirm(`Delete the ${o.date} observation for "${o.department}" (${o.observer})?`)) return;
    await supabase.from("hh_observations").update({ deleted: true, deleted_by: session?.username, deleted_at: new Date().toISOString() }).eq("id", o.id);
    loadAll();
  }

  function exportExcel() {
    downloadExcel(`infection-control-hand-hygiene-${todayStr()}`, [{ name: "Hand Hygiene", headers: REPORT_HEADERS, rows: visibleObservations.map(toReportRow) }]);
  }

  function exportPdf() {
    downloadPdf(`infection-control-hand-hygiene-${todayStr()}`, "Infection Control — Hand Hygiene Observation", [
      { headers: REPORT_HEADERS, rows: visibleObservations.map(toReportRow) },
    ]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{t("Hand Hygiene")}</h1>
          <p className="text-sm text-slate-500">{t("WHO 5 Moments hand-hygiene observation — Indication, HH Action (Hand Rub/Hand Wash/Missed), and glove use per session.")}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportExcel}
            disabled={visibleObservations.length === 0}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            {t("Export Excel")}
          </button>
          <button
            onClick={exportPdf}
            disabled={visibleObservations.length === 0}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <FileText className="h-3.5 w-3.5" />
            {t("Export PDF")}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-700">{t("Monthly Report")}</h2>
          <div className="flex items-center gap-2">
            <input type="month" className="input w-40" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} />
            <button
              onClick={exportMonthlyExcel}
              disabled={monthlyReport.totalObservations === 0}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {t("Excel")}
            </button>
            <button
              onClick={exportMonthlyPdf}
              disabled={monthlyReport.totalObservations === 0}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <FileText className="h-3.5 w-3.5" />
              {t("PDF")}
            </button>
          </div>
        </div>

        {monthlyReport.totalObservations === 0 ? (
          <p className="text-sm text-slate-400">{t("No observations recorded for this month.")}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label={t("Observations")} value={monthlyReport.totalObservations} />
              <StatTile label={t("Opportunities")} value={monthlyReport.totalOpportunities} />
              <StatTile
                label={t("Compliant (Success)")}
                value={`${monthlyReport.totalCompliant}${monthlyReport.overallPct != null ? ` (${monthlyReport.overallPct}%)` : ""}`}
                tone="good"
              />
              <StatTile label={t("Missed (Failed)")} value={monthlyReport.totalMissed} tone="bad" />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {monthlyReport.best && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  <span className="font-medium text-emerald-800">
                    {t("Best department: ")}<b>{monthlyReport.best.department}</b> ({monthlyReport.best.compliance_pct}%)
                  </span>
                </div>
              )}
              {monthlyReport.worst && (
                <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm">
                  <TrendingDown className="h-4 w-4 text-red-600" />
                  <span className="font-medium text-red-800">
                    {t("Worst department: ")}<b>{monthlyReport.worst.department}</b> ({monthlyReport.worst.compliance_pct}%)
                  </span>
                </div>
              )}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t("Department")}</th>
                    <th className="px-3 py-2 font-medium">{t("Observations")}</th>
                    <th className="px-3 py-2 font-medium">{t("Opportunities")}</th>
                    <th className="px-3 py-2 font-medium">{t("Compliant")}</th>
                    <th className="px-3 py-2 font-medium">{t("Missed")}</th>
                    <th className="px-3 py-2 font-medium">{t("Compliance")}</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyReport.deptStats.map((d) => (
                    <tr key={d.department} className="border-t border-slate-100">
                      <td className="px-3 py-1.5">{d.department}</td>
                      <td className="px-3 py-1.5">{d.observations}</td>
                      <td className="px-3 py-1.5">{d.opportunities}</td>
                      <td className="px-3 py-1.5">{d.compliant}</td>
                      <td className="px-3 py-1.5">{d.missed}</td>
                      <td className="px-3 py-1.5">
                        {d.compliance_pct != null ? (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${d.compliance_pct < 80 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                            {d.compliance_pct}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <datalist id="hh-observer-suggestions">
          {OBSERVER_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <h2 className="text-sm font-semibold text-slate-700">{t("New Observation")}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("Date")}>
            <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </Field>
          <Field label={t("Department / Ward")}>
            <select className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} required>
              <option value="">{t("Select department")}</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </Field>
          <Field label={t("Start Time")}>
            <input type="time" className="input" value={form.time_from} onChange={(e) => setForm({ ...form, time_from: e.target.value })} />
          </Field>
          <Field label={t("End Time")}>
            <input type="time" className="input" value={form.time_to} onChange={(e) => setForm({ ...form, time_to: e.target.value })} />
          </Field>
        </div>

        <p className="text-xs text-slate-500">
          {t("Fill in a Prof.cat column for each worker observed this session, then check off each numbered opportunity exactly like the paper form — Total Opportunities/Compliant/Compliance% are tallied automatically from your checkmarks when you save.")}
        </p>

        <div className="grid grid-cols-1 gap-3 overflow-x-auto sm:grid-cols-2 xl:grid-cols-4">
          {form.columns.map((col, ci) => (
            <ProfCatColumn key={ci} col={col} onFieldChange={(patch) => updateColumnField(ci, patch)} onToggleOpp={(oi, field) => toggleOpp(ci, oi, field)} />
          ))}
        </div>

        <Field label={t("Attachment (optional — photo of the paper form)")}>
          <input type="file" className="input" onChange={(e) => setNewAttachment(e.target.files?.[0] ?? null)} />
        </Field>

        {message && (
          <p className={`rounded-lg px-3 py-2 text-sm ${message.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
            {message.text}
          </p>
        )}

        <button type="submit" className="flex items-center gap-1 self-start rounded-lg bg-teal-600 px-6 py-2 text-sm font-semibold text-white hover:bg-teal-700">
          <Plus className="h-4 w-4" />
          {t("Save Observation")}
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <select className="input w-56" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
          <option value="">{t("All Departments")}</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        {avgCompliance != null && (
          <span className="flex items-center gap-1 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">
            <Droplets className="h-3.5 w-3.5" />
            {t("Average compliance: ")}{avgCompliance}%
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500">{t("Export Excel/PDF exports exactly what's shown below — filter by department first.")}</p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">{t("Date")}</th>
              <th className="px-4 py-2 font-medium">{t("Department")}</th>
              <th className="px-4 py-2 font-medium">{t("Observer")}</th>
              <th className="px-4 py-2 font-medium">{t("Time")}</th>
              <th className="px-4 py-2 font-medium">{t("Total Opp.")}</th>
              <th className="px-4 py-2 font-medium">{t("Compliant")}</th>
              <th className="px-4 py-2 font-medium">{t("Compliance")}</th>
              <th className="px-4 py-2 font-medium">{t("Attachment")}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {visibleObservations.map((o) => (
              <tr key={o.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-2">{o.date}</td>
                <td className="px-4 py-2">{o.department}</td>
                <td className="px-4 py-2">{o.observer}</td>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">{o.time_from ? `${o.time_from.slice(0, 5)}–${o.time_to?.slice(0, 5) ?? ""}` : "—"}</td>
                <td className="px-4 py-2">{o.total_opportunities}</td>
                <td className="px-4 py-2">{o.compliant}</td>
                <td className="px-4 py-2">
                  {o.compliance_pct != null ? (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${Number(o.compliance_pct) < 80 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                      {o.compliance_pct}%
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2">
                  {o.attachment_path ? (
                    <a href={attachmentUrl(o.attachment_path)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-teal-700 hover:underline">
                      <Paperclip className="h-3.5 w-3.5" />
                      {t("View")}
                    </a>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => removeObservation(o)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && visibleObservations.length === 0 && <p className="p-6 text-center text-sm text-slate-400">{t("No observations recorded")}</p>}
        {loading && <p className="p-6 text-center text-sm text-slate-400">{t("Loading...")}</p>}
      </div>
    </div>
  );
}

function ProfCatColumn({ col, onFieldChange, onToggleOpp }) {
  const { t } = useLanguage();
  const totals = computeColumnTotals(col);
  const active = columnHasData(col);
  return (
    <div className={`flex flex-col overflow-hidden rounded-xl border ${active ? "border-teal-400" : "border-slate-200"}`}>
      <div className="grid grid-cols-3 gap-px bg-slate-200 text-xs">
        <label className="flex flex-col gap-0.5 bg-slate-100 px-2 py-1">
          <span className="font-semibold text-slate-600">Prof.cat</span>
          <input
            className="w-full border-0 bg-transparent p-0 text-xs focus:outline-none focus:ring-0"
            list="hh-observer-suggestions"
            value={col.prof_cat}
            onChange={(e) => onFieldChange({ prof_cat: e.target.value })}
            placeholder="Nurse..."
          />
        </label>
        <label className="flex flex-col gap-0.5 bg-slate-100 px-2 py-1">
          <span className="font-semibold text-slate-600">Code</span>
          <input className="w-full border-0 bg-transparent p-0 text-xs focus:outline-none focus:ring-0" value={col.code} onChange={(e) => onFieldChange({ code: e.target.value })} />
        </label>
        <label className="flex flex-col gap-0.5 bg-slate-100 px-2 py-1">
          <span className="font-semibold text-slate-600">N°</span>
          <input className="w-full border-0 bg-transparent p-0 text-xs focus:outline-none focus:ring-0" value={col.no} onChange={(e) => onFieldChange({ no: e.target.value })} />
        </label>
      </div>

      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="bg-slate-50 text-slate-500">
            <th className="border-b border-slate-200 px-1 py-1 font-medium">Opp.</th>
            <th className="border-b border-slate-200 px-1 py-1 font-medium">{t("Indication")}</th>
            <th className="border-b border-slate-200 px-1 py-1 font-medium">{t("HH Action")}</th>
          </tr>
        </thead>
        <tbody>
          {col.opps.map((o, oi) => (
            <tr key={oi} className="border-b border-slate-100 align-top">
              <td className="px-1 py-1.5 text-center font-semibold text-slate-500">{oi + 1}</td>
              <td className="px-1 py-1.5">
                <div className="flex flex-col gap-0.5">
                  {INDICATIONS.map((ind) => (
                    <label key={ind.key} className="flex items-center gap-1 whitespace-nowrap">
                      <input type="checkbox" className="h-3 w-3 rounded-sm" checked={o[ind.key]} onChange={() => onToggleOpp(oi, ind.key)} />
                      {ind.label}
                    </label>
                  ))}
                </div>
              </td>
              <td className="px-1 py-1.5">
                <div className="flex flex-col gap-0.5">
                  <label className="flex items-center gap-1 whitespace-nowrap">
                    <input type="checkbox" className="h-3 w-3 rounded-sm" checked={o.hr} onChange={() => onToggleOpp(oi, "hr")} />
                    HR
                  </label>
                  <label className="flex items-center gap-1 whitespace-nowrap">
                    <input type="checkbox" className="h-3 w-3 rounded-sm" checked={o.hw} onChange={() => onToggleOpp(oi, "hw")} />
                    HW
                  </label>
                  <label className="flex items-center gap-1 whitespace-nowrap">
                    <input type="checkbox" className="h-3 w-3 rounded-full" checked={o.missed} onChange={() => onToggleOpp(oi, "missed")} />
                    {t("missed")}
                  </label>
                  <label className="flex items-center gap-1 whitespace-nowrap">
                    <input type="checkbox" className="h-3 w-3 rounded-full" checked={o.gloves} onChange={() => onToggleOpp(oi, "gloves")} />
                    {t("gloves")}
                  </label>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {active && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 bg-teal-50/60 px-2 py-1.5 text-[11px] text-teal-700">
          <span>{t("Total: ")}<b>{totals.total_opportunities}</b></span>
          <span>{t("Compliant: ")}<b>{totals.compliant}</b></span>
          <span>{t("Compliance: ")}<b>{totals.compliance_pct != null ? `${totals.compliance_pct}%` : "—"}</b></span>
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, tone }) {
  const toneClass = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : "text-slate-800";
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`text-lg font-semibold ${toneClass}`}>{value}</p>
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
