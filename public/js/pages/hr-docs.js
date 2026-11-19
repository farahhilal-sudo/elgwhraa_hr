'use strict';
/* pages/hr-docs.js — مستندات الموارد البشرية (الطلبات / الخطابات الصادرة / القوالب) + مكوّن قائمة مشترك مع إدارة الأصول */
Object.assign(ICONS, { hd_doc: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4l2 2"/>', hd_tpl: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5"/>', hd_box: '<path d="M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10"/>', hd_up: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>' });
const HD_LANG = { ar: 'العربية', en: 'الإنجليزية' };
const hdBadge = (st) => ({ pending: ['قيد الانتظار', 'wait'], approved: ['مقبول', 'ok'], rejected: ['مرفوض', 'bad'] }[st] || [st, '']);
const hdSt = (st) => { const [l, c] = hdBadge(st); return `<span class="hbd ${c}">${l}</span>`; };
const hdDate = (d) => String(d || '').slice(0, 10);

/* مكوّن قائمة: تابات + فلاتر + جدول + ترقيم.
   o = { tabs:(cur)=>html, cur, key, filters:[{k,ph,t:'text'|'select'|'date',opts}], defaults, add:{label,fn}, load:(F)=>Promise<{rows,...}>, cols:[[label,fn]], acts:(row,data)=>html, onActs:(root,data,reload)=>void, seg:[[v,l]], segKey, extra:()=>html } */
