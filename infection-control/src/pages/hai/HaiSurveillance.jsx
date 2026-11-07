import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, FileSpreadsheet, FileText, Plus, Trash2, UserPlus } from "lucide-react";
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

const emptyPatientForm = {
  patient_name: "",
  mrn: "",
  age: "",
  gender: "",
  bed_no: "",
  icu_type: "",
  hospital_admission_date: "",
  unit_admission_date: todayStr(),
  admission_diagnosis: "",
};

const emptySpecimen = { type: "", date_collected: "", date_result: "", organism: "", mdro: false };

const TABS = [
  { key: "icu", label: "ICU/NICU Surveillance" },
  { key: "vae", label: "VAE Monitoring" },
  { key: "ssi", label: "SSI Surveillance" },
  { key: "ob", label: "OB/Delivery Surveillance" },
];

// Fixed 3-stage pipeline — each stage's section is only editable by an
// account whose department matches, and only once the previous stage
// has been marked complete.
const OB_STAGES = ["OR", "Delivery", "Female Ward"];

const emptyObForm = { patient_name: "", mrn: "", age: "", admission_diagnosis: "" };
const emptyObSpecimen = { type: "", date_collected: "", organism: "", mdro: false };

const emptySsiForm = {
  patient_name: "",
  mrn: "",
  unit: "",
  age: "",
  gender: "",
  admission_diagnosis: "",
  surgical_procedure_type: "",
  date_of_procedure: todayStr(),
  elective_emergency: "elective",
};

const emptyFollowUp = { type: "", date: "", signs_symptoms: "", wound_status: "" };
const emptySsiSpecimen = { type: "", date_collected: "", organism: "", mdro: false };

