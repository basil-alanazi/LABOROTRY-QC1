import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, FileText, Check, Plus, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
import { downloadExcel } from "../../lib/exportExcel";
import { downloadPdf } from "../../lib/exportPdf";
import { fetchAllRows } from "../../lib/fetchAll";

const REPORT_HEADERS = ["Date", "Department", "Item", "Quantity Used", "Used By", "Notes"];

function toReportRow(r) {
  return [r.date, r.department, r.item_name, r.quantity_issued ?? r.quantity_requested, r.issued_by || r.requested_by, r.notes];
}

export default function StockRequests() {
  const { session, config, isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDept, setSelectedDept] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [qtyInputs, setQtyInputs] = useState({});
  const [addQtyInputs, setAddQtyInputs] = useState({});
  const [message, setMessage] = useState(null);
  const [filterDepts, setFilterDepts] = useState([]);
  const [newItem, setNewItem] = useState({ name: "", min_qty: "", max_qty: "", current_qty: "" });

  const myDepartment = session?.department || "";
  const departments = config?.stock_departments ?? [];
  const canManage = isAdmin || !!session?.canManageStock;

  async function loadItems() {
    const { data } = await fetchAllRows((from, to) =>
      supabase.from("stock_items").select("*").eq("active", true).order("sort_order").range(from, to)
    );
    setItems(data ?? []);
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

  const activeDepartment = isAdmin ? selectedDept : myDepartment;
  const departmentItems = useMemo(
    () =>
      items
        .filter((i) => i.department === activeDepartment)
        .filter((i) => !itemSearch.trim() || i.name.toLowerCase().includes(itemSearch.trim().toLowerCase())),
    [items, activeDepartment, itemSearch]
  );

  function flash(msg) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }

  function setQty(itemId, value) {
    setQtyInputs((prev) => ({ ...prev, [itemId]: value }));
  }

  function setAddQty(itemId, value) {
    setAddQtyInputs((prev) => ({ ...prev, [itemId]: value }));
  }

  function updateItemField(itemId, patch) {
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i)));
  }

  async function saveMinMax(item) {
    await supabase
      .from("stock_items")
      .update({ min_qty: Number(item.min_qty) || 0, max_qty: Number(item.max_qty) || 0 })
      .eq("id", item.id);
    flash({ type: "success", text: `${item.name} updated` });
  }

  async function addQtyToItem(item) {
    const qty = Number(addQtyInputs[item.id]);
    if (!qty || qty <= 0) {
      flash({ type: "error", text: "Enter a valid quantity" });
      return;
    }
    const nextQty = item.current_qty + qty;
    await supabase.from("stock_items").update({ current_qty: nextQty }).eq("id", item.id);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, current_qty: nextQty } : i)));
    setAddQty(item.id, "");
    flash({ type: "success", text: `Added ${qty} ${item.unit} to ${item.name}` });
  }

  async function useItem(item) {
    const qty = Number(qtyInputs[item.id]);
    if (!qty || qty <= 0) {
      flash({ type: "error", text: "Enter a valid quantity" });
      return;
    }
    if (qty > item.current_qty) {
      flash({ type: "error", text: `Only ${item.current_qty} ${item.unit} available` });
      return;
    }

    const { error } = await supabase.from("stock_requests").insert({
      department: activeDepartment,
      item_id: item.id,
      item_name: item.name,
      unit: item.unit,
      quantity_requested: qty,
      quantity_issued: qty,
      status: "issued",
      notes: "",
      requested_by: session?.username,
      issued_by: session?.username,
      issued_at: new Date().toISOString(),
    });
    if (error) {
      flash({ type: "error", text: "Could not save: " + error.message });
      return;
    }

    const nextQty = Math.max(0, item.current_qty - qty);
    await supabase.from("stock_items").update({ current_qty: nextQty }).eq("id", item.id);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, current_qty: nextQty } : i)));
    setQty(item.id, "");
    flash({ type: "success", text: `Used ${qty} ${item.unit} of ${item.name}` });
    loadRequests();
  }

  async function addNewItem() {
    const name = newItem.name.trim();
    if (!name) {
      flash({ type: "error", text: "Enter an item name" });
      return;
    }
    if (!activeDepartment) {
      flash({ type: "error", text: "Select a department first" });
      return;
    }
    const maxSort = items.filter((i) => i.department === activeDepartment).reduce((m, i) => Math.max(m, i.sort_order ?? 0), 0);
    const { error } = await supabase.from("stock_items").insert({
      department: activeDepartment,
      name,
      unit: "unit",
      min_qty: Number(newItem.min_qty) || 0,
      max_qty: Number(newItem.max_qty) || 0,
      current_qty: Number(newItem.current_qty) || 0,
      active: true,
      sort_order: maxSort + 1,
    });
    if (error) {
      flash({ type: "error", text: "Could not add item" });
      return;
    }
    setNewItem({ name: "", min_qty: "", max_qty: "", current_qty: "" });
    flash({ type: "success", text: `${name} added` });
    loadItems();
  }

  async function removeItem(item) {
    if (!confirm(`Remove "${item.name}" from ${item.department}'s stock catalog?`)) return;
    await supabase.from("stock_items").delete().eq("id", item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    flash({ type: "success", text: `${item.name} removed` });
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

      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Use Stock</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {isAdmin ? (
            <Field label="Department">
              <select
                value={selectedDept}
                onChange={(e) => {
                  setSelectedDept(e.target.value);
                  setItemSearch("");
                }}
                className="input"
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
          <Field label="Search items">
            <input
              className="input"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Type to filter..."
              disabled={!activeDepartment}
            />
          </Field>
        </div>

        {message && (
          <p className={`rounded-lg px-3 py-2 text-sm ${message.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
            {message.text}
          </p>
        )}

        {!activeDepartment && <p className="text-sm text-slate-400">Select a department to see its stock items.</p>}

        {activeDepartment && departmentItems.length === 0 && (
          <p className="text-sm text-slate-400">No items match — {items.filter((i) => i.department === activeDepartment).length} items total for {activeDepartment}.</p>
        )}

        {activeDepartment && departmentItems.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Item</th>
                  {canManage && (
                    <>
                      <th className="px-4 py-2 font-medium">Quantity to be Added</th>
                      <th className="px-4 py-2"></th>
                    </>
                  )}
                  <th className="px-4 py-2 font-medium">Current Stock</th>
                  {canManage && (
                    <>
                      <th className="px-4 py-2 font-medium">Min</th>
                      <th className="px-4 py-2 font-medium">Max</th>
                    </>
                  )}
                  <th className="px-4 py-2 font-medium">Quantity to Use</th>
                  <th className="px-4 py-2"></th>
                  {canManage && <th className="px-4 py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {departmentItems.map((i) => (
                  <tr key={i.id} className="border-t border-slate-100">
                    <td className="px-4 py-2">{i.name}</td>
                    {canManage && (
                      <>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min="1"
                            className="input w-24"
                            value={addQtyInputs[i.id] ?? ""}
                            onChange={(e) => setAddQty(i.id, e.target.value)}
                            placeholder="qty"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => addQtyToItem(i)}
                            disabled={!addQtyInputs[i.id]}
                            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add
                          </button>
                        </td>
                      </>
                    )}
                    <td className="px-4 py-2">
                      <span
                        className={`font-medium ${
                          i.current_qty <= 0 ? "text-red-600" : i.current_qty < i.min_qty ? "text-amber-600" : "text-emerald-600"
                        }`}
                      >
                        {i.current_qty} {i.unit}
                      </span>
                    </td>
                    {canManage && (
                      <>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            className="input w-16"
                            value={i.min_qty}
                            onChange={(e) => updateItemField(i.id, { min_qty: e.target.value })}
                            onBlur={() => saveMinMax(i)}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            className="input w-16"
                            value={i.max_qty}
                            onChange={(e) => updateItemField(i.id, { max_qty: e.target.value })}
                            onBlur={() => saveMinMax(i)}
                          />
                        </td>
                      </>
                    )}
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min="1"
                        max={i.current_qty}
                        className="input w-24"
                        value={qtyInputs[i.id] ?? ""}
                        onChange={(e) => setQty(i.id, e.target.value)}
                        disabled={i.current_qty <= 0}
                        placeholder="qty"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => useItem(i)}
                        disabled={i.current_qty <= 0 || !qtyInputs[i.id]}
                        className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-40"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Use
                      </button>
                    </td>
                    {canManage && (
                      <td className="px-4 py-2">
                        <button
                          onClick={() => removeItem(i)}
                          title="Remove this item"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canManage && activeDepartment && (
          <div className="grid grid-cols-1 gap-2 rounded-xl border border-dashed border-slate-300 p-4 sm:grid-cols-5 sm:items-center">
            <input
              className="input sm:col-span-2"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              placeholder="New item name"
            />
            <input
              type="number"
              className="input"
              value={newItem.min_qty}
              onChange={(e) => setNewItem({ ...newItem, min_qty: e.target.value })}
              placeholder="Min qty"
            />
            <input
              type="number"
              className="input"
              value={newItem.max_qty}
              onChange={(e) => setNewItem({ ...newItem, max_qty: e.target.value })}
              placeholder="Max qty"
            />
            <input
              type="number"
              className="input"
              value={newItem.current_qty}
              onChange={(e) => setNewItem({ ...newItem, current_qty: e.target.value })}
              placeholder="Current qty"
            />
            <button
              onClick={addNewItem}
              className="flex items-center justify-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 sm:col-span-5"
            >
              <Plus className="h-4 w-4" />
              Add New Item to {activeDepartment}
            </button>
          </div>
        )}
      </div>

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
