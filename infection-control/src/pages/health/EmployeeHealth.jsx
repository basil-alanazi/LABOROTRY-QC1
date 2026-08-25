import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileSpreadsheet, FileText, Save, Trash2, UserPlus, Syringe } from "lucide-react";
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
  { value: "sample_not_given", label: "Employee hasn't given sample yet" },
  { value: "review_done", label: "Doctor review done" },
];

const INVESTIGATION_TESTS =
  "Rubella IgG, Varicella Zoster IgG, Measles IgG, Mumps IgG, HBs Ab, HCV Ab, HBs Ag, HIV 1&2 Abs + P24 combo";

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

const emptyClinicStatus = {
  investigation_status: "review_due",
  ppd_status: "",
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
  const [employees, setEmployees] = useState([]);
  const [itemTypes, setItemTypes] = useState([]);
  const [records, setRecords] = useState([]);
  const [requests, setRequests] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [employeeForm, setEmployeeForm] = useState(emptyEmployeeForm);
  const [message, setMessage] = useState(null);
  const [filterDept, setFilterDept] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [clinicForm, setClinicForm] = useState(emptyClinicStatus);
  const [doseInputs, setDoseInputs] = useState({}); // itemTypeId -> { date, batch }

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
    const s = statuses.find((s) => s.employee_id === selectedEmployeeId);
    setClinicForm(
      s
        ? {
            investigation_status: s.investigation_status || "review_due",
            ppd_status: s.ppd_status || "",
            ppd_test_date: s.ppd_test_date || "",
            ppd_next_due_date: s.ppd_next_due_date || "",
            stool_urine_status: s.stool_urine_status || "",
            stool_urine_test_date: s.stool_urine_test_date || "",
            stool_urine_next_due_date: s.stool_urine_next_due_date || "",
            icn_remarks: s.icn_remarks || "",
          }
        : emptyClinicStatus
    );
    setDoseInputs({});
  }, [selectedEmployeeId, statuses]);

  function flash(msg) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }

  const activeEmployees = useMemo(() => employees.filter((e) => e.active), [employees]);
  const activeItemTypes = useMemo(() => itemTypes.filter((t) => t.active), [itemTypes]);
  const selectedEmployee = useMemo(() => employees.find((e) => e.id === selectedEmployeeId) || null, [employees, selectedEmployeeId]);
  const visibleItemTypes = useMemo(
    () => activeItemTypes.filter((t) => !t.kitchen_only || selectedEmployee?.is_kitchen_staff),
    [activeItemTypes, selectedEmployee]
  );

  function doseState(empId, item) {
    const recs = records
      .filter((r) => r.employee_id === empId && r.item_type_id === item.id)
      .sort((a, b) => a.dose_number - b.dose_number || (a.date_given < b.date_given ? -1 : 1));
    const schedule = item.dose_schedule?.length ? item.dose_schedule : [0];
    const dose1 = recs.find((r) => r.dose_number === 1);
    const highestGiven = recs.length ? Math.max(...recs.map((r) => r.dose_number)) : 0;
    const complete = highestGiven >= schedule.length;
    let nextDoseNumber = null;
    let nextDueDate = null;
    let renewalDue = false;
    if (!complete) {
      nextDoseNumber = highestGiven + 1;
      if (nextDoseNumber > 1 && dose1) nextDueDate = addMonths(dose1.date_given, schedule[nextDoseNumber - 1]);
    } else if (item.recurrence_months) {
      const last = recs[recs.length - 1];
      const dueDate = last.next_due_date || addMonths(last.date_given, item.recurrence_months);
      if (dueDate <= todayStr()) {
        renewalDue = true;
        nextDoseNumber = 1;
        nextDueDate = dueDate;
      }
    }
    return { recs, schedule, complete, nextDoseNumber, nextDueDate, renewalDue };
  }

  // Every active employee x active/visible item type they've been given
  // (or are due for) at least one dose, flagged overdue/missing, plus PPD
  // and stool/urine due dates.
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
        const status = state.nextDoseNumber === 1 && !dueDate ? "missing" : dueDate && dueDate < today ? "overdue" : dueDate ? "upcoming" : "missing";
        if (status === "upcoming") continue;
        rows.push({
          employee: emp,
          label: `${item.name} — Dose ${state.nextDoseNumber}${state.renewalDue ? " (renewal)" : ""}`,
          dueDate,
          status,
        });
      }
      const s = statuses.find((x) => x.employee_id === emp.id);
      if (!s?.ppd_status) {
        rows.push({ employee: emp, label: "PPD", dueDate: null, status: "missing" });
      } else if (s.ppd_next_due_date && s.ppd_next_due_date < today) {
        rows.push({ employee: emp, label: "PPD", dueDate: s.ppd_next_due_date, status: "overdue" });
      }
      if (emp.is_kitchen_staff) {
        if (!s?.stool_urine_status) {
          rows.push({ employee: emp, label: "Stool & Urine Test", dueDate: null, status: "missing" });
        } else if (s.stool_urine_next_due_date && s.stool_urine_next_due_date < today) {
          rows.push({ employee: emp, label: "Stool & Urine Test", dueDate: s.stool_urine_next_due_date, status: "overdue" });
        }
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

  async function removeEmployee(emp) {
    if (!confirm(`Delete "${emp.name}" and their health records?`)) return;
    await supabase.from("employees").delete().eq("id", emp.id);
    if (selectedEmployeeId === emp.id) setSelectedEmployeeId("");
    loadAll();
  }

  async function saveClinicStatus() {
    if (!selectedEmployee) return;
    const payload = {
      employee_id: selectedEmployee.id,
      investigation_status: clinicForm.investigation_status,
      ppd_status: clinicForm.ppd_status || null,
      ppd_test_date: clinicForm.ppd_test_date || null,
      ppd_next_due_date: clinicForm.ppd_next_due_date || null,
      stool_urine_status: clinicForm.stool_urine_status || null,
      stool_urine_test_date: clinicForm.stool_urine_test_date || null,
      stool_urine_next_due_date: clinicForm.stool_urine_next_due_date || null,
      icn_remarks: clinicForm.icn_remarks,
      updated_by: session?.username,
      updated_at: new Date().toISOString(),
    };
    await supabase.from("employee_clinic_status").upsert(payload, { onConflict: "employee_id" });
    loadAll();
    flash({ type: "success", text: "Clinic status saved" });
  }

  async function toggleVaccineRequest(item, checked) {
    if (!selectedEmployee) return;
    if (checked) {
      await supabase
        .from("employee_vaccine_requests")
        .insert({ employee_id: selectedEmployee.id, item_type_id: item.id, requested_by: session?.username });
    } else {
      await supabase
        .from("employee_vaccine_requests")
        .delete()
        .eq("employee_id", selectedEmployee.id)
        .eq("item_type_id", item.id);
    }
    loadAll();
  }

  async function logDose(item, doseNumber) {
    if (!selectedEmployee) return;
    const input = doseInputs[item.id] || {};
    const dateGiven = input.date || todayStr();
    const batchNo = (input.batch || "").trim();
    const existing = records
      .filter((r) => r.employee_id === selectedEmployee.id && r.item_type_id === item.id)
      .sort((a, b) => a.dose_number - b.dose_number);
    const dose1Date = doseNumber === 1 ? dateGiven : existing.find((r) => r.dose_number === 1)?.date_given;
    const schedule = item.dose_schedule?.length ? item.dose_schedule : [0];
    let next_due_date = null;
    if (doseNumber < schedule.length) {
      next_due_date = addMonths(dose1Date, schedule[doseNumber]);
    } else if (item.recurrence_months) {
      next_due_date = addMonths(dateGiven, item.recurrence_months);
    }
    const { error } = await supabase.from("employee_health_records").insert({
      employee_id: selectedEmployee.id,
      item_type_id: item.id,
      item_name: item.name,
      dose_number: doseNumber,
      batch_no: batchNo,
      date_given: dateGiven,
      next_due_date,
      recorded_by: session?.username,
    });
    if (error) {
      flash({ type: "error", text: "Could not save dose: " + error.message });
      return;
    }
    setDoseInputs((prev) => ({ ...prev, [item.id]: {} }));
    loadAll();
    flash({ type: "success", text: `${item.name} — dose ${doseNumber} logged` });
  }

  const REPORT_HEADERS = ["Date", "Employee", "Employee No", "Department", "Vaccine", "Dose #", "Batch No", "Next Due", "Recorded By"];
  function toReportRow(r) {
    const emp = employees.find((e) => e.id === r.employee_id);
    return [r.date_given, emp?.name || "", emp?.employee_no || "", emp?.department || "", r.item_name, r.dose_number, r.batch_no, r.next_due_date || "", r.recorded_by];
  }

  const EMP_HEADERS = ["Employee No", "Name", "File No", "Iqama No", "DOB", "Phone", "Department", "Kitchen Staff", "Active"];
  function toEmpRow(e) {
    return [e.employee_no, e.name, e.file_no, e.iqama_no, e.date_of_birth || "", e.phone, e.department, e.is_kitchen_staff ? "Yes" : "No", e.active ? "Yes" : "No"];
  }

  const CLINIC_HEADERS = [
    "Employee",
    "Department",
    "Investigation Status",
    "PPD Status",
    "PPD Test Date",
    "PPD Next Due",
    "Stool/Urine Status",
    "Stool/Urine Test Date",
    "Stool/Urine Next Due",
    "ICN Remarks",
  ];
  function toClinicRow(emp) {
    const s = statuses.find((x) => x.employee_id === emp.id);
    return [
      emp.name,
      emp.department,
      INVESTIGATION_STATUSES.find((o) => o.value === s?.investigation_status)?.label || "",
      s?.ppd_status || "",
      s?.ppd_test_date || "",
      s?.ppd_next_due_date || "",
      emp.is_kitchen_staff ? s?.stool_urine_status || "" : "",
      emp.is_kitchen_staff ? s?.stool_urine_test_date || "" : "",
      emp.is_kitchen_staff ? s?.stool_urine_next_due_date || "" : "",
      s?.icn_remarks || "",
    ];
  }

  function exportExcel() {
    downloadExcel(`infection-control-employee-clinic-${todayStr()}`, [
      { name: "Employees", headers: EMP_HEADERS, rows: activeEmployees.map(toEmpRow) },
      { name: "Investigation & PPD", headers: CLINIC_HEADERS, rows: activeEmployees.map(toClinicRow) },
      { name: "Vaccination Log", headers: REPORT_HEADERS, rows: records.map(toReportRow) },
    ]);
  }

  function exportPdf() {
    downloadPdf(`infection-control-employee-clinic-${todayStr()}`, "Infection Control — Employee Clinic", [
      { title: "Employees", headers: EMP_HEADERS, rows: activeEmployees.map(toEmpRow) },
      { title: "Investigation & PPD", headers: CLINIC_HEADERS, rows: activeEmployees.map(toClinicRow) },
      { title: "Vaccination Log", headers: REPORT_HEADERS, rows: records.map(toReportRow) },
    ]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Employee Health</h1>
        <p className="text-sm text-slate-500">Employee Clinic — investigations, PPD, and vaccinations by dose, matching the clinic's tracking sheet.</p>
      </div>

      <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1 font-medium ${tab === t.key ? "bg-teal-600 text-white" : "text-slate-500"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {message && (
        <p className={`rounded-lg px-3 py-2 text-sm ${message.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
          {message.text}
        </p>
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
                      <span
                        className={`flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.status === "overdue" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {row.status === "overdue" ? "Overdue" : "Missing"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && complianceRows.length === 0 && (
              <p className="p-6 text-center text-sm text-slate-400">Everyone is up to date 🎉</p>
            )}
            {loading && <p className="p-6 text-center text-sm text-slate-400">Loading...</p>}
          </div>
        </div>
      )}

      {tab === "clinic" && (
        <div className="flex flex-col gap-4">
          <select className="input w-full sm:w-80" value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)}>
            <option value="">Select an employee</option>
            {activeEmployees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} — {e.department}
                {e.is_kitchen_staff ? " (Kitchen)" : ""}
              </option>
            ))}
          </select>

          {!selectedEmployee && (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400">
              Pick an employee above to view or update their clinic record.
            </p>
          )}

          {selectedEmployee && (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold text-slate-700">Investigation &amp; PPD</h2>
                <p className="mb-3 text-xs text-slate-500">Investigations covered: {INVESTIGATION_TESTS}</p>
                <div className="mb-4 flex flex-col gap-2">
                  {INVESTIGATION_STATUSES.map((o) => (
                    <label key={o.value} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="investigation_status"
                        checked={clinicForm.investigation_status === o.value}
                        onChange={() => setClinicForm({ ...clinicForm, investigation_status: o.value })}
                      />
                      {o.label}
                    </label>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="PPD Status">
                    <select className="input" value={clinicForm.ppd_status} onChange={(e) => setClinicForm({ ...clinicForm, ppd_status: e.target.value })}>
                      <option value="">—</option>
                      <option value="done">Done</option>
                      <option value="refused">Refused</option>
                    </select>
                  </Field>
                  <Field label="PPD Test Date">
                    <input
                      type="date"
                      className="input"
                      value={clinicForm.ppd_test_date}
                      onChange={(e) =>
                        setClinicForm({
                          ...clinicForm,
                          ppd_test_date: e.target.value,
                          ppd_next_due_date: e.target.value ? addMonths(e.target.value, 12) : "",
                        })
                      }
                    />
                  </Field>
                  <Field label="PPD Next Due">
                    <input type="date" className="input" value={clinicForm.ppd_next_due_date} onChange={(e) => setClinicForm({ ...clinicForm, ppd_next_due_date: e.target.value })} />
                  </Field>
                </div>

                {selectedEmployee.is_kitchen_staff && (
                  <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl bg-amber-50/50 p-3 sm:grid-cols-3">
                    <Field label="Stool & Urine Test Status">
                      <select
                        className="input"
                        value={clinicForm.stool_urine_status}
                        onChange={(e) => setClinicForm({ ...clinicForm, stool_urine_status: e.target.value })}
                      >
                        <option value="">—</option>
                        <option value="done">Done</option>
                        <option value="refused">Refused</option>
                      </select>
                    </Field>
                    <Field label="Test Date">
                      <input
                        type="date"
                        className="input"
                        value={clinicForm.stool_urine_test_date}
                        onChange={(e) =>
                          setClinicForm({
                            ...clinicForm,
                            stool_urine_test_date: e.target.value,
                            stool_urine_next_due_date: e.target.value ? addMonths(e.target.value, 6) : "",
                          })
                        }
                      />
                    </Field>
                    <Field label="Next Due">
                      <input
                        type="date"
                        className="input"
                        value={clinicForm.stool_urine_next_due_date}
                        onChange={(e) => setClinicForm({ ...clinicForm, stool_urine_next_due_date: e.target.value })}
                      />
                    </Field>
                  </div>
                )}

                <div className="mt-4">
                  <Field label="ICN Remarks / Notes">
                    <textarea
                      className="input min-h-[70px]"
                      value={clinicForm.icn_remarks}
                      onChange={(e) => setClinicForm({ ...clinicForm, icn_remarks: e.target.value })}
                    />
                  </Field>
                </div>

                <button onClick={saveClinicStatus} className="mt-4 flex items-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
                  <Save className="h-4 w-4" />
                  Save
                </button>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold text-slate-700">Vaccinations</h2>
                <div className="flex flex-col gap-4">
                  {visibleItemTypes.map((item) => {
                    const requested = requests.some((r) => r.employee_id === selectedEmployee.id && r.item_type_id === item.id);
                    const state = doseState(selectedEmployee.id, item);
                    const input = doseInputs[item.id] || {};
                    return (
                      <div key={item.id} className="rounded-xl border border-slate-100 p-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                          <input type="checkbox" checked={requested} onChange={(e) => toggleVaccineRequest(item, e.target.checked)} />
                          {item.name}
                          {item.kitchen_only && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">Kitchen only</span>}
                        </label>

                        {requested && (
                          <div className="mt-2 flex flex-col gap-2 pl-6">
                            <div className="flex flex-wrap gap-2">
                              {state.recs.map((r) => (
                                <span key={r.id} className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                                  <Syringe className="h-3 w-3" />
                                  Dose {r.dose_number}: {r.date_given}
                                  {r.batch_no ? ` (batch ${r.batch_no})` : ""}
                                </span>
                              ))}
                              {state.complete && !state.renewalDue && <span className="text-xs font-medium text-emerald-600">Complete ✓</span>}
                            </div>

                            {state.nextDoseNumber && (
                              <div className="flex flex-wrap items-end gap-2">
                                <Field label={`Dose ${state.nextDoseNumber} Date${state.nextDueDate ? ` (due ${state.nextDueDate})` : ""}`}>
                                  <input
                                    type="date"
                                    className="input"
                                    value={input.date || todayStr()}
                                    onChange={(e) => setDoseInputs((prev) => ({ ...prev, [item.id]: { ...prev[item.id], date: e.target.value } }))}
                                  />
                                </Field>
                                <Field label="Batch No">
                                  <input
                                    className="input"
                                    value={input.batch || ""}
                                    onChange={(e) => setDoseInputs((prev) => ({ ...prev, [item.id]: { ...prev[item.id], batch: e.target.value } }))}
                                  />
                                </Field>
                                <button
                                  onClick={() => logDose(item, state.nextDoseNumber)}
                                  className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700"
                                >
                                  <Syringe className="h-3.5 w-3.5" />
                                  {state.renewalDue ? "Log renewal dose" : `Log dose ${state.nextDoseNumber}`}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </div>
      )}

      {tab === "records" && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end gap-2">
            <button
              onClick={exportExcel}
              disabled={employees.length === 0}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Export Excel
            </button>
            <button
              onClick={exportPdf}
              disabled={employees.length === 0}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <FileText className="h-3.5 w-3.5" />
              Export PDF
            </button>
          </div>
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
            <input
              type="date"
              className="input"
              value={employeeForm.date_of_birth}
              onChange={(e) => setEmployeeForm({ ...employeeForm, date_of_birth: e.target.value })}
              placeholder="Date of birth"
            />
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
