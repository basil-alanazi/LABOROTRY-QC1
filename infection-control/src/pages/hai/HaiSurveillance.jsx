import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileSpreadsheet, FileText, Plus, Trash2, UserPlus } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
import { downloadExcel } from "../../lib/exportExcel";
import { downloadPdf } from "../../lib/exportPdf";
import { fetchAllRows } from "../../lib/fetchAll";

const todayStr = () => new Date().toISOString().slice(0, 10);

const STATUS_OPTIONS = ["admitted", "discharged", "transferred", "referred", "expired"];
const statusLabel = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "—");
const statusBadgeClass = (s) =>
  s === "admitted"
    ? "bg-blue-50 text-blue-700"
    : s === "discharged"
    ? "bg-emerald-50 text-emerald-700"
    : s === "expired"
    ? "bg-red-50 text-red-700"
    : "bg-slate-100 text-slate-600";

const EVENT_TYPES = ["CLABSI", "CAUTI", "VAE", "Secondary BSI"];

const emptySpecimen = { type: "", date_collected: "", date_result: "", organism: "", mdro: false };
const ICU_SPECIMEN_SLOTS = 3;

// Pads/truncates to a fixed length so array indices are always safe to
// read/write — the official sheet has a fixed number of specimen/follow-up
// slots per row rather than an open-ended list.
function padArray(arr, length, emptyItem) {
  const next = (arr ?? []).slice(0, length);
  while (next.length < length) next.push({ ...emptyItem });
  return next;
}

const TABS = [
  { key: "icu", label: "ICU/NICU Surveillance" },
  { key: "vae", label: "VAE Monitoring" },
  { key: "ssi", label: "SSI Surveillance" },
  { key: "ob", label: "OB/Delivery Surveillance" },
];

const emptyObSpecimen = { type: "", date_collected: "", organism: "", mdro: false };
const OB_SPECIMEN_SLOTS = 1;

const emptyFollowUp = {
  type: "", date: "", fever: "", pain_tenderness: "", redness: "", swelling: "", purulent_discharge: "", wound_dehiscence: "", surgical_site_swab_sent: "", wound_status: "",
};
const SIGN_FIELDS = ["fever", "pain_tenderness", "redness", "swelling", "purulent_discharge", "wound_dehiscence"];
const ASA_SCORE_OPTIONS = ["1", "2", "3", "4", "5"];
const ASA_SCORE_GOOD = ["1", "2"];
const WOUND_CLASS_OPTIONS = ["Clean", "Clean Contaminated", "Contaminated", "Dirty/Infected"];
const WOUND_CLASS_GOOD = ["Clean", "Clean Contaminated"];
const DURATION_OF_SURGERY_OPTIONS = ["Operation lasted > cut point (1)", "Operation lasted < cut point (0)"];

function riskClass(value, goodValues) {
  if (!value) return "";
  return goodValues.includes(value) ? "bg-emerald-50 text-emerald-800 border-emerald-300" : "bg-red-50 text-red-800 border-red-300";
}

// "Updated in Seha" highlight: discharged + synced -> whole row green;
// discharged + not yet synced -> whole row amber (IC still needs to update
// Seha); still admitted + synced -> just the Patient Name/MRN cells green.
function sehaRowClass(currentStatus, updatedInSeha) {
  if (currentStatus !== "discharged") return "";
  return updatedInSeha ? "bg-emerald-50" : "bg-amber-50";
}
function sehaNameCellClass(currentStatus, updatedInSeha) {
  return currentStatus !== "discharged" && updatedInSeha ? "bg-emerald-50" : "";
}

function SignSelect({ value, onChange, onBlur, disabled }) {
  return (
    <select className={`input-cell w-full ${riskClass(value, ["NO"])}`} disabled={disabled} value={value ?? ""} onChange={onChange} onBlur={onBlur}>
      <option value="">—</option>
      <option value="NO">NO</option>
      <option value="YES">YES</option>
    </select>
  );
}

function SwabSelect({ value, onChange, onBlur, disabled }) {
  return (
    <select className={`input-cell w-full ${riskClass(value, ["N/A", "No"])}`} disabled={disabled} value={value ?? ""} onChange={onChange} onBlur={onBlur}>
      <option value="">—</option>
      <option value="N/A">N/A</option>
      <option value="Yes">Yes</option>
      <option value="No">No</option>
    </select>
  );
}
const emptySsiSpecimen = { type: "", date_collected: "", organism: "", mdro: false };
const SSI_FOLLOWUP_SLOTS = 3;
const SSI_SPECIMEN_SLOTS = 1;

