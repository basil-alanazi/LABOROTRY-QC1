import { useEffect, useMemo, useState } from "react";
import { Droplets, FileSpreadsheet, FileText, Paperclip, Plus, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
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

const emptyForm = {
  date: todayStr(),
  department: "",
  observer: "",
  time_from: "",
  time_to: "",
  before_touching_patient: "",
  before_clean_procedure: "",
  after_body_fluid_risk: "",
  after_touching_patient: "",
  after_touching_surroundings: "",
  hand_rub: "",
  hand_wash: "",
  missed: "",
  wearing_glove: "",
};

function num(v) {
  return v === "" || v == null ? 0 : Number(v) || 0;
}

function computeTotals(f) {
  const total = num(f.hand_rub) + num(f.hand_wash) + num(f.missed);
  const compliant = num(f.hand_rub) + num(f.hand_wash);
  const pct = total > 0 ? Number(((compliant / total) * 100).toFixed(1)) : null;
  return { total, compliant, pct };
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
  const [observations, setObservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [newAttachment, setNewAttachment] = useState(null);
  const [message, setMessage] = useState(null);
  const [filterDept, setFilterDept] = useState("");

  const departments = config?.ic_round_departments ?? [];
  const { total, compliant, pct } = computeTotals(form);

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

  async function uploadFile(file, department) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${department || "session"}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from(HH_ATTACHMENTS_BUCKET).upload(path, file);
    if (error) throw error;
    return { path, name: file.name };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.department) {
      flash({ type: "error", text: "Department is required" });
      return;
    }
    if (!form.observer.trim()) {
      flash({ type: "error", text: "Observer / profession category is required" });
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

    const { error } = await supabase.from("hh_observations").insert({
      date: form.date,
      department: form.department,
      observer: form.observer.trim(),
      time_from: form.time_from || null,
      time_to: form.time_to || null,
      attachment_path: attachment?.path ?? null,
      attachment_name: attachment?.name ?? null,
      before_touching_patient: form.before_touching_patient === "" ? null : num(form.before_touching_patient),
      before_clean_procedure: form.before_clean_procedure === "" ? null : num(form.before_clean_procedure),
      after_body_fluid_risk: form.after_body_fluid_risk === "" ? null : num(form.after_body_fluid_risk),
      after_touching_patient: form.after_touching_patient === "" ? null : num(form.after_touching_patient),
      after_touching_surroundings: form.after_touching_surroundings === "" ? null : num(form.after_touching_surroundings),
      hand_rub: form.hand_rub === "" ? null : num(form.hand_rub),
      hand_wash: form.hand_wash === "" ? null : num(form.hand_wash),
      missed: form.missed === "" ? null : num(form.missed),
      wearing_glove: form.wearing_glove === "" ? null : num(form.wearing_glove),
      total_opportunities: total,
      compliant,
      compliance_pct: pct,
      done_by: session?.username,
    });

    if (error) {
      flash({ type: "error", text: "Could not save: " + error.message });
    } else {
      flash({ type: "success", text: "Observation saved" });
      setForm({ ...emptyForm, date: form.date, department: form.department });
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
          <h1 className="text-xl font-bold text-slate-800">Hand Hygiene</h1>
          <p className="text-sm text-slate-500">WHO 5 Moments hand-hygiene observation — Indication, HH Action (Hand Rub/Hand Wash/Missed), and glove use per session.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportExcel}
            disabled={visibleObservations.length === 0}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Export Excel
          </button>
          <button
            onClick={exportPdf}
            disabled={visibleObservations.length === 0}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <FileText className="h-3.5 w-3.5" />
            Export PDF
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">New Observation</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Field label="Date">
            <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </Field>
          <Field label="Department / Ward">
            <select className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} required>
              <option value="">Select department</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </Field>
          <Field label="Observer / Prof. Category">
            <input className="input" list="hh-observer-suggestions" value={form.observer} onChange={(e) => setForm({ ...form, observer: e.target.value })} placeholder="Doctor, Nurse, ..." required />
            <datalist id="hh-observer-suggestions">
              {OBSERVER_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label="Time From">
            <input type="time" className="input" value={form.time_from} onChange={(e) => setForm({ ...form, time_from: e.target.value })} />
          </Field>
          <Field label="Time To">
            <input type="time" className="input" value={form.time_to} onChange={(e) => setForm({ ...form, time_to: e.target.value })} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-teal-200">
            <div className="bg-teal-600 px-3 py-1.5 text-center text-xs font-semibold text-white">Indication</div>
            <div className="grid grid-cols-1 gap-3 bg-teal-50/40 p-3 sm:grid-cols-2">
              <CountField label="Before Patient Contact" value={form.before_touching_patient} onChange={(v) => setForm({ ...form, before_touching_patient: v })} />
              <CountField label="Before Aseptic Procedure" value={form.before_clean_procedure} onChange={(v) => setForm({ ...form, before_clean_procedure: v })} />
              <CountField label="After Body Fluid Exposure Risk" value={form.after_body_fluid_risk} onChange={(v) => setForm({ ...form, after_body_fluid_risk: v })} />
              <CountField label="After Patient Contact" value={form.after_touching_patient} onChange={(v) => setForm({ ...form, after_touching_patient: v })} />
              <CountField label="After Touching Surroundings" value={form.after_touching_surroundings} onChange={(v) => setForm({ ...form, after_touching_surroundings: v })} />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-teal-200">
            <div className="bg-teal-600 px-3 py-1.5 text-center text-xs font-semibold text-white">HH Action</div>
            <div className="grid grid-cols-1 gap-3 bg-teal-50/40 p-3 sm:grid-cols-2">
              <CountField label="Hand Rub (HR)" value={form.hand_rub} onChange={(v) => setForm({ ...form, hand_rub: v })} />
              <CountField label="Hand Wash (HW)" value={form.hand_wash} onChange={(v) => setForm({ ...form, hand_wash: v })} />
              <CountField label="Missed" value={form.missed} onChange={(v) => setForm({ ...form, missed: v })} />
              <CountField label="Wearing Glove" value={form.wearing_glove} onChange={(v) => setForm({ ...form, wearing_glove: v })} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 px-4 py-3 text-sm">
          <span className="font-medium text-slate-600">Total Opportunities: <span className="font-semibold text-slate-800">{total}</span></span>
          <span className="font-medium text-slate-600">Compliant (HR+HW): <span className="font-semibold text-slate-800">{compliant}</span></span>
          <span className="font-medium text-slate-600">
            Compliance: <span className={`font-semibold ${pct != null && pct < 80 ? "text-red-600" : "text-emerald-600"}`}>{pct != null ? `${pct}%` : "—"}</span>
          </span>
        </div>

        <Field label="Attachment (optional — photo of the paper form)">
          <input type="file" className="input" onChange={(e) => setNewAttachment(e.target.files?.[0] ?? null)} />
        </Field>

        {message && (
          <p className={`rounded-lg px-3 py-2 text-sm ${message.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
            {message.text}
          </p>
        )}

        <button type="submit" className="flex items-center gap-1 self-start rounded-lg bg-teal-600 px-6 py-2 text-sm font-semibold text-white hover:bg-teal-700">
          <Plus className="h-4 w-4" />
          Save Observation
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <select className="input w-56" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        {avgCompliance != null && (
          <span className="flex items-center gap-1 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">
            <Droplets className="h-3.5 w-3.5" />
            Average compliance: {avgCompliance}%
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500">Export Excel/PDF exports exactly what's shown below — filter by department first.</p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Department</th>
              <th className="px-4 py-2 font-medium">Observer</th>
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">Total Opp.</th>
              <th className="px-4 py-2 font-medium">Compliant</th>
              <th className="px-4 py-2 font-medium">Compliance</th>
              <th className="px-4 py-2 font-medium">Attachment</th>
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
                      View
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
        {!loading && visibleObservations.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No observations recorded</p>}
        {loading && <p className="p-6 text-center text-sm text-slate-400">Loading...</p>}
      </div>
    </div>
  );
}

function CountField({ label, value, onChange }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-medium text-slate-600">{label}</span>
      <input type="number" min="0" className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
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