export default function HaiSurveillance() {
  const { session, config, isAdmin } = useAuth();
  const [tab, setTab] = useState("icu");
  const [patients, setPatients] = useState([]);
  const [vaeRows, setVaeRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [statusFilter, setStatusFilter] = useState("admitted");
  const [expanded, setExpanded] = useState(null);
  const [showPatientForm, setShowPatientForm] = useState(false);
  const [patientForm, setPatientForm] = useState(emptyPatientForm);
  const [ssiCases, setSsiCases] = useState([]);
  const [showSsiForm, setShowSsiForm] = useState(false);
  const [ssiForm, setSsiForm] = useState(emptySsiForm);
  const [obCases, setObCases] = useState([]);
  const [showObForm, setShowObForm] = useState(false);
  const [obForm, setObForm] = useState(emptyObForm);

  const icuTypes = config?.hai_icu_types ?? [];
  const units = config?.employee_departments ?? [];

  async function loadAll() {
    setLoading(true);
    const [{ data: pts }, { data: vae }, { data: ssi }, { data: ob }] = await Promise.all([
      fetchAllRows((from, to) => supabase.from("hai_icu_surveillance").select("*").eq("deleted", false).order("unit_admission_date", { ascending: false }).range(from, to)),
      fetchAllRows((from, to) => supabase.from("hai_vae_monitoring").select("*").order("date", { ascending: false }).range(from, to)),
      fetchAllRows((from, to) => supabase.from("hai_ssi_surveillance").select("*").eq("deleted", false).order("date_of_procedure", { ascending: false }).range(from, to)),
      fetchAllRows((from, to) => supabase.from("hai_ob_surveillance").select("*").eq("deleted", false).order("created_at", { ascending: false }).range(from, to)),
    ]);
    setPatients(pts ?? []);
    setVaeRows(vae ?? []);
    setSsiCases(ssi ?? []);
    setObCases(ob ?? []);
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
  const visibleSsiCases = useMemo(
    () => (statusFilter === "all" ? ssiCases : ssiCases.filter((c) => c.current_status === statusFilter)),
    [ssiCases, statusFilter]
  );
  const visibleObCases = useMemo(
    () => (statusFilter === "all" ? obCases : obCases.filter((c) => c.current_status === statusFilter)),
    [obCases, statusFilter]
  );

  const haiCount = useMemo(() => patients.filter((p) => p.current_status === "admitted" && p.hai_detected).length, [patients]);
  const ssiCount = useMemo(() => ssiCases.filter((c) => c.current_status === "admitted" && c.ssi_detected).length, [ssiCases]);

  function updatePatientField(id, patch) {
    setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function addPatient(e) {
    e.preventDefault();
    const name = patientForm.patient_name.trim();
    if (!name) return flash({ type: "error", text: "Patient name is required" });
    const { error } = await supabase.from("hai_icu_surveillance").insert({
      patient_name: name,
      mrn: patientForm.mrn.trim(),
      age: patientForm.age.trim(),
      gender: patientForm.gender,
      bed_no: patientForm.bed_no.trim(),
      icu_type: patientForm.icu_type,
      hospital_admission_date: patientForm.hospital_admission_date || null,
      unit_admission_date: patientForm.unit_admission_date || null,
      admission_diagnosis: patientForm.admission_diagnosis.trim(),
      done_by: session?.username,
    });
    if (error) return flash({ type: "error", text: "Could not add: " + error.message });
    setPatientForm(emptyPatientForm);
    setShowPatientForm(false);
    loadAll();
    flash({ type: "success", text: "Patient added" });
  }

  async function savePatient(p) {
    await supabase
      .from("hai_icu_surveillance")
      .update({
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
      })
      .eq("id", p.id);
    flash({ type: "success", text: "Saved" });
  }

  async function removePatient(p) {
    if (!confirm(`Remove "${p.patient_name}" from HAI Surveillance?`)) return;
    await supabase.from("hai_icu_surveillance").update({ deleted: true, deleted_by: session?.username, deleted_at: new Date().toISOString() }).eq("id", p.id);
    loadAll();
  }

  function addSpecimen(p) {
    updatePatientField(p.id, { specimens: [...(p.specimens ?? []), { ...emptySpecimen }] });
  }
  function updateSpecimen(p, index, patch) {
    const next = (p.specimens ?? []).map((s, i) => (i === index ? { ...s, ...patch } : s));
    updatePatientField(p.id, { specimens: next });
  }
  function removeSpecimen(p, index) {
    updatePatientField(p.id, { specimens: (p.specimens ?? []).filter((_, i) => i !== index) });
  }
  function toggleEventType(p, type) {
    const current = p.hai_event_types ?? [];
    const next = current.includes(type) ? current.filter((t) => t !== type) : [...current, type];
    updatePatientField(p.id, { hai_event_types: next });
  }

  function updateSsiField(id, patch) {
    setSsiCases((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function addSsiCase(e) {
    e.preventDefault();
    const name = ssiForm.patient_name.trim();
    if (!name) return flash({ type: "error", text: "Patient name is required" });
    const { error } = await supabase.from("hai_ssi_surveillance").insert({
      patient_name: name,
      mrn: ssiForm.mrn.trim(),
      unit: ssiForm.unit,
      age: ssiForm.age.trim(),
      gender: ssiForm.gender,
      admission_diagnosis: ssiForm.admission_diagnosis.trim(),
      surgical_procedure_type: ssiForm.surgical_procedure_type.trim(),
      date_of_procedure: ssiForm.date_of_procedure || null,
      elective_emergency: ssiForm.elective_emergency,
      done_by: session?.username,
    });
    if (error) return flash({ type: "error", text: "Could not add: " + error.message });
    setSsiForm(emptySsiForm);
    setShowSsiForm(false);
    loadAll();
    flash({ type: "success", text: "Case added" });
  }

  async function saveSsiCase(c) {
    await supabase
      .from("hai_ssi_surveillance")
      .update({
        patient_name: c.patient_name,
        mrn: c.mrn,
        unit: c.unit,
        age: c.age,
        gender: c.gender,
        admission_diagnosis: c.admission_diagnosis,
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
        comments: c.comments,
      })
      .eq("id", c.id);
    flash({ type: "success", text: "Saved" });
  }

  async function removeSsiCase(c) {
    if (!confirm(`Remove "${c.patient_name}" from SSI Surveillance?`)) return;
    await supabase.from("hai_ssi_surveillance").update({ deleted: true, deleted_by: session?.username, deleted_at: new Date().toISOString() }).eq("id", c.id);
    loadAll();
  }

  function addFollowUp(c) {
    updateSsiField(c.id, { follow_ups: [...(c.follow_ups ?? []), { ...emptyFollowUp }] });
  }
  function updateFollowUp(c, index, patch) {
    const next = (c.follow_ups ?? []).map((f, i) => (i === index ? { ...f, ...patch } : f));
    updateSsiField(c.id, { follow_ups: next });
  }
  function removeFollowUp(c, index) {
    updateSsiField(c.id, { follow_ups: (c.follow_ups ?? []).filter((_, i) => i !== index) });
  }

  function addSsiSpecimen(c) {
    updateSsiField(c.id, { specimens: [...(c.specimens ?? []), { ...emptySsiSpecimen }] });
  }
  function updateSsiSpecimen(c, index, patch) {
    const next = (c.specimens ?? []).map((s, i) => (i === index ? { ...s, ...patch } : s));
    updateSsiField(c.id, { specimens: next });
  }
  function removeSsiSpecimen(c, index) {
    updateSsiField(c.id, { specimens: (c.specimens ?? []).filter((_, i) => i !== index) });
  }

  function exportSsiExcel() {
    downloadExcel(`infection-control-hai-ssi-${todayStr()}`, [
      {
        name: "SSI Surveillance",
        headers: [
          "Patient Name", "MRN", "Unit", "Age", "Gender", "Admission Diagnosis", "Surgical Procedure", "Date of Procedure", "Elective/Emergency",
          "ASA Score", "Wound Class", "Duration of Surgery", "PATOS", "Follow-up Duration", "SSI Detected", "Type of SSI", "Current Status", "Comments", "Recorded By",
        ],
        rows: visibleSsiCases.map((c) => [
          c.patient_name, c.mrn, c.unit, c.age, c.gender, c.admission_diagnosis, c.surgical_procedure_type, c.date_of_procedure || "", c.elective_emergency,
          c.asa_score, c.wound_class, c.duration_of_surgery, c.patos ? "Yes" : "No", `${c.follow_up_duration} days`,
          c.ssi_detected ? "Yes" : "No", c.type_of_ssi, statusLabel(c.current_status), c.comments, c.done_by,
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

  function updateObField(id, patch) {
    setObCases((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function addObCase(e) {
    e.preventDefault();
    const name = obForm.patient_name.trim();
    if (!name) return flash({ type: "error", text: "Patient name is required" });
    const { error } = await supabase.from("hai_ob_surveillance").insert({
      patient_name: name,
      mrn: obForm.mrn.trim(),
      age: obForm.age.trim(),
      admission_diagnosis: obForm.admission_diagnosis.trim(),
      done_by: session?.username,
    });
    if (error) return flash({ type: "error", text: "Could not add: " + error.message });
    setObForm(emptyObForm);
    setShowObForm(false);
    loadAll();
    flash({ type: "success", text: "Patient added" });
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

  function addObSpecimen(c) {
    updateObField(c.id, { specimens: [...(c.specimens ?? []), { ...emptyObSpecimen }] });
  }
  function updateObSpecimen(c, index, patch) {
    const next = (c.specimens ?? []).map((s, i) => (i === index ? { ...s, ...patch } : s));
    updateObField(c.id, { specimens: next });
  }
  function removeObSpecimen(c, index) {
    updateObField(c.id, { specimens: (c.specimens ?? []).filter((_, i) => i !== index) });
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
    downloadExcel(`infection-control-hai-icu-${todayStr()}`, [
      {
        name: "ICU-NICU Surveillance",
        headers: [
          "Patient Name", "MRN", "Age", "Gender", "Bed", "ICU Type", "Hospital Admission", "Unit Admission", "Admission Diagnosis",
          "Central Line Insertion", "Central Line Removed", "Urinary Catheter Insertion", "Urinary Catheter Removed",
          "Ventilator Insertion", "Ventilator Removed", "Signs & Symptoms", "Onset Date", "HAI Detected", "Event Types", "Current Status", "Comments", "Recorded By",
        ],
        rows: visiblePatients.map((p) => [
          p.patient_name, p.mrn, p.age, p.gender, p.bed_no, p.icu_type, p.hospital_admission_date || "", p.unit_admission_date || "", p.admission_diagnosis,
          p.central_line_insertion || "", p.central_line_removed || "", p.urinary_catheter_insertion || "", p.urinary_catheter_removed || "",
          p.ventilator_insertion || "", p.ventilator_removed || "", p.signs_symptoms, p.date_onset_symptoms || "",
          p.hai_detected ? "Yes" : "No", (p.hai_event_types ?? []).join(", "), statusLabel(p.current_status), p.comments, p.done_by,
        ]),
      },
    ]);
  }

  function exportIcuPdf() {
    downloadPdf(`infection-control-hai-icu-${todayStr()}`, "HAI Surveillance — ICU/NICU", [
      {
        headers: ["Patient", "MRN", "ICU Type", "Unit Admission", "Status", "HAI Detected", "Event Types"],
        rows: visiblePatients.map((p) => [p.patient_name, p.mrn, p.icu_type, p.unit_admission_date || "", statusLabel(p.current_status), p.hai_detected ? "Yes" : "No", (p.hai_event_types ?? []).join(", ")]),
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

      <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs w-fit">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`rounded-md px-3 py-1 font-medium ${tab === t.key ? "bg-teal-600 text-white" : "text-slate-500"}`}>
            {t.label}
          </button>
        ))}
      </div>

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
          patients={visiblePatients}
          loading={loading}
          icuTypes={icuTypes}
          showPatientForm={showPatientForm}
          setShowPatientForm={setShowPatientForm}
          patientForm={patientForm}
          setPatientForm={setPatientForm}
          onAddPatient={addPatient}
          expanded={expanded}
          setExpanded={setExpanded}
          onUpdateField={updatePatientField}
          onSave={savePatient}
          onRemove={removePatient}
          onAddSpecimen={addSpecimen}
          onUpdateSpecimen={updateSpecimen}
          onRemoveSpecimen={removeSpecimen}
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
        <SsiSurveillanceTab
          cases={visibleSsiCases}
          loading={loading}
          units={units}
          showForm={showSsiForm}
          setShowForm={setShowSsiForm}
          form={ssiForm}
          setForm={setSsiForm}
          onAddCase={addSsiCase}
          expanded={expanded}
          setExpanded={setExpanded}
          onUpdateField={updateSsiField}
          onSave={saveSsiCase}
          onRemove={removeSsiCase}
          onAddFollowUp={addFollowUp}
          onUpdateFollowUp={updateFollowUp}
          onRemoveFollowUp={removeFollowUp}
          onAddSpecimen={addSsiSpecimen}
          onUpdateSpecimen={updateSsiSpecimen}
          onRemoveSpecimen={removeSsiSpecimen}
        />
      )}

      {tab === "ob" && (
        <ObSurveillanceTab
          cases={visibleObCases}
          loading={loading}
          session={session}
          isAdmin={isAdmin}
          showForm={showObForm}
          setShowForm={setShowObForm}
          form={obForm}
          setForm={setObForm}
          onAddCase={addObCase}
          expanded={expanded}
          setExpanded={setExpanded}
          onUpdateField={updateObField}
          onSave={saveObCase}
          onRemove={removeObCase}
          onMarkComplete={markStageComplete}
          onReopen={reopenStage}
          onAddSpecimen={addObSpecimen}
          onUpdateSpecimen={updateObSpecimen}
          onRemoveSpecimen={removeObSpecimen}
        />
      )}
    </div>
  );
}

function IcuSurveillanceTab({
  patients, loading, icuTypes, showPatientForm, setShowPatientForm, patientForm, setPatientForm, onAddPatient,
  expanded, setExpanded, onUpdateField, onSave, onRemove, onAddSpecimen, onUpdateSpecimen, onRemoveSpecimen, onToggleEventType,
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <button
          onClick={() => setShowPatientForm((v) => !v)}
          className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Add Patient
        </button>
      </div>
      {showPatientForm && (
        <form onSubmit={onAddPatient} className="grid grid-cols-1 gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 sm:grid-cols-4">
          <input className="input" placeholder="Patient Name" value={patientForm.patient_name} onChange={(e) => setPatientForm({ ...patientForm, patient_name: e.target.value })} required />
          <input className="input" placeholder="MRN / ID" value={patientForm.mrn} onChange={(e) => setPatientForm({ ...patientForm, mrn: e.target.value })} />
          <input className="input" placeholder="Age" value={patientForm.age} onChange={(e) => setPatientForm({ ...patientForm, age: e.target.value })} />
          <select className="input" value={patientForm.gender} onChange={(e) => setPatientForm({ ...patientForm, gender: e.target.value })}>
            <option value="">Gender</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
          </select>
          <input className="input" placeholder="Bed #" value={patientForm.bed_no} onChange={(e) => setPatientForm({ ...patientForm, bed_no: e.target.value })} />
          <select className="input" value={patientForm.icu_type} onChange={(e) => setPatientForm({ ...patientForm, icu_type: e.target.value })}>
            <option value="">ICU Type</option>
            {icuTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Hospital Admission
            <input type="date" className="input" value={patientForm.hospital_admission_date} onChange={(e) => setPatientForm({ ...patientForm, hospital_admission_date: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Unit Admission
            <input type="date" className="input" value={patientForm.unit_admission_date} onChange={(e) => setPatientForm({ ...patientForm, unit_admission_date: e.target.value })} />
          </label>
          <input
            className="input sm:col-span-3"
            placeholder="Admission Diagnosis"
            value={patientForm.admission_diagnosis}
            onChange={(e) => setPatientForm({ ...patientForm, admission_diagnosis: e.target.value })}
          />
          <button type="submit" className="flex items-center justify-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
            <Plus className="h-4 w-4" />
            Save
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Patient</th>
              <th className="px-3 py-2 font-medium">ICU Type</th>
              <th className="px-3 py-2 font-medium">Bed</th>
              <th className="px-3 py-2 font-medium">Unit Admission</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">HAI Event</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {patients.map((p) => (
              <PatientRow
                key={p.id}
                p={p}
                icuTypes={icuTypes}
                expanded={expanded === p.id}
                onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
                onUpdateField={(patch) => onUpdateField(p.id, patch)}
                onSave={() => onSave(p)}
                onRemove={() => onRemove(p)}
                onAddSpecimen={() => onAddSpecimen(p)}
                onUpdateSpecimen={(i, patch) => onUpdateSpecimen(p, i, patch)}
                onRemoveSpecimen={(i) => onRemoveSpecimen(p, i)}
                onToggleEventType={(type) => onToggleEventType(p, type)}
              />
            ))}
          </tbody>
        </table>
        {!loading && patients.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No patients in this list.</p>}
      </div>
    </div>
  );
}

function PatientRow({ p, icuTypes, expanded, onToggle, onUpdateField, onSave, onRemove, onAddSpecimen, onUpdateSpecimen, onRemoveSpecimen, onToggleEventType }) {
  return (
    <>
      <tr className="border-t border-slate-100 hover:bg-slate-50">
        <td className="px-3 py-2">
          <div className="font-medium text-slate-700">{p.patient_name}</div>
          <div className="text-xs text-slate-400">{p.mrn}</div>
        </td>
        <td className="px-3 py-2">{p.icu_type}</td>
        <td className="px-3 py-2">{p.bed_no}</td>
        <td className="px-3 py-2">{p.unit_admission_date}</td>
        <td className="px-3 py-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(p.current_status)}`}>{statusLabel(p.current_status)}</span>
        </td>
        <td className="px-3 py-2">
          {p.hai_detected ? (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">{(p.hai_event_types ?? []).join(", ") || "Yes"}</span>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </td>
        <td className="flex items-center justify-end gap-1 px-3 py-2">
          <button onClick={onRemove} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
            <Trash2 className="h-4 w-4" />
          </button>
          <button onClick={onToggle} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-slate-100 bg-slate-50/60">
          <td colSpan={7} className="px-4 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Patient Name">
                <input className="input" value={p.patient_name} onChange={(e) => onUpdateField({ patient_name: e.target.value })} />
              </Field>
              <Field label="MRN / ID">
                <input className="input" value={p.mrn} onChange={(e) => onUpdateField({ mrn: e.target.value })} />
              </Field>
              <Field label="Age">
                <input className="input" value={p.age} onChange={(e) => onUpdateField({ age: e.target.value })} />
              </Field>
              <Field label="Gender">
                <select className="input" value={p.gender} onChange={(e) => onUpdateField({ gender: e.target.value })}>
                  <option value="">—</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </Field>
              <Field label="Bed #">
                <input className="input" value={p.bed_no} onChange={(e) => onUpdateField({ bed_no: e.target.value })} />
              </Field>
              <Field label="ICU Type">
                <select className="input" value={p.icu_type} onChange={(e) => onUpdateField({ icu_type: e.target.value })}>
                  <option value="">—</option>
                  {icuTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Hospital Admission">
                <input type="date" className="input" value={p.hospital_admission_date || ""} onChange={(e) => onUpdateField({ hospital_admission_date: e.target.value })} />
              </Field>
              <Field label="Unit Admission">
                <input type="date" className="input" value={p.unit_admission_date || ""} onChange={(e) => onUpdateField({ unit_admission_date: e.target.value })} />
              </Field>
              <Field label="Current Status">
                <select className="input" value={p.current_status} onChange={(e) => onUpdateField({ current_status: e.target.value })}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{statusLabel(s)}</option>
                  ))}
                </select>
              </Field>
              <Field label="Admission Diagnosis">
                <input className="input" value={p.admission_diagnosis} onChange={(e) => onUpdateField({ admission_diagnosis: e.target.value })} />
              </Field>
            </div>

            <h3 className="mt-4 mb-2 text-xs font-semibold uppercase text-slate-500">Devices</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <DevicePair label="Central Line" insertion={p.central_line_insertion} removed={p.central_line_removed}
                onChange={(patch) => onUpdateField(patch)} fieldInsertion="central_line_insertion" fieldRemoved="central_line_removed" />
              <DevicePair label="Urinary Catheter" insertion={p.urinary_catheter_insertion} removed={p.urinary_catheter_removed}
                onChange={(patch) => onUpdateField(patch)} fieldInsertion="urinary_catheter_insertion" fieldRemoved="urinary_catheter_removed" />
              <DevicePair label="Ventilator" insertion={p.ventilator_insertion} removed={p.ventilator_removed}
                onChange={(patch) => onUpdateField(patch)} fieldInsertion="ventilator_insertion" fieldRemoved="ventilator_removed" />
            </div>
            <Field label="Device Reinsertion Note (if any)">
              <input className="input mt-2" value={p.device_reinsertion_note} onChange={(e) => onUpdateField({ device_reinsertion_note: e.target.value })} />
            </Field>

            <h3 className="mt-4 mb-2 text-xs font-semibold uppercase text-slate-500">Signs & Specimens</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Signs & Symptoms">
                <input className="input" value={p.signs_symptoms} onChange={(e) => onUpdateField({ signs_symptoms: e.target.value })} />
              </Field>
              <Field label="Date of Onset">
                <input type="date" className="input" value={p.date_onset_symptoms || ""} onChange={(e) => onUpdateField({ date_onset_symptoms: e.target.value })} />
              </Field>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              {(p.specimens ?? []).map((s, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 rounded-lg bg-white p-2 sm:grid-cols-6 sm:items-center">
                  <input className="input-cell" placeholder="Type of specimen" value={s.type} onChange={(e) => onUpdateSpecimen(i, { type: e.target.value })} />
                  <input type="date" className="input-cell" placeholder="Date collected" value={s.date_collected} onChange={(e) => onUpdateSpecimen(i, { date_collected: e.target.value })} />
                  <input type="date" className="input-cell" placeholder="Date of result" value={s.date_result} onChange={(e) => onUpdateSpecimen(i, { date_result: e.target.value })} />
                  <input className="input-cell" placeholder="Organism" value={s.organism} onChange={(e) => onUpdateSpecimen(i, { organism: e.target.value })} />
                  <label className="flex items-center gap-1 text-xs text-slate-500">
                    <input type="checkbox" checked={!!s.mdro} onChange={(e) => onUpdateSpecimen(i, { mdro: e.target.checked })} />
                    MDRO
                  </label>
                  <button onClick={() => onRemoveSpecimen(i)} className="justify-self-end rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button onClick={onAddSpecimen} className="flex w-fit items-center gap-1 text-xs font-medium text-teal-600 hover:underline">
                <Plus className="h-3.5 w-3.5" />
                Add specimen
              </button>
            </div>
            <Field label="Other Specimens (if any)">
              <input className="input mt-2" value={p.other_specimens} onChange={(e) => onUpdateField({ other_specimens: e.target.value })} />
            </Field>

            <h3 className="mt-4 mb-2 text-xs font-semibold uppercase text-slate-500">HAI Event</h3>
            <label className="mb-2 flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={!!p.hai_detected} onChange={(e) => onUpdateField({ hai_detected: e.target.checked })} />
              HAI Detected
            </label>
            {p.hai_detected && (
              <div className="mb-3 flex flex-wrap gap-3">
                {EVENT_TYPES.map((type) => (
                  <label key={type} className="flex items-center gap-1 text-xs text-slate-600">
                    <input type="checkbox" checked={(p.hai_event_types ?? []).includes(type)} onChange={() => onToggleEventType(type)} />
                    {type}
                  </label>
                ))}
              </div>
            )}
            <Field label="Comments">
              <textarea className="input min-h-[60px]" value={p.comments} onChange={(e) => onUpdateField({ comments: e.target.value })} />
            </Field>

            <button onClick={onSave} className="mt-3 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
              Save
            </button>
          </td>
        </tr>
      )}
    </>
  );
}

function DevicePair({ label, insertion, removed, onChange, fieldInsertion, fieldRemoved }) {
  return (
    <div className="rounded-lg bg-white p-3">
      <div className="mb-1 text-xs font-medium text-slate-600">{label}</div>
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-[11px] text-slate-400">
          Inserted
          <input type="date" className="input" value={insertion || ""} onChange={(e) => onChange({ [fieldInsertion]: e.target.value })} />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-[11px] text-slate-400">
          Removed
          <input type="date" className="input" value={removed || ""} onChange={(e) => onChange({ [fieldRemoved]: e.target.value })} />
        </label>
      </div>
    </div>
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

function SsiSurveillanceTab({
  cases, loading, units, showForm, setShowForm, form, setForm, onAddCase,
  expanded, setExpanded, onUpdateField, onSave, onRemove, onAddFollowUp, onUpdateFollowUp, onRemoveFollowUp, onAddSpecimen, onUpdateSpecimen, onRemoveSpecimen,
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Add Patient
        </button>
      </div>
      {showForm && (
        <form onSubmit={onAddCase} className="grid grid-cols-1 gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 sm:grid-cols-4">
          <input className="input" placeholder="Patient Name" value={form.patient_name} onChange={(e) => setForm({ ...form, patient_name: e.target.value })} required />
          <input className="input" placeholder="MRN / ID" value={form.mrn} onChange={(e) => setForm({ ...form, mrn: e.target.value })} />
          <select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
            <option value="">Unit</option>
            {units.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
          <input className="input" placeholder="Age" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
          <select className="input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
            <option value="">Gender</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
          </select>
          <input className="input" placeholder="Surgical Procedure Type" value={form.surgical_procedure_type} onChange={(e) => setForm({ ...form, surgical_procedure_type: e.target.value })} />
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Date of Procedure
            <input type="date" className="input" value={form.date_of_procedure} onChange={(e) => setForm({ ...form, date_of_procedure: e.target.value })} />
          </label>
          <select className="input" value={form.elective_emergency} onChange={(e) => setForm({ ...form, elective_emergency: e.target.value })}>
            <option value="elective">Elective</option>
            <option value="emergency">Emergency</option>
          </select>
          <input
            className="input sm:col-span-4"
            placeholder="Admission Diagnosis"
            value={form.admission_diagnosis}
            onChange={(e) => setForm({ ...form, admission_diagnosis: e.target.value })}
          />
          <button type="submit" className="flex items-center justify-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
            <Plus className="h-4 w-4" />
            Save
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Patient</th>
              <th className="px-3 py-2 font-medium">Procedure</th>
              <th className="px-3 py-2 font-medium">Date of Procedure</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">SSI</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <SsiCaseRow
                key={c.id}
                c={c}
                units={units}
                expanded={expanded === c.id}
                onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
                onUpdateField={(patch) => onUpdateField(c.id, patch)}
                onSave={() => onSave(c)}
                onRemove={() => onRemove(c)}
                onAddFollowUp={() => onAddFollowUp(c)}
                onUpdateFollowUp={(i, patch) => onUpdateFollowUp(c, i, patch)}
                onRemoveFollowUp={(i) => onRemoveFollowUp(c, i)}
                onAddSpecimen={() => onAddSpecimen(c)}
                onUpdateSpecimen={(i, patch) => onUpdateSpecimen(c, i, patch)}
                onRemoveSpecimen={(i) => onRemoveSpecimen(c, i)}
              />
            ))}
          </tbody>
        </table>
        {!loading && cases.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No patients in this list.</p>}
      </div>
    </div>
  );
}

function SsiCaseRow({ c, units, expanded, onToggle, onUpdateField, onSave, onRemove, onAddFollowUp, onUpdateFollowUp, onRemoveFollowUp, onAddSpecimen, onUpdateSpecimen, onRemoveSpecimen }) {
  return (
    <>
      <tr className="border-t border-slate-100 hover:bg-slate-50">
        <td className="px-3 py-2">
          <div className="font-medium text-slate-700">{c.patient_name}</div>
          <div className="text-xs text-slate-400">{c.mrn}</div>
        </td>
        <td className="px-3 py-2">{c.surgical_procedure_type}</td>
        <td className="px-3 py-2">{c.date_of_procedure}</td>
        <td className="px-3 py-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(c.current_status)}`}>{statusLabel(c.current_status)}</span>
        </td>
        <td className="px-3 py-2">
          {c.ssi_detected ? (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">{c.type_of_ssi || "Yes"}</span>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </td>
        <td className="flex items-center justify-end gap-1 px-3 py-2">
          <button onClick={onRemove} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
            <Trash2 className="h-4 w-4" />
          </button>
          <button onClick={onToggle} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-slate-100 bg-slate-50/60">
          <td colSpan={6} className="px-4 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Patient Name">
                <input className="input" value={c.patient_name} onChange={(e) => onUpdateField({ patient_name: e.target.value })} />
              </Field>
              <Field label="MRN / ID">
                <input className="input" value={c.mrn} onChange={(e) => onUpdateField({ mrn: e.target.value })} />
              </Field>
              <Field label="Unit">
                <select className="input" value={c.unit} onChange={(e) => onUpdateField({ unit: e.target.value })}>
                  <option value="">—</option>
                  {units.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </Field>
              <Field label="Age">
                <input className="input" value={c.age} onChange={(e) => onUpdateField({ age: e.target.value })} />
              </Field>
              <Field label="Gender">
                <select className="input" value={c.gender} onChange={(e) => onUpdateField({ gender: e.target.value })}>
                  <option value="">—</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </Field>
              <Field label="Current Status">
                <select className="input" value={c.current_status} onChange={(e) => onUpdateField({ current_status: e.target.value })}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{statusLabel(s)}</option>
                  ))}
                </select>
              </Field>
              <Field label="Admission Diagnosis">
                <input className="input" value={c.admission_diagnosis} onChange={(e) => onUpdateField({ admission_diagnosis: e.target.value })} />
              </Field>
              <Field label="Surgical Procedure Type">
                <input className="input" value={c.surgical_procedure_type} onChange={(e) => onUpdateField({ surgical_procedure_type: e.target.value })} />
              </Field>
              <Field label="Date of Procedure">
                <input type="date" className="input" value={c.date_of_procedure || ""} onChange={(e) => onUpdateField({ date_of_procedure: e.target.value })} />
              </Field>
              <Field label="Elective / Emergency">
                <select className="input" value={c.elective_emergency} onChange={(e) => onUpdateField({ elective_emergency: e.target.value })}>
                  <option value="elective">Elective</option>
                  <option value="emergency">Emergency</option>
                </select>
              </Field>
            </div>

            <h3 className="mt-4 mb-2 text-xs font-semibold uppercase text-slate-500">Risk Category Index</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="ASA Score">
                <input className="input" value={c.asa_score} onChange={(e) => onUpdateField({ asa_score: e.target.value })} />
              </Field>
              <Field label="Wound Class">
                <input className="input" value={c.wound_class} onChange={(e) => onUpdateField({ wound_class: e.target.value })} />
              </Field>
              <Field label="Duration of Surgery">
                <input className="input" value={c.duration_of_surgery} onChange={(e) => onUpdateField({ duration_of_surgery: e.target.value })} />
              </Field>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={!!c.patos} onChange={(e) => onUpdateField({ patos: e.target.checked })} />
                PATOS — pre-existing infection/abscess at time of surgery
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                Follow-up duration
                <select className="input" value={c.follow_up_duration} onChange={(e) => onUpdateField({ follow_up_duration: Number(e.target.value) })}>
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                </select>
              </label>
            </div>

            <h3 className="mt-4 mb-2 text-xs font-semibold uppercase text-slate-500">Post-Discharge Follow-ups</h3>
            <div className="flex flex-col gap-2">
              {(c.follow_ups ?? []).map((f, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 rounded-lg bg-white p-2 sm:grid-cols-5 sm:items-center">
                  <input className="input-cell" placeholder="Type (OPD/ER/Phone/Virtual)" value={f.type} onChange={(e) => onUpdateFollowUp(i, { type: e.target.value })} />
                  <input type="date" className="input-cell" value={f.date} onChange={(e) => onUpdateFollowUp(i, { date: e.target.value })} />
                  <input className="input-cell" placeholder="Signs & Symptoms" value={f.signs_symptoms} onChange={(e) => onUpdateFollowUp(i, { signs_symptoms: e.target.value })} />
                  <input className="input-cell" placeholder="Wound Status" value={f.wound_status} onChange={(e) => onUpdateFollowUp(i, { wound_status: e.target.value })} />
                  <button onClick={() => onRemoveFollowUp(i)} className="justify-self-end rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button onClick={onAddFollowUp} className="flex w-fit items-center gap-1 text-xs font-medium text-teal-600 hover:underline">
                <Plus className="h-3.5 w-3.5" />
                Add follow-up
              </button>
            </div>

            <h3 className="mt-4 mb-2 text-xs font-semibold uppercase text-slate-500">Specimens</h3>
            <div className="flex flex-col gap-2">
              {(c.specimens ?? []).map((s, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 rounded-lg bg-white p-2 sm:grid-cols-5 sm:items-center">
                  <input className="input-cell" placeholder="Type of specimen" value={s.type} onChange={(e) => onUpdateSpecimen(i, { type: e.target.value })} />
                  <input type="date" className="input-cell" value={s.date_collected} onChange={(e) => onUpdateSpecimen(i, { date_collected: e.target.value })} />
                  <input className="input-cell" placeholder="Organism" value={s.organism} onChange={(e) => onUpdateSpecimen(i, { organism: e.target.value })} />
                  <label className="flex items-center gap-1 text-xs text-slate-500">
                    <input type="checkbox" checked={!!s.mdro} onChange={(e) => onUpdateSpecimen(i, { mdro: e.target.checked })} />
                    MDRO
                  </label>
                  <button onClick={() => onRemoveSpecimen(i)} className="justify-self-end rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button onClick={onAddSpecimen} className="flex w-fit items-center gap-1 text-xs font-medium text-teal-600 hover:underline">
                <Plus className="h-3.5 w-3.5" />
                Add specimen
              </button>
            </div>
            <Field label="Other Specimens (if any)">
              <input className="input mt-2" value={c.other_specimens} onChange={(e) => onUpdateField({ other_specimens: e.target.value })} />
            </Field>

            <h3 className="mt-4 mb-2 text-xs font-semibold uppercase text-slate-500">SSI</h3>
            <label className="mb-2 flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={!!c.ssi_detected} onChange={(e) => onUpdateField({ ssi_detected: e.target.checked })} />
              SSI Detected
            </label>
            {c.ssi_detected && (
              <Field label="Type of SSI">
                <input className="input mb-2" value={c.type_of_ssi} onChange={(e) => onUpdateField({ type_of_ssi: e.target.value })} />
              </Field>
            )}
            <Field label="Comments">
              <textarea className="input min-h-[60px]" value={c.comments} onChange={(e) => onUpdateField({ comments: e.target.value })} />
            </Field>

            <button onClick={onSave} className="mt-3 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
              Save
            </button>
          </td>
        </tr>
      )}
    </>
  );
}

function ObSurveillanceTab({
  cases, loading, session, isAdmin, showForm, setShowForm, form, setForm, onAddCase,
  expanded, setExpanded, onUpdateField, onSave, onRemove, onMarkComplete, onReopen, onAddSpecimen, onUpdateSpecimen, onRemoveSpecimen,
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-slate-500">
        A fixed 3-stage pipeline — <strong>OR → Delivery → Female Ward</strong>. Each stage's dedicated account (Settings → User Accounts,
        department = "OR" / "Delivery" / "Female Ward") fills in only its own section, which opens once the previous stage is marked complete.
      </p>
      <div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Add Patient
        </button>
      </div>
      {showForm && (
        <form onSubmit={onAddCase} className="grid grid-cols-1 gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 sm:grid-cols-4">
          <input className="input" placeholder="Patient Name" value={form.patient_name} onChange={(e) => setForm({ ...form, patient_name: e.target.value })} required />
          <input className="input" placeholder="MRN / ID" value={form.mrn} onChange={(e) => setForm({ ...form, mrn: e.target.value })} />
          <input className="input" placeholder="Age" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
          <input className="input" placeholder="Admission Diagnosis" value={form.admission_diagnosis} onChange={(e) => setForm({ ...form, admission_diagnosis: e.target.value })} />
          <button type="submit" className="flex items-center justify-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
            <Plus className="h-4 w-4" />
            Save
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Patient</th>
              <th className="px-3 py-2 font-medium">Procedure</th>
              <th className="px-3 py-2 font-medium">OR</th>
              <th className="px-3 py-2 font-medium">Delivery</th>
              <th className="px-3 py-2 font-medium">Female Ward</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <ObCaseRow
                key={c.id}
                c={c}
                session={session}
                isAdmin={isAdmin}
                expanded={expanded === c.id}
                onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
                onUpdateField={(patch) => onUpdateField(c.id, patch)}
                onSave={() => onSave(c)}
                onRemove={() => onRemove(c)}
                onMarkComplete={(prefix) => onMarkComplete(c, prefix)}
                onReopen={(prefix) => onReopen(c, prefix)}
                onAddSpecimen={() => onAddSpecimen(c)}
                onUpdateSpecimen={(i, patch) => onUpdateSpecimen(c, i, patch)}
                onRemoveSpecimen={(i) => onRemoveSpecimen(c, i)}
              />
            ))}
          </tbody>
        </table>
        {!loading && cases.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No patients in this list.</p>}
      </div>
    </div>
  );
}

function stageBadge(label, done, open) {
  const cls = done ? "bg-emerald-50 text-emerald-700" : open ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-400";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{done ? "Done" : open ? "Open" : "Locked"}</span>;
}

function ObCaseRow({ c, session, isAdmin, expanded, onToggle, onUpdateField, onSave, onRemove, onMarkComplete, onReopen, onAddSpecimen, onUpdateSpecimen, onRemoveSpecimen }) {
  const orDone = !!c.or_completed_at;
  const deliveryDone = !!c.delivery_completed_at;
  const fwDone = !!c.fw_completed_at;
  const deliveryOpen = orDone;
  const fwOpen = deliveryDone;

  function canEdit(dept) {
    return isAdmin || session?.department === dept;
  }

  return (
    <>
      <tr className="border-t border-slate-100 hover:bg-slate-50">
        <td className="px-3 py-2">
          <div className="font-medium text-slate-700">{c.patient_name}</div>
          <div className="text-xs text-slate-400">{c.mrn}</div>
        </td>
        <td className="px-3 py-2">{c.surgical_procedure_type}</td>
        <td className="px-3 py-2">{stageBadge("OR", orDone, true)}</td>
        <td className="px-3 py-2">{stageBadge("Delivery", deliveryDone, deliveryOpen)}</td>
        <td className="px-3 py-2">{stageBadge("Female Ward", fwDone, fwOpen)}</td>
        <td className="px-3 py-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(c.current_status)}`}>{statusLabel(c.current_status)}</span>
        </td>
        <td className="flex items-center justify-end gap-1 px-3 py-2">
          <button onClick={onRemove} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
            <Trash2 className="h-4 w-4" />
          </button>
          <button onClick={onToggle} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-slate-100 bg-slate-50/60">
          <td colSpan={7} className="px-4 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Patient Name">
                <input className="input" value={c.patient_name} onChange={(e) => onUpdateField({ patient_name: e.target.value })} />
              </Field>
              <Field label="MRN / ID">
                <input className="input" value={c.mrn} onChange={(e) => onUpdateField({ mrn: e.target.value })} />
              </Field>
              <Field label="Age">
                <input className="input" value={c.age} onChange={(e) => onUpdateField({ age: e.target.value })} />
              </Field>
              <Field label="Current Status">
                <select className="input" value={c.current_status} onChange={(e) => onUpdateField({ current_status: e.target.value })}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{statusLabel(s)}</option>
                  ))}
                </select>
              </Field>
              <Field label="Admission Diagnosis">
                <input className="input sm:col-span-2" value={c.admission_diagnosis} onChange={(e) => onUpdateField({ admission_diagnosis: e.target.value })} />
              </Field>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <StageSection
                title="OR"
                done={orDone}
                open={true}
                canEdit={canEdit("OR")}
                canReopen={isAdmin}
                completedBy={c.or_completed_by}
                onMarkComplete={() => onMarkComplete("or")}
                onReopen={() => onReopen("or")}
              >
                <Field label="Date of Procedure">
                  <input type="date" className="input" disabled={orDone || !canEdit("OR")} value={c.date_of_procedure || ""} onChange={(e) => onUpdateField({ date_of_procedure: e.target.value })} />
                </Field>
                <Field label="Surgical Procedure Type">
                  <input className="input" disabled={orDone || !canEdit("OR")} value={c.surgical_procedure_type} onChange={(e) => onUpdateField({ surgical_procedure_type: e.target.value })} />
                </Field>
                <Field label="ASA Score">
                  <input className="input" disabled={orDone || !canEdit("OR")} value={c.asa_score} onChange={(e) => onUpdateField({ asa_score: e.target.value })} />
                </Field>
                <Field label="Wound Class">
                  <input className="input" disabled={orDone || !canEdit("OR")} value={c.wound_class} onChange={(e) => onUpdateField({ wound_class: e.target.value })} />
                </Field>
                <Field label="Duration of Surgery">
                  <input className="input" disabled={orDone || !canEdit("OR")} value={c.duration_of_surgery} onChange={(e) => onUpdateField({ duration_of_surgery: e.target.value })} />
                </Field>
                <Field label="OR Notes">
                  <textarea className="input min-h-[50px]" disabled={orDone || !canEdit("OR")} value={c.or_notes} onChange={(e) => onUpdateField({ or_notes: e.target.value })} />
                </Field>
              </StageSection>

              <StageSection
                title="Delivery"
                done={deliveryDone}
                open={deliveryOpen}
                canEdit={canEdit("Delivery")}
                canReopen={isAdmin}
                completedBy={c.delivery_completed_by}
                onMarkComplete={() => onMarkComplete("delivery")}
                onReopen={() => onReopen("delivery")}
              >
                <Field label="Delivery Date">
                  <input type="date" className="input" disabled={!deliveryOpen || deliveryDone || !canEdit("Delivery")} value={c.delivery_date || ""} onChange={(e) => onUpdateField({ delivery_date: e.target.value })} />
                </Field>
                <Field label="Signs & Symptoms">
                  <input className="input" disabled={!deliveryOpen || deliveryDone || !canEdit("Delivery")} value={c.delivery_signs_symptoms} onChange={(e) => onUpdateField({ delivery_signs_symptoms: e.target.value })} />
                </Field>
                <Field label="Delivery Notes">
                  <textarea className="input min-h-[50px]" disabled={!deliveryOpen || deliveryDone || !canEdit("Delivery")} value={c.delivery_notes} onChange={(e) => onUpdateField({ delivery_notes: e.target.value })} />
                </Field>
              </StageSection>

              <StageSection
                title="Female Ward"
                done={fwDone}
                open={fwOpen}
                canEdit={canEdit("Female Ward")}
                canReopen={isAdmin}
                completedBy={c.fw_completed_by}
                onMarkComplete={() => onMarkComplete("fw")}
                onReopen={() => onReopen("fw")}
              >
                <Field label="Date">
                  <input type="date" className="input" disabled={!fwOpen || fwDone || !canEdit("Female Ward")} value={c.fw_date || ""} onChange={(e) => onUpdateField({ fw_date: e.target.value })} />
                </Field>
                <Field label="Signs & Symptoms">
                  <input className="input" disabled={!fwOpen || fwDone || !canEdit("Female Ward")} value={c.fw_signs_symptoms} onChange={(e) => onUpdateField({ fw_signs_symptoms: e.target.value })} />
                </Field>
                <Field label="Wound Status">
                  <input className="input" disabled={!fwOpen || fwDone || !canEdit("Female Ward")} value={c.fw_wound_status} onChange={(e) => onUpdateField({ fw_wound_status: e.target.value })} />
                </Field>
                <Field label="Female Ward Notes">
                  <textarea className="input min-h-[50px]" disabled={!fwOpen || fwDone || !canEdit("Female Ward")} value={c.fw_notes} onChange={(e) => onUpdateField({ fw_notes: e.target.value })} />
                </Field>

                <div className="flex flex-col gap-2">
                  {(c.specimens ?? []).map((s, i) => (
                    <div key={i} className="grid grid-cols-1 gap-2 rounded-lg bg-white p-2 sm:grid-cols-5 sm:items-center">
                      <input className="input-cell" disabled={!fwOpen || fwDone || !canEdit("Female Ward")} placeholder="Type of specimen" value={s.type} onChange={(e) => onUpdateSpecimen(i, { type: e.target.value })} />
                      <input type="date" className="input-cell" disabled={!fwOpen || fwDone || !canEdit("Female Ward")} value={s.date_collected} onChange={(e) => onUpdateSpecimen(i, { date_collected: e.target.value })} />
                      <input className="input-cell" disabled={!fwOpen || fwDone || !canEdit("Female Ward")} placeholder="Organism" value={s.organism} onChange={(e) => onUpdateSpecimen(i, { organism: e.target.value })} />
                      <label className="flex items-center gap-1 text-xs text-slate-500">
                        <input type="checkbox" disabled={!fwOpen || fwDone || !canEdit("Female Ward")} checked={!!s.mdro} onChange={(e) => onUpdateSpecimen(i, { mdro: e.target.checked })} />
                        MDRO
                      </label>
                      <button onClick={() => onRemoveSpecimen(i)} disabled={!fwOpen || fwDone || !canEdit("Female Ward")} className="justify-self-end rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {(fwOpen && !fwDone && canEdit("Female Ward")) && (
                    <button onClick={onAddSpecimen} className="flex w-fit items-center gap-1 text-xs font-medium text-teal-600 hover:underline">
                      <Plus className="h-3.5 w-3.5" />
                      Add specimen
                    </button>
                  )}
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" disabled={!fwOpen || fwDone || !canEdit("Female Ward")} checked={!!c.ssi_detected} onChange={(e) => onUpdateField({ ssi_detected: e.target.checked })} />
                  SSI Detected
                </label>
                {c.ssi_detected && (
                  <Field label="Type of SSI">
                    <input className="input" disabled={!fwOpen || fwDone || !canEdit("Female Ward")} value={c.type_of_ssi} onChange={(e) => onUpdateField({ type_of_ssi: e.target.value })} />
                  </Field>
                )}
              </StageSection>
            </div>

            <Field label="Comments">
              <textarea className="input mt-4 min-h-[60px]" value={c.comments} onChange={(e) => onUpdateField({ comments: e.target.value })} />
            </Field>

            <button onClick={onSave} className="mt-3 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
              Save
            </button>
          </td>
        </tr>
      )}
    </>
  );
}

function StageSection({ title, done, open, canEdit, canReopen, completedBy, onMarkComplete, onReopen, children }) {
  return (
    <div className={`flex flex-col gap-2 rounded-xl border p-3 ${open ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-100/60"}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase text-slate-500">{title}</h3>
        {stageBadge(title, done, open)}
      </div>
      {!open && <p className="text-xs text-slate-400">Locked until the previous stage is marked complete.</p>}
      {open && (
        <>
          <div className="flex flex-col gap-2">{children}</div>
          {canEdit && !done && (
            <button onClick={onMarkComplete} className="mt-1 w-fit rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700">
              Mark {title} complete
            </button>
          )}
          {done && (
            <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
              <span>Completed by {completedBy || "—"}</span>
              {canReopen && (
                <button onClick={onReopen} className="text-teal-600 hover:underline">
                  Reopen
                </button>
              )}
            </div>
          )}
        </>
      )}
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
