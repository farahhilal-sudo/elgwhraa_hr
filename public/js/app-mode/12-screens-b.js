'use strict';
/* app-mode/12-screens-b.js — تطبيق الموظف (الشكل المرجعي): الإشعارات، سجل الجدول، المطالبات، التكليفات، الجزاءات،
   المرتب، الملف الشخصي، المكافآت والخصومات، دليل الموظفين، الاستراحات. بيشتغل في وضع التطبيق بس (is-app). */
if (IS_APP) {
Object.assign(FI, {
  mail: G('<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3.8 7.6l8.2 6 8.2-6"/>'),
  phone: G('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>'),
  phone_s: '<rect x="3" y="7.5" width="12" height="13" rx="2.2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="3" width="7" height="4.6" rx="1" fill="currentColor"/><path d="M6.5 17.5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  clr: '<circle cx="12" cy="12" r="10" fill="#9aa0a8"/><path d="M8.4 8.4l7.2 7.2M15.6 8.4l-7.2 7.2" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
  userline: G('<circle cx="12" cy="8" r="3.6"/><path d="M5 20v-.8A5.2 5.2 0 0 1 10.2 14h3.6A5.2 5.2 0 0 1 19 19.2V20"/>'),
  cup: '<path d="M5 8.5h11v5.5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="currentColor"/><path d="M16 9.8h1.6a2.2 2.2 0 0 1 0 4.4H16" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 3.8v2.2M11 3.4v2.6M14 3.8v2.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  pencil_fill: '<path d="M4 20l1-4.6L16.6 3.8a2 2 0 0 1 2.8 0l.8.8a2 2 0 0 1 0 2.8L8.6 19z" fill="currentColor"/>',
  pencil: G('<path d="M4 20l1-4.5L16.6 3.9a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L8.5 19z"/><path d="M14.5 6l3.5 3.5"/>'),
  plus_s: '<path d="M12 6v12M6 12h12" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  chev_r: G('<path d="M9 5l7 7-7 7"/>'),
});
const xMonths = (u) => {
  const nowM = thisMonth(), out = [];
  for (let k = 0; k < 12; k++) { const d = new Date(Date.UTC(+nowM.slice(0, 4), +nowM.slice(5) - 1 - k, 1)).toISOString().slice(0, 7); if (k && d < String(u.hire_date).slice(0, 7)) break; out.push(d); }
  return out;
};
const monthLabel = (m) => `${mName(m + '-01')} ${m.slice(0, 4)}`;
// نافذة سفلية بسيطة (للمطالبة الجديدة والتفاصيل)
function xSheet(html, onMount) {
  const o = document.createElement('div');
  o.className = 'xov sheet';
  o.innerHTML = `<div class="xdlg xsheet" role="dialog">${html}</div>`;
  document.body.appendChild(o);
  o.close = () => o.remove();
  o.onclick = (e) => { if (e.target === o) o.close(); };
  o.querySelectorAll('[data-close]').forEach((b) => (b.onclick = o.close));
  if (onMount) onMount(o);
  return o;
}
const xSwitch = (on, attrs = '') => `<button type="button" class="xsw ${on ? 'on' : ''}" role="switch" aria-checked="${on ? 'true' : 'false'}" ${attrs}><i></i></button>`;
const xEmpty = (txt) => `<div class="xempty">${esc(t(txt))}</div>`;
const xPill = (label, cls) => `<span class="xpill ${cls}">${esc(t(label))}</span>`;
const clampName = (s, n = 18) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };
const fdate = (iso) => dMonY(String(iso).slice(0, 10));

/* ======================= الإشعارات ======================= */
const NOTIF_LABELS = { penalty: 'I Have A New Penalty', hiring: 'My Hiring Requests Are Accepted Or Rejected', adjust: 'My Bonus Or Deduction', doc_expiry: 'Your Document Expiration', new_shift: 'Notify For New Shift',
  comment_before: 'Someone Comments On A Request That I Commented On Before', comment_mine: 'Someone Comments On My Request', signout_reminder: 'For Sign Out Reminder', req_decision: 'My Requests Are Accepted Or Rejected' };
