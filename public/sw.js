// خدمة بسيطة تخلّي الموقع يتثبت كتطبيق. البيانات دايماً من الإنترنت.
const CACHE = 'hr-shell-v16';
const FACE = 'hr-face-v1'; // مكتبة الوجه ونماذجها (حوالي 7MB) بتتحمّل مرة واحدة بس وبعدها فورية
// ملفات الواجهة (css + js) بالترتيب نفسه اللي في index.html
const SHELL = [
  '/',
  '/icon.svg',
  '/icon-192.png',
  '/manifest.json',
  '/css/01-base.css',
  '/css/02-account-page.css',
  '/css/03-components.css',
  '/css/04-punch-perms-modal-login.css',
  '/css/05-app-mode-pwa.css',
  '/css/06-attendance-home.css',
  '/css/07-tabs-filters-cards.css',
  '/css/08-payroll-table.css',
  '/css/09-account-redesign.css',
  '/css/10-font-tuning.css',
  '/css/11-settings.css',
  '/css/12-employees.css',
  '/css/13-font-unify.css',
  '/css/14-app-vs-web.css',
  '/css/15-app-shell-header-bottom.css',
  '/css/16-app-home-menu.css',
  '/css/17-app-dashboard-employees.css',
  '/css/18-policies.css',
  '/css/19-dashboard-web.css',
  '/css/20-photos-maps.css',
  '/css/21-employee-profile.css',
  '/css/22-employee-cards.css',
  '/js/core/01-utils.js',
  '/js/core/02-media.js',
  '/js/core/03-face-location.js',
  '/js/core/04-auth.js',
  '/js/core/05-icons.js',
  '/js/core/06-shell.js',
  '/js/core/07-helpers.js',
  '/js/core/08-tabs-helpers.js',
  '/js/pages/home.js',
  '/js/pages/account-slip.js',
  '/js/pages/account.js',
  '/js/pages/account-requests.js',
  '/js/pages/dashboard.js',
  '/js/pages/employees-tabs.js',
  '/js/pages/employees.js',
  '/js/pages/employee-form.js',
  '/js/pages/attendance-log.js',
  '/js/pages/requests.js',
  '/js/pages/payroll.js',
  '/js/pages/reports.js',
  '/js/pages/permissions.js',
  '/js/pages/adjustments.js',
  '/js/pages/tiers.js',
  '/js/settings/00-constants.js',
  '/js/settings/10-engine.js',
  '/js/settings/20-offices.js',
  '/js/settings/30-schedules.js',
  '/js/settings/40-payroll-presets.js',
  '/js/settings/50-general-form.js',
  '/js/settings/60-policy-core.js',
  '/js/settings/62-policy-wizard.js',
  '/js/settings/64-policy-list.js',
  '/js/settings/70-leaves-holidays.js',
  '/js/settings/90-render.js',
  '/js/app-mode/01-header.js',
  '/js/app-mode/02-menu-quick.js',
  '/js/app-mode/03-dashboard.js',
  '/js/app-mode/04-employees.js',
  '/js/boot.js',
];
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
