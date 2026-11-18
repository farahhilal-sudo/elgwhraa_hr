'use strict';
/* core/07-helpers.js — دوال مشتركة بين الصفحات: ساعات وتواريخ (fmt12/addDays/dmy/clock12) وقايمة منسدلة popMenu */
const fmt12 = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return `${String(h % 12 || 12).padStart(2, '0')}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'م' : 'ص'}`; };
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const timeAr = (iso) => (iso ? new Date(iso).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: TZ }) : '');
const dmy = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');
const dmyDash = (d) => `${new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })} ${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;
const clock12 = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: TZ }) : '');
/* قائمة منسدلة صغيرة (زي قائمة ⋯ في الشاشة) */
function popMenu(btn, items) {
  document.querySelectorAll('.pmenu').forEach((m) => m.remove());
  const m = document.createElement('div');
  m.className = 'pmenu';
  m.innerHTML = items.map((it, i) => `<button data-i="${i}" class="${it.cls || ''}">${ico(it.ic)}<span>${it.t}</span></button>`).join('');
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect();
  const top = r.bottom + 6 + m.offsetHeight > innerHeight ? r.top - 6 - m.offsetHeight : r.bottom + 6;
  m.style.top = Math.max(8, top) + 'px';
  m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, innerWidth - m.offsetWidth - 8)) + 'px';
  const close = () => { m.remove(); document.removeEventListener('click', close, true); window.removeEventListener('scroll', close, true); };
  m.querySelectorAll('button').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); close(); items[Number(b.dataset.i)].fn(); }));
  setTimeout(() => { document.addEventListener('click', close, true); window.addEventListener('scroll', close, true); });
}
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
