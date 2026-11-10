import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileSpreadsheet, FileText, Plus, Trash2, UserPlus } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
import { downloadExcel } from "../../lib/exportExcel";
import { downloadPdf } from "../../lib/exportPdf";
import { fetchAllRows } from "../../lib/fetchAll";

const todayStr = () => new Date().toISOString().slice(0, 10);
const addDaysToDateStr = (dateStr, days) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
// Rows already marked "Updated in Seha" sink to the bottom, so whoever's
// still waiting on an update stays on top. Stable sort keeps everything
// else in its existing order.
const byUpdatedInSehaLast = (a, b) => (a.updated_in_seha ? 1 : 0) - (b.updated_in_seha ? 1 : 0);

// The Status filter only ever offers Admitted/Discharged/All — "Discharged"
// is really "no longer admitted", so it also catches transferred, referred,
// expired and other, not just the literal "discharged" status.
function matchesStatusFilter(currentStatus, filter) {
  if (filter === "all") return true;
  if (filter === "discharged") return currentStatus !== "admitted";
  return currentStatus === filter;
}

// Patient identity fields for Infection Control's own records — admin-only
// (Owner/IC), hidden entirely for department-scoped accounts.
const IC_ONLY_HEADERS = ["Date of Birth", "National ID", "Mobile", "Nationality"];

// Doctors no longer with the hospital — hidden from the By Doctor picker
// below, but their existing patients/follow-ups stay fully intact and
// editable from the All Patients grid.
const RETIRED_SSI_DOCTORS = ["Dr.Rezk"];

const STATUS_OPTIONS = ["admitted", "discharged", "transferred", "referred", "expired", "other"];
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

// "Updated in Seha" is ticked against whatever current_status the case was
// in at the time — stored alongside it in updated_in_seha_status. If the
// status has since moved on (most often: ticked while still admitted, then
// the patient got discharged) that tick no longer means Seha is caught up,
// so it reads as "stale" rather than fully synced.
function sehaSyncState(currentStatus, updatedInSeha, updatedInSehaStatus) {
  if (!updatedInSeha) return "none";
  return updatedInSehaStatus === currentStatus ? "synced" : "stale";
}

// "Updated in Seha" highlight: no longer admitted (discharged, transferred,
// referred, expired, other) + synced -> whole row green; same + stale (was
// ticked at a since-changed status) -> whole row blue, so IC can tell it was
// updated once and now needs a fresh one, not confuse it with "never
// touched"; same + never synced -> amber; still admitted + synced -> just
// the Patient Name/MRN cells green.
function sehaRowClass(currentStatus, updatedInSeha, updatedInSehaStatus) {
  if (currentStatus === "admitted") return "";
  const state = sehaSyncState(currentStatus, updatedInSeha, updatedInSehaStatus);
  if (state === "synced") return "bg-emerald-200";
  if (state === "stale") return "bg-sky-200";
  return "bg-amber-200";
}

function hasActiveDevice(p) {
  return !!(
    (p.central_line_insertion && !p.central_line_removed) ||
    (p.urinary_catheter_insertion && !p.urinary_catheter_removed) ||
    (p.ventilator_insertion && !p.ventilator_removed)
  );
}

// The Patient Name/MRN cells' actual fill color (applied to both the <td>
// and the input itself, so the white input box is genuinely colored, not
// just ringed) — discharge-based green/blue/amber takes priority, then an
// in-progress Seha update, then an active device (ICU only; deviceActive
// is always false for SSI/OB, which have no device fields).
function identityCellClass(currentStatus, updatedInSeha, updatedInSehaStatus, deviceActive) {
  const state = sehaSyncState(currentStatus, updatedInSeha, updatedInSehaStatus);
  if (currentStatus !== "admitted") {
    if (state === "synced") return "bg-emerald-200 border-emerald-400";
    if (state === "stale") return "bg-sky-200 border-sky-400";
    return "bg-amber-200 border-amber-400";
  }
  if (state === "synced") return "bg-emerald-200 border-emerald-400";
  if (state === "stale") return "bg-sky-200 border-sky-400";
  if (deviceActive) return "bg-purple-200 border-purple-400";
  return "";
}

