'use strict';
/* core/06-shell.js — الإطار العام: القائمة الجانبية والتنقل (go) و renderShell و boot وتغيير كلمة المرور والإشعارات، وسجل الصفحات PAGES */
// تثبيت التطبيق: في المتصفح بس (لو مثبّت فعلاً الزرار ما بيظهرش)
const IS_APP = document.documentElement.classList.contains('is-app');
let installEv = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEv = e; });
function installApp() {
  if (installEv) { installEv.prompt(); installEv.userChoice.finally(() => { installEv = null; }); return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  modal(`<h3>تثبيت التطبيق</h3><p>${ios ? 'من Safari: اضغطي زرار المشاركة <b>⬆</b> ثم <b>إضافة إلى الشاشة الرئيسية</b>.' : 'من قائمة المتصفح (⋮): اختاري <b>تثبيت التطبيق</b> أو <b>إضافة إلى الشاشة الرئيسية</b>.'}</p>
    <p class="muted small">بعد التثبيت افتحيه من أيقونته على الشاشة، وهيظهر كتطبيق بشريط سفلي من غير شريط المتصفح.</p><div class="actions"><button class="btn" data-close>تمام</button></div>`);
}
// قائمة بمجموعات (زي الشاشة): عنصر مفرد أو مجموعة فيها عناصر فرعية
const MENU = [
  { id: 'dashboard', ic: 'grid', t: 'لوحة المعلومات', ok: () => has('dashboard.view') },
  { id: 'me', ic: 'user', t: 'حسابي', ok: () => true },
  { g: 'emp', ic: 'users', t: 'الموظفون', items: [
    ['employees', 'الموظفون', () => has('employees.view'), 'users'], ['workgroups', 'مجموعات العمل', () => has('employees.view'), 'clock'],
    ['teams', 'فرق العمل', () => has('employees.view'), 'users'], ['emp_procedures', 'إجراءات الموظفين', () => has('employees.view'), 'user'],
    ['emp_docs', 'مستندات الموظفين', () => has('employees.view'), 'file'], ['org_chart', 'الهيكل التنظيمي', () => has('employees.view'), 'grid'],
    ['transfers_log', 'سجل النقل', () => has('employees.view'), 'file'], ['title_changes', 'تغيير المسمى الوظيفي', () => has('employees.view'), 'users'],
    ['suspension_log', 'سجل الإيقاف', () => has('employees.view'), 'file'], ['pending_suspensions', 'الإيقافات المعلقة', () => has('employees.view'), 'file'],
    ['permissions', 'الصلاحيات', () => S.me.user.is_admin, 'lock']] },
  { id: 'requests', ic: 'file', t: 'الطلبات', ok: () => has('requests.view_all') },
  { g: 'att', ic: 'clock', t: 'الحضور', items: [
    ['home', 'تسجيل الحضور', () => true], ['attendance', 'سجل الحضور', () => has('attendance.view_all')]] },
  { g: 'fin', ic: 'wallet', t: 'المالية', items: [
    ['payroll', 'المرتبات والخصومات', () => has('payroll.view')], ['adjustments', 'المكافآت والجزاءات', () => has('payroll.view')], ['tiers', 'شرائح خصم التأخير', () => has('settings.manage')]] },
  { id: 'reports', ic: 'chart', t: 'التقارير', ok: () => has('reports.view') },
  { g: 'set', ic: 'sliders', t: 'الإعدادات', items: [
    ['set_company', 'شركة', () => has('settings.manage'), 'building'], ['set_attendance', 'الحضور', () => has('settings.manage'), 'clock'],
    ['set_finance', 'المالية', () => has('settings.manage'), 'wallet'], ['set_documents', 'المستندات', () => has('settings.manage'), 'file'],
    ['set_automation', 'قواعد أتمتة النظام', () => has('settings.manage')], ['set_overrides', 'قواعد تجاوز الإشعارات', () => has('settings.manage')],
    ['set_misc', 'إعدادات متنوعة', () => has('settings.manage'), 'sliders']] },
];
const menuVisible = () => MENU.map((m) => (m.g ? { ...m, items: m.items.filter((i) => i[2]()) } : m)).filter((m) => (m.g ? m.items.length : m.ok()));
const allPages = () => menuVisible().flatMap((m) => (m.g ? m.items.map((i) => i[0]) : [m.id]));
function go(page, opts = {}) { S.empProfileId = null; S.page = page; if (opts.tab) S.metab = opts.tab; S.q = opts.q || ''; renderShell(); window.scrollTo(0, 0); }
function menuHtml(sheet) {
  return menuVisible().map((m) => {
    if (!m.g) return `<button class="navi ${m.id === S.page ? 'on' : ''}" data-p="${m.id}">${ico(m.ic)}<span>${m.t}</span></button>`;
    const has_on = m.items.some((i) => i[0] === S.page), open = sheet || has_on || S.open[m.g];
    return `<div class="navgrp ${open ? 'open' : ''} ${has_on ? 'cur' : ''}"><button class="navi navg" data-g="${m.g}">${ico(m.ic)}<span>${m.t}</span>${ico('chev', 'chev')}</button>
      <div class="sub">${m.items.map((i) => `<button class="navi sm ${i[0] === S.page ? 'on' : ''}" data-p="${i[0]}">${i[3] ? ico(i[3]) : ''}<span>${i[1]}</span></button>`).join('')}</div></div>`;
  }).join('');
}
function menuSheet() {
  const o = modal(`<h3>القائمة</h3><nav class="nav sheetnav">${menuHtml(true)}</nav>
    <div class="row" style="margin-top:14px"><button class="btn alt" id="spw" style="flex:1">${ico('lock')} كلمة المرور</button><button class="btn alt" id="slo" style="flex:1">${ico('logout')} خروج</button></div>
    ${IS_APP ? '' : `<button class="btn alt" id="sin" style="width:100%;margin-top:8px">${ico('download')} تثبيت التطبيق</button>`}`);
  o.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { o.close(); go(b.dataset.p); }));
  $('#spw', o).onclick = () => { o.close(); changePassword(); };
  $('#slo', o).onclick = () => { o.close(); logout(); };
  if ($('#sin', o)) $('#sin', o).onclick = () => { o.close(); installApp(); };
}
function renderShell() {
  S.open = S.open || {};
  if (!allPages().includes(S.page) && !(IS_APP && (S.page === 'menu' || S.page === 'dashboard'))) S.page = 'home';
  S.pg = {};
  const u = S.me.user, canSearch = has('employees.view');
  const third = has('employees.view') ? ['employees', 'الموظفون', 'b_team'] : ['me:attendance', 'سجلي', 'b_clock'];
  const bnav = [['home', 'الجدول', 'b_sched'], ['dashboard', 'لوحة المعلومات', 'b_dash'], null, third, ['menu', 'القائمة', 'b_menu']];
  const isOn = (k) => (k === 'menu' ? !['home', 'dashboard', third[0] === 'employees' ? 'employees' : 'me'].includes(S.page) : (k === S.page || (k === 'me:attendance' && S.page === 'me')));
  $('#app').innerHTML = `<div class="shell">
    <header class="topbar">
      <button class="iconbtn hmb" id="hmb" aria-label="القائمة">${ico('menu')}</button>
      <div class="brand"><img src="/icon.svg" alt=""><span>${esc(S.me.settings.company_name)}</span></div>
      ${canSearch ? `<form class="search" id="srch">${ico('search')}<input id="sq" placeholder="ابحثي عن موظف بالاسم أو اسم المستخدم أو الهاتف..." autocomplete="off"></form>` : '<div class="grow"></div>'}
      <div class="chip" id="cdate">${ico('calendar')}<span dir="ltr"></span></div>
      <div class="chip" id="cclk">${ico('clock')}<span dir="ltr">--:--:--</span></div>
      <button class="iconbtn" id="bell">${ico('bell')}${S.me.unread ? `<span class="dot">${S.me.unread}</span>` : ''}</button>
      <div class="usermenu"><button class="chip userchip" id="um"><span class="avatar sm">${esc(initials(u.name))}</span><span class="uname">${esc(u.name)}</span>${ico('chev')}</button>
        <div class="dropdown" id="umd" hidden>${IS_APP ? '' : `<button id="inst">${ico('download')} تثبيت التطبيق</button>`}<button id="pw">${ico('lock')} تغيير كلمة المرور</button><button id="lo">${ico('logout')} تسجيل الخروج</button></div></div>
    </header>
    <aside class="side"><div class="side-head">${ico('menu')}<span>القائمة</span></div><nav class="nav" id="nav">${menuHtml(false)}</nav></aside>
    ${IS_APP ? appHeader() : `<header class="mtop"><div class="avatar big">${esc(initials(u.name))}</div>
      <div class="info"><b>${esc(u.name)}</b><span>${esc(u.job_title || (u.is_admin ? 'مدير النظام' : 'موظف'))}</span><span>${esc(u.department || '')}</span></div>
      <button class="iconbtn" id="mbell">${ico('bell')}${S.me.unread ? `<span class="dot">${S.me.unread}</span>` : ''}</button></header>`}
    <main class="content" id="view"></main>
    <nav class="bottom"><div class="bbg" aria-hidden="true"><i></i><svg viewBox="0 0 128 66" preserveAspectRatio="none"><path d="M0 0C26 0 30 31 64 31S102 0 128 0V66H0z"/></svg><i></i></div>${bnav.map((n) => (n ? `<button data-b="${n[0]}" class="${isOn(n[0]) ? 'on' : ''}"><span class="bi">${fi(n[2])}</span><span>${n[1]}</span></button>` : '<span class="gap"></span>')).join('')}
      <button class="fab" id="fab" aria-label="إضافة">${fi('plus')}</button></nav>
  </div>`;
  const bind = (root) => {
    root.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => go(b.dataset.p)));
    root.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => { S.open[b.dataset.g] = !b.parentElement.classList.contains('open'); b.parentElement.classList.toggle('open'); }));
  };
  bind($('#nav'));
  document.querySelectorAll('.bottom [data-b]').forEach((b) => (b.onclick = () => {
    const k = b.dataset.b;
    if (k === 'menu') { if (IS_APP) go('menu'); else menuSheet(); } else if (k === 'me:attendance') go('me', { tab: 'attendance' }); else { if (k === 'employees') S.emptab = 'list'; go(k); }
  }));
  $('#fab').onclick = quickSheet;
  if ($('#hmb')) $('#hmb').onclick = menuSheet;
  if ($('#inst')) $('#inst').onclick = installApp;
  $('#bell').onclick = showNotes; if ($('#mbell')) $('#mbell').onclick = showNotes;
  if (IS_APP) bindAppHeader();
  $('#um').onclick = (e) => { e.stopPropagation(); $('#umd').hidden = !$('#umd').hidden; };
  document.onclick = () => { const d = $('#umd'); if (d) d.hidden = true; };
  $('#lo').onclick = () => logout(); $('#pw').onclick = changePassword;
  if ($('#srch')) $('#srch').onsubmit = (e) => { e.preventDefault(); go('employees', { q: $('#sq').value.trim() }); };
  const tick = () => {
    const c = $('#cclk span'); if (!c) return clearInterval(renderShell.t);
    const n = new Date();
    c.textContent = n.toLocaleTimeString('en-US', { timeZone: TZ });
    $('#cdate span').textContent = n.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ }).replace(/,/g, '');
  };
  tick(); clearInterval(renderShell.t); renderShell.t = setInterval(tick, 1000);
  if (!S.me.user.is_admin && !window.__faceWarm) { window.__faceWarm = 1; setTimeout(() => loadFace().catch(() => {}), 2500); }
  (PAGES[S.page] || PAGES.home)($('#view'));
}
async function boot() {
  try {
    if (!S.meta) S.meta = await api('/meta');
    S.me = await api('/me');
  } catch { return renderLogin(); }
  if (S.me.user.must_change) return forcePassword();
  renderShell();
}
function forcePassword() {
  $('#app').innerHTML = `<div class="login"><form class="card" id="pf">
    <h2 style="margin-bottom:6px">اختاري كلمة مرور جديدة</h2>
    <p class="muted" style="margin:0 0 14px">لازم تغيّري كلمة المرور المؤقتة قبل ما تكملي.</p>
    <div class="grid"><label class="f">كلمة المرور الجديدة (6 أحرف على الأقل)<input name="n" type="password" minlength="6" required autocomplete="new-password"></label>
    <button class="btn big" style="font-size:16px;padding:12px">حفظ ومتابعة</button></div></form></div>`;
  $('#pf').onsubmit = (e) => { e.preventDefault(); run($('button', e.target), async () => { const r = await api('/me/password', 'POST', { new_password: e.target.n.value }); if (r.token) { S.token = r.token; localStorage.setItem('tk', r.token); } await boot(); }); };
}
function changePassword() {
  const o = modal(`<h3>تغيير كلمة المرور</h3><form class="grid" id="cp">
    <label class="f">الحالية<input name="o" type="password" required></label>
    <label class="f">الجديدة<input name="n" type="password" minlength="6" required></label>
    <div class="actions"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">حفظ</button></div></form>`);
  $('#cp', o).onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', e.target), async () => { const r = await api('/me/password', 'POST', { old_password: e.target.o.value, new_password: e.target.n.value }); if (r.token) { S.token = r.token; localStorage.setItem('tk', r.token); } o.close(); toast('تم تغيير كلمة المرور'); }); };
}
async function showNotes() {
  const rows = await api('/notifications');
  modal(`<h3>الإشعارات</h3><div class="notes">${rows.length ? rows.map((n) => `<div class="note ${n.read ? '' : 'new'}">${esc(n.text)}<div class="muted small">${esc(n.created_at)} UTC</div></div>`).join('') : '<div class="empty">لا توجد إشعارات</div>'}</div>
    <div class="actions"><button class="btn" data-close>إغلاق</button></div>`);
  if (S.me.unread) { await api('/notifications/read', 'POST'); S.me.unread = 0; document.querySelectorAll('#bell .dot, #abell .dot, #mbell .dot').forEach((d) => d.remove()); }
}

/* ====== الصفحات ====== */
const PAGES = {};
