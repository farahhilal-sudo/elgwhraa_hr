'use strict';
/* app-mode/10-i18n.js — لغة تطبيق الموظف (إنجليزي زي الشاشات المرجعية / عربي) بزرار Language في القائمة. الاختيار بيتحفظ على الجهاز */
let APP_LANG = 'en';
try { APP_LANG = localStorage.getItem('app_lang') || 'en'; } catch { /* تجاهل */ }
const isAr = () => APP_LANG === 'ar';
const t = (k, p) => { let s = isAr() && AR_STR[k] !== undefined ? AR_STR[k] : k; if (p) for (const x in p) s = s.split('{' + x + '}').join(p[x]); return s; };
const LOC = () => (isAr() ? 'ar-EG-u-nu-latn' : 'en-US');
function applyLang() {
  if (!IS_APP) return;
  const h = document.documentElement;
  h.lang = isAr() ? 'ar' : 'en'; h.dir = isAr() ? 'rtl' : 'ltr';
}
function setLang(l) { APP_LANG = l; try { localStorage.setItem('app_lang', l); } catch { /* تجاهل */ } renderShell(); }
// تواريخ ووقت بلغة التطبيق
const ymd = (d) => new Date(d + 'T00:00:00Z');
const mName = (d) => ymd(d).toLocaleDateString(LOC(), { month: 'long', timeZone: 'UTC' });
const monthYear = (d) => ymd(d).toLocaleDateString(LOC(), { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dowName = (d) => ymd(d).toLocaleDateString(LOC(), { weekday: 'long', timeZone: 'UTC' });
const dMonY = (d) => ymd(d).toLocaleDateString(isAr() ? LOC() : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }); // 01 Nov 2026
function tmA(hhmm) { // "08:30" → 8:30 am / 8:30 ص
  const [h, m] = String(hhmm || '00:00').split(':').map(Number), am = h < 12;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${isAr() ? (am ? 'ص' : 'م') : (am ? 'am' : 'pm')}`;
}
const tmAP = (hhmm) => { const s = tmA(hhmm); return isAr() ? s : s.replace(/^(\d):/, '0$1:').replace(' am', ' AM').replace(' pm', ' PM'); }; // 08:30 AM
const isoHM = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '');
const isoTime = (iso) => (iso ? tmA(isoHM(iso)) : '--:--');
function ago(utc) { // created_at بتوقيت UTC (YYYY-MM-DD HH:MM:SS)
  const s = Math.max(0, (Date.now() - new Date(String(utc).replace(' ', 'T') + 'Z').getTime()) / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d >= 30) return dMonY(String(utc).slice(0, 10));
  if (d >= 2) return t('{n} Days Ago', { n: d });
  if (d === 1) return t('A Day Ago');
  if (h >= 1) return t('{n} Hours Ago', { n: h });
  if (m >= 1) return t('{n} Minutes Ago', { n: m });
  return t('Just Now');
}
const hms = (sec) => { const s = Math.max(0, Math.round(sec)); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((x) => String(x).padStart(2, '0')).join(':'); };
const AR_STR = {};
