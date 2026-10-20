// الاشتراك في الإشعارات على هالجهاز
import { api } from "./api";

const DEVICE_KEY = "wad_device";

export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

export function getDevice() {
  try { return JSON.parse(localStorage.getItem(DEVICE_KEY)) || null; } catch { return null; }
}
function setDevice(d) {
  try { d ? localStorage.setItem(DEVICE_KEY, JSON.stringify(d)) : localStorage.removeItem(DEVICE_KEY); } catch { /* التخزين مقفل */ }
}

const toKey = (b64) => {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

export async function subscribe({ name, mode }) {
  if (!pushSupported()) throw new Error("هالمتصفح ما يدعم الإشعارات");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("ما سمحت بالإشعارات. فعّلها من إعدادات الجوال للموقع.");
  const reg = await navigator.serviceWorker.ready;
  const { key } = await api.pushKey();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) });
  const saved = await api.pushSubscribe({ subscription: sub.toJSON(), name, mode });
  setDevice(saved);
  return saved;
}

export async function unsubscribe() {
  const d = getDevice();
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch { /* نكمل الحذف من السيرفر */ }
  if (d) await api.pushUnsubscribe(d.id);
  setDevice(null);
}
