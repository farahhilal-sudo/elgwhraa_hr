'use strict';
/* pages/requests-tabs.js — الطلبات: وارد (كروت مراجعة) وصادر والإعدادات، وأنواع الطلبات الجديدة (لازم يتحمّل بعد requests.js) */
Object.assign(ICONS, {
  rq_in: '<path d="M4 5h16v11H9l-5 4z"/><path d="M10 9.5a2 2 0 1 1 2.5 1.9c-.4.2-.5.5-.5.9M12 14h.01"/>',
  rq_out: '<path d="M21 3L3 11l7 3 3 7z"/><path d="M10 14L21 3"/>',
  rq_gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  rq_bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', rq_eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  rq_x: '<path d="M6 6l12 12M18 6L6 18"/>', rq_chat: '<path d="M4 5h16v11H9l-5 4z"/>', rq_clip: '<path d="M21 11l-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/>',
});
const RQ_IN = [
  ['attendance_edit', 'طلبات الحضور', ['attendance_edit']], ['overtime', 'الوقت الإضافي', ['overtime']], ['leaves', 'الإجازات والأذونات', ['annual_leave', 'sick_leave', 'emergency_leave', 'work_mission', 'permission']],
  ['shift_change', 'ورديات', ['shift_change']], ['expense', 'مطالبات النفقات', ['expense']], ['loan', 'قرض', ['loan']], ['bonus', 'المكافآت', ['bonus_req']], ['deduction', 'الخصم', ['deduction_req']],
  ['join', 'الانضمام', ['join_req']], ['suspend', 'إيقاف', ['suspend_req']], ['bulk', 'إجراءات بالجملة', ['bulk_req']], ['transfer', 'تحويل', ['transfer_req']], ['schedule', 'الجدول', ['schedule_req']],
  ['allowance', 'صرف بدل', ['allowance_req']], ['shift_swap', 'تبادل الورديات', ['shift_swap']], ['leave_swap', 'تبادل الإجازات', ['leave_swap']],
  ['penalty', 'الجزاءات', ['penalty_req']],
];
const RQ_OUT_MGR = [['bonus', 'المكافآت', ['bonus_req']], ['deduction', 'الخصم', ['deduction_req']], ['join', 'الانضمام', ['join_req']], ['suspend', 'إيقاف', ['suspend_req']], ['bulk', 'طلبات جماعية', ['bulk_req']],
  ['schedule', 'الجدول', ['schedule_req']], ['transfer', 'تحويل', ['transfer_req']], ['shift_swap', 'تبادل الورديات', ['shift_swap']], ['leave_swap', 'تبادل الإجازات', ['leave_swap']], ['allowance', 'صرف بدل', ['allowance_req']]];
const RQ_OUT_OWN = [['leaves', 'الإجازات والأذونات', ['annual_leave', 'sick_leave', 'emergency_leave', 'work_mission', 'permission']], ['overtime', 'الوقت الإضافي', ['overtime']], ['attendance_edit', 'طلبات الحضور', ['attendance_edit']],
  ['shift_change', 'ورديات', ['shift_change']], ['expense', 'مطالبات النفقات', ['expense']], ['loan', 'قرض', ['loan']]];
