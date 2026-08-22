import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileSpreadsheet, FileText, Plus, Save, Trash2, UserPlus } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
import { downloadExcel } from "../../lib/exportExcel";
import { downloadPdf } from "../../lib/exportPdf";

const TABS = [
  { key: "compliance", label: "Overdue & Missing" },
  { key: "log", label: "Log Record" },
  { key: "records", label: "All Records" },
  { key: "employees", label: "Employees" },
];

function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

const todayStr = () => new Date().toISOString().slice(0, 10);

const emptyRecordForm = { employee_id: "", item_type_id: "", date_given: todayStr(), result: "", notes: "" };
const emptyEmployeeForm = { employee_no: "", name: "", department: "", job_title: "" };

export default function EmployeeHealth() {
  const { session, config } = useAuth();
  const [tab, setTab] = useState("compliance");
  const [employees, setEmployees] = useState([]);
  const [itemTypes, setItemTypes] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recordForm, setRecordForm] = useState(emptyRecordForm);
  const [employeeForm, setEmployeeForm] = useState(emptyEmployeeForm);
  const [message, setMessage] = useState(null);
  const [filterDept, setFilterDept] = useState("");

  const departments = config?.employee_departments ?? [];

  async function loadAll() {
    setLoading(true);
    const [{ data: emp }, { data: types }, { data: recs }] = await Promise.all([
      supabase.from("employees").select("*").order("name"),
      supabase.from("health_item_types").select("*").order("sort_order"),
      supabase.from("employee_health_records").select("*").order("date_given", { ascending: false }),
    ]);
    setEmployees(emp ?? []);
    setItemTypes(types ?? []);
    setRecords(recs ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  function flash(msg) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }

  const activeEmployees = useMemo(() => employees.filter((e) => e.active), [employees]);
  const activeItemTypes = useMemo(() => itemTypes.filter((t) => t.active), [itemTypes]);

  // For every active employee x active item type, find the latest record
  // and derive its status: missing / compliant / overdue.
  const complianceRows = useMemo(() => {
    const today = todayStr();
    const rows = [];
    for (const emp of activeEmployees) {
      if (filterDept && emp.department !== filterDept) continue;
      for (const type of activeItemTypes) {
        const matches = records.filter((r) => r.employee_id === emp.id && r.item_type_id === type.id);
        const latest = matches.sort((a, b) => (a.date_given < b.date_given ? 1 : -1))[0];
        let status = "missing";
        let dueDate = null;
        if (latest) {
          if (!type.recurrence_months) {
            status = "compliant";
          } else {
            dueDate = addMonths(latest.date_given, type.recurrence_months);
            status = dueDate < today ? "overdue" : "compliant";
          }
        }
        if (status !== "compliant") {
          rows.push({ employee: emp, type, latest, dueDate, status });
        }
      }
    }
    return rows.sort((a, b) => (a.status === b.status ? a.employee.name.localeCompare(b.employee.name) : a.status === "overdue" ? -1 : 1));
  }, [activeEmployees, activeItemTypes, records, filterDept]);

  async function handleLogRecord(e) {
    e.preventDefault();
    const emp = employees.find((x) => x.id === recordForm.employee_id);
    const type = itemTypes.find((x) => x.id === recordForm.item_type_id);
    if (!emp || !type) {
      flash({ type: "error", text: "Select an employee and an item" });
      return;
    }
    const next_due_date = type.recurrence_months ? addMonths(recordForm.date_given, type.recurrence_months) : null;
    const { error } = await supabase.from("employee_health_records").insert({
      employee_id: emp.id,
      item_type_id: type.id,
      item_name: type.name,
      date_given: recordForm.date_given,
      result: recordForm.result,
      next_due_date,
      notes: recordForm.notes,
      recorded_by: session?.username,
    });
    if (error) {
      flash({ type: "error", text: "Could not save: " + error.message });
    } else {
      flash({ type: "success", text: "Record saved" });
      setRecordForm({ ...emptyRecordForm, employee_id: emp.id });
      loadAll();
    }
  }

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
      .update({ employee_no: emp.employee_no, name: emp.name, department: emp.department, job_title: emp.job_title, active: emp.active })
      .eq("id", emp.id);
    flash({ type: "success", text: `${emp.name} saved` });
  }

  async function removeEmployee(emp) {
    if (!confirm(`Delete "${emp.name}" and their health records?`)) return;
    await supabase.from("employees").delete().eq("id", emp.id);
    loadAll();
  }

  const REPORT_HEADERS = ["Date", "Employee", "Employee No", "Department", "Item", "Result", "Next Due", "Notes", "Recorded By"];
  function toReportRow(r) {
    const emp = employees.find((e) => e.id === r.employee_id);
    return [r.date_given, emp?.name || "", emp?.employee_no || "", emp?.department || "", r.item_name, r.result, r.next_due_date || "", r.notes, r.recorded_by];
  }

  function exportExcel() {
    downloadExcel(`infection-control-employee-health-${todayStr()}`, [
      { name: "Records", headers: REPORT_HEADERS, rows: records.map(toReportRow) },
    ]);
  }

  function exportPdf() {
    downloadPdf(`infection-control-employee-health-${todayStr()}`, "Infection Control — Employee Health Records", [
      { headers: REPORT_HEADERS, rows: records.map(toReportRow) },
    ]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Employee Health</h1>
        <p className="text-sm text-slate-500">Staff vaccinations and periodic screenings — who's due, overdue, or missing.</p>
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
                  <th className="px-4 py-2 font-medium">Last Done</th>
                  <th className="px-4 py-2 font-medium">Due Date</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {complianceRows.map((row, idx) => (
                  <tr key={idx} className="border-t border-slate-100">
                    <td className="px-4 py-2">{row.employee.name}</td>
                    <td className="px-4 py-2">{row.employee.department}</td>
                    <td className="px-4 py-2">{row.type.name}</td>
                    <td className="px-4 py-2">{row.latest ? row.latest.date_given : "—"}</td>
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

      {tab === "log" && (
        <form onSubmit={handleLogRecord} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Employee">
              <select className="input" value={recordForm.employee_id} onChange={(e) => setRecordForm({ ...recordForm, employee_id: e.target.value })} required>
                <option value="">Select employee</option>
                {activeEmployees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} — {e.department}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Vaccine / Screening">
              <select className="input" value={recordForm.item_type_id} onChange={(e) => setRecordForm({ ...recordForm, item_type_id: e.target.value })} required>
                <option value="">Select item</option>
                {activeItemTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date Given">
              <input type="date" className="input" value={recordForm.date_given} onChange={(e) => setRecordForm({ ...recordForm, date_given: e.target.value })} required />
            </Field>
            <Field label="Result (for screenings)">
              <input className="input" value={recordForm.result} onChange={(e) => setRecordForm({ ...recordForm, result: e.target.value })} placeholder="e.g. Negative" />
            </Field>
          </div>
          <Field label="Notes (optional)">
            <input className="input" value={recordForm.notes} onChange={(e) => setRecordForm({ ...recordForm, notes: e.target.value })} />
          </Field>
          <button type="submit" className="flex items-center gap-1 self-start rounded-lg bg-teal-600 px-6 py-2 text-sm font-semibold text-white hover:bg-teal-700">
            <Plus className="h-4 w-4" />
            Save Record
          </button>
        </form>
      )}

      {tab === "records" && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end gap-2">
            <button
              onClick={exportExcel}
              disabled={records.length === 0}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Export Excel
            </button>
            <button
              onClick={exportPdf}
              disabled={records.length === 0}
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
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 font-medium">Result</th>
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
                      <td className="px-4 py-2">{r.result || "—"}</td>
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
              <div key={emp.id} className="grid grid-cols-1 gap-2 rounded-xl border border-slate-100 bg-white p-4 sm:grid-cols-6 sm:items-center">
                <input className="input sm:col-span-1" value={emp.employee_no} onChange={(e) => updateEmployeeField(emp.id, { employee_no: e.target.value })} placeholder="Employee #" />
                <input className="input sm:col-span-2" value={emp.name} onChange={(e) => updateEmployeeField(emp.id, { name: e.target.value })} placeholder="Name" />
                <select className="input sm:col-span-1" value={emp.department} onChange={(e) => updateEmployeeField(emp.id, { department: e.target.value })}>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <input className="input sm:col-span-1" value={emp.job_title} onChange={(e) => updateEmployeeField(emp.id, { job_title: e.target.value })} placeholder="Job title" />
                <div className="flex items-center justify-end gap-2 sm:col-span-1">
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

          <form onSubmit={handleAddEmployee} className="grid grid-cols-1 gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 sm:grid-cols-5 sm:items-center">
            <input
              className="input"
              value={employeeForm.employee_no}
              onChange={(e) => setEmployeeForm({ ...employeeForm, employee_no: e.target.value })}
              placeholder="Employee #"
            />
            <input
              className="input"
              value={employeeForm.name}
              onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })}
              placeholder="Name"
              required
            />
            <select className="input" value={employeeForm.department} onChange={(e) => setEmployeeForm({ ...employeeForm, department: e.target.value })} required>
              <option value="">Department</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <input
              className="input"
              value={employeeForm.job_title}
              onChange={(e) => setEmployeeForm({ ...employeeForm, job_title: e.target.value })}
              placeholder="Job title"
            />
            <button type="submit" className="flex items-center justify-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
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
