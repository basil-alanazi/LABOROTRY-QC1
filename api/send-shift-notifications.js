// Runs on a schedule (see vercel.json). Checks who has a shift starting in
// about an hour, and who just finished a shift, and pushes a notification
// to anyone subscribed. Uses the anon key — fine here since every table's
// RLS policy is "allow all" (see supabase_schema.sql notes).
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
// Public VAPID key — safe to hardcode, it's meant to be public (matches pushNotifications.js).
const vapidPublic = "BG1GixDqBtaS_l5ZCEtdp31H7NFkzHtN_h4ZErPbO5g3Yy5UlxV3psvqE3dUxJhj9zsdWdDsuluiL2tUJKcTbR0";
const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

const RIYADH_OFFSET_MINUTES = 3 * 60;

function riyadhNow() {
  const now = new Date();
  return new Date(now.getTime() + RIYADH_OFFSET_MINUTES * 60000 - now.getTimezoneOffset() * 60000);
}
function toISODate(d) {
  return d.toISOString().slice(0, 10);
}
function minutesFromMidnight(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export default async function handler(req, res) {
  const providedKey = req.query?.key || (req.headers?.authorization || "").replace("Bearer ", "");
  if (!process.env.CRON_SECRET || providedKey !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: "Missing Supabase env vars" });
  if (!vapidPublic || !vapidPrivate) return res.status(500).json({ error: "Missing VAPID env vars" });

  webpush.setVapidDetails("mailto:admin@example.com", vapidPublic, vapidPrivate);
  const supabase = createClient(supabaseUrl, supabaseKey);

  const now = riyadhNow();
  const today = toISODate(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const [{ data: staff }, { data: shifts }, { data: entries }, { data: profiles }, { data: subs }] = await Promise.all([
    supabase.from("staff_members").select("*").eq("deleted", false),
    supabase.from("shift_templates").select("*").eq("deleted", false),
    supabase.from("schedule_entries").select("*").eq("date", today),
    supabase.from("user_profiles").select("*"),
    supabase.from("push_subscriptions").select("*"),
  ]);

  const shiftByCode = {};
  (shifts || []).forEach((s) => { shiftByCode[s.code] = s; });

  const results = [];

  for (const entry of entries || []) {
    const shift = shiftByCode[entry.shift_code];
    if (!shift || shift.is_off || !shift.start_time || !shift.end_time) continue;
    const member = (staff || []).find((s) => s.id === entry.staff_id);
    if (!member) continue;

    const startM = minutesFromMidnight(shift.start_time);
    const minsToStart = startM - nowMinutes;
    const firstName = (member.full_name || "").trim().split(" ")[0] || "there";
    if (minsToStart >= 55 && minsToStart <= 70) {
      const greeting = startM < 12 * 60 ? "Good morning" : "Good evening";
      const title = `${greeting}, ${firstName}! Shift starting soon`;
      const body = `Your ${shift.code} shift starts in about an hour — don't be late.\n— Rabia Hospital Lab Family`;
      results.push(await maybeSend(supabase, member, today, "start_reminder", title, body, profiles, subs));
    }

    const endM = minutesFromMidnight(shift.end_time);
    const minsSinceEnd = nowMinutes - endM;
    if (minsSinceEnd >= 0 && minsSinceEnd <= 15) {
      const title = `Goodbye, ${firstName}! Shift ended`;
      const body = `Your ${shift.code} shift just ended — get home safe.\n— Rabia Hospital Lab Family`;
      results.push(await maybeSend(supabase, member, today, "end_reminder", title, body, profiles, subs));
    }
  }

  res.status(200).json({ checked: (entries || []).length, results });
}

async function maybeSend(supabase, member, date, notifType, title, body, profiles, subs) {
  const { error: logError } = await supabase.from("notification_log").insert({ staff_id: member.id, date, notif_type: notifType });
  if (logError) return { staff: member.full_name, notifType, skipped: "already sent" };

  const profile = (profiles || []).find((p) => p.employee_id && member.job_number && p.employee_id === member.job_number);
  if (!profile) return { staff: member.full_name, notifType, skipped: "no matching profile / employee ID not set" };

  const subscriptions = (subs || []).filter((s) => s.username === profile.username);
  if (subscriptions.length === 0) return { staff: member.full_name, notifType, skipped: "not subscribed" };

  let sent = 0;
  for (const s of subscriptions) {
    try {
      await webpush.sendNotification(s.subscription, JSON.stringify({ title, body, tag: notifType }));
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  }
  return { staff: member.full_name, notifType, sent };
}