const RQ_NEW_LABEL = { bonus_req: 'طلب مكافأة جديد', deduction_req: 'طلب خصم جديد', join_req: 'طلب انضمام جديد', suspend_req: 'طلب إيقاف جديد', bulk_req: 'طلب جماعي جديد', schedule_req: 'طلب جدول جديد', transfer_req: 'طلب تحويل جديد', allowance_req: 'طلب صرف بدل جديد', shift_swap: 'طلب تبادل ورديات', leave_swap: 'طلب تبادل إجازات' };
const RQ_AMT = ['expense', 'loan', 'bonus_req', 'deduction_req', 'allowance_req', 'penalty_req'];
const RQ_TOP = () => [['requests', 'وارد', 'rq_in', has('requests.view_all')], ['req_out', 'صادر', 'rq_out', true], ['req_settings', 'الإعدادات', 'rq_gear', has('settings.manage')]].filter((x) => x[3]);
const rqHHMM = (h) => { const m = Math.round((Number(h) || 0) * 60); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const rqDay = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const rqDays = (r) => Math.round((new Date(r.to_date) - new Date(r.from_date)) / 864e5) + 1;
const rqMeta = (r) => { try { return JSON.parse(r.meta || '{}'); } catch { return {}; } };
const rqDur = (r) => (['overtime', 'permission'].includes(r.type) ? rqHHMM(r.hours) : RQ_AMT.includes(r.type) ? `${r.amount} ج` : ['annual_leave', 'sick_leave', 'emergency_leave', 'work_mission', 'leave_swap'].includes(r.type) ? `${rqDays(r)} يوم` : '—');
const rqTone = (t) => (['overtime', 'permission'].includes(t) ? 'b-warn' : ['annual_leave', 'sick_leave', 'emergency_leave', 'work_mission', 'leave_swap'].includes(t) ? 'b-info' : RQ_AMT.includes(t) ? 'b-ok' : 'b-info');
const rqDecide = (r, decision, note) => api(`/requests/${r.id}/decide`, 'POST', { decision, note });

async function rqPage(view, mode) {
  const manage = has('requests.view_all');
  if (mode === 'in' && !manage) mode = 'out';
  const subs = mode === 'in' ? RQ_IN : [...(has('requests.approve') ? RQ_OUT_MGR : []), ...RQ_OUT_OWN];
  S.rsub = S.rsub || {};
  const cur = mode === 'set' ? '' : (subs.find((x) => x[0] === S.rsub[mode]) || subs[0])[0];
  const top = RQ_TOP(), curTop = mode === 'in' ? 'requests' : mode === 'out' ? 'req_out' : 'req_settings';
  view.innerHTML = `<div class="card setnav"><div class="stabs">${top.map(([k, l, ic]) => `<button data-rt="${k}" class="${k === curTop ? 'on' : ''}">${ico(ic)}<span>${l}</span></button>`).join('')}</div>
    ${mode === 'set' ? '' : `<div class="subrow"><div class="ssubs" id="rqsubs">${subs.map(([k, l]) => `<button data-rs="${k}" class="${k === cur ? 'on' : ''}">${l}</button>`).join('')}</div><button class="tarrow" id="rqarr" title="المزيد">${ico('chev', 'rotm90')}</button></div>`}</div>
    <div id="rqbody"><div class="empty"><span class="spin"></span></div></div>`;
  view.querySelectorAll('[data-rt]').forEach((b) => (b.onclick = () => go(b.dataset.rt)));
  view.querySelectorAll('[data-rs]').forEach((b) => (b.onclick = () => { S.rsub[mode] = b.dataset.rs; rqPage(view, mode); }));
  if ($('#rqarr', view)) { $('#rqarr', view).onclick = () => $('#rqsubs', view).scrollBy({ left: -260, behavior: 'smooth' }); const on = view.querySelector('#rqsubs .on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' }); }
  const body = $('#rqbody', view);
  try {
    if (mode === 'in') await rqInbox(body, subs.find((x) => x[0] === cur), view);
    else if (mode === 'out') await rqOutbox(body, subs.find((x) => x[0] === cur));
    else await rqSettings(body);
  } catch (e) { body.innerHTML = `<div class="card empty neg">${esc(e.message)}</div>`; }
}

