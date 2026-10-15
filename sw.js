const CACHE_NAME = 'sec-app-v2';
const RUNTIME_CACHE = 'sec-runtime-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

// ספריות חיצוניות שנשמרות במטמון לטעינה מהירה (Tailwind, אייקונים, פונטים)
const CDN_HOSTS = [
  'cdn.tailwindcss.com',
  'unpkg.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

// התקנת ה-Service Worker ושמירת קבצים במטמון
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// הפעלת ה-Service Worker וניקוי מטמונים ישנים
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // קבצי האפליקציה: קודם מהרשת (כדי לקבל גרסה חדשה), ואם אין חיבור - מהמטמון
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((r) => r || caches.match('/index.html'))
        )
    );
    return;
  }

  // ספריות CDN: מוצגות מיד מהמטמון ומתעדכנות ברקע
  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(req);
      const update = fetch(req)
        .then((res) => {
          if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached || Response.error());
      if (cached) {
        e.waitUntil(update);
        return cached;
      }
      return update;
    })());
  }

  // כל השאר (Supabase וכו') - ישירות לרשת, בלי מטמון
});
