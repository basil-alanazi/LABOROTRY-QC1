import { useMemo, useRef, useState } from "react";
import { CheckCircle2, XCircle, MinusCircle, Paperclip, X } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
import {
  HH_MOMENTS,
  DEFAULT_OBSERVER_ROLES,
  HH_ATTACHMENTS_BUCKET,
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
const emptyEntry = () => ({ fields: emptyFields(), missed: false, handWash: false, handRub: false });

export default function HandHygieneEntry() {
  const { session, config } = useAuth();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [department, setDepartment] = useState("");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [observerData, setObserverData] = useState({});
  const [attachment, setAttachment] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const departmentRef = useRef(null);
  const fileInputRef = useRef(null);

  const departments = config?.hh_departments ?? [];
  const allRoles = config?.hh_observer_roles ?? DEFAULT_OBSERVER_ROLES;
  const departmentMap = config?.hh_department_observers ?? {};
  // Which roles apply to the selected department (configured in Settings);
  // an unconfigured department falls back to showing every role.
  const roundObservers = useMemo(() => {
    if (!department) return [];
    const allowed = departmentMap[department];
    return allowed && allowed.length > 0 ? allRoles.filter((r) => allowed.includes(r)) : allRoles;
  }, [department, departmentMap, allRoles]);

  function getEntry(o) {
    return observerData[o] ?? emptyEntry();
  }

  const duration = useMemo(() => visitDurationMinutes(timeFrom, timeTo), [timeFrom, timeTo]);
  const durationOutOfRange =
    duration != null && (duration < EXPECTED_VISIT_MIN_MINUTES || duration > EXPECTED_VISIT_MAX_MINUTES);

  const perObserverCompliance = useMemo(() => {
    return Object.fromEntries(
      roundObservers.map((o) => {
        const entry = observerData[o] ?? emptyEntry();
        return [o, computeHHCompliance(entry.fields, entry.missed ? 1 : null)];
      })
    );
  }, [observerData, roundObservers]);

  const roundTotals = useMemo(() => {
    const active = Object.values(perObserverCompliance).filter((c) => c.totalOpportunities > 0);
    const totalOpportunities = active.reduce((s, c) => s + c.totalOpportunities, 0);
    const compliant = active.reduce((s, c) => s + c.compliant, 0);
    const compliancePct = totalOpportunities > 0 ? Math.round((compliant / totalOpportunities) * 1000) / 10 : null;
    return { observers: active.length, totalOpportunities, compliant, compliancePct };
  }, [perObserverCompliance]);

  function setMoment(observer, key, value) {
    setObserverData((prev) => {
      const entry = prev[observer] ?? emptyEntry();
      return { ...prev, [observer]: { ...entry, fields: { ...entry.fields, [key]: value } } };
    });
  }

  function toggleFlag(observer, flag) {
    setObserverData((prev) => {
      const entry = prev[observer] ?? emptyEntry();
      return { ...prev, [observer]: { ...entry, [flag]: !entry[flag] } };
    });
  }

  function handleDepartmentChange(value) {
    setDepartment(value);
    setObserverData({});
  }

  function resetRound() {
    setDepartment("");
    setTimeFrom("");
    setTimeTo("");
    setObserverData({});
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    departmentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    departmentRef.current?.focus();
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!department) {
      setMessage({ type: "error", text: "Select a department first" });
      return;
    }
    if (roundTotals.observers === 0) {
      setMessage({ type: "error", text: "Mark at least one moment for at least one observer before saving" });
      return;
    }

    setSaving(true);
    setMessage(null);

    let attachment_path = null;
    let attachment_name = null;
    if (attachment) {
      const safeName = attachment.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${department}/${date}-${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from(HH_ATTACHMENTS_BUCKET).upload(path, attachment);
      if (uploadError) {
        setSaving(false);
        setMessage({ type: "error", text: "Could not upload attachment: " + uploadError.message });
        return;
      }
      attachment_path = path;
      attachment_name = attachment.name;
    }

    const rows = roundObservers.filter((o) => perObserverCompliance[o].totalOpportunities > 0).map((o) => {
      const data = observerData[o];
      const compliance = perObserverCompliance[o];
      return {
        date,
        department,
        observer: o,
        time_from: timeFrom || null,
        time_to: timeTo || null,
        ...data.fields,
        missed: data.missed ? 1 : null,
        hand_wash: data.handWash ? 1 : null,
        hand_rub: data.handRub ? 1 : null,
        total_opportunities: compliance.totalOpportunities,
        compliant: compliance.compliant,
        compliance_pct: compliance.compliancePct,
        attachment_path,
        attachment_name,
        done_by: session?.username,
      };
    });

    const { error } = await supabase.from("hh_observations").insert(rows);

    setSaving(false);
    if (error) {
      setMessage({ type: "error", text: "Could not save: " + error.message });
    } else {
      setMessage({ type: "success", text: `Round saved — ${rows.length} observation(s) recorded` });
      resetRound();
    }
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs text-slate-500">
        One round = one visit to a department. Fill in whichever roles you observed during this round, then save them
        together.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" required />
        </Field>
        <Field label="Time From">
          <input type="time" className="input" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} />
        </Field>
        <Field label="Time To">
          <input type="time" className="input" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} />
        </Field>
        <Field label="Department">
          <select ref={departmentRef} value={department} onChange={(e) => handleDepartmentChange(e.target.value)} className="input" required>
            <option value="">Select department</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {duration != null && (
        <p className={`text-sm font-medium ${durationOutOfRange ? "text-red-600" : "text-emerald-600"}`}>
          Round duration: {duration} min{durationOutOfRange ? " — expected 10-20 min max" : ""}
        </p>
      )}

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-slate-700">Observers</h2>
        {!department && <p className="text-xs text-slate-400">Select a department to see its observer roles.</p>}
        {roundObservers.map((o) => {
          const entry = getEntry(o);
          return (
            <div key={o} className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">{o}</h3>
                {perObserverCompliance[o].totalOpportunities > 0 && (
                  <span className="text-xs font-medium text-teal-700">
                    {perObserverCompliance[o].compliancePct}% ({perObserverCompliance[o].compliant}/
                    {perObserverCompliance[o].totalOpportunities})
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {HH_MOMENTS.map((m) => (
                  <div key={m.key} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-xs text-slate-600">{m.label}</span>
                    <div className="flex gap-1.5">
                      {STATUS_OPTIONS.map((opt) => {
                        const Icon = opt.icon;
                        const selected = entry.fields[m.key] === opt.value;
                        return (
                          <button
                            type="button"
                            key={opt.label}
                            onClick={() => setMoment(o, m.key, opt.value)}
                            className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
                              selected ? opt.className : "border-slate-200 text-slate-400 hover:border-slate-300"
                            }`}
                          >
                            <Icon className="h-3 w-3" />
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-3 border-t border-slate-100 pt-3">
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" checked={entry.missed} onChange={() => toggleFlag(o, "missed")} />
                  Missed opportunity
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" checked={entry.handWash} onChange={() => toggleFlag(o, "handWash")} />
                  Hand wash used
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" checked={entry.handRub} onChange={() => toggleFlag(o, "handRub")} />
                  Hand rub used
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-slate-500">Attachment (photo or file, optional — applies to this round)</label>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
            <Paperclip className="h-4 w-4" />
            {attachment ? "Change file" : "Choose file"}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx"
              className="hidden"
              onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
            />
          </label>
          {attachment && (
            <span className="flex items-center gap-1 text-xs text-slate-600">
              {attachment.name}
              <button
                type="button"
                onClick={() => {
                  setAttachment(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="text-slate-400 hover:text-red-500"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-4 text-center">
        <Stat label="Observers Recorded" value={roundTotals.observers} />
        <Stat label="Total Opportunities" value={roundTotals.totalOpportunities} />
        <Stat label="Round Compliance" value={roundTotals.compliancePct != null ? `${roundTotals.compliancePct}%` : "—"} />
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
        {saving ? "Saving..." : "Save Round"}
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