/* وارد: طلبات الموظفين اللي محتاجة مراجعة (كروت) */
async function rqInbox(body, sub, view) {
  const [, label, keys] = sub;
  const [locs, tpls] = await Promise.all([api('/locations').catch(() => []), api('/config/req_template').catch(() => [])]);
  const D = () => ({ tpl: '', q: '', from: monthStart(), to: monthEnd(), office: '', dept: '', emp: '', st: ['pending'], types: [...keys], extra: [] });
  S.rqf = S.rqf || {};
  const f = S.rqf['in:' + sub[0]] = { ...D(), ...(S.rqf['in:' + sub[0]] || {}) };
  const EXT = { mine: ['طلبات تلقائية فقط', (r) => r.auto], manual: ['طلبات يدوية فقط', (r) => !r.auto], noted: ['فيها ملاحظة', (r) => r.reason] };
  let rows = [], sel = new Set(), byId = {};
  const load = async () => { rows = (await api(`/requests?from=${f.from}&to=${f.to}`)).filter((r) => keys.includes(r.type)); sel.clear(); paint(); };
  const ids = (r) => { try { return JSON.parse(r.location_ids || '[]'); } catch { return []; } };
  const filtered = () => {
    const q = f.q.trim().toLowerCase();
    return rows.filter((r) => f.st.includes(r.status) && f.types.includes(r.type) && (!f.office || !ids(r).length || ids(r).includes(Number(f.office))) && (!f.dept || r.department === f.dept) && (!f.emp || String(r.user_id) === f.emp)
      && f.extra.every((k) => EXT[k][1](r)) && (!q || [r.user_name, r.username, r.phone].some((x) => String(x || '').toLowerCase().includes(q))));
  };
  const card = (r) => {
    const st = STATUS_AR[r.status], pay = r.type === 'overtime' ? `يُدفع للموظف في ${monthEnd(r.from_date).split('-').reverse().join('-')} · ` : '';
    return `<div class="card rqc ${sel.has(r.id) ? 'sel' : ''}" data-c="${r.id}"><div class="rqh"><div class="avatar md">${esc(initials(r.user_name))}</div><div class="rqi"><b>${esc(r.user_name)}</b><span>${esc(r.job_title || '')}</span></div>
      <span class="rqico"><button data-cm="${r.id}" title="الملاحظات">${ico('rq_chat')}</button><button data-cl="${r.id}" title="المرفقات">${ico('rq_clip')}</button></span></div>
      <div class="rqm"><span class="rqd" dir="ltr">${esc(rqDur(r))} · ${rqDay(r.from_date)}</span><button class="rqinfo" data-ci="${r.id}" title="تفاصيل">${ico('info')}</button><span class="badge">${r.from_date === r.to_date ? 'يومي' : 'عدة أيام'}</span>
        <span class="badge ${rqTone(r.type)}">${r.type === 'overtime' ? ico('rq_bolt') : ''} ${esc(TYPES()[r.type] || r.type)}${r.auto ? ' (تلقائي)' : ''}</span></div>
      <div class="rqn muted small">${pay}تم الإرسال ${rqDay(String(r.created_at).slice(0, 10))}${r.created_by_name && r.created_by !== r.user_id ? ' · بواسطة ' + esc(r.created_by_name) : ''}</div>
      ${r.status === 'pending' ? `<div class="rqb"><button class="rqbtn rev" data-rv="${r.id}">${ico('rq_eye')} مراجعة</button><button class="rqbtn rej" data-rj="${r.id}">${ico('rq_x')} رفض</button></div>`
        : `<div class="rqb"><span class="badge ${st[1]}">${st[0]}</span>${r.decision_note ? `<span class="muted small">${esc(r.decision_note)}</span>` : ''}</div>`}</div>`;
  };
  const review = (r) => {
    const m = rqMeta(r), extra = Object.entries(m).filter(([, v]) => v).map(([k, v]) => `<div><span class="muted">${esc({ department: 'القسم الجديد', job_title: 'المسمى الجديد', start: 'بداية الدوام', end: 'نهاية الدوام', partner_name: 'الزميل', person: 'الاسم', position: 'الوظيفة' }[k] || k)}</span><b>${esc(v)}</b></div>`).join('');
    const o = modal(`<h3>مراجعة الطلب</h3><div class="kv"><div><span class="muted">الموظف</span><b>${esc(r.user_name)}</b></div><div><span class="muted">النوع</span><b>${esc(TYPES()[r.type] || r.type)}</b></div>
      <div><span class="muted">التاريخ</span><b>${r.from_date === r.to_date ? r.from_date : r.from_date + ' ← ' + r.to_date}</b></div><div><span class="muted">القيمة</span><b>${esc(rqDur(r))}</b></div>${extra}
      <div><span class="muted">السبب</span><b>${esc(r.reason || '—')}</b></div></div>
      <label class="f full" style="margin-top:12px">ملاحظة القرار (اختياري)<input id="rqnote" maxlength="200"></label>
      <div class="actions"><button class="btn alt" data-close>إغلاق</button><button class="btn rejb" id="rqno">رفض</button><button class="btn" id="rqyes">قبول</button></div>`);
    [['rqyes', 'approved'], ['rqno', 'rejected']].forEach(([id, d]) => ($('#' + id, o).onclick = (e) => run(e.currentTarget, async () => { await rqDecide(r, d, $('#rqnote', o).value); o.close(); toast(d === 'approved' ? 'تم قبول الطلب' : 'تم رفض الطلب'); load(); })));
  };
  const bulk = (d) => { const list = rows.filter((r) => sel.has(r.id) && r.status === 'pending'); if (!list.length) return; const note = prompt(d === 'approved' ? 'ملاحظة (اختياري)' : 'سبب الرفض (اختياري)'); if (note === null) return;
    run(null, async () => { for (const r of list) await rqDecide(r, d, note); toast(`تم ${d === 'approved' ? 'قبول' : 'رفض'} ${list.length} طلب`); load(); }); };
  const paintList = () => {
    const list = filtered(); byId = Object.fromEntries(list.map((r) => [r.id, r]));
    $('#rqlist', body).innerHTML = list.length ? `<div class="rqgrid">${list.map(card).join('')}</div>` : `<div class="card empty">لا توجد طلبات بالمرشحات دي</div>`;
    const pend = list.filter((r) => r.status === 'pending'), allSel = pend.length && pend.every((r) => sel.has(r.id));
    $('#bsel', body).textContent = allSel ? 'إلغاء اختيار الكل' : 'اختيار الكل';
    $('#bacc', body).disabled = !sel.size; $('#brej', body).disabled = !sel.size;
    body.querySelectorAll('[data-c]').forEach((c) => (c.onclick = (e) => { if (e.target.closest('button')) return; const r = byId[c.dataset.c]; if (r.status !== 'pending') return; sel.has(r.id) ? sel.delete(r.id) : sel.add(r.id); paintList(); }));
    body.querySelectorAll('[data-rv]').forEach((b) => (b.onclick = () => review(byId[b.dataset.rv])));
    body.querySelectorAll('[data-rj]').forEach((b) => (b.onclick = () => { const r = byId[b.dataset.rj], note = prompt('سبب الرفض (اختياري)'); if (note === null) return; run(b, async () => { await rqDecide(r, 'rejected', note); toast('تم رفض الطلب'); load(); }); }));
    body.querySelectorAll('[data-ci]').forEach((b) => (b.onclick = () => review(byId[b.dataset.ci])));
    body.querySelectorAll('[data-cm]').forEach((b) => (b.onclick = () => { const r = byId[b.dataset.cm]; modal(`<h3>الملاحظات</h3><div class="kv"><div><span class="muted">سبب الطلب</span><b>${esc(r.reason || '—')}</b></div><div><span class="muted">ملاحظة القرار</span><b>${esc(r.decision_note || '—')}</b></div></div><div class="actions"><button class="btn" data-close>إغلاق</button></div>`); }));
    body.querySelectorAll('[data-cl]').forEach((b) => (b.onclick = () => toast('لا توجد مرفقات على الطلب ده')));
  };
  const paint = () => {
    const depts = [...new Set(rows.map((r) => r.department).filter(Boolean))].sort(), emps = [...new Map(rows.map((r) => [r.user_id, r.user_name])).entries()];
    const SL = [['pending', 'قيد الانتظار'], ['approved', 'مقبول'], ['rejected', 'مرفوض']];
    $('#rqfil', body).innerHTML = `<div class="frow2">${selBox('tpl', 'filter', 'حدد القالب', tpls.map((t) => [t.id, t.name]), f.tpl)}<button class="btn alt sm hk" id="tsv">حفظ كنموذج</button>
        <label class="fs wide">${ico('search')}<input data-f="q" placeholder="كود الموظف / هاتفه" value="${esc(f.q)}" autocomplete="off"></label>${dtBox('from', f.from)}${dtBox('to', f.to)}${locs.length ? selBox('office', 'building', 'حدد المكتب', locs.map((l) => [l.id, l.name]), f.office) : ''}</div>
      <div class="frow2">${selBox('dept', 'building', 'تحديد القسم', depts, f.dept)}${selBox('emp', 'user', 'اختر موظفين', emps, f.emp)}
        <div class="sel2 stbox" id="tbox"><span>نوع الطلب</span><i class="n">${f.types.length}</i><button id="tall" title="تحديد الكل">×</button></div>
        <div class="sel2 stbox" id="sbox"><span>الحالة</span><i class="n">${f.st.length}</i><button id="sall" title="تحديد الكل">×</button></div>
        <button class="addf" id="addf">${ico('filter')} اضف تصفيه ${ico('chev')}</button></div>
      <div class="frow2"><button class="btn" id="bsel">اختيار الكل</button><button class="btn alt sm" id="bacc" disabled>قبول الطلبات</button><button class="btn alt sm" id="brej" disabled>رفض الطلبات</button>${exportCsvBtn('rexp')}
        <button class="btn" id="rnew">${ico('plus')} طلب جديد</button><button class="link rs" id="reset">${ico('filter')} إعادة تعيين المرشحات</button><span class="grow"></span><button class="link rs" id="classic">العرض القديم</button></div>
      <div class="frow2 chiprow"><div class="chips2">${ico('filter')}<b>حالة</b>${SL.map(([k, l]) => `<button class="fchip2 ${f.st.includes(k) ? 'on' : 'off'}" data-st="${k}">${l} <i>${f.st.includes(k) ? '×' : '+'}</i></button>`).join('')}
        ${keys.length > 1 ? `<b class="xl">النوع</b>${keys.map((k) => `<button class="fchip2 ${f.types.includes(k) ? 'on' : 'off'}" data-ty="${k}">${esc(TYPES()[k] || k)} <i>${f.types.includes(k) ? '×' : '+'}</i></button>`).join('')}` : ''}
        ${f.extra.map((k) => `<button class="fchip2 on" data-x="${k}">${EXT[k][0]} <i>×</i></button>`).join('')}</div></div>`;
    paintList(); bindFilters();
  };
  const applyTpl = (id) => { const t = tpls.find((x) => String(x.id) === String(id)); let s = {}; try { s = JSON.parse((t || {}).filters || '{}'); } catch { /* تجاهل */ } Object.assign(f, D(), s, { tpl: t ? String(t.id) : '' }); };
  const bindFilters = () => {
    body.querySelectorAll('#rqfil [data-f]').forEach((el) => (el[el.tagName === 'INPUT' && el.type !== 'date' ? 'oninput' : 'onchange'] = () => {
      const k = el.dataset.f; if (k === 'tpl') { applyTpl(el.value); load().catch((e) => toast(e.message, true)); return; }
      f[k] = el.value; const w = el.closest('.sel2'); if (w) w.classList.toggle('ph', !el.value);
      if (['from', 'to'].includes(k)) load().catch((e) => toast(e.message, true)); else paintList();
    }));
    body.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => { const k = b.dataset.st; f.st = f.st.includes(k) ? f.st.filter((x) => x !== k) : [...f.st, k]; paint(); }));
    body.querySelectorAll('[data-ty]').forEach((b) => (b.onclick = () => { const k = b.dataset.ty; f.types = f.types.includes(k) ? f.types.filter((x) => x !== k) : [...f.types, k]; paint(); }));
    body.querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => { f.extra = f.extra.filter((x) => x !== b.dataset.x); paint(); }));
    $('#tall', body).onclick = () => { f.types = [...keys]; paint(); }; $('#sall', body).onclick = () => { f.st = ['pending', 'approved', 'rejected']; paint(); };
    $('#addf', body).onclick = (e) => popMenu(e.currentTarget, Object.entries(EXT).filter(([k]) => !f.extra.includes(k)).map(([k, v]) => ({ ic: 'filter', t: v[0], fn: () => { f.extra.push(k); paint(); } })));
    $('#bsel', body).onclick = () => { const pend = filtered().filter((r) => r.status === 'pending'); const all = pend.length && pend.every((r) => sel.has(r.id)); pend.forEach((r) => (all ? sel.delete(r.id) : sel.add(r.id))); paintList(); };
    $('#bacc', body).onclick = () => bulk('approved'); $('#brej', body).onclick = () => bulk('rejected');
    $('#reset', body).onclick = () => { S.rqf['in:' + sub[0]] = null; rqPage(view, 'in'); };
    $('#classic', body).onclick = () => go('requests_classic');
    $('#rexp', body).onclick = () => csv('requests.csv', [['الموظف', 'النوع', 'من', 'إلى', 'القيمة', 'السبب', 'الحالة'], ...filtered().map((r) => [r.user_name, TYPES()[r.type] || r.type, r.from_date, r.to_date, rqDur(r), r.reason, STATUS_AR[r.status][0]])]);
    $('#rnew', body).onclick = () => rqCreate(keys[0], load);
    $('#tsv', body).onclick = () => { const n = prompt('اسم القالب'); if (!n) return; const { tpl, ...rest } = f; run(null, async () => { const r = await api('/config/req_template', 'POST', { name: n, filters: JSON.stringify(rest) }); tpls.push({ id: r.id, name: n, filters: JSON.stringify(rest) }); f.tpl = String(r.id); toast('تم حفظ القالب'); paint(); }); };
  };
  body.innerHTML = '<div class="efil" id="rqfil"></div><div id="rqlist"></div>';
  await load();
}

