import { useEffect, useState } from "react";
import { Plus, Trash2, Save, UserPlus, KeyRound, ListPlus } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth.jsx";
import { sha256Hex } from "../lib/hash";

const DEFAULT_PASSWORD = "123456";
const emptyNewUser = { username: "", display_name: "", role: "staff", department: "" };
const emptyNewChecklist = { name: "", departments: [], items: "", baseline: "" };

function slugCode(name) {
  const base = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || `CHECKLIST_${Date.now()}`;
}

export default function Settings() {
  const { config, reloadConfig, isOwner, session } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [newDept, setNewDept] = useState("");
  const [checklistTypes, setChecklistTypes] = useState([]);
  const [newChecklist, setNewChecklist] = useState(emptyNewChecklist);
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState(emptyNewUser);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (config) setDepartments(config.departments ?? []);
  }, [config]);

  useEffect(() => {
    loadChecklists();
    if (isOwner) loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  async function loadChecklists() {
    const { data } = await supabase.from("checklist_types").select("*").order("sort_order");
    setChecklistTypes(data ?? []);
  }

  async function loadUsers() {
    const { data } = await supabase.from("users").select("*").order("created_at");
    setUsers(data ?? []);
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
        baseline: checklist.baseline,
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

  function toggleNewChecklistDept(dept) {
    setNewChecklist((nc) => ({
      ...nc,
      departments: nc.departments.includes(dept) ? nc.departments.filter((d) => d !== dept) : [...nc.departments, dept],
    }));
  }

  async function addChecklist() {
    const name = newChecklist.name.trim();
    if (!name) {
      flash("Checklist name is required");
      return;
    }
    const items = newChecklist.items
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (items.length === 0) {
      flash("Add at least one bundle item");
      return;
    }
    const maxSort = checklistTypes.reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0);
    const { error } = await supabase.from("checklist_types").insert({
      code: slugCode(name),
      name_ar: name,
      name_en: name,
      items,
      departments: newChecklist.departments,
      baseline: newChecklist.baseline,
      active: true,
      sort_order: maxSort + 1,
    });
    if (error) {
      flash(error.message.includes("duplicate") ? "A checklist with a similar name already exists" : "Could not create checklist");
      return;
    }
    setNewChecklist(emptyNewChecklist);
    loadChecklists();
    flash("Checklist created");
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
    const { error } = await supabase.from("users").insert({
      username,
      ...(await passwordField(DEFAULT_PASSWORD)),
      must_change_password: true,
      display_name: newUser.display_name.trim() || username,
      role: newUser.role,
      department: newUser.department || null,
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
        <p className="text-sm text-slate-500">Manage departments, checklist items, and user accounts.</p>
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

            <label className="mb-1 mt-3 block text-xs font-medium text-slate-500">Baseline (reserved for future use)</label>
            <input
              className="input"
              value={c.baseline || ""}
              onChange={(e) => updateChecklist(c.id, { baseline: e.target.value })}
              placeholder="Optional — fill in whenever you need it"
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

        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">New Checklist</h3>

          <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
          <input
            className="input mb-3"
            value={newChecklist.name}
            onChange={(e) => setNewChecklist({ ...newChecklist, name: e.target.value })}
            placeholder="e.g. Hand Hygiene"
          />

          <label className="mb-1 block text-xs font-medium text-slate-500">Departments</label>
          <div className="mb-3 flex flex-wrap gap-2">
            {departments.map((d) => (
              <label
                key={d}
                className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${
                  newChecklist.departments.includes(d) ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-500"
                }`}
              >
                <input type="checkbox" className="hidden" checked={newChecklist.departments.includes(d)} onChange={() => toggleNewChecklistDept(d)} />
                {d}
              </label>
            ))}
          </div>

          <label className="mb-1 block text-xs font-medium text-slate-500">Bundle items (one per line)</label>
          <textarea
            className="input mb-3 min-h-[140px] font-mono text-xs"
            value={newChecklist.items}
            onChange={(e) => setNewChecklist({ ...newChecklist, items: e.target.value })}
            placeholder={"1. First question or step\n2. Second question or step"}
          />

          <label className="mb-1 block text-xs font-medium text-slate-500">Baseline (reserved for future use)</label>
          <input
            className="input"
            value={newChecklist.baseline}
            onChange={(e) => setNewChecklist({ ...newChecklist, baseline: e.target.value })}
            placeholder="Optional — fill in whenever you need it"
          />

          <button
            onClick={addChecklist}
            className="mt-4 flex items-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            <ListPlus className="h-4 w-4" />
            Add Checklist
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
                <select
                  className="input sm:col-span-1"
                  value={u.department || ""}
                  onChange={(e) => updateUserField(u.id, { department: e.target.value })}
                >
                  <option value="">No department</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
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
            <select
              className="input sm:col-span-1"
              value={newUser.department}
              onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
            >
              <option value="">No department</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
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
