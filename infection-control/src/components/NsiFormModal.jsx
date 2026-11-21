import { useEffect, useRef, useState } from "react";
import { Eraser, Printer } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth.jsx";
import { useLanguage } from "../lib/i18n.jsx";
import rabiaLogo from "../assets/rabia-logo.jpg";
import PrintPortal from "./PrintPortal";
import { fmtDate } from "../lib/dates";

const NSI_BUCKET = "employee-health-attachments";
const todayStr = () => new Date().toISOString().slice(0, 10);

function fileUrl(path) {
  if (!path) return null;
  return supabase.storage.from(NSI_BUCKET).getPublicUrl(path).data.publicUrl;
}

const NATURE_OPTIONS = [
  ["superficial", "Superficial"],
  ["deep", "Deep"],
  ["moderate", "Moderate"],
  ["bleeding", "Bleeding"],
  ["glove_penetrated", "Glove Penetrated by Sharp"],
];
const CONTAMINATION_OPTIONS = [
  ["blood", "Blood"],
  ["blood_stained_fluid", "Blood Stained Fluid"],
  ["non_blood_stained_fluid", "Non-Blood Stained Fluid"],
  ["unknown", "Unknown"],
];

const emptyFormData = {
  employee_health_no: "",
  age: "",
  sex: "",
  nationality: "",
  designation: "",
  incident_date: todayStr(),
  incident_time: "",
  reporting_date: todayStr(),
  reporting_time: "",
  location: "",
  procedure_at_time: "",
  purpose_sharp_used_for: "",
  nature_of_injury: {},
  contamination_type: {},
  last_hep_b_course: "",
  last_tetanus: "",
  first_aid: "",
  incident_form: "",
  risk_assessed: "",
  gloves_worn: "",
  source_known: "",
  source_blood_requested: "",
  source_blood_obtained: "",
  anti_hcv: "",
  hbsag: "",
  anti_hiv: "",
  pep_procedure_instigated: "",
  hiv_pep_outcome: "",
  doctor_name: "",
  doctor_designation: "",
  doctor_sign_date: "",
  comments: "",
  physician_name: "",
  physician_sign_date: "",
};

// A small Yes/Advised-or-No/NA style radio row, used throughout Part B.
function RadioGroup({ label, value, onChange, options, disabled }) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-slate-500">{t(label)}</span>
      <div className="flex flex-wrap gap-3">
        {options.map(([val, lbl]) => (
          <label key={val} className="flex items-center gap-1 text-xs text-slate-700">
            <input type="radio" disabled={disabled} checked={value === val} onChange={() => onChange(val)} />
            {t(lbl)}
          </label>
        ))}
      </div>
    </div>
  );
}

function CheckboxGroup({ label, value, onChange, options, disabled }) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-slate-500">{t(label)}</span>
      <div className="flex flex-col gap-1">
        {options.map(([key, lbl]) => (
          <label key={key} className="flex items-center gap-1.5 text-xs text-slate-700">
            <input
              type="checkbox"
              disabled={disabled}
              checked={!!value?.[key]}
              onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
            />
            {t(lbl)}
          </label>
        ))}
      </div>
    </div>
  );
}

