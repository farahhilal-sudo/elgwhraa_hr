'use strict';
/* pages/attendance-tabs.js — تابات الحضور: تقويم العمل والجزاءات والتكليفات وقواعد المهام وسجل الرصيد وتسجيلات الوصول والورديات المفتوحة (لازم يتحمّل قبل attendance-log.js) */
const ATT_VIEWS = {};
const navTabs = (list, cur) => `<div class="card setnav etabs"><div class="stabs" id="etabs">${list.map(([k, l, ic]) => `<button data-et="${k}" class="${k === cur ? 'on' : ''}">${ico(ic)}<span>${l}</span></button>`).join('')}</div>
  <button class="tarrow" id="tarr" title="المزيد">${ico('chev', 'rotm90')}</button></div>`;
async function attPage(view, key) {
  view.innerHTML = navTabs(ATT_TABS, key) + '<div id="abody"><div class="empty"><span class="spin"></span></div></div>';
  bindEmpTabs(view);
  const body = $('#abody', view);
  try { await ATT_VIEWS[key](body); } catch (e) { body.innerHTML = `<div class="card empty neg">${esc(e.message)}</div>`; }
}
ATT_TABS.forEach(([k]) => (PAGES[k] = (v) => attPage(v, k)));
const selBox = (k, ic, ph, arr, cur) => `<label class="sel2 ${cur ? '' : 'ph'}">${ico(ic)}<select data-f="${k}"><option value="">${ph}</option>${arr.map((x) => { const v = Array.isArray(x) ? x[0] : x, l = Array.isArray(x) ? x[1] : x; return `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select></label>`;
const dtBox = (k, v) => `<label class="dt">${ico('calendar')}<input type="date" data-f="${k}" value="${v}"></label>`;
const attPeople = async () => (has('employees.view') ? (await api('/employees').catch(() => [])).filter((u) => !u.pending && !u.is_admin) : []);

/* تقويم العمل */
ATT_VIEWS.att_calendar = async (body) => {
  let month = S.calm || thisMonth();
  const shift = (n) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };
  const draw = async () => {
    const d = await api('/att/calendar?month=' + month);
    S.calm = month;
    const off = (new Date(month + '-01T00:00:00Z').getUTCDay() + 1) % 7, today = todayStr();
    const names = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
    const title = new Date(month + '-01T00:00:00Z').toLocaleDateString('ar-EG-u-nu-latn', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    body.innerHTML = `<div class="card calcard"><div class="dwh"><button class="sqb" id="cprev" title="الشهر السابق">${ico('chev', 'rot90')}</button><h3>${title}</h3><button class="sqb" id="cnext" title="الشهر التالي">${ico('chev', 'rotm90')}</button>
      <button class="btn alt sm" id="ctoday">الشهر الحالي</button><span class="grow"></span>${legendHtml([{ name: 'حضور', color: '#16a34a' }, { name: 'متأخر', color: '#d97706' }, { name: 'غائب', color: '#dc2626' }, { name: 'إجازة', color: '#ca8a04' }])}</div>
      <div class="calgrid">${names.map((n) => `<div class="calh">${n}</div>`).join('')}${'<div class="cald off"></div>'.repeat(off)}
      ${d.days.map((x) => `<button class="cald ${x.weekend ? 'wk' : ''} ${x.holidays.length ? 'hol' : ''} ${x.date === today ? 'now' : ''}" data-d="${x.date}"><b>${Number(x.date.slice(8))}</b>
        ${x.holidays.map((h) => `<em class="hn">${esc(h)}</em>`).join('')}${x.weekend && !x.holidays.length ? '<em class="wn">عطلة أسبوعية</em>' : ''}
        ${!x.weekend && !x.holidays.length && x.date <= today ? `<span class="cs"><span class="cc g" title="حضور">${x.present + x.late}</span>${x.late ? `<span class="cc a" title="متأخر">${x.late}</span>` : ''}${x.absent ? `<span class="cc r" title="غائب">${x.absent}</span>` : ''}${x.leave ? `<span class="cc b" title="إجازة">${x.leave}</span>` : ''}</span>` : ''}</button>`).join('')}</div>
      <p class="muted small" style="margin:10px 0 0">اضغط على أي يوم لفتح سجل الحضور الخاص به. العطلات الرسمية بتتضاف من الإعدادات ← الحضور ← العطلات الرسمية.</p></div>`;
    $('#cprev', body).onclick = () => { month = shift(-1); draw().catch((e) => toast(e.message, true)); };
    $('#cnext', body).onclick = () => { month = shift(1); draw().catch((e) => toast(e.message, true)); };
    $('#ctoday', body).onclick = () => { month = thisMonth(); draw().catch((e) => toast(e.message, true)); };
    body.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => { S.attf = { from: b.dataset.d, to: b.dataset.d }; go('attendance'); }));
  };
  await draw();
};

/* الجزاءات (غياب / تأخير / انصراف مبكر) مع تفعيل أو إلغاء تطبيقها على المرتب */
ATT_VIEWS.att_penalties = async (body) => {
  const canEdit = has('attendance.edit');
  const [emps, tpls] = await Promise.all([attPeople(), api('/config/att_template').catch(() => [])]);
  const pmap = Object.fromEntries(emps.map((u) => [u.id, u]));
  const D = () => ({ tpl: '', q: '', from: monthStart(), to: monthEnd(), applied: '', dept: '', emp: '', reason: '', extra: [] });
  const f = S.penf = { ...D(), ...(S.penf || {}) };
  const EXT = { days: ['بالأيام فقط', (r) => r.unit === 'الأيام'], hours: ['بالساعات فقط', (r) => r.unit === 'الساعات'], fixed: ['بقيمة ثابتة فقط', (r) => r.unit === 'جنيه'] };
  const REASONS = [['absent', 'غائب - عدم الحضور'], ['late', 'جزاء التأخير'], ['early', 'جزاء الانصراف مبكرًا']];
  let rows = [], sel = new Set(), byKey = {};
  const key = (r) => `${r.user_id}|${r.date}|${r.kind}`;
  const filtered = () => {
    const q = f.q.trim().toLowerCase();
    return rows.filter((r) => (!f.applied || (f.applied === '1') === r.applied) && f.extra.every((k) => EXT[k][1](r))
      && (!q || [r.user_name, (pmap[r.user_id] || {}).username, (pmap[r.user_id] || {}).phone].some((x) => String(x || '').toLowerCase().includes(q))));
  };
  const postFlag = async (items, applied, note = '') => { await api('/att/penalties/flag', 'POST', { items: items.map((r) => ({ user_id: r.user_id, date: r.date, kind: r.kind })), applied, note }); const me = S.me.user.name, at = new Date().toISOString(); items.forEach((r) => Object.assign(r, { applied, by: me, at, note })); };
  const paintTable = () => {
    const list = filtered(), shown = list.slice(0, 300); byKey = Object.fromEntries(shown.map((r) => [key(r), r]));
    $('#ptab', body).innerHTML = `<div class="tablewrap st"><table class="pt"><thead><tr><th class="ck"><input type="checkbox" id="pall" ${shown.length && shown.every((r) => sel.has(key(r))) ? 'checked' : ''}></th><th>الموظف</th><th>التاريخ</th><th>السبب</th><th>القيمة</th><th>من</th><th>مُطبَّق</th><th>تم التعديل بواسطة</th><th class="actcol"></th></tr></thead><tbody>
      ${shown.map((r) => `<tr><td class="ck"><input type="checkbox" data-r="${esc(key(r))}" ${sel.has(key(r)) ? 'checked' : ''}></td><td><b>${esc(r.user_name)}</b></td><td dir="ltr" style="text-align:right">${r.date.replace(/-/g, ' - ')}</td><td>${esc(r.reason)}</td>
        <td><b>${r.value}</b> <span class="muted">${r.unit}</span></td><td>${r.from}</td><td><label class="tgl"><input type="checkbox" data-t="${esc(key(r))}" ${r.applied ? 'checked' : ''} ${canEdit ? '' : 'disabled'}><i></i></label></td>
        <td>${r.by ? `${esc(r.by)}<div class="muted small">${dmy(String(r.at).slice(0, 10))}</div>` : '—'}</td>
        <td class="actcol"><div class="racts">${canEdit ? `<button class="sqb" data-ed="${esc(key(r))}" title="تعديل">${ico('edit')}</button>` : ''}<button class="sqb" data-hi="${esc(key(r))}" title="السجل">${ico('clock')}</button></div></td></tr>`).join('') || '<tr><td colspan="9" class="empty">لا توجد جزاءات في الفترة دي</td></tr>'}</tbody></table></div>
      <div class="pager"><span class="muted small">${list.length ? `عرض ${shown.length} من ${list.length}` : ''}</span></div>`;
    const bar = (on) => { $('#bapply', body).disabled = !on || !canEdit; $('#bunapply', body).disabled = !on || !canEdit; }; bar(sel.size > 0);
    $('#pall', body).onchange = (e) => { shown.forEach((r) => (e.target.checked ? sel.add(key(r)) : sel.delete(key(r)))); paintTable(); };
    body.querySelectorAll('[data-r]').forEach((c) => (c.onchange = () => { c.checked ? sel.add(c.dataset.r) : sel.delete(c.dataset.r); bar(sel.size > 0); }));
    body.querySelectorAll('[data-t]').forEach((c) => (c.onchange = () => run(null, async () => {
      const r = byKey[c.dataset.t];
      try { await postFlag([r], c.checked); toast(c.checked ? 'تم تطبيق الجزاء على المرتب' : 'تم إلغاء تطبيق الجزاء'); paintTable(); } catch (e) { c.checked = !c.checked; throw e; }
    })));
    body.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => {
      const r = byKey[b.dataset.ed];
      const o = modal(`<h3>تعديل الجزاء</h3><p class="muted small" style="margin:0 0 10px">${esc(r.user_name)} · ${r.date} · ${esc(r.reason)}</p><form class="form" id="pf"><label class="perm full"><input type="checkbox" name="applied" ${r.applied ? 'checked' : ''}>تطبيق الجزاء على المرتب</label>
        <label class="f full">ملاحظة (سبب الإلغاء أو التعديل)<input name="note" value="${esc(r.note)}" maxlength="200"></label><div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">حفظ</button></div></form>`);
      const pf = $('#pf', o);
      pf.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', pf), async () => { await postFlag([r], pf.applied.checked, pf.note.value); o.close(); toast('تم الحفظ'); paintTable(); }); };
    }));
    body.querySelectorAll('[data-hi]').forEach((b) => (b.onclick = () => {
      const r = byKey[b.dataset.hi];
      modal(`<h3>سجل التعديل</h3><div class="kv"><div><span class="muted">الموظف</span><b>${esc(r.user_name)}</b></div><div><span class="muted">اليوم</span><b>${r.date}</b></div><div><span class="muted">الحالة</span><b>${r.applied ? 'مُطبَّق' : 'غير مُطبَّق'}</b></div>
        <div><span class="muted">آخر تعديل بواسطة</span><b>${r.by ? esc(r.by) : 'لم يتم التعديل'}</b></div>${r.at ? `<div><span class="muted">وقت التعديل</span><b>${dmy(String(r.at).slice(0, 10))} ${clock12(r.at)}</b></div>` : ''}${r.note ? `<div><span class="muted">ملاحظة</span><b>${esc(r.note)}</b></div>` : ''}</div><div class="actions"><button class="btn" data-close>إغلاق</button></div>`);
    }));
  };
  const load = async () => {
    const q = new URLSearchParams({ from: f.from, to: f.to });
    ['emp:user_id', 'reason:reason', 'dept:dept'].forEach((p) => { const [a, b] = p.split(':'); if (f[a]) q.set(b, f[a]); });
    rows = (await api('/att/penalties?' + q)).rows; sel.clear(); paintTable();
  };
  const applyTpl = (id) => {
    const t = tpls.find((x) => String(x.id) === String(id)); let saved = {}; try { saved = JSON.parse((t || {}).filters || '{}'); } catch { /* تجاهل */ }
    Object.assign(f, D(), saved, { tpl: t ? String(t.id) : '' });
  };
  const bulk = (applied) => run(null, async () => { const items = rows.filter((r) => sel.has(key(r))); await postFlag(items, applied); sel.clear(); toast(applied ? 'تم تطبيق الجزاءات المختارة' : 'تم إلغاء تطبيق الجزاءات المختارة'); paintTable(); });
  const paintFilters = () => {
    const depts = [...new Set(emps.map((u) => u.department).filter(Boolean))].sort();
    $('#pfil', body).innerHTML = `<div class="frow2">${selBox('tpl', 'filter', 'حدد القالب', tpls.map((t) => [t.id, t.name]), f.tpl)}<button class="btn alt sm hk" id="tsv">حفظ كنموذج</button>
        <label class="fs wide">${ico('search')}<input data-f="q" placeholder="كود الموظف / هاتفه" value="${esc(f.q)}" autocomplete="off"></label>${dtBox('from', f.from)}${dtBox('to', f.to)}${selBox('applied', 'check', 'الكل', [['1', 'مُطبَّق'], ['0', 'غير مُطبَّق']], f.applied)}</div>
      <div class="frow2">${selBox('dept', 'building', 'كل الأقسام', depts, f.dept)}${selBox('emp', 'user', 'تحديد موظف', emps.map((u) => [u.id, u.name]), f.emp)}${selBox('reason', 'menu', 'اختر سبب', REASONS, f.reason)}
        <button class="addf" id="addf">${ico('filter')} اضف تصفيه ${ico('chev')}</button>${f.extra.map((k) => `<button class="fchip2 on" data-x="${k}">${EXT[k][0]} <i>×</i></button>`).join('')}
        <button class="btn alt sm" id="bapply" disabled>تطبيق عقوبات</button><button class="btn alt sm" id="bunapply" disabled>عدم تطبيق عقوبات متعددة</button></div>
      <div class="frow2"><button class="link rs" id="reset">${ico('filter')} إعادة تعيين المرشحات</button><span class="grow"></span>${exportCsvBtn('pexp')}</div>`;
    body.querySelectorAll('#pfil [data-f]').forEach((el) => (el[el.tagName === 'INPUT' && el.type !== 'date' ? 'oninput' : 'onchange'] = () => {
      const k = el.dataset.f; if (k === 'tpl') applyTpl(el.value); else f[k] = el.value;
      if (k === 'tpl') { paintFilters(); load().catch((e) => toast(e.message, true)); }
      else if (['from', 'to', 'dept', 'emp', 'reason'].includes(k)) { const w = el.closest('.sel2'); if (w) w.classList.toggle('ph', !el.value); load().catch((e) => toast(e.message, true)); }
      else { const w = el.closest('.sel2'); if (w) w.classList.toggle('ph', !el.value); paintTable(); }
    }));
    body.querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => { f.extra = f.extra.filter((x) => x !== b.dataset.x); paintFilters(); paintTable(); }));
    $('#addf', body).onclick = (e) => popMenu(e.currentTarget, Object.entries(EXT).filter(([k]) => !f.extra.includes(k)).map(([k, v]) => ({ ic: 'filter', t: v[0], fn: () => { f.extra.push(k); paintFilters(); paintTable(); } })));
    $('#bapply', body).onclick = () => bulk(true); $('#bunapply', body).onclick = () => bulk(false);
    $('#reset', body).onclick = () => { S.penf = null; attPage(body.parentElement, 'att_penalties'); };
    $('#pexp', body).onclick = () => csv('penalties.csv', [['الموظف', 'التاريخ', 'السبب', 'القيمة', 'الوحدة', 'من', 'مُطبَّق'], ...filtered().map((r) => [r.user_name, r.date, r.reason, r.value, r.unit, r.from, r.applied ? 'نعم' : 'لا'])]);
    $('#tsv', body).onclick = () => { const n = prompt('اسم القالب'); if (!n) return; const { tpl, ...rest } = f; run(null, async () => { const r = await api('/config/att_template', 'POST', { name: n, filters: JSON.stringify(rest) }); tpls.push({ id: r.id, name: n, filters: JSON.stringify(rest) }); f.tpl = String(r.id); toast('تم حفظ القالب'); paintFilters(); }); };
  };
  body.innerHTML = '<div class="efil" id="pfil"></div><div id="ptab"></div>';
  paintFilters(); await load();
};

