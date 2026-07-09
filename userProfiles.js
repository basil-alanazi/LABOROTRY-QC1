import { supabase } from "./supabaseClient";

// Loads all profiles once into a map: { username: { full_name, employee_id } }
export async function loadProfilesMap() {
  const { data } = await supabase.from("user_profiles").select("*");
  const map = {};
  (data || []).forEach((p) => { map[p.username] = p; });
  return map;
}

// Formats a username as "Full Name (ID)" if a profile exists, else the raw username.
export function signatureFor(username, profilesMap) {
  if (!username) return "";
  const p = profilesMap?.[username];
  if (!p || !p.full_name) return username;
  return p.employee_id ? `${p.full_name} (${p.employee_id})` : p.full_name;
}
