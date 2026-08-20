import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth.jsx";
import { computeCompliance } from "../lib/compliance";

const STATUS_OPTIONS = [
  { value: "MET", label: "MET", icon: CheckCircle2, className: "text-emerald-600 border-emerald-500 bg-emerald-50" },
  { value: "NOT MET", label: "NOT MET", icon: XCircle, className: "text-red-600 border-red-500 bg-red-50" },
  { value: "NA", label: "N/A", icon: MinusCircle, className: "text-slate-500 border-slate-300 bg-slate-50" },
];

const emptyPatient = { patient_name: "", mrn: "", age: "", diagnosis: "" };

export default function Today() {
  const { session, config } = useAuth();
  const [checklistTypes, setChecklistTypes] = useState([]);
  const [department, setDepartment] = useState("");
  const [checklistCode, setChecklistCode] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [patient, setPatient] = useState(emptyPatient);
  const [statuses, setStatuses] = useState({});
  const [comments, setComments] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    supabase
      .from("checklist_types")
      .select("*")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => setChecklistTypes(data ?? []));
  }, []);

  const departments = config?.departments ?? [];

  const availableChecklists = useMemo(
    () => checklistTypes.filter((c) => c.departments?.includes(department)),
    [checklistTypes, department]
  );

  const activeChecklist = useMemo(
    () => checklistTypes.find((c) => c.code === checklistCode) ?? null,
    [checklistTypes, checklistCode]
  );

  useEffect(() => {
    setChecklistCode("");
  }, [department]);

  useEffect(() => {
    setStatuses({});
  }, [checklistCode]);

  const items = activeChecklist?.items ?? [];
  const compliance = useMemo(() => {
    const list = items.map((item) => ({ item, status: statuses[item] }));
    return computeCompliance(list);
  }, [items, statuses]);

  function resetForm() {
    setPatient(emptyPatient);
    setStatuses({});
    setComments("");
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!department || !activeChecklist) {
      setMessage({ type: "error", text: "Select a department and checklist type first" });
      return;
    }
    const unset = items.filter((item) => !statuses[item]);
    if (unset.length > 0) {
      setMessage({ type: "error", text: "Complete all checklist items before saving" });
      return;
    }

    setSaving(true);
    setMessage(null);

    const itemsPayload = items.map((item) => ({ item, status: statuses[item] }));
    const { met, notMet, applicable, compliancePct } = compliance;

    const { error } = await supabase.from("ward_round_audits").insert({
      date,
      department,
      checklist_type_id: activeChecklist.id,
      checklist_code: activeChecklist.code,
      checklist_name_ar: activeChecklist.name_ar,
      patient_name: patient.patient_name,
      mrn: patient.mrn,
      age: patient.age,
      diagnosis: patient.diagnosis,
      items: itemsPayload,
      met_count: met,
      applicable_count: applicable,
      not_met_count: notMet,
      compliance_pct: compliancePct,
      comments,
      action_status: notMet > 0 ? "open" : "none",
      done_by: session?.username,
    });

    setSaving(false);
    if (error) {
      setMessage({ type: "error", text: "Could not save: " + error.message });
    } else {
      setMessage({ type: "success", text: "Audit saved successfully" });
      resetForm();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Daily Ward Round</h1>
        <p className="text-sm text-slate-500">Record one patient audit against one checklist on one date.</p>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Field label="Date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input"
              required
            />
          </Field>
          <Field label="Department">
            <select value={department} onChange={(e) => setDepartment(e.target.value)} className="input" required>
              <option value="">Select department</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Checklist Type">
            <select
              value={checklistCode}
              onChange={(e) => setChecklistCode(e.target.value)}
              className="input"
              required
              disabled={!department}
            >
              <option value="">Select checklist</option>
              {availableChecklists.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name_ar}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {department && availableChecklists.length === 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            No checklists are linked to this department yet — link one from Settings.
          </p>
        )}

        {activeChecklist && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Patient Name">
                <input
                  className="input"
                  value={patient.patient_name}
                  onChange={(e) => setPatient({ ...patient, patient_name: e.target.value })}
                  required
                />
              </Field>
              <Field label="MRN">
                <input
                  className="input"
                  value={patient.mrn}
                  onChange={(e) => setPatient({ ...patient, mrn: e.target.value })}
                  required
                />
              </Field>
              <Field label="Age">
                <input className="input" value={patient.age} onChange={(e) => setPatient({ ...patient, age: e.target.value })} />
              </Field>
              <Field label="Diagnosis">
                <input
                  className="input"
                  value={patient.diagnosis}
                  onChange={(e) => setPatient({ ...patient, diagnosis: e.target.value })}
                />
              </Field>
            </div>

            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-slate-700">{activeChecklist.name_ar} — Bundle Items</h2>
              {items.map((item) => (
                <div key={item} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm text-slate-700">{item}</span>
                  <div className="flex gap-2">
                    {STATUS_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const selected = statuses[item] === opt.value;
                      return (
                        <button
                          type="button"
                          key={opt.value}
                          onClick={() => setStatuses({ ...statuses, [item]: opt.value })}
                          className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                            selected ? opt.className : "border-slate-200 text-slate-400 hover:border-slate-300"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-center sm:grid-cols-4">
              <Stat label="Met" value={compliance.met} />
              <Stat label="Not Met" value={compliance.notMet} />
              <Stat label="Applicable" value={compliance.applicable} />
              <Stat label="Compliance" value={compliance.compliancePct != null ? `${compliance.compliancePct}%` : "—"} />
            </div>

            <Field label="Comments / Action Required">
              <textarea
                className="input min-h-[80px]"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Note any corrective action needed for NOT MET items"
              />
            </Field>

            {message && (
              <p className={`rounded-lg px-3 py-2 text-sm ${message.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                {message.text}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="self-start rounded-lg bg-teal-600 px-6 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Audit"}
            </button>
          </>
        )}
      </form>
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

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-lg font-bold text-slate-800">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
