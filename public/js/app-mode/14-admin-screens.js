'use strict';
/* app-mode/14-admin-screens.js — شاشات الأدمن/المدير في التطبيق (الشكل المرجعي): خصم جديد، مكافأة، طلب بالنيابة، سجل حضور،
   تغيير وردية، تكليف، موظف جديد (3 خطوات) + قائمة زرار +. بتشتغل في وضع التطبيق بس، والموقع مش بيتأثر. */
if (IS_APP) {
const ADM_T = { ad_deduct: 'إضافة خصم جديد', ad_bonus: 'أضف مكافأة جديدة', ad_request: 'طلب جديد', ad_record: 'سجل جديد', ad_shift: 'تغيير الوردية', ad_assign: 'تكليف جديد', ad_emp: 'موظف جديد' };
APP_PAGES.push(...Object.keys(ADM_T));
Object.assign(FI, {
  q_task: FI.q_task || '',
  a_clock: '<circle cx="12" cy="12" r="9.3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 6.8V12l3.3 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  a_plus_c: '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v10M7 12h10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  a_check: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  a_pen: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" fill="currentColor" opacity=".55"/><path d="M13.5 7.5l3 3" stroke="#fff" stroke-width="1.4"/><rect x="13" y="19" width="8" height="2" rx="1" fill="currentColor" opacity=".35"/>',
  a_extra: '<rect x="4" y="3" width="10" height="13" rx="2.2" fill="currentColor" opacity=".35"/><rect x="9" y="8" width="11" height="13" rx="2.2" fill="currentColor"/><path d="M14.5 12v5M12 14.5h5" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>',
  a_swap: '<rect x="3.5" y="3.5" width="10" height="10" rx="2.4" fill="currentColor" opacity=".35"/><rect x="10.5" y="10.5" width="10" height="10" rx="2.4" fill="currentColor"/><path d="M13.7 15.5a2.8 2.8 0 0 1 4.6-1.2M18.4 12.6v1.8h-1.8M17.3 15.5a2.8 2.8 0 0 1-4.6 1.2" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>',
  a_addin: '<rect x="3" y="5" width="15" height="15" rx="3" fill="currentColor" opacity=".35"/><path d="M3 10h15M8 3v4M13 3v4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="18" cy="17.5" r="4.2" fill="currentColor"/><path d="M18 15.4v4.2M15.9 17.5h4.2" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>',
  a_cam: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.3-2h5.4L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12.5" r="3.4" fill="none" stroke="currentColor" stroke-width="1.6"/>',
});
const fiA = (n, c = '') => `<svg class="ico fi ${c}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${FI[n] || ''}</svg>`;

/* ---------- الهيدر ---------- */
const hPrev = appHeader;
appHeader = function () {
  const c = ADM_T[S.page];
  if (!c) return hPrev();
  return `<header class="ahead plain"><button class="ab-circle" id="aback" aria-label="رجوع">${fi(isAr() ? 'back' : 'chev_l')}</button><h1>${c}</h1><span></span></header>`;
};

/* ---------- عناصر النماذج ---------- */
const aRad = (n, items, cur) => items.map(([k, l]) => `<button type="button" class="arad ${k === cur ? 'on' : ''}" data-n="${n}" data-k="${k}"><i></i><span>${l}</span></button>`).join('');
const aChk = (id, l, on) => `<button type="button" class="achk ${on ? 'on' : ''}" id="${id}"><i>${fiA('a_check')}</i><span>${l}</span></button>`;
const aSel = (id, ph, dis) => `<button type="button" class="asel ph ${dis ? 'dis' : ''}" id="${id}" data-ph="${ph}"><span>${ph}</span>${fi('chev_dn')}</button>`;
const aDt = (id, ph, type = 'date') => `<label class="adt"><span class="aic">${fiA('a_clock')}</span><span class="atx ph" data-ph="${ph}">${ph}</span><input type="${type}" id="${id}"></label>`;
const aLab = (s) => `<div class="alab">${s}</div>`;
const aH = (s) => `<h3 class="xh2 thin ahs">${s}</h3>`;
function setSel(btn, text) { btn.classList.toggle('ph', !text); $('span', btn).textContent = text || btn.dataset.ph; }
function multiDialog(title, options, sel, onOk) {
  const o = document.createElement('div');
  o.className = 'xov';
  const cur = new Set(sel.map(String));
  o.innerHTML = `<div class="xdlg" role="dialog">${title ? `<h4>${esc(title)}</h4>` : ''}<div class="xopts multi">${options.map(([k, l]) => `<button class="xopt" data-k="${esc(k)}"><i></i><span>${esc(l)}</span></button>`).join('') || '<div class="empty">لا توجد خيارات</div>'}</div>
    <div class="xdb"><button class="xcancel">${t('Cancel')}</button><button class="xok">${t('Confirm')}</button></div></div>`;
  document.body.appendChild(o);
  const paint = () => o.querySelectorAll('.xopt').forEach((b) => b.classList.toggle('on', cur.has(b.dataset.k)));
  paint();
  o.onclick = (e) => { if (e.target === o) o.remove(); };
  o.querySelectorAll('.xopt').forEach((b) => (b.onclick = () => { cur.has(b.dataset.k) ? cur.delete(b.dataset.k) : cur.add(b.dataset.k); paint(); }));
  $('.xcancel', o).onclick = () => o.remove();
  $('.xok', o).onclick = () => { o.remove(); onOk([...cur]); };
}
// ربط الراديو والمربعات وحقول التاريخ داخل الصفحة
function bindForm(view, F, onChange) {
  view.addEventListener('click', (e) => {
    const r = e.target.closest('.arad');
    if (r) { F[r.dataset.n] = r.dataset.k; view.querySelectorAll(`.arad[data-n="${r.dataset.n}"]`).forEach((x) => x.classList.toggle('on', x === r)); if (onChange) onChange(r.dataset.n); return; }
    const c = e.target.closest('.achk');
    if (c) {
      c.classList.toggle('on'); const on = c.classList.contains('on');
      if (c.dataset.loc) { const id = Number(c.dataset.loc); F.locs = on ? [...new Set([...(F.locs || []), id])] : (F.locs || []).filter((x) => x !== id); } else F[c.id] = on;
      if (onChange) onChange(c.id || 'loc');
    }
  });
  view.addEventListener('change', (e) => {
    const i = e.target.closest('.adt input'); if (!i) return;
    const tx = $('.atx', i.parentElement);
    tx.textContent = i.value ? (i.type === 'date' ? dMonY(i.value) : i.type === 'time' ? tmA(i.value) : `${dMonY(i.value.slice(0, 10))} ${tmA(i.value.slice(11, 16))}`) : tx.dataset.ph;
    tx.classList.toggle('ph', !i.value);
  });
}
const pickOne = (btn, title, getOpts, get, set, F) => (btn.onclick = () => {
  if (btn.classList.contains('dis')) return;
  xRadioDialog(title, getOpts(), get(), (k) => { set(k); setSel(btn, (getOpts().find((x) => x[0] === k) || [])[1]); });
});
const locIds = (u) => { let v = u && u.location_ids; if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = []; } } return Array.isArray(v) ? v.map(Number) : []; };
const loadEmps = async () => (await api('/employees')).filter((e) => !e.pending && e.active && !e.is_admin);
const loadList = async (path) => { try { return await api(path); } catch { return []; } };
const backTo = () => (S.prevPage && !ADM_T[S.prevPage] && S.prevPage !== S.page ? S.prevPage : 'menu');
const done = (msg) => { toast(msg || 'تم الحفظ'); go(backTo()); };
// صندوق «المواقع» المشترك (سجل جديد / تغيير وردية / تكليف)
function locBox(F, locs, variant) {
  const a = variant === 'assign';
  return `<div class="abox"><h4 class="ah">المواقع</h4>
    ${aRad('lm', a ? [['any', 'من أى مكان'], ['company', 'أي مكان عمل في الشركة'], ['spec', 'أماكن عمل محددة']] : [['office', 'المكتب الخاص بالموظف'], ['company', 'أي مكان عمل في الشركة'], ['any', 'من أى مكان'], ['spec', 'أماكن عمل محددة']], F.lm)}
    <div class="aspec" id="aspec" ${F.lm === 'spec' ? '' : 'hidden'}>${locs.map((l) => `<button type="button" class="achk ${(F.locs || []).includes(l.id) ? 'on' : ''}" data-loc="${l.id}"><i>${fiA('a_check')}</i><span>${esc(l.name)}</span></button>`).join('') || '<div class="muted small">لا توجد مواقع مضافة</div>'}</div>
    ${a ? '' : `<div class="achks">${aChk('ipok', 'السماح بتسجيل الحضور من عنوان Ip الخاص بالمكتب')}${aChk('outok', 'السماح بتسجيل الحضور خارج المواقع المحددة')}${aChk('customok', 'السماح بإضافة مواقع مخصصة في ملف الموظف')}</div>`}
    ${a ? '' : '<h4 class="ah mt">مواقع تسجيل الانصراف</h4>'}${aChk('same', a ? 'قم بتطبيق نفس الإعدادات عند تسجيل الانصراف' : 'قم بتطبيق نفس الإعدادات لتسجيل الانصراف', true)}</div>`;
}
const altTimes = (id) => `<div class="aalt" id="${id}"><button type="button" class="aaltb" id="${id}b"><b>توقيتات العمل البديلة</b>${fiA('a_plus_c')}</button><div id="${id}l"></div></div>`;
function bindAlt(view, F, id) {
  F.alts = [];
  const draw = () => {
    $('#' + id + 'l', view).innerHTML = F.alts.map((a, i) => `<div class="aaltr"><input type="time" data-i="${i}" data-w="s" value="${a.s}"><span>→</span><input type="time" data-i="${i}" data-w="e" value="${a.e}"><button type="button" data-x="${i}" aria-label="حذف">×</button></div>`).join('');
  };
  $('#' + id + 'b', view).onclick = () => { F.alts.push({ s: '09:00', e: '17:00' }); draw(); };
  $('#' + id + 'l', view).addEventListener('input', (e) => { const i = e.target.dataset.i; if (i !== undefined) F.alts[i][e.target.dataset.w] = e.target.value; });
  $('#' + id + 'l', view).addEventListener('click', (e) => { const x = e.target.closest('[data-x]'); if (x) { F.alts.splice(Number(x.dataset.x), 1); draw(); } });
}
const noteOf = (F, locs) => {
  const lm = { office: 'مكتب الموظف', company: 'أي مكان عمل في الشركة', any: 'من أي مكان', spec: 'أماكن محددة: ' + (F.locs || []).map((id) => (locs.find((l) => l.id === id) || {}).name).filter(Boolean).join('، ') }[F.lm] || '';
  return [lm && 'المواقع: ' + lm, F.half && 'نصف يوم', (F.alts || []).length && 'توقيتات بديلة: ' + F.alts.map((a) => `${a.s}-${a.e}`).join(' / ')].filter(Boolean).join(' | ');
};

