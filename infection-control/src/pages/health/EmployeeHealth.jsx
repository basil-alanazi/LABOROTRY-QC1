import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileText, Paperclip, Pencil, Plus, Printer, QrCode, Save, Trash2, Upload, UserPlus } from "lucide-react";
import QRCode from "qrcode";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
import { useLanguage } from "../../lib/i18n.jsx";
import { downloadExcel } from "../../lib/exportExcel";
import { downloadPdf } from "../../lib/exportPdf";
import { fetchAllRows } from "../../lib/fetchAll";

const TABS = [
  { key: "compliance", label: "Overdue & Missing" },
  { key: "clinic", label: "Employee Clinic" },
  { key: "doctor-review", label: "Doctor Review" },
  { key: "records", label: "All Records" },
  { key: "employees", label: "Employees" },
];

const EMP_HEALTH_ATTACHMENTS_BUCKET = "employee-health-attachments";

function attachmentUrl(path) {
  if (!path) return null;
  return supabase.storage.from(EMP_HEALTH_ATTACHMENTS_BUCKET).getPublicUrl(path).data.publicUrl;
}

const INVESTIGATION_STATUSES = [
  { value: "review_due", label: "Doctor review due" },
  { value: "sample_not_given", label: "Sample not given" },
  { value: "review_done", label: "Review done" },
];

const INVESTIGATION_TESTS =
  "Investigations covered: Rubella IgG, Varicella Zoster IgG, Measles IgG, Mumps IgG, HBs Ab, HCV Ab, HBs Ag, HIV 1&2 Abs + P24 combo";

function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

const todayStr = () => new Date().toISOString().slice(0, 10);

const emptyEmployeeForm = {
  employee_no: "",
  name: "",
  department: "",
  job_title: "",
  file_no: "",
  iqama_no: "",
  date_of_birth: "",
  phone: "",
  is_kitchen_staff: false,
};

const emptyStatus = {
  investigation_status: "review_due",
  ppd_status: "",
  ppd_result: "",
  ppd_test_date: "",
  ppd_2nd_test_date: "",
  ppd_next_due_date: "",
  stool_urine_status: "",
  stool_urine_test_date: "",
  stool_urine_next_due_date: "",
  icn_remarks: "",
  investigation_attachments: [],
};

