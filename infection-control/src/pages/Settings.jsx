import { useEffect, useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth.jsx";

export default function Settings() {
  const { config, reloadConfig, isOwner } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [newDept, setNewDept] = useState("");
  const [checklistTypes, setChecklistTypes] = useState([]);
  const [accounts, setAccounts] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (config) {
      setDepartments(config.departments ?? []);
      setAccounts({
        staff_username: config.staff_username,
        staff_password: config.staff_password,
        ic_username: config.ic_username,
        ic_password: config.ic_password,
        ic2_username: config.ic2_username,
        ic2_password: config.ic2_password,
        owner_username: config.owner_username,
        owner_password: config.owner_password,
      });
    }
  }, [config]);

  useEffect(() => {
    loadChecklists();
  }, []);

  async function loadChecklists() {
    const { data } = await supabase.from("checklist_types").select("*").order("sort_order");
    setChecklistTypes(data ?? []);
  }

  function flash(text) {
    setMessage(text);
    setTimeout(() => setMessage(null), 2500);
  }

  async function saveDepartments(next) {
    setDepartments(next);
    await supabase.from("app_config").update({ departments: next }).eq("id", 1);
    reloadConfig();
    flash("Departments saved");
  }

  function addDept() {
    const name = newDept.trim();
    if (!name || departments.includes(name)) return;
    saveDepartments([...departments, name]);
    setNewDept("");
  }

  function removeDept(name) {
    saveDepartments(departments.filter((d) => d !== name));
  }

  async function updateChecklist(id, patch) {
    setChecklistTypes((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function saveChecklist(checklist) {
    await supabase
      .from("checklist_types")
      .update({
        name_ar: checklist.name_ar,
        items: checklist.items,
        departments: checklist.departments,
        active: checklist.active,
      })
      .eq("id", checklist.id);
    flash(`${checklist.name_ar} saved`);
  }

  function toggleChecklistDept(checklist, dept) {
    const has = checklist.departments?.includes(dept);
    const next = has ? checklist.departments.filter((d) => d !== dept) : [...(checklist.departments ?? []), dept];
    updateChecklist(checklist.id, { departments: next });
  }

  async function saveAccounts() {
    await supabase.from("app_config").update(accounts).eq("id", 1);
    reloadConfig();
    flash("Accounts saved");
  }

  if (!config) return null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Settings</h1>
        <p className="text-sm text-slate-500">Manage departments, checklist items, and accounts.</p>
      </div>

      {message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Departments</h2>
        <div className="mb-4 flex flex-wrap gap-2">
          {departments.map((d) => (
            <span key={d} className="flex items-center gap-1 rounded-full bg-teal-50 px-3 py-1 text-sm text-teal-700">
              {d}
              <button onClick={() => removeDept(d)} className="text-teal-400 hover:text-red-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input" value={newDept} onChange={(e) => setNewDept(e.target.value)} placeholder="New department name" />
          <button onClick={addDept} className="flex items-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-slate-700">Checklists (Bundles)</h2>
        {checklistTypes.map((c) => (
          <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <input
                className="input font-medium"
                value={c.name_ar}
                onChange={(e) => updateChecklist(c.id, { name_ar: e.target.value })}
              />
              <label className="flex items-center gap-2 whitespace-nowrap text-xs text-slate-500">
                <input type="checkbox" checked={c.active} onChange={(e) => updateChecklist(c.id, { active: e.target.checked })} />
                Active
              </label>
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              {departments.map((d) => (
                <label
                  key={d}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${
                    c.departments?.includes(d) ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-500"
                  }`}
                >
                  <input type="checkbox" className="hidden" checked={c.departments?.includes(d) ?? false} onChange={() => toggleChecklistDept(c, d)} />
                  {d}
                </label>
              ))}
            </div>

            <label className="mb-1 block text-xs font-medium text-slate-500">Bundle items (one per line)</label>
            <textarea
              className="input min-h-[140px] font-mono text-xs"
              value={(c.items ?? []).join("\n")}
              onChange={(e) => updateChecklist(c.id, { items: e.target.value.split("\n").filter((l) => l.trim() !== "") })}
            />

            <button
              onClick={() => saveChecklist(c)}
              className="mt-3 flex items-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
            >
              <Save className="h-4 w-4" />
              Save
            </button>
          </div>
        ))}
      </section>

      {isOwner && accounts && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Accounts</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AccountFields
              title="Ward Staff (entry only)"
              username={accounts.staff_username}
              password={accounts.staff_password}
              onChange={(u, p) => setAccounts({ ...accounts, staff_username: u, staff_password: p })}
            />
            <AccountFields
              title="Infection Control — Primary"
              username={accounts.ic_username}
              password={accounts.ic_password}
              onChange={(u, p) => setAccounts({ ...accounts, ic_username: u, ic_password: p })}
            />
            <AccountFields
              title="Infection Control — Secondary"
              username={accounts.ic2_username}
              password={accounts.ic2_password}
              onChange={(u, p) => setAccounts({ ...accounts, ic2_username: u, ic2_password: p })}
            />
            <AccountFields
              title="Owner (full access)"
              username={accounts.owner_username}
              password={accounts.owner_password}
              onChange={(u, p) => setAccounts({ ...accounts, owner_username: u, owner_password: p })}
            />
          </div>
          <button onClick={saveAccounts} className="mt-4 flex items-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
            <Save className="h-4 w-4" />
            Save Accounts
          </button>
        </section>
      )}
    </div>
  );
}

function AccountFields({ title, username, password, onChange }) {
  return (
    <div className="rounded-xl border border-slate-100 p-4">
      <h3 className="mb-2 text-xs font-semibold text-slate-500">{title}</h3>
      <div className="flex flex-col gap-2">
        <input className="input" value={username} onChange={(e) => onChange(e.target.value, password)} placeholder="Username" />
        <input className="input" value={password} onChange={(e) => onChange(username, e.target.value)} placeholder="Password" />
      </div>
    </div>
  );
}