/* ======================= خصم جديد / مكافأة جديدة ======================= */
const adjPage = (kind) => async (view) => {
  view.innerHTML = xSpin;
  const isB = kind === 'bonus', [emps, depts, locs] = await Promise.all([loadEmps(), Promise.resolve(null), loadList('/locations')]);
  const dl = [...new Set(emps.map((e) => e.department).filter(Boolean))], F = { mode: 'custom', bk: 'bonus', apply: 'emp', unit: '', basis: isB ? 'base' : 'both' };
  const pol = await loadList(isB ? '/config/allowance' : '/config/deduction');
  view.innerHTML = `${aH('النوع')}<div class="card xcard acard">${aRad('mode', isB ? [['custom', 'سياسة مخصصة'], ['policy', 'سياسة المكافآت']] : [['custom', 'خصم خاص'], ['policy', 'خصم متعلق بالسياسات']], 'custom')}</div>
    <div class="card xcard acard">
      ${isB ? `<h4 class="ah">نوع المكافأة</h4><div class="arow2">${aRad('bk', [['bonus', 'المكافآت'], ['commission', 'العمولة']], 'bonus')}</div>${aChk('net', 'مكافأة الصافي')}` : ''}
      ${aLab(isB ? 'اسم المكافأة' : 'اسم الخصم')}<input class="ainp" id="nm" placeholder="أدخل الاسم" maxlength="80">${aSel('polsel', 'اختر السياسة', false).replace('class="asel', 'hidden class="asel')}
      <h4 class="ah mt">تُطبق لـ</h4>
      ${aRad('apply', [['emp', 'الموظف']], 'emp')}<div id="w_emp">${aSel('semp', 'اختر الموظف')}</div>
      ${aRad('apply', [['dept', 'الأقسام']], 'emp')}<div id="w_dept" hidden>${aSel('sdept', 'اختر الأقسام')}</div>
      ${aRad('apply', [['office', 'المكاتب']], 'emp')}<div id="w_office" hidden>${aSel('soff', 'اختر المكاتب')}</div>
    </div>
    <div class="card xcard acard">${aRad('unit', [['fixed', 'مبلغ ثابت'], ['days', 'أيام'], ['hours', 'ساعات']], '')}<div id="bwrap" hidden><h4 class="ah mt">يُحسب اليوم من</h4>${aRad('basis', [['base', 'الأساسي'], ['both', 'الأساسي والحافز']], isB ? 'base' : 'both')}</div><div id="vwrap" hidden>${aLab('<span id="vlab"></span>')}<input class="ainp" id="val" type="number" min="0" step="0.01" inputmode="decimal"></div></div>
    <div class="card xcard acard">${aLab('الوصف')}<textarea class="xta" id="desc" rows="3" maxlength="150" placeholder="اكتب الوصف هنا"></textarea></div>
    <button class="xsubmit" id="save">حفظ</button>`;
  const sel = { emp: null, dept: [], off: [] };
  const sync = (n) => {
    if (n === 'apply') ['emp', 'dept', 'office'].forEach((k) => { $('#w_' + k, view).hidden = F.apply !== k; });
    if (n === 'unit') { $('#vwrap', view).hidden = false; $('#vlab', view).textContent = { fixed: 'المبلغ', days: 'عدد الأيام', hours: 'عدد الساعات' }[F.unit]; $('#bwrap', view).hidden = F.unit === 'fixed'; }
    if (n === 'mode') { const p = F.mode === 'policy' && pol.length; $('#nm', view).hidden = !!p; $('#polsel', view).hidden = !p; }
  };
  bindForm(view, F, sync);
  pickOne($('#semp', view), 'اختر الموظف', () => emps.map((e) => [String(e.id), e.name]), () => sel.emp, (k) => { sel.emp = k; });
  $('#sdept', view).onclick = () => multiDialog('الأقسام', dl.map((d) => [d, d]), sel.dept, (v) => { sel.dept = v; setSel($('#sdept', view), v.join('، ')); });
  $('#soff', view).onclick = () => multiDialog('المكاتب', locs.map((l) => [String(l.id), l.name]), sel.off, (v) => { sel.off = v; setSel($('#soff', view), v.map((id) => (locs.find((l) => String(l.id) === id) || {}).name).join('، ')); });
  pickOne($('#polsel', view), 'اختر السياسة', () => pol.filter((x) => x.active).map((x) => [String(x.id), x.name]), () => F.pol, (k) => { F.pol = k; $('#nm', view).value = (pol.find((x) => String(x.id) === k) || {}).name || ''; });
  $('#save', view).onclick = (e) => run(e.currentTarget, async () => {
    const name = $('#nm', view).value.trim(), v = Number($('#val', view).value);
    if (!name) throw new Error('اكتب الاسم');
    let who = [];
    if (F.apply === 'emp') who = emps.filter((x) => String(x.id) === sel.emp);
    else if (F.apply === 'dept') who = emps.filter((x) => sel.dept.includes(x.department));
    else who = emps.filter((x) => locIds(x).some((id) => sel.off.includes(String(id))));
    if (!who.length) throw new Error(F.apply === 'emp' ? 'اختر الموظف' : 'لا يوجد موظفون في الاختيار');
    if (!F.unit) throw new Error('اختر نوع القيمة (مبلغ ثابت / أيام / ساعات)');
    if (!(v > 0)) throw new Error('اكتب قيمة أكبر من صفر');
    const desc = $('#desc', view).value.trim(), month = thisMonth();
    for (const u of who) {
      let amount = v;
      if (F.unit !== 'fixed') {
        if (u.base_salary === undefined) throw new Error('لا تملك صلاحية عرض المرتبات لحساب الأيام والساعات');
        const day = (Number(u.base_salary) + (F.basis === 'both' ? Number(u.allowances) || 0 : 0)) / 30, sh = Math.max(1, (Number(u.shift_end.slice(0, 2)) * 60 + Number(u.shift_end.slice(3)) - Number(u.shift_start.slice(0, 2)) * 60 - Number(u.shift_start.slice(3))) / 60);
        amount = F.unit === 'days' ? v * day : (v * day) / sh;
      }
      amount = Math.round(amount * 100) / 100;
      if (!(amount > 0)) throw new Error(`مرتب ${u.name} صفر، اختر مبلغ ثابت`);
      const unitTxt = F.unit === 'fixed' ? '' : ` (${v} ${F.unit === 'days' ? 'يوم' : 'ساعة'} من ${F.basis === 'both' ? 'الأساسي والحافز' : 'الأساسي'})`;
      const reason = [(F.bk === 'commission' && isB ? 'عمولة: ' : '') + name + unitTxt, F.net ? '(صافي)' : '', desc].filter(Boolean).join(' - ');
      await api('/adjustments', 'POST', { user_id: u.id, month, kind, amount, reason });
    }
    done(`تمت إضافة ${isB ? 'المكافأة' : 'الخصم'} لـ ${who.length} موظف`);
  });
};
PAGES.ad_deduct = adjPage('deduction');
PAGES.ad_bonus = adjPage('bonus');