export default function EmployeeHealth() {
  const { session, config, isAdmin } = useAuth();
  const { t } = useLanguage();
  // Doctor accounts (staff granted "Employee Health access only") can view
  // everything here but never edit — editing stays exclusive to IC/Owner.
  const canEdit = isAdmin;
  const [searchParams] = useSearchParams();
  // A doctor who signs in from the public QR employee profile page's
  // "Doctor Login" button is sent here as /employee-health?tab=doctor-review
  // so they land straight on their review queues instead of the default tab.
  const [tab, setTab] = useState(() => (TABS.some((td) => td.key === searchParams.get("tab")) ? searchParams.get("tab") : "compliance"));
  const [clinicGroup, setClinicGroup] = useState("regular"); // regular | kitchen
  const [clinicDeptFilter, setClinicDeptFilter] = useState("");
  const [clinicSearch, setClinicSearch] = useState("");
  const [clinicPpdFilter, setClinicPpdFilter] = useState("");
  const [pendingOnlyExport, setPendingOnlyExport] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [itemTypes, setItemTypes] = useState([]);
  const [records, setRecords] = useState([]);
  const [requests, setRequests] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [nsiCases, setNsiCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [employeeForm, setEmployeeForm] = useState(emptyEmployeeForm);
  const [message, setMessage] = useState(null);
  const [filterDept, setFilterDept] = useState("");
  const [statusPopupEmployee, setStatusPopupEmployee] = useState(null);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [statusDrafts, setStatusDrafts] = useState({}); // employee_id -> status fields
  const [doseDrafts, setDoseDrafts] = useState({}); // "empId|itemId|doseNum" -> { date, batch }
  const [nsiForm, setNsiForm] = useState({ employee_id: "", incident_date: todayStr(), notes: "" });
  const [qrEmployee, setQrEmployee] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState("");

  const departments = config?.employee_departments ?? [];

  async function loadAll() {
    setLoading(true);
    const [{ data: emp }, { data: types }, { data: recs }, { data: reqs }, { data: stat }, { data: nsi }] = await Promise.all([
      fetchAllRows((from, to) => supabase.from("employees").select("*").order("name").range(from, to)),
      supabase.from("health_item_types").select("*").order("sort_order"),
      fetchAllRows((from, to) => supabase.from("employee_health_records").select("*").order("date_given", { ascending: false }).range(from, to)),
      fetchAllRows((from, to) => supabase.from("employee_vaccine_requests").select("*").range(from, to)),
      fetchAllRows((from, to) => supabase.from("employee_clinic_status").select("*").range(from, to)),
      fetchAllRows((from, to) => supabase.from("employee_nsi_followups").select("*").eq("deleted", false).order("incident_date", { ascending: false }).range(from, to)),
    ]);
    setEmployees(emp ?? []);
    setItemTypes((types ?? []).map((t) => ({ ...t, dose_schedule: t.dose_schedule?.length ? t.dose_schedule : [0] })));
    setRecords(recs ?? []);
    setRequests(reqs ?? []);
    setStatuses(stat ?? []);
    setNsiCases(nsi ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    const map = {};
    for (const s of statuses) map[s.employee_id] = { ...s };
    setStatusDrafts(map);
  }, [statuses]);

  useEffect(() => {
    const map = {};
    for (const r of records) map[`${r.employee_id}|${r.item_type_id}|${r.dose_number}`] = { date: r.date_given, batch: r.batch_no };
    setDoseDrafts(map);
  }, [records]);

  function flash(msg) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }

  const activeEmployees = useMemo(() => employees.filter((e) => e.active), [employees]);
  const activeItemTypes = useMemo(() => itemTypes.filter((t) => t.active), [itemTypes]);
  const regularEmployees = useMemo(() => activeEmployees.filter((e) => !e.is_kitchen_staff), [activeEmployees]);
  const kitchenEmployees = useMemo(() => activeEmployees.filter((e) => e.is_kitchen_staff), [activeEmployees]);
  const clinicDepartments = useMemo(
    () => Array.from(new Set((clinicGroup === "kitchen" ? kitchenEmployees : regularEmployees).map((e) => e.department))).sort(),
    [clinicGroup, regularEmployees, kitchenEmployees]
  );
  function ppdStateFor(emp) {
    const st = statuses.find((x) => x.employee_id === emp.id);
    if (!st?.ppd_status) return "pending";
    if (st.ppd_status === "done" && st.ppd_next_due_date && st.ppd_next_due_date < todayStr()) return "overdue";
    return "done";
  }
  function applyClinicFilters(list) {
    const q = clinicSearch.trim().toLowerCase();
    return list.filter((e) => {
      if (clinicDeptFilter && e.department !== clinicDeptFilter) return false;
      if (clinicPpdFilter && ppdStateFor(e) !== clinicPpdFilter) return false;
      if (q && !(e.file_no || "").toLowerCase().includes(q) && !(e.name || "").toLowerCase().includes(q) && !(e.employee_no || "").toLowerCase().includes(q))
        return false;
      return true;
    });
  }
  const visibleRegularEmployees = useMemo(
    () => applyClinicFilters(regularEmployees),
    [regularEmployees, clinicDeptFilter, clinicSearch, clinicPpdFilter, statuses]
  );
  const visibleKitchenEmployees = useMemo(
    () => applyClinicFilters(kitchenEmployees),
    [kitchenEmployees, clinicDeptFilter, clinicSearch, clinicPpdFilter, statuses]
  );
  const regularVaccines = useMemo(() => activeItemTypes.filter((t) => !t.kitchen_only), [activeItemTypes]);
  const kitchenVaccines = activeItemTypes; // kitchen staff get every normal vaccine plus the kitchen-only ones

  function doseState(empId, item) {
    const recs = records
      .filter((r) => r.employee_id === empId && r.item_type_id === item.id)
      .sort((a, b) => a.dose_number - b.dose_number);
    const schedule = item.dose_schedule?.length ? item.dose_schedule : [0];
    const dose1 = recs.find((r) => r.dose_number === 1);
    const highestGiven = recs.length ? Math.max(...recs.map((r) => r.dose_number)) : 0;
    const complete = highestGiven >= schedule.length;
    let nextDueDate = null;
    let renewalDue = false;
    if (!complete) {
      const nextDoseNumber = highestGiven + 1;
      if (nextDoseNumber > 1 && dose1) nextDueDate = addMonths(dose1.date_given, schedule[nextDoseNumber - 1]);
    } else if (item.recurrence_months) {
      const last = recs[recs.length - 1];
      const dueDate = last.next_due_date || addMonths(last.date_given, item.recurrence_months);
      if (dueDate <= todayStr()) {
        renewalDue = true;
        nextDueDate = dueDate;
      }
    }
    return { recs, complete, nextDueDate, renewalDue, nextDoseNumber: complete && !renewalDue ? null : (highestGiven || 0) + 1 };
  }

  // Quick per-employee status: red = something overdue or never started,
  // yellow = pending but not yet due, green = fully up to date.
  function employeeStatus(emp) {
    const today = todayStr();
    const st = statuses.find((x) => x.employee_id === emp.id);
    const issues = [];

    if (!st || st.investigation_status !== "review_done") {
      issues.push({ label: "Investigation", severity: "yellow", detail: INVESTIGATION_STATUSES.find((o) => o.value === st?.investigation_status)?.label || "Doctor review due" });
    }
    if (!st?.ppd_status) {
      issues.push({ label: "PPD", severity: "red", detail: "Not done" });
    } else if (st.ppd_status === "done" && st.ppd_next_due_date && st.ppd_next_due_date < today) {
      issues.push({ label: "PPD", severity: "red", detail: `Overdue since ${st.ppd_next_due_date}` });
    }
    if (emp.is_kitchen_staff) {
      if (!st?.stool_urine_status) {
        issues.push({ label: "Stool & Urine Test", severity: "red", detail: "Not done" });
      } else if (st.stool_urine_status !== "not_applicable" && st.stool_urine_next_due_date && st.stool_urine_next_due_date < today) {
        issues.push({ label: "Stool & Urine Test", severity: "red", detail: `Overdue since ${st.stool_urine_next_due_date}` });
      }
    }
    const empRequests = requests.filter((r) => r.employee_id === emp.id);
    const visibleVaccines = activeItemTypes.filter((t) => !t.kitchen_only || emp.is_kitchen_staff);
    for (const item of visibleVaccines) {
      if (!empRequests.some((r) => r.item_type_id === item.id)) continue;
      const state = doseState(emp.id, item);
      if (state.complete && !state.renewalDue) continue;
      if (!state.nextDueDate) {
        issues.push({ label: item.name, severity: "red", detail: `Dose ${state.nextDoseNumber} not given` });
      } else if (state.nextDueDate < today) {
        issues.push({ label: item.name, severity: "red", detail: `Dose ${state.nextDoseNumber} overdue (was due ${state.nextDueDate})` });
      } else {
        issues.push({ label: item.name, severity: "yellow", detail: `Dose ${state.nextDoseNumber} due ${state.nextDueDate}` });
      }
    }

    const severity = issues.some((i) => i.severity === "red") ? "red" : issues.length ? "yellow" : "green";
    return { severity, issues };
  }

  const complianceRows = useMemo(() => {
    const today = todayStr();
    const rows = [];
    for (const emp of activeEmployees) {
      if (filterDept && emp.department !== filterDept) continue;
      const empRequests = new Set(requests.filter((r) => r.employee_id === emp.id).map((r) => r.item_type_id));
      for (const item of activeItemTypes) {
        if (item.kitchen_only && !emp.is_kitchen_staff) continue;
        if (!empRequests.has(item.id)) continue;
        const state = doseState(emp.id, item);
        if (state.complete && !state.renewalDue) continue;
        const dueDate = state.nextDueDate;
        const status = dueDate && dueDate < today ? "overdue" : dueDate ? "upcoming" : "missing";
        if (status === "upcoming") continue;
        rows.push({ employee: emp, label: `${item.name} — Dose ${state.nextDoseNumber}${state.renewalDue ? " (renewal)" : ""}`, dueDate, status });
      }
      const s = statuses.find((x) => x.employee_id === emp.id);
      if (!s?.ppd_status) rows.push({ employee: emp, label: "PPD", dueDate: null, status: "missing" });
      else if (s.ppd_next_due_date && s.ppd_next_due_date < today) rows.push({ employee: emp, label: "PPD", dueDate: s.ppd_next_due_date, status: "overdue" });
      if (emp.is_kitchen_staff) {
        if (!s?.stool_urine_status) rows.push({ employee: emp, label: "Stool & Urine Test", dueDate: null, status: "missing" });
        else if (s.stool_urine_status !== "not_applicable" && s.stool_urine_next_due_date && s.stool_urine_next_due_date < today)
          rows.push({ employee: emp, label: "Stool & Urine Test", dueDate: s.stool_urine_next_due_date, status: "overdue" });
      }
    }
    return rows.sort((a, b) => (a.status === b.status ? a.employee.name.localeCompare(b.employee.name) : a.status === "overdue" ? -1 : 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEmployees, activeItemTypes, records, requests, statuses, filterDept]);

  async function handleAddEmployee(e) {
    e.preventDefault();
    const name = employeeForm.name.trim();
    if (!name || !employeeForm.department) {
      flash({ type: "error", text: "Name and department are required" });
      return;
    }
    const { error } = await supabase.from("employees").insert({
      employee_no: employeeForm.employee_no.trim(),
      name,
      department: employeeForm.department,
      job_title: employeeForm.job_title.trim(),
      file_no: employeeForm.file_no.trim(),
      iqama_no: employeeForm.iqama_no.trim(),
      date_of_birth: employeeForm.date_of_birth || null,
      phone: employeeForm.phone.trim(),
      is_kitchen_staff: employeeForm.is_kitchen_staff,
    });
    if (error) {
      flash({ type: "error", text: "Could not add employee" });
    } else {
      setEmployeeForm(emptyEmployeeForm);
      loadAll();
      flash({ type: "success", text: "Employee added" });
    }
  }

  function updateEmployeeField(id, patch) {
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  async function saveEmployee(emp) {
    await supabase
      .from("employees")
      .update({
        employee_no: emp.employee_no,
        name: emp.name,
        department: emp.department,
        job_title: emp.job_title,
        file_no: emp.file_no,
        iqama_no: emp.iqama_no,
        date_of_birth: emp.date_of_birth || null,
        phone: emp.phone,
        is_kitchen_staff: emp.is_kitchen_staff,
        active: emp.active,
      })
      .eq("id", emp.id);
    flash({ type: "success", text: `${emp.name} saved` });
  }

  async function handleEditSave(e) {
    e.preventDefault();
    if (!editingEmployee) return;
    updateEmployeeField(editingEmployee.id, editingEmployee);
    await saveEmployee(editingEmployee);
    setEditingEmployee(null);
  }

  async function removeEmployee(emp) {
    if (!confirm(`Delete "${emp.name}" and their health records?`)) return;
    await supabase.from("employees").delete().eq("id", emp.id);
    loadAll();
  }

  // --- Clinic status (investigation / PPD / stool-urine / remarks) ---
  function statusFor(empId) {
    return statusDrafts[empId] || { ...emptyStatus };
  }
  function setStatusField(empId, patch) {
    setStatusDrafts((prev) => ({ ...prev, [empId]: { ...statusFor(empId), ...patch } }));
  }
  // patch is merged onto the current draft synchronously (not via setState,
  // which wouldn't be visible yet to a save call fired in the same handler)
  // so a select's onChange can update + persist a field in one step.
  async function saveStatus(emp, patch) {
    const merged = { ...statusFor(emp.id), ...patch };
    setStatusDrafts((prev) => ({ ...prev, [emp.id]: merged }));
    await supabase.from("employee_clinic_status").upsert(
      {
        employee_id: emp.id,
        investigation_status: merged.investigation_status || "review_due",
        ppd_status: merged.ppd_status || null,
        ppd_result: merged.ppd_result || "",
        ppd_test_date: merged.ppd_test_date || null,
        ppd_2nd_test_date: merged.ppd_2nd_test_date || null,
        ppd_next_due_date: merged.ppd_next_due_date || null,
        stool_urine_status: merged.stool_urine_status || null,
        stool_urine_test_date: merged.stool_urine_test_date || null,
        stool_urine_next_due_date: merged.stool_urine_next_due_date || null,
        icn_remarks: merged.icn_remarks || "",
        investigation_attachments: merged.investigation_attachments || [],
        updated_by: session?.username,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "employee_id" }
    );
    loadAll();
  }
  function saveStatusRow(emp) {
    return saveStatus(emp, {});
  }

  async function toggleVaccineRequest(emp, item, checked) {
    if (checked) await supabase.from("employee_vaccine_requests").insert({ employee_id: emp.id, item_type_id: item.id, requested_by: session?.username });
    else await supabase.from("employee_vaccine_requests").delete().eq("employee_id", emp.id).eq("item_type_id", item.id);
    loadAll();
  }

  // --- Per-dose grid cells ---
  function doseKey(empId, itemId, doseNum) {
    return `${empId}|${itemId}|${doseNum}`;
  }
  function getDoseField(empId, itemId, doseNum, field) {
    return doseDrafts[doseKey(empId, itemId, doseNum)]?.[field] || "";
  }
  function setDoseField(empId, itemId, doseNum, field, value) {
    const key = doseKey(empId, itemId, doseNum);
    setDoseDrafts((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }
  async function saveDoseCell(emp, item, doseNum) {
    const dateVal = getDoseField(emp.id, item.id, doseNum, "date");
    const batchVal = getDoseField(emp.id, item.id, doseNum, "batch");
    const existing = records.find((r) => r.employee_id === emp.id && r.item_type_id === item.id && r.dose_number === doseNum);
    if (!dateVal) {
      if (existing) await supabase.from("employee_health_records").delete().eq("id", existing.id);
      else return;
      loadAll();
      return;
    }
    const schedule = item.dose_schedule?.length ? item.dose_schedule : [0];
    const dose1Date = doseNum === 1 ? dateVal : getDoseField(emp.id, item.id, 1, "date");
    let next_due_date = null;
    if (doseNum < schedule.length) next_due_date = dose1Date ? addMonths(dose1Date, schedule[doseNum]) : null;
    else if (item.recurrence_months) next_due_date = addMonths(dateVal, item.recurrence_months);
    const { error } = await supabase.from("employee_health_records").upsert(
      {
        employee_id: emp.id,
        item_type_id: item.id,
        item_name: item.name,
        dose_number: doseNum,
        batch_no: batchVal,
        date_given: dateVal,
        next_due_date,
        recorded_by: session?.username,
      },
      { onConflict: "employee_id,item_type_id,dose_number" }
    );
    if (error) flash({ type: "error", text: "Could not save dose: " + error.message });
    loadAll();
  }

  // --- Doctor Review: investigation blood-test attachments ---
  async function uploadInvestigationFile(emp, file) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${emp.id}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from(EMP_HEALTH_ATTACHMENTS_BUCKET).upload(path, file);
    if (error) throw error;
    return { path, name: file.name };
  }
  async function addInvestigationAttachments(emp, files) {
    try {
      const uploaded = await Promise.all(Array.from(files).map((f) => uploadInvestigationFile(emp, f)));
      const current = statusFor(emp.id).investigation_attachments || [];
      await saveStatus(emp, { investigation_attachments: [...current, ...uploaded] });
    } catch (err) {
      flash({ type: "error", text: "Could not upload: " + err.message });
    }
  }
  function removeInvestigationAttachment(emp, index) {
    const current = statusFor(emp.id).investigation_attachments || [];
    saveStatus(emp, { investigation_attachments: current.filter((_, i) => i !== index) });
  }
  function neededVaccines(emp) {
    const empRequests = requests.filter((r) => r.employee_id === emp.id);
    const visible = activeItemTypes.filter((ty) => !ty.kitchen_only || emp.is_kitchen_staff);
    const out = [];
    for (const item of visible) {
      if (!empRequests.some((r) => r.item_type_id === item.id)) continue;
      const state = doseState(emp.id, item);
      if (state.complete && !state.renewalDue) continue;
      out.push(state.nextDueDate ? `${item.name} — Dose ${state.nextDoseNumber} (${state.nextDueDate})` : `${item.name} — Dose ${state.nextDoseNumber}`);
    }
    return out;
  }

  // --- Doctor Review: needle-stick injury (NSI) follow-ups ---
  async function addNsiCase(e) {
    e.preventDefault();
    if (!nsiForm.employee_id) {
      flash({ type: "error", text: "Select an employee" });
      return;
    }
    const { error } = await supabase.from("employee_nsi_followups").insert({
      employee_id: nsiForm.employee_id,
      incident_date: nsiForm.incident_date || null,
      notes: nsiForm.notes.trim(),
      done_by: session?.username,
    });
    if (error) {
      flash({ type: "error", text: "Could not add case" });
      return;
    }
    setNsiForm({ employee_id: "", incident_date: todayStr(), notes: "" });
    loadAll();
    flash({ type: "success", text: "NSI case added" });
  }
  function updateNsiField(id, patch) {
    setNsiCases((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  async function saveNsiCase(c, patch) {
    const merged = { ...c, ...patch };
    updateNsiField(c.id, patch);
    await supabase
      .from("employee_nsi_followups")
      .update({
        doctor_reviewed: merged.doctor_reviewed,
        report_1_date: merged.report_1_date || null,
        report_2_date: merged.report_2_date || null,
        report_3_date: merged.report_3_date || null,
        notes: merged.notes || "",
      })
      .eq("id", c.id);
  }
  async function uploadNsiFile(c, file) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `nsi/${c.id}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from(EMP_HEALTH_ATTACHMENTS_BUCKET).upload(path, file);
    if (error) throw error;
    return { path, name: file.name };
  }
  async function addNsiAttachments(c, files) {
    try {
      const uploaded = await Promise.all(Array.from(files).map((f) => uploadNsiFile(c, f)));
      const next = [...(c.form_attachments ?? []), ...uploaded];
      updateNsiField(c.id, { form_attachments: next });
      await supabase.from("employee_nsi_followups").update({ form_attachments: next }).eq("id", c.id);
    } catch (err) {
      flash({ type: "error", text: "Could not upload: " + err.message });
    }
  }
  async function removeNsiAttachment(c, index) {
    const next = (c.form_attachments ?? []).filter((_, i) => i !== index);
    updateNsiField(c.id, { form_attachments: next });
    await supabase.from("employee_nsi_followups").update({ form_attachments: next }).eq("id", c.id);
  }
  async function removeNsiCase(c) {
    const emp = employees.find((e) => e.id === c.employee_id);
    if (!confirm(`Delete this NSI case for ${emp?.name || ""}?`)) return;
    await supabase.from("employee_nsi_followups").update({ deleted: true, deleted_by: session?.username, deleted_at: new Date().toISOString() }).eq("id", c.id);
    loadAll();
  }

  // --- QR employee profile badge ---
  function openQr(emp) {
    setQrEmployee(emp);
    const url = `${window.location.origin}/employee-profile/${emp.id}`;
    QRCode.toDataURL(url, { width: 320, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }
  function closeQr() {
    setQrEmployee(null);
    setQrDataUrl("");
  }

  const pendingReviewEmployees = useMemo(
    () => activeEmployees.filter((e) => statusFor(e.id).investigation_status !== "review_done").sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeEmployees, statusDrafts]
  );
  const pendingPpdEmployees = useMemo(
    () => activeEmployees.filter((e) => !statusFor(e.id).ppd_status).sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeEmployees, statusDrafts]
  );

  // --- Grid <-> export shared column/row builders ---
  function vaccineSlots(vaccines) {
    return vaccines.map((item) => ({ item, doses: Array.from({ length: item.dose_schedule?.length || 1 }, (_, i) => i + 1) }));
  }
  const CLINIC_BASE_HEADERS = ["#", "Name", "Emp ID", "File No", "Iqama No", "DOB", "Phone", "Department", "Designation"];
  const CLINIC_INVEST_HEADERS = ["Investigation Status", "PPD Status", "PPD Result", "1st PPD", "2nd PPD", "PPD Next Due"];
  const CLINIC_STOOL_HEADERS = ["Stool/Urine Status", "Stool/Urine Test Date", "Stool/Urine Next Due"];

  function buildGridHeaders(vaccines, kitchenMode) {
    const vaccineHeaders = [];
    for (const { item, doses } of vaccineSlots(vaccines)) {
      vaccineHeaders.push(`${item.name} — Requested`);
      for (const d of doses) {
        vaccineHeaders.push(`${item.name} — Dose ${d} Date`);
        vaccineHeaders.push(`${item.name} — Dose ${d} Batch`);
      }
    }
    return [...CLINIC_BASE_HEADERS, ...CLINIC_INVEST_HEADERS, ...(kitchenMode ? CLINIC_STOOL_HEADERS : []), "ICN Remarks", ...vaccineHeaders];
  }
  function buildGridRow(emp, idx, vaccines, kitchenMode) {
    const s = statuses.find((x) => x.employee_id === emp.id);
    const base = [idx, emp.name, emp.employee_no, emp.file_no, emp.iqama_no, emp.date_of_birth || "", emp.phone, emp.department, emp.job_title];
    const invest = [
      INVESTIGATION_STATUSES.find((o) => o.value === s?.investigation_status)?.label || "",
      s?.ppd_status || "",
      s?.ppd_result || "",
      s?.ppd_test_date || "",
      s?.ppd_2nd_test_date || "",
      s?.ppd_next_due_date || "",
    ];
    const stool = kitchenMode ? [s?.stool_urine_status || "", s?.stool_urine_test_date || "", s?.stool_urine_next_due_date || ""] : [];
    const vals = [];
    for (const { item, doses } of vaccineSlots(vaccines)) {
      vals.push(requests.some((r) => r.employee_id === emp.id && r.item_type_id === item.id) ? "Yes" : "");
      for (const d of doses) {
        const rec = records.find((r) => r.employee_id === emp.id && r.item_type_id === item.id && r.dose_number === d);
        vals.push(rec?.date_given || "");
        vals.push(rec?.batch_no || "");
      }
    }
    return [...base, ...invest, ...stool, s?.icn_remarks || "", ...vals];
  }

  // PDF pages can't fit dozens of columns on one landscape sheet the way
  // Excel/the on-screen grid can — cramming them in makes autoTable shrink
  // columns until words break letter by letter. So the PDF export splits
  // the same data into several normal-width tables instead: one core table
  // (identity + investigations + PPD + stool/urine + remarks) plus one
  // small table per vaccine (# + Name + Requested + its dose columns).
  function buildCoreHeaders(kitchenMode) {
    // Shortened versions of CLINIC_INVEST_HEADERS/CLINIC_STOOL_HEADERS so a
    // single long word (e.g. "Investigation") never has to be force-split
    // mid-word just to fit a narrow PDF column.
    const investHeadersPdf = ["Invest.", "PPD Status", "PPD Result", "1st PPD", "2nd PPD", "PPD Next Due"];
    const stoolHeadersPdf = ["Stool Urine Status", "Stool Urine Test", "Stool Urine Due"];
    return [...CLINIC_BASE_HEADERS, ...investHeadersPdf, ...(kitchenMode ? stoolHeadersPdf : []), "Remarks"];
  }
  function buildCoreRow(emp, idx, kitchenMode) {
    const s = statuses.find((x) => x.employee_id === emp.id);
    const base = [idx, emp.name, emp.employee_no, emp.file_no, emp.iqama_no, emp.date_of_birth || "", emp.phone, emp.department, emp.job_title];
    const invest = [
      INVESTIGATION_STATUSES.find((o) => o.value === s?.investigation_status)?.label || "",
      s?.ppd_status || "",
      s?.ppd_result || "",
      s?.ppd_test_date || "",
      s?.ppd_2nd_test_date || "",
      s?.ppd_next_due_date || "",
    ];
    const stool = kitchenMode ? [s?.stool_urine_status || "", s?.stool_urine_test_date || "", s?.stool_urine_next_due_date || ""] : [];
    return [...base, ...invest, ...stool, s?.icn_remarks || ""];
  }
  function buildVaccineHeaders(item) {
    const headers = ["#", "Name", "Requested"];
    for (const d of vaccineSlots([item])[0].doses) headers.push(`Dose ${d} Date`, `Dose ${d} Batch`);
    return headers;
  }
  function buildVaccineRow(emp, idx, item) {
    const row = [idx, emp.name, requests.some((r) => r.employee_id === emp.id && r.item_type_id === item.id) ? "Yes" : ""];
    for (const d of vaccineSlots([item])[0].doses) {
      const rec = records.find((r) => r.employee_id === emp.id && r.item_type_id === item.id && r.dose_number === d);
      row.push(rec?.date_given || "", rec?.batch_no || "");
    }
    return row;
  }
  function pdfTablesForGroup(groupLabel, groupEmployees, vaccines, kitchenMode) {
    const tables = [{ title: groupLabel, headers: buildCoreHeaders(kitchenMode), rows: groupEmployees.map((e, i) => buildCoreRow(e, i + 1, kitchenMode)) }];
    for (const item of vaccines) {
      tables.push({ title: `${groupLabel} — ${item.name}`, headers: buildVaccineHeaders(item), rows: groupEmployees.map((e, i) => buildVaccineRow(e, i + 1, item)) });
    }
    return tables;
  }

  const REPORT_HEADERS = ["Date", "Employee", "Employee No", "Department", "Vaccine", "Dose #", "Batch No", "Next Due", "Recorded By"];
  function toReportRow(r) {
    const emp = employees.find((e) => e.id === r.employee_id);
    return [r.date_given, emp?.name || "", emp?.employee_no || "", emp?.department || "", r.item_name, r.dose_number, r.batch_no, r.next_due_date || "", r.recorded_by];
  }

  // Exports mirror whatever the on-screen grid is currently showing
  // (department + search filters), optionally narrowed further to only
  // employees with an open issue (PPD/investigation/stool-urine/vaccine
  // pending or overdue) when "Pending only" is checked.
  function exportSet(list) {
    return pendingOnlyExport ? list.filter((e) => employeeStatus(e).severity !== "green") : list;
  }

  function exportExcel() {
    const regExport = exportSet(visibleRegularEmployees);
    const kitExport = exportSet(visibleKitchenEmployees);
    const exportedIds = new Set([...regExport, ...kitExport].map((e) => e.id));
    downloadExcel(`infection-control-employee-clinic-${todayStr()}`, [
      { name: "Regular Staff", headers: buildGridHeaders(regularVaccines, false), rows: regExport.map((e, i) => buildGridRow(e, i + 1, regularVaccines, false)) },
      { name: "Kitchen Staff", headers: buildGridHeaders(kitchenVaccines, true), rows: kitExport.map((e, i) => buildGridRow(e, i + 1, kitchenVaccines, true)) },
      { name: "Vaccination Log", headers: REPORT_HEADERS, rows: records.filter((r) => exportedIds.has(r.employee_id)).map(toReportRow) },
    ]);
  }

  function exportPdf() {
    const regExport = exportSet(visibleRegularEmployees);
    const kitExport = exportSet(visibleKitchenEmployees);
    const exportedIds = new Set([...regExport, ...kitExport].map((e) => e.id));
    downloadPdf(`infection-control-employee-clinic-${todayStr()}`, "Infection Control — Employee Clinic", [
      ...pdfTablesForGroup("Regular Staff", regExport, regularVaccines, false),
      ...pdfTablesForGroup("Kitchen Staff", kitExport, kitchenVaccines, true),
      { title: "Vaccination Log", headers: REPORT_HEADERS, rows: records.filter((r) => exportedIds.has(r.employee_id)).map(toReportRow) },
    ]);
  }

  function renderClinicGrid(groupEmployees, vaccines, kitchenMode) {
    const slots = vaccineSlots(vaccines);
    return (
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-max text-xs">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th rowSpan={2} className="sticky left-0 z-20 w-10 border-b border-r border-slate-200 bg-slate-50 px-2 py-1.5 align-bottom font-medium whitespace-nowrap"></th>
              {CLINIC_BASE_HEADERS.map((h) => (
                <th
                  key={h}
                  rowSpan={2}
                  className={`border-b border-r border-slate-200 px-2 py-1.5 align-bottom font-medium whitespace-nowrap ${
                    h === "#" ? "sticky left-10 z-20 w-10 bg-slate-50" : h === "Name" ? "sticky left-20 z-20 bg-slate-50" : ""
                  }`}
                >
                  {t(h)}
                </th>
              ))}
              {CLINIC_INVEST_HEADERS.map((h) => (
                <th key={h} rowSpan={2} className="border-b border-r border-slate-200 px-2 py-1.5 align-bottom font-medium whitespace-nowrap">
                  {t(h)}
                </th>
              ))}
              {kitchenMode &&
                CLINIC_STOOL_HEADERS.map((h) => (
                  <th key={h} rowSpan={2} className="border-b border-r border-amber-200 bg-amber-50/60 px-2 py-1.5 align-bottom font-medium whitespace-nowrap">
                    {t(h)}
                  </th>
                ))}
              <th rowSpan={2} className="border-b border-r border-slate-200 px-2 py-1.5 align-bottom font-medium whitespace-nowrap">
                {t("ICN Remarks")}
              </th>
              {slots.map(({ item, doses }) => (
                <th key={item.id} colSpan={1 + doses.length * 2} className="border-b border-r border-slate-200 px-2 py-1.5 text-center font-semibold whitespace-nowrap">
                  {item.name}
                </th>
              ))}
            </tr>
            <tr>
              {slots.map(({ item, doses }) => (
                <Fragment key={item.id}>
                  <th className="border-b border-r border-slate-200 px-2 py-1 font-normal whitespace-nowrap">Req?</th>
                  {doses.map((d) => (
                    <Fragment key={d}>
                      <th className="border-b border-r border-slate-200 px-2 py-1 font-normal whitespace-nowrap">D{d} Date</th>
                      <th className="border-b border-r border-slate-200 px-2 py-1 font-normal whitespace-nowrap">D{d} Batch</th>
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupEmployees.map((emp, idx) => {
              const s = statusFor(emp.id);
              return (
                <tr key={emp.id} className="border-t border-slate-100 align-top">
                  <td className="sticky left-0 z-10 w-10 border-r border-slate-100 bg-white px-1 py-1 text-center">
                    {canEdit && (
                      <button onClick={() => removeEmployee(emp)} title={t("Remove employee")} className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                  <td className="sticky left-10 z-10 w-10 border-r border-slate-100 bg-white px-2 py-1">{idx + 1}</td>
                  <td className="sticky left-20 z-10 border-r border-slate-100 bg-white px-2 py-1">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        title={t("View status summary")}
                        onClick={() => setStatusPopupEmployee(emp)}
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                          employeeStatus(emp).severity === "red" ? "bg-red-500" : employeeStatus(emp).severity === "yellow" ? "bg-amber-400" : "bg-emerald-500"
                        }`}
                      />
                      <input className="input-cell" value={emp.name} disabled={!canEdit} onChange={(e) => updateEmployeeField(emp.id, { name: e.target.value })} onBlur={() => saveEmployee(emp)} />
                      <button
                        type="button"
                        title={t("Employee QR profile")}
                        onClick={() => openQr(emp)}
                        className="shrink-0 rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-teal-600"
                      >
                        <QrCode className="h-3.5 w-3.5" />
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          title={t("Edit employee")}
                          onClick={() => setEditingEmployee({ ...emp })}
                          className="shrink-0 rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="border-r border-slate-100 px-2 py-1">
                    <input className="input-cell w-16" value={emp.employee_no} disabled={!canEdit} onChange={(e) => updateEmployeeField(emp.id, { employee_no: e.target.value })} onBlur={() => saveEmployee(emp)} />
                  </td>
                  <td className="border-r border-slate-100 px-2 py-1">
                    <input className="input-cell w-16" value={emp.file_no} disabled={!canEdit} onChange={(e) => updateEmployeeField(emp.id, { file_no: e.target.value })} onBlur={() => saveEmployee(emp)} />
                  </td>
                  <td className="border-r border-slate-100 px-2 py-1">
                    <input className="input-cell w-20" value={emp.iqama_no} disabled={!canEdit} onChange={(e) => updateEmployeeField(emp.id, { iqama_no: e.target.value })} onBlur={() => saveEmployee(emp)} />
                  </td>
                  <td className="border-r border-slate-100 px-2 py-1">
                    <input type="date" className="input-cell w-28" value={emp.date_of_birth || ""} disabled={!canEdit} onChange={(e) => updateEmployeeField(emp.id, { date_of_birth: e.target.value })} onBlur={() => saveEmployee(emp)} />
                  </td>
                  <td className="border-r border-slate-100 px-2 py-1">
                    <input className="input-cell w-20" value={emp.phone} disabled={!canEdit} onChange={(e) => updateEmployeeField(emp.id, { phone: e.target.value })} onBlur={() => saveEmployee(emp)} />
                  </td>
                  <td className="border-r border-slate-100 px-2 py-1">
                    <input className="input-cell w-28" value={emp.department} disabled={!canEdit} onChange={(e) => updateEmployeeField(emp.id, { department: e.target.value })} onBlur={() => saveEmployee(emp)} />
                  </td>
                  <td className="border-r border-slate-100 px-2 py-1">
                    <input className="input-cell w-28" value={emp.job_title || ""} disabled={!canEdit} onChange={(e) => updateEmployeeField(emp.id, { job_title: e.target.value })} onBlur={() => saveEmployee(emp)} />
                  </td>

                  <td className="border-r border-slate-100 px-2 py-1">
                    <select
                      className="input-cell w-32"
                      value={s.investigation_status || "review_due"}
                      disabled={!canEdit}
                      onChange={(e) => saveStatus(emp, { investigation_status: e.target.value })}
                    >
                      {INVESTIGATION_STATUSES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {t(o.label)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="border-r border-slate-100 px-2 py-1">
                    <select
                      className="input-cell w-20"
                      value={s.ppd_status || ""}
                      disabled={!canEdit}
                      onChange={(e) => saveStatus(emp, { ppd_status: e.target.value })}
                    >
                      <option value="">—</option>
                      <option value="done">{t("Done")}</option>
                      <option value="refused">{t("Refused")}</option>
                    </select>
                  </td>
                  <td className="border-r border-slate-100 px-2 py-1">
                    <input
                      className="input-cell w-24"
                      placeholder={t("e.g. Negative")}
                      value={s.ppd_result || ""}
                      disabled={!canEdit}
                      onChange={(e) => setStatusField(emp.id, { ppd_result: e.target.value })}
                      onBlur={() => saveStatusRow(emp)}
                    />
                  </td>
                  <td className="border-r border-slate-100 px-2 py-1">
                    <input
                      type="date"
                      className="input-cell w-28"
                      value={s.ppd_test_date || ""}
                      disabled={!canEdit}
                      onChange={(e) => setStatusField(emp.id, { ppd_test_date: e.target.value, ppd_next_due_date: e.target.value ? addMonths(e.target.value, 12) : "" })}
                      onBlur={() => saveStatusRow(emp)}
                    />
                  </td>
                  <td className="border-r border-slate-100 px-2 py-1">
                    <input
                      type="date"
                      className="input-cell w-28"
                      value={s.ppd_2nd_test_date || ""}
                      disabled={!canEdit}
                      onChange={(e) => setStatusField(emp.id, { ppd_2nd_test_date: e.target.value, ppd_next_due_date: e.target.value ? addMonths(e.target.value, 12) : s.ppd_next_due_date })}
                      onBlur={() => saveStatusRow(emp)}
                    />
                  </td>
                  <td className="border-r border-slate-100 px-2 py-1">
                    <input type="date" className="input-cell w-28" value={s.ppd_next_due_date || ""} disabled={!canEdit} onChange={(e) => setStatusField(emp.id, { ppd_next_due_date: e.target.value })} onBlur={() => saveStatusRow(emp)} />
                  </td>

                  {kitchenMode && (
                    <>
                      <td className="border-r border-amber-100 bg-amber-50/30 px-2 py-1">
                        <select
                          className="input-cell w-20"
                          value={s.stool_urine_status || ""}
                          disabled={!canEdit}
                          onChange={(e) => saveStatus(emp, { stool_urine_status: e.target.value })}
                        >
                          <option value="">—</option>
                          <option value="done">{t("Done")}</option>
                          <option value="refused">{t("Refused")}</option>
                          <option value="not_applicable">{t("Not Applicable")}</option>
                        </select>
                      </td>
                      <td className="border-r border-amber-100 bg-amber-50/30 px-2 py-1">
                        <input
                          type="date"
                          className="input-cell w-28"
                          value={s.stool_urine_test_date || ""}
                          disabled={!canEdit}
                          onChange={(e) => setStatusField(emp.id, { stool_urine_test_date: e.target.value, stool_urine_next_due_date: e.target.value ? addMonths(e.target.value, 6) : "" })}
                          onBlur={() => saveStatusRow(emp)}
                        />
                      </td>
                      <td className="border-r border-amber-100 bg-amber-50/30 px-2 py-1">
                        <input type="date" className="input-cell w-28" value={s.stool_urine_next_due_date || ""} disabled={!canEdit} onChange={(e) => setStatusField(emp.id, { stool_urine_next_due_date: e.target.value })} onBlur={() => saveStatusRow(emp)} />
                      </td>
                    </>
                  )}

                  <td className="border-r border-slate-100 px-2 py-1">
                    <input className="input-cell w-32" value={s.icn_remarks || ""} disabled={!canEdit} onChange={(e) => setStatusField(emp.id, { icn_remarks: e.target.value })} onBlur={() => saveStatusRow(emp)} />
                  </td>

                  {slots.map(({ item, doses }) => {
                    const requested = requests.some((r) => r.employee_id === emp.id && r.item_type_id === item.id);
                    return (
                      <Fragment key={item.id}>
                        <td className="border-r border-slate-100 px-2 py-1 text-center">
                          <input type="checkbox" checked={requested} disabled={!canEdit} onChange={(e) => toggleVaccineRequest(emp, item, e.target.checked)} />
                        </td>
                        {doses.map((d) => (
                          <Fragment key={d}>
                            <td className="border-r border-slate-100 px-2 py-1">
                              {requested && (
                                <input
                                  type="date"
                                  className="input-cell w-28"
                                  value={getDoseField(emp.id, item.id, d, "date")}
                                  disabled={!canEdit}
                                  onChange={(e) => setDoseField(emp.id, item.id, d, "date", e.target.value)}
                                  onBlur={() => saveDoseCell(emp, item, d)}
                                />
                              )}
                            </td>
                            <td className="border-r border-slate-100 px-2 py-1">
                              {requested && (
                                <input
                                  className="input-cell w-20"
                                  value={getDoseField(emp.id, item.id, d, "batch")}
                                  disabled={!canEdit}
                                  onChange={(e) => setDoseField(emp.id, item.id, d, "batch", e.target.value)}
                                  onBlur={() => saveDoseCell(emp, item, d)}
                                />
                              )}
                            </td>
                          </Fragment>
                        ))}
                      </Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && groupEmployees.length === 0 && <p className="p-6 text-center text-sm text-slate-400">{t("No employees in this group yet.")}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t("Employee Health")}</h1>
        <p className="text-sm text-slate-500">{t("Employee Clinic — a live grid matching the clinic's tracking sheet: investigations, PPD, and vaccinations by dose.")}</p>
      </div>

      <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs w-fit">
        {TABS.filter((tabDef) => canEdit || tabDef.key !== "employees").map((tabDef) => (
          <button key={tabDef.key} onClick={() => setTab(tabDef.key)} className={`rounded-md px-3 py-1 font-medium ${tab === tabDef.key ? "bg-teal-600 text-white" : "text-slate-500"}`}>
            {t(tabDef.label)}
          </button>
        ))}
      </div>

      {message && (
        <p className={`rounded-lg px-3 py-2 text-sm ${message.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{message.text}</p>
      )}

      {tab === "compliance" && (
        <div className="flex flex-col gap-4">
          <select className="input w-full sm:w-64" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
            <option value="">{t("All Departments")}</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">{t("Employee")}</th>
                  <th className="px-4 py-2 font-medium">{t("Department")}</th>
                  <th className="px-4 py-2 font-medium">{t("Item")}</th>
                  <th className="px-4 py-2 font-medium">{t("Due Date")}</th>
                  <th className="px-4 py-2 font-medium">{t("Status")}</th>
                </tr>
              </thead>
              <tbody>
                {complianceRows.map((row, idx) => (
                  <tr key={idx} className="border-t border-slate-100">
                    <td className="px-4 py-2">{row.employee.name}</td>
                    <td className="px-4 py-2">{row.employee.department}</td>
                    <td className="px-4 py-2">{row.label}</td>
                    <td className="px-4 py-2">{row.dueDate || "—"}</td>
                    <td className="px-4 py-2">
                      <span className={`flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${row.status === "overdue" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                        <AlertTriangle className="h-3 w-3" />
                        {row.status === "overdue" ? t("Overdue") : t("Missing")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && complianceRows.length === 0 && <p className="p-6 text-center text-sm text-slate-400">{t("Everyone is up to date 🎉")}</p>}
            {loading && <p className="p-6 text-center text-sm text-slate-400">{t("Loading...")}</p>}
          </div>
        </div>
      )}

      {tab === "clinic" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs w-fit">
              <button
                onClick={() => {
                  setClinicGroup("regular");
                  setClinicDeptFilter("");
                }}
                className={`rounded-md px-3 py-1 font-medium ${clinicGroup === "regular" ? "bg-teal-600 text-white" : "text-slate-500"}`}
              >
                {t("Regular Staff")} ({regularEmployees.length})
              </button>
              <button
                onClick={() => {
                  setClinicGroup("kitchen");
                  setClinicDeptFilter("");
                }}
                className={`rounded-md px-3 py-1 font-medium ${clinicGroup === "kitchen" ? "bg-teal-600 text-white" : "text-slate-500"}`}
              >
                {t("Kitchen Staff")} ({kitchenEmployees.length})
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <select className="input w-44" value={clinicDeptFilter} onChange={(e) => setClinicDeptFilter(e.target.value)}>
                <option value="">{t("All Departments")}</option>
                {clinicDepartments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <input
                className="input w-48"
                value={clinicSearch}
                onChange={(e) => setClinicSearch(e.target.value)}
                placeholder={t("Search name / file no / emp #")}
              />
              <select className="input w-36" value={clinicPpdFilter} onChange={(e) => setClinicPpdFilter(e.target.value)}>
                <option value="">{t("All PPD")}</option>
                <option value="pending">{t("PPD Pending")}</option>
                <option value="overdue">{t("PPD Overdue")}</option>
                <option value="done">{t("PPD Done")}</option>
              </select>
              {canEdit && (
                <button
                  onClick={() => {
                    setEmployeeForm({ ...emptyEmployeeForm, is_kitchen_staff: clinicGroup === "kitchen" });
                    setShowQuickAdd((v) => !v);
                  }}
                  className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  {t("Add Employee")}
                </button>
              )}
              <label className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600">
                <input type="checkbox" checked={pendingOnlyExport} onChange={(e) => setPendingOnlyExport(e.target.checked)} />
                {t("Pending only")}
              </label>
              <button onClick={exportExcel} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                {t("Export Excel")}
              </button>
              <button onClick={exportPdf} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                <FileText className="h-3.5 w-3.5" />
                {t("Export PDF")}
              </button>
            </div>
          </div>
          {showQuickAdd && canEdit && (
            <form
              onSubmit={(e) => {
                handleAddEmployee(e);
                setShowQuickAdd(false);
              }}
              className="grid grid-cols-1 gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 sm:grid-cols-5 sm:items-center"
            >
              <input className="input" value={employeeForm.name} onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })} placeholder={t("Name")} required />
              <input
                className="input"
                value={employeeForm.employee_no}
                onChange={(e) => setEmployeeForm({ ...employeeForm, employee_no: e.target.value })}
                placeholder={t("Employee #")}
              />
              <input className="input" value={employeeForm.file_no} onChange={(e) => setEmployeeForm({ ...employeeForm, file_no: e.target.value })} placeholder={t("File #")} />
              <select className="input" value={employeeForm.department} onChange={(e) => setEmployeeForm({ ...employeeForm, department: e.target.value })} required>
                <option value="">{t("Department")}</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <button type="submit" className="flex items-center justify-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
                <UserPlus className="h-4 w-4" />
                {t("Save")}
              </button>
            </form>
          )}
          <p className="text-xs text-slate-500">{t(INVESTIGATION_TESTS)}</p>
          {clinicGroup === "regular" ? renderClinicGrid(visibleRegularEmployees, regularVaccines, false) : renderClinicGrid(visibleKitchenEmployees, kitchenVaccines, true)}
        </div>
      )}

      {tab === "doctor-review" && (
        <div className="flex flex-col gap-8">
          <div>
            <h2 className="mb-3 text-sm font-bold text-slate-800">
              {t("Emp Clinic Pending Review")} ({pendingReviewEmployees.length})
            </h2>
            <div className="flex flex-col gap-3">
              {pendingReviewEmployees.map((emp) => {
                const s = statusFor(emp.id);
                const needed = neededVaccines(emp);
                return (
                  <div key={emp.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-800">{emp.name}</p>
                        <p className="text-xs text-slate-500">
                          {emp.department} · {emp.employee_no}
                        </p>
                      </div>
                      <select className="input-cell w-44" value={s.investigation_status || "review_due"} onChange={(e) => saveStatus(emp, { investigation_status: e.target.value })}>
                        {INVESTIGATION_STATUSES.map((o) => (
                          <option key={o.value} value={o.value}>
                            {t(o.label)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {needed.length > 0 && (
                      <p className="mt-2 text-xs text-amber-700">
                        {t("Needed vaccinations")}: {needed.join(" · ")}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {(s.investigation_attachments ?? []).map((a, i) => (
                        <span key={i} className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                          <a href={attachmentUrl(a.path)} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-teal-700 hover:underline">
                            <Paperclip className="h-3 w-3" />
                            {a.name || t("View")}
                          </a>
                          <button onClick={() => removeInvestigationAttachment(emp, i)} className="text-slate-400 hover:text-red-500">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <label className="flex cursor-pointer items-center gap-1 text-xs font-medium text-red-600 hover:underline">
                        <Upload className="h-3.5 w-3.5" />
                        {t("Attach blood test results")}
                        <input type="file" multiple className="hidden" onChange={(e) => e.target.files?.length && addInvestigationAttachments(emp, e.target.files)} />
                      </label>
                      <button
                        onClick={() => saveStatus(emp, { investigation_status: "review_done" })}
                        className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {t("Mark reviewed")}
                      </button>
                    </div>
                  </div>
                );
              })}
              {pendingReviewEmployees.length === 0 && <p className="text-sm text-slate-400">{t("Nothing pending doctor review 🎉")}</p>}
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-bold text-slate-800">
              {t("NSI Follow Up")} ({nsiCases.length})
            </h2>
            <form onSubmit={addNsiCase} className="mb-3 grid grid-cols-1 gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 sm:grid-cols-4 sm:items-center">
              <select className="input" value={nsiForm.employee_id} onChange={(e) => setNsiForm({ ...nsiForm, employee_id: e.target.value })} required>
                <option value="">{t("Employee")}</option>
                {activeEmployees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <input type="date" className="input" value={nsiForm.incident_date} onChange={(e) => setNsiForm({ ...nsiForm, incident_date: e.target.value })} />
              <input className="input" value={nsiForm.notes} onChange={(e) => setNsiForm({ ...nsiForm, notes: e.target.value })} placeholder={t("Notes")} />
              <button type="submit" className="flex items-center justify-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
                <Plus className="h-4 w-4" />
                {t("Add Incident")}
              </button>
            </form>
            <div className="flex flex-col gap-3">
              {nsiCases.map((c) => {
                const emp = employees.find((e) => e.id === c.employee_id);
                return (
                  <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-800">{emp?.name || "—"}</p>
                        <p className="text-xs text-slate-500">
                          {t("Incident date")}: {c.incident_date || "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                          <input type="checkbox" checked={c.doctor_reviewed} onChange={(e) => saveNsiCase(c, { doctor_reviewed: e.target.checked })} />
                          {t("Doctor reviewed")}
                        </label>
                        <button onClick={() => removeNsiCase(c)} className="rounded-lg p-1 text-slate-300 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <label className="flex items-center gap-1.5 text-xs text-slate-500">
                        {t("Report 1")}
                        <input
                          type="date"
                          className="input-cell flex-1"
                          value={c.report_1_date || ""}
                          onChange={(e) => updateNsiField(c.id, { report_1_date: e.target.value })}
                          onBlur={() => saveNsiCase(c, {})}
                        />
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-slate-500">
                        {t("Report 2")}
                        <input
                          type="date"
                          className="input-cell flex-1"
                          value={c.report_2_date || ""}
                          onChange={(e) => updateNsiField(c.id, { report_2_date: e.target.value })}
                          onBlur={() => saveNsiCase(c, {})}
                        />
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-slate-500">
                        {t("Report 3")}
                        <input
                          type="date"
                          className="input-cell flex-1"
                          value={c.report_3_date || ""}
                          onChange={(e) => updateNsiField(c.id, { report_3_date: e.target.value })}
                          onBlur={() => saveNsiCase(c, {})}
                        />
                      </label>
                    </div>
                    <input
                      className="input mt-2 w-full text-sm"
                      value={c.notes || ""}
                      onChange={(e) => updateNsiField(c.id, { notes: e.target.value })}
                      onBlur={() => saveNsiCase(c, {})}
                      placeholder={t("Notes")}
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {(c.form_attachments ?? []).map((a, i) => (
                        <span key={i} className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                          <a href={attachmentUrl(a.path)} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-teal-700 hover:underline">
                            <Paperclip className="h-3 w-3" />
                            {a.name || t("View")}
                          </a>
                          <button onClick={() => removeNsiAttachment(c, i)} className="text-slate-400 hover:text-red-500">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <label className="flex cursor-pointer items-center gap-1 text-xs font-medium text-red-600 hover:underline">
                        <Upload className="h-3.5 w-3.5" />
                        {t("Attach form")}
                        <input type="file" multiple className="hidden" onChange={(e) => e.target.files?.length && addNsiAttachments(c, e.target.files)} />
                      </label>
                    </div>
                  </div>
                );
              })}
              {nsiCases.length === 0 && <p className="text-sm text-slate-400">{t("No needle-stick injury cases on record.")}</p>}
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-bold text-slate-800">
              {t("PPD Pending Review")} ({pendingPpdEmployees.length})
            </h2>
            <div className="flex flex-col gap-2">
              {pendingPpdEmployees.map((emp) => {
                const s = statusFor(emp.id);
                return (
                  <div key={emp.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div>
                      <p className="font-semibold text-slate-800">{emp.name}</p>
                      <p className="text-xs text-slate-500">{emp.department}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="date"
                        className="input-cell w-32"
                        value={s.ppd_test_date || ""}
                        onChange={(e) => setStatusField(emp.id, { ppd_test_date: e.target.value, ppd_next_due_date: e.target.value ? addMonths(e.target.value, 12) : "" })}
                      />
                      <input className="input-cell w-28" placeholder={t("e.g. Negative")} value={s.ppd_result || ""} onChange={(e) => setStatusField(emp.id, { ppd_result: e.target.value })} />
                      <button
                        onClick={() => saveStatus(emp, { ppd_status: "done" })}
                        className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {t("Mark done")}
                      </button>
                    </div>
                  </div>
                );
              })}
              {pendingPpdEmployees.length === 0 && <p className="text-sm text-slate-400">{t("Everyone is up to date 🎉")}</p>}
            </div>
          </div>
        </div>
      )}

      {tab === "records" && (
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">{t("Date")}</th>
                  <th className="px-4 py-2 font-medium">{t("Employee")}</th>
                  <th className="px-4 py-2 font-medium">{t("Vaccine")}</th>
                  <th className="px-4 py-2 font-medium">{t("Dose #")}</th>
                  <th className="px-4 py-2 font-medium">{t("Batch No")}</th>
                  <th className="px-4 py-2 font-medium">{t("Next Due")}</th>
                  <th className="px-4 py-2 font-medium">{t("Recorded By")}</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const emp = employees.find((e) => e.id === r.employee_id);
                  return (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-4 py-2">{r.date_given}</td>
                      <td className="px-4 py-2">{emp?.name || "—"}</td>
                      <td className="px-4 py-2">{r.item_name}</td>
                      <td className="px-4 py-2">{r.dose_number}</td>
                      <td className="px-4 py-2">{r.batch_no || "—"}</td>
                      <td className="px-4 py-2">{r.next_due_date || "—"}</td>
                      <td className="px-4 py-2">{r.recorded_by}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && records.length === 0 && <p className="p-6 text-center text-sm text-slate-400">{t("No records yet")}</p>}
          </div>
        </div>
      )}

      {tab === "employees" && canEdit && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            {employees.map((emp) => (
              <div key={emp.id} className="grid grid-cols-1 gap-2 rounded-xl border border-slate-100 bg-white p-4 sm:grid-cols-9 sm:items-center">
                <input className="input sm:col-span-1" value={emp.employee_no} onChange={(e) => updateEmployeeField(emp.id, { employee_no: e.target.value })} placeholder={t("Employee #")} />
                <input className="input sm:col-span-2" value={emp.name} onChange={(e) => updateEmployeeField(emp.id, { name: e.target.value })} placeholder={t("Name")} />
                <input className="input sm:col-span-1" value={emp.file_no} onChange={(e) => updateEmployeeField(emp.id, { file_no: e.target.value })} placeholder={t("File #")} />
                <input className="input sm:col-span-1" value={emp.iqama_no} onChange={(e) => updateEmployeeField(emp.id, { iqama_no: e.target.value })} placeholder={t("Iqama #")} />
                <input type="date" className="input sm:col-span-1" value={emp.date_of_birth || ""} onChange={(e) => updateEmployeeField(emp.id, { date_of_birth: e.target.value })} />
                <input className="input sm:col-span-1" value={emp.phone} onChange={(e) => updateEmployeeField(emp.id, { phone: e.target.value })} placeholder={t("Phone")} />
                <select className="input sm:col-span-1" value={emp.department} onChange={(e) => updateEmployeeField(emp.id, { department: e.target.value })}>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <div className="flex items-center justify-end gap-2 sm:col-span-9">
                  <label className="flex items-center gap-1 text-xs text-slate-500">
                    <input type="checkbox" checked={emp.is_kitchen_staff} onChange={(e) => updateEmployeeField(emp.id, { is_kitchen_staff: e.target.checked })} />
                    {t("Kitchen Staff")}
                  </label>
                  <label className="flex items-center gap-1 text-xs text-slate-500">
                    <input type="checkbox" checked={emp.active} onChange={(e) => updateEmployeeField(emp.id, { active: e.target.checked })} />
                    {t("Active")}
                  </label>
                  <button onClick={() => saveEmployee(emp)} className="rounded-lg p-1.5 text-teal-600 hover:bg-teal-50">
                    <Save className="h-4 w-4" />
                  </button>
                  <button onClick={() => removeEmployee(emp)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddEmployee} className="grid grid-cols-1 gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 sm:grid-cols-4">
            <input className="input" value={employeeForm.employee_no} onChange={(e) => setEmployeeForm({ ...employeeForm, employee_no: e.target.value })} placeholder={t("Employee #")} />
            <input className="input" value={employeeForm.name} onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })} placeholder={t("Name")} required />
            <input className="input" value={employeeForm.file_no} onChange={(e) => setEmployeeForm({ ...employeeForm, file_no: e.target.value })} placeholder={t("File #")} />
            <input className="input" value={employeeForm.iqama_no} onChange={(e) => setEmployeeForm({ ...employeeForm, iqama_no: e.target.value })} placeholder={t("Iqama #")} />
            <input type="date" className="input" value={employeeForm.date_of_birth} onChange={(e) => setEmployeeForm({ ...employeeForm, date_of_birth: e.target.value })} placeholder={t("Date of birth")} />
            <input className="input" value={employeeForm.phone} onChange={(e) => setEmployeeForm({ ...employeeForm, phone: e.target.value })} placeholder={t("Phone")} />
            <select className="input" value={employeeForm.department} onChange={(e) => setEmployeeForm({ ...employeeForm, department: e.target.value })} required>
              <option value="">{t("Department")}</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <input className="input" value={employeeForm.job_title} onChange={(e) => setEmployeeForm({ ...employeeForm, job_title: e.target.value })} placeholder={t("Job title")} />
            <label className="flex items-center gap-1 text-xs text-slate-500 sm:col-span-4">
              <input type="checkbox" checked={employeeForm.is_kitchen_staff} onChange={(e) => setEmployeeForm({ ...employeeForm, is_kitchen_staff: e.target.checked })} />
              {t("Kitchen Staff (extra investigations & vaccines)")}
            </label>
            <button type="submit" className="flex items-center justify-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 sm:col-span-4">
              <UserPlus className="h-4 w-4" />
              {t("Add Employee")}
            </button>
          </form>
        </div>
      )}

      {statusPopupEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setStatusPopupEmployee(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const { severity, issues } = employeeStatus(statusPopupEmployee);
              const badge =
                severity === "red" ? { dot: "bg-red-500", text: "text-red-700", bg: "bg-red-50", label: t("Overdue / Missing") }
                : severity === "yellow" ? { dot: "bg-amber-400", text: "text-amber-700", bg: "bg-amber-50", label: t("Pending") }
                : { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", label: t("Up to date") };
              return (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-slate-800">{statusPopupEmployee.name}</h3>
                      <p className="text-xs text-slate-500">{statusPopupEmployee.department}</p>
                    </div>
                    <button onClick={() => setStatusPopupEmployee(null)} className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-50">
                      ✕
                    </button>
                  </div>
                  <span className={`mt-3 flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${badge.bg} ${badge.text}`}>
                    <span className={`h-2 w-2 rounded-full ${badge.dot}`} />
                    {badge.label}
                  </span>
                  <div className="mt-3 flex flex-col gap-2">
                    {issues.length === 0 ? (
                      <p className="text-sm text-emerald-700">{t("All good — no pending or missing items ✓")}</p>
                    ) : (
                      issues.map((issue, i) => (
                        <div key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${issue.severity === "red" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                          <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${issue.severity === "red" ? "bg-red-500" : "bg-amber-400"}`} />
                          <span>
                            <span className="font-medium">{t(issue.label)}:</span> {t(issue.detail)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {qrEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 print:hidden" onClick={closeQr}>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #qr-print-area, #qr-print-area * { visibility: visible; }
              #qr-print-area { position: fixed; inset: 0; margin: auto; }
            }
          `}</style>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-800">{t("Employee QR Profile")}</h3>
              <button onClick={closeQr} className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-50">
                ✕
              </button>
            </div>
            <div id="qr-print-area" className="mt-3 flex flex-col items-center gap-2">
              {qrDataUrl && <img src={qrDataUrl} alt="QR code" className="h-56 w-56" />}
              <p className="text-sm font-semibold text-slate-700">{qrEmployee.name}</p>
              <p className="text-xs text-slate-500">
                {qrEmployee.department} · {qrEmployee.employee_no}
              </p>
            </div>
            <button
              onClick={() => window.print()}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 print:hidden"
            >
              <Printer className="h-4 w-4" />
              {t("Print Badge")}
            </button>
          </div>
        </div>
      )}

      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setEditingEmployee(null)}>
          <form onSubmit={handleEditSave} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-800">{t("Edit Employee")}</h3>
              <button type="button" onClick={() => setEditingEmployee(null)} className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-50">
                ✕
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                className="input"
                value={editingEmployee.name}
                onChange={(e) => setEditingEmployee({ ...editingEmployee, name: e.target.value })}
                placeholder={t("Name")}
                required
              />
              <input
                className="input"
                value={editingEmployee.employee_no || ""}
                onChange={(e) => setEditingEmployee({ ...editingEmployee, employee_no: e.target.value })}
                placeholder={t("Employee #")}
              />
              <input
                className="input"
                value={editingEmployee.file_no || ""}
                onChange={(e) => setEditingEmployee({ ...editingEmployee, file_no: e.target.value })}
                placeholder={t("File #")}
              />
              <input
                className="input"
                value={editingEmployee.iqama_no || ""}
                onChange={(e) => setEditingEmployee({ ...editingEmployee, iqama_no: e.target.value })}
                placeholder={t("Iqama #")}
              />
              <input
                type="date"
                className="input"
                value={editingEmployee.date_of_birth || ""}
                onChange={(e) => setEditingEmployee({ ...editingEmployee, date_of_birth: e.target.value })}
              />
              <input
                className="input"
                value={editingEmployee.phone || ""}
                onChange={(e) => setEditingEmployee({ ...editingEmployee, phone: e.target.value })}
                placeholder={t("Phone")}
              />
              <select
                className="input"
                value={editingEmployee.department || ""}
                onChange={(e) => setEditingEmployee({ ...editingEmployee, department: e.target.value })}
                required
              >
                <option value="">{t("Department")}</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <input
                className="input"
                value={editingEmployee.job_title || ""}
                onChange={(e) => setEditingEmployee({ ...editingEmployee, job_title: e.target.value })}
                placeholder={t("Job title")}
              />
            </div>
            <label className="mt-2 flex items-center gap-1 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={editingEmployee.is_kitchen_staff}
                onChange={(e) => setEditingEmployee({ ...editingEmployee, is_kitchen_staff: e.target.checked })}
              />
              {t("Kitchen Staff (extra investigations & vaccines)")}
            </label>
            <button type="submit" className="mt-4 flex w-full items-center justify-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
              <Save className="h-4 w-4" />
              {t("Save Changes")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
