// Receives parsed HL7 results from a local bridge script (e.g.
// lis-bridge/sysmex-bridge.js) running on a lab PC with network access to
// an analyzer. Stores them raw in lis_incoming_results for a human to
// review — see that table's comment for why nothing here writes to
// qc_entries automatically.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const providedKey = req.headers?.authorization?.replace("Bearer ", "") || req.body?.key;
  if (!process.env.LIS_BRIDGE_SECRET || providedKey !== process.env.LIS_BRIDGE_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: "Missing Supabase env vars" });

  const { deviceName, sampleId, rawMessage, parsed } = req.body || {};
  if (!deviceName || !rawMessage) return res.status(400).json({ error: "Missing deviceName or rawMessage" });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { error } = await supabase.from("lis_incoming_results").insert({
    device_name: deviceName,
    sample_id: sampleId || null,
    raw_message: rawMessage,
    parsed: parsed || [],
  });
  if (error) return res.status(500).json({ error: error.message });

  res.status(200).json({ ok: true });
}
