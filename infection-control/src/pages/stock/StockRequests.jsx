import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, FileSpreadsheet, FileText, Plus, X } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
import { downloadExcel } from "../../lib/exportExcel";
import { downloadPdf } from "../../lib/exportPdf";

const REPORT_HEADERS = ["Date", "Department", "Item", "Requested", "Issued", "Status", "Requested By", "Issued By", "Notes"];

function toReportRow(r) {
  return [
    r.date,
    r.department,
    r.item_name,
    r.quantity_requested,
    r.quantity_issued ?? "",
    r.status,
    r.requested_by,
    r.issued_by || "",
    r.notes,
  ];
}

const STATUS_STYLES = {
  pending: "bg-amber-50 text-amber-700",
  issued: "bg-emerald-50 text-emerald-700",
  partial: "bg-blue-50 text-blue-700",
  cancelled: "bg-slate-100 text-slate-500",
};

const emptyForm = { department: "", item_id: "", quantity_requested: "", notes: "" };

export default function StockRequests() {
  const { session, config, isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState(null);
  const [filterDept, setFilterDept] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [issuingId, setIssuingId] = useState(null);
  const [issueQty, setIssueQty] = useState("");

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
    } else {
      if (filterDept) query = query.eq("department", filterDept);
      if (filterStatus) query = query.eq("status", filterStatus);
    }
    const { data } = await query;
    setRequests(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, myDepartment, filterDept, filterStatus]);

  const lowStock = useMemo(() => items.filter((i) => i.current_qty < i.min_qty), [items]);

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

    const { error } = await supabase.from("stock_requests").insert({
      department,
      item_id: item.id,
      item_name: item.name,
      unit: item.unit,
      quantity_requested: qty,
      notes: form.notes,
      requested_by: session?.username,
    });
    if (error) {
      flash({ type: "error", text: "Could not submit: " + error.message });
    } else {
      flash({ type: "success", text: "Request submitted" });
      setForm(emptyForm);
      loadRequests();
    }
  }

  async function issueRequest(req) {
    const qty = Number(issueQty || req.quantity_requested);
    if (!qty || qty <= 0) return;
    const status = qty >= req.quantity_requested ? "issued" : "partial";
    await supabase
      .from("stock_requests")
      .update({ quantity_issued: qty, status, issued_by: session?.username, issued_at: new Date().toISOString() })
      .eq("id", req.id);

    const item = items.find((i) => i.id === req.item_id);
    if (item) {
      await supabase
        .from("stock_items")
        .update({ current_qty: Math.max(0, item.current_qty - qty) })
        .eq("id", item.id);
    }

    setIssuingId(null);
    setIssueQty("");
    loadRequests();
    loadItems();
  }

  async function cancelRequest(req) {
    if (!confirm("Cancel this request?")) return;
    await supabase.from("stock_requests").update({ status: "cancelled" }).eq("id", req.id);
    loadRequests();
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
              ? "Supply requests from all departments, fulfilled from Infection Control's own stock."
              : `Request supplies for ${myDepartment || "your department"} from Infection Control.`}
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
            {lowStock.map((i) => (
              <span key={i.id} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-amber-700">
                {i.name}: {i.current_qty} {i.unit} (min {i.min_qty})
              </span>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">New Request</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          {isAdmin ? (
            <Field label="Department">
              <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="input" required>
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
            <select value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })} className="input" required>
              <option value="">Select item</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity">
            <input
              type="number"
              min="1"
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
          Submit Request
        </button>
      </form>

      {isAdmin && (
        <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
          <select className="input" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="issued">Issued</option>
            <option value="partial">Partial</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              {isAdmin && <th className="px-4 py-2 font-medium">Department</th>}
              <th className="px-4 py-2 font-medium">Item</th>
              <th className="px-4 py-2 font-medium">Requested</th>
              <th className="px-4 py-2 font-medium">Issued</th>
              <th className="px-4 py-2 font-medium">Status</th>
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
                  {r.quantity_requested} {r.unit}
                </td>
                <td className="px-4 py-2">{r.quantity_issued != null ? `${r.quantity_issued} ${r.unit}` : "—"}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status] || "bg-slate-100 text-slate-500"}`}>
                    {r.status}
                  </span>
                </td>
                {isAdmin && (
                  <td className="px-4 py-2">
                    {r.status === "pending" &&
                      (issuingId === r.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="1"
                            className="input w-20 py-1"
                            placeholder={String(r.quantity_requested)}
                            value={issueQty}
                            onChange={(e) => setIssueQty(e.target.value)}
                            autoFocus
                          />
                          <button onClick={() => issueRequest(r)} className="rounded-lg p-1.5 text-teal-600 hover:bg-teal-50">
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              setIssuingId(null);
                              setIssueQty("");
                            }}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setIssuingId(r.id);
                              setIssueQty(String(r.quantity_requested));
                            }}
                            className="rounded-lg px-2 py-1 text-xs text-teal-600 hover:bg-teal-50"
                          >
                            Issue
                          </button>
                          <button onClick={() => cancelRequest(r)} className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600">
                            Cancel
                          </button>
                        </div>
                      ))}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && requests.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No requests yet</p>}
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