/* ======================= طلب جديد (بالنيابة عن موظف) ======================= */
PAGES.ad_request = async (view) => {
  view.innerHTML = xSpin;
  const emps = await loadEmps(), today = S.me.today_date, me = S.me.user, behalf = has('requests.approve'), pre = S.adp || {}; S.adp = null;
  const list = behalf ? emps : [];
  let a = today, b = today, picking = false, cm = today.slice(0, 7), emp = pre.behalf === false || !behalf ? String(me.id) : '', ty = '';
  const opts = behalf ? [...(emps.some((e) => e.id === me.id) ? [] : [[String(me.id), me.name]]), ...list.map((e) => [String(e.id), e.name])] : [[String(me.id), me.name]];
  const types = Object.entries(OWN_TYPES()).filter(([k]) => !['expense', 'loan', 'shift_swap', 'leave_swap'].includes(k));
  view.innerHTML = `<div class="card xcard xcal"><div class="xcalh"><button id="cprev" class="xnav">${fi('back')}</button><b id="ctitle"></b><button id="cnext" class="xnav">${fi('chev_l')}</button></div>
      <div class="xdows en">${['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((x) => `<span>${x}</span>`).join('')}</div><div class="xdays" id="cgrid"></div></div>
    ${aH('تفاصيل الطلب')}<div class="card xcard acard">${aLab('الموظف')}${aSel('semp', 'تحديد خيار')}${aLab('نوع الطلب')}${aSel('sty', 'اختر نوع الطلب', true)}
      <div id="xhrs" hidden><div class="xtimes"><label>${t('From')}<input type="time" id="tfrom" value="09:00"></label><label>${t('To')}<input type="time" id="tto" value="10:00"></label></div></div>
      ${aLab('تعليقات')}<textarea class="xta" id="cmt" rows="3" maxlength="500" placeholder="اكتب تعليقك هنا"></textarea></div>
    <button class="xsubmit" id="save">حفظ</button>`;
  const paint = () => {
    const [y, m] = cm.split('-').map(Number), first = new Date(Date.UTC(y, m - 1, 1)), n = new Date(Date.UTC(y, m, 0)).getUTCDate(), lo = a < b ? a : b, hi = a < b ? b : a;
    $('#ctitle').innerHTML = `<span dir="ltr">${y} &nbsp;${new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })}</span>`;
    let h = ''; for (let i = 0; i < first.getUTCDay(); i++) h += '<span></span>';
    for (let d = 1; d <= n; d++) { const ds = `${cm}-${String(d).padStart(2, '0')}`; h += `<button class="xd ${ds === a || ds === b ? 'on' : ''} ${ds > lo && ds < hi ? 'rng' : ''}" data-d="${ds}">${d}</button>`; }
    $('#cgrid').innerHTML = h;
    view.querySelectorAll('.xd').forEach((x) => (x.onclick = () => { const d = x.dataset.d; if (!picking) { a = b = d; picking = true; } else { b = d; picking = false; } paint(); }));
  };
  $('#cprev').onclick = () => { cm = new Date(Date.UTC(+cm.slice(0, 4), +cm.slice(5) - 2, 1)).toISOString().slice(0, 7); paint(); };
  $('#cnext').onclick = () => { cm = new Date(Date.UTC(+cm.slice(0, 4), +cm.slice(5), 1)).toISOString().slice(0, 7); paint(); };
  const needH = () => ['permission', 'unpaid_permission', 'overtime'].includes(ty);
  pickOne($('#semp', view), 'الموظف', () => opts, () => emp, (k) => { emp = k; $('#sty', view).classList.remove('dis'); });
  pickOne($('#sty', view), 'نوع الطلب', () => types, () => ty, (k) => { ty = k; $('#xhrs', view).hidden = !needH(); });
  if (emp) { setSel($('#semp', view), me.name); $('#sty', view).classList.remove('dis'); }
  $('#save', view).onclick = (e) => run(e.currentTarget, async () => {
    if (!emp) throw new Error('اختر الموظف'); if (!ty) throw new Error('اختر نوع الطلب');
    const lo = a < b ? a : b, hi = a < b ? b : a, body = { type: ty, from_date: lo, to_date: needH() ? lo : hi, reason: $('#cmt', view).value.trim() };
    if (Number(emp) !== me.id) body.user_id = Number(emp);
    if (needH()) {
      const [fh, fm] = $('#tfrom', view).value.split(':').map(Number), [th, tm] = $('#tto', view).value.split(':').map(Number), mins = th * 60 + tm - (fh * 60 + fm);
      if (!(mins > 0)) throw new Error(t('End time must be after start time'));
      body.hours = Math.round(mins / 15) / 4; body.meta = { from_time: $('#tfrom', view).value, to_time: $('#tto', view).value };
    }
    await api('/requests', 'POST', body); done('تم تقديم الطلب');
  });
  paint();
};

