import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileSpreadsheet, FileText, Plus } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
import { downloadExcel } from "../../lib/exportExcel";
import { downloadPdf } from "../../lib/exportPdf";

const REPORT_HEADERS = ["Date", "Department", "Item", "Quantity Used", "Used By", "Notes"];

function toReportRow(r) {
  return [r.date, r.department, r.item_name, r.quantity_issued ?? r.quantity_requested, r.issued_by || r.requested_by, r.notes];
}

const emptyForm = { department: "", item_id: "", quantity_requested: "", notes: "" };

export default function StockRequests() {
  const { session, config, isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState(null);
  const [filterDepts, setFilterDepts] = useState([]);

  const myDepartment = session?.department || "";
  const departments = config?.stock_departments ?? [];

  function loadItems() {
    supabase
      .from("stock_items")
      .select("*")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => setItems(data ?? []));
  }

  useEffect(() => {
    loadItems();
  }, []);

  async function loadRequests() {
    setLoading(true);
    let query = supabase.from("stock_requests").select("*").order("created_at", { ascending: false }).limit(200);
    if (!isAdmin) {
      query = query.eq("department", myDepartment);
    } else if (filterDepts.length > 0) {
      query = query.in("department", filterDepts);
    }
    const { data } = await query;
    setRequests(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, myDepartment, filterDepts]);

  function toggleFilterDept(dept) {
    setFilterDepts((prev) => (prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]));
  }

  const lowStock = useMemo(() => items.filter((i) => i.current_qty < i.min_qty), [items]);
  const activeDepartment = isAdmin ? form.department : myDepartment;
  const departmentItems = useMemo(
    () => items.filter((i) => i.department === activeDepartment),
    [items, activeDepartment]
  );
  const selectedItem = useMemo(() => items.find((i) => i.id === form.item_id) ?? null, [items, form.item_id]);

  function flash(msg) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const department = isAdmin ? form.department : myDepartment;
    if (!department) {
      flash({ type: "error", text: "Select a department" });
      return;
    }
    const item = items.find((i) => i.id === form.item_id);
    if (!item) {
      flash({ type: "error", text: "Select an item" });
      return;
    }
    const qty = Number(form.quantity_requested);
    if (!qty || qty <= 0) {
      flash({ type: "error", text: "Enter a valid quantity" });
      return;
    }
    if (qty > item.current_qty) {
      flash({ type: "error", text: `Only ${item.current_qty} ${item.unit} available` });
      return;
    }

    const { error } = await supabase.from("stock_requests").insert({
      department,
      item_id: item.id,
      item_name: item.name,
      unit: item.unit,
      quantity_requested: qty,
      quantity_issued: qty,
      status: "issued",
      notes: form.notes,
      requested_by: session?.username,
      issued_by: session?.username,
      issued_at: new Date().toISOString(),
    });
    if (error) {
      flash({ type: "error", text: "Could not save: " + error.message });
      return;
    }

    await supabase
      .from("stock_items")
      .update({ current_qty: Math.max(0, item.current_qty - qty) })
      .eq("id", item.id);

    flash({ type: "success", text: `Used ${qty} ${item.unit} of ${item.name}` });
    setForm(emptyForm);
    loadRequests();
    loadItems();
  }

  async function voidRequest(req) {
    if (!confirm(`Void this entry and put ${req.quantity_issued ?? req.quantity_requested} ${req.unit} back in stock?`)) return;
    const item = items.find((i) => i.id === req.item_id);
    if (item) {
      await supabase
        .from("stock_items")
        .update({ current_qty: item.current_qty + (req.quantity_issued ?? req.quantity_requested) })
        .eq("id", item.id);
    }
    await supabase.from("stock_requests").delete().eq("id", req.id);
    loadRequests();
    loadItems();
  }

  function exportExcel() {
    downloadExcel(`infection-control-stock-requests-${new Date().toISOString().slice(0, 10)}`, [
      { name: "Stock Requests", headers: REPORT_HEADERS, rows: requests.map(toReportRow) },
    ]);
  }

  function exportPdf() {
    downloadPdf(
      `infection-control-stock-requests-${new Date().toISOString().slice(0, 10)}`,
      "Infection Control — Stock Requests",
      [{ headers: REPORT_HEADERS, rows: requests.map(toReportRow) }]
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Stock Requests</h1>
          <p className="text-sm text-slate-500">
            {isAdmin
              ? "Supply usage across every department's own stock catalog, tracked in real time."
              : `Log supplies used from ${myDepartment || "your department"}'s own stock.`}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button
              onClick={exportExcel}
              disabled={requests.length === 0}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Export Excel
            </button>
            <button
              onClick={exportPdf}
              disabled={requests.length === 0}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <FileText className="h-3.5 w-3.5" />
              Export PDF
            </button>
          </div>
        )}
      </div>

      {isAdmin && lowStock.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            Low stock — below minimum
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStock.slice(0, 30).map((i) => (
              <span key={i.id} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-amber-700">
                {i.department} — {i.name}: {i.current_qty} {i.unit} (min {i.min_qty})
              </span>
            ))}
          </div>
          {lowStock.length > 30 && (
            <p className="text-xs text-amber-700">+{lowStock.length - 30} more low on stock — filter the department report above to see all.</p>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Use Stock</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          {isAdmin ? (
            <Field label="Department">
              <select
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value, item_id: "" })}
                className="input"
                required
              >
                <option value="">Select department</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Department">
              <input className="input bg-slate-50" value={myDepartment} disabled readOnly />
            </Field>
          )}
          <Field label="Item">
            <select
              value={form.item_id}
              onChange={(e) => setForm({ ...form, item_id: e.target.value })}
              className="input"
              required
              disabled={!activeDepartment}
            >
              <option value="">{activeDepartment ? "Select item" : "Select a department first"}</option>
              {departmentItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} — {i.current_qty > 0 ? `${i.current_qty} ${i.unit} available` : "Out of stock"}
                </option>
              ))}
            </select>
            {activeDepartment && departmentItems.length === 0 && (
              <span className="text-xs text-slate-400">No items set up yet for {activeDepartment}</span>
            )}
            {selectedItem && (
              <span
                className={`text-xs font-medium ${
                  selectedItem.current_qty <= 0
                    ? "text-red-600"
                    : selectedItem.current_qty < selectedItem.min_qty
                    ? "text-amber-600"
                    : "text-emerald-600"
                }`}
              >
                {selectedItem.current_qty <= 0
                  ? "N/A — out of stock"
                  : `Available: ${selectedItem.current_qty} ${selectedItem.unit}`}
              </span>
            )}
          </Field>
          <Field label="Quantity">
            <input
              type="number"
              min="1"
              max={selectedItem ? selectedItem.current_qty : undefined}
              className="input"
              value={form.quantity_requested}
              onChange={(e) => setForm({ ...form, quantity_requested: e.target.value })}
              required
            />
          </Field>
          <Field label="Notes (optional)">
            <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>

        {message && (
          <p className={`rounded-lg px-3 py-2 text-sm ${message.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
            {message.text}
          </p>
        )}

        <button
          type="submit"
          className="flex items-center gap-1 self-start rounded-lg bg-teal-600 px-6 py-2 text-sm font-semibold text-white hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" />
          Use
        </button>
      </form>

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4">
          <span className="text-xs font-medium text-slate-500">Departments in report:</span>
          <button
            type="button"
            onClick={() => setFilterDepts([])}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              filterDepts.length === 0 ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-500"
            }`}
          >
            All
          </button>
          {departments.map((d) => (
            <button
              type="button"
              key={d}
              onClick={() => toggleFilterDept(d)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                filterDepts.includes(d) ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-500"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              {isAdmin && <th className="px-4 py-2 font-medium">Department</th>}
              <th className="px-4 py-2 font-medium">Item</th>
              <th className="px-4 py-2 font-medium">Quantity Used</th>
              <th className="px-4 py-2 font-medium">Used By</th>
              {isAdmin && <th className="px-4 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{r.date}</td>
                {isAdmin && <td className="px-4 py-2">{r.department}</td>}
                <td className="px-4 py-2">{r.item_name}</td>
                <td className="px-4 py-2">
                  {r.quantity_issued ?? r.quantity_requested} {r.unit}
                </td>
                <td className="px-4 py-2">{r.issued_by || r.requested_by}</td>
                {isAdmin && (
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => voidRequest(r)} className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600">
                      Void
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && requests.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No usage recorded yet</p>}
        {loading && <p className="p-6 text-center text-sm text-slate-400">Loading...</p>}
      </div>
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
