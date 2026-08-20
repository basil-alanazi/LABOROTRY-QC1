import { useMemo, useRef, useState } from "react";
import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
import {
  HH_MOMENTS,
  OBSERVER_ROLES,
  computeHHCompliance,
  visitDurationMinutes,
  EXPECTED_VISIT_MIN_MINUTES,
  EXPECTED_VISIT_MAX_MINUTES,
} from "../../lib/handHygiene";

const STATUS_OPTIONS = [
  { value: 1, label: "Done", icon: CheckCircle2, className: "text-emerald-600 border-emerald-500 bg-emerald-50" },
  { value: 0, label: "Missed", icon: XCircle, className: "text-red-600 border-red-500 bg-red-50" },
  { value: null, label: "N/A", icon: MinusCircle, className: "text-slate-500 border-slate-300 bg-slate-50" },
];

const emptyFields = () => Object.fromEntries(HH_MOMENTS.map((m) => [m.key, null]));

export default function HandHygieneEntry() {
  const { session, config } = useAuth();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [department, setDepartment] = useState("");
  const [observer, setObserver] = useState("");
  const [observerOther, setObserverOther] = useState("");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [fields, setFields] = useState(emptyFields);
  const [missed, setMissed] = useState(false);
  const [handWash, setHandWash] = useState(false);
  const [handRub, setHandRub] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const observerRef = useRef(null);

  const departments = config?.hh_departments ?? [];
  const compliance = useMemo(() => computeHHCompliance(fields, missed ? 1 : null), [fields, missed]);
  const duration = useMemo(() => visitDurationMinutes(timeFrom, timeTo), [timeFrom, timeTo]);
  const durationOutOfRange =
    duration != null && (duration < EXPECTED_VISIT_MIN_MINUTES || duration > EXPECTED_VISIT_MAX_MINUTES);

  function resetForBlock() {
    setObserver("");
    setObserverOther("");
    setTimeFrom("");
    setTimeTo("");
    setFields(emptyFields());
    setMissed(false);
    setHandWash(false);
    setHandRub(false);
    observerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    observerRef.current?.focus();
  }

  async function handleSave(e) {
    e.preventDefault();
    const observerValue = observer === "Other" ? observerOther.trim() : observer;
    if (!department || !observerValue) {
      setMessage({ type: "error", text: "Select a department and observer first" });
      return;
    }
    if (compliance.totalOpportunities === 0) {
      setMessage({ type: "error", text: "Mark at least one moment before saving" });
      return;
    }

    setSaving(true);
    setMessage(null);

    const { error } = await supabase.from("hh_observations").insert({
      date,
      department,
      observer: observerValue,
      time_from: timeFrom || null,
      time_to: timeTo || null,
      ...fields,
      missed: missed ? 1 : null,
      hand_wash: handWash ? 1 : null,
      hand_rub: handRub ? 1 : null,
      total_opportunities: compliance.totalOpportunities,
      compliant: compliance.compliant,
      compliance_pct: compliance.compliancePct,
      done_by: session?.username,
    });

    setSaving(false);
    if (error) {
      setMessage({ type: "error", text: "Could not save: " + error.message });
    } else {
      setMessage({ type: "success", text: "Observation saved successfully" });
      resetForBlock();
    }
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" required />
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
        <Field label="Observer">
          <select
            ref={observerRef}
            value={observer}
            onChange={(e) => setObserver(e.target.value)}
            className="input"
            required
          >
            <option value="">Select observer</option>
            {OBSERVER_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {observer === "Other" && (
        <Field label="Observer (specify)">
          <input className="input" value={observerOther} onChange={(e) => setObserverOther(e.target.value)} required />
        </Field>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">Hand Hygiene Moments</h2>
        {HH_MOMENTS.map((m) => (
          <div
            key={m.key}
            className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="text-sm text-slate-700">{m.label}</span>
            <div className="flex gap-2">
              {STATUS_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const selected = fields[m.key] === opt.value;
                return (
                  <button
                    type="button"
                    key={opt.label}
                    onClick={() => setFields({ ...fields, [m.key]: opt.value })}
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

      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
        <h2 className="text-sm font-semibold text-slate-700">Visit Time</h2>
        <p className="text-xs text-slate-500">Expected visit length: {EXPECTED_VISIT_MIN_MINUTES}-{EXPECTED_VISIT_MAX_MINUTES} minutes.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
          <Field label="Time From">
            <input type="time" className="input" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} />
          </Field>
          <Field label="Time To">
            <input type="time" className="input" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} />
          </Field>
          {duration != null && (
            <p className={`text-sm font-medium ${durationOutOfRange ? "text-red-600" : "text-emerald-600"}`}>
              Duration: {duration} min{durationOutOfRange ? " — outside expected range" : ""}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
          <input type="checkbox" checked={missed} onChange={(e) => setMissed(e.target.checked)} />
          Missed opportunity (no hand hygiene performed)
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
          <input type="checkbox" checked={handWash} onChange={(e) => setHandWash(e.target.checked)} />
          Hand wash used
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
          <input type="checkbox" checked={handRub} onChange={(e) => setHandRub(e.target.checked)} />
          Hand rub used
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-4 text-center">
        <Stat label="Total Opportunities" value={compliance.totalOpportunities} />
        <Stat label="Compliant" value={compliance.compliant} />
        <Stat label="Compliance" value={compliance.compliancePct != null ? `${compliance.compliancePct}%` : "—"} />
      </div>

      {message && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            message.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="self-start rounded-lg bg-teal-600 px-6 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save Observation"}
      </button>
    </form>
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