/* التكليفات / قواعد المهام / الورديات المفتوحة (قوائم بتتخزن) */
ATT_VIEWS.att_assign = async (body) => {
  const people = await attPeople();
  const nf = people.length ? empSel(people) : { k: 'name', l: 'الموظف', req: true, full: true };
  await catalog(body, logSpec('assignment', 'تكليف جديد', nf, [{ k: 'task', l: 'المهمة', full: true, req: true }, { k: 'from', l: 'من', t: 'date', d: todayStr() }, { k: 'to', l: 'إلى', t: 'date' },
    { k: 'status', l: 'الحالة', t: 'select', o: [['new', 'جديد'], ['doing', 'جارٍ'], ['done', 'منتهي']] }, { k: 'notes', l: 'ملاحظات', full: true }]));
};
ATT_VIEWS.att_taskrules = (body) => catalog(body, simpleSpec('task_rule', 'قاعدة جديدة', [DESC, { k: 'applies', l: 'تنطبق على', t: 'select', o: [['all', 'كل الموظفين'], ['dept', 'قسم محدد'], ['emp', 'موظف محدد']] }]));
ATT_VIEWS.att_open_shifts = (body) => catalog(body, simpleSpec('open_shift', 'وردية مفتوحة جديدة', [{ k: 'date', l: 'التاريخ', t: 'date', req: true }, { k: 'start', l: 'البداية', t: 'time', d: '09:00' }, { k: 'end', l: 'النهاية', t: 'time', d: '17:00' }, { k: 'slots', l: 'عدد الأماكن', t: 'number', d: 1, attrs: 'min="1"' }, { k: 'notes', l: 'ملاحظات', full: true }]));

