// Offline support: saves the whole app on first visit, then serves it from the phone.
// Bump VERSION whenever any file in this folder changes so phones fetch the update.
const VERSION = "bni-elite-cas-v1";
const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "slides/betterpresentations.jpg",
  "slides/botsatwork.jpg",
  "slides/cbb.jpg",
  "slides/cover.jpg",
  "slides/creasia.jpg",
  "slides/crimxon.jpg",
  "slides/digitalhog.jpg",
  "slides/dolcefrutta.jpg",
  "slides/gemini.jpg",
  "slides/halili.jpg",
  "slides/jetstrophy.jpg",
  "slides/joelle.jpg",
  "slides/kubisk.jpg",
  "slides/madkon.jpg",
  "slides/nestmanila.jpg",
  "slides/optogrow.jpg",
  "slides/pagsibol.jpg",
  "slides/player2.jpg",
  "slides/printamplified.jpg",
  "slides/risingdesigns.jpg",
  "slides/rjledesma.jpg",
  "slides/rocketship.jpg",
  "slides/sisi.jpg",
  "slides/spectrum.jpg",
  "slides/trumatch.jpg",
  "slides/work24.jpg",
  "logos/betterpresentations.png",
  "logos/botsatwork.png",
  "logos/creasia.png",
  "logos/crimxon.png",
  "logos/digitalhog.png",
  "logos/dolcefrutta.png",
  "logos/gemini.png",
  "logos/halili.png",
  "logos/jetstrophy.png",
  "logos/kubisk.png",
  "logos/madkon.png",
  "logos/nestmanila.png",
  "logos/pagsibol.png",
  "logos/player2.png",
  "logos/printamplified.png",
  "logos/rjledesma.png",
  "logos/rocketship.png",
  "logos/sisi.png",
  "logos/spectrum.png",
  "logos/trumatch.png",
  "logos/work24.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit ||
      fetch(req).catch(() => req.mode === "navigate" ? caches.match("index.html") : Response.error()))
  );
});
