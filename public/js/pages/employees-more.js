'use strict';
/* pages/employees-more.js — سجل الإيقاف (بفلاتر وتصدير بقالب) وتغييرات المسمى الوظيفي، على شكل الشاشات المرجعية.
   بيستبدل صفحتي suspension_log و title_changes اللي في employees-tabs.js (نفس التابات ونفس مفاتيح الصفحات). */

/* --- مكونات مشتركة: فلاتر بعنوان فوق الحقل + قوالب محفوظة + ترقيم --- */
const mfOpts = (arr, cur, ph) => `<option value="">${ph}</option>${arr.map((v) => { const [a, b] = Array.isArray(v) ? v : [v, v]; return `<option value="${esc(a)}" ${String(a) === String(cur) ? 'selected' : ''}>${esc(b)}</option>`; }).join('')}`;
const mfSel = (k, l, arr, cur, ph = 'اختر') => `<label class="mf"><span>${l}</span><select data-k="${k}">${mfOpts(arr, cur, ph)}</select></label>`;
const mfIn = (k, l, cur, t = 'text', ph = 'بحث') => `<label class="mf"><span>${l}</span><input data-k="${k}" type="${t}" value="${esc(cur)}" placeholder="${t === 'date' ? '' : ph}" autocomplete="off"></label>`;
const uniqV = (rows, k) => [...new Set(rows.map((r) => r[k]).filter(Boolean))];
const mfBind = (box, f, redraw) => box.querySelectorAll('[data-k]').forEach((el) => { el[el.tagName === 'INPUT' && el.type === 'text' ? 'oninput' : 'onchange'] = () => { f[el.dataset.k] = el.value; redraw(); }; });
const mfDate = (v) => (v && /^\d{4}-\d\d-\d\d/.test(v) ? v.slice(0, 10) : '-');
const xlDate = (v) => (v && /^\d{4}-\d\d-\d\d/.test(v) ? 'D' + v.slice(0, 10) : '-');
const xlSave = (prefix, opts) => XL.download(`${prefix}_${attStamp()}.xlsx`, opts);
function mfPager(box, n, st, per, redraw) {
  const pages = Math.max(1, Math.ceil(n / per)); st.page = Math.min(st.page, pages);
  return `<div class="pager"><button class="pg" data-pg="${st.page - 1}" ${st.page <= 1 ? 'disabled' : ''}>${ico('chev', 'rot90')}</button>${Array.from({ length: pages }, (_, i) => `<button class="pg ${i + 1 === st.page ? 'on' : ''}" data-pg="${i + 1}">${i + 1}</button>`).join('')}<button class="pg" data-pg="${st.page + 1}" ${st.page >= pages ? 'disabled' : ''}>${ico('chev', 'rotm90')}</button>
    <span class="muted small">${n ? `عرض ${(st.page - 1) * per + 1} إلى ${Math.min(n, st.page * per)} من ${n} إدخالات` : 'لا توجد إدخالات'}</span></div>`;
}
const mfPagerBind = (box, st, redraw) => box.querySelectorAll('[data-pg]').forEach((b) => (b.onclick = () => { st.page = Number(b.dataset.pg); redraw(); }));
// قوالب الفلاتر المحفوظة (إعدادات export_template بحقل page)
const tplHtml = (tpls, cur) => `<select class="mfs" id="mtsel"><option value="">حدد القالب</option>${tpls.map((t) => `<option value="${t.id}" ${String(t.id) === String(cur) ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select><button class="btn alt sm" id="mtsv">حفظ كنموذج</button>`;
function tplBind(box, tpls, f, page, defaults, redrawAll) {
  $('#mtsel', box).onchange = (e) => {
    const t = tpls.find((x) => String(x.id) === e.target.value);
    Object.assign(f, defaults(), t ? (() => { try { return JSON.parse(t.filters || '{}'); } catch { return {}; } })() : {}, { tpl: t ? String(t.id) : '' });
    redrawAll();
  };
  $('#mtsv', box).onclick = (e) => {
    const n = prompt('اسم النموذج'); if (!n) return;
    run(e.target, async () => { const { tpl, ...rest } = f; const r = await api('/config/export_template', 'POST', { name: n, page, filters: JSON.stringify(rest).slice(0, 480) }); tpls.push({ id: r.id, name: n, page, filters: JSON.stringify(rest) }); f.tpl = String(r.id); toast('تم حفظ النموذج'); redrawAll(); });
  };
}

/* ===== سجل الإيقاف ===== */
const SUSP_REASONS = {
  'إنهاء الخدمة': ['ضعف الأداء الوظيفي', 'مخالفة سياسات الشركة', 'انتهاء العقد', 'تقليص العمالة', 'أخرى'],
  'استقالة': ['أسباب شخصية أو عائلية', 'فرصة عمل أفضل', 'السفر', 'الدراسة', 'أخرى'],
  'إيقاف مؤقت': ['تحقيق إداري', 'إجازة بدون أجر', 'أخرى'],
  'أخرى': ['أخرى'],
};
const reasonHtml = (r = '', s = '') => `<label class="f">سبب الإيقاف<select name="reason" data-rs="r"><option value="">اختر السبب</option>${Object.keys(SUSP_REASONS).map((k) => `<option ${k === r ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
  <label class="f">السبب الفرعي<select name="sub" data-rs="s"><option value="">اختر السبب الفرعي</option>${(SUSP_REASONS[r] || []).map((k) => `<option ${k === s ? 'selected' : ''}>${k}</option>`).join('')}</select></label>`;
function reasonBind(root) {
  const r = root.querySelector('[data-rs=r]'), s = root.querySelector('[data-rs=s]'), keep = s.value;
  r.onchange = () => { s.innerHTML = `<option value="">اختر السبب الفرعي</option>${(SUSP_REASONS[r.value] || []).map((k) => `<option>${k}</option>`).join('')}`; };
  s.value = keep;
}
// نافذة إيقاف موظف بسببه (بتستخدمها قايمة الموظفين وصفحة الإجراءات)
function suspendDialog(u, done) {
  const o = modal(`<h3>إيقاف ${esc(u.name)}</h3><p class="muted small">هيتشال من قائمة الموظفين النشطين، وكل سجله القديم (حضور وطلبات ومرتبات) يفضل محفوظ.</p>
    <form class="form" id="sf">${reasonHtml()}<label class="f">تاريخ بدء الإيقاف<input type="date" name="start" value="${todayStr()}"></label>
    <label class="f full">ملحوظات<textarea name="notes" rows="3" maxlength="300"></textarea></label>
    <div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn bad">إيقاف</button></div></form>`);
  const f = $('#sf', o); reasonBind(f);
  f.onsubmit = (e) => { e.preventDefault(); run($('.btn.bad', f), async () => {
    await api('/employees/' + u.id, 'PUT', { active: false, suspend_reason: f.reason.value, suspend_sub: f.sub.value, suspend_notes: f.notes.value, suspend_start: f.start.value });
    o.close(); toast('تم الإيقاف، السجل القديم محفوظ'); if (done) done();
  }); };
}

const SUSP_COLS = [ // [مفتاح, عنوان الملف, قيمة الخلية, عرض افتراضي]
  ['name', 'اسم الموظف', (r) => r.name], ['code', 'كود الموظف', (r) => r.code], ['day_type', 'نوع يوم العمل', (r) => r.day_type], ['department', 'القسم', (r) => r.department],
  ['position', 'المنصب', (r) => r.position], ['office', 'المكتب', (r) => r.office], ['manager', 'المدير المباشر', (r) => r.manager], ['gender', 'النوع', (r) => r.gender],
  ['hire_date', 'تاريخ التعيين', (r) => xlDate(r.hire_date)], ['start', 'تاريخ بدء الإيقاف', (r) => xlDate(r.start)], ['end', 'تاريخ انتهاء الإيقاف', (r) => xlDate(r.end)],
  ['created', 'أنشئ في', (r) => (r.created && r.created.length > 10 ? attDT(r.created.includes('T') ? r.created : r.created.replace(' ', 'T') + 'Z') : '-')], ['by', 'تم الإيقاف بواسطة', (r) => r.by], ['reason', 'سبب الإيقاف', (r) => r.reason],
  ['sub', 'السبب الفرعي للإيقاف', (r) => r.sub], ['notes', 'ملحوظات', (r) => r.notes],
  ['national_id', 'الرقم القومي', (r) => r.national_id, 'country'], ['insurance_no', 'الرقم التأميني', () => '', 'country'],
];
function suspExport(rows, tpls) {
  const sel = new Set(SUSP_COLS.filter((c) => !c[3]).map((c) => c[0]));
  const o = modal(`<h3>تصدير سجل الإيقاف</h3><div class="form"><label class="f full">تصدير القالب<select id="xt"><option value="">تحديد خيار</option>${tpls.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label>
    <div class="xbox full">${SUSP_COLS.filter((c) => !c[3]).map((c) => `<label class="perm"><input type="checkbox" data-c="${c[0]}" checked>${c[1]}</label>`).join('')}
    <div class="muted small xhd">حقول ذات صلة بالدولة</div><div class="muted small">مصر</div>${SUSP_COLS.filter((c) => c[3]).map((c) => `<label class="perm"><input type="checkbox" data-c="${c[0]}">${c[1]}</label>`).join('')}</div>
    <label class="perm full"><input type="checkbox" id="xs">حفظ كنموذج</label>
    <div class="actions full"><button class="btn" id="xgo">تصدير</button></div></div>`);
  $('#xt', o).onchange = (e) => {
    const t = tpls.find((x) => String(x.id) === e.target.value); if (!t) return;
    const on = new Set(String(t.fields || '').split(',')); o.querySelectorAll('[data-c]').forEach((c) => (c.checked = on.has(c.dataset.c)));
  };
  $('#xgo', o).onclick = (e) => run(e.target, async () => {
    const cols = SUSP_COLS.filter((c) => o.querySelector(`[data-c="${c[0]}"]`).checked);
    if (!cols.length) throw new Error('اختار عمود واحد على الأقل');
    if ($('#xs', o).checked) { const n = prompt('اسم النموذج'); if (n) { await api('/config/export_template', 'POST', { name: n, page: 'suspension_log', fields: cols.map((c) => c[0]).join(',') }); toast('تم حفظ النموذج'); } }
    xlSave('suspension_history', { noTitle: true, sheet: 'Worksheet', headers: cols.map((c) => c[1]), widths: cols.map(() => 31.09), rows: rows.map((r) => cols.map((c) => c[2](r))) });
    o.close();
  });
}
const SUSP_EXTRA = { pos: ['المنصب', 'position'], mgr: ['المدير المباشر', 'manager'], gender: ['النوع', 'gender'] };
async function suspPage(view) {
  view.innerHTML = empTabsHtml('suspension_log') + '<div id="ebody"><div class="empty"><span class="spin"></span></div></div>';
  bindEmpTabs(view);
  const body = $('#ebody', view), manage = has('employees.manage');
  let rows = [], tpls = [], ftpls = [];
  try { rows = await api('/suspensions'); const all = await api('/config/export_template').catch(() => []); tpls = all.filter((t) => t.page === 'suspension_log'); ftpls = all.filter((t) => t.page === 'filters:suspension_log'); } catch (e) { body.innerHTML = `<div class="card empty neg">${esc(e.message)}</div>`; return; }
  const D = () => ({ tpl: '', emp: '', code: '', from: '', to: '', dt: '', office: '', dept: '', reason: '', sub: '', pos: '', mgr: '', gender: '', extra: [] });
  const f = D(), st = { page: 1 };
  const filt = () => rows.filter((r) => (!f.emp || String(r.user_id) === f.emp) && (!f.code || String(r.code).toLowerCase().includes(f.code.toLowerCase())) && (!f.from || (r.start && r.start >= f.from)) && (!f.to || (r.start && r.start <= f.to))
    && (!f.dt || r.day_type === f.dt) && (!f.office || r.office === f.office) && (!f.dept || r.department === f.dept) && (!f.reason || r.reason === f.reason) && (!f.sub || r.sub === f.sub)
    && (!f.pos || r.position === f.pos) && (!f.mgr || r.manager === f.mgr) && (!f.gender || r.gender === f.gender));
  const people = [...new Map(rows.map((r) => [r.user_id, [String(r.user_id), r.name]])).values()];
  const tdraw = () => {
    const all = filt(), part = all.slice((st.page - 1) * 15, st.page * 15);
    $('#stab', body).innerHTML = `<div class="tablewrap st"><table><thead><tr><th>اسم الموظف</th><th>كود الموظف</th><th>نوع يوم العمل</th><th>تاريخ بدء الإيقاف</th><th>تاريخ انتهاء الإيقاف</th><th>تم في</th><th>تم الإيقاف بواسطة</th><th>سبب الإيقاف</th><th>ملحوظات</th>${manage ? '<th class="actcol"></th>' : ''}</tr></thead><tbody>
      ${part.map((r) => `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.code || '-')}</td><td>${esc(r.day_type)}</td><td>${mfDate(r.start)}</td><td>${mfDate(r.end)}</td><td>${r.created ? esc(mfDate(r.created)) : '-'}</td><td>${esc(r.by || '-')}</td><td>${r.reason ? esc(r.reason) + (r.sub ? ` · ${esc(r.sub)}` : '') : '-'}</td><td>${esc(r.notes || '-')}</td>
        ${manage ? `<td class="actcol"><div class="racts"><button class="sqb" data-ed="${rows.indexOf(r)}" title="تعديل">${ico('edit')}</button>${r.end ? '' : `<button class="btn alt sm" data-on="${r.user_id}">تفعيل الحساب</button>`}</div></td>` : ''}</tr>`).join('') || `<tr><td colspan="${manage ? 10 : 9}" class="empty">لا توجد سجلات</td></tr>`}</tbody></table></div>${mfPager(body, all.length, st, 15)}`;
    mfPagerBind(body, st, tdraw);
    body.querySelectorAll('[data-on]').forEach((b) => (b.onclick = () => run(b, async () => { await api('/employees/' + b.dataset.on, 'PUT', { active: true }); toast('تم تفعيل الحساب'); suspPage(view); })));
    body.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => editRec(rows[Number(b.dataset.ed)])));
  };
  const editRec = (r) => {
    const o = modal(`<h3>تعديل إيقاف ${esc(r.name)}</h3><form class="form" id="ef">${reasonHtml(r.reason, r.sub)}<label class="f">تاريخ بدء الإيقاف<input type="date" name="start" value="${esc(mfDate(r.start) === '-' ? '' : mfDate(r.start))}"></label>
      <label class="f">تاريخ انتهاء الإيقاف<input type="date" name="end" value="${esc(mfDate(r.end) === '-' ? '' : mfDate(r.end))}"></label><label class="f full">ملحوظات<textarea name="notes" rows="3" maxlength="300">${esc(r.notes)}</textarea></label>
      <div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">حفظ</button></div></form>`);
    const ef = $('#ef', o); reasonBind(ef);
    ef.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', ef), async () => {
      const d = { name: r.name, user_id: r.user_id, start: ef.start.value, end: ef.end.value, reason: ef.reason.value, sub: ef.sub.value, notes: ef.notes.value, by: r.by, created: r.created };
      await api(r.id ? `/config/suspension/${r.id}` : '/config/suspension', r.id ? 'PUT' : 'POST', d);
      o.close(); toast('تم الحفظ'); suspPage(view);
    }); };
  };
  const drawAll = () => {
    const xf = f.extra.map((k) => SUSP_EXTRA[k]);
    body.innerHTML = `<div class="card mfcard"><div class="mfg">
      ${mfSel('emp', 'الموظف', people, f.emp)}${mfIn('code', 'كود الموظف', f.code)}${mfIn('from', 'من', f.from, 'date')}${mfIn('to', 'إلى', f.to, 'date')}
      ${mfSel('dt', 'نوع يوم العمل', uniqV(rows, 'day_type'), f.dt, 'تحديد خيار')}${mfSel('office', 'المكتب', uniqV(rows, 'office'), f.office, 'تحديد خيار')}${mfSel('dept', 'القسم', uniqV(rows, 'department'), f.dept, 'تحديد قسم')}
      ${mfSel('reason', 'سبب الإيقاف', Object.keys(SUSP_REASONS), f.reason, 'اختر السبب')}${mfSel('sub', 'السبب الفرعي للإيقاف', [...new Set(Object.values(SUSP_REASONS).flat())], f.sub, 'اختر السبب الفرعي')}
      ${f.extra.map((k) => mfSel(k, SUSP_EXTRA[k][0], uniqV(rows, SUSP_EXTRA[k][1]), f[k], 'تحديد خيار')).join('')}</div>
      <div class="mfbar"><button class="btn alt" id="sx">${ico('download')} تصدير</button><button class="link rs" id="srs">${ico('filter')} إعادة تعيين المرشحات</button>
        <button class="btn alt" id="sadd">${ico('filter')} اضف تصفيه ${ico('chev')}</button><span class="grow"></span>${tplHtml(ftpls, f.tpl)}</div></div><div id="stab"></div>`;
    mfBind(body, f, () => { st.page = 1; tdraw(); });
    tplBind(body, ftpls, f, 'filters:suspension_log', D, drawAll);
    $('#srs', body).onclick = () => { Object.assign(f, D()); st.page = 1; drawAll(); };
    $('#sx', body).onclick = () => suspExport(filt(), tpls);
    $('#sadd', body).onclick = (e) => popMenu(e.currentTarget, Object.entries(SUSP_EXTRA).filter(([k]) => !f.extra.includes(k)).map(([k, v]) => ({ ic: 'filter', t: v[0], fn: () => { f.extra.push(k); drawAll(); } })));
    tdraw();
  };
  drawAll();
}
PAGES.suspension_log = suspPage;

