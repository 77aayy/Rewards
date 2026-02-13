// إصدار جديد بعد كل نشر = يلغي الكاش القديم ويفرض تحميل ملفات التطبيق من الشبكة
const CACHE_NAME = 'elite-rewards-v8';
const urlsToCache = [
  '/',
  '/index.html',
  '/src/app.js',
  '/src/app-extensions.js',
  '/src/styles.css',
  '/manifest.json'
];

// طلبات التطبيق (نفس المنشأ): نعاملها Network-First حتى تظهر آخر نسخة بعد النشر
function isAppRequest(url) {
  try {
    const u = new URL(url);
    if (u.origin !== self.location.origin) return false;
    const path = u.pathname;
    return path === '/' || path === '/index.html' ||
      path === '/src/app.js' || path === '/src/app-extensions.js' ||
      path === '/src/styles.css' || path === '/manifest.json';
  } catch (_) { return false; }
}

// طلبات Firebase Storage: نمررها للشبكة دون اعتراض (تجنب CORS عند fetch من SW)
function isFirebaseStorageRequest(url) {
  try {
    const u = new URL(url);
    return u.hostname === 'firebasestorage.googleapis.com';
  } catch (_) { return false; }
}

// Install: تخزين أولي للاستخدام عند انقطاع النت
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .catch(() => {})
  );
  self.skipWaiting();
});

// Fetch: Network-First لملفات التطبيق، والباقي Cache-First (أصول خارجية مثل CDN نمررها للشبكة)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') {
    event.respondWith(fetch(req));
    return;
  }
  if (isFirebaseStorageRequest(req.url)) {
    event.respondWith(fetch(req));
    return;
  }
  if (!isAppRequest(req.url)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
    return;
  }
  // تطبيق: Network-First ثم الكاش عند الفشل
  event.respondWith(
    fetch(req)
      .then(function(netRes) {
        const clone = netRes.clone();
        caches.open(CACHE_NAME).then(function(cache) { return cache.put(req, clone); }).catch(function() {});
        return netRes;
      })
      .catch(function() {
        return caches.match(req).then(function(cached) {
          return cached || new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
      })
  );
});

// Activate: حذف كل الكاشات القديمة وإظهار هذا الإصدار فوراً
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
        })
      );
    }).then(() => self.clients.claim())
  );
});
