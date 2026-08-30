import { useEffect, useState } from "react";
import { Plus, Trash2, Save, UserPlus, KeyRound, PackagePlus, HeartPulse } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth.jsx";
import { sha256Hex } from "../lib/hash";
import { fetchAllRows } from "../lib/fetchAll";

const DEFAULT_PASSWORD = "123456";
const emptyNewUser = { username: "", display_name: "", role: "staff", department: "", can_manage_stock: false, can_view_employee_health: false };
const emptyNewStockItem = { department: "", name: "", unit: "unit", min_qty: "", max_qty: "", current_qty: "" };
const emptyNewHealthItem = { name: "", category: "vaccine", recurrence_months: "", dose_schedule: "0", kitchen_only: false };

function parseDoseSchedule(text) {
  const nums = (text || "0")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  return nums.length ? nums : [0];
}

export default function Settings() {
  const { config, reloadConfig, isOwner, session } = useAuth();
  const [stockDepartments, setStockDepartments] = useState([]);
  const [newStockDept, setNewStockDept] = useState("");
  const [stockItems, setStockItems] = useState([]);
  const [newStockItem, setNewStockItem] = useState(emptyNewStockItem);
  const [stockItemsFilterDept, setStockItemsFilterDept] = useState("");
  const [employeeDepartments, setEmployeeDepartments] = useState([]);
  const [newEmployeeDept, setNewEmployeeDept] = useState("");
  const [icRoundDepartments, setIcRoundDepartments] = useState([]);
  const [newIcRoundDept, setNewIcRoundDept] = useState("");
  const [cultureTrackerItems, setCultureTrackerItems] = useState([]);
  const [newCultureTrackerItem, setNewCultureTrackerItem] = useState("");
  const [agreementTrackerEntities, setAgreementTrackerEntities] = useState([]);
  const [newAgreementTrackerEntity, setNewAgreementTrackerEntity] = useState("");
  const [healthItemTypes, setHealthItemTypes] = useState([]);
  const [newHealthItem, setNewHealthItem] = useState(emptyNewHealthItem);
  const [diseaseTypes, setDiseaseTypes] = useState([]);
  const [newDisease, setNewDisease] = useState("");
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState(emptyNewUser);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (config) {
      setStockDepartments(config.stock_departments ?? []);
      setEmployeeDepartments(config.employee_departments ?? []);
      setIcRoundDepartments(config.ic_round_departments ?? []);
      setCultureTrackerItems(config.culture_tracker_items ?? []);
      setAgreementTrackerEntities(config.agreement_tracker_entities ?? []);
    }
  }, [config]);

  useEffect(() => {
    loadStockItems();
    loadHealthItemTypes();
    loadDiseaseTypes();
    if (isOwner) loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  async function loadStockItems() {
    const { data } = await fetchAllRows((from, to) => supabase.from("stock_items").select("*").order("sort_order").range(from, to));
    setStockItems(data ?? []);
  }

  async function loadHealthItemTypes() {
    const { data } = await supabase.from("health_item_types").select("*").order("sort_order");
    setHealthItemTypes((data ?? []).map((t) => ({ ...t, dose_schedule: (t.dose_schedule?.length ? t.dose_schedule : [0]).join(",") })));
  }

  async function loadDiseaseTypes() {
    const { data } = await supabase.from("disease_types").select("*").order("sort_order");
    setDiseaseTypes(data ?? []);
  }

  async function addDisease() {
    const name = newDisease.trim();
    if (!name) return;
    const maxSort = diseaseTypes.reduce((m, d) => Math.max(m, d.sort_order ?? 0), 0);
    await supabase.from("disease_types").insert({ name, sort_order: maxSort + 1 });
    setNewDisease("");
    loadDiseaseTypes();
  }

  async function removeDisease(d) {
    await supabase.from("disease_types").delete().eq("id", d.id);
    loadDiseaseTypes();
  }

  async function loadUsers() {
    const { data } = await supabase.from("users").select("*").order("created_at");
    setUsers(data ?? []);
  }

  function flash(text) {
    setMessage(text);
    setTimeout(() => setMessage(null), 2500);
  }

  async function saveStockDepartments(next) {
    setStockDepartments(next);
    await supabase.from("app_config").update({ stock_departments: next }).eq("id", 1);
    reloadConfig();
    flash("Stock departments saved");
  }

  function addStockDept() {
    const name = newStockDept.trim();
    if (!name || stockDepartments.includes(name)) return;
    saveStockDepartments([...stockDepartments, name]);
    setNewStockDept("");
  }

  async function quickAddDepartment() {
    const name = window.prompt("New department name:");
    if (!name || !name.trim()) return null;
    const trimmed = name.trim();
    if (!stockDepartments.includes(trimmed)) {
      await saveStockDepartments([...stockDepartments, trimmed]);
    }
    return trimmed;
  }

  function removeStockDept(name) {
    saveStockDepartments(stockDepartments.filter((d) => d !== name));
  }

  function updateStockItem(id, patch) {
    setStockItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  async function saveStockItem(item) {
    await supabase
      .from("stock_items")
      .update({
        department: item.department,
        name: item.name,
        unit: item.unit,
        min_qty: Number(item.min_qty) || 0,
        max_qty: Number(item.max_qty) || 0,
        current_qty: Number(item.current_qty) || 0,
        active: item.active,
      })
      .eq("id", item.id);
    flash(`${item.name} saved`);
  }

  async function removeStockItem(item) {
    if (!confirm(`Delete "${item.name}" from the stock catalog?`)) return;
    await supabase.from("stock_items").delete().eq("id", item.id);
    loadStockItems();
  }

  async function addStockItem() {
    const name = newStockItem.name.trim();
    if (!name) {
      flash("Item name is required");
      return;
    }
    if (!newStockItem.department) {
      flash("Select a department for this item");
      return;
    }
    const maxSort = stockItems.reduce((m, i) => Math.max(m, i.sort_order ?? 0), 0);
    const { error } = await supabase.from("stock_items").insert({
      department: newStockItem.department,
      name,
      unit: newStockItem.unit.trim() || "unit",
      min_qty: Number(newStockItem.min_qty) || 0,
      max_qty: Number(newStockItem.max_qty) || 0,
      current_qty: Number(newStockItem.current_qty) || 0,
      active: true,
      sort_order: maxSort + 1,
    });
    if (error) {
      flash("Could not add item");
      return;
    }
    setNewStockItem({ ...emptyNewStockItem, department: newStockItem.department });
    loadStockItems();
    flash("Item added");
  }

  async function saveEmployeeDepartments(next) {
    setEmployeeDepartments(next);
    await supabase.from("app_config").update({ employee_departments: next }).eq("id", 1);
    reloadConfig();
    flash("Employee departments saved");
  }

  function addEmployeeDept() {
    const name = newEmployeeDept.trim();
    if (!name || employeeDepartments.includes(name)) return;
    saveEmployeeDepartments([...employeeDepartments, name]);
    setNewEmployeeDept("");
  }

  function removeEmployeeDept(name) {
    saveEmployeeDepartments(employeeDepartments.filter((d) => d !== name));
  }

  async function saveIcRoundDepartments(next) {
    setIcRoundDepartments(next);
    await supabase.from("app_config").update({ ic_round_departments: next }).eq("id", 1);
    reloadConfig();
    flash("IC round departments saved");
  }

  function addIcRoundDept() {
    const name = newIcRoundDept.trim();
    if (!name || icRoundDepartments.includes(name)) return;
    saveIcRoundDepartments([...icRoundDepartments, name]);
    setNewIcRoundDept("");
  }

  function removeIcRoundDept(name) {
    saveIcRoundDepartments(icRoundDepartments.filter((d) => d !== name));
  }

  async function saveCultureTrackerItems(next) {
    setCultureTrackerItems(next);
    await supabase.from("app_config").update({ culture_tracker_items: next }).eq("id", 1);
    reloadConfig();
    flash("Culture tracker items saved");
  }

  function addCultureTrackerItem() {
    const name = newCultureTrackerItem.trim();
    if (!name || cultureTrackerItems.includes(name)) return;
    saveCultureTrackerItems([...cultureTrackerItems, name]);
    setNewCultureTrackerItem("");
  }

  function removeCultureTrackerItem(name) {
    saveCultureTrackerItems(cultureTrackerItems.filter((d) => d !== name));
  }

  async function saveAgreementTrackerEntities(next) {
    setAgreementTrackerEntities(next);
    await supabase.from("app_config").update({ agreement_tracker_entities: next }).eq("id", 1);
    reloadConfig();
    flash("Agreement tracker entities saved");
  }

  function addAgreementTrackerEntity() {
    const name = newAgreementTrackerEntity.trim();
    if (!name || agreementTrackerEntities.includes(name)) return;
    saveAgreementTrackerEntities([...agreementTrackerEntities, name]);
    setNewAgreementTrackerEntity("");
  }

  function removeAgreementTrackerEntity(name) {
    saveAgreementTrackerEntities(agreementTrackerEntities.filter((d) => d !== name));
  }

  function updateHealthItemType(id, patch) {
    setHealthItemTypes((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  async function saveHealthItemType(item) {
    await supabase
      .from("health_item_types")
      .update({
        name: item.name,
        category: item.category,
        recurrence_months: item.recurrence_months === "" || item.recurrence_months == null ? null : Number(item.recurrence_months),
        dose_schedule: parseDoseSchedule(item.dose_schedule),
        kitchen_only: !!item.kitchen_only,
        active: item.active,
      })
      .eq("id", item.id);
    flash(`${item.name} saved`);
  }

  async function removeHealthItemType(item) {
    if (!confirm(`Delete "${item.name}" from the catalog?`)) return;
    await supabase.from("health_item_types").delete().eq("id", item.id);
    loadHealthItemTypes();
  }

  async function addHealthItemType() {
    const name = newHealthItem.name.trim();
    if (!name) {
      flash("Item name is required");
      return;
    }
    const maxSort = healthItemTypes.reduce((m, t) => Math.max(m, t.sort_order ?? 0), 0);
    const { error } = await supabase.from("health_item_types").insert({
      name,
      category: newHealthItem.category,
      recurrence_months: newHealthItem.recurrence_months === "" ? null : Number(newHealthItem.recurrence_months),
      dose_schedule: parseDoseSchedule(newHealthItem.dose_schedule),
      kitchen_only: newHealthItem.kitchen_only,
      active: true,
      sort_order: maxSort + 1,
    });
    if (error) {
      flash("Could not add item");
      return;
    }
    setNewHealthItem(emptyNewHealthItem);
    loadHealthItemTypes();
    flash("Item added");
  }

  async function passwordField(plain) {
    return supabase.isMock ? { password: plain } : { password_hash: await sha256Hex(plain) };
  }

  async function addUser() {
    const username = newUser.username.trim();
    if (!username) {
      flash("Username is required");
      return;
    }
    // Login matches usernames case-insensitively, so block a case-only
    // duplicate here too (the DB's unique constraint alone wouldn't).
    if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      flash("That username is already taken");
      return;
    }
    const { error } = await supabase.from("users").insert({
      username,
      ...(await passwordField(DEFAULT_PASSWORD)),
      must_change_password: true,
      display_name: newUser.display_name.trim() || username,
      role: newUser.role,
      department: newUser.department || null,
      can_manage_stock: newUser.role === "staff" && newUser.can_manage_stock,
      can_view_employee_health: newUser.role === "staff" && newUser.can_view_employee_health,
      created_by: session?.username,
    });
    if (error) {
      flash(error.message.includes("duplicate") ? "That username is already taken" : "Could not create user");
      return;
    }
    setNewUser(emptyNewUser);
    loadUsers();
    flash(`User created — starting password is ${DEFAULT_PASSWORD}`);
  }

  function updateUserField(id, patch) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }

  async function saveUser(user) {
    await supabase
      .from("users")
      .update({
        display_name: user.display_name,
        role: user.role,
        department: user.department || null,
        can_manage_stock: user.role === "staff" && !!user.can_manage_stock,
        can_view_employee_health: user.role === "staff" && !!user.can_view_employee_health,
        active: user.active,
      })
      .eq("id", user.id);
    flash(`${user.display_name || user.username} saved`);
  }

  async function resetPassword(user) {
    if (!confirm(`Reset ${user.username}'s password back to ${DEFAULT_PASSWORD}? They'll be asked to change it on next login.`))
      return;
    await supabase
      .from("users")
      .update({ ...(await passwordField(DEFAULT_PASSWORD)), must_change_password: true })
      .eq("id", user.id);
    flash(`Password reset to ${DEFAULT_PASSWORD}`);
  }

  async function removeUser(user) {
    if (user.username === session?.username) {
      flash("You can't delete your own account");
      return;
    }
    if (!confirm(`Delete the account "${user.username}"?`)) return;
    await supabase.from("users").delete().eq("id", user.id);
    loadUsers();
  }

  if (!config) return null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Settings</h1>
        <p className="text-sm text-slate-500">Manage departments, tracker lists, and user accounts.</p>
      </div>

      {message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">Daily IC Round Departments</h2>
        <p className="mb-4 text-xs text-slate-500">Separate department list used only by the Daily IC Rounds module.</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {icRoundDepartments.map((d) => (
            <span key={d} className="flex items-center gap-1 rounded-full bg-teal-50 px-3 py-1 text-sm text-teal-700">
              {d}
              <button onClick={() => removeIcRoundDept(d)} className="text-teal-400 hover:text-red-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input" value={newIcRoundDept} onChange={(e) => setNewIcRoundDept(e.target.value)} placeholder="New department name" />
          <button onClick={addIcRoundDept} className="flex items-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">Culture Tracker Items</h2>
        <p className="mb-4 text-xs text-slate-500">The list of areas/categories selectable on Trackers → Culture.</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {cultureTrackerItems.map((d) => (
            <span key={d} className="flex items-center gap-1 rounded-full bg-teal-50 px-3 py-1 text-sm text-teal-700">
              {d}
              <button onClick={() => removeCultureTrackerItem(d)} className="text-teal-400 hover:text-red-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input" value={newCultureTrackerItem} onChange={(e) => setNewCultureTrackerItem(e.target.value)} placeholder="New item name" />
          <button onClick={addCultureTrackerItem} className="flex items-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">Agreement Tracker Entities</h2>
        <p className="mb-4 text-xs text-slate-500">The list of vendors/entities selectable on Trackers → Agreement.</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {agreementTrackerEntities.map((d) => (
            <span key={d} className="flex items-center gap-1 rounded-full bg-teal-50 px-3 py-1 text-sm text-teal-700">
              {d}
              <button onClick={() => removeAgreementTrackerEntity(d)} className="text-teal-400 hover:text-red-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input" value={newAgreementTrackerEntity} onChange={(e) => setNewAgreementTrackerEntity(e.target.value)} placeholder="New entity name" />
          <button onClick={addAgreementTrackerEntity} className="flex items-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">Stock Request Departments</h2>
        <p className="mb-4 text-xs text-slate-500">Departments/units — each keeps its own stock item catalog and usage log.</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {stockDepartments.map((d) => (
            <span key={d} className="flex items-center gap-1 rounded-full bg-teal-50 px-3 py-1 text-sm text-teal-700">
              {d}
              <button onClick={() => removeStockDept(d)} className="text-teal-400 hover:text-red-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="input"
            value={newStockDept}
            onChange={(e) => setNewStockDept(e.target.value)}
            placeholder="New department name"
          />
          <button onClick={addStockDept} className="flex items-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Stock Items</h2>
          <select className="input w-full sm:w-64" value={stockItemsFilterDept} onChange={(e) => setStockItemsFilterDept(e.target.value)}>
            <option value="">Filter by department — select one</option>
            {stockDepartments.map((d) => (
              <option key={d} value={d}>
                {d} ({stockItems.filter((i) => i.department === d).length})
              </option>
            ))}
          </select>
        </div>
        {stockItemsFilterDept ? (
          <>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Unit</th>
                    <th className="px-3 py-2 font-medium">Min</th>
                    <th className="px-3 py-2 font-medium">Max</th>
                    <th className="px-3 py-2 font-medium">Current</th>
                    <th className="px-3 py-2 font-medium">Active</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {stockItems
                    .filter((i) => i.department === stockItemsFilterDept)
                    .map((i) => (
                      <tr key={i.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <input className="input" value={i.name} onChange={(e) => updateStockItem(i.id, { name: e.target.value })} />
                        </td>
                        <td className="px-3 py-2">
                          <input className="input w-24" value={i.unit} onChange={(e) => updateStockItem(i.id, { unit: e.target.value })} />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" className="input w-20" value={i.min_qty} onChange={(e) => updateStockItem(i.id, { min_qty: e.target.value })} />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" className="input w-20" value={i.max_qty} onChange={(e) => updateStockItem(i.id, { max_qty: e.target.value })} />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            className="input w-20"
                            value={i.current_qty}
                            onChange={(e) => updateStockItem(i.id, { current_qty: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={i.active} onChange={(e) => updateStockItem(i.id, { active: e.target.checked })} />
                        </td>
                        <td className="flex items-center gap-1 px-3 py-2">
                          <button onClick={() => saveStockItem(i)} className="rounded-lg p-1.5 text-teal-600 hover:bg-teal-50">
                            <Save className="h-4 w-4" />
                          </button>
                          <button onClick={() => removeStockItem(i)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {stockItems.filter((i) => i.department === stockItemsFilterDept).length === 0 && (
                <p className="p-6 text-center text-sm text-slate-400">No items yet for {stockItemsFilterDept}</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 sm:grid-cols-6 sm:items-center">
              <select
                className="input"
                value={newStockItem.department || stockItemsFilterDept}
                onChange={(e) => setNewStockItem({ ...newStockItem, department: e.target.value })}
              >
                {stockDepartments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <input
                className="input"
                value={newStockItem.name}
                onChange={(e) => setNewStockItem({ ...newStockItem, name: e.target.value })}
                placeholder="Item name"
              />
              <input
                className="input"
                value={newStockItem.unit}
                onChange={(e) => setNewStockItem({ ...newStockItem, unit: e.target.value })}
                placeholder="Unit (box, piece...)"
              />
              <input
                type="number"
                className="input"
                value={newStockItem.min_qty}
                onChange={(e) => setNewStockItem({ ...newStockItem, min_qty: e.target.value })}
                placeholder="Min"
              />
              <input
                type="number"
                className="input"
                value={newStockItem.max_qty}
                onChange={(e) => setNewStockItem({ ...newStockItem, max_qty: e.target.value })}
                placeholder="Max"
              />
              <input
                type="number"
                className="input"
                value={newStockItem.current_qty}
                onChange={(e) => setNewStockItem({ ...newStockItem, current_qty: e.target.value })}
                placeholder="Current stock"
              />
              <button
                onClick={addStockItem}
                className="flex items-center justify-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 sm:col-span-6"
              >
                <PackagePlus className="h-4 w-4" />
                Add Item
              </button>
            </div>
          </>
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400">
            Pick a department above to view and edit its items — {stockItems.length} items total across all departments.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">Employee Health Departments</h2>
        <p className="mb-4 text-xs text-slate-500">Departments used when adding employees for health tracking.</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {employeeDepartments.map((d) => (
            <span key={d} className="flex items-center gap-1 rounded-full bg-teal-50 px-3 py-1 text-sm text-teal-700">
              {d}
              <button onClick={() => removeEmployeeDept(d)} className="text-teal-400 hover:text-red-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="input"
            value={newEmployeeDept}
            onChange={(e) => setNewEmployeeDept(e.target.value)}
            placeholder="New department name"
          />
          <button onClick={addEmployeeDept} className="flex items-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Employee Health Items (Vaccines &amp; Screenings)</h2>
          <p className="text-xs text-slate-500">
            Dose Schedule = month offsets from the 1st dose date, one per dose. E.g. Hepatitis B "0,1,6" means the 1st dose,
            2nd dose 1 month later, 3rd dose 6 months later (Jan / Feb / Jul). A single dose is just "0".
          </p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Dose Schedule (months after 1st dose)</th>
                <th className="px-3 py-2 font-medium">Repeats Every (months)</th>
                <th className="px-3 py-2 font-medium">Kitchen Staff Only</th>
                <th className="px-3 py-2 font-medium">Active</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {healthItemTypes.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <input className="input" value={t.name} onChange={(e) => updateHealthItemType(t.id, { name: e.target.value })} />
                  </td>
                  <td className="px-3 py-2">
                    <select className="input" value={t.category} onChange={(e) => updateHealthItemType(t.id, { category: e.target.value })}>
                      <option value="vaccine">Vaccine</option>
                      <option value="screening">Screening</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="input w-32"
                      value={t.dose_schedule ?? "0"}
                      onChange={(e) => updateHealthItemType(t.id, { dose_schedule: e.target.value })}
                      placeholder="e.g. 0,1,6"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      className="input w-28"
                      value={t.recurrence_months ?? ""}
                      onChange={(e) => updateHealthItemType(t.id, { recurrence_months: e.target.value })}
                      placeholder="One-time"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={!!t.kitchen_only} onChange={(e) => updateHealthItemType(t.id, { kitchen_only: e.target.checked })} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={t.active} onChange={(e) => updateHealthItemType(t.id, { active: e.target.checked })} />
                  </td>
                  <td className="flex items-center gap-1 px-3 py-2">
                    <button onClick={() => saveHealthItemType(t)} className="rounded-lg p-1.5 text-teal-600 hover:bg-teal-50">
                      <Save className="h-4 w-4" />
                    </button>
                    <button onClick={() => removeHealthItemType(t)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 sm:grid-cols-4 sm:items-center">
          <input
            className="input sm:col-span-2"
            value={newHealthItem.name}
            onChange={(e) => setNewHealthItem({ ...newHealthItem, name: e.target.value })}
            placeholder="Vaccine or screening name"
          />
          <select className="input" value={newHealthItem.category} onChange={(e) => setNewHealthItem({ ...newHealthItem, category: e.target.value })}>
            <option value="vaccine">Vaccine</option>
            <option value="screening">Screening</option>
          </select>
          <input
            className="input"
            value={newHealthItem.dose_schedule}
            onChange={(e) => setNewHealthItem({ ...newHealthItem, dose_schedule: e.target.value })}
            placeholder="Dose schedule, e.g. 0,1,6"
          />
          <input
            type="number"
            className="input"
            value={newHealthItem.recurrence_months}
            onChange={(e) => setNewHealthItem({ ...newHealthItem, recurrence_months: e.target.value })}
            placeholder="Repeats every N months (blank = one-time)"
          />
          <label className="flex items-center gap-1 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={newHealthItem.kitchen_only}
              onChange={(e) => setNewHealthItem({ ...newHealthItem, kitchen_only: e.target.checked })}
            />
            Kitchen Staff only
          </label>
          <button
            onClick={addHealthItemType}
            className="flex items-center justify-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 sm:col-span-4"
          >
            <HeartPulse className="h-4 w-4" />
            Add Item
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">Communicable Diseases</h2>
        <p className="mb-4 text-xs text-slate-500">The disease list shown on the Suspected/Confirmed Cases entry form.</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {diseaseTypes.map((d) => (
            <span key={d.id} className="flex items-center gap-1 rounded-full bg-teal-50 px-3 py-1 text-sm text-teal-700">
              {d.name}
              <button onClick={() => removeDisease(d)} className="text-teal-400 hover:text-red-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input" value={newDisease} onChange={(e) => setNewDisease(e.target.value)} placeholder="New disease name" />
          <button onClick={addDisease} className="flex items-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </section>

      {isOwner && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-slate-700">User Accounts</h2>
          <p className="mb-4 text-xs text-slate-500">
            Create an account for each person, with their own role and permissions — infection control team or any
            other department. Every entry, resolve, and delete is attributed to the account that did it.
          </p>

          <div className="flex flex-col gap-3">
            {users.map((u) => (
              <div key={u.id} className="grid grid-cols-1 gap-2 rounded-xl border border-slate-100 p-4 sm:grid-cols-5 sm:items-center">
                <div className="text-sm font-medium text-slate-700 sm:col-span-1">{u.username}</div>
                <input
                  className="input sm:col-span-1"
                  value={u.display_name}
                  onChange={(e) => updateUserField(u.id, { display_name: e.target.value })}
                  placeholder="Display name"
                />
                <select
                  className="input sm:col-span-1"
                  value={u.role}
                  onChange={(e) => updateUserField(u.id, { role: e.target.value })}
                >
                  <option value="owner">Owner</option>
                  <option value="ic">Infection Control</option>
                  <option value="staff">Ward Staff</option>
                </select>
                <div className="flex gap-1 sm:col-span-1">
                  <select
                    className="input"
                    value={u.department || ""}
                    onChange={(e) => updateUserField(u.id, { department: e.target.value })}
                  >
                    <option value="">No department</option>
                    {stockDepartments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      const d = await quickAddDepartment();
                      if (d) updateUserField(u.id, { department: d });
                    }}
                    title="Add a new department"
                    className="shrink-0 rounded-lg border border-slate-200 px-2 text-slate-500 hover:bg-slate-50"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center justify-end gap-2 sm:col-span-1">
                  <label className="flex items-center gap-1 text-xs text-slate-500">
                    <input type="checkbox" checked={u.active} onChange={(e) => updateUserField(u.id, { active: e.target.checked })} />
                    Active
                  </label>
                  <button
                    onClick={() => resetPassword(u)}
                    title={`Reset password to ${DEFAULT_PASSWORD}`}
                    className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50"
                  >
                    <KeyRound className="h-4 w-4" />
                  </button>
                  <button onClick={() => saveUser(u)} className="rounded-lg p-1.5 text-teal-600 hover:bg-teal-50">
                    <Save className="h-4 w-4" />
                  </button>
                  <button onClick={() => removeUser(u)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {u.role === "staff" && u.department && (
                  <label className="flex items-center gap-1 text-xs text-slate-500 sm:col-span-5">
                    <input
                      type="checkbox"
                      checked={!!u.can_manage_stock}
                      onChange={(e) => updateUserField(u.id, { can_manage_stock: e.target.checked })}
                    />
                    Department stock in-charge — can also add/remove items in {u.department}'s stock catalog (not just use them)
                  </label>
                )}
                {u.role === "staff" && (
                  <label className="flex items-center gap-1 text-xs text-slate-500 sm:col-span-5">
                    <input
                      type="checkbox"
                      checked={!!u.can_view_employee_health}
                      onChange={(e) => updateUserField(u.id, { can_view_employee_health: e.target.checked })}
                    />
                    Employee Health access only — e.g. a doctor's account; sees the Employee Health page instead of Stock Requests
                  </label>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 rounded-xl border border-dashed border-slate-300 p-4 sm:grid-cols-4 sm:items-center">
            <input
              className="input sm:col-span-1"
              value={newUser.username}
              onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
              placeholder="Username"
            />
            <input
              className="input sm:col-span-1"
              value={newUser.display_name}
              onChange={(e) => setNewUser({ ...newUser, display_name: e.target.value })}
              placeholder="Display name"
            />
            <select
              className="input sm:col-span-1"
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
            >
              <option value="owner">Owner</option>
              <option value="ic">Infection Control</option>
              <option value="staff">Ward Staff</option>
            </select>
            <div className="flex gap-1 sm:col-span-1">
              <select
                className="input"
                value={newUser.department}
                onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
              >
                <option value="">No department</option>
                {stockDepartments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={async () => {
                  const d = await quickAddDepartment();
                  if (d) setNewUser({ ...newUser, department: d });
                }}
                title="Add a new department"
                className="shrink-0 rounded-lg border border-slate-200 px-2 text-slate-500 hover:bg-slate-50"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {newUser.role === "staff" && newUser.department && (
              <label className="flex items-center gap-1 text-xs text-slate-500 sm:col-span-4">
                <input
                  type="checkbox"
                  checked={newUser.can_manage_stock}
                  onChange={(e) => setNewUser({ ...newUser, can_manage_stock: e.target.checked })}
                />
                Department stock in-charge — can also add/remove items in this department's stock catalog (not just use them)
              </label>
            )}
            {newUser.role === "staff" && (
              <label className="flex items-center gap-1 text-xs text-slate-500 sm:col-span-4">
                <input
                  type="checkbox"
                  checked={newUser.can_view_employee_health}
                  onChange={(e) => setNewUser({ ...newUser, can_view_employee_health: e.target.checked })}
                />
                Employee Health access only — e.g. a doctor's account; sees the Employee Health page instead of Stock Requests
              </label>
            )}
            <button
              onClick={addUser}
              className="flex items-center justify-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 sm:col-span-4"
            >
              <UserPlus className="h-4 w-4" />
              Add User (starting password: {DEFAULT_PASSWORD})
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
