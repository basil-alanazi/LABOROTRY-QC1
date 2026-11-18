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
      canAdminStock: !!user.can_admin_stock,
      canViewEmployeeHealth: !!user.can_view_employee_health,
      canViewHaiSurveillance: !!user.can_view_hai_surveillance,
      canEnterNursingRounds: !!user.can_view_nursing_rounds,
      canEnterQualityRounds: !!user.can_view_quality_rounds,
      canEnterIcRounds: !!user.can_view_ic_rounds,
      canSubmitNursingRounds: !!user.can_submit_nursing_rounds,
      canSubmitQualityRounds: !!user.can_submit_quality_rounds,
      canSubmitIcRounds: !!user.can_submit_ic_rounds,
      haiScope: user.hai_scope || null,
      obStages: user.ob_stages ? user.ob_stages.split(",").map((s) => s.trim()).filter(Boolean) : [],
      ssiStages: user.ssi_stages ? user.ssi_stages.split(",").map((s) => s.trim()).filter(Boolean) : [],
      ssiDoctor: user.ssi_doctor || null,
      mustChangePassword: !!user.must_change_password,
    };
  }

  async function login(username, password) {
    // Username match is case-insensitive (staff on shared tablets often
    // don't match the exact case it was created with) — password is not.
    // Offline preview mode has no real security to protect — compare
    // plaintext there so the seeded demo accounts keep working.
    const hashedPassword = supabase.isMock ? null : await sha256Hex(password);

    // A busy free-tier database can return a transient 503 under load —
    // that's a server problem, not a wrong password, so retry a couple
    // times before giving up rather than telling the user their
    // credentials are wrong when the query never actually ran.
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * attempt));
      try {
        const query = supabase.from("users").select("*").ilike("username", username).eq("active", true);
        const { data: user, error } = supabase.isMock
          ? await query.eq("password", password).single()
          : await query.eq("password_hash", hashedPassword).single();

        if (user) {
          const s = toSession(user);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
          setSession(s);
          return { ok: true };
        }
        // PGRST116 = "no rows" from .single() — a real username/password
        // mismatch, not a server hiccup, so no point retrying that.
        if (error?.code === "PGRST116") return { ok: false, error: "Incorrect username or password" };
        lastError = error;
      } catch (err) {
        lastError = err;
      }
    }
    return { ok: false, error: lastError ? "Server is busy — please try again in a moment" : "Incorrect username or password" };
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
  // Owner/IC always have it; a Ward Staff account can be granted this to see
  // and manage every department's stock (not just their own) without full
  // Owner/IC access elsewhere.
  const canAdminStock = isAdmin || !!session?.canAdminStock;
  // Additive — on top of whatever else the account can already see (Stock
  // Requests, or a restricted "access only" page), not instead of it.
  const canViewHaiSurveillance = isAdmin || !!session?.canViewHaiSurveillance;
  // A Ward Staff account can be granted view-only access to a round page —
  // full history (old and new rounds), nothing writable.
  const canEnterNursingRounds = isAdmin || !!session?.canEnterNursingRounds;
  const canEnterQualityRounds = isAdmin || !!session?.canEnterQualityRounds;
  const canEnterIcRounds = isAdmin || !!session?.canEnterIcRounds;
  // On top of view access, a Ward Staff account can additionally be granted
  // "submit" rights — add today's round only (date is locked), no editing
  // or backdating past entries, same as the view-only account otherwise.
  const canSubmitNursingRounds = isAdmin || !!session?.canSubmitNursingRounds;
  const canSubmitQualityRounds = isAdmin || !!session?.canSubmitQualityRounds;
  const canSubmitIcRounds = isAdmin || !!session?.canSubmitIcRounds;

  return (
    <AuthContext.Provider
      value={{
        session,
        config,
        loading,
        login,
        logout,
        changePassword,
        isAdmin,
        isOwner,
        canViewEmployeeHealth,
        canAdminStock,
        canViewHaiSurveillance,
        canEnterNursingRounds,
        canEnterQualityRounds,
        canEnterIcRounds,
        canSubmitNursingRounds,
        canSubmitQualityRounds,
        canSubmitIcRounds,
        reloadConfig: loadConfig,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
