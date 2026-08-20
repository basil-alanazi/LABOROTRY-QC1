import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const AuthContext = createContext(null);
const STORAGE_KEY = "ic_session";

// Roles: "staff" (ward staff — entry only), "ic" / "ic2" (infection control
// team — full access), "owner" (ic-level access + manage accounts/settings).
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

  async function login(username, password) {
    const cfg = config ?? (await loadConfig());
    if (!cfg) return { ok: false, error: "Could not connect to the server" };

    const matches = [
      { role: "owner", u: cfg.owner_username, p: cfg.owner_password },
      { role: "ic", u: cfg.ic_username, p: cfg.ic_password },
      { role: "ic2", u: cfg.ic2_username, p: cfg.ic2_password },
      { role: "staff", u: cfg.staff_username, p: cfg.staff_password },
    ].find((m) => m.u === username && m.p === password);

    if (!matches) return { ok: false, error: "Incorrect username or password" };

    const s = { username, role: matches.role };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    setSession(s);
    return { ok: true };
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }

  const isAdmin = session?.role === "owner" || session?.role === "ic" || session?.role === "ic2";
  const isOwner = session?.role === "owner";

  return (
    <AuthContext.Provider
      value={{ session, config, loading, login, logout, isAdmin, isOwner, reloadConfig: loadConfig }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