/* سجل رصيد الإجازات */
ATT_VIEWS.att_balance = (body) => catalog(body, { readOnly: true, searchPh: 'ابحث باسم الموظف', tabs: [['all', 'الكل', () => true]], fields: [], text: (r) => r.user_name,
  load: async () => (await api('/att/balance')).rows.map((r, i) => ({ ...r, id: i })),
  sel: { ph: 'تحديد موظف', opts: (items) => [...new Set(items.map((r) => r.user_name))].map((n) => [n, n]), pred: (r, v) => r.user_name === v },
  cols: [['الموظف', (r) => `<b>${esc(r.user_name)}</b>`], ['التاريخ', (r) => r.date.replace(/-/g, ' - ')], ['النوع', (r) => esc(r.type)], ['الأيام', (r) => r.days],
    ['التغيير في الرصيد', (r) => `<b class="${r.change < 0 ? 'neg' : r.change > 0 ? 'pos' : ''}">${r.change > 0 ? '+' : ''}${r.change}</b>`], ['الرصيد بعد العملية', (r) => `<b>${r.balance}</b>`]] });

/* تسجيلات الوصول (كل البصمات) والمفتوحة (حضور من غير انصراف) */
const attRange = () => ({ from: thisMonth() + '-01', to: todayStr() });
const loadAtt = (st) => api(`/attendance?from=${st.from}&to=${st.to}`);
const locLink = (lat, lng) => (lat != null ? `<a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${lat},${lng}">خريطة</a>` : '—');
ATT_VIEWS.att_open_in = (body) => catalog(body, { readOnly: true, range: attRange(), searchPh: 'اسم الموظف', tabs: [['all', 'الكل', () => true]], fields: [], text: (r) => r.user_name,
  load: async (st) => (await loadAtt(st)).filter((a) => a.check_in && !a.check_out),
  extra: (r) => (has('attendance.edit') ? `<button class="btn alt sm" data-a="out" data-id="${r.id}">${ico('clock')} تسجيل انصراف</button>` : ''),
  act: async (a, r, reload) => { if (a === 'out') { const emps = [{ id: r.user_id, name: r.user_name }]; manualAtt(emps, r, reload); } },
  cols: [['الموظف', (r) => `<b>${esc(r.user_name)}</b>`], ['التاريخ', (r) => r.date.replace(/-/g, ' - ')], ['وقت الحضور', (r) => `<span dir="ltr">${clock12(r.check_in)}</span>`],
    ['الموقع', (r) => esc(r.in_loc || '—')], ['مفتوح منذ', (r) => { const m = Math.max(0, Math.round((Date.now() - new Date(r.check_in)) / 60000)); return `${Math.floor(m / 60)} س ${m % 60} د`; }], ['الخريطة', (r) => locLink(r.in_lat, r.in_lng)]] });
