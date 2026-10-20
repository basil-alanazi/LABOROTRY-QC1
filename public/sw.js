// يستقبل الإشعارات ويعرضها، ويفتح الموقع على القسم الصح لما تضغط عليها
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "ود", body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || "ود", {
    body: data.body || "",
    tag: data.tag,
    renotify: true,
    requireInteraction: !!data.alert,
    icon: "/icon.svg",
    badge: "/icon.svg",
    dir: "rtl",
    lang: "ar",
    vibrate: data.alert ? [300, 150, 300, 150, 300] : [150],
    data: { url: data.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin) {
        await c.focus();
        c.postMessage({ type: "open", url });
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
