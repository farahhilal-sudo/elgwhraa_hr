// خدمة بسيطة تخلّي الموقع يتثبت كتطبيق. البيانات دايماً من الإنترنت.
const CACHE = 'hr-shell-v16';
const FACE = 'hr-face-v1'; // مكتبة الوجه ونماذجها (حوالي 7MB) بتتحمّل مرة واحدة بس وبعدها فورية
const SHELL = ['/', '/style.css', '/app.js', '/icon.svg', '/icon-192.png', '/manifest.json'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== FACE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === 'GET' && ['cdn.jsdelivr.net', 'fastly.jsdelivr.net', 'unpkg.com'].includes(url.hostname) && url.pathname.includes('face-api')) {
    e.respondWith(caches.open(FACE).then((c) => c.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }))));
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('/'))));
});
