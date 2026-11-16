'use strict';
/* app-mode/11-screens-a.js — تطبيق الموظف (الشكل المرجعي): الجدول، لوحة المعلومات، طلباتي، طلب جديد، القائمة، الهيدر والشريط.
   كله بيشتغل في وضع التطبيق بس (is-app)، والموقع في المتصفح مش بيتأثر. */
const APP_VERSION = 'V 4.0.0';
const APP_PAGES = ['a_requests', 'a_newreq', 'a_history', 'a_claims', 'a_assign', 'a_penalties', 'a_payroll', 'a_profile', 'a_adjust', 'a_notif', 'a_dir', 'a_breaks'];
const initial1 = (n) => esc(String(n || '?').trim().charAt(0).toUpperCase());
const xav = (u, cls = '') => `<span class="xav ${cls}"${avAttr(u)}>${initial1(u && u.name)}</span>`;
const jobOf = (u) => u.job_title || (u.is_admin ? t('System Admin') : t('Employee'));
const xTabs = (id, items, cur) => `<div class="xtabs" id="${id}">${items.map(([k, l]) => `<button data-k="${k}" class="${k === cur ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
const xSpin = '<div class="empty"><span class="spin"></span></div>';
// قائمة اختيار بدوائر (Cancel / Confirm) زي الشاشة المرجعية
function xRadioDialog(title, options, value, onOk) {
  const o = document.createElement('div');
  o.className = 'xov';
  let cur = value;
  o.innerHTML = `<div class="xdlg" role="dialog">${title ? `<h4>${esc(title)}</h4>` : ''}<div class="xopts">${options.map(([k, l]) => `<button class="xopt" data-k="${esc(k)}"><i></i><span>${esc(l)}</span></button>`).join('')}</div>
    <div class="xdb"><button class="xcancel">${t('Cancel')}</button><button class="xok">${t('Confirm')}</button></div></div>`;
  document.body.appendChild(o);
  const paint = () => o.querySelectorAll('.xopt').forEach((b) => b.classList.toggle('on', b.dataset.k === cur));
  paint();
  o.onclick = (e) => { if (e.target === o) o.remove(); };
  o.querySelectorAll('.xopt').forEach((b) => (b.onclick = () => { cur = b.dataset.k; paint(); }));
  $('.xcancel', o).onclick = () => o.remove();
  $('.xok', o).onclick = () => { if (cur) { o.remove(); onOk(cur); } };
}
const REQ_EN = { annual_leave: 'Annual Leave', sick_leave: 'Sick Leave', emergency_leave: 'Casual Leave', unpaid_leave: 'Unpaid Leave', permission: 'Permissions', unpaid_permission: 'Unpaid Permission', ignore_exception: 'Ignore Exception',
  overtime: 'Overtime', work_mission: 'Work Mission', shift_change: 'Shift Change', attendance_edit: 'Attendance Edit', expense: 'Claim', loan: 'Loan', shift_swap: 'Shift Swap', leave_swap: 'Leave Swap' };
