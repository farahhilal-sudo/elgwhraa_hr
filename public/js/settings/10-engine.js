'use strict';
/* settings/10-engine.js — محرك القوائم (catalog) وحقول النماذج والقوائم البسيطة (SIMPLE) */

/* --- حقول النماذج --- */
function fieldHtml(f, v) {
  const val = v ?? f.d ?? '';
  const cls = `f${f.full ? ' full' : ''}`;
  if (f.t === 'select') return `<label class="${cls}">${f.l}<select name="${f.k}">${f.o.map(([a, b]) => `<option value="${esc(a)}" ${String(a) === String(val) ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>`;
  if (f.t === 'multi') { const on = new Set(String(val || '').split(',').filter(Boolean)); return `<div class="full"><div class="muted small" style="margin-bottom:6px;font-weight:600">${f.l}</div><div class="row mchk">${f.o.map(([a, b]) => `<label class="perm"><input type="checkbox" data-m="${f.k}" value="${esc(a)}" ${on.has(String(a)) ? 'checked' : ''}>${esc(b)}</label>`).join('')}</div></div>`; }
  if (f.t === 'check') return `<label class="perm full"><input type="checkbox" name="${f.k}" ${[true, 1, '1', 'true'].includes(val) ? 'checked' : ''}>${f.l}</label>`;
  return `<label class="${cls}">${f.l}<input name="${f.k}" type="${f.t || 'text'}" value="${esc(val)}" ${f.req ? 'required' : ''} ${f.attrs || ''}>${f.help ? `<span class="muted small" style="font-weight:400">${f.help}</span>` : ''}</label>`;
}
function readForm(f, fields) {
  const b = {};
  for (const x of fields) {
    if (x.t === 'multi') { b[x.k] = [...f.querySelectorAll(`[data-m="${x.k}"]:checked`)].map((i) => i.value).join(','); continue; }
    const el = f.elements[x.k];
    if (!el) continue;
    b[x.k] = x.t === 'check' ? el.checked : (x.t === 'number' && el.value !== '' ? Number(el.value) : el.value);
  }
  return b;
}
const showVal = (f, v) => {
  if (v === undefined || v === null || v === '') return '—';
  if (f.t === 'select') return (f.o.find((o) => String(o[0]) === String(v)) || [0, v])[1];
  if (f.t === 'check') return v === true || v === 'true' ? '✓' : '—';
  if (f.t === 'multi') return `${String(v).split(',').filter(Boolean).length} عضو`;
  return v;
};

/* --- محرك القوائم (بحث + تابات + شرائح + ترقيم + نموذج) --- */
async function catalog(box, sp) {
  const PS = 10;
  const st = { tab: sp.tabs[0][0], chip: sp.chips ? sp.chips[0][0] : '', q: '', sel: '', page: 1, open: {}, tpl: '' };
  let items = [], tpls = [];
  const getFields = () => [sp.nameField || { k: 'name', l: sp.nameLabel || 'الاسم', req: true, full: true }, ...(typeof sp.fields === 'function' ? sp.fields() : sp.fields), ...(sp.noStatus ? [] : [{ k: 'active', l: 'الحالة', t: 'select', o: sp.statusOpts || [['1', 'نشط'], ['0', 'غير نشط']] }])];
  const reload = async () => { items = await sp.load(); draw(); };
  const filtered = () => {
    const tp = (sp.tabs.find((x) => x[0] === st.tab) || sp.tabs[0])[2];
    const cp = sp.chips ? (sp.chips.find((x) => x[0] === st.chip) || sp.chips[0])[2] : null;
    const q = st.q.trim().toLowerCase();
    return items.filter((it) => tp(it) && (!cp || cp(it)) && (!st.sel || sp.sel.pred(it, st.sel)) && (!q || sp.text(it).toLowerCase().includes(q)));
  };
  const actions = (it) => (sp.rowActs ? sp.rowActs(it) : `<div class="racts">${sp.extra ? sp.extra(it) : ''}<button class="sqb" data-a="edit" data-id="${it.id}" title="تعديل">${ico('edit')}</button><button class="sqb" data-a="del" data-id="${it.id}" title="حذف">${ico('trash')}</button></div>`);
  const doAct = (a, it, el) => {
    if (a === 'edit') openForm(it);
    else if (a === 'del') { if (confirm(typeof sp.delMsg === 'function' ? sp.delMsg(it) : (sp.delMsg || 'حذف العنصر ده؟'))) run(el, async () => { await sp.remove(it); toast('تم الحذف'); reload(); }); }
    else if (sp.act) run(el, async () => { await sp.act(a, it, reload); });
  };
  const closeMenu = () => document.querySelectorAll('.mmenu').forEach((m) => m.remove());
  const tdraw = () => {
    const rows = filtered(), pages = Math.max(1, Math.ceil(rows.length / PS));
    st.page = Math.min(st.page, pages);
    const from = (st.page - 1) * PS, part = rows.slice(from, from + PS);
    const rowHtml = (it) => {
      const open = sp.expand && st.open[it.id];
      return `<tr>${sp.cols.map((c, ci) => `<td>${ci === 0 && sp.expand ? `<div class="xcell">${c[1](it)}<button class="xbtn ${open ? 'on' : ''}" data-x="${it.id}" aria-label="تفاصيل">${ico('chev')}</button></div>` : c[1](it)}</td>`).join('')}<td class="actcol">${actions(it)}</td></tr>${open ? `<tr class="xrow"><td colspan="${sp.cols.length + 1}">${sp.expand(it)}</td></tr>` : ''}`;
    };
    $('#stab', box).innerHTML = `<div class="tablewrap st"><table><thead><tr>${sp.cols.map((c) => `<th>${c[0]}</th>`).join('')}<th class="actcol">${sp.actHead || ''}</th></tr></thead>
      <tbody>${part.map(rowHtml).join('') || `<tr><td colspan="${sp.cols.length + 1}" class="empty">لا توجد نتائج</td></tr>`}</tbody></table></div>
      <div class="pager"><button class="pg" data-pg="${st.page - 1}" ${st.page <= 1 ? 'disabled' : ''}>${ico('chev', 'rot90')}</button>
        ${Array.from({ length: pages }, (_, i) => `<button class="pg ${i + 1 === st.page ? 'on' : ''}" data-pg="${i + 1}">${i + 1}</button>`).join('')}
        <button class="pg" data-pg="${st.page + 1}" ${st.page >= pages ? 'disabled' : ''}>${ico('chev', 'rotm90')}</button>
        <span class="muted small">${rows.length ? `عرض ${from + 1} إلى ${from + part.length} من ${rows.length} إدخالات` : 'لا توجد إدخالات'}</span></div>`;
    box.querySelectorAll('[data-pg]').forEach((b) => (b.onclick = () => { st.page = Number(b.dataset.pg); tdraw(); }));
    box.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => doAct(b.dataset.a, items.find((x) => x.id == b.dataset.id), b)));
    box.querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => { st.open[b.dataset.x] = !st.open[b.dataset.x]; tdraw(); }));
    box.querySelectorAll('[data-more]').forEach((b) => (b.onclick = (e) => {
      e.stopPropagation(); closeMenu();
      const it = items.find((x) => x.id == b.dataset.more), r = b.getBoundingClientRect();
      const m = document.createElement('div');
      m.className = 'mmenu';
      m.innerHTML = sp.more(it).map(([k, l, dng]) => `<button data-k="${k}" class="${dng ? 'dng' : ''}">${l}</button>`).join('');
      document.body.appendChild(m);
      m.style.top = `${Math.max(8, Math.min(r.bottom + 4, innerHeight - m.offsetHeight - 8))}px`;
      m.style.left = `${Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8))}px`;
      m.querySelectorAll('button').forEach((x) => (x.onclick = () => { closeMenu(); doAct(x.dataset.k, it, b); }));
      setTimeout(() => document.addEventListener('click', closeMenu, { once: true }));
    }));
  };
  const tplRow = () => `<div class="tplrow"><select id="tsel" class="fsel tsel"><option value="">حدد القالب</option>${tpls.map((t) => `<option value="${t.id}" ${String(t.id) === String(st.tpl) ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
    <button class="btn alt sm" id="tsv2">حفظ كنموذج</button>${st.tpl ? `<button class="sqb" id="tdel2" title="حذف القالب">${ico('trash')}</button>` : ''}</div>`;
  const draw = () => {
    const seg = (arr, key, attr, base) => `<div class="seg">${sp.chips && arr === sp.chips && sp.chipLabel !== '' ? `<span class="seglbl">${sp.chipLabel || 'النوع'}</span>` : ''}${arr.map(([k, l, p]) => `<button data-${attr}="${k}" class="${k === st[key] ? 'on' : ''}">${l}${sp.counts ? `<i class="n">${(base || items).filter(p).length}</i>` : ''}</button>`).join('')}</div>`;
    const tp = (sp.tabs.find((x) => x[0] === st.tab) || sp.tabs[0])[2];
    const segT = sp.tabs.length > 1 ? seg(sp.tabs, 'tab', 'tb') : '', segC = sp.chips ? seg(sp.chips, 'chip', 'cp', items.filter(tp)) : '';
    $('#sfil', box).innerHTML = `${sp.tpl ? tplRow() : ''}${sp.chipsFirst ? segC + segT : segT + segC}
      <label class="fs">${ico('search')}<input id="sq" placeholder="${sp.searchPh || 'بحث'}" value="${esc(st.q)}" autocomplete="off"></label>
      ${sp.sel ? `<select id="ssel" class="fsel"><option value="">${sp.sel.ph || 'الكل'}</option>${sp.sel.opts.map(([v, l]) => `<option value="${esc(v)}" ${v === st.sel ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}
      <button class="link rs" id="srs">${ico('filter')} إعادة تعيين المرشحات</button><span class="grow"></span>${sp.extraBtn || ''}
      <button class="btn sm" id="snew">${ico('plus')} ${sp.newLabel}</button>`;
    box.querySelectorAll('[data-tb]').forEach((b) => (b.onclick = () => { st.tab = b.dataset.tb; st.page = 1; draw(); }));
    box.querySelectorAll('[data-cp]').forEach((b) => (b.onclick = () => { st.chip = b.dataset.cp; st.page = 1; draw(); }));
    $('#sq', box).oninput = (e) => { st.q = e.target.value; st.page = 1; tdraw(); };
    if ($('#ssel', box)) $('#ssel', box).onchange = (e) => { st.sel = e.target.value; st.page = 1; tdraw(); };
    $('#srs', box).onclick = () => { Object.assign(st, { tab: sp.tabs[0][0], chip: sp.chips ? sp.chips[0][0] : '', q: '', sel: '', page: 1, tpl: '' }); draw(); };
    $('#snew', box).onclick = () => openForm(null);
    if (sp.bindExtra) sp.bindExtra(box, reload);
    if (sp.tpl) {
      $('#tsel', box).onchange = (e) => {
        st.tpl = e.target.value;
        const t = tpls.find((x) => String(x.id) === st.tpl);
        if (t) { try { const f = JSON.parse(t.filters || '{}'); Object.assign(st, { tab: f.tab || sp.tabs[0][0], chip: f.chip || (sp.chips ? sp.chips[0][0] : ''), q: f.q || '', sel: f.sel || '', page: 1 }); } catch { /* قالب تالف */ } }
        draw();
      };
      $('#tsv2', box).onclick = (e) => { const n = prompt('اسم النموذج'); if (!n) return; run(e.target, async () => { const r = await api('/config/' + sp.tpl, 'POST', { name: n, filters: JSON.stringify({ tab: st.tab, chip: st.chip, q: st.q, sel: st.sel }) }); tpls = await api('/config/' + sp.tpl); st.tpl = String(r.id); toast('تم حفظ النموذج'); draw(); }); };
      if ($('#tdel2', box)) $('#tdel2', box).onclick = (e) => { if (confirm('حذف النموذج ده؟')) run(e.target, async () => { await api(`/config/${sp.tpl}/${st.tpl}`, 'DELETE'); tpls = await api('/config/' + sp.tpl); st.tpl = ''; toast('تم حذف النموذج'); draw(); }); };
    }
    tdraw();
  };
  function openForm(it) {
    if (sp.form) return sp.form(it, reload);
    const fields = getFields();
    const vals = it ? { ...it, active: it.active ? '1' : '0' } : { active: '1' };
    const o = modal(`<h3>${it ? 'تعديل' : sp.newLabel}</h3><form class="form" id="cf">${fields.map((f) => fieldHtml(f, vals[f.k])).join('')}
      <div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">حفظ</button></div></form>`);
    const f = $('#cf', o);
    f.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', f), async () => {
      const b = readForm(f, fields);
      if (sp.pre) sp.pre(it, b);
      await sp.save(it, b);
      o.close(); toast('تم الحفظ'); reload();
    }); };
  }
  box.innerHTML = '<div class="sfil" id="sfil"></div><div id="stab"></div>';
  items = await sp.load();
  if (sp.tpl) tpls = await api('/config/' + sp.tpl).catch(() => []);
  draw();
}

