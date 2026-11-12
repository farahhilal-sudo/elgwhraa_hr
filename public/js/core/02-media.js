'use strict';
/* core/02-media.js — صور وخرايط الحضور (تظهر للمدير) وأدوات صغيرة */
/* ====== صور ومواقع الحضور (تظهر للمدير) ====== */
const photoCache = new Map();
function loadPhoto(id, kind) { // الصورة بتتحمّل عند الطلب فقط (والمتصفح بيحفظها)، وبتتخزّن في الذاكرة طول الجلسة
  const k = id + ':' + kind;
  if (!photoCache.has(k)) {
    photoCache.set(k, fetch(`/api/attendance/${Number(id)}/photo/${kind === 'out' ? 'out' : 'in'}`, { headers: { Authorization: 'Bearer ' + S.token } })
      .then((r) => (r.ok ? r.blob() : null)).then((b) => (b ? URL.createObjectURL(b) : null)).catch(() => null)
      .then((u) => { if (!u) photoCache.delete(k); return u; }));
  }
  return photoCache.get(k);
}
function fillPhotos(root) { // أي <img data-aid data-kind> بتتملي بالصورة
  root.querySelectorAll('img[data-aid]').forEach((img) => loadPhoto(img.dataset.aid, img.dataset.kind).then((u) => { if (u) { img.src = u; img.hidden = false; } else img.closest('.phwrap')?.classList.add('noph'); }));
}
const mapSrc = (lat, lng) => `https://www.google.com/maps?q=${Number(lat)},${Number(lng)}&z=17&hl=ar&output=embed`;
const mapFrame = (lat, lng) => `<iframe loading="lazy" referrerpolicy="no-referrer" title="الموقع" src="${mapSrc(lat, lng)}"></iframe>`;
const hasLL = (a, k) => a && a[k + '_lat'] != null && a[k + '_lng'] != null;
const ICO_EYE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICO_PIN = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');
