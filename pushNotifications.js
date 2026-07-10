import { supabase } from "./supabaseClient";

// Public VAPID key — safe to expose client-side (that's how VAPID is designed).
export const VAPID_PUBLIC_KEY = "BG1GixDqBtaS_l5ZCEtdp31H7NFkzHtN_h4ZErPbO5g3Yy5UlxV3psvqE3dUxJhj9zsdWdDsuluiL2tUJKcTbR0";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

export async function getSubscriptionStatus() {
  if (!pushSupported()) return "unsupported";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? "subscribed" : "unsubscribed";
}

export async function enablePushReminders(username) {
  if (!pushSupported()) throw new Error("Push notifications aren't supported in this browser.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted.");

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
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
