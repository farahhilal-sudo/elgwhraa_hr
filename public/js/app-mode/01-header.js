'use strict';
/* app-mode/01-header.js — وضع التطبيق (موبايل): الأيقونات والهيدر والشريط */

/* ====== وضع التطبيق (شكل الموبايل زي الشاشات المرجعية) — بيشتغل بس لما is-app ====== */
const G = (inner) => `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
const FI = {
  b_sched: '<circle cx="10" cy="7.2" r="3.8" fill="currentColor"/><path d="M3 19.5c0-3.7 3-6 7-6 1.3 0 2.5.2 3.5.7a5.2 5.2 0 0 0-.9 3c0 .8.2 1.6.5 2.3H3z" fill="currentColor"/><circle cx="18" cy="17.2" r="4.4" fill="currentColor" opacity=".55"/><path d="M16 17.3l1.4 1.4 2.6-2.8" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  b_dash: '<rect x="3" y="3" width="8" height="8" rx="2.2" fill="currentColor" opacity=".45"/><rect x="13" y="3" width="8" height="13" rx="2.2" fill="currentColor"/><rect x="3" y="13" width="8" height="8" rx="2.2" fill="currentColor"/><rect x="13" y="18" width="8" height="3" rx="1.5" fill="currentColor" opacity=".45"/>',
  b_team: '<circle cx="12" cy="8" r="3.6" fill="currentColor"/><path d="M5.5 20c0-3.6 2.7-5.8 6.5-5.8s6.5 2.2 6.5 5.8z" fill="currentColor"/><circle cx="4.8" cy="9.6" r="2.3" fill="currentColor" opacity=".5"/><circle cx="19.2" cy="9.6" r="2.3" fill="currentColor" opacity=".5"/><path d="M1 18c0-2.3 1.6-3.8 4-3.8.5 0 1 .1 1.4.2-1 .9-1.6 2.1-1.8 3.6H1zM23 18c0-2.3-1.6-3.8-4-3.8-.5 0-1 .1-1.4.2 1 .9 1.6 2.1 1.8 3.6H23z" fill="currentColor" opacity=".5"/>',
  b_menu: '<rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="currentColor" opacity=".22"/><path d="M7 9h10M7 12.5h10M7 16h10" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  b_clock: '<circle cx="12" cy="12" r="9.5" fill="currentColor" opacity=".25"/><path d="M12 6.5V12l3.5 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  plus: G('<path d="M12 4.5v15M4.5 12h15"/>'),
  bell: G('<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  sliders: G('<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>'),
  search: G('<circle cx="11" cy="11" r="6.5"/><path d="M16.5 16.5L21 21"/>'),
  back: G('<path d="M9 5l7 7-7 7"/>'),
  chev_l: G('<path d="M15 5l-7 7 7 7"/>'),
  chev_up: G('<path d="M6 15l6-6 6 6"/>'),
  chev_dn: G('<path d="M6 9l6 6 6-6"/>'),
  info_fill: '<circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M12 11v5.2" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7.9" r="1.2" fill="#fff"/>',
  clock_c: G('<path d="M12 6.5V12l3.2 2"/>'),
  pin: G('<path d="M12 21s-6.5-5.4-6.5-10.2a6.5 6.5 0 0 1 13 0C18.5 15.6 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>'),
  in_m: G('<path d="M4 12h11M11 8l4 4-4 4M20 5v14"/>'),
  out_m: G('<path d="M20 12H9M13 8l-4 4 4 4M4 5v14"/>'),
  sq_in: G('<path d="M3.5 12h10M10 8.2l3.8 3.8-3.8 3.8"/><path d="M16 4.5h2.2A1.8 1.8 0 0 1 20 6.3v11.4a1.8 1.8 0 0 1-1.8 1.8H16"/>'),
  sq_out: G('<path d="M20.5 12h-10M14 8.2L10.2 12l3.8 3.8"/><path d="M8 4.5H5.8A1.8 1.8 0 0 0 4 6.3v11.4a1.8 1.8 0 0 0 1.8 1.8H8"/>'),
  calsearch: G('<rect x="3" y="4.5" width="15.5" height="15.5" rx="3"/><path d="M3 9.8h15.5M8 2.8v3.4M13.5 2.8v3.4"/><circle cx="16.8" cy="16.8" r="3.4" fill="var(--abg,#fff)"/><path d="M19.4 19.4L22 22"/>'),
  q_swap: G('<path d="M5 12a7 7 0 0 1 12-4.9L19 9M19 4.5V9h-4.5M19 12a7 7 0 0 1-12 4.9L5 15M5 19.5V15h4.5"/>'),
  q_in: '<rect x="13" y="4.5" width="7.5" height="15" rx="2.2" fill="currentColor" opacity=".35"/><path d="M3.5 12H14M10.3 8.3L14 12l-3.7 3.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  q_file: '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H13l6 6v9.5A2.5 2.5 0 0 1 16.5 21h-9A2.5 2.5 0 0 1 5 18.5z" fill="currentColor" opacity=".3"/><path d="M13 3l6 6h-3.5A2.5 2.5 0 0 1 13 6.5z" fill="currentColor"/><text x="11.5" y="17.4" font-size="9" font-weight="800" fill="currentColor" text-anchor="middle" font-family="Arial,sans-serif">?</text>',
  q_dollar: '<circle cx="12" cy="12" r="9" fill="currentColor"/><text x="12" y="16.4" font-size="12" font-weight="800" fill="#fff" text-anchor="middle" font-family="Arial,sans-serif">$</text>',
  q_userplus: '<circle cx="10" cy="8" r="4" fill="currentColor"/><path d="M2.5 20.5c0-4 3.2-6.4 7.5-6.4 1 0 2 .1 2.8.4a5.2 5.2 0 0 0-.8 2.8c0 1.2.4 2.4 1.1 3.2z" fill="currentColor" opacity=".55"/><circle cx="18" cy="17" r="4" fill="currentColor"/><path d="M18 15v4M16 17h4" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>',
  q_task: '<rect x="4.5" y="4" width="15" height="17" rx="3" fill="currentColor" opacity=".3"/><rect x="8.5" y="2" width="7" height="4" rx="1.5" fill="currentColor"/><path d="M8.5 12h7M8.5 16h4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  logout: G('<path d="M4 12h12M12 7.5l4.5 4.5-4.5 4.5"/><path d="M17 4.5h1.5A1.5 1.5 0 0 1 20 6v12a1.5 1.5 0 0 1-1.5 1.5H17"/>'),
};
const fi = (n, cls = '') => `<svg class="ico fi ${cls}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${FI[n] || ''}</svg>`;
// أيقونات كروت القائمة الملوّنة
const CI = {
  att: '<circle cx="12" cy="12" r="9.2" fill="none" stroke="#2c3138" stroke-width="1.8"/><path d="M12 7.2v5.6" stroke="#2c3138" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.5" r="1.15" fill="#2c3138"/>',
  req: '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H13l6 6v9.5A2.5 2.5 0 0 1 16.5 21h-9A2.5 2.5 0 0 1 5 18.5z" fill="#cfe2f6"/><path d="M13 3l6 6h-3.5A2.5 2.5 0 0 1 13 6.5z" fill="#2d6cc4"/><text x="11.5" y="17.4" font-size="9.5" font-weight="800" fill="#2d6cc4" text-anchor="middle" font-family="Arial,sans-serif">?</text>',
  inbox: '<rect x="3" y="6.5" width="18" height="13" rx="3.2" fill="#cddff2"/><path d="M6.5 11l5.5 3.4 5.5-3.4" fill="none" stroke="#2d6cc4" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="19" cy="5.5" r="3" fill="#2d6cc4"/>',
  list: '<rect x="3" y="3" width="18" height="18" rx="5" fill="#cdeaf9"/><path d="M7 9.2l1.4 1.4L10.8 8M13 9.4h4M7 15.4l1.4 1.4 2.4-2.6M13 15.6h4" fill="none" stroke="#0e8fd0" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  money: '<circle cx="12" cy="12" r="9.5" fill="#cdeed6"/><text x="12" y="16.6" font-size="12.5" font-weight="800" fill="#1fa545" text-anchor="middle" font-family="Arial,sans-serif">$</text>',
  slip: '<path d="M6 3h12v17.5l-3-1.8-3 1.8-3-1.8-3 1.8z" fill="#d6f0dd"/><path d="M9 8h6M9 11.5h6M9 15h3.5" stroke="#1fa545" stroke-width="1.6" stroke-linecap="round"/>',
  penalty: '<circle cx="10" cy="8" r="4" fill="#a6b222"/><path d="M3 21c0-4 3-6.5 7-6.5s7 2.5 7 6.5z" fill="#eaedc0"/><circle cx="18" cy="16.6" r="3.7" fill="#a6b222"/><path d="M16.3 16.6h3.4" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3.5" fill="#fde5c8"/><path d="M3 10h18" stroke="#f08a1c" stroke-width="1.8"/><path d="M8 3v4M16 3v4" stroke="#f08a1c" stroke-width="2" stroke-linecap="round"/><rect x="7" y="13" width="3.2" height="3.2" rx=".8" fill="#f08a1c"/><rect x="13.5" y="13" width="3.2" height="3.2" rx=".8" fill="#f08a1c" opacity=".55"/>',
  users: '<circle cx="9" cy="8" r="3.6" fill="#14a9b7"/><path d="M2 20c0-3.6 3-5.8 7-5.8s7 2.2 7 5.8z" fill="#c9eef2"/><circle cx="17.5" cy="9" r="2.6" fill="#7fd0d9"/><path d="M17.5 14.2c2.6 0 4.5 1.6 4.5 4.3v1.5h-4" fill="#c9eef2"/>',
  user: '<circle cx="12" cy="8" r="4.2" fill="#3b82f6"/><path d="M4 21c0-4.2 3.6-6.8 8-6.8s8 2.6 8 6.8z" fill="#cfe0fb"/>',
  userplus: '<circle cx="10" cy="8" r="4" fill="#3b82f6"/><path d="M2.5 21c0-4 3.4-6.5 7.5-6.5 1 0 2 .1 2.8.4a5.2 5.2 0 0 0-.8 2.9c0 1.2.4 2.3 1.1 3.2z" fill="#cfe0fb"/><circle cx="18" cy="17" r="4" fill="#3b82f6"/><path d="M18 15v4M16 17h4" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>',
  key: '<circle cx="8.5" cy="14.5" r="4.5" fill="#e7defc"/><circle cx="8.5" cy="14.5" r="1.4" fill="#7c4ddb"/><path d="M12 11.5L20 3.5M16.5 7l3 3M14.3 9.2l2.2 2.2" stroke="#7c4ddb" stroke-width="2" stroke-linecap="round"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="3" fill="#e7defc"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="#7c4ddb" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="15.7" r="1.5" fill="#7c4ddb"/>',
  doc: '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H13l6 6v9.5A2.5 2.5 0 0 1 16.5 21h-9A2.5 2.5 0 0 1 5 18.5z" fill="#dfe4fb"/><path d="M13 3l6 6h-3.5A2.5 2.5 0 0 1 13 6.5z" fill="#5468d6"/><path d="M8.5 13h7M8.5 16.5h5" stroke="#5468d6" stroke-width="1.6" stroke-linecap="round"/>',
  org: '<rect x="9" y="3" width="6" height="5" rx="1.5" fill="#14a9b7"/><rect x="2.5" y="16" width="6" height="5" rx="1.5" fill="#7fd0d9"/><rect x="15.5" y="16" width="6" height="5" rx="1.5" fill="#7fd0d9"/><path d="M12 8v4M5.5 16v-4h13v4" fill="none" stroke="#14a9b7" stroke-width="1.7" stroke-linejoin="round"/>',
  swap: '<path d="M4 8h13l-3.2-3.2M20 16H7l3.2 3.2" fill="none" stroke="#1d9bf0" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  pause: '<circle cx="12" cy="12" r="9.5" fill="#fcd9d9"/><path d="M10 8.8v6.4M14 8.8v6.4" stroke="#e24141" stroke-width="2.2" stroke-linecap="round"/>',
  timer: '<circle cx="12" cy="13.2" r="8" fill="#fde5c8"/><path d="M12 8.8v4.8l3 1.8M9.5 2.8h5" fill="none" stroke="#f08a1c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  chart: '<rect x="3.5" y="12" width="4.6" height="8.5" rx="1.3" fill="#f6b04a"/><rect x="9.7" y="4" width="4.6" height="16.5" rx="1.3" fill="#f08a1c"/><rect x="15.9" y="9" width="4.6" height="11.5" rx="1.3" fill="#f9cd86"/>',
  building: '<path d="M4.5 20.5V6.5A2 2 0 0 1 6.5 4.5H13a2 2 0 0 1 2 2v14z" fill="#c4ecd0"/><path d="M15 9.5h2.5a2 2 0 0 1 2 2v9H15z" fill="#27b24a"/><path d="M8 8.5h3M8 12h3M8 15.5h3" stroke="#27b24a" stroke-width="1.7" stroke-linecap="round"/><path d="M2.5 20.5h19" stroke="#27b24a" stroke-width="1.8" stroke-linecap="round"/>',
  bolt: '<path d="M13.5 2.5L5 13.2h6L10 21.5l9-11.2h-6.2z" fill="#f9cd86" stroke="#f08a1c" stroke-width="1.6" stroke-linejoin="round"/>',
  bellx: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" fill="#fcd9d9"/><path d="M10 20a2 2 0 0 0 4 0" fill="none" stroke="#e24141" stroke-width="1.8" stroke-linecap="round"/><path d="M4 4l16 16" stroke="#e24141" stroke-width="2" stroke-linecap="round"/>',
  sliders: '<rect x="3" y="3" width="18" height="18" rx="5" fill="#cdeaf9"/><path d="M7 9h6M17 9h0M7 15h0M11 15h6" stroke="#0e8fd0" stroke-width="1.8" stroke-linecap="round"/><circle cx="15.5" cy="9" r="1.9" fill="#fff" stroke="#0e8fd0" stroke-width="1.6"/><circle cx="8.5" cy="15" r="1.9" fill="#fff" stroke="#0e8fd0" stroke-width="1.6"/>',
  clock: '<circle cx="12" cy="12" r="9.5" fill="#cdeaf9"/><path d="M12 6.8V12l3.5 2.1" fill="none" stroke="#0e8fd0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  absent: '<circle cx="12" cy="12" r="9.5" fill="#fcd9d9"/><path d="M5.5 5.5l13 13" stroke="#e24141" stroke-width="2.2" stroke-linecap="round"/>',
  late: '<circle cx="12" cy="13" r="8.2" fill="#fde5c8"/><path d="M12 8.5v5l3 1.7M9.5 3h5" fill="none" stroke="#f08a1c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  present: '<rect x="3" y="5" width="18" height="16" rx="3.5" fill="#c4ecd0"/><path d="M3 10h18" stroke="#27b24a" stroke-width="1.8"/><path d="M8 3v4M16 3v4" stroke="#27b24a" stroke-width="2" stroke-linecap="round"/><path d="M8.5 15.2l2.4 2.4 4.6-4.8" fill="none" stroke="#27b24a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  hourglass: '<path d="M7 3h10M7 21h10M8 3c0 4 3 5 4 9-1 4-4 5-4 9M16 3c0 4-3 5-4 9 1 4 4 5 4 9" fill="none" stroke="#e24141" stroke-width="2" stroke-linecap="round"/><path d="M9.2 18.6c.8-1.2 1.8-1.6 2.8-1.6s2 .4 2.8 1.6z" fill="#f1a1a1"/>',
};
const ci = (n, cls = '') => `<svg class="cic ${cls}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${CI[n] || CI.doc}</svg>`;
const CARD_IC = { employees: 'list', workgroups: 'users', teams: 'users', emp_procedures: 'doc', emp_docs: 'doc', org_chart: 'org', transfers_log: 'swap', title_changes: 'user', suspension_log: 'pause', pending_suspensions: 'pause', permissions: 'lock', requests: 'inbox', attendance: 'clock', payroll: 'money', adjustments: 'penalty', tiers: 'timer', reports: 'chart', set_company: 'building', set_attendance: 'clock', set_finance: 'money', set_documents: 'doc', set_automation: 'bolt', set_overrides: 'bellx', set_misc: 'sliders' };
const PAGE_LABELS = { attendance: 'سجل حضور الموظفين', employees: 'قائمة الموظفين', payroll: 'رواتب الموظفين', adjustments: 'جزاءات ومكافآت الموظفين' };
const pageTitles = () => {
  const t = { me: 'حسابي', menu: 'القائمة', dashboard: 'لوحة المعلومات', employees: 'الموظفون', home: 'الجدول', requests: 'الطلبات الواردة' };
  MENU.forEach((m) => (m.g ? m.items.forEach((i) => { t[i[0]] = t[i[0]] || i[1]; }) : (t[m.id] = t[m.id] || m.t)));
  return t;
};