/* ======================= سجل حضور جديد ======================= */
PAGES.ad_record = async (view) => {
  view.innerHTML = xSpin;
  const pre = S.adp || {}; S.adp = null;
  const [emps, locs, scheds] = await Promise.all([loadEmps(), loadList('/locations'), loadList('/config/schedule')]);
  const F = { day: 'normal', keep: pre.keep || 'extra', lm: 'office', emp: pre.emp ? String(pre.emp) : '', locs: [] };
  view.innerHTML = `${aH('الموظف')}<div class="card xcard acard">${aSel('semp', 'اختر الموظف')}${aRad('day', [['off', 'تعيين يوم عطلة'], ['normal', 'يوم عمل عادي'], ['exc', 'يوم عمل استثنائي']], 'normal')}</div>
    <div class="card xcard acard"><h4 class="ah">نوع الاحتفاظ بالوردية الافتراضية للوردية</h4><div class="arow2 wide">${aRad('keep', [['extra', 'وردية إضافية'], ['replace', 'استبدل الوردية الافتراضية بالوردية']], F.keep)}</div>
      ${aLab('التاريخ')}${aDt('dd', 'تحديد التاريخ')}
      <div class="agrid2"><div>${aLab('تسجيل الحضور')}${aDt('din', 'تحديد التاريخ', 'datetime-local')}</div><div>${aLab('تسجيل الانصراف')}${aDt('dout', 'تحديد التاريخ', 'datetime-local')}</div></div>
      ${aLab('موقع تسجيل الحضور')}${aSel('sli', 'اختر موقع')}${aLab('موقع تسجيل الانصراف')}${aSel('slo', 'اختر موقع')}</div>
    <div class="card xcard acard" id="more">${aLab('مواعيد العمل العادية')}${aSel('ssch', 'اختر مواعيد العمل')}${aChk('half', 'السماح بنصف يوم')}${locBox(F, locs)}${altTimes('alt')}</div>
    <button class="xsubmit" id="save">حفظ</button>`;
  bindForm(view, F, (n) => { if (n === 'lm') $('#aspec', view).hidden = F.lm !== 'spec'; if (n === 'day') { $('#more', view).hidden = F.day === 'off'; } });
  bindAlt(view, F, 'alt');
  const eo = () => emps.map((e) => [String(e.id), e.name]);
  pickOne($('#semp', view), 'اختر الموظف', eo, () => F.emp, (k) => { F.emp = k; });
  if (F.emp) setSel($('#semp', view), (emps.find((e) => String(e.id) === F.emp) || {}).name);
  pickOne($('#sli', view), 'موقع تسجيل الحضور', () => locs.map((l) => [String(l.id), l.name]), () => F.li, (k) => { F.li = k; });
  pickOne($('#slo', view), 'موقع تسجيل الانصراف', () => locs.map((l) => [String(l.id), l.name]), () => F.lo, (k) => { F.lo = k; });
  pickOne($('#ssch', view), 'مواعيد العمل', () => scheds.filter((x) => x.active).map((x) => [String(x.id), `${x.name} (${x.start} - ${x.end})`]), () => F.sch, (k) => { F.sch = k; });
  if (pre.date) { const d = $('#dd', view); d.value = pre.date; d.dispatchEvent(new Event('change', { bubbles: true })); }
  $('#save', view).onclick = (e) => run(e.currentTarget, async () => {
    const u = emps.find((x) => String(x.id) === F.emp); if (!u) throw new Error('اختر الموظف');
    const inV = $('#din', view).value, outV = $('#dout', view).value, date = $('#dd', view).value || inV.slice(0, 10);
    if (!date) throw new Error('حدد التاريخ');
    const lname = (id) => (locs.find((l) => String(l.id) === id) || {}).name;
    const note = [F.day === 'exc' ? 'يوم عمل استثنائي' : '', F.keep === 'extra' ? 'وردية إضافية' : '', F.li && 'موقع الحضور: ' + lname(F.li), F.lo && 'موقع الانصراف: ' + lname(F.lo), noteOf(F, locs)].filter(Boolean).join(' | ');
    if (F.day === 'off') {
      await api('/config/assignment', 'POST', { name: u.name, user_id: u.id, task: 'يوم عطلة', from: date, to: date, status: 'new', notes: 'تعيين يوم عطلة' });
      return done('تم تعيين يوم العطلة');
    }
    if (!inV) throw new Error('حدد وقت الحضور');
    const exists = (await loadList(`/attendance?from=${date}&to=${date}&user_id=${u.id}`)).some((r) => r.check_in);
    if (exists && F.keep === 'extra') { // مفيش مسح لتسجيل اليوم الأصلي: الوردية الإضافية بتتسجل كتكليف
      await api('/config/assignment', 'POST', { name: u.name, user_id: u.id, task: 'وردية إضافية', from: date, to: date, status: 'new', notes: `${inV.slice(11, 16)} - ${outV ? outV.slice(11, 16) : '—'} | ${note}` });
      return done('تمت إضافة الوردية الإضافية');
    }
    await api('/attendance', 'POST', { user_id: u.id, date, check_in: inV.slice(11, 16), check_out: outV ? outV.slice(11, 16) : '', note: (note || 'تسجيل يدوي').slice(0, 200) });
    done('تم حفظ سجل الحضور');
  });
};