/* ===== تغييرات المسمى الوظيفي ===== */
async function titlePage(view) {
  view.innerHTML = empTabsHtml('title_changes') + '<div id="ebody"><div class="empty"><span class="spin"></span></div></div>';
  bindEmpTabs(view);
  const body = $('#ebody', view), manage = has('employees.manage'), today = todayStr();
  let people = [], items = [], ftpls = [];
  try { people = (await api('/employees')).filter((u) => !u.pending); items = await api('/config/title_change'); ftpls = (await api('/config/export_template').catch(() => [])).filter((t) => t.page === 'filters:title_changes'); } catch (e) { body.innerHTML = `<div class="card empty neg">${esc(e.message)}</div>`; return; }
  const byName = Object.fromEntries(people.map((u) => [u.name, u]));
  const stOf = (it) => (it.applied ? 'done' : it.date && it.date < today ? 'late' : 'pending');
  const ST = { pending: ['قيد الانتظار', 'b-info'], late: ['متأخر', 'b-bad'], done: ['تم التطبيق', 'b-ok'] };
  const D = () => ({ tpl: '', emp: '', dept: '', st: '', from: '', to: '' });
  const f = D(), pg = { page: 1 };
  const filt = () => items.filter((it) => (!f.emp || it.name === f.emp) && (!f.dept || (byName[it.name] || {}).department === f.dept) && (!f.st || stOf(it) === f.st) && (!f.from || (it.date || '') >= f.from) && (!f.to || (it.date || '') <= f.to));
  const tdraw = () => {
    const all = filt(), part = all.slice((pg.page - 1) * 15, pg.page * 15);
    const cnt = (k) => items.filter((it) => stOf(it) === k).length;
    $('#tstats', body).innerHTML = `<div class="mstat" style="--c:#dbeafe;--i:#1d4ed8"><div class="mi">${ico('file')}</div><div><span>الإجمالي</span><b>${items.length}</b></div></div><div class="mstat" style="--c:#fff3c4;--i:#b45309"><div class="mi">${ico('timer')}</div><div><span>قيد الانتظار</span><b>${cnt('pending')}</b></div></div><div class="mstat" style="--c:#eef0ff;--i:#3b3fb5"><div class="mi">${ico('calendar')}</div><div><span>متأخر</span><b>${cnt('late')}</b></div></div>`;
    $('#stab', body).innerHTML = `<div class="tablewrap st"><table><thead><tr><th>الموظف</th><th>القسم</th><th>المسمى السابق</th><th>المسمى الجديد</th><th>التاريخ</th><th>الحالة</th>${manage ? '<th class="actcol"></th>' : ''}</tr></thead><tbody>
      ${part.map((it) => `<tr><td><b>${esc(it.name)}</b></td><td>${esc((byName[it.name] || {}).department || '-')}</td><td>${esc(it.old || '-')}</td><td>${esc(it.new || '-')}</td><td>${mfDate(it.date)}</td><td><span class="badge ${ST[stOf(it)][1]}">${ST[stOf(it)][0]}</span></td>
        ${manage ? `<td class="actcol"><div class="racts">${it.applied ? '' : `<button class="vchip" data-ap="${it.id}">تطبيق على الموظف</button>`}<button class="sqb" data-dl="${it.id}" title="حذف">${ico('trash')}</button></div></td>` : ''}</tr>`).join('') || `<tr><td colspan="${manage ? 7 : 6}" class="empty">لم يتم العثور على تغييرات في العنوان</td></tr>`}</tbody></table></div>${mfPager(body, all.length, pg, 15)}`;
    mfPagerBind(body, pg, tdraw);
    body.querySelectorAll('[data-ap]').forEach((b) => (b.onclick = () => run(b, async () => {
      const it = items.find((x) => String(x.id) === b.dataset.ap), u = byName[it.name]; if (!u) throw new Error('الموظف مش موجود');
      await api('/employees/' + u.id, 'PUT', { job_title: it.new });
      await api('/config/title_change/' + it.id, 'PUT', { name: it.name, old: it.old, new: it.new, date: it.date, applied: true });
      toast('تم تحديث المسمى الوظيفي'); titlePage(view);
    })));
    body.querySelectorAll('[data-dl]').forEach((b) => (b.onclick = () => { if (confirm('حذف السجل ده؟')) run(b, async () => { await api('/config/title_change/' + b.dataset.dl, 'DELETE'); titlePage(view); }); }));
  };
  const addForm = () => {
    const o = modal(`<h3>تغيير مسمى جديد</h3><form class="form" id="tf"><label class="f full">الموظف<select name="emp" required><option value="">اختر الموظف</option>${people.filter((u) => u.active).map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></label>
      <label class="f">المسمى الجديد<input name="new" required list="tposl" maxlength="80"><datalist id="tposl">${uniqV(people, 'job_title').map((p) => `<option value="${esc(p)}">`).join('')}</datalist></label><label class="f">التاريخ<input type="date" name="date" value="${today}"></label>
      <div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">حفظ</button></div></form>`);
    const tf = $('#tf', o);
    tf.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', tf), async () => {
      const u = people.find((x) => String(x.id) === tf.emp.value);
      await api('/config/title_change', 'POST', { name: u.name, old: u.job_title || '', new: tf.new.value, date: tf.date.value, applied: false });
      o.close(); toast('تم الحفظ'); titlePage(view);
    }); };
  };
  const drawAll = () => {
    body.innerHTML = `<div class="mstats" id="tstats"></div><div class="card mfcard"><div class="mfg">${mfSel('emp', 'الموظف', people.map((u) => u.name), f.emp)}${mfSel('dept', 'القسم', uniqV(people, 'department'), f.dept, 'تحديد خيار')}
      ${mfSel('st', 'الحالة', Object.entries(ST).map(([k, v]) => [k, v[0]]), f.st, 'تحديد خيار')}${mfIn('from', 'من', f.from, 'date')}${mfIn('to', 'إلى', f.to, 'date')}</div>
      <div class="mfbar"><button class="btn alt" id="tx">${ico('download')} تصدير</button><button class="link rs" id="trs">${ico('filter')} إعادة تعيين المرشحات</button>${manage ? `<button class="btn" id="tnew">${ico('plus')} تغيير مسمى جديد</button>` : ''}<span class="grow"></span>${tplHtml(ftpls, f.tpl)}</div></div><div id="stab"></div>`;
    mfBind(body, f, () => { pg.page = 1; tdraw(); });
    tplBind(body, ftpls, f, 'filters:title_changes', D, drawAll);
    $('#trs', body).onclick = () => { Object.assign(f, D()); pg.page = 1; drawAll(); };
    if ($('#tnew', body)) $('#tnew', body).onclick = addForm;
    $('#tx', body).onclick = () => xlSave('job_title_changes', { noTitle: true, sheet: 'Worksheet', headers: ['الموظف', 'القسم', 'المسمى السابق', 'المسمى الجديد', 'التاريخ', 'الحالة'], widths: [31, 20, 22, 22, 16, 16],
      rows: filt().map((it) => [it.name, (byName[it.name] || {}).department || '', it.old || '', it.new || '', xlDate(it.date), ST[stOf(it)][0]]) });
    tdraw();
  };
  drawAll();
}
PAGES.title_changes = titlePage;
