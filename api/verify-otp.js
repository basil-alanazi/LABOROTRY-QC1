// Checks a submitted sign-in code against the most recent one issued by
// send-otp.js. Runs server-side with the service role key so the code
// itself is never sent to the browser except inside the email.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { username, code } = req.body || {};
  if (!username || !code) return res.status(400).json({ error: "Missing username or code" });
  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: "Missing Supabase env vars" });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: latest } = await supabase
    .from("otp_codes")
    .select("*")
    .eq("username", username)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest || latest.used) return res.status(400).json({ error: "No active code — request a new one" });
  if (new Date(latest.expires_at) < new Date()) return res.status(400).json({ error: "Code expired — request a new one" });
  if (latest.attempts >= 5) return res.status(429).json({ error: "Too many attempts — request a new code" });

  if (latest.code !== String(code).trim()) {
    await supabase.from("otp_codes").update({ attempts: latest.attempts + 1 }).eq("id", latest.id);
    return res.status(400).json({ error: "Incorrect code" });
  }

  await supabase.from("otp_codes").update({ used: true }).eq("id", latest.id);
  res.status(200).json({ valid: true });
}
