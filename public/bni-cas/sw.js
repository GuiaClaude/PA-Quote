// The app moved to /bni-elite-cas-marketing-services/. This retires the old offline copy.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("bni-cas-")) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: "window" })) c.navigate("../bni-elite-cas-marketing-services/");
  })());
});
