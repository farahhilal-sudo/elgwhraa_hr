'use strict';
/* boot.js — التشغيل: تسجيل خدمة التطبيق (PWA) وبدء الدخول */


/* ====== تشغيل ====== */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
if (S.token) boot(); else renderLogin();