/* صادر: الطلبات اللي أنا قدمتها */
async function rqOutbox(body, sub) {
  const [, label, keys] = sub, manage = has('requests.view_all'), mgr = !!MGR_LABEL(keys[0]);
  const tpls = manage ? await api('/config/req_template').catch(() => []) : [];
  const COLS = [['emp', 'الموظف', (r) => `<b>${esc(r.user_name)}</b>`], ['type', 'النوع', (r) => `<span class="badge ${rqTone(r.type)}">${esc(TYPES()[r.type] || r.type)}${r.auto ? ' (تلقائي)' : ''}</span>`],
    ['date', 'التاريخ', (r) => (r.from_date === r.to_date ? rqDay(r.from_date) : `${rqDay(r.from_date)} ← ${rqDay(r.to_date)}`)], ['val', 'القيمة', (r) => esc(rqDur(r))], ['reason', 'السبب', (r) => esc(r.reason || '—')],
    ['status', 'الحالة', (r) => `<span class="badge ${STATUS_AR[r.status][1]}">${STATUS_AR[r.status][0]}</span>`], ['by', 'تم البت بواسطة', (r) => esc(r.decision_note || '—')]];
  const D = () => ({ tpl: '', from: monthStart(), to: monthEnd(), emp: '', st: '' });
  S.rqf = S.rqf || {};
  const f = S.rqf['out:' + sub[0]] = { ...D(), ...(S.rqf['out:' + sub[0]] || {}) };
  S.rqcols = S.rqcols || COLS.map((c) => c[0]);
  let rows = [];
  const load = async () => { rows = (await api(`/requests/outgoing?from=${f.from}&to=${f.to}`)).filter((r) => keys.includes(r.type)); paint(); };
  const tbl = () => {
    const list = rows.filter((r) => (!f.emp || r.user_name === f.emp) && (!f.st || r.status === f.st)), cols = COLS.filter((c) => S.rqcols.includes(c[0]));
    return list.length ? `<div class="tablewrap st"><table><thead><tr>${cols.map((c) => `<th>${c[1]}</th>`).join('')}<th class="actcol"></th></tr></thead><tbody>${list.map((r) => `<tr>${cols.map((c) => `<td>${c[2](r)}</td>`).join('')}<td class="actcol">${r.status === 'pending' ? `<button class="btn alt sm" data-cx="${r.id}">إلغاء الطلب</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="card empty">لا توجد سجلات لعرضها</div>';
  };
  const paint = () => {
    const emps = [...new Set(rows.map((r) => r.user_name))];
    body.innerHTML = `<div class="efil"><div class="frow2">${manage ? selBox('tpl', 'filter', 'حدد القالب', tpls.map((t) => [t.id, t.name]), f.tpl) + '<button class="btn alt sm hk" id="tsv">حفظ كنموذج</button>' : ''}${dtBox('from', f.from)}${dtBox('to', f.to)}
        ${selBox('emp', 'user', 'الموظف', emps, f.emp)}${selBox('st', 'menu', 'الحالة', [['pending', 'قيد الانتظار'], ['approved', 'مقبول'], ['rejected', 'مرفوض']], f.st)}</div>
      <div class="frow2"><button class="btn" id="rnew">${ico('plus')} ${RQ_NEW_LABEL[keys[0]] || 'طلب جديد'}</button><button class="addf" id="cfld">${ico('filter')} حقول مخصصة ${ico('chev')}</button><button class="link rs" id="reset">${ico('filter')} إعادة تعيين المرشحات</button></div></div>${tbl()}`;
    body.querySelectorAll('[data-f]').forEach((el) => (el.onchange = () => { const k = el.dataset.f; if (k === 'tpl') { const t = tpls.find((x) => String(x.id) === el.value); let s = {}; try { s = JSON.parse((t || {}).filters || '{}'); } catch { /* تجاهل */ } Object.assign(f, D(), s, { tpl: el.value }); load(); return; } f[k] = el.value; if (['from', 'to'].includes(k)) load(); else paint(); }));
    $('#rnew', body).onclick = () => rqCreate(keys[0], load);
    $('#reset', body).onclick = () => { S.rqf['out:' + sub[0]] = null; Object.assign(f, D()); load(); };
    $('#cfld', body).onclick = (e) => popMenu(e.currentTarget, COLS.map((c) => ({ ic: S.rqcols.includes(c[0]) ? 'check' : 'plus', t: c[1], fn: () => { S.rqcols = S.rqcols.includes(c[0]) ? S.rqcols.filter((x) => x !== c[0]) : [...S.rqcols, c[0]]; paint(); } })));
    if ($('#tsv', body)) $('#tsv', body).onclick = () => { const n = prompt('اسم القالب'); if (!n) return; const { tpl, ...rest } = f; run(null, async () => { const r = await api('/config/req_template', 'POST', { name: n, filters: JSON.stringify(rest) }); tpls.push({ id: r.id, name: n, filters: JSON.stringify(rest) }); f.tpl = String(r.id); toast('تم حفظ القالب'); paint(); }); };
    body.querySelectorAll('[data-cx]').forEach((b) => (b.onclick = () => { if (confirm('إلغاء الطلب ده؟')) run(b, async () => { await api('/requests/' + b.dataset.cx, 'DELETE'); toast('تم إلغاء الطلب'); load(); }); }));
  };
  await load();
}
const MGR_LABEL = (k) => (S.meta && S.meta.mgr_types ? S.meta.mgr_types[k] : '');

/* إنشاء طلب جديد (حسب النوع) */
async function rqCreate(type, done) {
  if (!MGR_LABEL(type)) return requestForm(done, { type });
  const people = await api('/colleagues').catch(() => []);
  const emp = `<label class="f full">الموظف<select name="user_id" required><option value="">— اختاري —</option>${people.map((u) => `<option value="${u.id}">${esc(u.name)}${u.job_title ? ' — ' + esc(u.job_title) : ''}</option>`).join('')}</select></label>`;
  const dates = [...new Set(people.map((u) => u.department).filter(Boolean))], jobs = [...new Set(people.map((u) => u.job_title).filter(Boolean))];
  const F = {
    bonus_req: `${emp}<label class="f">المبلغ<input type="number" name="amount" min="1" step="0.01" required></label>`, deduction_req: `${emp}<label class="f">المبلغ<input type="number" name="amount" min="1" step="0.01" required></label>`,
    allowance_req: `${emp}<label class="f">المبلغ<input type="number" name="amount" min="1" step="0.01" required></label>`, suspend_req: emp,
    transfer_req: `${emp}<label class="f">القسم الجديد<input name="department" list="dl-d"></label><label class="f">المسمى الجديد<input name="job_title" list="dl-j"></label><datalist id="dl-d">${dates.map((x) => `<option value="${esc(x)}">`).join('')}</datalist><datalist id="dl-j">${jobs.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`,
    schedule_req: `${emp}<label class="f">بداية الدوام<input type="time" name="start" value="09:00" required></label><label class="f">نهاية الدوام<input type="time" name="end" value="17:00" required></label>`,
    join_req: '<label class="f">اسم المرشح<input name="person" required></label><label class="f">الوظيفة المطلوبة<input name="position"></label>', bulk_req: '<label class="f full">عنوان الطلب الجماعي<input name="title" required></label>',
    shift_swap: '', leave_swap: '',
  };
  const o = modal(`<h3>${RQ_NEW_LABEL[type] || 'طلب جديد'}</h3><form class="form" id="mf2">${F[type] || ''}<label class="f">التاريخ<input type="date" name="from_date" value="${todayStr()}" required></label>
    <label class="f full">السبب / ملاحظات<textarea name="reason" rows="3" maxlength="500"></textarea></label><div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">إرسال</button></div></form>`);
  const f = $('#mf2', o);
  f.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', f), async () => {
    const meta = {}; ['department', 'job_title', 'start', 'end', 'person', 'position', 'title'].forEach((k) => { if (f.elements[k] && f.elements[k].value) meta[k] = f.elements[k].value; });
    await api('/requests', 'POST', { type, from_date: f.from_date.value, to_date: f.from_date.value, reason: f.reason.value || (meta.title || ''), amount: f.elements.amount ? f.elements.amount.value : 0, user_id: f.elements.user_id ? f.elements.user_id.value : undefined, meta });
    o.close(); toast('تم إرسال الطلب'); done();
  }); };
}

