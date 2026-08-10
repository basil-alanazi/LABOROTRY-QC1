// Pushes a notification to a chat recipient right after a message is sent.
// Mirrors send-test-notification.js — same push mechanics, triggered by
// InternalChat.jsx instead of a manual button.
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const vapidPublic = "BG1GixDqBtaS_l5ZCEtdp31H7NFkzHtN_h4ZErPbO5g3Yy5UlxV3psvqE3dUxJhj9zsdWdDsuluiL2tUJKcTbR0";
const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { to, from, body } = req.body || {};
  if (!to || !from) return res.status(400).json({ error: "Missing to/from" });
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: "Missing Supabase env vars" });
  if (!vapidPrivate) return res.status(500).json({ error: "Missing VAPID_PRIVATE_KEY" });

  webpush.setVapidDetails("mailto:admin@example.com", vapidPublic, vapidPrivate);
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: subs } = await supabase.from("push_subscriptions").select("*").eq("username", to);
  if (!subs || subs.length === 0) return res.status(200).json({ sent: 0 });

  const preview = String(body || "").slice(0, 120);
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(s.subscription, JSON.stringify({ title: `New message from ${from}`, body: preview, tag: "chat" }));
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  }
  res.status(200).json({ sent });
}
