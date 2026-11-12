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
function fillPhotos(root) { // أي <img data-aid data-kind> بتتملي بالصورة (صور الكروت data-lazy بتتحمّل لما تظهر على الشاشة بس)
  const go = (img) => loadPhoto(img.dataset.aid, img.dataset.kind).then((u) => { if (u) { img.src = u; img.hidden = false; } else img.closest('.phwrap')?.classList.add('noph'); });
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); go(e.target.__img); } }), { rootMargin: '250px' }) : null;
  root.querySelectorAll('img[data-aid]').forEach((img) => { if (io && img.hasAttribute('data-lazy')) { img.parentElement.__img = img; io.observe(img.parentElement); } else go(img); });
}
const fmtTimeSec = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: TZ }) : '');
const empAv = (u, cls = 'lg') => `<div class="avatar ${cls} phwrap av-ph">${u.photo ? `<img alt="" data-lazy data-aid="${Number(u.photo.id)}" data-kind="${u.photo.kind === 'out' ? 'out' : 'in'}" hidden>` : ''}<span class="av-t">${esc(initials(u.name))}</span></div>`;
const ICO_IN = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7l5 5-5 5M3 12h11M21 4v16"/></svg>';
const ICO_OUT = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 7l-5 5 5 5M21 12H10M3 4v16"/></svg>';
const mapSrc = (lat, lng) => `https://www.google.com/maps?q=${Number(lat)},${Number(lng)}&z=17&hl=ar&output=embed`;
const mapFrame = (lat, lng) => `<iframe loading="lazy" referrerpolicy="no-referrer" title="الموقع" src="${mapSrc(lat, lng)}"></iframe>`;
const hasLL = (a, k) => a && a[k + '_lat'] != null && a[k + '_lng'] != null;
const ICO_EYE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICO_PIN = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');
