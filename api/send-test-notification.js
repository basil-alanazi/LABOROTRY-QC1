// Lets someone confirm their push subscription actually works, from the
// "Send test notification" button in My Profile. Mirrors the sending
// logic in send-shift-notifications.js but for one person, on demand.
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const vapidPublic = "BG1GixDqBtaS_l5ZCEtdp31H7NFkzHtN_h4ZErPbO5g3Yy5UlxV3psvqE3dUxJhj9zsdWdDsuluiL2tUJKcTbR0";
const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

export default async function handler(req, res) {
  const username = req.query?.username;
  if (!username) return res.status(400).json({ error: "Missing username" });
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: "Missing Supabase env vars" });
  if (!vapidPrivate) return res.status(500).json({ error: "Missing VAPID_PRIVATE_KEY" });

  webpush.setVapidDetails("mailto:admin@example.com", vapidPublic, vapidPrivate);
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: subs } = await supabase.from("push_subscriptions").select("*").eq("username", username);
  if (!subs || subs.length === 0) return res.status(200).json({ sent: 0 });

  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(s.subscription, JSON.stringify({ title: "Test notification", body: "If you can see this, reminders are working.", tag: "test" }));
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  }
  res.status(200).json({ sent });
}
