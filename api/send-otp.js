// Sends a 6-digit sign-in code by email via Resend, for accounts that have
// set an email in "My profile". Uses the service role key (not the anon
// key) so the code is written to otp_codes without exposing it to the
// browser — see ADD_EMAIL_OTP.sql for why that table has no anon policies.
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: "Missing username" });
  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: "Missing Supabase env vars" });
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: "Missing RESEND_API_KEY" });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: profile } = await supabase.from("user_profiles").select("email").eq("username", username).maybeSingle();
  const email = (profile?.email || "").trim();
  if (!email) return res.status(400).json({ error: "No email on file for this account" });

  const { data: recent } = await supabase
    .from("otp_codes")
    .select("created_at")
    .eq("username", username)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent && Date.now() - new Date(recent.created_at).getTime() < 30000) {
    return res.status(429).json({ error: "Please wait a few seconds before requesting another code" });
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  await supabase.from("otp_codes").insert({ username, code, expires_at: expiresAt });

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || "QC Log <onboarding@resend.dev>",
      to: email,
      subject: "Your sign-in code",
      text: `Your verification code is ${code}. It expires in 5 minutes.\n\n— Rabia Hospital Lab Family`,
    }),
  });
  if (!emailRes.ok) {
    const detail = await emailRes.text();
    return res.status(502).json({ error: `Failed to send email: ${detail}` });
  }

  res.status(200).json({ ok: true, email: maskEmail(email) });
}

function maskEmail(email) {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  return `${name.slice(0, 2)}${"*".repeat(Math.max(name.length - 2, 1))}@${domain}`;
}
