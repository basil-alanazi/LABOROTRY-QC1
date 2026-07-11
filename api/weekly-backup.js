// Runs weekly (see cron-job.org setup). Snapshots every table to a JSON file
// in Supabase Storage, and prunes snapshots older than 8 weeks so storage
// doesn't grow forever. This is read-only against your live tables — it only
// ever writes to the backups folder, never touches your real data.
import { createClient } from "@supabase/supabase-js";

const TABLES = [
  "qc_panels", "qc_baselines", "qc_entries", "qc_control_lots",
  "staff_members", "shift_templates", "schedule_entries", "department_assignments",
  "break_sessions", "department_swap_requests", "custom_tables", "custom_rows",
  "riqas_programs", "riqas_cycles", "reject_samples", "panic_values",
  "corrective_actions", "infection_diseases", "equipment", "equipment_events",
  "user_profiles", "audit_log",
];

const BUCKET = "attachments";
const FOLDER = "system-backups";
const RETENTION_WEEKS = 8;

export default async function handler(req, res) {
  const providedKey = req.query?.key || (req.headers?.authorization || "").replace("Bearer ", "");
  if (!process.env.CRON_SECRET || providedKey !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: "Missing Supabase env vars" });
  const supabase = createClient(supabaseUrl, supabaseKey);

  const snapshot = {};
  let totalRows = 0;
  const errors = [];
  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) { errors.push(`${table}: ${error.message}`); continue; }
    snapshot[table] = data || [];
    totalRows += (data || []).length;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const path = `${FOLDER}/backup-${stamp}.json`;
  const body = JSON.stringify({ createdAt: new Date().toISOString(), totalRows, tables: snapshot });

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, new Blob([body], { type: "application/json" }), { upsert: true });
  if (upErr) return res.status(500).json({ error: "Upload failed: " + upErr.message });

  await supabase.from("backup_log").insert({ row_count: totalRows, created_by: "automatic-weekly" });

  // Prune old automatic snapshots beyond the retention window.
  const { data: existing } = await supabase.storage.from(BUCKET).list(FOLDER);
  if (existing) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_WEEKS * 7);
    const stale = existing.filter((f) => {
      const m = f.name.match(/backup-(\d{4}-\d{2}-\d{2})\.json/);
      return m && new Date(m[1]) < cutoff;
    }).map((f) => `${FOLDER}/${f.name}`);
    if (stale.length > 0) await supabase.storage.from(BUCKET).remove(stale);
  }

  res.status(200).json({ ok: true, totalRows, path, errors });
}
