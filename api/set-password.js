// Single place that sets a login password. Every part of the app that
// creates or changes a password (My Profile, Settings, Staff, Owner
// Settings) should call this instead of writing the password column
// directly, so the matching Supabase Auth user (created by
// migrate-auth-users.js) always stays in sync — otherwise its Auth
// password would silently drift from the plaintext one and that account
// would stop getting a real session at login.
//
// Two modes:
//   { table: "staff_accounts" | "portal_accounts", id, password, mustChangePassword? }
//   { slot: "super" | "admin" | "admin2" | "lab", password }
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AUTH_DOMAIN = "rabia-lab.internal";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: "Missing Supabase env vars" });

  const { table, id, slot, password, mustChangePassword } = req.body || {};
  if (!password) return res.status(400).json({ error: "Missing password" });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  if (slot) {
    if (!["super", "admin", "admin2", "lab"].includes(slot)) return res.status(400).json({ error: "Invalid slot" });
    const { data: row } = await supabase.from("fixed_account_auth").select("*").eq("slot", slot).maybeSingle();
    if (!row) return res.status(400).json({ error: "Unknown slot" });
    const outcome = await syncAuthUser(supabase, row.auth_user_id, row.email, password);
    if (outcome.error) return res.status(502).json({ error: outcome.error });
    if (outcome.id !== row.auth_user_id) await supabase.from("fixed_account_auth").update({ auth_user_id: outcome.id }).eq("slot", slot);
    return res.status(200).json({ ok: true });
  }

  if (!["staff_accounts", "portal_accounts"].includes(table) || !id) {
    return res.status(400).json({ error: "Invalid table or id" });
  }
  const { data: row } = await supabase.from(table).select("auth_user_id").eq("id", id).maybeSingle();
  if (!row) return res.status(404).json({ error: "Account not found" });

  const prefix = table === "staff_accounts" ? "staff" : "portal";
  const email = `${prefix}-${id}@${AUTH_DOMAIN}`;
  const outcome = await syncAuthUser(supabase, row.auth_user_id, email, password);
  if (outcome.error) return res.status(502).json({ error: outcome.error });

  const update = { password, auth_user_id: outcome.id };
  if (mustChangePassword !== undefined) update.must_change_password = mustChangePassword;
  const { error: updateError } = await supabase.from(table).update(update).eq("id", id);
  if (updateError) return res.status(500).json({ error: updateError.message });

  res.status(200).json({ ok: true });
}

async function syncAuthUser(supabase, existingAuthUserId, email, password) {
  if (existingAuthUserId) {
    const { error } = await supabase.auth.admin.updateUserById(existingAuthUserId, { password });
    if (error) return { error: error.message };
    return { id: existingAuthUserId };
  }
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) return { error: error.message };
  return { id: data.user.id };
}