/* ======================= تغيير الوردية ======================= */
PAGES.ad_shift = async (view) => {
  view.innerHTML = xSpin;
  const pre = S.adp || {}; S.adp = null;
  const [emps, locs, scheds] = await Promise.all([loadEmps(), loadList('/locations'), loadList('/config/schedule')]);
  const F = { lm: 'office', emp: pre.emp ? String(pre.emp) : '', locs: [] };
  view.innerHTML = `<div class="card xcard acard">${aRad('kind', [['fixed', 'توقيت عمل ثابت']], 'fixed')}</div>
    <div class="card xcard acard">${aLab('الموظف')}${aSel('semp', 'اختر الموظف')}${aLab('التاريخ')}${aDt('dd', 'تحديد التاريخ')}</div>
    <div class="card xcard acard">${aLab('مواعيد العمل العادية')}${scheds.some((x) => x.active) ? aSel('ssch', 'اختر مواعيد العمل') : `<div class="agrid2"><div><input class="ainp" type="time" id="ts" value="09:00"></div><div><input class="ainp" type="time" id="te" value="17:00"></div></div>`}${aChk('half', 'السماح بنصف يوم')}${locBox(F, locs)}${altTimes('alt')}</div>
    <button class="xsubmit" id="save">حفظ</button>`;
  bindForm(view, F, (n) => { if (n === 'lm') $('#aspec', view).hidden = F.lm !== 'spec'; });
  bindAlt(view, F, 'alt');
  if ($('#ssch', view)) pickOne($('#ssch', view), 'مواعيد العمل', () => scheds.filter((x) => x.active).map((x) => [String(x.id), `${x.name} (${x.start} - ${x.end})`]), () => F.sch, (k) => { F.sch = k; });
  pickOne($('#semp', view), 'اختر الموظف', () => emps.map((e) => [String(e.id), e.name]), () => F.emp, (k) => { F.emp = k; });
  if (F.emp) setSel($('#semp', view), (emps.find((e) => String(e.id) === F.emp) || {}).name);
  if (pre.date) { const d = $('#dd', view); d.value = pre.date; d.dispatchEvent(new Event('change', { bubbles: true })); }
  $('#save', view).onclick = (e) => run(e.currentTarget, async () => {
    const u = emps.find((x) => String(x.id) === F.emp); if (!u) throw new Error('اختر الموظف');
    const sc = $('#ts', view) ? { start: $('#ts', view).value, end: $('#te', view).value } : scheds.find((x) => String(x.id) === F.sch); if (!sc || !sc.start) throw new Error('اختر مواعيد العمل');
    const date = $('#dd', view).value || S.me.today_date;
    const body = { shift_start: sc.start, shift_end: sc.end };
    if (F.lm === 'any' || F.lm === 'company') body.location_ids = [];
    if (F.lm === 'spec') body.location_ids = F.locs;
    if (date > S.me.today_date) { // وردية بتاريخ مستقبلي: بتتسجل كتكليف لحد ما يجي اليوم
      await api('/config/assignment', 'POST', { name: u.name, user_id: u.id, task: `تغيير وردية إلى ${sc.start} - ${sc.end}`, from: date, to: date, status: 'new', notes: noteOf(F, locs) });
      return done('تم تسجيل تغيير الوردية كتكليف بتاريخ ' + dMonY(date));
    }
    await api('/employees/' + u.id, 'PUT', body); done('تم تغيير الوردية');
  });
};