const reqName = (ty) => (isAr() ? (TYPES()[ty] || ty) : (REQ_EN[ty] || (TYPES()[ty]) || ty));
const hhmm = (h) => { const m = Math.round((Number(h) || 0) * 60); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const daysIn = (a, b) => Math.round((ymd(b) - ymd(a)) / 864e5) + 1;
const STATUS_X = { pending: ['Pending', 'warn'], approved: ['Approved', 'ok'], rejected: ['Rejected', 'bad'] };

if (IS_APP) {
/* ======================= الهيدر والتنقل ======================= */
const baseHeader = appHeader, baseBind = bindAppHeader;
const XH = {
  dashboard: { title: 'Dashboard', left: 'av', right: 'bell' }, a_requests: { title: 'My Requests', left: 'plus' }, menu: { title: 'Menu', left: 'lang', right: 'bell' },
  a_newreq: { title: 'New Request', left: 'back' }, a_history: { title: 'Schedule History', left: 'back', right: 'bell' }, a_claims: { title: 'My Claims', left: 'back' },
  a_assign: { title: 'My Assignments', left: 'back', right: 'filter' }, a_penalties: { title: 'My Penalties', left: 'back', right: 'filter' }, a_payroll: { title: 'Payroll', left: 'back' },
  a_profile: { title: 'Profile Information', left: 'back' }, a_adjust: { title: 'Adjustments', left: 'back' }, a_notif: { title: 'Notifications', left: 'back' },
  a_dir: { title: 'Employee Directory', left: 'back', right: 'bell' }, a_breaks: { title: 'Breaks', left: 'back' },
};
appHeader = function () {
  const u = S.me.user, p = S.page, bell = `<button class="ab-circle" id="abell" aria-label="${t('Notifications')}">${fi('bell')}${S.me.unread ? `<span class="dot">${S.me.unread}</span>` : ''}</button>`;
  if (p === 'home') {
    return `<header class="ahead home">${xav(u, 'hd')}<div class="info"><b dir="auto">${esc(u.name)}</b><span dir="auto">${esc(jobOf(u))}</span><span dir="auto">${esc(u.department || '')}</span></div>${bell}</header>`;
  }
  const c = XH[p];
  if (!c) return baseHeader();
  const left = { back: `<button class="ab-circle" id="aback" aria-label="${t('Back')}">${fi(isAr() ? 'back' : 'chev_l')}</button>`, plus: `<button class="ab-circle" id="aplus" aria-label="${t('New Request')}">${fi('plus')}</button>`,
    av: `<button class="ab-av" id="aav" aria-label="${t('Profile Information')}">${xav(u, 'sm')}</button>`,
    lang: `<div class="langbox"><button class="langbtn" id="alang">${t('Language')} <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5c3 3 3 16.5 0 19M12 2.5c-3 3-3 16.5 0 19"/></svg></button><small>${APP_VERSION}</small></div>` }[c.left] || '<span></span>';
  const right = { bell, filter: `<button class="ab-circle" id="afilter" aria-label="${t('Filter')}">${fi('sliders')}</button>` }[c.right] || '<span></span>';
  return `<header class="ahead plain ${c.left === 'lang' ? 'hlang' : ''}">${left}<h1>${t(c.title)}</h1>${right}</header>`;
};
bindAppHeader = function () {
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  baseBind();
  on('#abell', () => go('a_notif'));
  on('#aback', () => go(S.prevPage && S.prevPage !== S.page && S.prevPage !== 'a_newreq' ? S.prevPage : 'menu'));
  on('#aplus', () => go('a_newreq'));
  on('#aav', () => go('a_profile'));
  on('#alang', () => setLang(isAr() ? 'en' : 'ar'));
  on('#afilter', () => S.pg && S.pg.filter && S.pg.filter());
};
// الصفحة السابقة (لزرار الرجوع) + اللغة/الاتجاه قبل كل رسم
const baseGo = go;
go = function (page, opts) { S.prevPage = S.page; baseGo(page, opts); };
const baseRender = renderShell;
renderShell = function () { applyLang(); baseRender(); document.title = S.me && S.me.settings ? S.me.settings.company_name : document.title; };

/* ======================= الجدول (الرئيسية) ======================= */
PAGES.home = async (view) => {
  const u = S.me.user, today = S.me.today_date;
  if (u.is_admin) {
    view.innerHTML = `<div class="card xcard" style="text-align:center"><p style="margin:0;font-weight:700">${t('Sign-in and sign-out by face are for employees only')}</p><p class="muted small" style="margin:6px 0 0">${t('Follow their attendance from the Menu.')}</p></div>`;
    return;
  }
  const weekend = String(S.me.settings.weekend_days || '').split(',').filter(Boolean).map(Number);
  let sel = today; const recs = {}, loaded = new Set();
  view.innerHTML = `<div class="card xcard"><div class="xmon"><span class="calic">${fi('calsearch')}</span><span class="xmname" id="smon"></span><span class="xdow" id="sdow"></span></div><div class="xweek" id="strip"></div></div>
    <div class="card xcard xpunch" id="pc"></div>`;
  const loadMonth = async (m) => {
    if (loaded.has(m)) return; loaded.add(m);
    try { (await api('/attendance/mine?month=' + m)).forEach((r) => { recs[r.date] = r; }); } catch { loaded.delete(m); }
    if (S.me.today) recs[today] = S.me.today;
  };
  const dotColor = (d) => {
    const r = recs[d], dow = ymd(d).getUTCDay();
    if (r && r.check_in) return r.late_minutes > 0 ? '#d97706' : '#15803d';
    if (d < today && !weekend.includes(dow) && d >= u.hire_date && loaded.has(d.slice(0, 7))) return '#dc2626';
    return '#d4d7dd';
  };
  const drawStrip = () => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(sel, i - 3));
    $('#smon').innerHTML = `<b>${esc(mName(sel))}</b> <span>${sel.slice(0, 4)}</span>`;
    $('#sdow').textContent = `(${dowName(sel)})`;
    $('#strip').innerHTML = days.map((d) => `<button class="day ${d === sel ? 'on' : ''}" data-d="${d}"><b>${Number(d.slice(8))}</b><i style="background:${d === sel ? '#c99a00' : dotColor(d)}"></i></button>`).join('');
    view.querySelectorAll('.day').forEach((b) => (b.onclick = async () => { sel = b.dataset.d; await loadMonth(sel.slice(0, 7)); draw(); }));
  };
  const row = (kind, iso, loc) => `<div class="prow"><span class="pi ${kind}">${fi(kind === 'in' ? 'sq_in' : 'sq_out')}</span><b>${isoTime(iso)}</b><span class="ploc">${esc(loc || t('No location'))}</span></div>`;
  const draw = () => {
    drawStrip();
    const r = recs[sel], dow = ymd(sel).getUTCDay(), isToday = sel === today, grace = S.me.settings.grace_minutes || 0;
    const [sh, sm] = u.shift_start.split(':').map(Number), endMin = sh * 60 + sm + grace, endGrace = `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
    let status = '', body = '', action = '';
    if (r && r.check_in) {
      status = `<div class="xsub">${r.late_minutes > 0 ? `<span class="warn">${t('Late {n} min', { n: r.late_minutes })}</span>` : `<span class="ok">${t('On time')}</span>`}</div>`;
      body = `<div class="recbox">${row('in', r.check_in, r.in_loc)}${r.check_out ? row('out', r.check_out, r.out_loc) : ''}</div>${r.early_minutes ? `<p class="small neg" style="text-align:center">${t('Early leave {n} min', { n: r.early_minutes })}</p>` : ''}`;
      if (isToday && !r.check_out) action = `<button class="xbtn out" id="go">${fi('sq_out')}<span>${t('Sign Out')}</span></button>`;
      else if (isToday) action = `<p class="pos" style="text-align:center;font-weight:600;margin:14px 0 0">✔ ${t('You signed in and out today')}</p>`;
    } else if (weekend.includes(dow)) status = `<div class="xsub">${t('Day Off')}</div>`;
    else if (sel > today) status = `<div class="xsub">${t('This day has not come yet')}</div>`;
    else if (!isToday) status = `<div class="xsub bad">${t('No attendance record')}</div>`;
    else {
      status = `<div class="xsub">${t('Sign-In Starting')} - ${tmAP(u.shift_start)} - ${tmAP(endGrace)}</div>`;
      action = !u.face_enrolled && !u.face_exempt
        ? `<p class="xwarn">${t('Register your face once before the first sign-in.')}</p><button class="xbtn" id="enroll">${t('Register Face')}</button>`
        : `<button class="xbtn" id="go">${fi('sq_in')}<span>${t('Sign In')}</span></button>`;
    }
    $('#pc').innerHTML = `<div class="xshift">(${tmA(u.shift_start)} - ${tmA(u.shift_end)})</div>${status}${body}${action}`;
    if ($('#enroll')) $('#enroll').onclick = (e) => run(e.target, async () => {
      const d = await captureFace(t('Register Face'));
      await api('/me/face', 'POST', { descriptor: d }); toast(t('Face registered')); await boot();
    });
    if ($('#go')) $('#go').onclick = (e) => punch(r && r.check_in ? 'out' : 'in', e.currentTarget);
  };
  async function punch(type, btn) {
    const label = btn.innerHTML;
    await run(btn, async () => {
      let pos = null;
      if (S.me.settings.needs_geo) { btn.textContent = t('Getting your location...'); pos = await getPos(); }
      const d = await captureFace(type === 'in' ? t('Confirm face to sign in') : t('Confirm face to sign out'), { photo: true, quick: true });
      await api('/attendance/punch', 'POST', { type, lat: pos && pos.lat, lng: pos && pos.lng, descriptor: d.descriptor, photo: d.photo });
      toast(type === 'in' ? t('Signed in ✔') : t('Signed out ✔'));
      S.me = await api('/me'); loaded.clear(); await loadMonth(today.slice(0, 7)); draw();
    });
    if (btn.isConnected) btn.innerHTML = label;
  }
  draw();
  loadMonth(today.slice(0, 7)).then(() => { if ($('#strip')) draw(); });
};

/* ======================= لوحة المعلومات ======================= */
appDashboard = async function (view) {
  view.innerHTML = xSpin;
  const u = S.me.user, nowM = thisMonth(), months = [];
  for (let k = 0; k < 12; k++) { const d = new Date(Date.UTC(+nowM.slice(0, 4), +nowM.slice(5) - 1 - k, 1)).toISOString().slice(0, 7); if (d < String(u.hire_date).slice(0, 7) && k) break; months.push(d); }
  const mo = months.includes(S.dmon) ? S.dmon : nowM, [first, last] = monthRange(mo);
  const [d, rq, att, pm, pen] = await Promise.all([has('dashboard.view') ? api('/dashboard') : null, api('/requests/mine'), api('/attendance/mine?month=' + mo).catch(() => []),
    api('/payroll/mine?month=' + mo).catch(() => null), u.is_admin ? { rows: [] } : api(`/att/penalties/mine?from=${first}&to=${last}`).catch(() => ({ rows: [] }))]);
  const bl = rq.balances, left = (tot, used) => Math.max(0, Number(tot) - Number(used));
  const bal = [[left(bl.annual_total, bl.annual_used), 'Annual Leave'], [left(bl.emergency_total, bl.emergency_used), 'Casual Leave'], [left(bl.sick_total, bl.sick_used), 'Sick Leaves'], [Number(bl.permission_hours_month).toFixed(0), 'Permissions']];
  const hrs = att.filter((r) => r.check_in && r.check_out).reduce((s, r) => s + (new Date(r.check_out) - new Date(r.check_in)) / 3600000, 0);
  const attended = pm ? pm.present_days : att.filter((r) => r.check_in).length;
  const remote = rq.requests.filter((r) => r.type === 'work_mission' && r.status === 'approved').reduce((s, r) => { const a = r.from_date < first ? first : r.from_date, b = r.to_date > last ? last : r.to_date; return s + (b >= a ? daysIn(a, b) : 0); }, 0);
  const shiftH = Math.max(1, (Number(u.shift_end.slice(0, 2)) * 60 + Number(u.shift_end.slice(3)) - Number(u.shift_start.slice(0, 2)) * 60 - Number(u.shift_start.slice(3))) / 60);
  const penDays = pen.rows.filter((r) => r.applied).reduce((s, r) => s + (r.unit === 'الأيام' ? r.value : r.unit === 'الساعات' ? r.value / shiftH : r.unit === 'الدقائق' ? r.value / 60 / shiftH : 0), 0);
  let team = '';
  if (d) {
    const L = d.list, n = (s) => L.filter((x) => x.status === s).length;
    team = `<h3 class="xh2">${t('Team Today')}</h3><div class="xtiles">${[['Employees', L.length, '*'], ['Present', n('present'), 'present'], ['Late', n('late'), 'late'], ['Absent', n('absent'), 'absent'], ['On Leave', n('leave'), 'leave'], ['Not Signed In', n('not_yet'), 'not_yet']]
      .map(([l, v, k]) => `<button class="card xtile" data-all="${k}"><div class="xt1"><b>${v}</b></div><span>${t(l)}</span></button>`).join('')}</div>
      ${has('requests.view_all') ? `<button class="card xrow" data-go="requests"><b>${d.pending_requests}</b><span>${t('Pending Requests')}</span></button>` : ''}`;
  }
  const mlabel = (m) => `${mName(m + '-01')}-${m.slice(0, 4)}`;
  view.innerHTML = `<h3 class="xh1">${t('Balance')}</h3><div class="xbal">${bal.map(([v, l]) => `<div class="card"><b>${v}</b><span>${t(l)}</span></div>`).join('')}</div>
    <h3 class="xh2 thin">${t('Statistics')}</h3>
    <div class="xstat-h"><h3 class="xh1 sm">${t('Used This Month')}</h3><label class="xmonsel"><select id="dmon">${months.map((m) => `<option value="${m}" ${m === mo ? 'selected' : ''}>${mlabel(m)}</option>`).join('')}</select><span>${mlabel(mo)}</span>${fi('chev_dn')}</label></div>
    <div class="xhours"><b>${hrs.toFixed(hrs % 1 ? 2 : 0)}</b><span>${t('Hours Worked This Month')}</span></div>
    <div class="xtiles2">
      <div class="card"><div class="xt1"><b>${pm ? pm.absent_days : 0}</b><small>${t('Days')}</small>${ci('absent')}</div><span>${t('Absent')}</span></div>
      <div class="card"><div class="xt1"><b>${remote}</b><small>${t('Days')}</small><svg class="cic wifi" viewBox="0 0 24 24" fill="none" stroke="#c99a00" stroke-width="2" stroke-linecap="round"><path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.3" r="1.1" fill="#c99a00"/></svg></div><span>${t('Used Remote Days')}</span></div>
      <div class="card"><div class="xt1"><b>${penDays.toFixed(1)}</b>${ci('hourglass')}</div><span>${t('Penalties')}</span></div>
      <div class="card"><div class="xt1"><b>${Number(attended).toFixed(2)}</b>${ci('present')}</div><span>${t('Attended Days')}</span></div>
    </div>${team}`;
  $('#dmon', view).onchange = (e) => { S.dmon = e.target.value; appDashboard(view); };
  view.querySelectorAll('[data-all]').forEach((b) => (b.onclick = () => { const k = b.dataset.all; S.empm = Object.assign(S.empm || {}, { st: k === '*' ? [] : [k], day: S.me.today_date, dept: '' }); S.emptab = 'list'; go('employees'); }));
  view.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(b.dataset.go)));
};

/* ======================= طلباتي ======================= */
PAGES.a_requests = async (view) => {
  view.innerHTML = xSpin;
  const rq = await api('/requests/mine'), tab = S.rqtab || 'pending';
  const draw = () => {
    S.rqtab = tab;
    const rows = rq.requests.filter((r) => r.status === tab);
    view.innerHTML = `${xTabs('rqt', [['pending', t('Pending')], ['approved', t('Approved')], ['rejected', t('Rejected')]], tab)}
      <div class="xlist">${rows.map((r) => {
        const one = ['permission', 'unpaid_permission', 'overtime', 'attendance_edit', 'expense', 'loan'].includes(r.type);
        const when = one ? `${dMonY(r.from_date)}${r.hours ? ' · ' + hhmm(r.hours) + ' h' : ''}${r.amount ? ' · ' + money(r.amount) : ''}` : r.from_date === r.to_date ? dMonY(r.from_date) : `${dMonY(r.from_date)} - ${dMonY(r.to_date)}`;
        const [sl, sc] = STATUS_X[r.status];
        return `<div class="card xreq"><div class="xr1"><b>${esc(reqName(r.type))}</b><span class="xpill ${sc}">${t(sl)}</span></div><div class="xr2">${esc(when)}</div>
          ${r.reason ? `<div class="xr3" dir="auto">${esc(r.reason)}</div>` : ''}${r.decision_note ? `<div class="xr3" dir="auto">${esc(r.decision_note)}</div>` : ''}
          ${r.status === 'pending' ? `<button class="xlink bad" data-del="${r.id}">${t('Cancel Request')}</button>` : ''}</div>`;
      }).join('')}</div>`;
    $('#rqt', view).onclick = (e) => { const b = e.target.closest('button'); if (b) { tab = b.dataset.k; draw(); } };
    view.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { if (confirm(t('Cancel this request?'))) run(b, async () => { await api('/requests/' + b.dataset.del, 'DELETE'); rq.requests = rq.requests.filter((x) => x.id != b.dataset.del); toast(t('Request cancelled')); draw(); }); }));
  };
  draw();
};

/* ======================= طلب جديد ======================= */
const NEW_TYPES = [['annual_leave', 'Annual Leave'], ['sick_leave', 'Sick Leave'], ['unpaid_leave', 'Unpaid Leave'], ['permission', 'Permissions'], ['ignore_exception', 'Ignore Exception'], ['unpaid_permission', 'Unpaid Permission']];
PAGES.a_newreq = (view) => {
  const today = S.me.today_date; let a = today, b = today, picking = false, ty = '', cm = today.slice(0, 7);
  const pre = S.nrPreset; S.nrPreset = null;
  const allowed = NEW_TYPES.filter(([k]) => !S.meta || k in OWN_TYPES());
  if (pre && pre.type === 'attendance_edit' && (!S.meta || 'attendance_edit' in OWN_TYPES())) allowed.push(['attendance_edit', 'Attendance Edit']);
  if (pre && pre.date) { a = b = pre.date; cm = pre.date.slice(0, 7); }
  view.innerHTML = `<div class="card xcard xcal"><div class="xcalh"><button id="cprev" class="xnav">${fi(isAr() ? 'back' : 'chev_l')}</button><b id="ctitle"></b><button id="cnext" class="xnav">${fi(isAr() ? 'chev_l' : 'back')}</button></div>
      <div class="xdows">${[0, 1, 2, 3, 4, 5, 6].map((i) => `<span>${ymd('2026-11-01').getUTCDay() === 0 ? new Date(Date.UTC(2026, 10, 1 + i)).toLocaleDateString(isAr() ? 'ar-EG' : 'en-US', { weekday: 'short', timeZone: 'UTC' }).slice(0, isAr() ? 3 : 2) : ''}</span>`).join('')}</div>
      <div class="xdays" id="cgrid"></div></div>
    <h3 class="xh1 sm" style="margin-top:18px">${t('Request Details')}</h3>
    <div class="card xcard"><label class="xlab">${t('Request Type')}</label><button class="xsel" id="tysel"><span id="tylab" class="ph">${t('Select Request Type')}</span>${fi('chev_dn')}</button>
      <div id="xhrs" hidden><div class="xtimes"><label>${t('From')}<input type="time" id="tfrom" value="09:00"></label><label>${t('To')}<input type="time" id="tto" value="10:00"></label></div></div>
      <label class="xlab" style="margin-top:18px">${t('Comments')}</label><textarea id="cmt" class="xta" rows="4" maxlength="500" placeholder="${t('Write your comment here')}"></textarea></div>
    <button class="xsubmit" id="submit" disabled>${t('Submit')}</button>`;
  const paint = () => {
    const [y, m] = cm.split('-').map(Number), first = new Date(Date.UTC(y, m - 1, 1)), n = new Date(Date.UTC(y, m, 0)).getUTCDate(), lo = a < b ? a : b, hi = a < b ? b : a;
    $('#ctitle').textContent = monthYear(cm + '-01');
    let h = ''.padStart(0); for (let i = 0; i < first.getUTCDay(); i++) h += '<span></span>';
    for (let d = 1; d <= n; d++) { const ds = `${cm}-${String(d).padStart(2, '0')}`, on = ds === a || ds === b, inr = ds > lo && ds < hi; h += `<button class="xd ${on ? 'on' : ''} ${inr ? 'rng' : ''}" data-d="${ds}">${d}</button>`; }
    $('#cgrid').innerHTML = h;
    view.querySelectorAll('.xd').forEach((x) => (x.onclick = () => { const d = x.dataset.d; if (!picking) { a = b = d; picking = true; } else { b = d; picking = false; } paint(); sync(); }));
  };
  const needHours = () => ['permission', 'unpaid_permission'].includes(ty);
  const sync = () => { $('#xhrs').hidden = !needHours(); $('#submit').disabled = !ty; };
  $('#cprev').onclick = () => { cm = new Date(Date.UTC(+cm.slice(0, 4), +cm.slice(5) - 2, 1)).toISOString().slice(0, 7); paint(); };
  $('#cnext').onclick = () => { cm = new Date(Date.UTC(+cm.slice(0, 4), +cm.slice(5), 1)).toISOString().slice(0, 7); paint(); };
  $('#tysel').onclick = () => xRadioDialog('', allowed.map(([k, l]) => [k, t(l)]), ty, (k) => { ty = k; const l = $('#tylab'); l.textContent = t(allowed.find((x) => x[0] === k)[1]); l.classList.remove('ph'); sync(); });
  $('#submit').onclick = (e) => run(e.currentTarget, async () => {
    const lo = a < b ? a : b, hi = a < b ? b : a, body = { type: ty, from_date: lo, to_date: needHours() || ty === 'ignore_exception' && false ? lo : hi, reason: $('#cmt').value.trim() };
    if (needHours()) {
      const [fh, fm] = $('#tfrom').value.split(':').map(Number), [th, tmn] = $('#tto').value.split(':').map(Number), mins = th * 60 + tmn - (fh * 60 + fm);
      if (!(mins > 0)) throw new Error(t('End time must be after start time'));
      body.hours = Math.round(mins / 15) / 4; body.meta = { from_time: $('#tfrom').value, to_time: $('#tto').value };
    }
    await api('/requests', 'POST', body); toast(t('Request submitted')); S.rqtab = 'pending'; go('a_requests');
  });
  if (pre && pre.type && allowed.some((x) => x[0] === pre.type)) { ty = pre.type; const l = $('#tylab'); l.textContent = t(allowed.find((x) => x[0] === ty)[1]); l.classList.remove('ph'); }
  paint(); sync();
};

/* ======================= القائمة ======================= */
const ICX = {
  history: CI.att, penalties: CI.penalty, breaks: '<path d="M5 8h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="#e4cfcf"/><path d="M16 9.5h1.8a2.2 2.2 0 0 1 0 4.4H16" fill="none" stroke="#5a2d2d" stroke-width="1.8"/><path d="M8 3.5v2M11 3v2.5M14 3.5v2" stroke="#5a2d2d" stroke-width="1.6" stroke-linecap="round"/>',
  claims: '<path d="M4 9.5A3.5 3.5 0 0 1 7.5 6H17l1.5 2.5V17a3 3 0 0 1-3 3H7.5A3.5 3.5 0 0 1 4 16.5z" fill="#d6efd9"/><path d="M5 6.2l8.5-3.2 1 3" fill="none" stroke="#27b24a" stroke-width="1.8" stroke-linejoin="round"/><circle cx="7.2" cy="17.2" r="3.4" fill="#27b24a"/><path d="M5.6 17.2l1.2 1.2 2-2.2" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  assign: '<rect x="5" y="4" width="14" height="17" rx="3" fill="#fef9d9"/><rect x="8.5" y="2" width="7" height="4" rx="1.6" fill="#14a9b7"/><path d="M9 12h6M9 16h4" stroke="#14a9b7" stroke-width="1.8" stroke-linecap="round"/>',
  dir: CI.list, payroll: CI.money,
  adjust: '<rect x="3" y="19" width="18" height="2" rx="1" fill="#f6d78f"/><path d="M5 17l1-4 9.5-9.5a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L9.5 16.5z" fill="#f2b23c"/><path d="M14 5l3.5 3.5" stroke="#fff" stroke-width="1.4"/>',
};
const icx = (k) => `<svg class="cic" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${ICX[k]}</svg>`;
PAGES.menu = (view) => {
  const u = S.me.user, ok = (id) => allPages().includes(id), T = pageTitles();
  const mk = (ic, tt, fn) => ({ ic, tt, fn });
  const toP = (id) => ok(id) && { ic: CARD_IC[id] || 'doc', tt: PAGE_LABELS[id] || T[id], fn: () => go(id), raw: true };
  const manage = has('employees.manage');
  const mine = [['history', 'History', 'a_history'], ['penalties', 'My Penalties', 'a_penalties'], ['breaks', 'Breaks', 'a_breaks'], ['claims', 'My Claims', 'a_claims'], ['assign', 'My Assignments', 'a_assign'],
    ['dir', 'Employee Directory', 'a_dir'], ['payroll', 'Payroll', 'a_payroll'], ['adjust', 'My Adjustments', 'a_adjust']].map(([ic, l, p]) => ({ icx: ic, tt: t(l), fn: () => go(p) }));
  const secs = [
    { t: '', cards: u.is_admin ? [] : mine },
    { t: t('Employees'), cards: [toP('employees'), manage && { ic: 'userplus', tt: T.employees && 'طلبات الحسابات', raw: true, fn: () => { S.emptab = 'pending'; go('employees'); } }, manage && { ic: 'key', tt: 'استعادة كلمة المرور', raw: true, fn: () => { S.emptab = 'resets'; go('employees'); } },
      ...['workgroups', 'teams', 'emp_procedures', 'emp_docs', 'org_chart', 'transfers_log', 'title_changes', 'suspension_log', 'pending_suspensions', 'permissions'].map(toP)] },
    { t: t('Requests & Attendance'), cards: [toP('requests'), toP('attendance')] },
    { t: t('Finance & Reports'), cards: ['payroll', 'adjustments', 'tiers', 'reports'].map(toP) },
    { t: t('Settings'), cards: ['set_company', 'set_attendance', 'set_finance', 'set_documents', 'set_automation', 'set_overrides', 'set_misc'].map(toP) },
  ].map((s) => ({ ...s, cards: s.cards.filter(Boolean) })).filter((s) => s.cards.length);
  const all = [];
  const accts = (() => { try { return JSON.parse(localStorage.getItem('accts') || '[]'); } catch { return []; } })();
  view.innerHTML = `<button class="card mprof xprof" id="mprof">${xav(u, 'md')}<div class="mpi"><b dir="auto">${esc(u.name)}</b><span dir="auto">${esc(jobOf(u))}</span><span dir="auto">${esc(u.department || '')}</span></div><span class="mpc">${fi(isAr() ? 'chev_l' : 'back')}</span></button>
    ${secs.map((s) => `${s.t ? `<h3 class="msec">${s.t}</h3>` : ''}<div class="mgrid">${s.cards.map((c) => { all.push(c); return `<button class="mc" data-i="${all.length - 1}"><span class="mct">${esc(c.tt)}</span>${c.icx ? icx(c.icx) : ci(c.ic)}</button>`; }).join('')}</div>`).join('')}
    <div class="card xlogout"><button class="xlo" id="mlo"><span class="mlic">${fi('logout')}</span><b>${t('Log Out')}</b></button><div class="xstack" id="xstack">${accts.slice(0, 3).map((a) => `<button class="xav sm ac${a.id === u.id ? ' cur' : ''}" data-acc="${a.id}" title="${esc(a.name)}" style="background:${a.id === u.id ? '#e67e22' : '#8e44ad'}">${initial1(a.name)}</button>`).join('')}</div></div>`;
  view.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => all[Number(b.dataset.i)].fn()));
  $('#mprof', view).onclick = () => go('a_profile');
  $('#mlo', view).onclick = () => logout();
  view.querySelectorAll('[data-acc]').forEach((b) => (b.onclick = () => {
    const a = accts.find((x) => String(x.id) === b.dataset.acc); if (!a || a.id === u.id) return;
    S.token = a.token; try { localStorage.setItem('tk', a.token); } catch { /* تجاهل */ } S.me = null; S.page = 'home'; boot();
  }));
};
// حفظ الحسابات اللي دخلت من الجهاز ده (للتبديل السريع من القائمة). بيتشال الحساب عند تسجيل الخروج
const baseBoot = boot;
boot = async function () {
  await baseBoot();
  try {
    if (!S.me || !S.token) return;
    const list = JSON.parse(localStorage.getItem('accts') || '[]').filter((a) => a.id !== S.me.user.id);
    list.unshift({ id: S.me.user.id, name: S.me.user.name, token: S.token });
    localStorage.setItem('accts', JSON.stringify(list.slice(0, 3)));
  } catch { /* تجاهل */ }
};
const baseLogout = logout;
logout = function (silent) {
  try { const id = S.me && S.me.user.id; localStorage.setItem('accts', JSON.stringify(JSON.parse(localStorage.getItem('accts') || '[]').filter((a) => a.id !== id))); } catch { /* تجاهل */ }
  const left = (() => { try { return JSON.parse(localStorage.getItem('accts') || '[]'); } catch { return []; } })();
  if (left.length && !silent) { S.token = left[0].token; try { localStorage.setItem('tk', S.token); } catch { /* تجاهل */ } S.me = null; S.page = 'home'; return boot(); }
  baseLogout(silent);
};

/* زرار + : طلب جديد (والإضافات الإدارية لو عنده صلاحيات) */
const baseQuick = quickSheet;
quickSheet = function () {
  const items = [['q_file', t('New Request'), () => go('a_newreq')],
    has('attendance.edit') && ['q_in', 'سجل حضور جديد', async () => { const emps = await api('/employees'); manualAtt(emps, null, () => renderShell()); }],
    has('employees.manage') && ['q_userplus', 'إضافة موظف جديد', () => empForm(null, () => { if (S.page === 'employees') renderShell(); else go('employees'); })]].filter(Boolean);
  const o = document.createElement('div');
  o.className = 'qov';
  o.innerHTML = `<div class="qmenu">${items.map((it, i) => `<button class="qitem" data-i="${i}"><span class="qic">${fi(it[0])}</span><span>${it[1]}</span></button>`).join('')}</div><button class="fab qfab" aria-label="x">${fi('plus')}</button>`;
  document.body.appendChild(o);
  const close = () => o.remove();
  o.onclick = (e) => { if (e.target === o || e.target.closest('.qfab')) close(); };
  o.querySelectorAll('.qitem').forEach((b) => (b.onclick = () => { close(); items[Number(b.dataset.i)][2](); }));
};
}