// A device (central line/urinary catheter/ventilator) currently in place
// on an admitted patient gets its own purple flag — but only while nothing
// else is already coloring the row (Updated-in-Seha's discharge-based
// green/amber always wins, since that's the more actionable state).
function deviceActiveRowClass(p) {
  return p.current_status === "admitted" && hasActiveDevice(p) ? "bg-purple-200" : "";
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
  // 'adult_icu' | 'pediatric_icu' | 'adult_icu_vae' | 'pediatric_icu_vae' |
  // 'ssi'. The '..._vae' variants are for a unit's RT/respiratory therapist
  // account: it only ever needs VAE Monitoring for its own ventilated
  // patients, never the full ICU/NICU Surveillance tab. Owner/IC always see
  // everything; a scoped account only sees the switchers it needs (none at
  // all when exactly one tab/unit is allowed).
  const scopeTokens = isAdmin || !session?.haiScope ? null : session.haiScope.split(",").map((s) => s.trim()).filter(Boolean);
  const SCOPE_TO_TABS = { adult_icu: ["icu", "vae"], pediatric_icu: ["icu", "vae"], adult_icu_vae: ["vae"], pediatric_icu_vae: ["vae"], ssi: ["ssi"] };
  const SCOPE_TO_UNIT = { adult_icu: "adult_icu", adult_icu_vae: "adult_icu", pediatric_icu: "pediatric_icu", pediatric_icu_vae: "pediatric_icu" };
  const allowedTabs = scopeTokens ? [...new Set(scopeTokens.flatMap((t) => SCOPE_TO_TABS[t] ?? []))] : null;
  const icuUnitsAllowed = scopeTokens ? scopeTokens.map((t) => SCOPE_TO_UNIT[t]).filter(Boolean) : null;
  const [tab, setTab] = useState(() => allowedTabs?.[0] ?? "icu");
  const [patients, setPatients] = useState([]);
  const [vaeRows, setVaeRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [statusFilter, setStatusFilter] = useState("admitted");
  const [ssiCases, setSsiCases] = useState([]);
  const [ssiView, setSsiView] = useState("all"); // "all" | "doctor"
  const [selectedDoctor, setSelectedDoctor] = useState("");
  const [doctorFileNoFilter, setDoctorFileNoFilter] = useState("");
  // An account assigned to a single doctor (Settings -> SSI "Assigned
  // Doctor") only ever sees that doctor's own By Doctor tracker — never the
  // unfiltered All Patients list, and never another doctor's queue.
  const lockedDoctor = !isAdmin ? session?.ssiDoctor || null : null;
  useEffect(() => {
    if (lockedDoctor) {
      setSsiView("doctor");
      setSelectedDoctor(lockedDoctor);
    }
  }, [lockedDoctor]);
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
    () => patients.filter((p) => matchesStatusFilter(p.current_status, statusFilter)),
    [patients, statusFilter]
  );
  const visibleIcuUnitPatients = useMemo(
    () => visiblePatients.filter((p) => activeIcuTypes.includes(p.icu_type)).slice().sort(byUpdatedInSehaLast),
    [visiblePatients, activeIcuTypes]
  );
  // VAE Monitoring isn't split by Adult/Pediatric sub-tab, but a scoped
  // account should still only see ventilated patients in the ICU unit(s)
  // it's allowed into — never the other unit's patients.
  const vaeAllowedIcuTypes = !icuUnitsAllowed ? [...adultIcuTypes, ...pediatricIcuTypes] : icuUnitsAllowed.flatMap((t) => (t === "adult_icu" ? adultIcuTypes : pediatricIcuTypes));
  const visibleVaePatients = useMemo(
    () => visiblePatients.filter((p) => p.ventilator_insertion && vaeAllowedIcuTypes.includes(p.icu_type)),
    [visiblePatients, vaeAllowedIcuTypes]
  );
  const visibleSsiCases = useMemo(
    () => ssiCases.filter((c) => matchesStatusFilter(c.current_status, statusFilter)).slice().sort(byUpdatedInSehaLast),
    [ssiCases, statusFilter]
  );

  // Each doctor's own tracker — live-derived from the same SSI records (never
  // a separate copy): one row per follow-up visit that has a date, for every
  // case whose Treating Doctor matches.
  const ssiDoctors = useMemo(
    () => [...new Set(ssiCases.map((c) => (c.treating_doctor || "").trim()).filter(Boolean))].filter((d) => !RETIRED_SSI_DOCTORS.includes(d)).sort(),
    [ssiCases]
  );
  const doctorTrackerRows = useMemo(() => {
    if (!selectedDoctor) return [];
    const fileNo = doctorFileNoFilter.trim().toLowerCase();
    const rows = [];
    ssiCases
      .filter((c) => (c.treating_doctor || "").trim() === selectedDoctor)
      .filter((c) => !fileNo || (c.mrn || "").toLowerCase().includes(fileNo))
      .forEach((c) => {
        (c.follow_ups ?? []).forEach((f, i) => {
          if (!f.date) return;
          rows.push({ case: c, followUp: f, index: i });
        });
      });
    // Newest case added goes last — ssiCases itself is fetched newest
    // surgery date first, which isn't the same thing a nurse means by "new
    // patient", so sort this tracker by when the record was created instead.
    rows.sort((a, b) => new Date(a.case.created_at || 0) - new Date(b.case.created_at || 0));
    return rows;
  }, [ssiCases, selectedDoctor, doctorFileNoFilter]);
  const visibleObCases = useMemo(
    () => obCases.filter((c) => matchesStatusFilter(c.current_status, statusFilter)).slice().sort(byUpdatedInSehaLast),
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
    // Filling in Date of Discharge almost always means the patient was
    // discharged — if Current Status was left on "admitted" (a separate
    // dropdown, easy to miss), bring it in line so the patient doesn't stay
    // stuck under the Admitted filter indefinitely.
    const current_status = p.current_status === "admitted" && p.date_of_discharge ? "discharged" : p.current_status;
    if (current_status !== p.current_status) updatePatientField(p.id, { current_status });
    await supabase
      .from("hai_icu_surveillance")
      .update({
        month: p.month,
        patient_name: p.patient_name,
        mrn: p.mrn,
        age: p.age,
        gender: p.gender,
        date_of_birth: p.date_of_birth || null,
        national_id: p.national_id,
        mobile: p.mobile,
        nationality: p.nationality,
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
        current_status,
        date_of_discharge: p.date_of_discharge || null,
        comments: p.comments,
        updated_in_seha: !!p.updated_in_seha,
        updated_in_seha_status: p.updated_in_seha ? p.updated_in_seha_status || null : null,
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

  function updateVaeField(id, patch) {
    setVaeRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  async function addVaeDay(icuSurveillanceId, nextMvDay) {
    const { error } = await supabase.from("hai_vae_monitoring").insert({
      icu_surveillance_id: icuSurveillanceId,
      date: todayStr(),
      mv_day: nextMvDay,
      recorded_by: session?.username,
    });
    if (error) return flash({ type: "error", text: error.message.includes("duplicate") ? "A row for this date already exists" : "Could not add: " + error.message });
    loadAll();
  }
  async function saveVaeDay(r) {
    await supabase
      .from("hai_vae_monitoring")
      .update({
        date: r.date,
        mv_day: Number(r.mv_day) || 1,
        daily_min_peep: r.daily_min_peep === "" ? null : Number(r.daily_min_peep),
        daily_min_fio2: r.daily_min_fio2 === "" ? null : Number(r.daily_min_fio2),
        daily_min_map: r.daily_min_map === "" ? null : Number(r.daily_min_map),
        ped_vae: !!r.ped_vae,
        vac_date_of_event: r.vac_date_of_event || null,
        temp_abnormal: !!r.temp_abnormal,
        wbc_abnormal: !!r.wbc_abnormal,
        new_antimicrobial: !!r.new_antimicrobial,
        qad: r.qad === "" ? null : Number(r.qad),
        ivac_date_of_event: r.ivac_date_of_event || null,
        positive_culture: !!r.positive_culture,
        purulent_resp_secretions: !!r.purulent_resp_secretions,
        pvap_date_of_event: r.pvap_date_of_event || null,
        updated_in_seha: !!r.updated_in_seha,
      })
      .eq("id", r.id);
  }
  async function removeVaeDay(r) {
    if (!confirm(`Remove the ${r.date} entry?`)) return;
    await supabase.from("hai_vae_monitoring").delete().eq("id", r.id);
    loadAll();
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
    // Once discharged (with a discharge date), auto-schedule the FIRST
    // follow-up's due date — discharge date + the case's follow-up duration
    // (30/90 days) — so it shows up on the doctor's tracker without needing
    // a separate manual step. This only ever runs once per case: it fires
    // only while every follow-up slot is still completely empty, so saving
    // the row again later (or toggling admitted/discharged back and forth)
    // never re-fires it into a second/third slot with the same date.
    // Same reasoning as markSsiStageComplete above: if DR & FW was already
    // marked complete and the discharge date gets filled in afterwards,
    // Current Status should follow rather than stay stuck on "admitted".
    let current_status = c.current_status;
    if (current_status === "admitted" && c.date_of_discharge && c.dr_fw_completed_at) {
      current_status = "discharged";
      updateSsiField(c.id, { current_status });
    }
    let follow_ups = c.follow_ups ?? [];
    if (current_status === "discharged" && c.date_of_discharge && follow_ups.every((f) => !f.date)) {
      const dueDate = addDaysToDateStr(c.date_of_discharge, c.follow_up_duration || 30);
      follow_ups = follow_ups.map((f, i) => (i === 0 ? { ...f, date: dueDate } : f));
      updateSsiField(c.id, { follow_ups });
    }
    await supabase
      .from("hai_ssi_surveillance")
      .update({
        month: c.month,
        patient_name: c.patient_name,
        mrn: c.mrn,
        unit: c.unit,
        age: c.age,
        gender: c.gender,
        date_of_birth: c.date_of_birth || null,
        national_id: c.national_id,
        mobile: c.mobile,
        nationality: c.nationality,
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
        follow_ups,
        specimens: c.specimens ?? [],
        other_specimens: c.other_specimens,
        ssi_detected: !!c.ssi_detected,
        type_of_ssi: c.type_of_ssi,
        current_status,
        date_of_discharge: c.date_of_discharge || null,
        comments: c.comments,
        updated_in_seha: !!c.updated_in_seha,
        updated_in_seha_status: c.updated_in_seha ? c.updated_in_seha_status || null : null,
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
    // Completing DR & FW *is* discharging the patient — if Current Status
    // was left on "admitted" (easy to miss since it's a separate dropdown
    // from Date of Discharge), bring it in line so the patient actually
    // moves to the Discharged filter instead of staying stuck as admitted.
    if (prefix === "dr_fw" && c.current_status === "admitted" && c.date_of_discharge) {
      patch.current_status = "discharged";
    }
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
          "Month", "Patient Name", "MRN", ...(isAdmin ? IC_ONLY_HEADERS : []), "Unit", "Age", "Gender", "Admission Diagnosis", "Treating Doctor", "Surgical Procedure", "Date of Procedure", "Elective/Emergency",
          "ASA Score", "Wound Class", "Duration of Surgery", "PATOS", "Follow-up Duration", "SSI Detected", "Type of SSI", "Current Status", "Date of Discharge", "Updated in Seha", "Comments", "Recorded By",
        ],
        rows: visibleSsiCases.map((c) => [
          c.month, c.patient_name, c.mrn, ...(isAdmin ? [c.date_of_birth || "", c.national_id, c.mobile, c.nationality] : []), c.unit, c.age, c.gender, c.admission_diagnosis, c.treating_doctor, c.surgical_procedure_type, c.date_of_procedure || "", c.elective_emergency,
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
        date_of_birth: c.date_of_birth || null,
        national_id: c.national_id,
        mobile: c.mobile,
        nationality: c.nationality,
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
        updated_in_seha: !!c.updated_in_seha,
        updated_in_seha_status: c.updated_in_seha ? c.updated_in_seha_status || null : null,
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
          "Patient Name", "MRN", ...(isAdmin ? IC_ONLY_HEADERS : []), "Age", "Admission Diagnosis", "Date of Procedure", "Surgical Procedure", "OR Notes", "OR Completed By",
          "Delivery Date", "Delivery Notes", "Delivery Completed By", "Female Ward Notes", "Wound Status", "SSI Detected", "Type of SSI", "Female Ward Completed By",
          "Current Status", "Updated in Seha", "Comments", "Recorded By",
        ],
        rows: visibleObCases.map((c) => [
          c.patient_name, c.mrn, ...(isAdmin ? [c.date_of_birth || "", c.national_id, c.mobile, c.nationality] : []), c.age, c.admission_diagnosis, c.date_of_procedure || "", c.surgical_procedure_type, c.or_notes, c.or_completed_by || "",
          c.delivery_date || "", c.delivery_notes, c.delivery_completed_by || "", c.fw_notes, c.fw_wound_status, c.ssi_detected ? "Yes" : "No", c.type_of_ssi, c.fw_completed_by || "",
          statusLabel(c.current_status), c.updated_in_seha ? "Yes" : "No", c.comments, c.done_by,
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
    const unitLabel = icuUnit === "adult" ? "ICU" : "NICU";
    downloadExcel(`infection-control-hai-icu-${icuUnit}-${todayStr()}`, [
      {
        name: `${unitLabel} Surveillance`,
        headers: [
          "Month", "Patient Name", "MRN", ...(isAdmin ? IC_ONLY_HEADERS : []), "Age", "Gender", "Bed", "ICU Type", "Hospital Admission", "Unit Admission", "Admission Diagnosis",
          "Central Line Insertion", "Central Line Removed", "Urinary Catheter Insertion", "Urinary Catheter Removed",
          "Ventilator Insertion", "Ventilator Removed", "Signs & Symptoms", "Onset Date", "HAI Detected", "Event Types", "Date of Discharge", "Current Status", "Comments", "Recorded By",
        ],
        rows: visibleIcuUnitPatients.map((p) => [
          p.month, p.patient_name, p.mrn, ...(isAdmin ? [p.date_of_birth || "", p.national_id, p.mobile, p.nationality] : []), p.age, p.gender, p.bed_no, p.icu_type, p.hospital_admission_date || "", p.unit_admission_date || "", p.admission_diagnosis,
          p.central_line_insertion || "", p.central_line_removed || "", p.urinary_catheter_insertion || "", p.urinary_catheter_removed || "",
          p.ventilator_insertion || "", p.ventilator_removed || "", p.signs_symptoms, p.date_onset_symptoms || "",
          p.hai_detected ? "Yes" : "No", (p.hai_event_types ?? []).join(", "), p.date_of_discharge || "", statusLabel(p.current_status), p.comments, p.done_by,
        ]),
      },
    ]);
  }

  function exportIcuPdf() {
    const unitLabel = icuUnit === "adult" ? "ICU" : "NICU";
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
            { key: "adult", label: "ICU" },
            { key: "pediatric", label: "NICU" },
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

      {!(tab === "ssi" && ssiView === "doctor") && (
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
      )}

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
          patients={visibleVaePatients}
          vaeRows={vaeRows}
          pediatricIcuTypes={pediatricIcuTypes}
          session={session}
          isAdmin={isAdmin}
          flash={flash}
          onUpdateField={updateVaeField}
          onAddDay={addVaeDay}
          onSave={saveVaeDay}
          onRemove={removeVaeDay}
        />
      )}

      {tab === "ssi" && (
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
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
          )}
          {lockedDoctor && <p className="text-sm font-medium text-slate-700">{lockedDoctor} — follow-up tracker</p>}
          {ssiView === "doctor" && !lockedDoctor && (
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
            <input
              className="input w-40"
              value={doctorFileNoFilter}
              onChange={(e) => setDoctorFileNoFilter(e.target.value)}
              placeholder="Filter by File No..."
            />
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

      {tab === "ssi" && (ssiView === "all" || !(isAdmin || lockedDoctor)) && (
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

      {tab === "ssi" && ssiView === "doctor" && (isAdmin || lockedDoctor) && (
        <DoctorTrackerTable
          doctor={selectedDoctor}
          rows={doctorTrackerRows}
          onFollowUpFieldChange={(c, i, patch) => updateFollowUp(c, i, patch)}
          onFieldBlurSave={(c) => saveSsiCase(c)}
          onCommentChange={(c, comments) => updateSsiField(c.id, { comments })}
        />
      )}

    </div>
  );
}

// A live, editable filtered view of the same SSI records for one Treating
// Doctor — never a separate copy, matching the hospital's own per-surgeon
// SSI tracker sheets. One row per follow-up visit that has a date; the
// follow-up columns (signs, swab, comment) are filled in from here, same
// as from the All Patients grid.
function DoctorTrackerTable({ doctor, rows, onFollowUpFieldChange, onFieldBlurSave, onCommentChange }) {
  if (!doctor) {
    return <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">Pick a doctor to see her SSI tracker.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm hai-grid">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            {["Month", "Name", "File No", "Date of Surgery", "Name of Surgeon", "Date of Follow Up", "Fever", "Pain/Tenderness", "Redness", "Swelling", "Purulent Discharge", "Wound Dehiscence", "Surgical Site Swab Sent", "Comment"].map((h) => (
              <th key={h} className="whitespace-nowrap border-b border-slate-200 px-1.5 py-1 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ case: c, followUp: f, index: i }) => (
            <tr key={`${c.id}-${i}`} className="border-t border-slate-100">
              <td className="whitespace-nowrap px-2 py-1.5">{c.month}</td>
              <td className="whitespace-nowrap px-2 py-1.5">{c.patient_name}</td>
              <td className="whitespace-nowrap px-2 py-1.5">{c.mrn}</td>
              <td className="whitespace-nowrap px-2 py-1.5">{c.date_of_procedure || "—"}</td>
              <td className="whitespace-nowrap px-2 py-1.5">{c.treating_doctor}</td>
              <td className="px-1.5 py-0.5">
                <GridDate value={f.date} onChange={(e) => onFollowUpFieldChange(c, i, { date: e.target.value })} onBlur={() => onFieldBlurSave(c)} />
              </td>
              {SIGN_FIELDS.map((field) => (
                <td key={field} className="px-1.5 py-0.5">
                  <SignSelect
                    value={f[field]}
                    onChange={(e) => onFollowUpFieldChange(c, i, { [field]: e.target.value })}
                    onBlur={() => onFieldBlurSave(c)}
                  />
                </td>
              ))}
              <td className="px-1.5 py-0.5">
                <SwabSelect
                  value={f.surgical_site_swab_sent}
                  onChange={(e) => onFollowUpFieldChange(c, i, { surgical_site_swab_sent: e.target.value })}
                  onBlur={() => onFieldBlurSave(c)}
                />
              </td>
              <td className="px-1.5 py-0.5">
                <GridText
                  value={c.comments}
                  onChange={(e) => onCommentChange(c, e.target.value)}
                  onBlur={() => onFieldBlurSave(c)}
                  className="min-w-[7rem]"
                />
              </td>
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
      className={`input-cell w-full min-w-[5.5rem] ${className}`}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={onChange}
      onBlur={onBlur}
      disabled={disabled}
    />
  );
}
function GridDate({ value, onChange, onBlur, disabled, className = "" }) {
  return <input type="date" className={`input-cell w-full min-w-[7rem] ${className}`} value={value ?? ""} onChange={onChange} onBlur={onBlur} disabled={disabled} />;
}

// Native <input type="date"> renders its text in whatever format the
// viewer's own browser/OS locale uses (often month-first), which HTML
// attributes can't reliably override. For Date of Birth we want a fixed
// day/month/year reading regardless of that, so this is a plain text
// field that auto-inserts slashes as you type and converts to/from the
// "YYYY-MM-DD" the database stores on blur.
function formatDobDisplay(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
}
function parseDobInput(text) {
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const day = Number(d);
  const month = Number(m);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}
function DobInput({ value, onFieldChange, onFieldBlurSave }) {
  const [text, setText] = useState(() => formatDobDisplay(value));
  useEffect(() => setText(formatDobDisplay(value)), [value]);

  function handleChange(e) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
    let formatted = digits;
    if (digits.length > 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    setText(formatted);
  }

  function handleBlur() {
    if (text === "") {
      onFieldChange({ date_of_birth: null });
      onFieldBlurSave();
      return;
    }
    const iso = parseDobInput(text);
    if (!iso) {
      setText(formatDobDisplay(value)); // invalid/incomplete — revert, don't save
      return;
    }
    onFieldChange({ date_of_birth: iso });
    onFieldBlurSave();
  }

  return (
    <input
      className="input-cell w-full min-w-[6rem]"
      placeholder="DD/MM/YYYY"
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}

// Date of Birth/National ID/Mobile/Nationality — Infection Control's own
// patient-identity fields, rendered only for admin (Owner/IC); department
// accounts never see these cells at all, matching IC_ONLY_HEADERS above.
function IcOnlyCells({ isAdmin, record, onFieldChange, onFieldBlurSave }) {
  if (!isAdmin) return null;
  return (
    <>
      <td className="bg-slate-50 px-1.5 py-0.5"><DobInput value={record.date_of_birth} onFieldChange={onFieldChange} onFieldBlurSave={onFieldBlurSave} /></td>
      <td className="bg-slate-50 px-1.5 py-0.5"><GridText value={record.national_id} onChange={(e) => onFieldChange({ national_id: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[6rem]" /></td>
      <td className="bg-slate-50 px-1.5 py-0.5"><GridText value={record.mobile} onChange={(e) => onFieldChange({ mobile: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[6rem]" /></td>
      <td className="bg-slate-50 px-1.5 py-0.5"><GridText value={record.nationality} onChange={(e) => onFieldChange({ nationality: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[5.5rem]" /></td>
    </>
  );
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
        <table className="w-full text-sm hai-grid">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th rowSpan={2} className="whitespace-nowrap border-b border-slate-200 px-1.5 py-1 font-medium align-bottom">Updated in Seha</th>
              {["Month", "Patient Name", "MRN/ID"].map((h) => (
                <th key={h} rowSpan={2} className={`whitespace-nowrap border-b border-slate-200 px-1.5 py-1 font-medium align-bottom ${h === "Patient Name" ? "sticky-name-col" : ""}`}>{h}</th>
              ))}
              {isAdmin && IC_ONLY_HEADERS.map((h) => (
                <th key={h} rowSpan={2} className="whitespace-nowrap border-b border-slate-200 bg-slate-100 px-1.5 py-1 font-medium align-bottom">{h}</th>
              ))}
              {["Age", "Gender", "Bed #", "Hospital Admission", "ICU Type", "Unit Admission", "Admission Diagnosis"].map((h) => (
                <th key={h} rowSpan={2} className="whitespace-nowrap border-b border-slate-200 px-1.5 py-1 font-medium align-bottom">{h}</th>
              ))}
              <th colSpan={2} className="border-b border-l-2 border-slate-800 px-1.5 py-0.5 text-center font-medium">Central Line</th>
              <th colSpan={2} className="border-b border-slate-200 px-1.5 py-0.5 text-center font-medium">Urinary Catheter</th>
              <th colSpan={2} className="border-b border-slate-200 px-1.5 py-0.5 text-center font-medium">Ventilator</th>
              {["Device Reinsertion (If any)", "Signs & Symptoms", "Date of Onset"].map((h) => (
                <th key={h} rowSpan={2} className="whitespace-nowrap border-b border-slate-200 px-1.5 py-1 font-medium align-bottom">{h}</th>
              ))}
              <th colSpan={5} className="border-b border-l-2 border-slate-800 px-1.5 py-0.5 text-center font-medium">Specimen 1</th>
              <th colSpan={5} className="border-b border-slate-200 px-1.5 py-0.5 text-center font-medium">Specimen 2</th>
              <th colSpan={5} className="border-b border-slate-200 px-1.5 py-0.5 text-center font-medium">Specimen 3</th>
              <th rowSpan={2} className="whitespace-nowrap border-b border-l-2 border-slate-800 px-1.5 py-1 font-medium align-bottom">Other Specimens</th>
              <th rowSpan={2} className="whitespace-nowrap border-b border-slate-200 px-1.5 py-1 font-medium align-bottom">HAI Detected</th>
              <th colSpan={4} className="border-b border-l-2 border-slate-800 px-1.5 py-0.5 text-center font-medium">Type of HAI Event</th>
              {["Date of Discharge", "Current Status", "Comments"].map((h, i) => (
                <th key={h} rowSpan={2} className={`whitespace-nowrap border-b border-slate-200 px-1.5 py-1 font-medium align-bottom ${i === 0 ? "border-l-2 border-slate-800" : ""}`}>{h}</th>
              ))}
              <th rowSpan={2}></th>
            </tr>
            <tr>
              <th className="whitespace-nowrap border-l-2 border-slate-800 px-1.5 py-0.5 font-medium">Inserted</th>
              <th className="whitespace-nowrap px-1.5 py-0.5 font-medium">Removed</th>
              <th className="whitespace-nowrap px-1.5 py-0.5 font-medium">Inserted</th>
              <th className="whitespace-nowrap px-1.5 py-0.5 font-medium">Removed</th>
              <th className="whitespace-nowrap px-1.5 py-0.5 font-medium">Inserted</th>
              <th className="whitespace-nowrap px-1.5 py-0.5 font-medium">Removed</th>
              {[1, 2, 3].flatMap((slot) =>
                ["Type", "Date Collected", "Date of Result", "Organism", "MDRO"].map((h, i) => (
                  <th key={`${slot}-${h}`} className={`whitespace-nowrap px-1.5 py-0.5 font-medium ${i === 0 && slot === 1 ? "border-l-2 border-slate-800" : ""}`}>{h}</th>
                ))
              )}
              {EVENT_TYPES.map((t, i) => (
                <th key={t} className={`whitespace-nowrap px-1.5 py-0.5 font-medium ${i === 0 ? "border-l-2 border-slate-800" : ""}`}>{t}</th>
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
                  const patch = { updated_in_seha: checked, updated_in_seha_status: checked ? p.current_status : null };
                  onUpdateField(p.id, patch);
                  onSave({ ...p, ...patch });
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
  const nameCellClass = identityCellClass(p.current_status, p.updated_in_seha, p.updated_in_seha_status, hasActiveDevice(p));
  const rowBg = sehaRowClass(p.current_status, p.updated_in_seha, p.updated_in_seha_status) || deviceActiveRowClass(p);
  return (
    <tr className={`border-t border-slate-100 hover:bg-slate-50 ${rowBg}`}>
      <td className={`px-1.5 py-0.5 text-center ${rowBg || "bg-white"}`}>
        <input
          type="checkbox"
          disabled={!isAdmin}
          checked={!!p.updated_in_seha}
          onChange={(e) => onUpdatedInSehaToggle(e.target.checked)}
          title={sehaSyncState(p.current_status, p.updated_in_seha, p.updated_in_seha_status) === "stale" ? "Updated in Seha before — status has changed since, needs a fresh update" : undefined}
        />
      </td>
      <td className="px-1.5 py-0.5"><GridText value={p.month} onChange={(e) => onFieldChange({ month: e.target.value })} onBlur={onFieldBlurSave} /></td>
      <td className={`sticky-name-col px-1.5 py-0.5 ${nameCellClass || rowBg || "bg-white"}`}><GridText value={p.patient_name} onChange={(e) => onFieldChange({ patient_name: e.target.value })} onBlur={onFieldBlurSave} className={`min-w-[8rem] ${nameCellClass}`} /></td>
      <td className={`px-1.5 py-0.5 ${nameCellClass}`}><GridText value={p.mrn} onChange={(e) => onFieldChange({ mrn: e.target.value })} onBlur={onFieldBlurSave} className={`min-w-[5rem] ${nameCellClass}`} /></td>
      <IcOnlyCells isAdmin={isAdmin} record={p} onFieldChange={onFieldChange} onFieldBlurSave={onFieldBlurSave} />
      <td className="px-1.5 py-0.5"><GridText value={p.age} onChange={(e) => onFieldChange({ age: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[3.5rem]" /></td>
      <td className="px-1.5 py-0.5">
        <select className="input-cell w-full" value={p.gender} onChange={(e) => onFieldChange({ gender: e.target.value })} onBlur={onFieldBlurSave}>
          <option value="">—</option>
          <option value="M">M</option>
          <option value="F">F</option>
        </select>
      </td>
      <td className="px-1.5 py-0.5"><GridText value={p.bed_no} onChange={(e) => onFieldChange({ bed_no: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[3.5rem]" /></td>
      <td className="px-1.5 py-0.5"><GridDate value={p.hospital_admission_date} onChange={(e) => onFieldChange({ hospital_admission_date: e.target.value })} onBlur={onFieldBlurSave} /></td>
      <td className="px-1.5 py-0.5">
        <select className="input-cell w-full min-w-[5.5rem]" value={p.icu_type} onChange={(e) => onFieldChange({ icu_type: e.target.value })} onBlur={onFieldBlurSave}>
          <option value="">—</option>
          {icuTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </td>
      <td className="px-1.5 py-0.5">
        <GridDate
          value={p.unit_admission_date}
          onChange={(e) => onFieldChange({ unit_admission_date: e.target.value })}
          onBlur={onFieldBlurSave}
          className={unitBeforeHospital ? "border-red-400 bg-red-50" : ""}
        />
        {unitBeforeHospital && <p className="mt-0.5 whitespace-nowrap text-[10px] font-medium text-red-600">Before hospital admission</p>}
      </td>
      <td className="px-1.5 py-0.5"><GridText value={p.admission_diagnosis} onChange={(e) => onFieldChange({ admission_diagnosis: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[8rem]" /></td>

      <td className="px-1.5 py-0.5 border-l-2 border-slate-800"><GridDate value={p.central_line_insertion} onChange={(e) => onFieldChange({ central_line_insertion: e.target.value })} onBlur={onFieldBlurSave} /></td>
      <td className="px-1.5 py-0.5"><GridDate value={p.central_line_removed} onChange={(e) => onFieldChange({ central_line_removed: e.target.value })} onBlur={onFieldBlurSave} /></td>
      <td className="px-1.5 py-0.5"><GridDate value={p.urinary_catheter_insertion} onChange={(e) => onFieldChange({ urinary_catheter_insertion: e.target.value })} onBlur={onFieldBlurSave} /></td>
      <td className="px-1.5 py-0.5"><GridDate value={p.urinary_catheter_removed} onChange={(e) => onFieldChange({ urinary_catheter_removed: e.target.value })} onBlur={onFieldBlurSave} /></td>
      <td className="px-1.5 py-0.5"><GridDate value={p.ventilator_insertion} onChange={(e) => onFieldChange({ ventilator_insertion: e.target.value })} onBlur={onFieldBlurSave} /></td>
      <td className="px-1.5 py-0.5"><GridDate value={p.ventilator_removed} onChange={(e) => onFieldChange({ ventilator_removed: e.target.value })} onBlur={onFieldBlurSave} /></td>

      <td className="px-1.5 py-0.5"><GridText value={p.device_reinsertion_note} onChange={(e) => onFieldChange({ device_reinsertion_note: e.target.value })} onBlur={onFieldBlurSave} /></td>
      <td className="px-1.5 py-0.5"><GridText value={p.signs_symptoms} onChange={(e) => onFieldChange({ signs_symptoms: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[7rem]" /></td>
      <td className="px-1.5 py-0.5"><GridDate value={p.date_onset_symptoms} onChange={(e) => onFieldChange({ date_onset_symptoms: e.target.value })} onBlur={onFieldBlurSave} /></td>

      {p.specimens.map((s, i) => (
        <SpecimenCells
          key={i}
          specimen={s}
          hasDateResult
          divider={i === 0}
          onChange={(patch) => onSpecimenFieldChange(i, patch)}
          onBlur={onFieldBlurSave}
          onMdroToggle={(checked) => onSpecimenMdroToggle(i, checked)}
        />
      ))}

      <td className="px-1.5 py-0.5 border-l-2 border-slate-800"><GridText value={p.other_specimens} onChange={(e) => onFieldChange({ other_specimens: e.target.value })} onBlur={onFieldBlurSave} /></td>
      <td className="px-1.5 py-0.5 text-center">
        <input type="checkbox" checked={!!p.hai_detected} onChange={(e) => onHaiDetectedToggle(e.target.checked)} />
      </td>
      {EVENT_TYPES.map((type, i) => (
        <td key={type} className={`px-1.5 py-0.5 text-center ${i === 0 ? "border-l-2 border-slate-800" : ""}`}>
          <input type="checkbox" disabled={!p.hai_detected} checked={(p.hai_event_types ?? []).includes(type)} onChange={() => onEventTypeToggle(type)} />
        </td>
      ))}

      <td className="px-1.5 py-0.5 border-l-2 border-slate-800"><GridDate value={p.date_of_discharge} onChange={(e) => onFieldChange({ date_of_discharge: e.target.value })} onBlur={onFieldBlurSave} /></td>
      <td className="px-1.5 py-0.5">
        <select className="input-cell w-full" value={p.current_status} onChange={(e) => onFieldChange({ current_status: e.target.value })} onBlur={onFieldBlurSave}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{statusLabel(s)}</option>
          ))}
        </select>
      </td>
      <td className="px-1.5 py-0.5"><GridText value={p.comments} onChange={(e) => onFieldChange({ comments: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[7rem]" /></td>
      <td className="px-1.5 py-0.5">
        {isAdmin && (
          <button onClick={onRemove} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  );
}

// Renders one specimen's slot — 5 cells (Type/Date Collected/Date of
// Result/Organism/MDRO) when hasDateResult, or 4 (no Date of Result) for
// the SSI sheet's single specimen slot.
function SpecimenCells({ specimen, hasDateResult, onChange, onBlur, onMdroToggle, divider }) {
  return (
    <>
      <td className={`px-1.5 py-0.5 ${divider ? "border-l-2 border-slate-800" : ""}`}><GridText value={specimen.type} onChange={(e) => onChange({ type: e.target.value })} onBlur={onBlur} className="min-w-[5.5rem]" /></td>
      <td className="px-1.5 py-0.5"><GridDate value={specimen.date_collected} onChange={(e) => onChange({ date_collected: e.target.value })} onBlur={onBlur} /></td>
      {hasDateResult && <td className="px-1.5 py-0.5"><GridDate value={specimen.date_result} onChange={(e) => onChange({ date_result: e.target.value })} onBlur={onBlur} /></td>}
      <td className="px-1.5 py-0.5"><GridText value={specimen.organism} onChange={(e) => onChange({ organism: e.target.value })} onBlur={onBlur} className="min-w-[5.5rem]" /></td>
      <td className="px-1.5 py-0.5 text-center">
        <input type="checkbox" checked={!!specimen.mdro} onChange={(e) => onMdroToggle(e.target.checked)} />
      </td>
    </>
  );
}

// Matches the CDC VAE Surveillance Algorithm's own form layout: one row per
// ventilator-day, grouped into VAC -> IVAC -> PVAP (each stage's own Date of
// Event), so the sheet reads the same way the official form does.
function VaeMonitoringTab({ patients, vaeRows, pediatricIcuTypes, session, isAdmin, flash, onUpdateField, onAddDay, onSave, onRemove }) {
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    if (selectedId && !patients.some((p) => p.id === selectedId)) setSelectedId("");
  }, [patients, selectedId]);

  const selected = patients.find((p) => p.id === selectedId);
  const isPediatric = !!selected && (pediatricIcuTypes ?? []).includes(selected.icu_type);
  const days = useMemo(
    () => vaeRows.filter((r) => r.icu_surveillance_id === selectedId).sort((a, b) => (a.mv_day > b.mv_day ? 1 : -1)),
    [vaeRows, selectedId]
  );

  function handleAddDay() {
    const nextDay = days.length ? Math.max(...days.map((d) => d.mv_day)) + 1 : 1;
    onAddDay(selectedId, nextDay);
  }

  function handleToggle(d, field, checked) {
    onUpdateField(d.id, { [field]: checked });
    onSave({ ...d, [field]: checked });
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
          <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-xl bg-teal-700 p-3 text-xs text-white">
            <span><strong>Patient Name:</strong> {selected.patient_name}</span>
            <span><strong>MRN/ID:</strong> {selected.mrn}</span>
            <span><strong>Date of Mechanical Ventilation:</strong> {selected.ventilator_insertion || "—"}</span>
            <span><strong>Age:</strong> {selected.age}</span>
            <span><strong>Gender:</strong> {selected.gender}</span>
            <span><strong>Bed #:</strong> {selected.bed_no}</span>
          </div>

          {isPediatric && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              PedVAE: an increase in daily minimum FiO2 of ≥0.25 (25 points) or MAP of ≥4 cmH2O over the first day of a ≥2-day stable/improving
              baseline, sustained for ≥2 calendar days, is a Ped VAE event. For infants &lt;30 days old, a daily minimum MAP of 0–8 cmH2O counts
              as 8; for ≥30 days old, 0–10 cmH2O counts as 10.
            </p>
          )}

          <div>
            <button onClick={handleAddDay} className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700">
              <Plus className="h-3.5 w-3.5" />
              Add Day
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm hai-grid">
              {isPediatric ? (
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="sticky-name-col whitespace-nowrap border-b border-slate-200 px-1.5 py-1 font-medium">#</th>
                    {["Date", "MV Day", "Daily Min MAP", "Daily Min FiO2"].map((h) => (
                      <th key={h} className="whitespace-nowrap border-b border-slate-200 px-1.5 py-1 font-medium">{h}</th>
                    ))}
                    <th className="whitespace-nowrap border-b border-l-2 border-slate-800 border-slate-200 px-1.5 py-1 font-medium">Ped VAE</th>
                    <th className="whitespace-nowrap border-b border-slate-200 px-1.5 py-1 font-medium">Updated in Seha</th>
                    <th className="border-b border-slate-200"></th>
                  </tr>
                </thead>
              ) : (
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th rowSpan={2} className="sticky-name-col whitespace-nowrap border-b border-slate-200 px-1.5 py-1 font-medium align-bottom">#</th>
                    {["Date", "MV Day"].map((h) => (
                      <th key={h} rowSpan={2} className="whitespace-nowrap border-b border-slate-200 px-1.5 py-1 font-medium align-bottom">{h}</th>
                    ))}
                    <th colSpan={3} className="border-b border-l-2 border-slate-800 bg-teal-100 px-1.5 py-0.5 text-center font-semibold text-teal-900">VAE - VAC</th>
                    <th colSpan={5} className="border-b border-l-2 border-slate-800 bg-amber-100 px-1.5 py-0.5 text-center font-semibold text-amber-900">VAE - IVAC</th>
                    <th colSpan={3} className="border-b border-l-2 border-slate-800 bg-purple-100 px-1.5 py-0.5 text-center font-semibold text-purple-900">VAE - PVAP</th>
                    <th rowSpan={2} className="whitespace-nowrap border-b border-slate-200 px-1.5 py-1 font-medium align-bottom">Updated in Seha</th>
                    <th rowSpan={2}></th>
                  </tr>
                  <tr>
                    <th className="whitespace-nowrap border-l-2 border-slate-800 px-1.5 py-0.5 font-medium">Daily Min PEEP</th>
                    <th className="whitespace-nowrap px-1.5 py-0.5 font-medium">Daily Min FiO2</th>
                    <th className="whitespace-nowrap px-1.5 py-0.5 font-medium">Date of Event</th>
                    <th className="whitespace-nowrap border-l-2 border-slate-800 px-1.5 py-0.5 font-medium">Temp &lt;36°C or &gt;38°C</th>
                    <th className="whitespace-nowrap px-1.5 py-0.5 font-medium">WBC ≤4,000 or ≥12,000</th>
                    <th className="whitespace-nowrap px-1.5 py-0.5 font-medium">New Antimicrobial Agent</th>
                    <th className="whitespace-nowrap px-1.5 py-0.5 font-medium">QAD</th>
                    <th className="whitespace-nowrap px-1.5 py-0.5 font-medium">Date of Event</th>
                    <th className="whitespace-nowrap border-l-2 border-slate-800 px-1.5 py-0.5 font-medium">Positive Culture</th>
                    <th className="whitespace-nowrap px-1.5 py-0.5 font-medium">Purulent Resp. Secretions</th>
                    <th className="whitespace-nowrap px-1.5 py-0.5 font-medium">Date of Event</th>
                  </tr>
                </thead>
              )}
              <tbody>
                {days.map((d, i) =>
                  isPediatric ? (
                    <PedVaeRow
                      key={d.id}
                      d={d}
                      index={i + 1}
                      isAdmin={isAdmin}
                      onFieldChange={(patch) => onUpdateField(d.id, patch)}
                      onFieldBlurSave={() => onSave(d)}
                      onToggle={(field, checked) => handleToggle(d, field, checked)}
                      onRemove={() => onRemove(d)}
                    />
                  ) : (
                    <VaeRow
                      key={d.id}
                      d={d}
                      index={i + 1}
                      isAdmin={isAdmin}
                      onFieldChange={(patch) => onUpdateField(d.id, patch)}
                      onFieldBlurSave={() => onSave(d)}
                      onToggle={(field, checked) => handleToggle(d, field, checked)}
                      onRemove={() => onRemove(d)}
                    />
                  )
                )}
              </tbody>
            </table>
            {days.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No daily entries yet for this patient.</p>}
          </div>
        </>
      )}
    </div>
  );
}

function PedVaeRow({ d, index, isAdmin, onFieldChange, onFieldBlurSave, onToggle, onRemove }) {
  const rowBg = d.updated_in_seha ? "bg-emerald-200" : "";
  return (
    <tr className={`border-t border-slate-100 hover:bg-slate-50 ${rowBg}`}>
      <td className={`sticky-name-col px-1.5 py-0.5 text-center ${rowBg || "bg-white"}`}>{index}</td>
      <td className="px-1.5 py-0.5"><GridDate value={d.date} onChange={(e) => onFieldChange({ date: e.target.value })} onBlur={onFieldBlurSave} /></td>
      <td className="px-1.5 py-0.5"><GridText value={d.mv_day} onChange={(e) => onFieldChange({ mv_day: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[3.5rem]" /></td>
      <td className="px-1.5 py-0.5"><GridText value={d.daily_min_map ?? ""} onChange={(e) => onFieldChange({ daily_min_map: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[5rem]" /></td>
      <td className="px-1.5 py-0.5"><GridText value={d.daily_min_fio2 ?? ""} onChange={(e) => onFieldChange({ daily_min_fio2: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[5rem]" /></td>
      <td className="px-1.5 py-0.5 border-l-2 border-slate-800">
        <select className="input-cell w-full" value={d.ped_vae ? "Yes" : "No"} onChange={(e) => onToggle("ped_vae", e.target.value === "Yes")}>
          <option value="No">No</option>
          <option value="Yes">Yes</option>
        </select>
      </td>
      <td className="px-1.5 py-0.5 text-center">
        <input type="checkbox" disabled={!isAdmin} checked={!!d.updated_in_seha} onChange={(e) => onToggle("updated_in_seha", e.target.checked)} />
      </td>
      <td className="px-1.5 py-0.5">
        {isAdmin && (
          <button onClick={onRemove} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  );
}

function VaeRow({ d, index, isAdmin, onFieldChange, onFieldBlurSave, onToggle, onRemove }) {
  const rowBg = d.updated_in_seha ? "bg-emerald-200" : "";
  return (
    <tr className={`border-t border-slate-100 hover:bg-slate-50 ${rowBg}`}>
      <td className={`sticky-name-col px-1.5 py-0.5 text-center ${rowBg || "bg-white"}`}>{index}</td>
      <td className="px-1.5 py-0.5"><GridDate value={d.date} onChange={(e) => onFieldChange({ date: e.target.value })} onBlur={onFieldBlurSave} /></td>
      <td className="px-1.5 py-0.5"><GridText value={d.mv_day} onChange={(e) => onFieldChange({ mv_day: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[3.5rem]" /></td>

      <td className="px-1.5 py-0.5 border-l-2 border-slate-800"><GridText value={d.daily_min_peep ?? ""} onChange={(e) => onFieldChange({ daily_min_peep: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[5rem]" /></td>
      <td className="px-1.5 py-0.5"><GridText value={d.daily_min_fio2 ?? ""} onChange={(e) => onFieldChange({ daily_min_fio2: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[5rem]" /></td>
      <td className="px-1.5 py-0.5"><GridDate value={d.vac_date_of_event} onChange={(e) => onFieldChange({ vac_date_of_event: e.target.value })} onBlur={onFieldBlurSave} /></td>

      <td className="px-1.5 py-0.5 text-center border-l-2 border-slate-800"><input type="checkbox" checked={!!d.temp_abnormal} onChange={(e) => onToggle("temp_abnormal", e.target.checked)} /></td>
      <td className="px-1.5 py-0.5 text-center"><input type="checkbox" checked={!!d.wbc_abnormal} onChange={(e) => onToggle("wbc_abnormal", e.target.checked)} /></td>
      <td className="px-1.5 py-0.5 text-center"><input type="checkbox" checked={!!d.new_antimicrobial} onChange={(e) => onToggle("new_antimicrobial", e.target.checked)} /></td>
      <td className="px-1.5 py-0.5"><GridText value={d.qad ?? ""} onChange={(e) => onFieldChange({ qad: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[3.5rem]" /></td>
      <td className="px-1.5 py-0.5"><GridDate value={d.ivac_date_of_event} onChange={(e) => onFieldChange({ ivac_date_of_event: e.target.value })} onBlur={onFieldBlurSave} /></td>

      <td className="px-1.5 py-0.5 text-center border-l-2 border-slate-800"><input type="checkbox" checked={!!d.positive_culture} onChange={(e) => onToggle("positive_culture", e.target.checked)} /></td>
      <td className="px-1.5 py-0.5 text-center"><input type="checkbox" checked={!!d.purulent_resp_secretions} onChange={(e) => onToggle("purulent_resp_secretions", e.target.checked)} /></td>
      <td className="px-1.5 py-0.5"><GridDate value={d.pvap_date_of_event} onChange={(e) => onFieldChange({ pvap_date_of_event: e.target.value })} onBlur={onFieldBlurSave} /></td>

      <td className="px-1.5 py-0.5 text-center">
        <input type="checkbox" disabled={!isAdmin} checked={!!d.updated_in_seha} onChange={(e) => onToggle("updated_in_seha", e.target.checked)} />
      </td>
      <td className="px-1.5 py-0.5">
        {isAdmin && (
          <button onClick={onRemove} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  );
}

function SsiSurveillanceTab({ cases, loading, units, session, isAdmin, onAddCase, onUpdateField, onSave, onRemove, onUpdateFollowUp, onUpdateSpecimen, onMarkComplete, onReopen }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-slate-500">
        <strong>DR</strong> (patient/procedure info) and <strong>OR</strong> (risk category index) are always editable to any SSI-scoped account.
        Only <strong>DR & FW</strong> (current status + date of discharge) keeps a "Mark complete" step.
      </p>
      <div>
        <button onClick={onAddCase} className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700">
          <UserPlus className="h-3.5 w-3.5" />
          Add Patient
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm hai-grid">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th rowSpan={2} className="whitespace-nowrap border-b border-slate-200 px-1.5 py-1 font-medium align-bottom">Updated in Seha</th>
              <th colSpan={isAdmin ? 14 : 10} className="border-b border-slate-200 bg-cyan-100 px-1.5 py-0.5 text-center font-semibold text-cyan-900">DR</th>
              <th colSpan={4} className="border-b border-l-2 border-slate-800 bg-green-100 px-1.5 py-0.5 text-center font-semibold text-green-900">OR</th>
              {["PATOS", "Follow-up Duration"].map((h) => (
                <th key={h} rowSpan={2} className="whitespace-nowrap border-b border-slate-200 px-1.5 py-1 font-medium align-bottom">{h}</th>
              ))}
              <th colSpan={10} className="border-b border-l-2 border-slate-800 px-1.5 py-0.5 text-center font-medium">1st Follow Up</th>
              <th colSpan={10} className="border-b border-slate-200 px-1.5 py-0.5 text-center font-medium">2nd Follow Up</th>
              <th colSpan={10} className="border-b border-slate-200 px-1.5 py-0.5 text-center font-medium">3rd Follow Up</th>
              <th colSpan={4} className="border-b border-l-2 border-slate-800 px-1.5 py-0.5 text-center font-medium">Specimen Information</th>
              {["Other Specimens", "SSI Detected", "Type of SSI"].map((h) => (
                <th key={h} rowSpan={2} className="whitespace-nowrap border-b border-slate-200 px-1.5 py-1 font-medium align-bottom">{h}</th>
              ))}
              <th colSpan={3} className="border-b border-l-2 border-slate-800 bg-purple-100 px-1.5 py-0.5 text-center font-semibold text-purple-900">DR & FW</th>
              <th rowSpan={2} className="whitespace-nowrap border-b border-slate-200 px-1.5 py-1 font-medium align-bottom">Comments</th>
              <th rowSpan={2}></th>
            </tr>
            <tr>
              {["Month", "Patient Name", "MRN/ID"].map((h) => (
                <th key={`dr-${h}`} className={`whitespace-nowrap px-1.5 py-0.5 font-medium ${h === "Patient Name" ? "sticky-name-col" : ""}`}>{h}</th>
              ))}
              {isAdmin && IC_ONLY_HEADERS.map((h) => (
                <th key={`dr-${h}`} className="whitespace-nowrap bg-slate-100 px-1.5 py-0.5 font-medium">{h}</th>
              ))}
              {["Unit", "Age", "Gender", "Admission Diagnosis", "Treating Doctor", "Type of Surgical Procedure", "Date of Procedure"].map((h) => (
                <th key={`dr-${h}`} className="whitespace-nowrap px-1.5 py-0.5 font-medium">{h}</th>
              ))}
              {["Elective/Emergency", "ASA Score", "Wound Class", "Duration of Surgery"].map((h, i) => (
                <th key={`or-${h}`} className={`whitespace-nowrap px-1.5 py-0.5 font-medium ${i === 0 ? "border-l-2 border-slate-800" : ""}`}>{h}</th>
              ))}
              {[1, 2, 3].flatMap((slot) =>
                ["Type", "Date", "Fever", "Pain/Tenderness", "Redness", "Swelling", "Purulent Discharge", "Wound Dehiscence", "Surgical Site Swab Sent", "Wound Status"].map((h, i) => (
                  <th key={`${slot}-${h}`} className={`whitespace-nowrap px-1.5 py-0.5 font-medium ${i === 0 && slot === 1 ? "border-l-2 border-slate-800" : ""}`}>{h}</th>
                ))
              )}
              {["Type", "Date Collected", "Organism", "MDRO"].map((h, i) => (
                <th key={h} className={`whitespace-nowrap px-1.5 py-0.5 font-medium ${i === 0 ? "border-l-2 border-slate-800" : ""}`}>{h}</th>
              ))}
              {["Current Status", "Date of Discharge"].map((h, i) => (
                <th key={`drfw-${h}`} className={`whitespace-nowrap px-1.5 py-0.5 font-medium ${i === 0 ? "border-l-2 border-slate-800" : ""}`}>{h}</th>
              ))}
              <th className="whitespace-nowrap px-1.5 py-0.5 font-medium">Status</th>
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
                  const patch = { updated_in_seha: checked, updated_in_seha_status: checked ? c.current_status : null };
                  onUpdateField(c.id, patch);
                  onSave({ ...c, ...patch });
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
  const drFwDone = !!c.dr_fw_completed_at;

  // DR and OR are plain, always-editable fields now — only DR & FW keeps the
  // "Mark complete" step, and it's no longer gated behind DR/OR completion.
  const drDisabled = !canEditSsi("DR");
  const orDisabled = !canEditSsi("OR");
  // Current Status/Date of Discharge stay editable even after "Mark complete" —
  // a patient's discharge status can change after the DR&FW notes are finalized,
  // so it shouldn't need an admin "Reopen" every time it's updated.
  const drFwFieldsDisabled = !canEditSsi("DR_FW");
  const nameCellClass = identityCellClass(c.current_status, c.updated_in_seha, c.updated_in_seha_status, false);
  const rowBg = sehaRowClass(c.current_status, c.updated_in_seha, c.updated_in_seha_status);

  return (
    <tr className={`border-t border-slate-100 hover:bg-slate-50 ${rowBg}`}>
      <td className={`px-1.5 py-0.5 text-center ${rowBg || "bg-white"}`}>
        <input
          type="checkbox"
          disabled={!isAdmin}
          checked={!!c.updated_in_seha}
          onChange={(e) => onUpdatedInSehaToggle(e.target.checked)}
          title={sehaSyncState(c.current_status, c.updated_in_seha, c.updated_in_seha_status) === "stale" ? "Updated in Seha before — status has changed since, needs a fresh update" : undefined}
        />
      </td>

      <td className="px-1.5 py-0.5"><GridText value={c.month} onChange={(e) => onFieldChange({ month: e.target.value })} onBlur={onFieldBlurSave} disabled={drDisabled} /></td>
      <td className={`sticky-name-col px-1.5 py-0.5 ${nameCellClass || rowBg || "bg-white"}`}><GridText value={c.patient_name} onChange={(e) => onFieldChange({ patient_name: e.target.value })} onBlur={onFieldBlurSave} disabled={drDisabled} className={`min-w-[8rem] ${nameCellClass}`} /></td>
      <td className={`px-1.5 py-0.5 ${nameCellClass}`}><GridText value={c.mrn} onChange={(e) => onFieldChange({ mrn: e.target.value })} onBlur={onFieldBlurSave} disabled={drDisabled} className={`min-w-[5rem] ${nameCellClass}`} /></td>
      <IcOnlyCells isAdmin={isAdmin} record={c} onFieldChange={onFieldChange} onFieldBlurSave={onFieldBlurSave} />
      <td className="px-1.5 py-0.5">
        <select className="input-cell w-full min-w-[5.5rem]" disabled={drDisabled} value={c.unit} onChange={(e) => onFieldChange({ unit: e.target.value })} onBlur={onFieldBlurSave}>
          <option value="">—</option>
          {units.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </td>
      <td className="px-1.5 py-0.5"><GridText value={c.age} onChange={(e) => onFieldChange({ age: e.target.value })} onBlur={onFieldBlurSave} disabled={drDisabled} className="min-w-[3.5rem]" /></td>
      <td className="px-1.5 py-0.5">
        <select className="input-cell w-full" disabled={drDisabled} value={c.gender} onChange={(e) => onFieldChange({ gender: e.target.value })} onBlur={onFieldBlurSave}>
          <option value="">—</option>
          <option value="M">M</option>
          <option value="F">F</option>
        </select>
      </td>
      <td className="px-1.5 py-0.5"><GridText value={c.admission_diagnosis} onChange={(e) => onFieldChange({ admission_diagnosis: e.target.value })} onBlur={onFieldBlurSave} disabled={drDisabled} className="min-w-[8rem]" /></td>
      <td className="px-1.5 py-0.5"><GridText value={c.treating_doctor} onChange={(e) => onFieldChange({ treating_doctor: e.target.value })} onBlur={onFieldBlurSave} disabled={drDisabled} placeholder="Dr..." className="min-w-[6.5rem]" /></td>
      <td className="px-1.5 py-0.5"><GridText value={c.surgical_procedure_type} onChange={(e) => onFieldChange({ surgical_procedure_type: e.target.value })} onBlur={onFieldBlurSave} disabled={drDisabled} className="min-w-[7rem]" /></td>
      <td className="px-1.5 py-0.5"><GridDate value={c.date_of_procedure} onChange={(e) => onFieldChange({ date_of_procedure: e.target.value })} onBlur={onFieldBlurSave} disabled={drDisabled} /></td>

      <td className="px-1.5 py-0.5 border-l-2 border-slate-800">
        <select className="input-cell w-full min-w-[5.5rem]" disabled={orDisabled} value={c.elective_emergency} onChange={(e) => onFieldChange({ elective_emergency: e.target.value })} onBlur={onFieldBlurSave}>
          <option value="elective">Elective</option>
          <option value="emergency">Emergency</option>
        </select>
      </td>
      <td className="px-1.5 py-0.5">
        <select className={`input-cell w-full ${riskClass(c.asa_score, ASA_SCORE_GOOD)}`} disabled={orDisabled} value={c.asa_score} onChange={(e) => onFieldChange({ asa_score: e.target.value })} onBlur={onFieldBlurSave}>
          <option value="">—</option>
          {ASA_SCORE_OPTIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </td>
      <td className="px-1.5 py-0.5">
        <select className={`input-cell w-full min-w-[6.5rem] ${riskClass(c.wound_class, WOUND_CLASS_GOOD)}`} disabled={orDisabled} value={c.wound_class} onChange={(e) => onFieldChange({ wound_class: e.target.value })} onBlur={onFieldBlurSave}>
          <option value="">—</option>
          {WOUND_CLASS_OPTIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </td>
      <td className="px-1.5 py-0.5">
        <select className="input-cell w-full min-w-[8rem]" disabled={orDisabled} value={c.duration_of_surgery} onChange={(e) => onFieldChange({ duration_of_surgery: e.target.value })} onBlur={onFieldBlurSave}>
          <option value="">—</option>
          {DURATION_OF_SURGERY_OPTIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </td>

      <td className="px-1.5 py-0.5">
        <select className="input-cell w-full" value={c.patos ? "Yes" : "No"} onChange={(e) => onPatosToggle(e.target.value === "Yes")}>
          <option value="No">No</option>
          <option value="Yes">Yes</option>
        </select>
      </td>
      <td className="px-1.5 py-0.5">
        <select className="input-cell w-full" value={c.follow_up_duration} onChange={(e) => onFieldChange({ follow_up_duration: Number(e.target.value) })} onBlur={onFieldBlurSave}>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
        </select>
      </td>

      {c.follow_ups.map((f, i) => (
        <FollowUpCells key={i} followUp={f} divider={i === 0} onChange={(patch) => onFollowUpFieldChange(i, patch)} onBlur={onFieldBlurSave} />
      ))}

      {c.specimens.map((s, i) => (
        <SpecimenCells
          key={i}
          specimen={s}
          hasDateResult={false}
          divider={i === 0}
          onChange={(patch) => onSpecimenFieldChange(i, patch)}
          onBlur={onFieldBlurSave}
          onMdroToggle={(checked) => onSpecimenMdroToggle(i, checked)}
        />
      ))}

      <td className="px-1.5 py-0.5"><GridText value={c.other_specimens} onChange={(e) => onFieldChange({ other_specimens: e.target.value })} onBlur={onFieldBlurSave} /></td>
      <td className="px-1.5 py-0.5 text-center">
        <input type="checkbox" checked={!!c.ssi_detected} onChange={(e) => onSsiDetectedToggle(e.target.checked)} />
      </td>
      <td className="px-1.5 py-0.5"><GridText value={c.type_of_ssi} onChange={(e) => onFieldChange({ type_of_ssi: e.target.value })} onBlur={onFieldBlurSave} disabled={!c.ssi_detected} className="min-w-[6.5rem]" /></td>

      <td className="px-1.5 py-0.5 border-l-2 border-slate-800">
        <select className="input-cell w-full" disabled={drFwFieldsDisabled} value={c.current_status} onChange={(e) => onFieldChange({ current_status: e.target.value })} onBlur={onFieldBlurSave}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{statusLabel(s)}</option>
          ))}
        </select>
      </td>
      <td className="px-1.5 py-0.5"><GridDate value={c.date_of_discharge} onChange={(e) => onFieldChange({ date_of_discharge: e.target.value })} onBlur={onFieldBlurSave} disabled={drFwFieldsDisabled} /></td>
      <td className="px-1.5 py-0.5">
        <StageActionCell open={true} done={drFwDone} canEdit={canEditSsi("DR_FW")} canReopen={isAdmin} completedBy={c.dr_fw_completed_by} onMarkComplete={() => onMarkComplete("dr_fw")} onReopen={() => onReopen("dr_fw")} />
      </td>

      <td className="px-1.5 py-0.5"><GridText value={c.comments} onChange={(e) => onFieldChange({ comments: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[7rem]" /></td>
      <td className="px-1.5 py-0.5">
        {isAdmin && (
          <button onClick={onRemove} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  );
}

function FollowUpCells({ followUp, onChange, onBlur, divider }) {
  return (
    <>
      <td className={`px-1.5 py-0.5 ${divider ? "border-l-2 border-slate-800" : ""}`}><GridText value={followUp.type} onChange={(e) => onChange({ type: e.target.value })} onBlur={onBlur} placeholder="OPD/ER/Phone/Virtual" className="min-w-[6.5rem]" /></td>
      <td className="px-1.5 py-0.5"><GridDate value={followUp.date} onChange={(e) => onChange({ date: e.target.value })} onBlur={onBlur} /></td>
      {SIGN_FIELDS.map((f) => (
        <td key={f} className="px-1.5 py-0.5">
          <SignSelect value={followUp[f]} onChange={(e) => onChange({ [f]: e.target.value })} onBlur={onBlur} />
        </td>
      ))}
      <td className="px-1.5 py-0.5">
        <SwabSelect value={followUp.surgical_site_swab_sent} onChange={(e) => onChange({ surgical_site_swab_sent: e.target.value })} onBlur={onBlur} />
      </td>
      <td className="px-1.5 py-0.5"><GridText value={followUp.wound_status} onChange={(e) => onChange({ wound_status: e.target.value })} onBlur={onBlur} className="min-w-[5.5rem]" /></td>
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
        <table className="w-full text-sm hai-grid">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th rowSpan={2} className="whitespace-nowrap border-b border-slate-200 px-1.5 py-1 font-medium align-bottom">Updated in Seha</th>
              {["Patient Name", "MRN/ID"].map((h) => (
                <th key={h} rowSpan={2} className={`whitespace-nowrap border-b border-slate-200 px-1.5 py-1 font-medium align-bottom ${h === "Patient Name" ? "sticky-name-col" : ""}`}>{h}</th>
              ))}
              {isAdmin && IC_ONLY_HEADERS.map((h) => (
                <th key={h} rowSpan={2} className="whitespace-nowrap border-b border-slate-200 bg-slate-100 px-1.5 py-1 font-medium align-bottom">{h}</th>
              ))}
              {["Age", "Admission Diagnosis"].map((h) => (
                <th key={h} rowSpan={2} className="whitespace-nowrap border-b border-slate-200 px-1.5 py-1 font-medium align-bottom">{h}</th>
              ))}
              <th colSpan={7} className="border-b border-slate-200 px-1.5 py-0.5 text-center font-medium">OR</th>
              <th colSpan={4} className="border-b border-l-2 border-slate-800 px-1.5 py-0.5 text-center font-medium">Delivery</th>
              <th colSpan={11} className="border-b border-l-2 border-slate-800 px-1.5 py-0.5 text-center font-medium">Female Ward</th>
              {["Current Status", "Comments"].map((h) => (
                <th key={h} rowSpan={2} className="whitespace-nowrap border-b border-slate-200 px-1.5 py-1 font-medium align-bottom">{h}</th>
              ))}
              <th rowSpan={2}></th>
            </tr>
            <tr>
              {["Date of Procedure", "Surgical Procedure Type", "ASA Score", "Wound Class", "Duration of Surgery", "OR Notes", "Status"].map((h) => (
                <th key={`or-${h}`} className="whitespace-nowrap px-1.5 py-0.5 font-medium">{h}</th>
              ))}
              {["Date", "Signs & Symptoms", "Notes", "Status"].map((h, i) => (
                <th key={`dl-${h}`} className={`whitespace-nowrap px-1.5 py-0.5 font-medium ${i === 0 ? "border-l-2 border-slate-800" : ""}`}>{h}</th>
              ))}
              {["Date", "Signs & Symptoms", "Wound Status", "Notes", "Specimen Type", "Specimen Date Collected", "Organism", "MDRO", "SSI Detected", "Type of SSI", "Status"].map((h, i) => (
                <th key={`fw-${h}`} className={`whitespace-nowrap px-1.5 py-0.5 font-medium ${i === 0 ? "border-l-2 border-slate-800" : ""}`}>{h}</th>
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
                onUpdatedInSehaToggle={(checked) => {
                  const patch = { updated_in_seha: checked, updated_in_seha_status: checked ? c.current_status : null };
                  onUpdateField(c.id, patch);
                  onSave({ ...c, ...patch });
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
      <button onClick={onMarkComplete} className="whitespace-nowrap rounded-lg bg-teal-600 px-1.5 py-0.5 text-xs font-medium text-white hover:bg-teal-700">
        Mark complete
      </button>
    );
  }
  return <span className="whitespace-nowrap text-xs font-medium text-amber-600">Open</span>;
}

function ObRow({ c, session, isAdmin, onFieldChange, onFieldBlurSave, onMarkComplete, onReopen, onSpecimenFieldChange, onSpecimenMdroToggle, onSsiDetectedToggle, onUpdatedInSehaToggle, onRemove }) {
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
  const nameCellClass = identityCellClass(c.current_status, c.updated_in_seha, c.updated_in_seha_status, false);
  const rowBg = sehaRowClass(c.current_status, c.updated_in_seha, c.updated_in_seha_status);

  return (
    <tr className={`border-t border-slate-100 hover:bg-slate-50 ${rowBg}`}>
      <td className={`px-1.5 py-0.5 text-center ${rowBg || "bg-white"}`}>
        <input
          type="checkbox"
          disabled={!isAdmin}
          checked={!!c.updated_in_seha}
          onChange={(e) => onUpdatedInSehaToggle(e.target.checked)}
          title={sehaSyncState(c.current_status, c.updated_in_seha, c.updated_in_seha_status) === "stale" ? "Updated in Seha before — status has changed since, needs a fresh update" : undefined}
        />
      </td>
      <td className={`sticky-name-col px-1.5 py-0.5 ${nameCellClass || rowBg || "bg-white"}`}><GridText value={c.patient_name} onChange={(e) => onFieldChange({ patient_name: e.target.value })} onBlur={onFieldBlurSave} className={`min-w-[8rem] ${nameCellClass}`} /></td>
      <td className={`px-1.5 py-0.5 ${nameCellClass}`}><GridText value={c.mrn} onChange={(e) => onFieldChange({ mrn: e.target.value })} onBlur={onFieldBlurSave} className={`min-w-[5rem] ${nameCellClass}`} /></td>
      <IcOnlyCells isAdmin={isAdmin} record={c} onFieldChange={onFieldChange} onFieldBlurSave={onFieldBlurSave} />
      <td className="px-1.5 py-0.5"><GridText value={c.age} onChange={(e) => onFieldChange({ age: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[3.5rem]" /></td>
      <td className="px-1.5 py-0.5"><GridText value={c.admission_diagnosis} onChange={(e) => onFieldChange({ admission_diagnosis: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[8rem]" /></td>

      <td className="px-1.5 py-0.5"><GridDate value={c.date_of_procedure} onChange={(e) => onFieldChange({ date_of_procedure: e.target.value })} onBlur={onFieldBlurSave} disabled={orDisabled} /></td>
      <td className="px-1.5 py-0.5"><GridText value={c.surgical_procedure_type} onChange={(e) => onFieldChange({ surgical_procedure_type: e.target.value })} onBlur={onFieldBlurSave} disabled={orDisabled} className="min-w-[7rem]" /></td>
      <td className="px-1.5 py-0.5"><GridText value={c.asa_score} onChange={(e) => onFieldChange({ asa_score: e.target.value })} onBlur={onFieldBlurSave} disabled={orDisabled} className="min-w-[4.5rem]" /></td>
      <td className="px-1.5 py-0.5"><GridText value={c.wound_class} onChange={(e) => onFieldChange({ wound_class: e.target.value })} onBlur={onFieldBlurSave} disabled={orDisabled} className="min-w-[6.5rem]" /></td>
      <td className="px-1.5 py-0.5"><GridText value={c.duration_of_surgery} onChange={(e) => onFieldChange({ duration_of_surgery: e.target.value })} onBlur={onFieldBlurSave} disabled={orDisabled} className="min-w-[5rem]" /></td>
      <td className="px-1.5 py-0.5"><GridText value={c.or_notes} onChange={(e) => onFieldChange({ or_notes: e.target.value })} onBlur={onFieldBlurSave} disabled={orDisabled} className="min-w-[8rem]" /></td>
      <td className="px-1.5 py-0.5">
        <StageActionCell open={true} done={orDone} canEdit={canEdit("OR")} canReopen={isAdmin} completedBy={c.or_completed_by} onMarkComplete={() => onMarkComplete("or")} onReopen={() => onReopen("or")} />
      </td>

      <td className="px-1.5 py-0.5 border-l-2 border-slate-800"><GridDate value={c.delivery_date} onChange={(e) => onFieldChange({ delivery_date: e.target.value })} onBlur={onFieldBlurSave} disabled={deliveryDisabled} /></td>
      <td className="px-1.5 py-0.5"><GridText value={c.delivery_signs_symptoms} onChange={(e) => onFieldChange({ delivery_signs_symptoms: e.target.value })} onBlur={onFieldBlurSave} disabled={deliveryDisabled} className="min-w-[7rem]" /></td>
      <td className="px-1.5 py-0.5"><GridText value={c.delivery_notes} onChange={(e) => onFieldChange({ delivery_notes: e.target.value })} onBlur={onFieldBlurSave} disabled={deliveryDisabled} className="min-w-[8rem]" /></td>
      <td className="px-1.5 py-0.5">
        <StageActionCell open={deliveryOpen} done={deliveryDone} canEdit={canEdit("Delivery")} canReopen={isAdmin} completedBy={c.delivery_completed_by} onMarkComplete={() => onMarkComplete("delivery")} onReopen={() => onReopen("delivery")} />
      </td>

      <td className="px-1.5 py-0.5 border-l-2 border-slate-800"><GridDate value={c.fw_date} onChange={(e) => onFieldChange({ fw_date: e.target.value })} onBlur={onFieldBlurSave} disabled={fwDisabled} /></td>
      <td className="px-1.5 py-0.5"><GridText value={c.fw_signs_symptoms} onChange={(e) => onFieldChange({ fw_signs_symptoms: e.target.value })} onBlur={onFieldBlurSave} disabled={fwDisabled} className="min-w-[7rem]" /></td>
      <td className="px-1.5 py-0.5"><GridText value={c.fw_wound_status} onChange={(e) => onFieldChange({ fw_wound_status: e.target.value })} onBlur={onFieldBlurSave} disabled={fwDisabled} className="min-w-[6.5rem]" /></td>
      <td className="px-1.5 py-0.5"><GridText value={c.fw_notes} onChange={(e) => onFieldChange({ fw_notes: e.target.value })} onBlur={onFieldBlurSave} disabled={fwDisabled} className="min-w-[8rem]" /></td>
      <td className="px-1.5 py-0.5"><GridText value={specimen.type} onChange={(e) => onSpecimenFieldChange({ type: e.target.value })} onBlur={onFieldBlurSave} disabled={fwDisabled} className="min-w-[5.5rem]" /></td>
      <td className="px-1.5 py-0.5"><GridDate value={specimen.date_collected} onChange={(e) => onSpecimenFieldChange({ date_collected: e.target.value })} onBlur={onFieldBlurSave} disabled={fwDisabled} /></td>
      <td className="px-1.5 py-0.5"><GridText value={specimen.organism} onChange={(e) => onSpecimenFieldChange({ organism: e.target.value })} onBlur={onFieldBlurSave} disabled={fwDisabled} className="min-w-[5.5rem]" /></td>
      <td className="px-1.5 py-0.5 text-center"><input type="checkbox" disabled={fwDisabled} checked={!!specimen.mdro} onChange={(e) => onSpecimenMdroToggle(e.target.checked)} /></td>
      <td className="px-1.5 py-0.5 text-center"><input type="checkbox" disabled={fwDisabled} checked={!!c.ssi_detected} onChange={(e) => onSsiDetectedToggle(e.target.checked)} /></td>
      <td className="px-1.5 py-0.5"><GridText value={c.type_of_ssi} onChange={(e) => onFieldChange({ type_of_ssi: e.target.value })} onBlur={onFieldBlurSave} disabled={fwDisabled || !c.ssi_detected} className="min-w-[6.5rem]" /></td>
      <td className="px-1.5 py-0.5">
        <StageActionCell open={fwOpen} done={fwDone} canEdit={canEdit("Female Ward")} canReopen={isAdmin} completedBy={c.fw_completed_by} onMarkComplete={() => onMarkComplete("fw")} onReopen={() => onReopen("fw")} />
      </td>

      <td className="px-1.5 py-0.5">
        <select className="input-cell w-full" value={c.current_status} onChange={(e) => onFieldChange({ current_status: e.target.value })} onBlur={onFieldBlurSave}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{statusLabel(s)}</option>
          ))}
        </select>
      </td>
      <td className="px-1.5 py-0.5"><GridText value={c.comments} onChange={(e) => onFieldChange({ comments: e.target.value })} onBlur={onFieldBlurSave} className="min-w-[8rem]" /></td>
      <td className="px-1.5 py-0.5">
        {isAdmin && (
          <button onClick={onRemove} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
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
