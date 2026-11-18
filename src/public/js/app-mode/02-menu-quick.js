'use strict';
/* app-mode/02-menu-quick.js — وضع التطبيق: صفحة القايمة والإضافة السريعة */

/* القائمة الرئيسية: كروت (نفس الصلاحيات والصفحات الموجودة) */
PAGES.menu = (view) => {
  const u = S.me.user, ok = (id) => allPages().includes(id), T = pageTitles();
  const mk = (ic, t, fn) => ({ ic, t, fn });
  const toP = (id) => ok(id) && mk(CARD_IC[id] || 'doc', PAGE_LABELS[id] || T[id], () => go(id));
  const manage = has('employees.manage');
  const secs = [
    { t: '', cards: [
      mk('att', 'سجل الحضور', () => go('me', { tab: 'attendance' })), mk('req', 'طلباتي', () => go('me', { tab: 'general' })),
      mk('calendar', 'تقويم العمل', () => go('me', { tab: 'calendar' })), mk('money', 'الرواتب', () => go('me', { tab: 'payroll' })),
      mk('slip', 'مفردات الرواتب', () => go('me', { tab: 'slips' })), mk('lock', 'تغيير كلمة المرور', changePassword)] },
    { t: 'الموظفون', cards: [toP('employees'), manage && mk('userplus', 'طلبات الحسابات', () => { S.emptab = 'pending'; go('employees'); }), manage && mk('key', 'استعادة كلمة المرور', () => { S.emptab = 'resets'; go('employees'); }),
      ...['workgroups', 'teams', 'emp_procedures', 'emp_docs', 'org_chart', 'transfers_log', 'title_changes', 'suspension_log', 'pending_suspensions', 'permissions'].map(toP)] },
    { t: 'الطلبات والحضور', cards: [toP('requests'), toP('attendance')] },
    { t: 'المالية والتقارير', cards: ['payroll', 'adjustments', 'tiers', 'reports'].map(toP) },
    { t: 'الإعدادات', cards: ['set_company', 'set_attendance', 'set_finance', 'set_documents', 'set_automation', 'set_overrides', 'set_misc'].map(toP) },
  ].map((s) => ({ ...s, cards: s.cards.filter(Boolean) })).filter((s) => s.cards.length);
  const all = [];
  view.innerHTML = `<button class="card mprof" id="mprof"><div class="avatar big">${esc(initials(u.name))}</div><div class="mpi"><b>${esc(u.name)}</b><span>${esc(u.job_title || (u.is_admin ? 'مدير النظام' : 'موظف'))}</span><span>${esc(u.department || '')}</span></div><span class="mpc">${fi('chev_l')}</span></button>
    ${secs.map((s) => `${s.t ? `<h3 class="msec">${s.t}</h3>` : ''}<div class="mgrid">${s.cards.map((c) => { all.push(c); return `<button class="mc" data-i="${all.length - 1}"><span class="mct">${esc(c.t)}</span>${ci(c.ic)}</button>`; }).join('')}</div>`).join('')}
    <button class="mc mlogout" id="mlo"><span class="mlic">${fi('logout')}</span><span class="mct">تسجيل الخروج</span></button>`;
  view.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => all[Number(b.dataset.i)].fn()));
  $('#mprof', view).onclick = () => go('me', { tab: 'general' });
  $('#mlo', view).onclick = () => logout();
};

/* قائمة الإضافة السريعة (زرار +) */
function quickSheet() {
  const refresh = () => renderShell();
  const items = [
    ['q_swap', 'تغيير الوردية', () => requestForm(refresh, { type: 'shift_change' })],
    has('attendance.edit') && ['q_in', 'سجل حضور جديد', async () => { const emps = await api('/employees'); manualAtt(emps, null, refresh); }],
    ['q_file', 'طلب جديد', () => requestForm(refresh)],
    has('payroll.manage') && ['q_dollar', 'خصم جديد', () => { go('adjustments'); setTimeout(() => { if ($('#aadd')) { $('#aadd').click(); setTimeout(() => { const s = $('#nf [name=kind]'); if (s) s.value = 'deduction'; }, 60); } }, 450); }],
    has('payroll.manage') && ['q_dollar', 'إضافة مكافأة', () => { go('adjustments'); setTimeout(() => { if ($('#aadd')) { $('#aadd').click(); setTimeout(() => { const s = $('#nf [name=kind]'); if (s) s.value = 'bonus'; }, 60); } }, 450); }],
    has('employees.manage') && ['q_userplus', 'إضافة موظف جديد', () => empForm(null, () => { if (S.page === 'employees') renderShell(); else go('employees'); })],
  ].filter(Boolean);
  const o = document.createElement('div');
  o.className = 'qov';
  o.innerHTML = `<div class="qmenu">${items.map((it, i) => `<button class="qitem" data-i="${i}"><span class="qic">${fi(it[0])}</span><span>${it[1]}</span></button>`).join('')}</div><button class="fab qfab" aria-label="إغلاق">${fi('plus')}</button>`;
  document.body.appendChild(o);
  const close = () => o.remove();
  o.onclick = (e) => { if (e.target === o || e.target.closest('.qfab')) close(); };
  o.querySelectorAll('.qitem').forEach((b) => (b.onclick = () => { close(); items[Number(b.dataset.i)][2](); }));
}