export default function HaiSurveillance() {
  const { session, config, isAdmin } = useAuth();
  // A staff account can be scoped (Settings) to just one or a few tabs/units
  // of this module — stored as a comma-separated list of tokens among
  // 'adult_icu' | 'pediatric_icu' | 'ssi' | 'ob'. Owner/IC always see
  // everything; a scoped account only sees the switchers it needs (none at
  // all when exactly one tab/unit is allowed).
  const scopeTokens = isAdmin || !session?.haiScope ? null : session.haiScope.split(",").map((s) => s.trim()).filter(Boolean);
  const SCOPE_TO_TAB = { adult_icu: "icu", pediatric_icu: "icu", ssi: "ssi", ob: "ob" };
  const allowedTabs = scopeTokens ? [...new Set(scopeTokens.map((t) => SCOPE_TO_TAB[t]).filter(Boolean))] : null;
  const icuUnitsAllowed = scopeTokens ? scopeTokens.filter((t) => t === "adult_icu" || t === "pediatric_icu") : null;
  const [tab, setTab] = useState(() => allowedTabs?.[0] ?? "icu");
  const [patients, setPatients] = useState([]);
  const [vaeRows, setVaeRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [statusFilter, setStatusFilter] = useState("admitted");
  const [ssiCases, setSsiCases] = useState([]);
  const [ssiView, setSsiView] = useState("all"); // "all" | "doctor"
  const [selectedDoctor, setSelectedDoctor] = useState("");
  const [obCases, setObCases] = useState([]);
  const [icuUnit, setIcuUnit] = useState(() => (icuUnitsAllowed?.length === 1 && icuUnitsAllowed[0] === "pediatric_icu" ? "pediatric" : "adult")); // "adult" | "pediatric" — separate patient lists, not a shared type dropdown

  const adultIcuTypes = config?.hai_icu_types_adult ?? [];
  const pediatricIcuTypes = config?.hai_icu_types_pediatric ?? [];
  const activeIcuTypes = icuUnit === "adult" ? adultIcuTypes : pediatricIcuTypes;
  const units = config?.employee_departments ?? [];

  async function loadAll() {
    setLoading(true);
    const [{ data: pts }, { data: vae }, { data: ssi }, { data: ob }] = await Promise.all([
      fetchAllRows((from, to) => supabase.from("hai_icu_surveillance").select("*").eq("deleted", false).order("unit_admission_date", { ascending: false }).range(from, to)),
      fetchAllRows((from, to) => supabase.from("hai_vae_monitoring").select("*").order("date", { ascending: false }).range(from, to)),
      fetchAllRows((from, to) => supabase.from("hai_ssi_surveillance").select("*").eq("deleted", false).order("date_of_procedure", { ascending: false }).range(from, to)),
      fetchAllRows((from, to) => supabase.from("hai_ob_surveillance").select("*").eq("deleted", false).order("created_at", { ascending: false }).range(from, to)),
    ]);
    setPatients((pts ?? []).map((p) => ({ ...p, specimens: padArray(p.specimens, ICU_SPECIMEN_SLOTS, emptySpecimen) })));
    setVaeRows(vae ?? []);
    setSsiCases(
      (ssi ?? []).map((c) => ({
        ...c,
        follow_ups: padArray(c.follow_ups, SSI_FOLLOWUP_SLOTS, emptyFollowUp),
        specimens: padArray(c.specimens, SSI_SPECIMEN_SLOTS, emptySsiSpecimen),
      }))
    );
    setObCases((ob ?? []).map((c) => ({ ...c, specimens: padArray(c.specimens, OB_SPECIMEN_SLOTS, emptyObSpecimen) })));
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  function flash(msg) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }

  const visiblePatients = useMemo(
    () => (statusFilter === "all" ? patients : patients.filter((p) => p.current_status === statusFilter)),
    [patients, statusFilter]
  );
  const visibleIcuUnitPatients = useMemo(
    () => visiblePatients.filter((p) => activeIcuTypes.includes(p.icu_type)),
    [visiblePatients, activeIcuTypes]
  );
  const visibleSsiCases = useMemo(
    () => (statusFilter === "all" ? ssiCases : ssiCases.filter((c) => c.current_status === statusFilter)),
    [ssiCases, statusFilter]
  );

  // Each doctor's own tracker — live-derived from the same SSI records (never
  // a separate copy): one row per follow-up visit that has a date, for every
  // case whose Treating Doctor matches.
  const ssiDoctors = useMemo(
    () => [...new Set(ssiCases.map((c) => (c.treating_doctor || "").trim()).filter(Boolean))].sort(),
    [ssiCases]
  );
  const doctorTrackerRows = useMemo(() => {
    if (!selectedDoctor) return [];
    const rows = [];
    ssiCases
      .filter((c) => (c.treating_doctor || "").trim() === selectedDoctor)
      .forEach((c) => {
        (c.follow_ups ?? []).forEach((f) => {
          if (!f.date) return;
          rows.push({ case: c, followUp: f });
        });
      });
    return rows;
  }, [ssiCases, selectedDoctor]);
  const visibleObCases = useMemo(
    () => (statusFilter === "all" ? obCases : obCases.filter((c) => c.current_status === statusFilter)),
    [obCases, statusFilter]
  );

  const haiCount = useMemo(
    () => patients.filter((p) => activeIcuTypes.includes(p.icu_type) && p.current_status === "admitted" && p.hai_detected).length,
    [patients, activeIcuTypes]
  );
  const ssiCount = useMemo(() => ssiCases.filter((c) => c.current_status === "admitted" && c.ssi_detected).length, [ssiCases]);

  function updatePatientField(id, patch) {
    setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function addPatient() {
    const { error } = await supabase.from("hai_icu_surveillance").insert({
      patient_name: "",
      icu_type: activeIcuTypes[0] ?? "",
      specimens: padArray([], ICU_SPECIMEN_SLOTS, emptySpecimen),
      hai_event_types: [],
      done_by: session?.username,
    });
    if (error) return flash({ type: "error", text: "Could not add: " + error.message });
    loadAll();
  }

  async function savePatient(p) {
    await supabase
      .from("hai_icu_surveillance")
      .update({
        month: p.month,
        patient_name: p.patient_name,
        mrn: p.mrn,
        age: p.age,
        gender: p.gender,
        bed_no: p.bed_no,
        icu_type: p.icu_type,
        hospital_admission_date: p.hospital_admission_date || null,
        unit_admission_date: p.unit_admission_date || null,
        admission_diagnosis: p.admission_diagnosis,
        central_line_insertion: p.central_line_insertion || null,
        central_line_removed: p.central_line_removed || null,
        urinary_catheter_insertion: p.urinary_catheter_insertion || null,
        urinary_catheter_removed: p.urinary_catheter_removed || null,
        ventilator_insertion: p.ventilator_insertion || null,
        ventilator_removed: p.ventilator_removed || null,
        device_reinsertion_note: p.device_reinsertion_note,
        signs_symptoms: p.signs_symptoms,
        date_onset_symptoms: p.date_onset_symptoms || null,
        specimens: p.specimens ?? [],
        other_specimens: p.other_specimens,
        hai_detected: !!p.hai_detected,
        hai_event_types: p.hai_event_types ?? [],
        current_status: p.current_status,
        comments: p.comments,
        updated_in_seha: !!p.updated_in_seha,
      })
      .eq("id", p.id);
  }

  async function removePatient(p) {
    if (!confirm(`Remove "${p.patient_name}" from HAI Surveillance?`)) return;
    await supabase.from("hai_icu_surveillance").update({ deleted: true, deleted_by: session?.username, deleted_at: new Date().toISOString() }).eq("id", p.id);
    loadAll();
  }

  function updateSpecimen(p, index, patch) {
    const next = p.specimens.map((s, i) => (i === index ? { ...s, ...patch } : s));
    updatePatientField(p.id, { specimens: next });
    return { ...p, specimens: next };
  }
  function toggleEventType(p, type) {
    const current = p.hai_event_types ?? [];
    const next = current.includes(type) ? current.filter((t) => t !== type) : [...current, type];
    updatePatientField(p.id, { hai_event_types: next });
    return { ...p, hai_event_types: next };
  }

  function updateSsiField(id, patch) {
    setSsiCases((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function addSsiCase() {
    const { error } = await supabase.from("hai_ssi_surveillance").insert({
      patient_name: "",
      elective_emergency: "elective",
      follow_up_duration: 30,
      follow_ups: padArray([], SSI_FOLLOWUP_SLOTS, emptyFollowUp),
      specimens: padArray([], SSI_SPECIMEN_SLOTS, emptySsiSpecimen),
      done_by: session?.username,
    });
    if (error) return flash({ type: "error", text: "Could not add: " + error.message });
    loadAll();
  }

  async function saveSsiCase(c) {
    await supabase
      .from("hai_ssi_surveillance")
      .update({
        month: c.month,
        patient_name: c.patient_name,
        mrn: c.mrn,
        unit: c.unit,
        age: c.age,
        gender: c.gender,
        admission_diagnosis: c.admission_diagnosis,
        treating_doctor: c.treating_doctor,
        surgical_procedure_type: c.surgical_procedure_type,
        date_of_procedure: c.date_of_procedure || null,
        elective_emergency: c.elective_emergency,
        asa_score: c.asa_score,
        wound_class: c.wound_class,
        duration_of_surgery: c.duration_of_surgery,
        patos: !!c.patos,
        follow_up_duration: c.follow_up_duration,
        follow_ups: c.follow_ups ?? [],
        specimens: c.specimens ?? [],
        other_specimens: c.other_specimens,
        ssi_detected: !!c.ssi_detected,
        type_of_ssi: c.type_of_ssi,
        current_status: c.current_status,
        date_of_discharge: c.date_of_discharge || null,
        comments: c.comments,
        updated_in_seha: !!c.updated_in_seha,
      })
      .eq("id", c.id);
  }

  async function removeSsiCase(c) {
    if (!confirm(`Remove "${c.patient_name}" from SSI Surveillance?`)) return;
    await supabase.from("hai_ssi_surveillance").update({ deleted: true, deleted_by: session?.username, deleted_at: new Date().toISOString() }).eq("id", c.id);
    loadAll();
  }

  async function markSsiStageComplete(c, prefix) {
    const patch = { [`${prefix}_completed_by`]: session?.username, [`${prefix}_completed_at`]: new Date().toISOString() };
    updateSsiField(c.id, patch);
    await supabase.from("hai_ssi_surveillance").update(patch).eq("id", c.id);
    flash({ type: "success", text: "Stage marked complete" });
  }

  async function reopenSsiStage(c, prefix) {
    if (!confirm("Reopen this stage for editing?")) return;
    const patch = { [`${prefix}_completed_by`]: null, [`${prefix}_completed_at`]: null };
    updateSsiField(c.id, patch);
    await supabase.from("hai_ssi_surveillance").update(patch).eq("id", c.id);
  }

  function updateFollowUp(c, index, patch) {
    const next = c.follow_ups.map((f, i) => (i === index ? { ...f, ...patch } : f));
    updateSsiField(c.id, { follow_ups: next });
    return { ...c, follow_ups: next };
  }

  function updateSsiSpecimen(c, index, patch) {
    const next = c.specimens.map((s, i) => (i === index ? { ...s, ...patch } : s));
    updateSsiField(c.id, { specimens: next });
    return { ...c, specimens: next };
  }

  function exportSsiExcel() {
    downloadExcel(`infection-control-hai-ssi-${todayStr()}`, [
      {
        name: "SSI Surveillance",
        headers: [
          "Month", "Patient Name", "MRN", "Unit", "Age", "Gender", "Admission Diagnosis", "Treating Doctor", "Surgical Procedure", "Date of Procedure", "Elective/Emergency",
          "ASA Score", "Wound Class", "Duration of Surgery", "PATOS", "Follow-up Duration", "SSI Detected", "Type of SSI", "Current Status", "Date of Discharge", "Updated in Seha", "Comments", "Recorded By",
        ],
        rows: visibleSsiCases.map((c) => [
          c.month, c.patient_name, c.mrn, c.unit, c.age, c.gender, c.admission_diagnosis, c.treating_doctor, c.surgical_procedure_type, c.date_of_procedure || "", c.elective_emergency,
          c.asa_score, c.wound_class, c.duration_of_surgery, c.patos ? "Yes" : "No", `${c.follow_up_duration} days`,
          c.ssi_detected ? "Yes" : "No", c.type_of_ssi, statusLabel(c.current_status), c.date_of_discharge || "", c.updated_in_seha ? "Yes" : "No", c.comments, c.done_by,
        ]),
      },
    ]);
  }

  function exportSsiPdf() {
    downloadPdf(`infection-control-hai-ssi-${todayStr()}`, "HAI Surveillance — SSI", [
      {
        headers: ["Patient", "MRN", "Procedure", "Date of Procedure", "Status", "SSI Detected", "Type of SSI"],
        rows: visibleSsiCases.map((c) => [c.patient_name, c.mrn, c.surgical_procedure_type, c.date_of_procedure || "", statusLabel(c.current_status), c.ssi_detected ? "Yes" : "No", c.type_of_ssi]),
      },
    ]);
  }

  const DOCTOR_TRACKER_HEADERS = [
    "Month", "Name", "File No", "Date of Surgery", "Name of Surgeon", "Date of Follow Up",
    "Fever", "Pain/Tenderness", "Redness", "Swelling", "Purulent Discharge", "Wound Dehiscence", "Surgical Site Swab Sent", "Comment",
  ];
  function doctorTrackerRow({ case: c, followUp: f }) {
    return [
      c.month, c.patient_name, c.mrn, c.date_of_procedure || "", c.treating_doctor, f.date || "",
      f.fever || "", f.pain_tenderness || "", f.redness || "", f.swelling || "", f.purulent_discharge || "", f.wound_dehiscence || "", f.surgical_site_swab_sent || "", c.comments,
    ];
  }

  function exportDoctorTrackerExcel() {
    downloadExcel(`infection-control-ssi-tracker-${selectedDoctor}-${todayStr()}`, [
      { name: `SSI Tracker (${selectedDoctor})`, headers: DOCTOR_TRACKER_HEADERS, rows: doctorTrackerRows.map(doctorTrackerRow) },
    ]);
  }

  function exportDoctorTrackerPdf() {
    downloadPdf(`infection-control-ssi-tracker-${selectedDoctor}-${todayStr()}`, `SSI Tracker — ${selectedDoctor}`, [
      { headers: DOCTOR_TRACKER_HEADERS, rows: doctorTrackerRows.map(doctorTrackerRow) },
    ]);
  }

  function updateObField(id, patch) {
    setObCases((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function addObCase() {
    const { error } = await supabase.from("hai_ob_surveillance").insert({
      patient_name: "",
      specimens: padArray([], OB_SPECIMEN_SLOTS, emptyObSpecimen),
      done_by: session?.username,
    });
    if (error) return flash({ type: "error", text: "Could not add: " + error.message });
    loadAll();
  }

  async function saveObCase(c) {
    await supabase
      .from("hai_ob_surveillance")
      .update({
        patient_name: c.patient_name,
        mrn: c.mrn,
        age: c.age,
        admission_diagnosis: c.admission_diagnosis,
        date_of_procedure: c.date_of_procedure || null,
        surgical_procedure_type: c.surgical_procedure_type,
        asa_score: c.asa_score,
        wound_class: c.wound_class,
        duration_of_surgery: c.duration_of_surgery,
        or_notes: c.or_notes,
        delivery_date: c.delivery_date || null,
        delivery_notes: c.delivery_notes,
        delivery_signs_symptoms: c.delivery_signs_symptoms,
        fw_date: c.fw_date || null,
        fw_notes: c.fw_notes,
        fw_wound_status: c.fw_wound_status,
        fw_signs_symptoms: c.fw_signs_symptoms,
        specimens: c.specimens ?? [],
        ssi_detected: !!c.ssi_detected,
        type_of_ssi: c.type_of_ssi,
        current_status: c.current_status,
        comments: c.comments,
      })
      .eq("id", c.id);
    flash({ type: "success", text: "Saved" });
  }

  async function removeObCase(c) {
    if (!confirm(`Remove "${c.patient_name}" from OB/Delivery Surveillance?`)) return;
    await supabase.from("hai_ob_surveillance").update({ deleted: true, deleted_by: session?.username, deleted_at: new Date().toISOString() }).eq("id", c.id);
    loadAll();
  }

  async function markStageComplete(c, prefix) {
    const patch = { [`${prefix}_completed_by`]: session?.username, [`${prefix}_completed_at`]: new Date().toISOString() };
    updateObField(c.id, patch);
    await supabase.from("hai_ob_surveillance").update(patch).eq("id", c.id);
    flash({ type: "success", text: "Stage marked complete" });
  }

  async function reopenStage(c, prefix) {
    if (!confirm("Reopen this stage for editing?")) return;
    const patch = { [`${prefix}_completed_by`]: null, [`${prefix}_completed_at`]: null };
    updateObField(c.id, patch);
    await supabase.from("hai_ob_surveillance").update(patch).eq("id", c.id);
  }

  function updateObSpecimen(c, index, patch) {
    const next = (c.specimens ?? []).map((s, i) => (i === index ? { ...s, ...patch } : s));
    updateObField(c.id, { specimens: next });
    return { ...c, specimens: next };
  }

  function exportObExcel() {
    downloadExcel(`infection-control-hai-ob-${todayStr()}`, [
      {
        name: "OB-Delivery Surveillance",
        headers: [
          "Patient Name", "MRN", "Age", "Admission Diagnosis", "Date of Procedure", "Surgical Procedure", "OR Notes", "OR Completed By",
          "Delivery Date", "Delivery Notes", "Delivery Completed By", "Female Ward Notes", "Wound Status", "SSI Detected", "Type of SSI", "Female Ward Completed By",
          "Current Status", "Comments", "Recorded By",
        ],
        rows: visibleObCases.map((c) => [
          c.patient_name, c.mrn, c.age, c.admission_diagnosis, c.date_of_procedure || "", c.surgical_procedure_type, c.or_notes, c.or_completed_by || "",
          c.delivery_date || "", c.delivery_notes, c.delivery_completed_by || "", c.fw_notes, c.fw_wound_status, c.ssi_detected ? "Yes" : "No", c.type_of_ssi, c.fw_completed_by || "",
          statusLabel(c.current_status), c.comments, c.done_by,
        ]),
      },
    ]);
  }

  function exportObPdf() {
    downloadPdf(`infection-control-hai-ob-${todayStr()}`, "HAI Surveillance — OB/Delivery", [
      {
        headers: ["Patient", "MRN", "Procedure", "Status", "OR", "Delivery", "Female Ward", "SSI Detected"],
        rows: visibleObCases.map((c) => [
          c.patient_name, c.mrn, c.surgical_procedure_type, statusLabel(c.current_status),
          c.or_completed_at ? "Done" : "Open", c.delivery_completed_at ? "Done" : c.or_completed_at ? "Open" : "—", c.fw_completed_at ? "Done" : c.delivery_completed_at ? "Open" : "—",
          c.ssi_detected ? "Yes" : "No",
        ]),
      },
    ]);
  }

  function exportIcuExcel() {
    const unitLabel = icuUnit === "adult" ? "Adult ICU" : "Pediatric ICU";
    downloadExcel(`infection-control-hai-icu-${icuUnit}-${todayStr()}`, [
      {
        name: `${unitLabel} Surveillance`,
        headers: [
          "Month", "Patient Name", "MRN", "Age", "Gender", "Bed", "ICU Type", "Hospital Admission", "Unit Admission", "Admission Diagnosis",
          "Central Line Insertion", "Central Line Removed", "Urinary Catheter Insertion", "Urinary Catheter Removed",
          "Ventilator Insertion", "Ventilator Removed", "Signs & Symptoms", "Onset Date", "HAI Detected", "Event Types", "Current Status", "Comments", "Recorded By",
        ],
        rows: visibleIcuUnitPatients.map((p) => [
          p.month, p.patient_name, p.mrn, p.age, p.gender, p.bed_no, p.icu_type, p.hospital_admission_date || "", p.unit_admission_date || "", p.admission_diagnosis,
          p.central_line_insertion || "", p.central_line_removed || "", p.urinary_catheter_insertion || "", p.urinary_catheter_removed || "",
          p.ventilator_insertion || "", p.ventilator_removed || "", p.signs_symptoms, p.date_onset_symptoms || "",
          p.hai_detected ? "Yes" : "No", (p.hai_event_types ?? []).join(", "), statusLabel(p.current_status), p.comments, p.done_by,
        ]),
      },
    ]);
  }

  function exportIcuPdf() {
    const unitLabel = icuUnit === "adult" ? "Adult ICU" : "Pediatric ICU";
    downloadPdf(`infection-control-hai-icu-${icuUnit}-${todayStr()}`, `HAI Surveillance — ${unitLabel}`, [
      {
        headers: ["Patient", "MRN", "ICU Type", "Unit Admission", "Status", "HAI Detected", "Event Types"],
        rows: visibleIcuUnitPatients.map((p) => [p.patient_name, p.mrn, p.icu_type, p.unit_admission_date || "", statusLabel(p.current_status), p.hai_detected ? "Yes" : "No", (p.hai_event_types ?? []).join(", ")]),
      },
    ]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">HAI Surveillance</h1>
          <p className="text-sm text-slate-500">Device-associated events (CLABSI/CAUTI/VAE) across ICU/NICU, with daily VAE monitoring.</p>
        </div>
        {tab === "icu" && (
          <div className="flex gap-2">
            <button onClick={exportIcuExcel} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Export Excel
            </button>
            <button onClick={exportIcuPdf} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              <FileText className="h-3.5 w-3.5" />
              Export PDF
            </button>
          </div>
        )}
        {tab === "ssi" && (
          <div className="flex gap-2">
            <button onClick={exportSsiExcel} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Export Excel
            </button>
            <button onClick={exportSsiPdf} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              <FileText className="h-3.5 w-3.5" />
              Export PDF
            </button>
          </div>
        )}
        {tab === "ob" && (
          <div className="flex gap-2">
            <button onClick={exportObExcel} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Export Excel
            </button>
            <button onClick={exportObPdf} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              <FileText className="h-3.5 w-3.5" />
              Export PDF
            </button>
          </div>
        )}
      </div>

      {tab === "icu" && haiCount > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <AlertTriangle className="h-4 w-4" />
          {haiCount} admitted patient{haiCount > 1 ? "s" : ""} with a detected HAI event
        </div>
      )}
      {tab === "ssi" && ssiCount > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <AlertTriangle className="h-4 w-4" />
          {ssiCount} admitted patient{ssiCount > 1 ? "s" : ""} with a detected SSI
        </div>
      )}

      {message && <p className={`rounded-lg px-3 py-2 text-sm ${message.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{message.text}</p>}

      {(!scopeTokens || allowedTabs.length > 1) && (
        <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs w-fit">
          {TABS.filter((t) => !scopeTokens || allowedTabs.includes(t.key)).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`rounded-md px-3 py-1 font-medium ${tab === t.key ? "bg-teal-600 text-white" : "text-slate-500"}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === "icu" && (!scopeTokens || !icuUnitsAllowed || icuUnitsAllowed.length > 1) && (
        <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs w-fit">
          {[
            { key: "adult", label: "Adult ICU" },
            { key: "pediatric", label: "Pediatric ICU (NICU/PICU)" },
          ].map((u) => (
            <button
              key={u.key}
              onClick={() => setIcuUnit(u.key)}
              className={`rounded-md px-3 py-1 font-medium ${icuUnit === u.key ? "bg-teal-600 text-white" : "text-slate-500"}`}
            >
              {u.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">Status:</span>
        {["admitted", "discharged", "all"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              statusFilter === s ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s === "all" ? "All" : statusLabel(s)}
          </button>
        ))}
      </div>

      {tab === "icu" && (
        <IcuSurveillanceTab
          patients={visibleIcuUnitPatients}
          loading={loading}
          icuTypes={activeIcuTypes}
          isAdmin={isAdmin}
          onAddPatient={addPatient}
          onUpdateField={updatePatientField}
          onSave={savePatient}
          onRemove={removePatient}
          onUpdateSpecimen={updateSpecimen}
          onToggleEventType={toggleEventType}
        />
      )}

      {tab === "vae" && (
        <VaeMonitoringTab
          patients={visiblePatients.filter((p) => p.ventilator_insertion)}
          vaeRows={vaeRows}
          session={session}
          flash={flash}
          reload={loadAll}
        />
      )}

      {tab === "ssi" && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs w-fit">
            {[
              { key: "all", label: "All Patients" },
              { key: "doctor", label: "By Doctor" },
            ].map((v) => (
              <button
                key={v.key}
                onClick={() => setSsiView(v.key)}
                className={`rounded-md px-3 py-1 font-medium ${ssiView === v.key ? "bg-teal-600 text-white" : "text-slate-500"}`}
              >
                {v.label}
              </button>
            ))}
          </div>
          {ssiView === "doctor" && (
            <select
              className="input w-52"
              value={selectedDoctor}
              onChange={(e) => setSelectedDoctor(e.target.value)}
            >
              <option value="">Select doctor</option>
              {ssiDoctors.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          )}
          {ssiView === "doctor" && selectedDoctor && (
            <div className="flex gap-2">
              <button onClick={exportDoctorTrackerExcel} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Export Excel
              </button>
              <button onClick={exportDoctorTrackerPdf} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                <FileText className="h-3.5 w-3.5" />
                Export PDF
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "ssi" && ssiView === "all" && (
        <SsiSurveillanceTab
          cases={visibleSsiCases}
          loading={loading}
          units={units}
          session={session}
          isAdmin={isAdmin}
          onAddCase={addSsiCase}
          onUpdateField={updateSsiField}
          onSave={saveSsiCase}
          onRemove={removeSsiCase}
          onUpdateFollowUp={updateFollowUp}
          onUpdateSpecimen={updateSsiSpecimen}
          onMarkComplete={markSsiStageComplete}
          onReopen={reopenSsiStage}
        />
      )}

      {tab === "ssi" && ssiView === "doctor" && <DoctorTrackerTable doctor={selectedDoctor} rows={doctorTrackerRows} />}

      {tab === "ob" && (
        <ObSurveillanceTab
          cases={visibleObCases}
          loading={loading}
          session={session}
          isAdmin={isAdmin}
          onAddCase={addObCase}
          onUpdateField={updateObField}
          onSave={saveObCase}
          onRemove={removeObCase}
          onMarkComplete={markStageComplete}
          onReopen={reopenStage}
          onUpdateSpecimen={updateObSpecimen}
        />
      )}
    </div>
  );
}

// A live, read-only filtered view of the same SSI records for one Treating
// Doctor — never a separate copy, matching the hospital's own per-surgeon
// SSI tracker sheets. One row per follow-up visit that has a date.
function DoctorTrackerTable({ doctor, rows }) {
  if (!doctor) {
    return <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">Pick a doctor to see her SSI tracker.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            {["Month", "Name", "File No", "Date of Surgery", "Name of Surgeon", "Date of Follow Up", "Fever", "Pain/Tenderness", "Redness", "Swelling", "Purulent Discharge", "Wound Dehiscence", "Surgical Site Swab Sent", "Comment"].map((h) => (
              <th key={h} className="whitespace-nowrap border-b border-slate-200 px-2 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ case: c, followUp: f }, i) => (
            <tr key={`${c.id}-${i}`} className="border-t border-slate-100">
              <td className="whitespace-nowrap px-2 py-1.5">{c.month}</td>
              <td className="whitespace-nowrap px-2 py-1.5">{c.patient_name}</td>
              <td className="whitespace-nowrap px-2 py-1.5">{c.mrn}</td>
              <td className="whitespace-nowrap px-2 py-1.5">{c.date_of_procedure || "—"}</td>
              <td className="whitespace-nowrap px-2 py-1.5">{c.treating_doctor}</td>
              <td className="whitespace-nowrap px-2 py-1.5">{f.date || "—"}</td>
              {SIGN_FIELDS.map((field) => (
                <td key={field} className="px-2 py-1.5">
                  {f[field] ? <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${riskClass(f[field], ["NO"])}`}>{f[field]}</span> : "—"}
                </td>
              ))}
              <td className="px-2 py-1.5">
                {f.surgical_site_swab_sent ? (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${riskClass(f.surgical_site_swab_sent, ["N/A", "No"])}`}>{f.surgical_site_swab_sent}</span>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-2 py-1.5">{c.comments || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No follow-up visits recorded for this doctor yet.</p>}
    </div>
  );
}

// Shared cell inputs for the wide, always-editable grids below (matching
// the official sheet: every column visible at once, horizontally
// scrollable, instead of an expand/collapse card per row).
function GridText({ value, onChange, onBlur, placeholder, disabled, className = "" }) {
  return (
    <input
      className={`input-cell w-full min-w-[7rem] ${className}`}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={onChange}
      onBlur={onBlur}
      disabled={disabled}
    />
  );
}
function GridDate({ value, onChange, onBlur, disabled, className = "" }) {
  return <input type="date" className={`input-cell w-full min-w-[8.5rem] ${className}`} value={value ?? ""} onChange={onChange} onBlur={onBlur} disabled={disabled} />;
}

function IcuSurveillanceTab({ patients, loading, icuTypes, isAdmin, onAddPatient, onUpdateField, onSave, onRemove, onUpdateSpecimen, onToggleEventType }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <button onClick={onAddPatient} className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700">
          <UserPlus className="h-3.5 w-3.5" />
          Add Patient
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th rowSpan={2} className="whitespace-nowrap border-b border-slate-200 px-2 py-2 font-medium align-bottom">Updated in Seha</th>
              {["Month", "Patient Name", "MRN/ID", "Age", "Gender", "Bed #", "Hospital Admission", "ICU Type", "Unit Admission", "Admission Diagnosis"].map((h) => (
                <th key={h} rowSpan={2} className="whitespace-nowrap border-b border-slate-200 px-2 py-2 font-medium align-bottom">{h}</th>
              ))}
              <th colSpan={2} className="border-b border-slate-200 px-2 py-1 text-center font-medium">Central Line</th>
              <th colSpan={2} className="border-b border-slate-200 px-2 py-1 text-center font-medium">Urinary Catheter</th>
              <th colSpan={2} className="border-b border-slate-200 px-2 py-1 text-center font-medium">Ventilator</th>
              {["Device Reinsertion (If any)", "Signs & Symptoms", "Date of Onset"].map((h) => (
                <th key={h} rowSpan={2} className="whitespace-nowrap border-b border-slate-200 px-2 py-2 font-medium align-bottom">{h}</th>
              ))}
              <th colSpan={5} className="border-b border-slate-200 px-2 py-1 text-center font-medium">Specimen 1</th>
              <th colSpan={5} className="border-b border-slate-200 px-2 py-1 text-center font-medium">Specimen 2</th>
              <th colSpan={5} className="border-b border-slate-200 px-2 py-1 text-center font-medium">Specimen 3</th>
              <th rowSpan={2} className="whitespace-nowrap border-b border-slate-200 px-2 py-2 font-medium align-bottom">Other Specimens</th>
              <th rowSpan={2} className="whitespace-nowrap border-b border-slate-200 px-2 py-2 font-medium align-bottom">HAI Detected</th>
              <th colSpan={4} className="border-b border-slate-200 px-2 py-1 text-center font-medium">Type of HAI Event</th>
              {["Current Status", "Comments"].map((h) => (
                <th key={h} rowSpan={2} className="whitespace-nowrap border-b border-slate-200 px-2 py-2 font-medium align-bottom">{h}</th>
              ))}
              <th rowSpan={2}></th>
            </tr>
            <tr>
              <th className="whitespace-nowrap px-2 py-1 font-medium">Inserted</th>
              <th className="whitespace-nowrap px-2 py-1 font-medium">Removed</th>
              <th className="whitespace-nowrap px-2 py-1 font-medium">Inserted</th>
              <th className="whitespace-nowrap px-2 py-1 font-medium">Removed</th>
              <th className="whitespace-nowrap px-2 py-1 font-medium">Inserted</th>
              <th className="whitespace-nowrap px-2 py-1 font-medium">Removed</th>
              {[1, 2, 3].flatMap((slot) =>
                ["Type", "Date Collected", "Date of Result", "Organism", "MDRO"].map((h) => (
                  <th key={`${slot}-${h}`} className="whitespace-nowrap px-2 py-1 font-medium">{h}</th>
                ))
              )}
              {EVENT_TYPES.map((t) => (
                <th key={t} className="whitespace-nowrap px-2 py-1 font-medium">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {patients.map((p) => (
              <IcuRow
                key={p.id}
                p={p}
                icuTypes={icuTypes}
                isAdmin={isAdmin}
                onFieldChange={(patch) => onUpdateField(p.id, patch)}
                onFieldBlurSave={() => onSave(p)}
                onSpecimenFieldChange={(i, patch) => onUpdateSpecimen(p, i, patch)}
                onSpecimenMdroToggle={(i, checked) => onSave(onUpdateSpecimen(p, i, { mdro: checked }))}
                onHaiDetectedToggle={(checked) => {
                  onUpdateField(p.id, { hai_detected: checked });
                  onSave({ ...p, hai_detected: checked });
                }}
                onEventTypeToggle={(type) => onSave(onToggleEventType(p, type))}
                onUpdatedInSehaToggle={(checked) => {
                  onUpdateField(p.id, { updated_in_seha: checked });
                  onSave({ ...p, updated_in_seha: checked });
                }}
                onRemove={() => onRemove(p)}
              />
            ))}
          </tbody>
        </table>
        {!loading && patients.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No patients in this list.</p>}
      </div>
    </div>
  );
}

function IcuRow({ p, icuTypes, isAdmin, onFieldChange, onFieldBlurSave, onSpecimenFieldChange, onSpecimenMdroToggle, onHaiDetectedToggle, onEventTypeToggle, onUpdatedInSehaToggle, onRemove }) {
  const unitBeforeHospital = !!(p.hospital_admission_date && p.unit_admission_date && p.unit_admission_date < p.hospital_admission_date);
  const nameCellClass = sehaNameCellClass(p.current_status, p.updated_in_seha);
  return (
    <tr className={`border-t border-slate-100 hover:bg-slate-50 ${sehaRowClass(p.current_status, p.updated_in_seha)}`}>
      <td className="px-2 py-1 text-center">
        <input type="checkbox" disabled={!isAdmin} checked={!!p.updated_in_seha} onChange={(e) => onUpdatedInSehaToggle(e.target.checked)} />
      </td>
      <td className="px-2 py-1"><GridText value={p.month} onChange={(e) => onFieldChange({ month: e.target.value })} onBlur={onFieldBlurSave} /></td>
      <td className={`px-2 py-1 ${nameCellClass}`}><GridText value={p.patient_name} onChange={(e) => onFieldChange({ patient_name: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[10rem]" /></td>
      <td className={`px-2 py-1 ${nameCellClass}`}><GridText value={p.mrn} onChange={(e) => onFieldChange({ mrn: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[6rem]" /></td>
      <td className="px-2 py-1"><GridText value={p.age} onChange={(e) => onFieldChange({ age: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[4rem]" /></td>
      <td className="px-2 py-1">
        <select className="input-cell w-full" value={p.gender} onChange={(e) => onFieldChange({ gender: e.target.value })} onBlur={onFieldBlurSave}>
          <option value="">—</option>
          <option value="M">M</option>
          <option value="F">F</option>
        </select>
      </td>
      <td className="px-2 py-1"><GridText value={p.bed_no} onChange={(e) => onFieldChange({ bed_no: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[4rem]" /></td>
      <td className="px-2 py-1"><GridDate value={p.hospital_admission_date} onChange={(e) => onFieldChange({ hospital_admission_date: e.target.value })} onBlur={onFieldBlurSave} /></td>
      <td className="px-2 py-1">
        <select className="input-cell w-full min-w-[7rem]" value={p.icu_type} onChange={(e) => onFieldChange({ icu_type: e.target.value })} onBlur={onFieldBlurSave}>
          <option value="">—</option>
          {icuTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1">
        <GridDate
          value={p.unit_admission_date}
          onChange={(e) => onFieldChange({ unit_admission_date: e.target.value })}
          onBlur={onFieldBlurSave}
          className={unitBeforeHospital ? "border-red-400 bg-red-50" : ""}
        />
        {unitBeforeHospital && <p className="mt-0.5 whitespace-nowrap text-[10px] font-medium text-red-600">Before hospital admission</p>}
      </td>
      <td className="px-2 py-1"><GridText value={p.admission_diagnosis} onChange={(e) => onFieldChange({ admission_diagnosis: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[10rem]" /></td>

      <td className="px-2 py-1"><GridDate value={p.central_line_insertion} onChange={(e) => onFieldChange({ central_line_insertion: e.target.value })} onBlur={onFieldBlurSave} /></td>
      <td className="px-2 py-1"><GridDate value={p.central_line_removed} onChange={(e) => onFieldChange({ central_line_removed: e.target.value })} onBlur={onFieldBlurSave} /></td>
      <td className="px-2 py-1"><GridDate value={p.urinary_catheter_insertion} onChange={(e) => onFieldChange({ urinary_catheter_insertion: e.target.value })} onBlur={onFieldBlurSave} /></td>
      <td className="px-2 py-1"><GridDate value={p.urinary_catheter_removed} onChange={(e) => onFieldChange({ urinary_catheter_removed: e.target.value })} onBlur={onFieldBlurSave} /></td>
      <td className="px-2 py-1"><GridDate value={p.ventilator_insertion} onChange={(e) => onFieldChange({ ventilator_insertion: e.target.value })} onBlur={onFieldBlurSave} /></td>
      <td className="px-2 py-1"><GridDate value={p.ventilator_removed} onChange={(e) => onFieldChange({ ventilator_removed: e.target.value })} onBlur={onFieldBlurSave} /></td>

      <td className="px-2 py-1"><GridText value={p.device_reinsertion_note} onChange={(e) => onFieldChange({ device_reinsertion_note: e.target.value })} onBlur={onFieldBlurSave} /></td>
      <td className="px-2 py-1"><GridText value={p.signs_symptoms} onChange={(e) => onFieldChange({ signs_symptoms: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[9rem]" /></td>
      <td className="px-2 py-1"><GridDate value={p.date_onset_symptoms} onChange={(e) => onFieldChange({ date_onset_symptoms: e.target.value })} onBlur={onFieldBlurSave} /></td>

      {p.specimens.map((s, i) => (
        <SpecimenCells
          key={i}
          specimen={s}
          hasDateResult
          onChange={(patch) => onSpecimenFieldChange(i, patch)}
          onBlur={onFieldBlurSave}
          onMdroToggle={(checked) => onSpecimenMdroToggle(i, checked)}
        />
      ))}

      <td className="px-2 py-1"><GridText value={p.other_specimens} onChange={(e) => onFieldChange({ other_specimens: e.target.value })} onBlur={onFieldBlurSave} /></td>
      <td className="px-2 py-1 text-center">
        <input type="checkbox" checked={!!p.hai_detected} onChange={(e) => onHaiDetectedToggle(e.target.checked)} />
      </td>
      {EVENT_TYPES.map((type) => (
        <td key={type} className="px-2 py-1 text-center">
          <input type="checkbox" disabled={!p.hai_detected} checked={(p.hai_event_types ?? []).includes(type)} onChange={() => onEventTypeToggle(type)} />
        </td>
      ))}

      <td className="px-2 py-1">
        <select className="input-cell w-full" value={p.current_status} onChange={(e) => onFieldChange({ current_status: e.target.value })} onBlur={onFieldBlurSave}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{statusLabel(s)}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1"><GridText value={p.comments} onChange={(e) => onFieldChange({ comments: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[9rem]" /></td>
      <td className="px-2 py-1">
        <button onClick={onRemove} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}

// Renders one specimen's slot — 5 cells (Type/Date Collected/Date of
// Result/Organism/MDRO) when hasDateResult, or 4 (no Date of Result) for
// the SSI sheet's single specimen slot.
function SpecimenCells({ specimen, hasDateResult, onChange, onBlur, onMdroToggle }) {
  return (
    <>
      <td className="px-2 py-1"><GridText value={specimen.type} onChange={(e) => onChange({ type: e.target.value })} onBlur={onBlur} className="min-w-[7rem]" /></td>
      <td className="px-2 py-1"><GridDate value={specimen.date_collected} onChange={(e) => onChange({ date_collected: e.target.value })} onBlur={onBlur} /></td>
      {hasDateResult && <td className="px-2 py-1"><GridDate value={specimen.date_result} onChange={(e) => onChange({ date_result: e.target.value })} onBlur={onBlur} /></td>}
      <td className="px-2 py-1"><GridText value={specimen.organism} onChange={(e) => onChange({ organism: e.target.value })} onBlur={onBlur} className="min-w-[7rem]" /></td>
      <td className="px-2 py-1 text-center">
        <input type="checkbox" checked={!!specimen.mdro} onChange={(e) => onMdroToggle(e.target.checked)} />
      </td>
    </>
  );
}

const emptyVaeForm = { date: todayStr(), mv_day: 1, daily_min_peep: "", daily_min_fio2: "", qad: "", date_of_event: "" };

function VaeMonitoringTab({ patients, vaeRows, session, flash, reload }) {
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(emptyVaeForm);

  useEffect(() => {
    if (selectedId && !patients.some((p) => p.id === selectedId)) setSelectedId("");
  }, [patients, selectedId]);

  const selected = patients.find((p) => p.id === selectedId);
  const days = useMemo(() => vaeRows.filter((r) => r.icu_surveillance_id === selectedId).sort((a, b) => (a.date < b.date ? 1 : -1)), [vaeRows, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const nextDay = days.length ? Math.max(...days.map((d) => d.mv_day)) + 1 : 1;
    setForm((f) => ({ ...f, mv_day: nextDay }));
  }, [selectedId, days.length]);

  async function addDay(e) {
    e.preventDefault();
    if (!selectedId) return;
    const { error } = await supabase.from("hai_vae_monitoring").insert({
      icu_surveillance_id: selectedId,
      date: form.date,
      mv_day: Number(form.mv_day) || 1,
      daily_min_peep: form.daily_min_peep === "" ? null : Number(form.daily_min_peep),
      daily_min_fio2: form.daily_min_fio2 === "" ? null : Number(form.daily_min_fio2),
      vac: !!form.vac,
      temp_abnormal: !!form.temp_abnormal,
      wbc_abnormal: !!form.wbc_abnormal,
      new_antimicrobial: !!form.new_antimicrobial,
      qad: form.qad === "" ? null : Number(form.qad),
      ivac: !!form.ivac,
      positive_culture: !!form.positive_culture,
      purulent_resp_secretions: !!form.purulent_resp_secretions,
      pvap: !!form.pvap,
      date_of_event: form.date_of_event || null,
      recorded_by: session?.username,
    });
    if (error) return flash({ type: "error", text: error.message.includes("duplicate") ? "A row for this date already exists" : "Could not save: " + error.message });
    setForm({ ...emptyVaeForm, mv_day: Number(form.mv_day) + 1 });
    reload();
  }

  async function removeDay(row) {
    if (!confirm(`Remove the ${row.date} entry?`)) return;
    await supabase.from("hai_vae_monitoring").delete().eq("id", row.id);
    reload();
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Patient (ventilated, matching the status filter above)">
        <select className="input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">Select a patient</option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.patient_name} — {p.mrn} ({p.icu_type}, {statusLabel(p.current_status)})
            </option>
          ))}
        </select>
      </Field>

      {selected && (
        <>
          <div className="flex flex-wrap gap-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            <span><strong>{selected.patient_name}</strong></span>
            <span>MRN: {selected.mrn}</span>
            <span>Age: {selected.age}</span>
            <span>Gender: {selected.gender}</span>
            <span>Bed: {selected.bed_no}</span>
            <span className={`rounded-full px-2 py-0.5 font-medium ${statusBadgeClass(selected.current_status)}`}>{statusLabel(selected.current_status)}</span>
          </div>

          <form onSubmit={addDay} className="grid grid-cols-1 gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 sm:grid-cols-5">
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              Date
              <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              MV Day
              <input type="number" min="1" className="input" value={form.mv_day} onChange={(e) => setForm({ ...form, mv_day: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              Min PEEP
              <input type="number" step="0.1" className="input" value={form.daily_min_peep} onChange={(e) => setForm({ ...form, daily_min_peep: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              Min FiO2
              <input type="number" step="0.01" className="input" value={form.daily_min_fio2} onChange={(e) => setForm({ ...form, daily_min_fio2: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              QAD
              <input type="number" min="0" className="input" value={form.qad} onChange={(e) => setForm({ ...form, qad: e.target.value })} />
            </label>

            <div className="flex flex-wrap gap-3 sm:col-span-5">
              {[
                ["vac", "VAC (Temp/WBC worsening)"],
                ["temp_abnormal", "Temp <36°C or >38°C"],
                ["wbc_abnormal", "WBC ≤4,000 or ≥12,000"],
                ["new_antimicrobial", "New Antimicrobial Agent"],
                ["ivac", "IVAC"],
                ["positive_culture", "Positive Culture"],
                ["purulent_resp_secretions", "Purulent Resp. Secretions"],
                ["pvap", "PVAP"],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-1 text-xs text-slate-600">
                  <input type="checkbox" checked={!!form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} />
                  {label}
                </label>
              ))}
            </div>
            <label className="flex flex-col gap-1 text-xs text-slate-500 sm:col-span-2">
              Date of Event (if any)
              <input type="date" className="input" value={form.date_of_event} onChange={(e) => setForm({ ...form, date_of_event: e.target.value })} />
            </label>
            <button type="submit" className="flex items-center justify-center gap-1 self-end rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 sm:col-span-5">
              <Plus className="h-4 w-4" />
              Add Day
            </button>
          </form>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">MV Day</th>
                  <th className="px-3 py-2 font-medium">Min PEEP</th>
                  <th className="px-3 py-2 font-medium">Min FiO2</th>
                  <th className="px-3 py-2 font-medium">VAC</th>
                  <th className="px-3 py-2 font-medium">IVAC</th>
                  <th className="px-3 py-2 font-medium">PVAP</th>
                  <th className="px-3 py-2 font-medium">Event Date</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.id} className="border-t border-slate-100">
                    <td className="px-3 py-1.5">{d.date}</td>
                    <td className="px-3 py-1.5">{d.mv_day}</td>
                    <td className="px-3 py-1.5">{d.daily_min_peep ?? "—"}</td>
                    <td className="px-3 py-1.5">{d.daily_min_fio2 ?? "—"}</td>
                    <td className="px-3 py-1.5">{d.vac ? "Yes" : ""}</td>
                    <td className="px-3 py-1.5">{d.ivac ? "Yes" : ""}</td>
                    <td className="px-3 py-1.5">{d.pvap ? "Yes" : ""}</td>
                    <td className="px-3 py-1.5">{d.date_of_event || ""}</td>
                    <td className="px-3 py-1.5">
                      <button onClick={() => removeDay(d)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {days.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No daily entries yet for this patient.</p>}
          </div>
        </>
      )}
    </div>
  );
}

function SsiSurveillanceTab({ cases, loading, units, session, isAdmin, onAddCase, onUpdateField, onSave, onRemove, onUpdateFollowUp, onUpdateSpecimen, onMarkComplete, onReopen }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-slate-500">
        <strong>DR</strong> (patient/procedure info) → <strong>OR</strong> (risk category index) → <strong>DR & FW</strong> (current status + date of discharge) — each
        column group is locked until the previous one is marked complete. The follow-up/specimen section in between stays open to any SSI-scoped account.
      </p>
      <div>
        <button onClick={onAddCase} className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700">
          <UserPlus className="h-3.5 w-3.5" />
          Add Patient
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th rowSpan={2} className="whitespace-nowrap border-b border-slate-200 px-2 py-2 font-medium align-bottom">Updated in Seha</th>
              <th colSpan={11} className="border-b border-slate-200 bg-cyan-100 px-2 py-1 text-center font-semibold text-cyan-900">DR</th>
              <th colSpan={5} className="border-b border-slate-200 bg-green-100 px-2 py-1 text-center font-semibold text-green-900">OR</th>
              {["PATOS", "Follow-up Duration"].map((h) => (
                <th key={h} rowSpan={2} className="whitespace-nowrap border-b border-slate-200 px-2 py-2 font-medium align-bottom">{h}</th>
              ))}
              <th colSpan={10} className="border-b border-slate-200 px-2 py-1 text-center font-medium">1st Follow Up</th>
              <th colSpan={10} className="border-b border-slate-200 px-2 py-1 text-center font-medium">2nd Follow Up</th>
              <th colSpan={10} className="border-b border-slate-200 px-2 py-1 text-center font-medium">3rd Follow Up</th>
              <th colSpan={4} className="border-b border-slate-200 px-2 py-1 text-center font-medium">Specimen Information</th>
              {["Other Specimens", "SSI Detected", "Type of SSI"].map((h) => (
                <th key={h} rowSpan={2} className="whitespace-nowrap border-b border-slate-200 px-2 py-2 font-medium align-bottom">{h}</th>
              ))}
              <th colSpan={3} className="border-b border-slate-200 bg-purple-100 px-2 py-1 text-center font-semibold text-purple-900">DR & FW</th>
              <th rowSpan={2} className="whitespace-nowrap border-b border-slate-200 px-2 py-2 font-medium align-bottom">Comments</th>
              <th rowSpan={2}></th>
            </tr>
            <tr>
              {["Month", "Patient Name", "MRN/ID", "Unit", "Age", "Gender", "Admission Diagnosis", "Treating Doctor", "Type of Surgical Procedure", "Date of Procedure"].map((h) => (
                <th key={`dr-${h}`} className="whitespace-nowrap px-2 py-1 font-medium">{h}</th>
              ))}
              <th className="whitespace-nowrap px-2 py-1 font-medium">Status</th>
              {["Elective/Emergency", "ASA Score", "Wound Class", "Duration of Surgery"].map((h) => (
                <th key={`or-${h}`} className="whitespace-nowrap px-2 py-1 font-medium">{h}</th>
              ))}
              <th className="whitespace-nowrap px-2 py-1 font-medium">Status</th>
              {[1, 2, 3].flatMap((slot) =>
                ["Type", "Date", "Fever", "Pain/Tenderness", "Redness", "Swelling", "Purulent Discharge", "Wound Dehiscence", "Surgical Site Swab Sent", "Wound Status"].map((h) => (
                  <th key={`${slot}-${h}`} className="whitespace-nowrap px-2 py-1 font-medium">{h}</th>
                ))
              )}
              {["Type", "Date Collected", "Organism", "MDRO"].map((h) => (
                <th key={h} className="whitespace-nowrap px-2 py-1 font-medium">{h}</th>
              ))}
              {["Current Status", "Date of Discharge"].map((h) => (
                <th key={`drfw-${h}`} className="whitespace-nowrap px-2 py-1 font-medium">{h}</th>
              ))}
              <th className="whitespace-nowrap px-2 py-1 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <SsiRow
                key={c.id}
                c={c}
                units={units}
                session={session}
                isAdmin={isAdmin}
                onFieldChange={(patch) => onUpdateField(c.id, patch)}
                onFieldBlurSave={() => onSave(c)}
                onFollowUpFieldChange={(i, patch) => onUpdateFollowUp(c, i, patch)}
                onSpecimenFieldChange={(i, patch) => onUpdateSpecimen(c, i, patch)}
                onSpecimenMdroToggle={(i, checked) => onSave(onUpdateSpecimen(c, i, { mdro: checked }))}
                onPatosToggle={(value) => {
                  onUpdateField(c.id, { patos: value });
                  onSave({ ...c, patos: value });
                }}
                onSsiDetectedToggle={(checked) => {
                  onUpdateField(c.id, { ssi_detected: checked });
                  onSave({ ...c, ssi_detected: checked });
                }}
                onUpdatedInSehaToggle={(checked) => {
                  onUpdateField(c.id, { updated_in_seha: checked });
                  onSave({ ...c, updated_in_seha: checked });
                }}
                onMarkComplete={(prefix) => onMarkComplete(c, prefix)}
                onReopen={(prefix) => onReopen(c, prefix)}
                onRemove={() => onRemove(c)}
              />
            ))}
          </tbody>
        </table>
        {!loading && cases.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No patients in this list.</p>}
      </div>
    </div>
  );
}

function SsiRow({
  c, units, session, isAdmin, onFieldChange, onFieldBlurSave, onFollowUpFieldChange, onSpecimenFieldChange, onSpecimenMdroToggle,
  onPatosToggle, onSsiDetectedToggle, onUpdatedInSehaToggle, onMarkComplete, onReopen, onRemove,
}) {
  function canEditSsi(group) {
    return isAdmin || session?.department === group || (session?.ssiStages ?? []).includes(group);
  }
  const drDone = !!c.dr_completed_at;
  const orOpen = drDone;
  const orDone = !!c.or_completed_at;
  const drFwOpen = orDone;
  const drFwDone = !!c.dr_fw_completed_at;

  const drDisabled = drDone || !canEditSsi("DR");
  const orDisabled = !orOpen || orDone || !canEditSsi("OR");
  const drFwDisabled = !drFwOpen || drFwDone || !canEditSsi("DR_FW");
  const nameCellClass = sehaNameCellClass(c.current_status, c.updated_in_seha);

  return (
    <tr className={`border-t border-slate-100 hover:bg-slate-50 ${sehaRowClass(c.current_status, c.updated_in_seha)}`}>
      <td className="px-2 py-1 text-center">
        <input type="checkbox" disabled={!isAdmin} checked={!!c.updated_in_seha} onChange={(e) => onUpdatedInSehaToggle(e.target.checked)} />
      </td>

      <td className="px-2 py-1"><GridText value={c.month} onChange={(e) => onFieldChange({ month: e.target.value })} onBlur={onFieldBlurSave} disabled={drDisabled} /></td>
      <td className={`px-2 py-1 ${nameCellClass}`}><GridText value={c.patient_name} onChange={(e) => onFieldChange({ patient_name: e.target.value })} onBlur={onFieldBlurSave} disabled={drDisabled} className="min-w-[10rem]" /></td>
      <td className={`px-2 py-1 ${nameCellClass}`}><GridText value={c.mrn} onChange={(e) => onFieldChange({ mrn: e.target.value })} onBlur={onFieldBlurSave} disabled={drDisabled} className="min-w-[6rem]" /></td>
      <td className="px-2 py-1">
        <select className="input-cell w-full min-w-[7rem]" disabled={drDisabled} value={c.unit} onChange={(e) => onFieldChange({ unit: e.target.value })} onBlur={onFieldBlurSave}>
          <option value="">—</option>
          {units.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1"><GridText value={c.age} onChange={(e) => onFieldChange({ age: e.target.value })} onBlur={onFieldBlurSave} disabled={drDisabled} className="min-w-[4rem]" /></td>
      <td className="px-2 py-1">
        <select className="input-cell w-full" disabled={drDisabled} value={c.gender} onChange={(e) => onFieldChange({ gender: e.target.value })} onBlur={onFieldBlurSave}>
          <option value="">—</option>
          <option value="M">M</option>
          <option value="F">F</option>
        </select>
      </td>
      <td className="px-2 py-1"><GridText value={c.admission_diagnosis} onChange={(e) => onFieldChange({ admission_diagnosis: e.target.value })} onBlur={onFieldBlurSave} disabled={drDisabled} className="min-w-[10rem]" /></td>
      <td className="px-2 py-1"><GridText value={c.treating_doctor} onChange={(e) => onFieldChange({ treating_doctor: e.target.value })} onBlur={onFieldBlurSave} disabled={drDisabled} placeholder="Dr..." className="min-w-[8rem]" /></td>
      <td className="px-2 py-1"><GridText value={c.surgical_procedure_type} onChange={(e) => onFieldChange({ surgical_procedure_type: e.target.value })} onBlur={onFieldBlurSave} disabled={drDisabled} className="min-w-[9rem]" /></td>
      <td className="px-2 py-1"><GridDate value={c.date_of_procedure} onChange={(e) => onFieldChange({ date_of_procedure: e.target.value })} onBlur={onFieldBlurSave} disabled={drDisabled} /></td>
      <td className="px-2 py-1">
        <StageActionCell open={true} done={drDone} canEdit={canEditSsi("DR")} canReopen={isAdmin} completedBy={c.dr_completed_by} onMarkComplete={() => onMarkComplete("dr")} onReopen={() => onReopen("dr")} />
      </td>

      <td className="px-2 py-1">
        <select className="input-cell w-full min-w-[7rem]" disabled={orDisabled} value={c.elective_emergency} onChange={(e) => onFieldChange({ elective_emergency: e.target.value })} onBlur={onFieldBlurSave}>
          <option value="elective">Elective</option>
          <option value="emergency">Emergency</option>
        </select>
      </td>
      <td className="px-2 py-1">
        <select className={`input-cell w-full ${riskClass(c.asa_score, ASA_SCORE_GOOD)}`} disabled={orDisabled} value={c.asa_score} onChange={(e) => onFieldChange({ asa_score: e.target.value })} onBlur={onFieldBlurSave}>
          <option value="">—</option>
          {ASA_SCORE_OPTIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1">
        <select className={`input-cell w-full min-w-[8rem] ${riskClass(c.wound_class, WOUND_CLASS_GOOD)}`} disabled={orDisabled} value={c.wound_class} onChange={(e) => onFieldChange({ wound_class: e.target.value })} onBlur={onFieldBlurSave}>
          <option value="">—</option>
          {WOUND_CLASS_OPTIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1">
        <select className="input-cell w-full min-w-[10rem]" disabled={orDisabled} value={c.duration_of_surgery} onChange={(e) => onFieldChange({ duration_of_surgery: e.target.value })} onBlur={onFieldBlurSave}>
          <option value="">—</option>
          {DURATION_OF_SURGERY_OPTIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1">
        <StageActionCell open={orOpen} done={orDone} canEdit={canEditSsi("OR")} canReopen={isAdmin} completedBy={c.or_completed_by} onMarkComplete={() => onMarkComplete("or")} onReopen={() => onReopen("or")} />
      </td>

      <td className="px-2 py-1">
        <select className="input-cell w-full" value={c.patos ? "Yes" : "No"} onChange={(e) => onPatosToggle(e.target.value === "Yes")}>
          <option value="No">No</option>
          <option value="Yes">Yes</option>
        </select>
      </td>
      <td className="px-2 py-1">
        <select className="input-cell w-full" value={c.follow_up_duration} onChange={(e) => onFieldChange({ follow_up_duration: Number(e.target.value) })} onBlur={onFieldBlurSave}>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
        </select>
      </td>

      {c.follow_ups.map((f, i) => (
        <FollowUpCells key={i} followUp={f} onChange={(patch) => onFollowUpFieldChange(i, patch)} onBlur={onFieldBlurSave} />
      ))}

      {c.specimens.map((s, i) => (
        <SpecimenCells
          key={i}
          specimen={s}
          hasDateResult={false}
          onChange={(patch) => onSpecimenFieldChange(i, patch)}
          onBlur={onFieldBlurSave}
          onMdroToggle={(checked) => onSpecimenMdroToggle(i, checked)}
        />
      ))}

      <td className="px-2 py-1"><GridText value={c.other_specimens} onChange={(e) => onFieldChange({ other_specimens: e.target.value })} onBlur={onFieldBlurSave} /></td>
      <td className="px-2 py-1 text-center">
        <input type="checkbox" checked={!!c.ssi_detected} onChange={(e) => onSsiDetectedToggle(e.target.checked)} />
      </td>
      <td className="px-2 py-1"><GridText value={c.type_of_ssi} onChange={(e) => onFieldChange({ type_of_ssi: e.target.value })} onBlur={onFieldBlurSave} disabled={!c.ssi_detected} className="min-w-[8rem]" /></td>

      <td className="px-2 py-1">
        <select className="input-cell w-full" disabled={drFwDisabled} value={c.current_status} onChange={(e) => onFieldChange({ current_status: e.target.value })} onBlur={onFieldBlurSave}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{statusLabel(s)}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1"><GridDate value={c.date_of_discharge} onChange={(e) => onFieldChange({ date_of_discharge: e.target.value })} onBlur={onFieldBlurSave} disabled={drFwDisabled} /></td>
      <td className="px-2 py-1">
        <StageActionCell open={drFwOpen} done={drFwDone} canEdit={canEditSsi("DR_FW")} canReopen={isAdmin} completedBy={c.dr_fw_completed_by} onMarkComplete={() => onMarkComplete("dr_fw")} onReopen={() => onReopen("dr_fw")} />
      </td>

      <td className="px-2 py-1"><GridText value={c.comments} onChange={(e) => onFieldChange({ comments: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[9rem]" /></td>
      <td className="px-2 py-1">
        <button onClick={onRemove} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}

function FollowUpCells({ followUp, onChange, onBlur }) {
  return (
    <>
      <td className="px-2 py-1"><GridText value={followUp.type} onChange={(e) => onChange({ type: e.target.value })} onBlur={onBlur} placeholder="OPD/ER/Phone/Virtual" className="min-w-[8rem]" /></td>
      <td className="px-2 py-1"><GridDate value={followUp.date} onChange={(e) => onChange({ date: e.target.value })} onBlur={onBlur} /></td>
      {SIGN_FIELDS.map((f) => (
        <td key={f} className="px-2 py-1">
          <SignSelect value={followUp[f]} onChange={(e) => onChange({ [f]: e.target.value })} onBlur={onBlur} />
        </td>
      ))}
      <td className="px-2 py-1">
        <SwabSelect value={followUp.surgical_site_swab_sent} onChange={(e) => onChange({ surgical_site_swab_sent: e.target.value })} onBlur={onBlur} />
      </td>
      <td className="px-2 py-1"><GridText value={followUp.wound_status} onChange={(e) => onChange({ wound_status: e.target.value })} onBlur={onBlur} className="min-w-[7rem]" /></td>
    </>
  );
}

function ObSurveillanceTab({ cases, loading, session, isAdmin, onAddCase, onUpdateField, onSave, onRemove, onMarkComplete, onReopen, onUpdateSpecimen }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-slate-500">
        A fixed 3-stage pipeline — <strong>OR → Delivery → Female Ward</strong>. Each stage's dedicated account (Settings → User Accounts,
        department = "OR" / "Delivery" / "Female Ward", or an OB/Delivery scope with specific stages granted) fills in only its own section,
        which opens once the previous stage is marked complete.
      </p>
      <div>
        <button onClick={onAddCase} className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700">
          <UserPlus className="h-3.5 w-3.5" />
          Add Patient
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              {["Patient Name", "MRN/ID", "Age", "Admission Diagnosis"].map((h) => (
                <th key={h} rowSpan={2} className="whitespace-nowrap border-b border-slate-200 px-2 py-2 font-medium align-bottom">{h}</th>
              ))}
              <th colSpan={7} className="border-b border-slate-200 px-2 py-1 text-center font-medium">OR</th>
              <th colSpan={4} className="border-b border-slate-200 px-2 py-1 text-center font-medium">Delivery</th>
              <th colSpan={11} className="border-b border-slate-200 px-2 py-1 text-center font-medium">Female Ward</th>
              {["Current Status", "Comments"].map((h) => (
                <th key={h} rowSpan={2} className="whitespace-nowrap border-b border-slate-200 px-2 py-2 font-medium align-bottom">{h}</th>
              ))}
              <th rowSpan={2}></th>
            </tr>
            <tr>
              {["Date of Procedure", "Surgical Procedure Type", "ASA Score", "Wound Class", "Duration of Surgery", "OR Notes", "Status"].map((h) => (
                <th key={`or-${h}`} className="whitespace-nowrap px-2 py-1 font-medium">{h}</th>
              ))}
              {["Date", "Signs & Symptoms", "Notes", "Status"].map((h) => (
                <th key={`dl-${h}`} className="whitespace-nowrap px-2 py-1 font-medium">{h}</th>
              ))}
              {["Date", "Signs & Symptoms", "Wound Status", "Notes", "Specimen Type", "Specimen Date Collected", "Organism", "MDRO", "SSI Detected", "Type of SSI", "Status"].map((h) => (
                <th key={`fw-${h}`} className="whitespace-nowrap px-2 py-1 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <ObRow
                key={c.id}
                c={c}
                session={session}
                isAdmin={isAdmin}
                onFieldChange={(patch) => onUpdateField(c.id, patch)}
                onFieldBlurSave={() => onSave(c)}
                onMarkComplete={(prefix) => onMarkComplete(c, prefix)}
                onReopen={(prefix) => onReopen(c, prefix)}
                onSpecimenFieldChange={(patch) => onUpdateSpecimen(c, 0, patch)}
                onSpecimenMdroToggle={(checked) => onSave(onUpdateSpecimen(c, 0, { mdro: checked }))}
                onSsiDetectedToggle={(checked) => {
                  onUpdateField(c.id, { ssi_detected: checked });
                  onSave({ ...c, ssi_detected: checked });
                }}
                onRemove={() => onRemove(c)}
              />
            ))}
          </tbody>
        </table>
        {!loading && cases.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No patients in this list.</p>}
      </div>
    </div>
  );
}

function StageActionCell({ open, done, canEdit, canReopen, completedBy, onMarkComplete, onReopen }) {
  if (!open) return <span className="whitespace-nowrap text-xs text-slate-400">Locked</span>;
  if (done) {
    return (
      <div className="flex flex-col gap-0.5 whitespace-nowrap text-xs text-slate-500">
        <span className="font-medium text-emerald-700">Done — {completedBy || "—"}</span>
        {canReopen && (
          <button onClick={onReopen} className="w-fit text-teal-600 hover:underline">
            Reopen
          </button>
        )}
      </div>
    );
  }
  if (canEdit) {
    return (
      <button onClick={onMarkComplete} className="whitespace-nowrap rounded-lg bg-teal-600 px-2 py-1 text-xs font-medium text-white hover:bg-teal-700">
        Mark complete
      </button>
    );
  }
  return <span className="whitespace-nowrap text-xs font-medium text-amber-600">Open</span>;
}

function ObRow({ c, session, isAdmin, onFieldChange, onFieldBlurSave, onMarkComplete, onReopen, onSpecimenFieldChange, onSpecimenMdroToggle, onSsiDetectedToggle, onRemove }) {
  const orDone = !!c.or_completed_at;
  const deliveryDone = !!c.delivery_completed_at;
  const fwDone = !!c.fw_completed_at;
  const deliveryOpen = orDone;
  const fwOpen = deliveryDone;

  function canEdit(dept) {
    return isAdmin || session?.department === dept || (session?.obStages ?? []).includes(dept);
  }

  const orDisabled = orDone || !canEdit("OR");
  const deliveryDisabled = !deliveryOpen || deliveryDone || !canEdit("Delivery");
  const fwDisabled = !fwOpen || fwDone || !canEdit("Female Ward");
  const specimen = c.specimens?.[0] ?? emptyObSpecimen;

  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50">
      <td className="px-2 py-1"><GridText value={c.patient_name} onChange={(e) => onFieldChange({ patient_name: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[10rem]" /></td>
      <td className="px-2 py-1"><GridText value={c.mrn} onChange={(e) => onFieldChange({ mrn: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[6rem]" /></td>
      <td className="px-2 py-1"><GridText value={c.age} onChange={(e) => onFieldChange({ age: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[4rem]" /></td>
      <td className="px-2 py-1"><GridText value={c.admission_diagnosis} onChange={(e) => onFieldChange({ admission_diagnosis: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[10rem]" /></td>

      <td className="px-2 py-1"><GridDate value={c.date_of_procedure} onChange={(e) => onFieldChange({ date_of_procedure: e.target.value })} onBlur={onFieldBlurSave} disabled={orDisabled} /></td>
      <td className="px-2 py-1"><GridText value={c.surgical_procedure_type} onChange={(e) => onFieldChange({ surgical_procedure_type: e.target.value })} onBlur={onFieldBlurSave} disabled={orDisabled} className="min-w-[9rem]" /></td>
      <td className="px-2 py-1"><GridText value={c.asa_score} onChange={(e) => onFieldChange({ asa_score: e.target.value })} onBlur={onFieldBlurSave} disabled={orDisabled} className="min-w-[5rem]" /></td>
      <td className="px-2 py-1"><GridText value={c.wound_class} onChange={(e) => onFieldChange({ wound_class: e.target.value })} onBlur={onFieldBlurSave} disabled={orDisabled} className="min-w-[8rem]" /></td>
      <td className="px-2 py-1"><GridText value={c.duration_of_surgery} onChange={(e) => onFieldChange({ duration_of_surgery: e.target.value })} onBlur={onFieldBlurSave} disabled={orDisabled} className="min-w-[6rem]" /></td>
      <td className="px-2 py-1"><GridText value={c.or_notes} onChange={(e) => onFieldChange({ or_notes: e.target.value })} onBlur={onFieldBlurSave} disabled={orDisabled} className="min-w-[10rem]" /></td>
      <td className="px-2 py-1">
        <StageActionCell open={true} done={orDone} canEdit={canEdit("OR")} canReopen={isAdmin} completedBy={c.or_completed_by} onMarkComplete={() => onMarkComplete("or")} onReopen={() => onReopen("or")} />
      </td>

      <td className="px-2 py-1"><GridDate value={c.delivery_date} onChange={(e) => onFieldChange({ delivery_date: e.target.value })} onBlur={onFieldBlurSave} disabled={deliveryDisabled} /></td>
      <td className="px-2 py-1"><GridText value={c.delivery_signs_symptoms} onChange={(e) => onFieldChange({ delivery_signs_symptoms: e.target.value })} onBlur={onFieldBlurSave} disabled={deliveryDisabled} className="min-w-[9rem]" /></td>
      <td className="px-2 py-1"><GridText value={c.delivery_notes} onChange={(e) => onFieldChange({ delivery_notes: e.target.value })} onBlur={onFieldBlurSave} disabled={deliveryDisabled} className="min-w-[10rem]" /></td>
      <td className="px-2 py-1">
        <StageActionCell open={deliveryOpen} done={deliveryDone} canEdit={canEdit("Delivery")} canReopen={isAdmin} completedBy={c.delivery_completed_by} onMarkComplete={() => onMarkComplete("delivery")} onReopen={() => onReopen("delivery")} />
      </td>

      <td className="px-2 py-1"><GridDate value={c.fw_date} onChange={(e) => onFieldChange({ fw_date: e.target.value })} onBlur={onFieldBlurSave} disabled={fwDisabled} /></td>
      <td className="px-2 py-1"><GridText value={c.fw_signs_symptoms} onChange={(e) => onFieldChange({ fw_signs_symptoms: e.target.value })} onBlur={onFieldBlurSave} disabled={fwDisabled} className="min-w-[9rem]" /></td>
      <td className="px-2 py-1"><GridText value={c.fw_wound_status} onChange={(e) => onFieldChange({ fw_wound_status: e.target.value })} onBlur={onFieldBlurSave} disabled={fwDisabled} className="min-w-[8rem]" /></td>
      <td className="px-2 py-1"><GridText value={c.fw_notes} onChange={(e) => onFieldChange({ fw_notes: e.target.value })} onBlur={onFieldBlurSave} disabled={fwDisabled} className="min-w-[10rem]" /></td>
      <td className="px-2 py-1"><GridText value={specimen.type} onChange={(e) => onSpecimenFieldChange({ type: e.target.value })} onBlur={onFieldBlurSave} disabled={fwDisabled} className="min-w-[7rem]" /></td>
      <td className="px-2 py-1"><GridDate value={specimen.date_collected} onChange={(e) => onSpecimenFieldChange({ date_collected: e.target.value })} onBlur={onFieldBlurSave} disabled={fwDisabled} /></td>
      <td className="px-2 py-1"><GridText value={specimen.organism} onChange={(e) => onSpecimenFieldChange({ organism: e.target.value })} onBlur={onFieldBlurSave} disabled={fwDisabled} className="min-w-[7rem]" /></td>
      <td className="px-2 py-1 text-center"><input type="checkbox" disabled={fwDisabled} checked={!!specimen.mdro} onChange={(e) => onSpecimenMdroToggle(e.target.checked)} /></td>
      <td className="px-2 py-1 text-center"><input type="checkbox" disabled={fwDisabled} checked={!!c.ssi_detected} onChange={(e) => onSsiDetectedToggle(e.target.checked)} /></td>
      <td className="px-2 py-1"><GridText value={c.type_of_ssi} onChange={(e) => onFieldChange({ type_of_ssi: e.target.value })} onBlur={onFieldBlurSave} disabled={fwDisabled || !c.ssi_detected} className="min-w-[8rem]" /></td>
      <td className="px-2 py-1">
        <StageActionCell open={fwOpen} done={fwDone} canEdit={canEdit("Female Ward")} canReopen={isAdmin} completedBy={c.fw_completed_by} onMarkComplete={() => onMarkComplete("fw")} onReopen={() => onReopen("fw")} />
      </td>

      <td className="px-2 py-1">
        <select className="input-cell w-full" value={c.current_status} onChange={(e) => onFieldChange({ current_status: e.target.value })} onBlur={onFieldBlurSave}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{statusLabel(s)}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1"><GridText value={c.comments} onChange={(e) => onFieldChange({ comments: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[10rem]" /></td>
      <td className="px-2 py-1">
        <button onClick={onRemove} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
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