ATT_VIEWS.att_checkins = (body) => catalog(body, { readOnly: true, range: attRange(), searchPh: 'اسم الموظف', tabs: [['all', 'الكل', () => true]], fields: [], text: (r) => r.user_name,
  chips: [['all', 'الكل', () => true], ['in', 'حضور', (r) => r.type === 'in'], ['out', 'انصراف', (r) => r.type === 'out']],
  load: async (st) => (await loadAtt(st)).flatMap((a) => [a.check_in && { id: a.id + 'i', type: 'in', iso: a.check_in, user_name: a.user_name, date: a.date, loc: a.in_loc, face: a.in_face, lat: a.in_lat, lng: a.in_lng, manual: !!a.note },
    a.check_out && { id: a.id + 'o', type: 'out', iso: a.check_out, user_name: a.user_name, date: a.date, loc: a.out_loc, face: a.out_face, lat: a.out_lat, lng: a.out_lng, manual: !!a.note }].filter(Boolean)).sort((x, y) => (x.iso < y.iso ? 1 : -1)),
  cols: [['الموظف', (r) => `<b>${esc(r.user_name)}</b>`], ['التاريخ', (r) => r.date.replace(/-/g, ' - ')], ['النوع', (r) => `<span class="badge ${r.type === 'in' ? 'b-ok' : 'b-warn'}">${r.type === 'in' ? 'حضور' : 'انصراف'}</span>`],
    ['الوقت', (r) => `<span dir="ltr">${clock12(r.iso)}</span>`], ['الموقع', (r) => esc(r.loc || '—')], ['تطابق الوجه', (r) => (r.face != null ? 100 - Math.round(r.face * 100) + '%' : r.manual ? 'يدوي' : '—')], ['الخريطة', (r) => locLink(r.lat, r.lng)]] });