async function hdList(view, o) {
  S.hdf = S.hdf || {};
  const F = (S.hdf[o.key] = S.hdf[o.key] || { q: '', page: 1, ...(o.defaults || {}) });
  const flt = o.filters || [];
  view.innerHTML = `${o.tabs(o.cur)}<div class="lnbar">
    ${o.seg ? `<div class="hseg" id="hseg">${o.seg.map(([v, l]) => `<button data-v="${v}" class="${String(F[o.segKey]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
    <div class="lnrow">${flt.map((f) => f.t === 'select' ? `<label class="dfi"><select data-f="${f.k}"><option value="">${f.ph}</option>${(f.opts || []).map(([a, b]) => `<option value="${esc(a)}" ${String(F[f.k]) === String(a) ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>`
      : `<label class="dfi ${f.t === 'date' ? 'dfd' : 'grow'}"><input data-f="${f.k}" type="${f.t || 'text'}" placeholder="${f.ph}" value="${esc(F[f.k] || '')}" title="${f.ph}"></label>`).join('')}
      <button class="btn alt" id="hrs">${ico('filter')} إعادة تعيين المرشحات</button><span class="grow"></span>${(o.extraBtns || []).join('')}${o.add ? `<button class="btn" id="hadd" hidden>+ ${o.add.label}</button>` : ''}</div></div>
    <div id="hbody"><div class="empty"><span class="spin"></span></div></div>`;
  bindTabs(view, (t) => go(t));
  const PS = 10; let data;
  const draw = () => {
    const rows = data.rows, pages = Math.max(1, Math.ceil(rows.length / PS)); F.page = Math.min(F.page, pages);
    const slice = rows.slice((F.page - 1) * PS, F.page * PS), cols = o.cols, hasActs = !!o.acts;
    $('#hbody', view).innerHTML = `<div class="tablewrap"><table><thead><tr>${cols.map((c) => `<th>${c[0]}</th>`).join('')}${hasActs ? '<th></th>' : ''}</tr></thead><tbody>
      ${slice.map((r) => `<tr>${cols.map((c) => `<td>${c[1](r)}</td>`).join('')}${hasActs ? `<td class="lnact">${o.acts(r, data)}</td>` : ''}</tr>`).join('') || `<tr><td colspan="${cols.length + 1}" class="empty">${o.empty || 'لا توجد سجلات لعرضها'}</td></tr>`}</tbody></table></div>
      <div class="hpg"><span class="muted small">عرض ${rows.length ? (F.page - 1) * PS + 1 : 0} إلى ${Math.min(F.page * PS, rows.length)} من ${rows.length} إدخالات</span>
      <span class="hpn"><button data-pg="-1" ${F.page <= 1 ? 'disabled' : ''}>›</button><b>${F.page}</b><button data-pg="1" ${F.page >= pages ? 'disabled' : ''}>‹</button></span></div>`;
    view.querySelectorAll('[data-pg]').forEach((b) => (b.onclick = () => { F.page += Number(b.dataset.pg); draw(); }));
    if (o.onActs) o.onActs($('#hbody', view), data, reload);
  };
  const reload = async () => { data = await o.load(F); if ($('#hadd', view)) $('#hadd', view).hidden = !(o.add.show ? o.add.show(data) : data.can_manage); draw(); };
  let tm;
  view.querySelectorAll('[data-f]').forEach((el) => { el.oninput = el.onchange = () => { F[el.dataset.f] = el.value; F.page = 1; clearTimeout(tm); tm = setTimeout(reload, el.tagName === 'INPUT' && el.type === 'text' ? 300 : 0); }; });
  view.querySelectorAll('#hseg button').forEach((b) => (b.onclick = () => { F[o.segKey] = b.dataset.v; F.page = 1; view.querySelectorAll('#hseg button').forEach((x) => x.classList.toggle('on', x === b)); reload(); }));
  $('#hrs', view).onclick = () => { delete S.hdf[o.key]; hdList(view, o); };
  if (o.add) $('#hadd', view).onclick = () => o.add.fn(data, reload);
  if (o.mounted) o.mounted(view, () => data, reload);
  await reload();
}
const hdQs = (F, keys) => new URLSearchParams(Object.fromEntries(keys.map((k) => [k, F[k] ?? '']))).toString();
// نافذة نموذج بسيطة: fields=[{k,l,t:'text'|'select'|'textarea'|'number'|'date',opts,req,ph,full}]
function hdForm(title, fields, onSave, o = {}) {
  const m = modal(`<div class="tkmh"><h3>${title}</h3><button class="sqb" data-close title="إغلاق">✕</button></div><form class="tkform" id="hdf"><div class="tkgrid">
    ${fields.map((f) => `<label class="f ${f.full ? 'full' : ''}">${f.l}${f.t === 'select' ? `<select name="${f.k}"><option value="">${f.ph || 'تحديد خيار'}</option>${f.opts.map(([a, b]) => `<option value="${esc(a)}" ${String(f.v) === String(a) ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>`
      : f.t === 'textarea' ? `<textarea name="${f.k}" rows="${f.rows || 4}" placeholder="${f.ph || ''}">${esc(f.v || '')}</textarea>` : `<input name="${f.k}" type="${f.t || 'text'}" ${f.attrs || ''} value="${esc(f.v ?? '')}" placeholder="${f.ph || ''}" ${f.req ? 'required' : ''}>`}</label>`).join('')}
    ${o.extra || ''}</div><div class="tkmf"><button class="btn" id="hdsave">${o.btn || 'حفظ'}</button></div></form>`);
  m.querySelector('.modal').classList.add('tkmodal', 'narrow');
  const f = $('#hdf', m);
  f.onsubmit = (e) => { e.preventDefault(); run($('#hdsave', m), async () => { const b = {}; fields.forEach((x) => (b[x.k] = f.elements[x.k].value)); await onSave(b, f); m.close(); }); };
  return m;
}
const hdTabs = (cur) => tabsBar([['hd_requests', 'الطلبات', 'hd_doc'], ['hd_letters', 'الخطابات الصادرة', 'hd_doc'], ['hd_templates', 'القوالب', 'hd_tpl']], cur);

/* ---------- الطلبات ---------- */
PAGES.hd_requests = (view) => hdList(view, {
  tabs: hdTabs, cur: 'hd_requests', key: 'hdr', defaults: { status: 'pending' },
  filters: [{ k: 'q', ph: 'بحث' }, { k: 'language', ph: 'اللغة', t: 'select', opts: Object.entries(HD_LANG) }, { k: 'status', ph: 'الحالة', t: 'select', opts: [['pending', 'قيد الانتظار'], ['approved', 'مقبول'], ['rejected', 'مرفوض']] }],
  load: (F) => api('/doc-requests?' + hdQs(F, ['q', 'language', 'status'])),
  add: { label: 'طلب جديد', show: (d) => d.can_manage, fn: (d, reload) => hdForm('طلب مستند جديد', [
    { k: 'user_id', l: 'الموظف', t: 'select', opts: d.employees.map((e) => [e.id, e.name]) }, { k: 'template_id', l: 'نوع المستند', t: 'select', opts: d.templates.map((t) => [t.id, `${t.name} (${HD_LANG[t.language] || ''})`]) },
    { k: 'destination', l: 'الوجهة', ph: 'الجهة المطلوب تقديمه لها' }, { k: 'note', l: 'ملاحظة' }], async (b) => { await api('/doc-requests', 'POST', b); toast('تم إرسال الطلب'); reload(); }) },
  cols: [['الموظف', (r) => `<b>${esc(r.user_name)}</b>`], ['النوع', (r) => esc(r.type_name)], ['اللغة', (r) => HD_LANG[r.language] || ''], ['الوجهة', (r) => esc(r.destination || '—')], ['التاريخ', (r) => hdDate(r.created_at)], ['الحالة', (r) => hdSt(r.status)]],
  acts: (r, d) => (r.status === 'pending' && d.can_manage ? `<button class="hq ok" data-d="approved" data-id="${r.id}">قبول ${ico('check')}</button><button class="hq bad" data-d="rejected" data-id="${r.id}">رفض ${ico('trash')}</button>` : r.letter_id ? `<button class="sqb" data-lt="${r.letter_id}" title="عرض الخطاب">${ico('eye')}</button>` : ''),
  onActs: (root, d, reload) => {
    root.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => run(b, async () => { await api(`/doc-requests/${b.dataset.id}/decide`, 'POST', { decision: b.dataset.d }); toast(b.dataset.d === 'approved' ? 'تم القبول وإصدار الخطاب' : 'تم الرفض'); reload(); })));
    root.querySelectorAll('[data-lt]').forEach((b) => (b.onclick = () => hdShowLetter(b.dataset.lt)));
  },
});

/* ---------- الخطابات الصادرة ---------- */
async function hdShowLetter(id) {
  const l = await api('/doc-letters/' + id), rtl = l.language !== 'en';
  const m = modal(`<div class="tkmh"><h3>${esc(l.template_name)} — ${esc(l.user_name)}</h3><button class="sqb" data-close>✕</button></div><div class="hletter ${rtl ? '' : 'ltr'}" dir="${rtl ? 'rtl' : 'ltr'}">${esc(l.body)}</div>
    <div class="tkmf" style="padding:0 22px 18px"><button class="btn" id="hprint">${ico('download')} طباعة / تنزيل PDF</button></div>`);
  m.querySelector('.modal').classList.add('tkmodal', 'narrow');
  $('#hprint', m).onclick = () => {
    const w = window.open('', '_blank'); if (!w) return toast('اسمحي بالنوافذ المنبثقة عشان الطباعة');
    w.document.write(`<!doctype html><html dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(l.template_name)}</title><style>body{font-family:Cairo,Tahoma,Arial,sans-serif;margin:48px 56px;line-height:2;font-size:16px;white-space:pre-wrap}h1{font-size:20px;text-align:center;margin:0 0 24px}</style></head><body><h1>${esc(l.template_name)}</h1>${esc(l.body)}</body></html>`);
    w.document.close(); setTimeout(() => w.print(), 300);
  };
}
PAGES.hd_letters = (view) => hdList(view, {
  tabs: hdTabs, cur: 'hd_letters', key: 'hdl',
  filters: [{ k: 'q', ph: 'بحث' }, { k: 'template_id', ph: 'نموذج الاستيراد', t: 'select', opts: [] }, { k: 'user_id', ph: 'الموظفون', t: 'select', opts: [] }, { k: 'language', ph: 'اللغة', t: 'select', opts: Object.entries(HD_LANG) }, { k: 'date', ph: 'تاريخ الإصدار', t: 'date' }],
  load: async (F) => { const d = await api('/doc-letters?' + hdQs(F, ['q', 'template_id', 'user_id', 'language', 'date'])); fillSel('template_id', d.templates.map((t) => [t.id, t.name]), F.template_id); fillSel('user_id', d.employees.map((e) => [e.id, e.name]), F.user_id); return d; },
  add: { label: 'خطاب جديد', fn: (d, reload) => hdForm('خطاب جديد', [
    { k: 'user_id', l: 'الموظف', t: 'select', opts: d.employees.map((e) => [e.id, e.name]) }, { k: 'template_id', l: 'القالب', t: 'select', opts: d.templates.map((t) => [t.id, `${t.name} (${HD_LANG[t.language] || ''})`]) },
    { k: 'destination', l: 'الوجهة', ph: 'الجهة الموجّه لها الخطاب' }, { k: 'date', l: 'تاريخ الإصدار', t: 'date', v: new Date().toISOString().slice(0, 10) }], async (b) => { const r = await api('/doc-letters', 'POST', b); toast('تم إصدار الخطاب'); await reload(); hdShowLetter(r.id); }, { btn: 'إصدار' }) },
  cols: [['الموظف', (r) => `<b>${esc(r.user_name)}</b>`], ['اللغة', (r) => HD_LANG[r.language] || ''], ['نموذج الاستيراد', (r) => esc(r.template_name)], ['تاريخ الإصدار', (r) => r.issued_on],
    ['الموقّع', (r) => `<span class="hsig"><i>${esc(initials(r.issued_by_name || '؟'))}</i>${esc(r.issued_by_name || '—')}</span>`], ['الوجهة', (r) => esc(r.destination || '—')]],
  acts: (r, d) => `<button class="sqb" data-dl="${r.id}" title="تنزيل">${ico('download')}</button><button class="sqb" data-lt="${r.id}" title="عرض">${ico('eye')}</button>${d.can_manage ? `<button class="sqb" data-xl="${r.id}" title="حذف">${ico('trash')}</button>` : ''}`,
  onActs: (root, d, reload) => {
    root.querySelectorAll('[data-lt],[data-dl]').forEach((b) => (b.onclick = () => hdShowLetter(b.dataset.lt || b.dataset.dl)));
    root.querySelectorAll('[data-xl]').forEach((b) => (b.onclick = () => { if (confirm('حذف الخطاب ده؟')) run(b, async () => { await api('/doc-letters/' + b.dataset.xl, 'DELETE'); toast('تم الحذف'); reload(); }); }));
  },
});
// يملا قايمة فلتر (بتتحمل من الـ API) بعد ما توصل البيانات
function fillSel(k, opts, cur) {
  const el = document.querySelector(`[data-f="${k}"]`); if (!el || el.options.length > 1) return;
  el.insertAdjacentHTML('beforeend', opts.map(([a, b]) => `<option value="${esc(a)}" ${String(cur) === String(a) ? 'selected' : ''}>${esc(b)}</option>`).join(''));
}

/* ---------- القوالب ---------- */
PAGES.hd_templates = async (view) => {
  view.innerHTML = `${hdTabs('hd_templates')}<div id="tplbody"></div>`;
  bindTabs(view, (t) => go(t));
  await api('/doc-requests?status=none').catch(() => 0); // بيزرع القوالب الافتراضية أول مرة
  const sp = simpleSpec('doc_template', 'قالب خطاب جديد', [
    { k: 'language', l: 'اللغة', t: 'select', o: Object.entries(HD_LANG) },
    { k: 'body', l: 'نص الخطاب', t: 'textarea', rows: 10, full: true, req: true, help: 'المتغيرات: {{name}} الاسم · {{job_title}} المسمى · {{department}} القسم · {{hire_date}} تاريخ التعيين · {{company}} الشركة · {{destination}} الوجهة · {{date}} تاريخ الإصدار' }]);
  sp.cols = sp.cols.filter((c) => c[0] !== 'نص الخطاب');
  await catalog($('#tplbody', view), sp);
};