/* الهيدر العلوي لكل شاشة */
function appHeader() {
  const u = S.me.user, p = S.page, ini = esc(initials(u.name));
  const bell = `<button class="ab-circle" id="abell" aria-label="الإشعارات">${fi('bell')}${S.me.unread ? `<span class="dot">${S.me.unread}</span>` : ''}</button>`;
  if (p === 'home') {
    return `<header class="ahead home"><div class="avatar big">${ini}</div><div class="info"><b>${esc(u.name)}</b><span>${esc(u.job_title || (u.is_admin ? 'مدير النظام' : 'موظف'))}</span><span>${esc(u.department || '')}</span></div>${bell}</header>`;
  }
  let a = '<span></span>', b = bell;
  if (p === 'dashboard') a = `<button class="ab-av" id="aav" aria-label="حسابي"><span class="avatar">${ini}</span></button>`;
  else if (p === 'employees' && (S.emptab || 'list') === 'list') { a = `<button class="ab-circle" id="hsearch" aria-label="بحث">${fi('search')}</button>`; b = `<button class="ab-circle" id="hfilter" aria-label="تصفية">${fi('sliders')}</button>`; }
  else if (p !== 'menu') a = `<button class="ab-circle" id="aback" aria-label="رجوع">${fi('back')}</button>`;
  return `<header class="ahead plain">${a}<h1>${esc(pageTitles()[p] || '')}</h1>${b}</header>`;
}
function bindAppHeader() {
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on('#abell', showNotes);
  on('#aback', () => go('menu'));
  on('#aav', () => go('me'));
  on('#hsearch', () => S.pg && S.pg.search && S.pg.search());
  on('#hfilter', () => S.pg && S.pg.filter && S.pg.filter());
}

/* شريط الأيام (بيتبني مرة واحدة وبيتلوّن عند كل اختيار) */
function paintStrip(el, days, sel, dotFn, onPick) {
  if (!el.children.length) {
    el.innerHTML = days.map((d) => `<button class="day" data-d="${d}"><b>${Number(d.slice(8))}</b><i></i></button>`).join('');
    el.onclick = (e) => { const b = e.target.closest('.day'); if (b && el._pick) el._pick(b.dataset.d); };
    const i = Math.max(0, days.indexOf(sel) - 2), w = el.children[0].offsetWidth || 0;
    el.scrollLeft = getComputedStyle(el).direction === 'rtl' ? -i * w : i * w;
  }
  el._pick = onPick;
  el.querySelectorAll('.day').forEach((b) => {
    const d = b.dataset.d, on = d === sel;
    b.classList.toggle('on', on);
    b.lastChild.style.background = on ? '#0ea5e9' : dotFn(d);
  });
}
