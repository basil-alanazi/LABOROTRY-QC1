import { Fragment, useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileSpreadsheet, FileText, Pencil, Save, Trash2, UserPlus } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
import { downloadExcel } from "../../lib/exportExcel";
import { downloadPdf } from "../../lib/exportPdf";
import { fetchAllRows } from "../../lib/fetchAll";

const TABS = [
  { key: "compliance", label: "Overdue & Missing" },
  { key: "clinic", label: "Employee Clinic" },
  { key: "records", label: "All Records" },
  { key: "employees", label: "Employees" },
];

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
  ppd_next_due_date: "",
  stool_urine_status: "",
  stool_urine_test_date: "",
  stool_urine_next_due_date: "",
  icn_remarks: "",
};

export default function EmployeeHealth() {
  const { session, config } = useAuth();
  const [tab, setTab] = useState("compliance");
  const [clinicGroup, setClinicGroup] = useState("regular"); // regular | kitchen
  const [clinicDeptFilter, setClinicDeptFilter] = useState("");
  const [clinicSearch, setClinicSearch] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [itemTypes, setItemTypes] = useState([]);
  const [records, setRecords] = useState([]);
  const [requests, setRequests] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [employeeForm, setEmployeeForm] = useState(emptyEmployeeForm);
  const [message, setMessage] = useState(null);
  const [filterDept, setFilterDept] = useState("");
  const [statusPopupEmployee, setStatusPopupEmployee] = useState(null);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [statusDrafts, setStatusDrafts] = useState({}); // employee_id -> status fields
  const [doseDrafts, setDoseDrafts] = useState({}); // "empId|itemId|doseNum" -> { date, batch }

  const departments = config?.employee_departments ?? [];

  async function loadAll() {
    setLoading(true);
    const [{ data: emp }, { data: types }, { data: recs }, { data: reqs }, { data: stat }] = await Promise.all([
      fetchAllRows((from, to) => supabase.from("employees").select("*").order("name").range(from, to)),
      supabase.from("health_item_types").select("*").order("sort_order"),
      fetchAllRows((from, to) => supabase.from("employee_health_records").select("*").order("date_given", { ascending: false }).range(from, to)),
      fetchAllRows((from, to) => supabase.from("employee_vaccine_requests").select("*").range(from, to)),
      fetchAllRows((from, to) => supabase.from("employee_clinic_status").select("*").range(from, to)),
    ]);
    setEmployees(emp ?? []);
    setItemTypes((types ?? []).map((t) => ({ ...t, dose_schedule: t.dose_schedule?.length ? t.dose_schedule : [0] })));
    setRecords(recs ?? []);
    setRequests(reqs ?? []);
    setStatuses(stat ?? []);
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
  function applyClinicFilters(list) {
    const q = clinicSearch.trim().toLowerCase();
    return list.filter((e) => {
      if (clinicDeptFilter && e.department !== clinicDeptFilter) return false;
      if (q && !(e.file_no || "").toLowerCase().includes(q) && !(e.name || "").toLowerCase().includes(q) && !(e.employee_no || "").toLowerCase().includes(q))
        return false;
      return true;
    });
  }
  const visibleRegularEmployees = useMemo(() => applyClinicFilters(regularEmployees), [regularEmployees, clinicDeptFilter, clinicSearch]);
  const visibleKitchenEmployees = useMemo(() => applyClinicFilters(kitchenEmployees), [kitchenEmployees, clinicDeptFilter, clinicSearch]);
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
      } else if (st.stool_urine_next_due_date && st.stool_urine_next_due_date < today) {
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
        else if (s.stool_urine_next_due_date && s.stool_urine_next_due_date < today)
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
        ppd_next_due_date: merged.ppd_next_due_date || null,
        stool_urine_status: merged.stool_urine_status || null,
        stool_urine_test_date: merged.stool_urine_test_date || null,
        stool_urine_next_due_date: merged.stool_urine_next_due_date || null,
        icn_remarks: merged.icn_remarks || "",
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

  // --- Grid <-> export shared column/row builders ---
  function vaccineSlots(vaccines) {
    return vaccines.map((item) => ({ item, doses: Array.from({ length: item.dose_schedule?.length || 1 }, (_, i) => i + 1) }));
  }
  const CLINIC_BASE_HEADERS = ["#", "Name", "Emp ID", "File No", "Iqama No", "DOB", "Phone", "Department"];
  const CLINIC_INVEST_HEADERS = ["Investigation Status", "PPD Status", "PPD Result", "PPD Test Date", "PPD Next Due"];
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
    const base = [idx, emp.name, emp.employee_no, emp.file_no, emp.iqama_no, emp.date_of_birth || "", emp.phone, emp.department];
    const invest = [
      INVESTIGATION_STATUSES.find((o) => o.value === s?.investigation_status)?.label || "",
      s?.ppd_status || "",
      s?.ppd_result || "",
      s?.ppd_test_date || "",
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

  const REPORT_HEADERS = ["Date", "Employee", "Employee No", "Department", "Vaccine", "Dose #", "Batch No", "Next Due", "Recorded By"];
  function toReportRow(r) {
    const emp = employees.find((e) => e.id === r.employee_id);
    return [r.date_given, emp?.name || "", emp?.employee_no || "", emp?.department || "", r.item_name, r.dose_number, r.batch_no, r.next_due_date || "", r.recorded_by];
  }

  function exportExcel() {
    downloadExcel(`infection-control-employee-clinic-${todayStr()}`, [
      { name: "Regular Staff", headers: buildGridHeaders(regularVaccines, false), rows: regularEmployees.map((e, i) => buildGridRow(e, i + 1, regularVaccines, false)) },
      { name: "Kitchen Staff", headers: buildGridHeaders(kitchenVaccines, true), rows: kitchenEmployees.map((e, i) => buildGridRow(e, i + 1, kitchenVaccines, true)) },
      { name: "Vaccination Log", headers: REPORT_HEADERS, rows: records.map(toReportRow) },
    ]);
  }

  function exportPdf() {
    downloadPdf(`infection-control-employee-clinic-${todayStr()}`, "Infection Control — Employee Clinic", [
      { title: "Regular Staff", headers: buildGridHeaders(regularVaccines, false), rows: regularEmployees.map((e, i) => buildGridRow(e, i + 1, regularVaccines, false)) },
      { title: "Kitchen Staff", headers: buildGridHeaders(kitchenVaccines, true), rows: kitchenEmployees.map((e, i) => buildGridRow(e, i + 1, kitchenVaccines, true)) },
      { title: "Vaccination Log", headers: REPORT_HEADERS, rows: records.map(toReportRow) },
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
                  {h}
                </th>
              ))}
              {CLINIC_INVEST_HEADERS.map((h) => (
                <th key={h} rowSpan={2} className="border-b border-r border-slate-200 px-2 py-1.5 align-bottom font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
              {kitchenMode &&
                CLINIC_STOOL_HEADERS.map((h) => (
                  <th key={h} rowSpan={2} className="border-b border-r border-amber-200 bg-amber-50/60 px-2 py-1.5 align-bottom font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              <th rowSpan={2} className="border-b border-r border-slate-200 px-2 py-1.5 align-bottom font-medium whitespace-nowrap">
                ICN Remarks
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
                    <button onClick={() => removeEmployee(emp)} title="Remove employee" className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                  <td className="sticky left-10 z-10 w-10 border-r border-slate-100 bg-white px-2 py-1">{idx + 1}</td>
                  <td className="sticky left-20 z-10 border-r border-slate-100 bg-white px-2 py-1">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        title="View status summary"
                        onClick={() => setStatusPopupEmployee(emp)}
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                          employeeStatus(emp).severity === "red" ? "bg-red-500" : employeeStatus(emp).severity === "yellow" ? "bg-amber-400" : "bg-emerald-500"
                        }`}
                      />
                      <input className="input-cell" value={emp.name} onChange={(e) => updateEmployeeField(emp.id, { name: e.target.value })} onBlur={() => saveEmployee(emp)} />
                      <button
                        type="button"
                        title="Edit employee"
                        onClick={() => setEditingEmployee({ ...emp })}
                        className="shrink-0 rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="border-r border-slate-100 px-2 py-1">
                    <input className="input-cell w-16" value={emp.employee_no} onChange={(e) => updateEmployeeField(emp.id, { employee_no: e.target.value })} onBlur={() => saveEmployee(emp)} />
                  </td>
                  <td className="border-r border-slate-100 px-2 py-1">
                    <input className="input-cell w-16" value={emp.file_no} onChange={(e) => updateEmployeeField(emp.id, { file_no: e.target.value })} onBlur={() => saveEmployee(emp)} />
                  </td>
                  <td className="border-r border-slate-100 px-2 py-1">
                    <input className="input-cell w-20" value={emp.iqama_no} onChange={(e) => updateEmployeeField(emp.id, { iqama_no: e.target.value })} onBlur={() => saveEmployee(emp)} />
                  </td>
                  <td className="border-r border-slate-100 px-2 py-1">
                    <input type="date" className="input-cell w-28" value={emp.date_of_birth || ""} onChange={(e) => updateEmployeeField(emp.id, { date_of_birth: e.target.value })} onBlur={() => saveEmployee(emp)} />
                  </td>
                  <td className="border-r border-slate-100 px-2 py-1">
                    <input className="input-cell w-20" value={emp.phone} onChange={(e) => updateEmployeeField(emp.id, { phone: e.target.value })} onBlur={() => saveEmployee(emp)} />
                  </td>
                  <td className="border-r border-slate-100 px-2 py-1 whitespace-nowrap">{emp.department}</td>

                  <td className="border-r border-slate-100 px-2 py-1">
                    <select
                      className="input-cell w-32"
                      value={s.investigation_status || "review_due"}
                      onChange={(e) => saveStatus(emp, { investigation_status: e.target.value })}
                    >
                      {INVESTIGATION_STATUSES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="border-r border-slate-100 px-2 py-1">
                    <select
                      className="input-cell w-20"
                      value={s.ppd_status || ""}
                      onChange={(e) => saveStatus(emp, { ppd_status: e.target.value })}
                    >
                      <option value="">—</option>
                      <option value="done">Done</option>
                      <option value="refused">Refused</option>
                    </select>
                  </td>
                  <td className="border-r border-slate-100 px-2 py-1">
                    <input
                      className="input-cell w-24"
                      placeholder="e.g. Negative"
                      value={s.ppd_result || ""}
                      onChange={(e) => setStatusField(emp.id, { ppd_result: e.target.value })}
                      onBlur={() => saveStatusRow(emp)}
                    />
                  </td>
                  <td className="border-r border-slate-100 px-2 py-1">
                    <input
                      type="date"
                      className="input-cell w-28"
                      value={s.ppd_test_date || ""}
                      onChange={(e) => setStatusField(emp.id, { ppd_test_date: e.target.value, ppd_next_due_date: e.target.value ? addMonths(e.target.value, 12) : "" })}
                      onBlur={() => saveStatusRow(emp)}
                    />
                  </td>
                  <td className="border-r border-slate-100 px-2 py-1">
                    <input type="date" className="input-cell w-28" value={s.ppd_next_due_date || ""} onChange={(e) => setStatusField(emp.id, { ppd_next_due_date: e.target.value })} onBlur={() => saveStatusRow(emp)} />
                  </td>

                  {kitchenMode && (
                    <>
                      <td className="border-r border-amber-100 bg-amber-50/30 px-2 py-1">
                        <select
                          className="input-cell w-20"
                          value={s.stool_urine_status || ""}
                          onChange={(e) => saveStatus(emp, { stool_urine_status: e.target.value })}
                        >
                          <option value="">—</option>
                          <option value="done">Done</option>
                          <option value="refused">Refused</option>
                        </select>
                      </td>
                      <td className="border-r border-amber-100 bg-amber-50/30 px-2 py-1">
                        <input
                          type="date"
                          className="input-cell w-28"
                          value={s.stool_urine_test_date || ""}
                          onChange={(e) => setStatusField(emp.id, { stool_urine_test_date: e.target.value, stool_urine_next_due_date: e.target.value ? addMonths(e.target.value, 6) : "" })}
                          onBlur={() => saveStatusRow(emp)}
                        />
                      </td>
                      <td className="border-r border-amber-100 bg-amber-50/30 px-2 py-1">
                        <input type="date" className="input-cell w-28" value={s.stool_urine_next_due_date || ""} onChange={(e) => setStatusField(emp.id, { stool_urine_next_due_date: e.target.value })} onBlur={() => saveStatusRow(emp)} />
                      </td>
                    </>
                  )}

                  <td className="border-r border-slate-100 px-2 py-1">
                    <input className="input-cell w-32" value={s.icn_remarks || ""} onChange={(e) => setStatusField(emp.id, { icn_remarks: e.target.value })} onBlur={() => saveStatusRow(emp)} />
                  </td>

                  {slots.map(({ item, doses }) => {
                    const requested = requests.some((r) => r.employee_id === emp.id && r.item_type_id === item.id);
                    return (
                      <Fragment key={item.id}>
                        <td className="border-r border-slate-100 px-2 py-1 text-center">
                          <input type="checkbox" checked={requested} onChange={(e) => toggleVaccineRequest(emp, item, e.target.checked)} />
                        </td>
                        {doses.map((d) => (
                          <Fragment key={d}>
                            <td className="border-r border-slate-100 px-2 py-1">
                              {requested && (
                                <input
                                  type="date"
                                  className="input-cell w-28"
                                  value={getDoseField(emp.id, item.id, d, "date")}
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
        {!loading && groupEmployees.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No employees in this group yet.</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Employee Health</h1>
        <p className="text-sm text-slate-500">Employee Clinic — a live grid matching the clinic's tracking sheet: investigations, PPD, and vaccinations by dose.</p>
      </div>

      <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs w-fit">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`rounded-md px-3 py-1 font-medium ${tab === t.key ? "bg-teal-600 text-white" : "text-slate-500"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {message && (
        <p className={`rounded-lg px-3 py-2 text-sm ${message.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{message.text}</p>
      )}

      {tab === "compliance" && (
        <div className="flex flex-col gap-4">
          <select className="input w-full sm:w-64" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
            <option value="">All Departments</option>
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
                  <th className="px-4 py-2 font-medium">Employee</th>
                  <th className="px-4 py-2 font-medium">Department</th>
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 font-medium">Due Date</th>
                  <th className="px-4 py-2 font-medium">Status</th>
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
                        {row.status === "overdue" ? "Overdue" : "Missing"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && complianceRows.length === 0 && <p className="p-6 text-center text-sm text-slate-400">Everyone is up to date 🎉</p>}
            {loading && <p className="p-6 text-center text-sm text-slate-400">Loading...</p>}
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
                Regular Staff ({regularEmployees.length})
              </button>
              <button
                onClick={() => {
                  setClinicGroup("kitchen");
                  setClinicDeptFilter("");
                }}
                className={`rounded-md px-3 py-1 font-medium ${clinicGroup === "kitchen" ? "bg-teal-600 text-white" : "text-slate-500"}`}
              >
                Kitchen Staff ({kitchenEmployees.length})
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <select className="input w-44" value={clinicDeptFilter} onChange={(e) => setClinicDeptFilter(e.target.value)}>
                <option value="">All Departments</option>
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
                placeholder="Search name / file no / emp #"
              />
              <button
                onClick={() => {
                  setEmployeeForm({ ...emptyEmployeeForm, is_kitchen_staff: clinicGroup === "kitchen" });
                  setShowQuickAdd((v) => !v);
                }}
                className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Add Employee
              </button>
              <button onClick={exportExcel} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Export Excel
              </button>
              <button onClick={exportPdf} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                <FileText className="h-3.5 w-3.5" />
                Export PDF
              </button>
            </div>
          </div>
          {showQuickAdd && (
            <form
              onSubmit={(e) => {
                handleAddEmployee(e);
                setShowQuickAdd(false);
              }}
              className="grid grid-cols-1 gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 sm:grid-cols-5 sm:items-center"
            >
              <input className="input" value={employeeForm.name} onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })} placeholder="Name" required />
              <input
                className="input"
                value={employeeForm.employee_no}
                onChange={(e) => setEmployeeForm({ ...employeeForm, employee_no: e.target.value })}
                placeholder="Employee #"
              />
              <input className="input" value={employeeForm.file_no} onChange={(e) => setEmployeeForm({ ...employeeForm, file_no: e.target.value })} placeholder="File #" />
              <select className="input" value={employeeForm.department} onChange={(e) => setEmployeeForm({ ...employeeForm, department: e.target.value })} required>
                <option value="">Department</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <button type="submit" className="flex items-center justify-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
                <UserPlus className="h-4 w-4" />
                Save
              </button>
            </form>
          )}
          <p className="text-xs text-slate-500">{INVESTIGATION_TESTS}</p>
          {clinicGroup === "regular" ? renderClinicGrid(visibleRegularEmployees, regularVaccines, false) : renderClinicGrid(visibleKitchenEmployees, kitchenVaccines, true)}
        </div>
      )}

      {tab === "records" && (
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Employee</th>
                  <th className="px-4 py-2 font-medium">Vaccine</th>
                  <th className="px-4 py-2 font-medium">Dose #</th>
                  <th className="px-4 py-2 font-medium">Batch No</th>
                  <th className="px-4 py-2 font-medium">Next Due</th>
                  <th className="px-4 py-2 font-medium">Recorded By</th>
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
            {!loading && records.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No records yet</p>}
          </div>
        </div>
      )}

      {tab === "employees" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            {employees.map((emp) => (
              <div key={emp.id} className="grid grid-cols-1 gap-2 rounded-xl border border-slate-100 bg-white p-4 sm:grid-cols-9 sm:items-center">
                <input className="input sm:col-span-1" value={emp.employee_no} onChange={(e) => updateEmployeeField(emp.id, { employee_no: e.target.value })} placeholder="Employee #" />
                <input className="input sm:col-span-2" value={emp.name} onChange={(e) => updateEmployeeField(emp.id, { name: e.target.value })} placeholder="Name" />
                <input className="input sm:col-span-1" value={emp.file_no} onChange={(e) => updateEmployeeField(emp.id, { file_no: e.target.value })} placeholder="File #" />
                <input className="input sm:col-span-1" value={emp.iqama_no} onChange={(e) => updateEmployeeField(emp.id, { iqama_no: e.target.value })} placeholder="Iqama #" />
                <input type="date" className="input sm:col-span-1" value={emp.date_of_birth || ""} onChange={(e) => updateEmployeeField(emp.id, { date_of_birth: e.target.value })} />
                <input className="input sm:col-span-1" value={emp.phone} onChange={(e) => updateEmployeeField(emp.id, { phone: e.target.value })} placeholder="Phone" />
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
                    Kitchen Staff
                  </label>
                  <label className="flex items-center gap-1 text-xs text-slate-500">
                    <input type="checkbox" checked={emp.active} onChange={(e) => updateEmployeeField(emp.id, { active: e.target.checked })} />
                    Active
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
            <input className="input" value={employeeForm.employee_no} onChange={(e) => setEmployeeForm({ ...employeeForm, employee_no: e.target.value })} placeholder="Employee #" />
            <input className="input" value={employeeForm.name} onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })} placeholder="Name" required />
            <input className="input" value={employeeForm.file_no} onChange={(e) => setEmployeeForm({ ...employeeForm, file_no: e.target.value })} placeholder="File #" />
            <input className="input" value={employeeForm.iqama_no} onChange={(e) => setEmployeeForm({ ...employeeForm, iqama_no: e.target.value })} placeholder="Iqama #" />
            <input type="date" className="input" value={employeeForm.date_of_birth} onChange={(e) => setEmployeeForm({ ...employeeForm, date_of_birth: e.target.value })} placeholder="Date of birth" />
            <input className="input" value={employeeForm.phone} onChange={(e) => setEmployeeForm({ ...employeeForm, phone: e.target.value })} placeholder="Phone" />
            <select className="input" value={employeeForm.department} onChange={(e) => setEmployeeForm({ ...employeeForm, department: e.target.value })} required>
              <option value="">Department</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <input className="input" value={employeeForm.job_title} onChange={(e) => setEmployeeForm({ ...employeeForm, job_title: e.target.value })} placeholder="Job title" />
            <label className="flex items-center gap-1 text-xs text-slate-500 sm:col-span-4">
              <input type="checkbox" checked={employeeForm.is_kitchen_staff} onChange={(e) => setEmployeeForm({ ...employeeForm, is_kitchen_staff: e.target.checked })} />
              Kitchen Staff (extra investigations &amp; vaccines)
            </label>
            <button type="submit" className="flex items-center justify-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 sm:col-span-4">
              <UserPlus className="h-4 w-4" />
              Add Employee
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
                severity === "red" ? { dot: "bg-red-500", text: "text-red-700", bg: "bg-red-50", label: "Overdue / Missing" }
                : severity === "yellow" ? { dot: "bg-amber-400", text: "text-amber-700", bg: "bg-amber-50", label: "Pending" }
                : { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", label: "Up to date" };
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
                      <p className="text-sm text-emerald-700">All good — no pending or missing items ✓</p>
                    ) : (
                      issues.map((issue, i) => (
                        <div key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${issue.severity === "red" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                          <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${issue.severity === "red" ? "bg-red-500" : "bg-amber-400"}`} />
                          <span>
                            <span className="font-medium">{issue.label}:</span> {issue.detail}
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

      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setEditingEmployee(null)}>
          <form onSubmit={handleEditSave} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-800">Edit Employee</h3>
              <button type="button" onClick={() => setEditingEmployee(null)} className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-50">
                ✕
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                className="input"
                value={editingEmployee.name}
                onChange={(e) => setEditingEmployee({ ...editingEmployee, name: e.target.value })}
                placeholder="Name"
                required
              />
              <input
                className="input"
                value={editingEmployee.employee_no || ""}
                onChange={(e) => setEditingEmployee({ ...editingEmployee, employee_no: e.target.value })}
                placeholder="Employee #"
              />
              <input
                className="input"
                value={editingEmployee.file_no || ""}
                onChange={(e) => setEditingEmployee({ ...editingEmployee, file_no: e.target.value })}
                placeholder="File #"
              />
              <input
                className="input"
                value={editingEmployee.iqama_no || ""}
                onChange={(e) => setEditingEmployee({ ...editingEmployee, iqama_no: e.target.value })}
                placeholder="Iqama #"
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
                placeholder="Phone"
              />
              <select
                className="input"
                value={editingEmployee.department || ""}
                onChange={(e) => setEditingEmployee({ ...editingEmployee, department: e.target.value })}
                required
              >
                <option value="">Department</option>
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
                placeholder="Job title"
              />
            </div>
            <label className="mt-2 flex items-center gap-1 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={editingEmployee.is_kitchen_staff}
                onChange={(e) => setEditingEmployee({ ...editingEmployee, is_kitchen_staff: e.target.checked })}
              />
              Kitchen Staff (extra investigations &amp; vaccines)
            </label>
            <button type="submit" className="mt-4 flex w-full items-center justify-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
              <Save className="h-4 w-4" />
              Save Changes
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