/* ======================= تكليف جديد ======================= */
PAGES.ad_assign = async (view) => {
  view.innerHTML = xSpin;
  const [emps, locs] = await Promise.all([loadEmps(), loadList('/locations')]);
  const depts = [...new Set(emps.map((e) => e.department).filter(Boolean))], jobs = [...new Set(emps.map((e) => e.job_title).filter(Boolean))];
  const F = { kind: 'fixed', apply: 'emp', typ: 'normal', keep: 'replace', lm: 'any', locs: [] }, sel = { emp: [], dept: [], off: [], job: [] };
  const draw = () => {
    view.innerHTML = `${aH('تفاصيل')}<div class="card xcard acard">${aRad('kind', [['fixed', 'توقيت عمل ثابت']], 'fixed')}</div>
      <div class="card xcard acard">${aLab('الاسم')}<input class="ainp" id="nm" placeholder="إدخال اسم التكليف" maxlength="80"><div class="agrid2"><div>${aLab('من')}${aDt('d1', 'تحديد التاريخ')}</div><div>${aLab('إلى')}${aDt('d2', 'تحديد التاريخ')}</div></div></div>
      ${aH('تطبيق على')}<div class="card xcard acard">
        ${aRad('apply', [['emp', 'الموظفون']], F.apply)}<div id="w_emp">${aSel('semp', 'اختر موظفين')}</div>
        ${aRad('apply', [['dept', 'الأقسام']], F.apply)}<div id="w_dept" hidden>${aSel('sdept', 'اختر الأقسام')}</div>
        ${aRad('apply', [['office', 'المكاتب']], F.apply)}<div id="w_office" hidden>${aSel('soff', 'اختر المكاتب')}</div>
        ${aRad('apply', [['job', 'المناصب']], F.apply)}<div id="w_job" hidden>${aSel('sjob', 'اختر المناصب')}</div></div>
      ${aH('نوع التكليف')}<div class="card xcard acard">
        ${aRad('typ', [['normal', 'يوم عمل عادي']], F.typ)}<div id="nbox">${locBox(F, locs, 'assign')}${altTimes('alt')}</div>
        ${aRad('typ', [['exc', 'يوم عمل استثنائي'], ['off', 'يوم عطلة'], ['holiday', 'عطلة رسمية']], F.typ)}</div>
      ${aH('نوع الاحتفاظ بالوردية الافتراضية للوردية')}<div class="card xcard acard">${aRad('keep', [['replace', 'استبدل الوردية الافتراضية بالوردية'], ['extra', 'وردية إضافية']], F.keep)}${aChk('half', 'السماح للموظفين بطلب نصف يوم')}</div>
      <div class="abtns"><button class="xsubmit" id="save">حفظ</button><button class="xreset" id="reset">إعادة تعيين</button></div>`;
    bindAlt(view, F, 'alt');
    $('#semp', view).onclick = () => multiDialog('الموظفون', emps.map((e) => [String(e.id), e.name]), sel.emp, (v) => { sel.emp = v; setSel($('#semp', view), v.length ? `${v.length} محدد` : ''); });
    $('#sdept', view).onclick = () => multiDialog('الأقسام', depts.map((d) => [d, d]), sel.dept, (v) => { sel.dept = v; setSel($('#sdept', view), v.join('، ')); });
    $('#soff', view).onclick = () => multiDialog('المكاتب', locs.map((l) => [String(l.id), l.name]), sel.off, (v) => { sel.off = v; setSel($('#soff', view), v.map((id) => (locs.find((l) => String(l.id) === id) || {}).name).join('، ')); });
    $('#sjob', view).onclick = () => multiDialog('المناصب', jobs.map((d) => [d, d]), sel.job, (v) => { sel.job = v; setSel($('#sjob', view), v.join('، ')); });
    $('#reset', view).onclick = () => { Object.assign(F, { apply: 'emp', typ: 'normal', keep: 'replace', lm: 'any', locs: [], half: false }); Object.assign(sel, { emp: [], dept: [], off: [], job: [] }); draw(); };
    $('#save', view).onclick = (e) => run(e.currentTarget, async () => {
      const name = $('#nm', view).value.trim(), from = $('#d1', view).value, to = $('#d2', view).value || from;
      if (!name) throw new Error('اكتب اسم التكليف'); if (!from) throw new Error('حدد تاريخ البداية'); if (to < from) throw new Error('تاريخ النهاية قبل البداية');
      let who = [];
      if (F.apply === 'emp') who = emps.filter((x) => sel.emp.includes(String(x.id)));
      else if (F.apply === 'dept') who = emps.filter((x) => sel.dept.includes(x.department));
      else if (F.apply === 'job') who = emps.filter((x) => sel.job.includes(x.job_title));
      else who = emps.filter((x) => locIds(x).some((id) => sel.off.includes(String(id))));
      if (!who.length) throw new Error('اختر الموظفين المطبّق عليهم التكليف');
      const typTxt = { normal: 'يوم عمل عادي', exc: 'يوم عمل استثنائي', off: 'يوم عطلة', holiday: 'عطلة رسمية' }[F.typ];
      const notes = [typTxt, F.keep === 'extra' ? 'وردية إضافية' : 'استبدال الوردية الافتراضية', F.typ === 'normal' && noteOf(F, locs)].filter(Boolean).join(' | ');
      for (const u of who) await api('/config/assignment', 'POST', { name: u.name, user_id: u.id, task: name, from, to, status: 'new', day_type: F.typ, notes });
      done(`تم حفظ التكليف لـ ${who.length} موظف`);
    });
    bindFormOnce();
  };
  let bound = false;
  const bindFormOnce = () => {
    if (bound) return; bound = true;
    bindForm(view, F, (n) => {
      if (n === 'apply') ['emp', 'dept', 'office', 'job'].forEach((k) => { $('#w_' + k, view).hidden = F.apply !== k; });
      if (n === 'lm') $('#aspec', view).hidden = F.lm !== 'spec';
      if (n === 'typ') $('#nbox', view).hidden = F.typ !== 'normal';
    });
  };
  draw();
};

