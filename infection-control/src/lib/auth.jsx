import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { sha256Hex } from "./hash";

const AuthContext = createContext(null);
const STORAGE_KEY = "ic_session";

// Roles: "staff" (entry only, optionally scoped to a home department),
// "ic" (infection control team — full access), "owner" (ic-level access +
// manage users/departments/checklists). Real per-user accounts, created by
// the owner from Settings, so every action can be attributed to a person.
// Passwords are stored as a SHA-256 hash (password_hash) — nobody, not even
// the owner, can read a password back; the owner can only reset it.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadConfig() {
    const { data } = await supabase.from("app_config").select("*").eq("id", 1).single();
    setConfig(data);
    return data;
  }

  useEffect(() => {
    loadConfig().finally(() => setLoading(false));
  }, []);

  function toSession(user) {
    return {
      id: user.id,
      username: user.username,
      displayName: user.display_name || user.username,
      role: user.role,
      department: user.department || "",
      canManageStock: !!user.can_manage_stock,
      canViewEmployeeHealth: !!user.can_view_employee_health,
      mustChangePassword: !!user.must_change_password,
    };
  }

  async function login(username, password) {
    // Username match is case-insensitive (staff on shared tablets often
    // don't match the exact case it was created with) — password is not.
    const query = supabase.from("users").select("*").ilike("username", username).eq("active", true);
    // Offline preview mode has no real security to protect — compare
    // plaintext there so the seeded demo accounts keep working.
    const { data: user } = supabase.isMock
      ? await query.eq("password", password).single()
      : await query.eq("password_hash", await sha256Hex(password)).single();

    if (!user) return { ok: false, error: "Incorrect username or password" };

    const s = toSession(user);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    setSession(s);
    return { ok: true };
  }

  async function changePassword(newPassword) {
    if (!session) return { ok: false, error: "Not signed in" };
    const patch = supabase.isMock
      ? { password: newPassword, must_change_password: false }
      : { password_hash: await sha256Hex(newPassword), must_change_password: false };
    const { error } = await supabase.from("users").update(patch).eq("id", session.id);
    if (error) return { ok: false, error: error.message };
    const next = { ...session, mustChangePassword: false };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSession(next);
    return { ok: true };
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }

  const isAdmin = session?.role === "owner" || session?.role === "ic";
  const isOwner = session?.role === "owner";
  // Owner/IC always have it; a Ward Staff account can be granted just this one page (e.g. a doctor account).
  const canViewEmployeeHealth = isAdmin || !!session?.canViewEmployeeHealth;

  return (
    <AuthContext.Provider
      value={{ session, config, loading, login, logout, changePassword, isAdmin, isOwner, canViewEmployeeHealth, reloadConfig: loadConfig }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