const NOTIF_TITLE = { penalty: 'New Penalty', hiring: 'Hiring Request', adjust: 'Bonus Or Deduction', doc_expiry: 'Document Expiration', new_shift: 'New Shift', comment_before: 'New Comment', comment_mine: 'New Comment', signout_reminder: 'Sign Out Reminder', req_decision: 'Request Update' };
PAGES.a_notif = async (view) => {
  const tab = S.nftab || 'history';
  view.innerHTML = `<div class="xpanel"><div class="xtabs2" id="nft"><button data-k="history" class="${tab === 'history' ? 'on' : ''}">${t('Notification History')}</button><button data-k="settings" class="${tab === 'settings' ? 'on' : ''}">${t('Settings')}</button></div><div id="nfb" class="xpbody">${xSpin}</div></div>`;
  $('#nft', view).onclick = (e) => { const b = e.target.closest('button'); if (b && b.dataset.k !== tab) { S.nftab = b.dataset.k; PAGES.a_notif(view); } };
  const body = $('#nfb', view);
  if (tab === 'settings') {
    let d;
    try { d = await api('/app/notif-prefs'); } catch (e) { body.innerHTML = xEmpty(e.message); return; }
    body.innerHTML = `<h4 class="xnotify">${t('Notify Me When')}</h4>${d.cats.map((c, i) => `<div class="xnrow ${i < 5 ? 'xbar' : ''}"><span class="xnl">${t(NOTIF_LABELS[c] || c)}</span>
      <span class="xnmail ${d.prefs[c].email ? 'on' : ''}">${fi('mail')}</span>${xSwitch(d.prefs[c].email, `data-c="${c}" data-ch="email"`)}${xSwitch(d.prefs[c].push, `data-c="${c}" data-ch="push"`)}<span class="xnphone ${d.prefs[c].push ? 'on' : ''}">${fi('phone_s')}</span></div>`).join('')}`;
    body.querySelectorAll('.xsw').forEach((b) => (b.onclick = async () => {
      const on = !b.classList.contains('on'), c = b.dataset.c, ch = b.dataset.ch;
      b.classList.toggle('on', on); b.setAttribute('aria-checked', on);
      const ic = b.parentElement.querySelector(ch === 'email' ? '.xnmail' : '.xnphone'); if (ic) ic.classList.toggle('on', on);
      try { await api('/app/notif-prefs', 'PUT', { cat: c, channel: ch, value: on }); } catch (e) { b.classList.toggle('on', !on); if (ic) ic.classList.toggle('on', !on); toast(e.message, true); }
    }));
    return;
  }
  const u = S.me.user, f = S.nff = S.nff || { from: '', to: '', ann: false };
  const paint = async () => {
    const list = $('#nfl', view);
    list.innerHTML = xSpin;
    try {
      if (f.ann) {
        const a = await api('/app/announcements');
        list.innerHTML = a.length ? a.map((x) => `<div class="xni"><b dir="auto">${esc(x.title)}</b><p dir="auto">${esc(x.text)}</p><small>${x.created_at ? ago(x.created_at) : ''}</small></div>`).join('') : xEmpty('No announcements');
      } else {
        const q = new URLSearchParams({ from: f.from, to: f.to }), n = await api('/app/notifications?' + q);
        list.innerHTML = n.length ? n.map((x, i) => `<div class="xni ${x.read ? '' : 'new'} ${noteTarget(x) ? 'go' : ''}" data-ni="${i}"><b>${t(NOTIF_TITLE[x.cat] || 'Notification')}</b><p dir="auto">${esc(x.text)}</p><small>${ago(x.created_at)}</small></div>`).join('') : xEmpty('No notifications');
        list.querySelectorAll('.xni.go').forEach((el) => (el.onclick = () => noteGo(n[Number(el.dataset.ni)])));
      }
    } catch (e) { list.innerHTML = xEmpty(e.message); }
  };
  body.innerHTML = `<div class="xfl"><label>${t('Employee')}</label><div class="xfrow"><label class="xfield sel"><span class="xfi">${fi('userline')}</span><select id="nfe"><option value="">${t('Select Employee')}</option><option value="${u.id}">${esc(u.name)}</option></select>${fi('chev_dn')}</label><button class="xclr" id="clr1" aria-label="${t('Clear')}"><svg class="ico" viewBox="0 0 24 24">${FI.clr}</svg></button></div>
      <div class="xft"><label>${t('From')}</label><label>${t('To')}</label></div>
      <div class="xfrow"><label class="xfield dt"><span class="xfi clk">${fi('clock_c')}</span><input type="date" id="nff" value="${f.from}"></label><label class="xfield dt"><span class="xfi clk">${fi('clock_c')}</span><input type="date" id="nft2" value="${f.to}"></label><button class="xclr" id="clr2" aria-label="${t('Clear')}"><svg class="ico" viewBox="0 0 24 24">${FI.clr}</svg></button></div>
      <div class="xann"><span>${t('Announcements')}</span>${xSwitch(f.ann, 'id="nfa"')}</div></div><div id="nfl" class="xnlist"></div>`;
  $('#nff', view).onchange = (e) => { f.from = e.target.value; paint(); };
  $('#nft2', view).onchange = (e) => { f.to = e.target.value; paint(); };
  $('#clr1', view).onclick = () => { $('#nfe', view).value = ''; };
  $('#clr2', view).onclick = () => { f.from = f.to = ''; $('#nff', view).value = $('#nft2', view).value = ''; paint(); };
  $('#nfa', view).onclick = (e) => { f.ann = !f.ann; e.currentTarget.classList.toggle('on', f.ann); paint(); };
  paint();
  if (S.me.unread) {
    api('/notifications/read', 'POST').then(() => { S.me.unread = 0; document.querySelectorAll('.ahead .dot').forEach((d) => d.remove()); }).catch(() => {});
  }
};