/* ======================= موظف جديد (3 خطوات) ======================= */
PAGES.ad_emp = async (view) => {
  view.innerHTML = xSpin;
  const [locs, scheds, ppl] = await Promise.all([loadList('/locations'), loadList('/config/schedule'), loadList('/employees')]);
  const canSal = has('payroll.view') || has('payroll.manage'), F = { gender: '', locs: [], sch: '', photo: '' }, V = {};
  let step = 1;
  const steps = canSal ? ['معلومات عامة', 'جدول العمل', 'الدفع'] : ['معلومات عامة', 'جدول العمل'];
  const MAR = [['', 'اختر الحالة الاجتماعية'], ...Object.entries(MARITAL_AR)];
  const inp = (k, ph, type = 'text', extra = '') => `<input class="ainp" data-k="${k}" type="${type}" placeholder="${ph}" value="${esc(V[k] || '')}" ${extra}>`;
  const head = () => `<div class="astep">${steps.map((s, i) => `${i ? `<i class="${i < step ? 'on' : ''}"></i>` : ''}<button type="button" class="${i + 1 === step ? 'on' : ''}" data-s="${i + 1}"><b>${i + 1}</b><span>${s}</span></button>`).join('')}</div>`;
  const body = () => {
    if (step === 1) return `${aH('المعلومات الشخصية')}<div class="card xcard acard">${aLab('صورة التعرف على الوجه')}<label class="adrop" id="drop">${F.photo ? `<img src="${F.photo}" alt="">` : '<span>اسحب الصورة هنا أو <b>تصفح</b></span>'}<input type="file" id="photo" accept="image/*" hidden></label>
        ${aLab('الاسم')}${inp('name', 'أدخل الاسم', 'text', 'maxlength="80"')}
        <button type="button" class="aaltname" id="altn"><span class="aplus">${fiA('a_plus_c')}</span><b>إضافة اسم بديل بلغات متعددة</b></button><div id="altnl"></div>
        ${aLab('تاريخ الميلاد')}${aDt('birth', 'تحديد التاريخ')}
        <div class="aseg">${aRad('gender', [['male', 'ذكر'], ['female', 'أنثى']], F.gender)}</div>
        ${aLab('الحالة الاجتماعية')}${aSel('smar', 'اختر الحالة الاجتماعية')}
        ${aLab('رقم الهاتف')}${inp('phone', 'أدخل رقم الهاتف', 'tel')}${aLab('البريد الإلكتروني')}${inp('email', 'أدخل البريد الإلكتروني', 'email')}
        ${aLab('الجنسية')}${inp('nationality', 'أدخل الجنسية')}${aLab('الرقم القومي')}${inp('national_id', 'أدخل الرقم القومي', 'text', 'inputmode="numeric"')}
        ${aLab('اسم المستخدم (للدخول)')}${inp('username', 'أدخل اسم المستخدم', 'text', 'autocapitalize="none"')}${aLab('كلمة المرور المؤقتة')}${inp('password', '6 أحرف على الأقل', 'text', 'autocomplete="new-password"')}</div>`;
    if (step === 2) return `${aH('جدول العمل')}<div class="card xcard acard">${aLab('مواعيد العمل العادية')}${aSel('ssch', 'اختر مواعيد العمل')}
        <div class="agrid2"><div>${aLab('بداية الوردية')}<input class="ainp" type="time" data-k="shift_start" value="${V.shift_start || '09:00'}"></div><div>${aLab('نهاية الوردية')}<input class="ainp" type="time" data-k="shift_end" value="${V.shift_end || '17:00'}"></div></div>
        ${aLab('القسم')}${inp('department', 'أدخل القسم')}${aLab('المنصب')}${inp('job_title', 'أدخل المنصب')}${aLab('كود الموظف')}${inp('employee_code', 'أدخل الكود')}
        ${aLab('تاريخ التعيين')}<input class="ainp" type="date" data-k="hire_date" value="${V.hire_date || todayStr()}">${aLab('المدير المباشر')}${aSel('smgr', 'اختر المدير')}
        <h4 class="ah mt">مواقع الحضور المسموحة</h4>${locs.map((l) => `<button type="button" class="achk ${F.locs.includes(l.id) ? 'on' : ''}" data-loc="${l.id}"><i>${fiA('a_check')}</i><span>${esc(l.name)}</span></button>`).join('') || '<div class="muted small">لا توجد مواقع (يسجّل من أي مكان)</div>'}</div>`;
    return `${aH('الدفع')}<div class="card xcard acard">${aLab('المرتب الأساسي')}${inp('base_salary', '0', 'number', 'min="0" step="0.01" inputmode="decimal"')}${aLab('البدلات')}${inp('allowances', '0', 'number', 'min="0" step="0.01" inputmode="decimal"')}</div>`;
  };
  const keep = () => view.querySelectorAll('[data-k]').forEach((i) => { V[i.dataset.k] = i.value; });
  const draw = () => {
    view.innerHTML = `${head()}${body()}<div class="abtns">${step > 1 ? '<button class="xreset" id="prev">السابق</button>' : ''}<button class="xsubmit" id="next">${step === steps.length ? 'حفظ' : 'التالي'}</button></div>`;
    $('#photo', view) && ($('#photo', view).onchange = (e) => { const f = e.target.files[0]; if (f) shrink(f).then((d) => { F.photo = d; keep(); draw(); }); });
    $('#drop', view) && ($('#drop', view).onclick = (e) => { e.preventDefault(); $('#photo', view).click(); });
    $('#altn', view) && ($('#altn', view).onclick = () => { $('#altnl', view).insertAdjacentHTML('beforeend', '<input class="ainp" placeholder="الاسم بلغة أخرى" maxlength="80">'); });
    if ($('#birth', view) && V.birth) { $('#birth', view).value = V.birth; $('#birth', view).dispatchEvent(new Event('change', { bubbles: true })); }
    if ($('#smar', view)) { pickOne($('#smar', view), 'الحالة الاجتماعية', () => MAR.slice(1), () => F.marital, (k) => { F.marital = k; }); if (F.marital) setSel($('#smar', view), MARITAL_AR[F.marital]); }
    if ($('#ssch', view)) {
      pickOne($('#ssch', view), 'مواعيد العمل', () => scheds.filter((x) => x.active).map((x) => [String(x.id), `${x.name} (${x.start} - ${x.end})`]), () => F.sch, (k) => { F.sch = k; const s = scheds.find((x) => String(x.id) === k); $('[data-k=shift_start]', view).value = s.start; $('[data-k=shift_end]', view).value = s.end; });
      if (F.sch) setSel($('#ssch', view), (scheds.find((x) => String(x.id) === F.sch) || {}).name);
      pickOne($('#smgr', view), 'المدير المباشر', () => ppl.filter((x) => !x.pending).map((x) => [String(x.id), x.name]), () => F.mgr, (k) => { F.mgr = k; });
      if (F.mgr) setSel($('#smgr', view), (ppl.find((x) => String(x.id) === F.mgr) || {}).name);
    }
  };
  const submit = (btn) => run(btn, async () => {
    keep();
    const need = (k, m) => { if (!String(V[k] || '').trim()) throw new Error(m); };
    need('name', 'اكتب اسم الموظف'); need('username', 'اكتب اسم المستخدم'); if (String(V.password || '').length < 6) throw new Error('كلمة المرور 6 أحرف على الأقل');
    const bd = $('#birth', view); const body = { ...V, birth_date: bd ? bd.value : V.birth || '', gender: F.gender, marital_status: F.marital || '', location_ids: F.locs, manager_id: F.mgr || null, role: 'employee' };
    delete body.birth;
    const r = await api('/employees', 'POST', body);
    if (F.photo && r.id) { try { await api(`/users/${r.id}/avatar`, 'POST', { photo: F.photo }); } catch { /* الصورة اختيارية */ } }
    done('تمت إضافة الموظف');
  });
  async function shrink(file) {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(file); });
    const k = Math.min(1, 480 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  }
  view.addEventListener('click', (e) => {
    const g = e.target.closest('.arad'); if (g) { F[g.dataset.n] = g.dataset.k; view.querySelectorAll('.arad[data-n=gender]').forEach((x) => x.classList.toggle('on', x === g)); return; }
    const c = e.target.closest('.achk'); if (c && c.dataset.loc) { c.classList.toggle('on'); const id = Number(c.dataset.loc); F.locs = c.classList.contains('on') ? [...new Set([...F.locs, id])] : F.locs.filter((x) => x !== id); return; }
    const s = e.target.closest('.astep [data-s]'); if (s) { keep(); step = Number(s.dataset.s); draw(); return; }
    if (e.target.closest('#prev')) { keep(); step--; draw(); return; }
    const n = e.target.closest('#next');
    if (n) { if (step < steps.length) { keep(); step++; draw(); window.scrollTo(0, 0); } else submit(n); }
  });
  view.addEventListener('change', (e) => {
    const i = e.target.closest('.adt input'); if (!i) return;
    const tx = $('.atx', i.parentElement); tx.textContent = i.value ? dMonY(i.value) : tx.dataset.ph; tx.classList.toggle('ph', !i.value); if (i.id === 'birth') V.birth = i.value;
  });
  draw();
};

