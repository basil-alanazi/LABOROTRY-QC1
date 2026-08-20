import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const AuthContext = createContext(null);
const STORAGE_KEY = "ic_session";

// Roles: "staff" (entry only, optionally scoped to a home department),
// "ic" (infection control team — full access), "owner" (ic-level access +
// manage users/departments/checklists). Real per-user accounts, created by
// the owner from Settings, so every action can be attributed to a person.
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
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .eq("password", password)
      .eq("active", true)
      .single();

    if (!user) return { ok: false, error: "Incorrect username or password" };

    const s = {
      id: user.id,
      username: user.username,
      displayName: user.display_name || user.username,
      role: user.role,
      department: user.department || "",
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    setSession(s);
    return { ok: true };
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }

  const isAdmin = session?.role === "owner" || session?.role === "ic";
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