function SignaturePad({ canvasRef, onDrawn, disabled }) {
  const drawingRef = useRef(false);
  function point(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
  }
  function down(e) {
    if (disabled) return;
    e.preventDefault();
    drawingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current.getContext("2d");
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(e) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = point(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    onDrawn();
  }
  function up(e) {
    drawingRef.current = false;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  return (
    <canvas
      ref={canvasRef}
      width={480}
      height={120}
      className="w-full touch-none rounded-lg border border-dashed border-slate-300 bg-slate-50"
      style={{ cursor: disabled ? "default" : "crosshair" }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    />
  );
}

// Digitizes Rabia Hospital's "NSI Form 293" (Needle Stick Injury/Exposure
// Report) — Part A is filled by the staff member reporting the incident,
// Part B by the doctor/ICN doing the risk assessment and follow-up, who
// signs off on screen the same way the Refusal/Acceptance forms do.
export default function NsiFormModal({ nsiCase, emp, onClose, flash, onSaved }) {
  const { session } = useAuth();
  const { t } = useLanguage();
  const [data, setData] = useState({
    ...emptyFormData,
    nationality: emp.nationality || "",
    designation: emp.job_title || "",
    incident_date: nsiCase.incident_date || todayStr(),
    ...nsiCase.form_data,
  });
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [doctorHasSig, setDoctorHasSig] = useState(!!nsiCase.doctor_signature_path);
  const [physicianHasSig, setPhysicianHasSig] = useState(!!nsiCase.physician_signature_path);
  const [savedSigPaths, setSavedSigPaths] = useState({
    doctor: nsiCase.doctor_signature_path || null,
    physician: nsiCase.physician_signature_path || null,
  });
  const doctorCanvasRef = useRef(null);
  const physicianCanvasRef = useRef(null);

  useEffect(() => {
    // Pre-draw an existing saved signature onto its canvas on open, so
    // re-opening the form to add Part B doesn't look like the earlier
    // signature was lost.
    async function loadSig(path, canvasRef) {
      if (!path || !canvasRef.current) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => canvasRef.current?.getContext("2d").drawImage(img, 0, 0, canvasRef.current.width, canvasRef.current.height);
      img.src = fileUrl(path);
    }
    loadSig(nsiCase.doctor_signature_path, doctorCanvasRef);
    loadSig(nsiCase.physician_signature_path, physicianCanvasRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set(patch) {
    setData((prev) => ({ ...prev, ...patch }));
  }
  function clearCanvas(canvasRef, setHas) {
    const c = canvasRef.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    setHas(false);
  }

  async function uploadSignature(canvasRef, label) {
    const blob = await new Promise((resolve) => canvasRef.current.toBlob(resolve, "image/png"));
    const path = `nsi-signatures/${nsiCase.id}/${label}-${Date.now()}.png`;
    const { error } = await supabase.storage.from(NSI_BUCKET).upload(path, blob);
    if (error) throw error;
    return path;
  }

  async function handleSave() {
    setSaving(true);
    try {
      const patch = { form_data: data };
      if (doctorHasSig) patch.doctor_signature_path = await uploadSignature(doctorCanvasRef, "doctor");
      if (physicianHasSig) patch.physician_signature_path = await uploadSignature(physicianCanvasRef, "physician");
      const { error } = await supabase.from("employee_nsi_followups").update(patch).eq("id", nsiCase.id);
      if (error) throw error;
      setSavedSigPaths((prev) => ({
        doctor: patch.doctor_signature_path ?? prev.doctor,
        physician: patch.physician_signature_path ?? prev.physician,
      }));
      flash({ type: "success", text: "NSI form saved" });
      await onSaved?.();
      setPrinting(true);
    } catch (err) {
      flash({ type: "error", text: "Could not save: " + err.message });
    } finally {
      setSaving(false);
    }
  }

  const naturePicked = NATURE_OPTIONS.filter(([k]) => data.nature_of_injury?.[k]).map(([, l]) => t(l));
  const contaminationPicked = CONTAMINATION_OPTIONS.filter(([k]) => data.contamination_type?.[k]).map(([, l]) => t(l));
  const radioLabel = (v) => (v === "na" ? "N/A" : v ? t(v === "advised" ? "Advised" : v === "yes" ? "Yes" : v === "no" ? "No" : v) : "—");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 print:hidden" onClick={onClose}>
      <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h3 className="text-base font-semibold text-slate-800">{t("NSI Form 293")}</h3>
            <p className="text-xs text-slate-500">
              {emp.name} · {emp.employee_no} · {t("Incident date")}: {fmtDate(nsiCase.incident_date) || "—"}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-50">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-2 text-xs font-bold text-slate-600">{t("Employee Information")}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Employee Health No")}
              <input className="input" value={data.employee_health_no} onChange={(e) => set({ employee_health_no: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Age")}
              <input className="input" value={data.age} onChange={(e) => set({ age: e.target.value })} />
            </label>
            <RadioGroup label="Sex" value={data.sex} onChange={(v) => set({ sex: v })} options={[["M", "M"], ["F", "F"]]} />
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Nationality")}
              <input className="input" value={data.nationality} onChange={(e) => set({ nationality: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Designation")}
              <input className="input" value={data.designation} onChange={(e) => set({ designation: e.target.value })} />
            </label>
          </div>

          <p className="mt-4 mb-2 text-xs font-bold text-slate-600">{t("Part A — To be filled up by the staff")}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Date of Incident")}
              <input type="date" className="input" value={data.incident_date} onChange={(e) => set({ incident_date: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Time of Incident")}
              <input type="time" className="input" value={data.incident_time} onChange={(e) => set({ incident_time: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Date of Reporting")}
              <input type="date" className="input" value={data.reporting_date} onChange={(e) => set({ reporting_date: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Time of Reporting")}
              <input type="time" className="input" value={data.reporting_time} onChange={(e) => set({ reporting_time: e.target.value })} />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-xs text-slate-500 sm:col-span-4">
              {t("Location")}
              <input className="input" value={data.location} onChange={(e) => set({ location: e.target.value })} />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-xs text-slate-500">
              {t("Procedure at Time of Incident")}
              <input className="input" value={data.procedure_at_time} onChange={(e) => set({ procedure_at_time: e.target.value })} />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-xs text-slate-500">
              {t("Purpose Sharp was Used For")}
              <input className="input" value={data.purpose_sharp_used_for} onChange={(e) => set({ purpose_sharp_used_for: e.target.value })} />
            </label>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CheckboxGroup label="Nature of Injury" value={data.nature_of_injury} onChange={(v) => set({ nature_of_injury: v })} options={NATURE_OPTIONS} />
            <CheckboxGroup label="Type of Contamination" value={data.contamination_type} onChange={(v) => set({ contamination_type: v })} options={CONTAMINATION_OPTIONS} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Date of Last Hepatitis B Course / Anti HBS")}
              <input className="input" value={data.last_hep_b_course} onChange={(e) => set({ last_hep_b_course: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Date of Last Tetanus")}
              <input className="input" value={data.last_tetanus} onChange={(e) => set({ last_tetanus: e.target.value })} />
            </label>
          </div>

          <p className="mt-5 mb-2 text-xs font-bold text-slate-600">{t("Part B — To be filled up by the Employee Health Doctor / Infection Control Nurse")}</p>
          <p className="mb-2 text-xs font-semibold text-slate-500">{t("Risk Assessment / Treatment")}</p>
          <div className="grid grid-cols-2 gap-3">
            <RadioGroup label="First Aid" value={data.first_aid} onChange={(v) => set({ first_aid: v })} options={[["yes", "Yes"], ["advised", "Advised"], ["na", "N/A"]]} />
            <RadioGroup label="Incident Form" value={data.incident_form} onChange={(v) => set({ incident_form: v })} options={[["yes", "Yes"], ["advised", "Advised"], ["na", "N/A"]]} />
            <RadioGroup label="Risk Assessed" value={data.risk_assessed} onChange={(v) => set({ risk_assessed: v })} options={[["yes", "Yes"], ["no", "No"], ["na", "N/A"]]} />
            <RadioGroup label="Gloves Worn" value={data.gloves_worn} onChange={(v) => set({ gloves_worn: v })} options={[["yes", "Yes"], ["no", "No"], ["na", "N/A"]]} />
          </div>

          <p className="mt-4 mb-2 text-xs font-semibold text-slate-500">{t("Information Regarding Source Patient")}</p>
          <div className="grid grid-cols-2 gap-3">
            <RadioGroup label="Source Patient" value={data.source_known} onChange={(v) => set({ source_known: v })} options={[["known", "Known"], ["unknown", "Unknown"]]} />
            <RadioGroup label="Source Blood Requested" value={data.source_blood_requested} onChange={(v) => set({ source_blood_requested: v })} options={[["yes", "Yes"], ["no", "No"]]} />
            <RadioGroup label="Source of Blood Obtained" value={data.source_blood_obtained} onChange={(v) => set({ source_blood_obtained: v })} options={[["yes", "Yes"], ["no", "No"]]} />
            <RadioGroup label="Anti-HCV+" value={data.anti_hcv} onChange={(v) => set({ anti_hcv: v })} options={[["yes", "Yes"], ["no", "No"], ["na", "N/A"]]} />
            <RadioGroup label="HBsAg+" value={data.hbsag} onChange={(v) => set({ hbsag: v })} options={[["yes", "Yes"], ["no", "No"], ["na", "N/A"]]} />
            <RadioGroup label="Anti HIV+" value={data.anti_hiv} onChange={(v) => set({ anti_hiv: v })} options={[["yes", "Yes"], ["no", "No"], ["na", "N/A"]]} />
          </div>

          <p className="mt-4 mb-2 text-xs font-semibold text-slate-500">{t("Follow Up Strategy / Comments")}</p>
          <RadioGroup label="PEP Procedure Instigated" value={data.pep_procedure_instigated} onChange={(v) => set({ pep_procedure_instigated: v })} options={[["yes", "Yes"], ["no", "No"], ["na", "N/A"]]} />

          <p className="mt-4 mb-2 text-xs font-semibold text-slate-500">{t("HIV-Post Exposure Prophylaxis Implementation Details and Outcome")}</p>
          <RadioGroup
            label="Outcome"
            value={data.hiv_pep_outcome}
            onChange={(v) => set({ hiv_pep_outcome: v })}
            options={[["completed", "Completed"], ["not_completed", "Not Completed"], ["na", "N/A"]]}
          />

          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Name of the Doctor")}
              <input className="input" value={data.doctor_name} onChange={(e) => set({ doctor_name: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Designation")}
              <input className="input" value={data.doctor_designation} onChange={(e) => set({ doctor_designation: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Date")}
              <input type="date" className="input" value={data.doctor_sign_date} onChange={(e) => set({ doctor_sign_date: e.target.value })} />
            </label>
          </div>
          <label className="mt-2 flex flex-col gap-1 text-xs text-slate-500">
            {t("Comments")}
            <textarea className="input" rows={2} value={data.comments} onChange={(e) => set({ comments: e.target.value })} />
          </label>
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-bold text-slate-600">{t("Doctor Signature")}</p>
              <button type="button" onClick={() => clearCanvas(doctorCanvasRef, setDoctorHasSig)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500">
                <Eraser className="h-3.5 w-3.5" />
                {t("Clear")}
              </button>
            </div>
            <SignaturePad canvasRef={doctorCanvasRef} onDrawn={() => setDoctorHasSig(true)} />
          </div>

          <p className="mt-5 mb-2 text-xs font-bold text-slate-600">{t("Employee Health Physician")}</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Name")}
              <input className="input" value={data.physician_name} onChange={(e) => set({ physician_name: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              {t("Date")}
              <input type="date" className="input" value={data.physician_sign_date} onChange={(e) => set({ physician_sign_date: e.target.value })} />
            </label>
          </div>
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-bold text-slate-600">{t("Physician Signature")}</p>
              <button type="button" onClick={() => clearCanvas(physicianCanvasRef, setPhysicianHasSig)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500">
                <Eraser className="h-3.5 w-3.5" />
                {t("Clear")}
              </button>
            </div>
            <SignaturePad canvasRef={physicianCanvasRef} onDrawn={() => setPhysicianHasSig(true)} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-50">
            {t("Cancel")}
          </button>
          <button onClick={handleSave} disabled={saving} className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60">
            {saving ? t("Saving...") : t("Save & Print")}
          </button>
        </div>
      </div>

      {printing &&
        (() => {
          const printBody = (
            <>
              <div className="flex items-start justify-between gap-4 border-2 border-slate-800">
                <div className="flex flex-1 flex-col items-center justify-center gap-1 border-e-2 border-slate-800 p-3 text-center">
                  <img src={rabiaLogo} alt="Rabia Hospital" className="h-14 w-auto object-contain" />
                  <p className="text-sm font-bold text-slate-800">RABIA Hospital</p>
                </div>
                <div className="flex-[2] p-3 text-xs text-slate-700">
                  <p>
                    <span className="font-semibold">Employee Health No: </span>
                    {data.employee_health_no || "—"}
                  </p>
                  <p>
                    <span className="font-semibold">Name: </span>
                    {emp.name}
                  </p>
                  <p>
                    <span className="font-semibold">Age: </span>
                    {data.age || "—"} &nbsp; <span className="font-semibold">Sex: </span>
                    {data.sex || "—"}
                  </p>
                  <p>
                    <span className="font-semibold">Nationality: </span>
                    {data.nationality || "—"}
                  </p>
                  <p>
                    <span className="font-semibold">Designation: </span>
                    {data.designation || "—"}
                  </p>
                </div>
              </div>
              <p className="border-x-2 border-b-2 border-slate-800 bg-slate-100 py-1 text-center text-xs font-bold">Needle stick Injury/ Exposure Report</p>

              <div className="border-x-2 border-b-2 border-slate-800 p-3 text-xs text-slate-800">
                <p className="mb-1 font-bold">Part A. To be filled up by the staff</p>
                <p className="font-semibold">I. Incident:</p>
                <p>a. Date/Time of Incident: {fmtDate(data.incident_date) || "—"} {data.incident_time || ""}</p>
                <p>b. Date/Time of Reporting: {fmtDate(data.reporting_date) || "—"} {data.reporting_time || ""}</p>
                <p>c. Location: {data.location || "—"}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <p className="font-semibold">II. Procedure</p>
                    <p>a. Procedure at Time of Incident: {data.procedure_at_time || "—"}</p>
                    <p>b. Purpose Sharp was Used For: {data.purpose_sharp_used_for || "—"}</p>
                  </div>
                  <div>
                    <p className="font-semibold">III. Nature of Injury:</p>
                    <p>{naturePicked.length ? naturePicked.join(", ") : "—"}</p>
                  </div>
                </div>
                <p className="mt-2 font-semibold">IV. Type of Contamination:</p>
                <p>{contaminationPicked.length ? contaminationPicked.join(", ") : "—"}</p>
                <p className="mt-2">Date of Last Hepatitis B Course/ Anti HBS: {data.last_hep_b_course || "—"}</p>
                <p>Date of Last Tetanus: {data.last_tetanus || "—"}</p>
              </div>

              <div className="border-x-2 border-b-2 border-slate-800 p-3 text-xs text-slate-800">
                <p className="mb-1 font-bold">Part B. To be filled up by the Employee Health Doctor/Infection Control Nurse</p>
                <p className="font-semibold">Risk Assessment/Treatment</p>
                <div className="grid grid-cols-2 gap-1">
                  <p>First Aid: {radioLabel(data.first_aid)}</p>
                  <p>Risk Assessed: {radioLabel(data.risk_assessed)}</p>
                  <p>Incident Form: {radioLabel(data.incident_form)}</p>
                  <p>Gloves Worn: {radioLabel(data.gloves_worn)}</p>
                </div>
                <p className="mt-2 font-semibold">Information Regarding Source Patient</p>
                <p>Source Patient: {data.source_known ? (data.source_known === "known" ? "Known" : "Unknown") : "—"}</p>
                <div className="grid grid-cols-2 gap-1">
                  <p>Source Blood Requested: {radioLabel(data.source_blood_requested)}</p>
                  <p>Source of Blood Obtained: {radioLabel(data.source_blood_obtained)}</p>
                  <p>Anti-HCV+: {radioLabel(data.anti_hcv)}</p>
                  <p>HBsAg+: {radioLabel(data.hbsag)}</p>
                  <p>Anti HIV+: {radioLabel(data.anti_hiv)}</p>
                </div>
                <p className="mt-2 font-semibold">Follow Up Strategy/Comments</p>
                <p>PEP Procedure Instigated: {radioLabel(data.pep_procedure_instigated)}</p>
                <p className="mt-2 font-semibold">HIV- Post Exposure Prophylaxis Implementation Details and Outcome</p>
                <p>
                  {data.hiv_pep_outcome === "completed" ? "Completed" : data.hiv_pep_outcome === "not_completed" ? "Not Completed" : data.hiv_pep_outcome === "na" ? "N/A" : "—"}
                </p>
                {data.comments && <p className="mt-1">Comments: {data.comments}</p>}

                <div className="mt-3 grid grid-cols-2 gap-4 border-t border-slate-400 pt-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-600">Doctor: {data.doctor_name || "—"} ({data.doctor_designation || "—"})</p>
                    {savedSigPaths.doctor && <img src={fileUrl(savedSigPaths.doctor)} alt="" className="h-12" />}
                    <p className="text-xs text-slate-600">Date: {fmtDate(data.doctor_sign_date) || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600">Employee Health Physician: {data.physician_name || "—"}</p>
                    {savedSigPaths.physician && <img src={fileUrl(savedSigPaths.physician)} alt="" className="h-12" />}
                    <p className="text-xs text-slate-600">Date: {fmtDate(data.physician_sign_date) || "—"}</p>
                  </div>
                </div>
              </div>
            </>
          );
          return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4 print:hidden" onClick={() => setPrinting(false)}>
              <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-slate-800">{t("NSI Form 293")}</h3>
                  <button onClick={() => setPrinting(false)} className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-50">
                    ✕
                  </button>
                </div>
                <div className="mt-3 flex flex-col">{printBody}</div>
                <button
                  onClick={() => window.print()}
                  className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 print:hidden"
                >
                  <Printer className="h-4 w-4" />
                  {t("Print")}
                </button>
                <PrintPortal>
                  <div className="flex flex-col p-10">{printBody}</div>
                </PrintPortal>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