/* إعدادات الطلبات */
async function rqSettings(body) {
  SETV = await api('/settings');
  body.innerHTML = '<div id="rqs"></div><div class="card" style="margin-top:14px" id="rqdoc"></div>';
  await settingsForm($('#rqs', body), { title: 'الوقت الإضافي التلقائي', intro: 'لو الموظف سجّل انصراف بعد معاد نهاية شفته، الدقايق الزيادة بتتحسب إضافي تلقائياً. مثال: الشفت بينتهي 5:00 والانصراف 5:05 = 5 دقايق × قيمة الدقيقة.', fields: [
    { k: 'overtime_minute_rate', l: 'قيمة الدقيقة الإضافية (جنيه)', t: 'number', attrs: 'step="0.1" min="0"', help: 'الافتراضي 2 جنيه. لو الوردية مربوطة بسياسة إضافي بتحكم السياسة. لو صفر بيتحسب بأجر الساعة × المعامل' },
    { k: 'overtime_auto_approve', l: 'اعتماد الوقت الإضافي التلقائي فوراً (لو مقفول بيستنى موافقة المدير)', t: 'check' }] });
  const eff = [['مكافأة / صرف بدل', 'بتتضاف للمرتب كمكافأة في شهر الطلب'], ['خصم', 'بيتخصم من المرتب في شهر الطلب'], ['إيقاف', 'بيوقف حساب الموظف'], ['تحويل', 'بيغيّر القسم والمسمى ويتسجل في سجل النقل'], ['جدول', 'بيغيّر بداية ونهاية دوام الموظف'],
    ['إجازات وأذونات ووقت إضافي وتعديل حضور وورديات', 'بتأثر على الحضور والمرتب زي ما هي'], ['مطالبات نفقات / قرض / انضمام / طلب جماعي / تبادل ورديات وإجازات', 'بتتسجل وبتتراجع ومفيش أثر تلقائي على المرتب']];
  $('#rqdoc', body).innerHTML = `<h3 style="margin-bottom:8px">إيه اللي بيحصل لما الطلب يتقبل؟</h3><div class="tablewrap st"><table><thead><tr><th>نوع الطلب</th><th>الأثر</th></tr></thead><tbody>${eff.map(([a, b]) => `<tr><td><b>${a}</b></td><td>${b}</td></tr>`).join('')}</tbody></table></div>`;
}
PAGES.requests_classic = PAGES.requests;
PAGES.requests = (v) => rqPage(v, 'in');
PAGES.req_out = (v) => rqPage(v, 'out');
PAGES.req_settings = (v) => rqPage(v, 'set');