/* ======================= قائمة زرار + (للمدير) ======================= */
const prevQuick = quickSheet;
quickSheet = function () {
  const mgr = has('attendance.edit') || has('payroll.manage') || has('employees.manage') || has('requests.approve');
  if (!mgr) return prevQuick();
  const P = (page, preset) => () => { S.adp = preset || null; go(page); };
  const items = [
    has('attendance.edit') && ['q_task', 'تكليف جديد', P('ad_assign')],
    has('employees.manage') && ['q_swap', 'تغيير الوردية', P('ad_shift')],
    has('attendance.edit') && ['q_in', 'سجل حضور جديد', P('ad_record')],
    has('requests.approve') && ['q_file', 'تقديم طلب نيابة عن', P('ad_request', { behalf: true })],
    ['q_file', 'طلب جديد', P('ad_request', { behalf: false })],
    has('payroll.manage') && ['q_dollar', 'خصم جديد', P('ad_deduct')],
    has('payroll.manage') && ['q_dollar', 'إضافة مكافأة', P('ad_bonus')],
    has('employees.manage') && ['q_userplus', 'إضافة موظف جديد', P('ad_emp')],
  ].filter(Boolean);
  const o = document.createElement('div');
  o.className = 'qov';
  o.innerHTML = `<div class="qmenu">${items.map((it, i) => `<button class="qitem" data-i="${i}"><span class="qic">${fi(it[0])}</span><span>${it[1]}</span></button>`).join('')}</div><button class="fab qfab" aria-label="x">${fi('plus')}</button>`;
  document.body.appendChild(o);
  const close = () => o.remove();
  o.onclick = (e) => { if (e.target === o || e.target.closest('.qfab')) close(); };
  o.querySelectorAll('.qitem').forEach((b) => (b.onclick = () => { close(); items[Number(b.dataset.i)][2](); }));
};

/* المدير لغته الافتراضية عربي (لو ما اختارش لغة قبل كده) */
const rPrev = renderShell;
renderShell = function () {
  try { if (S.me && !localStorage.getItem('app_lang') && has('employees.view') && APP_LANG !== 'ar') APP_LANG = 'ar'; } catch { /* تجاهل */ }
  rPrev();
};
}
