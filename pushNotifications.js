import { supabase } from "./supabaseClient";

// Public VAPID key — safe to expose client-side (that's how VAPID is designed).
export const VAPID_PUBLIC_KEY = "BG1GixDqBtaS_l5ZCEtdp31H7NFkzHtN_h4ZErPbO5g3Yy5UlxV3psvqE3dUxJhj9zsdWdDsuluiL2tUJKcTbR0";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

export async function getSubscriptionStatus() {
  if (!pushSupported()) return "unsupported";
  try {
    const reg = await withTimeout(navigator.serviceWorker.ready, 8000, "Service worker didn't start in time.");
    const sub = await reg.pushManager.getSubscription();
    return sub ? "subscribed" : "unsubscribed";
  } catch (err) {
    console.error("getSubscriptionStatus failed:", err);
    return "unsubscribed";
  }
}

async function diagnoseRegistration() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return "no registration found at all";
    const states = [];
    if (reg.installing) states.push(`installing (state: ${reg.installing.state})`);
    if (reg.waiting) states.push(`waiting (state: ${reg.waiting.state})`);
    if (reg.active) states.push(`active (state: ${reg.active.state})`);
    return states.length ? states.join(", ") : "registration exists but no worker in any state";
  } catch (err) {
    return `couldn't inspect: ${err.message}`;
  }
}

export async function enablePushReminders(username, onStep) {
  const step = (s) => onStep && onStep(s);
  if (!pushSupported()) throw new Error("Push notifications aren't supported in this browser.");
  step("Asking for permission…");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted.");

  step("Starting background service…");
  let reg;
  try {
    reg = await withTimeout(navigator.serviceWorker.ready, 20000, "TIMEOUT");
  } catch {
    const diagnosis = await diagnoseRegistration();
    throw new Error(`Service worker didn't start in time (${diagnosis}). Try closing and reopening the app.`);
  }
  step("Checking existing subscription…");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    step("Subscribing…");
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  step("Saving…");
  const { error } = await supabase.from("push_subscriptions").upsert(
    { username, endpoint: sub.endpoint, subscription: sub.toJSON() },
    { onConflict: "username,endpoint" }
  );
  if (error) throw new Error(error.message);
  return sub;
}

export async function disablePushReminders(username) {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await supabase.from("push_subscriptions").delete().eq("username", username).eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  }
}