/* ======================= سجل الجدول ======================= */
const HIST_ST = { absent: 'Absent', off: 'Day Off', leave: 'On Leave', present: 'Present', late: 'Late' };
function profileCard(u) {
  return `<div class="card xprofc"><div class="xavw">${xav(u, 'md')}<span class="xbadge">${fi('plus_s')}</span></div><div class="mpi"><b dir="auto">${esc(u.name)}</b><span dir="auto">${esc(jobOf(u))}</span><span dir="auto">${esc(u.department || '')}</span></div></div>`;
}
PAGES.a_history = async (view) => {
  const u = S.me.user, months = xMonths(u), mo = months.includes(S.hmon) ? S.hmon : months[0];
  view.innerHTML = xSpin;
  let h;
  try { h = await api('/app/history?month=' + mo); } catch (e) { view.innerHTML = xEmpty(e.message); return; }
  const dayRow = (d) => {
    const n = Number(d.date.slice(8)), has_ = d.status !== 'off' && d.status !== 'leave';
    const tm = d.check_in ? `${isoTime(d.check_in)}${d.check_out ? ' - ' + isoTime(d.check_out) : ''}` : '';
    return `<div class="xh ${d.status}"><div class="xh1"><div class="xhd"><b>${n}</b><span>${mName(d.date)}</span></div><div class="xhs ${d.status}">${esc(d.holiday && d.status === 'off' ? d.holiday : t(HIST_ST[d.status]))}</div></div>
      ${has_ ? `<div class="xh2"><span class="xchip tm">${fi('clock_c')}<b>${tm || '_ _:_ _'}</b></span><span class="xchip br">${fi('cup')}<b>${hms(d.break_seconds)}</b></span>
        <button class="xic dark" data-i="${d.date}" aria-label="${t('Details')}">${fi('info_fill')}</button><button class="xic blue" data-e="${d.date}" aria-label="${t('Request Attendance Edit')}">${fi('pencil_fill')}</button></div>` : ''}</div>`;
  };
  view.innerHTML = `${profileCard(u)}<div class="card xcard xhist"><button class="xhm" id="hm"><span class="calic">${fi('calsearch')}</span><b>${esc(mName(mo + '-01'))}</b><span>${mo.slice(0, 4)}</span></button><div class="xline"></div>
    <div id="hl">${h.days.length ? h.days.map(dayRow).join('') : xEmpty('No records for this month')}</div></div>`;
  $('#hm', view).onclick = () => xRadioDialog('', months.map((m) => [m, monthLabel(m)]), mo, (k) => { S.hmon = k; PAGES.a_history(view); });
  view.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => {
    const d = h.days.find((x) => x.date === b.dataset.i);
    xSheet(`<h4>${esc(dMonY(d.date))} · ${esc(dowName(d.date))}</h4><div class="xkv">${[['Status', t(HIST_ST[d.status])], ['Sign In', d.check_in ? isoTime(d.check_in) : '--:--'], ['Sign Out', d.check_out ? isoTime(d.check_out) : '--:--'],
      ['Late', d.late_minutes ? t('{n} min', { n: d.late_minutes }) : '—'], ['Breaks', hms(d.break_seconds)]].map(([k, v]) => `<div><span>${t(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
      <div class="xdb one"><button class="xok" data-close>${t('OK')}</button></div>`);
  }));
  view.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => { S.nrPreset = { type: 'attendance_edit', date: b.dataset.e }; go('a_newreq'); }));
};

/* ======================= مطالباتي ======================= */
PAGES.a_claims = async (view) => {
  view.innerHTML = xSpin;
  let rq;
  try { rq = await api('/requests/mine'); } catch (e) { view.innerHTML = xEmpty(e.message); return; }
  let tab = S.cltab || 'pending';
  const catOf = (r) => { try { return JSON.parse(r.meta || '{}').category || ''; } catch { return ''; } };
  const draw = () => {
    S.cltab = tab;
    const rows = rq.requests.filter((r) => r.type === 'expense' && r.status === tab);
    view.innerHTML = `<div class="xstick">${xTabs('clt', [['pending', t('Pending')], ['approved', t('Approved')], ['rejected', t('Rejected')]], tab)}</div>
      <div class="xlist xbluebg">${rows.length ? rows.map((r) => {
        const [sl, sc] = STATUS_X[r.status];
        return `<div class="card xreq"><div class="xr1"><b>${money(r.amount)}</b>${xPill(sl, sc)}</div><div class="xr2">${esc(catOf(r) || t('Claim'))} · ${esc(dMonY(r.from_date))}</div>
          ${r.reason ? `<div class="xr3" dir="auto">${esc(r.reason)}</div>` : ''}${r.decision_note ? `<div class="xr3" dir="auto">${esc(r.decision_note)}</div>` : ''}
          ${r.status === 'pending' ? `<button class="xlink bad" data-del="${r.id}">${t('Cancel Request')}</button>` : ''}</div>`;
      }).join('') : ''}</div><button class="xaddbar" id="addc">${fi('plus_s')}<span>${t('Add New Claim')}</span></button>`;
    $('#clt', view).onclick = (e) => { const b = e.target.closest('button'); if (b) { tab = b.dataset.k; draw(); } };
    view.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { if (confirm(t('Cancel this request?'))) run(b, async () => { await api('/requests/' + b.dataset.del, 'DELETE'); rq.requests = rq.requests.filter((x) => x.id != b.dataset.del); toast(t('Request cancelled')); draw(); }); }));
    $('#addc', view).onclick = async () => {
      let cats = []; try { cats = await api('/app/claim-categories'); } catch { /* تجاهل */ }
      xSheet(`<h4>${t('Add New Claim')}</h4><form id="cf" class="xform">
        ${cats.length ? `<label>${t('Category')}<select name="cat">${cats.map((c) => `<option>${esc(c.name)}</option>`).join('')}</select></label>` : ''}
        <label>${t('Amount')}<input type="number" name="amount" min="0.01" step="0.01" required inputmode="decimal"></label>
        <label>${t('Date')}<input type="date" name="date" value="${S.me.today_date}" required></label>
        <label>${t('Comments')}<textarea name="reason" rows="3" maxlength="500" placeholder="${t('Write your comment here')}"></textarea></label>
        <div class="xdb"><button type="button" class="xcancel" data-close>${t('Cancel')}</button><button class="xok">${t('Submit')}</button></div></form>`, (o) => {
        const f = $('#cf', o);
        f.onsubmit = (e) => { e.preventDefault(); run($('.xok', f), async () => {
          await api('/requests', 'POST', { type: 'expense', from_date: f.date.value, to_date: f.date.value, amount: Number(f.amount.value), reason: f.reason.value.trim(), meta: { category: f.cat ? f.cat.value : '' } });
          o.close(); toast(t('Request submitted')); S.cltab = 'pending'; PAGES.a_claims(view);
        }); };
      });
    };
  };
  draw();
};

/* ======================= تكليفاتي ======================= */
PAGES.a_assign = async (view) => {
  view.innerHTML = xSpin;
  let rows;
  try { rows = (await api('/app/assignments')).rows; } catch (e) { view.innerHTML = xEmpty(e.message); return; }
  const today = S.me.today_date, f = S.asf || 'all';
  const state = (r) => (r.to && r.to < today ? 'done' : r.from && r.from > today ? 'upcoming' : 'current');
  const draw = () => {
    const list = rows.filter((r) => f === 'all' || state(r) === f);
    view.innerHTML = list.length ? `<div class="xlist">${list.map((r) => `<div class="card xreq"><div class="xr1"><b dir="auto">${esc(r.task || r.name)}</b>${xPill({ done: 'Completed', upcoming: 'Upcoming', current: 'Current' }[state(r)], state(r) === 'done' ? 'ok' : state(r) === 'upcoming' ? 'warn' : 'info')}</div>
        <div class="xr2">${r.from ? esc(dMonY(r.from)) : ''}${r.to ? ' - ' + esc(dMonY(r.to)) : ''}</div>${r.note ? `<div class="xr3" dir="auto">${esc(r.note)}</div>` : ''}</div>`).join('')}</div>` : `<div class="xcenter">${t('No assignments available')}</div>`;
  };
  S.pg.filter = () => xRadioDialog('', [['all', t('All')], ['current', t('Current')], ['upcoming', t('Upcoming')], ['done', t('Completed')]], S.asf || 'all', (k) => { S.asf = k; PAGES.a_assign(view); });
  draw();
};

/* ======================= جزاءاتي ======================= */
const PEN_TITLE = { absent: 'Absent Penalty (No Show)', late: 'Late Penalty', early: 'Early Leave Penalty' };
const PEN_UNIT = { 'الأيام': 'Days', 'الساعات': 'Hours', 'الدقائق': 'Minutes', 'جنيه': 'EGP' };
PAGES.a_penalties = async (view) => {
  const u = S.me.user, months = xMonths(u), mo = months.includes(S.pmon) ? S.pmon : months[0], [first, last] = monthRange(mo);
  let tab = S.pntab || 'all';
  view.innerHTML = xSpin;
  let rows;
  try { rows = (await api(`/att/penalties/mine?from=${first}&to=${last}`)).rows; } catch (e) { view.innerHTML = xEmpty(e.message); return; }
  rows = rows.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const draw = () => {
    S.pntab = tab;
    const list = rows.filter((r) => tab === 'all' || r.applied);
    view.innerHTML = `${xTabs('pnt', [['all', t('All')], ['applied', t('Applied')]], tab)}<div class="xlist">${list.length ? list.map((r) => `<div class="card xpen"><div class="xp1"><span class="xpv"><b>${Number(r.value) % 1 ? Number(r.value).toFixed(2) : Number(r.value)}</b> ${t(PEN_UNIT[r.unit] || r.unit)}</span>
        <span class="xpf ${r.applied ? '' : 'off'}">${t(r.applied ? 'From Salary' : 'Not Applied')}</span></div><div class="xp2"><span dir="auto">${esc(PEN_TITLE[r.kind] ? t(PEN_TITLE[r.kind]) : r.reason)}</span><span class="xpd">${esc(dMonY(r.date))}</span></div></div>`).join('') : xEmpty('No penalties')}</div>`;
    $('#pnt', view).onclick = (e) => { const b = e.target.closest('button'); if (b) { tab = b.dataset.k; draw(); } };
  };
  S.pg.filter = () => xRadioDialog('', months.map((m) => [m, monthLabel(m)]), mo, (k) => { S.pmon = k; PAGES.a_penalties(view); });
  draw();
};

/* ======================= المرتب ======================= */
PAGES.a_payroll = async (view) => {
  view.innerHTML = xSpin;
  const years = [...new Set(xMonths(S.me.user).map((m) => m.slice(0, 4)))], year = years.includes(S.pyear) ? S.pyear : years[0], nowM = thisMonth();
  let h;
  try { h = await api('/payroll/mine/history?year=' + year); } catch (e) { view.innerHTML = xEmpty(e.message); return; }
  const rows = h.rows.filter((r) => r.paid || r.month < nowM), open = S.popen = S.popen || {};
  const L = [['Basic Salary', 'accrued_basic'], ['Allowances', 'accrued_allowances'], ['Overtime', 'overtime_pay'], ['Bonuses', 'bonuses'], ['Compensation', 'compensation_pay'],
    ['Late Deduction', 'late_deduction', 1], ['Absence Deduction', 'absence_deduction', 1], ['Penalties', 'penalties', 1], ['Deductions', 'manual_deductions', 1], ['Loan Installment', 'loan_deduction', 1], ['Total Deductions', 'total_deductions', 1]];
  view.innerHTML = `${years.length > 1 ? `<div class="xyear"><select id="py">${years.map((y) => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select></div>` : ''}
    <div class="xlist">${rows.length ? rows.map((r) => `<div class="card xpay ${open[r.month] ? 'open' : ''}" data-m="${r.month}"><div class="xpt"><div><div class="xpn"><b>${t('{m} payroll', { m: mName(r.month + '-01') })}</b><span class="xps ${r.paid ? 'ok' : 'warn'}">${t(r.paid ? 'Paid' : 'Pending')}</span></div><div class="xpm">${Number(r.net).toFixed(2)}</div></div>
      <button class="xchv" aria-label="${t('Details')}">${fi('chev_dn')}</button></div>
      <div class="xpd2">${L.filter(([, k]) => Number(r[k])).map(([l, k, neg]) => `<div><span>${t(l)}</span><b class="${neg ? 'neg' : ''}">${neg ? '-' : ''}${Number(r[k]).toFixed(2)}</b></div>`).join('')}<div class="tot"><span>${t('Net Salary')}</span><b>${Number(r.net).toFixed(2)}</b></div></div></div>`).join('') : xEmpty('No payroll yet')}</div>`;
  view.querySelectorAll('.xpay').forEach((c) => (c.querySelector('.xchv').onclick = () => { open[c.dataset.m] = !open[c.dataset.m]; c.classList.toggle('open', !!open[c.dataset.m]); }));
  if ($('#py', view)) $('#py', view).onchange = (e) => { S.pyear = e.target.value; PAGES.a_payroll(view); };
};

/* ======================= الملف الشخصي ======================= */
const GENDER_X = { male: 'Male', female: 'Female' }, MARITAL_X = { single: 'Single', married: 'Married', divorced: 'Divorced', widowed: 'Widowed' };
PAGES.a_profile = async (view) => {
  const u = S.me.user;
  view.innerHTML = xSpin;
  let ex = { manager_name: '', offices: [] };
  try { ex = await api('/app/profile'); } catch { /* تجاهل */ }
  const sec = (title, rows) => `<h3 class="xsec">${t(title)}</h3><div class="card xinfo">${rows.map(([k, v]) => `<div><span>${t(k)}</span><b dir="auto">${esc(v || '—')}</b></div>`).join('')}</div>`;
  view.innerHTML = `<div class="xbig"><span class="xav xl ${u.has_avatar ? '' : ''}"${avAttr(u)}>${initial1(u.name)}</span><button class="xedit" id="pedit" aria-label="${t('Edit')}">${fi('pencil')}</button></div>
    <div class="xpname"><b dir="auto">${esc(u.name)}</b><span dir="auto">${esc(jobOf(u))}</span></div>
    ${sec('General', [['Date Of Birth', u.birth_date], ['Gender', t(GENDER_X[u.gender] || '') || ''], ['Marital Status', t(MARITAL_X[u.marital_status] || '') || '']])}
    ${sec('Office', [['Office', ex.offices.join(' - ') || (S.me.settings.locations || []).join(' - ')], ['Department', u.department], ['Job Title', u.job_title], ['Direct Manager', ex.manager_name]])}
    ${sec('Employment', [['Employee ID', u.employee_code], ['Hire Date', u.hire_date ? dMonY(u.hire_date) : ''], ['Shift', `${tmA(u.shift_start)} - ${tmA(u.shift_end)}`], ['Nationality', u.nationality]])}
    ${sec('Contact', [['Phone', u.phone], ['Email', u.email], ['Username', u.username]])}`;
  $('#pedit', view).onclick = () => pickAvatar(u.id, async () => { S.me = await api('/me'); renderShell(); });
};

/* ======================= مكافآتي وخصوماتي ======================= */
PAGES.a_adjust = async (view) => {
  view.innerHTML = xSpin;
  let rows;
  try { rows = (await api('/app/adjustments')).rows; } catch (e) { view.innerHTML = xEmpty(e.message); return; }
  let tab = S.adtab || 'bonus';
  const draw = () => {
    S.adtab = tab;
    const list = rows.filter((r) => (tab === 'bonus' ? r.kind === 'bonus' : r.kind !== 'bonus'));
    view.innerHTML = `${xTabs('adt', [['bonus', t('Bonus')], ['deduction', t('Deductions')]], tab)}<div class="xlist">${list.length ? list.map((r) => {
      const end = monthRange(r.month)[1];
      return `<div class="card xadj"><div class="xa1"><b dir="auto">${esc(r.reason || t(r.kind === 'bonus' ? 'Bonus' : 'Deductions'))}</b>${xPill(r.paid ? 'Paid' : 'Pending', r.paid ? 'ok' : 'warn')}</div>
        <div class="xa2"><div><span>${t('Amount')}</span><b class="${r.kind === 'bonus' ? 'pos' : 'neg'}">${Number(r.amount).toFixed(2)}</b><small>EGP</small></div><div><span>${t('Payable At')}</span><b class="plain">${esc(dMonY(end))}</b></div>
        <span class="xby" dir="auto">${t('Created By')}: ${esc(clampName(r.created_by_name || '—', 14))}</span></div></div>`;
    }).join('') : xEmpty('No records')}</div>`;
    $('#adt', view).onclick = (e) => { const b = e.target.closest('button'); if (b) { tab = b.dataset.k; draw(); } };
  };
  draw();
};

/* ======================= دليل الموظفين ======================= */
PAGES.a_dir = async (view) => {
  view.innerHTML = xSpin;
  let rows;
  try { rows = await api('/app/directory'); } catch (e) { view.innerHTML = xEmpty(e.message); return; }
  view.innerHTML = `<label class="xsearch">${fi('search')}<input id="dq" placeholder="${t('Search')}" autocomplete="off"></label><div class="xlist" id="dl"></div>`;
  const draw = () => {
    const q = $('#dq', view).value.trim().toLowerCase();
    const list = rows.filter((r) => !q || [r.name, r.job_title, r.department, r.phone].some((x) => String(x || '').toLowerCase().includes(q)));
    $('#dl', view).innerHTML = list.length ? list.map((r) => `<div class="card xdir"><div class="xd1">${xav(r, 'md')}<div class="mpi"><b dir="auto">${esc(r.name)}</b><span dir="auto">${esc(r.job_title || '')}</span><span dir="auto">${esc(r.department || '')}</span></div></div>
      ${r.phone || r.email ? `<div class="xd2">${r.phone ? `<a class="xcall" href="tel:${esc(r.phone)}">${fi('phone')} <span dir="ltr">${esc(r.phone)}</span></a>` : ''}${r.email ? `<a class="xcall" href="mailto:${esc(r.email)}">${fi('mail')} <span dir="ltr">${esc(r.email)}</span></a>` : ''}</div>` : ''}</div>`).join('') : xEmpty('No employees found');
    paintAvatars($('#dl', view));
  };
  $('#dq', view).oninput = draw;
  draw();
};

/* ======================= الاستراحات ======================= */
PAGES.a_breaks = async (view) => {
  view.innerHTML = xSpin;
  let d;
  try { d = await api('/app/breaks'); } catch (e) { view.innerHTML = xEmpty(e.message); return; }
  const td = S.me.today, signed = !!(td && td.check_in && !td.check_out), run_ = d.rows.find((r) => !r.end_at);
  const secs = (r) => Math.max(0, ((r.end_at ? new Date(r.end_at) : new Date()) - new Date(r.start_at)) / 1000);
  const total = () => d.rows.reduce((s, r) => s + secs(r), 0);
  view.innerHTML = `<div class="card xbk"><div class="xbt" id="bt">${hms(total())}</div><div class="xbs">${t(run_ ? 'Break in progress' : 'Total break time today')}</div>
    ${u_admin() ? '' : `<button class="xbtn ${run_ ? 'out' : ''}" id="bb" ${!run_ && !signed ? 'disabled' : ''}>${fi('cup')}<span>${t(run_ ? 'End Break' : 'Start Break')}</span></button>`}
    ${!run_ && !signed ? `<p class="xwarn">${t(td && td.check_out ? 'You already signed out today' : 'Sign in first to start a break')}</p>` : ''}</div>
    <div class="xlist">${d.rows.map((r, i) => `<div class="card xreq"><div class="xr1"><b>${t('Break')} ${i + 1}</b><span class="xpill ${r.end_at ? 'ok' : 'warn'}">${r.end_at ? hms(secs(r)) : t('Running')}</span></div>
      <div class="xr2">${isoTime(r.start_at.slice(0, 19) + (r.start_at.endsWith('Z') ? '' : 'Z'))}${r.end_at ? ' - ' + isoTime(r.end_at) : ''}</div></div>`).join('')}</div>`;
  const tick = () => { const el = $('#bt'); if (!el) return clearInterval(PAGES.a_breaks.t); el.textContent = hms(total()); };
  clearInterval(PAGES.a_breaks.t); if (run_) PAGES.a_breaks.t = setInterval(tick, 1000);
  const bb = $('#bb', view);
  if (bb) bb.onclick = () => run(bb, async () => { await api(`/app/breaks/${run_ ? 'end' : 'start'}`, 'POST'); toast(t(run_ ? 'Break ended' : 'Break started')); PAGES.a_breaks(view); });
};
const u_admin = () => S.me.user.is_admin;
}