/* قوائم الإعدادات البسيطة المخزنة في قاعدة البيانات (config_items) */
const cfgApi = (kind) => ({
  load: async () => api('/config/' + kind),
  save: (it, b) => api(it ? `/config/${kind}/${it.id}` : '/config/' + kind, it ? 'PUT' : 'POST', b),
  remove: (it) => api(`/config/${kind}/${it.id}`, 'DELETE'),
});
const statusBadge = (it) => `<span class="badge ${it.active ? 'b-ok' : ''}">${it.active ? 'نشط' : 'غير نشط'}</span>`;
function simpleSpec(kind, newLabel, fields) {
  return {
    kind, newLabel, ...cfgApi(kind), tabs: STATUS_TABS, fields,
    cols: [['الاسم', (it) => `<b>${esc(it.name)}</b>`], ...fields.map((f) => [f.l, (it) => esc(showVal(f, it[f.k]))]), ['الحالة', statusBadge]],
    text: (it) => [it.name, ...fields.map((f) => it[f.k])].join(' '),
  };
}
const DESC = { k: 'description', l: 'الوصف', full: true };
const KIND_OPTS = [['fixed', 'مبلغ ثابت'], ['percent', 'نسبة من الأساسي']];
const SIMPLE = {
  department: ['قسم جديد', [DESC]],
  grade: ['درجة جديدة', [{ k: 'level', l: 'المستوى', t: 'number', attrs: 'min="1"' }, DESC]],
  position: ['منصب جديد', [DESC]],
  access_level: ['مستوى وصول جديد', [DESC]],
  custom_field: ['حقل مخصص جديد', [{ k: 'type', l: 'نوع الحقل', t: 'select', o: [['text', 'نص'], ['number', 'رقم'], ['date', 'تاريخ'], ['list', 'قائمة']] }, { k: 'applies', l: 'يظهر في', t: 'select', o: [['employee', 'بيانات الموظف'], ['office', 'المكاتب'], ['department', 'الأقسام']] }, { k: 'required', l: 'حقل إلزامي', t: 'check' }]],
  announcement: ['إعلان جديد', [{ k: 'text', l: 'نص الإعلان', full: true }, { k: 'from', l: 'من', t: 'date' }, { k: 'to', l: 'إلى', t: 'date' }]],
  leave_profile: ['ملف إجازة جديد', [{ k: 'annual', l: 'الرصيد السنوي (يوم)', t: 'number', d: 21, attrs: 'min="0"' }, { k: 'carry', l: 'ترحيل الرصيد للسنة التالية', t: 'check' }]],
  holiday: ['عطلة رسمية جديدة', [{ k: 'date', l: 'من تاريخ', t: 'date', req: true }, { k: 'to', l: 'إلى تاريخ', t: 'date' }]],
  compensation_rule: ['قاعدة تعويض جديدة', [DESC]],
  holiday_limit: ['قاعدة جديدة', [{ k: 'max', l: 'أقصى عدد أيام متتالية', t: 'number', attrs: 'min="1"' }, DESC]],
  allowance: ['بدل جديد', [{ k: 'kind', l: 'النوع', t: 'select', o: KIND_OPTS }, { k: 'amount', l: 'القيمة', t: 'number', attrs: 'min="0" step="0.01"' }]],
  deduction: ['خصم جديد', [{ k: 'kind', l: 'النوع', t: 'select', o: KIND_OPTS }, { k: 'amount', l: 'القيمة', t: 'number', attrs: 'min="0" step="0.01"' }]],
  expense_category: ['فئة مصروف جديدة', [DESC]],
  payroll_lieu: ['قاعدة جديدة', [DESC]],
  payslip_display: ['إعداد جديد', [DESC]],
  document: ['مستند جديد', [{ k: 'required', l: 'مطلوب من كل موظف', t: 'check' }, DESC]],
  automation_rule: ['قاعدة أتمتة جديدة', [{ k: 'trigger', l: 'الحدث', full: true }, { k: 'action', l: 'الإجراء', full: true }]],
  override_rule: ['قاعدة جديدة', [DESC]],
};
