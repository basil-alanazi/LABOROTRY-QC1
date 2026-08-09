// One-time (but safe to re-run) migration: creates a real Supabase Auth
// user — with a securely hashed password — for every existing login
// account, and records the link in auth_user_id / fixed_account_auth.
// Only touches accounts that don't have an auth_user_id yet, so re-running
// after new staff/portal accounts are added just picks up the new ones.
//
// Run this once (GET or POST with the migration key) AFTER running
// ADD_AUTH_MIGRATION_STEP1_SAFE.sql, and BEFORE relying on Login.jsx's
// Supabase Auth sign-in path. Existing plaintext-password login keeps
// working throughout — this only adds Auth users, it changes nothing else.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AUTH_DOMAIN = "rabia-lab.internal";

export default async function handler(req, res) {
  const providedKey = req.query?.key || (req.headers?.authorization || "").replace("Bearer ", "");
  if (!process.env.MIGRATION_SECRET || providedKey !== process.env.MIGRATION_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: "Missing Supabase env vars" });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const results = { fixed: [], staff: [], portal: [] };

  const { data: config } = await supabase.from("app_config").select("*").eq("id", 1).maybeSingle();
  const { data: fixedRows } = await supabase.from("fixed_account_auth").select("*");
  for (const row of fixedRows || []) {
    if (row.auth_user_id) { results.fixed.push({ slot: row.slot, skipped: "already migrated" }); continue; }
    const password = config?.[`${row.slot}_password`];
    if (!password) { results.fixed.push({ slot: row.slot, skipped: "no password set" }); continue; }
    const outcome = await createAuthUser(supabase, row.email, password);
    if (outcome.error) { results.fixed.push({ slot: row.slot, error: outcome.error }); continue; }
    await supabase.from("fixed_account_auth").update({ auth_user_id: outcome.id }).eq("slot", row.slot);
    results.fixed.push({ slot: row.slot, created: true });
  }

  const { data: staffAccounts } = await supabase.from("staff_accounts").select("id, username, password, auth_user_id");
  for (const row of staffAccounts || []) {
    if (row.auth_user_id) { results.staff.push({ username: row.username, skipped: "already migrated" }); continue; }
    const email = `staff-${row.id}@${AUTH_DOMAIN}`;
    const outcome = await createAuthUser(supabase, email, row.password);
    if (outcome.error) { results.staff.push({ username: row.username, error: outcome.error }); continue; }
    await supabase.from("staff_accounts").update({ auth_user_id: outcome.id }).eq("id", row.id);
    results.staff.push({ username: row.username, created: true });
  }

  const { data: portalAccounts } = await supabase.from("portal_accounts").select("id, username, password, auth_user_id");
  for (const row of portalAccounts || []) {
    if (row.auth_user_id) { results.portal.push({ username: row.username, skipped: "already migrated" }); continue; }
    const email = `portal-${row.id}@${AUTH_DOMAIN}`;
    const outcome = await createAuthUser(supabase, email, row.password);
    if (outcome.error) { results.portal.push({ username: row.username, error: outcome.error }); continue; }
    await supabase.from("portal_accounts").update({ auth_user_id: outcome.id }).eq("id", row.id);
    results.portal.push({ username: row.username, created: true });
  }

  res.status(200).json(results);
}

async function createAuthUser(supabase, email, password) {
  if (!password) return { error: "empty password" };
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) return { error: error.message };
  return { id: data.user.id };
}
