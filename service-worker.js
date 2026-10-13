const CACHE_NAME = "quran-book-shell-v1.5.6";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/icons/quran-icon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./css/styles.css",
  "./css/print.css",
  "./js/app.js",
  "./js/router.js",
  "./js/data/quran-meta.js",
  "./js/db/database.js",
  "./js/db/migrations.js",
  "./js/db/repositories.js",
  "./js/modules/attendance.js",
  "./js/modules/backup.js",
  "./js/modules/dashboard.js",
  "./js/modules/expenses.js",
  "./js/modules/groups.js",
  "./js/modules/help.js",
  "./js/modules/memorization.js",
  "./js/modules/payments.js",
  "./js/modules/reminders.js",
  "./js/modules/reports.js",
  "./js/modules/settings.js",
  "./js/modules/setup.js",
  "./js/modules/students.js",
  "./js/modules/subscriptions.js",
  "./js/ui/components.js",
  "./js/ui/layout.js",
  "./js/utils/backup.js",
  "./js/utils/branding.js",
  "./js/utils/currency.js",
  "./js/utils/dates.js",
  "./js/utils/dialogs.js",
  "./js/utils/dom.js",
  "./js/utils/export.js",
  "./js/utils/finance.js",
  "./js/utils/formatting.js",
  "./js/utils/ids.js",
  "./js/utils/validation.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
