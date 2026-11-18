'use strict';
/* pages/tasks.js — المهام (كانبان: للتنفيذ / قيد التنفيذ / مكتمل) وقواعد التعيين والمشاريع وتقرير المشاريع.
   لو موظف اتأخر في تسليم مهمة بيتولّد تلقائيًا طلب جزاء للمدير (من الطلبات ← وارد ← جزاء) يوافق عليه أو يرفضه. */
Object.assign(ICONS, {
  tk_list: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  tk_rules: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  tk_proj: '<path d="M4 7h16v12H4zM9 7V5h6v2"/>', tk_rep: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  tk_flag: '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>', tk_cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
});
const TK_PRI = { low: ['منخفض', '#16a34a'], medium: ['متوسط', '#0ea5e9'], high: ['مرتفع', '#f59e0b'], urgent: ['عاجل', '#ef4444'] };
const TK_COL = [['todo', 'للتنفيذ', '#0ea5e9'], ['doing', 'قيد التنفيذ', '#f59e0b'], ['done', 'مكتمل', '#16a34a']];
const TK_UNIT = { minutes: 'دقيقة', hours: 'ساعة', days: 'يوم' };
const tkFlag = (p, sz = 16) => `<svg class="tkflag" viewBox="0 0 24 24" width="${sz}" height="${sz}" fill="${TK_PRI[p][1]}" stroke="${TK_PRI[p][1]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M5 21V4M5 4h12l-2 4 2 4H5"/></svg>`;
const tkTabs = (cur) => tabsBar([['tasks', 'المهام', 'tk_list'], has('employees.view') && ['task_rules', 'قواعد التعيين', 'tk_rules']].filter(Boolean), cur);
const tkProjTabs = (cur) => tabsBar([['projects', 'المشاريع', 'tk_list'], ['project_report', 'تقرير المشاريع', 'tk_rep']], cur);
// وصف المهمة HTML من محرر بسيط: بنسمح بوسوم التنسيق بس ونشيل أي خصائص (حماية من XSS)
const TK_OK = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'HR', 'P', 'DIV', 'BR', 'SPAN']);
function tkClean(html) {
  const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
  const walk = (n) => {
    [...n.childNodes].forEach((c) => {
      if (c.nodeType === 3) return;
      if (c.nodeType !== 1 || !TK_OK.has(c.tagName)) { if (c.nodeType === 1 && /^(SCRIPT|STYLE)$/.test(c.tagName)) c.remove(); else { walk(c); c.replaceWith(...c.childNodes); } return; }
      const al = (c.getAttribute('style') || '').match(/text-align:\s*(left|right|center|justify)/);
      [...c.attributes].forEach((a) => c.removeAttribute(a.name));
      if (al) c.setAttribute('style', `text-align:${al[1]}`);
      walk(c);
    });
  };
  walk(doc.body);
  return doc.body.innerHTML.slice(0, 20000);
}
const tkText = (html) => { const d = document.createElement('div'); d.innerHTML = tkClean(html); return (d.textContent || '').trim(); };
const tkDmy = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');
const tkDay = (d) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }) : '');

/* ---------------- محرر الوصف ---------------- */
const TK_TB = [['bold', 'B', 'عريض', 'b'], ['italic', 'I', 'مائل', 'i'], ['underline', 'U', 'تحته خط', 'u'], ['strikeThrough', 'S', 'يتوسطه خط', 's'], ['h1', 'H1'], ['h2', 'H2'], ['h3', 'H3'],
  ['insertUnorderedList', '•', 'قائمة'], ['insertOrderedList', '1.', 'قائمة مرقمة'], ['quote', '❝', 'اقتباس'], ['insertHorizontalRule', '—', 'خط فاصل'], ['justifyRight', '☰', 'يمين'], ['justifyCenter', '≡', 'توسيط'], ['justifyLeft', '☰', 'يسار']];
const tkEditor = (html) => `<div class="tked"><div class="tkbar">${TK_TB.map(([c, l, t]) => `<button type="button" data-c="${c}" title="${t || l}" class="${/^[BIUS]$/.test(l) ? 'ff-' + l : ''}">${l}</button>`).join('')}</div><div class="tkbody" contenteditable="true" dir="rtl">${tkClean(html)}</div></div>`;
function tkBindEditor(root) {
  const body = $('.tkbody', root);
  root.querySelectorAll('.tkbar button').forEach((b) => {
    b.onmousedown = (e) => e.preventDefault();
    b.onclick = () => {
      body.focus(); const c = b.dataset.c;
      if (/^h[1-3]$/.test(c)) document.execCommand('formatBlock', false, document.queryCommandValue('formatBlock').toLowerCase() === c ? 'div' : c);
      else if (c === 'quote') document.execCommand('formatBlock', false, 'blockquote'); else document.execCommand(c);
    };
  });
  return () => tkClean(body.innerHTML);
}

/* ---------------- نافذة مهمة جديدة / تعديل ---------------- */
function tkForm(data, t, done) {
  const edit = !!t, v = t || { priority: 'medium', est_unit: 'hours' };
  const o = modal(`<div class="tkmh"><h3>${edit ? 'تعديل المهمة' : 'مهمة جديدة'}</h3><button class="sqb" data-close title="إغلاق">✕</button></div>
    <form class="tkform" id="tkf"><div class="tkgrid">
      <label class="f">العنوان<input name="title" maxlength="200" required placeholder="العنوان" value="${esc(v.title || '')}"></label>
      <label class="f">تعيين ل<select name="assignee_id"><option value="">تحديد خيار</option>${data.employees.map((e) => `<option value="${e.id}" ${v.assignee_id === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>
      <div class="f full">الأولوية<div class="tkpri">${Object.entries(TK_PRI).map(([k, p]) => `<label class="tkp"><input type="radio" name="priority" value="${k}" ${v.priority === k ? 'checked' : ''}><i></i>${tkFlag(k)}<span>${p[0]}</span></label>`).join('')}</div></div>
      <div class="f">الوقت المقدر<div class="tkest"><input type="number" name="est_value" min="0" step="any" placeholder="القيمة" value="${v.est_value || ''}"><select name="est_unit">${Object.entries(TK_UNIT).map(([k, l]) => `<option value="${k}" ${v.est_unit === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <label class="f">تاريخ الاستحقاق<input type="date" name="due_date" value="${v.due_date || ''}"></label>
      <label class="f full">المشروع<select name="project_id"><option value="">بدون مشروع</option>${data.projects.map((p) => `<option value="${p.id}" ${v.project_id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <div class="f full">الوصف${tkEditor(v.description)}</div></div>
      <div class="tkmf"><button class="btn" id="tksave">حفظ</button>${edit ? '<button type="button" class="btn alt bad" id="tkdel">حذف المهمة</button>' : ''}<span class="grow"></span>
      <span class="muted small">${edit ? '' : 'لو سبتي الأولوية أو التاريخ فاضيين، بتتطبق قواعد التعيين.'}</span></div></form>`);
  o.querySelector('.modal').classList.add('tkmodal');
  const getHtml = tkBindEditor(o), f = $('#tkf', o);
  f.onsubmit = (e) => {
    e.preventDefault();
    run($('#tksave', o), async () => {
      const b = { title: f.title.value, assignee_id: f.assignee_id.value, priority: f.priority.value, est_value: f.est_value.value, est_unit: f.est_unit.value, due_date: f.due_date.value, project_id: f.project_id.value, description: getHtml() };
      await api(edit ? '/tasks/' + t.id : '/tasks', edit ? 'PUT' : 'POST', b);
      o.close(); toast('تم الحفظ'); done();
    });
  };
  if (edit) $('#tkdel', o).onclick = () => { if (confirm('حذف المهمة دي؟')) run($('#tkdel', o), async () => { await api('/tasks/' + t.id, 'DELETE'); o.close(); toast('تم الحذف'); done(); }); };
}

/* ---------------- المهام ---------------- */
PAGES.tasks = async (view) => {
  const F = (S.tkf = S.tkf || { q: '', user: '', from: '', to: '', status: '', pri: '', late: false });
  let data;
  const mgr = has('employees.view');
  view.innerHTML = `${tkTabs('tasks')}<div class="tkbar2 lnbar">
    <div class="lnrow"><label class="dfi grow"><input id="tq" placeholder="بحث" value="${esc(F.q)}"></label>
      <label class="dfi dfd"><input type="date" id="tf" value="${F.from}" title="التسليم من"></label><label class="dfi dfd"><input type="date" id="tt" value="${F.to}" title="التسليم إلى"></label>
      ${mgr ? '<label class="dfi"><select id="tu"><option value="">اختر موظفين</option></select></label>' : ''}
      <label class="dfi"><select id="ts"><option value="">اختر الحالة</option>${TK_COL.map((c) => `<option value="${c[0]}" ${F.status === c[0] ? 'selected' : ''}>${c[1]}</option>`).join('')}</select></label></div>
    <div class="lnrow"><label class="dfi grow"><select id="tp"><option value="">اختر الأولوية</option>${Object.entries(TK_PRI).map(([k, p]) => `<option value="${k}" ${F.pri === k ? 'selected' : ''}>${p[0]}</option>`).join('')}</select></label>
      <button class="btn alt" id="tr">${ico('filter')} إعادة تعيين المرشحات</button><button class="btn" id="tadd" hidden>+ مهمة جديدة</button></div>
    <label class="tkswitch"><input type="checkbox" id="tl" ${F.late ? 'checked' : ''}><i></i><span>عرض المهام المتأخرة فقط</span></label></div>
    <div class="tkboard" id="tkb"></div>`;
  bindTabs(view, (t) => go(t));
  const draw = () => {
    $('#tkb', view).innerHTML = TK_COL.map(([k, l, c]) => {
      const list = data.rows.filter((t) => t.status === k);
      return `<section class="tkcol" data-col="${k}"><header><i style="background:${c}"></i><span>${l}</span><em>${list.length}</em></header><div class="tkline" style="background:${c}"></div>
        <div class="tkcards">${list.map((t) => card(t)).join('') || '<p class="tkempty">لا توجد مهام</p>'}</div></section>`;
    }).join('');
    view.querySelectorAll('.tkcard').forEach((el) => {
      const t = data.rows.find((x) => String(x.id) === el.dataset.id);
      el.onclick = (e) => { if (e.target.closest('select,button')) return; open(t); };
      el.ondragstart = (e) => { e.dataTransfer.setData('text/plain', el.dataset.id); el.classList.add('drag'); };
      el.ondragend = () => el.classList.remove('drag');
    });
    view.querySelectorAll('.tkcol').forEach((col) => {
      col.ondragover = (e) => { e.preventDefault(); col.classList.add('over'); };
      col.ondragleave = () => col.classList.remove('over');
      col.ondrop = (e) => { e.preventDefault(); col.classList.remove('over'); const t = data.rows.find((x) => String(x.id) === e.dataTransfer.getData('text/plain')); if (t && t.status !== col.dataset.col) move(t, col.dataset.col); };
    });
    view.querySelectorAll('.tkst').forEach((s) => (s.onchange = () => move(data.rows.find((x) => String(x.id) === s.dataset.id), s.value)));
    view.querySelectorAll('[data-tdel]').forEach((b) => (b.onclick = () => { const t = data.rows.find((x) => String(x.id) === b.dataset.tdel); if (confirm('حذف المهمة دي؟')) run(b, async () => { await api('/tasks/' + t.id, 'DELETE'); toast('تم الحذف'); load(); }); }));
    view.querySelectorAll('[data-av]').forEach((a) => a.dataset.uav && loadAvatar(a.dataset.uav).then((u) => { if (u) a.style.backgroundImage = `url(${u})`, a.textContent = ''; }));
  };
  const card = (t) => {
    const canMove = data.can_manage || t.assignee_id === S.me.user.id, p = TK_PRI[t.priority] || TK_PRI.medium;
    const desc = tkText(t.description);
    return `<article class="tkcard" data-id="${t.id}" ${canMove ? 'draggable="true"' : ''}>
      <div class="tkct"><span class="tkpb" style="color:${p[1]};background:${p[1]}1f">${tkFlag(t.priority, 15)}${p[0]}</span>${data.can_manage ? `<button class="sqb" data-tdel="${t.id}" title="حذف">${ico('trash')}</button>` : ''}</div>
      <h4>${esc(t.title)}</h4>${desc ? `<p class="tkd">${esc(desc.slice(0, 110))}</p>` : ''}
      <p class="tkby">أنشئ بواسطة: ${esc(t.created_by_name || '—')} | ${esc((t.created_at || '').slice(0, 10))}${t.project_name ? ` · ${esc(t.project_name)}` : ''}</p>
      <div class="tkmeta">${t.est_value ? `<span>${ico('clock')}${t.est_value} ${TK_UNIT[t.est_unit] || ''}</span>` : ''}${t.due_date ? `<span class="${t.overdue ? 'neg' : ''}">${ico('calendar')}${tkDay(t.due_date)}</span>` : ''}</div>
      <div class="tkfoot">${canMove ? `<select class="tkst st-${t.status}" data-id="${t.id}">${TK_COL.map((c) => `<option value="${c[0]}" ${t.status === c[0] ? 'selected' : ''}>${c[1]}</option>`).join('')}</select>` : `<span class="tkst st-${t.status}">${(TK_COL.find((c) => c[0] === t.status) || [])[1]}</span>`}
        ${t.late ? `<span class="tklate">${t.status === 'done' ? 'سُلّمت متأخرة' : 'متأخر'}</span>` : ''}${t.penalty_req_id ? '<span class="tkpen" title="اتولّد طلب جزاء للمدير">جزاء</span>' : ''}<span class="grow"></span>
        ${t.assignee_name ? `<span class="tkav" title="${esc(t.assignee_name)}" data-av ${t.assignee_id ? `data-uav="${t.assignee_id}"` : ''}>${esc(initials(t.assignee_name))}</span>` : '<span class="tkav none" title="غير معيّنة">؟</span>'}</div></article>`;
  };
  const move = (t, status) => run(null, async () => { await api('/tasks/' + t.id, 'PUT', { status }); await load(); if (status === 'done' && t.due_date && t.due_date < data.today) toast('اتسلّمت متأخرة، اتبعت طلب جزاء للمدير'); });
  const open = (t) => {
    if (data.can_manage) return tkForm(data, t, load);
    const p = TK_PRI[t.priority];
    const o = modal(`<div class="tkmh"><h3>${esc(t.title)}</h3><button class="sqb" data-close>✕</button></div>
      <p class="muted small">${tkFlag(t.priority, 14)} ${p[0]} · التسليم ${tkDmy(t.due_date) || '—'} · ${esc(t.assignee_name || '')}</p><div class="tkview">${tkClean(t.description) || '<span class="muted">بدون وصف</span>'}</div>
      <div class="actions"><button class="btn alt" data-close>إغلاق</button></div>`);
    o.querySelector('.modal').classList.add('tkmodal');
  };
  const load = async () => {
    const qs = new URLSearchParams({ q: F.q, user_id: F.user, from: F.from, to: F.to, status: F.status, priority: F.pri, overdue: F.late ? '1' : '' });
    data = await api('/tasks?' + qs);
    if (mgr) { const u = $('#tu', view); if (u.options.length < 2) u.innerHTML += data.employees.map((e) => `<option value="${e.id}" ${String(F.user) === String(e.id) ? 'selected' : ''}>${esc(e.name)}</option>`).join(''); }
    $('#tadd', view).hidden = !data.can_manage;
    draw();
  };
  const bind = (id, key, ev = 'onchange') => ($('#' + id, view)[ev] = (e) => { F[key] = e.target.value; load(); });
  bind('tf', 'from'); bind('tt', 'to'); bind('ts', 'status'); bind('tp', 'pri'); if (mgr) bind('tu', 'user');
  let tm; $('#tq', view).oninput = (e) => { F.q = e.target.value; clearTimeout(tm); tm = setTimeout(load, 300); };
  $('#tl', view).onchange = (e) => { F.late = e.target.checked; load(); };
  $('#tr', view).onclick = () => { S.tkf = null; PAGES.tasks(view); };
  $('#tadd', view).onclick = () => tkForm(data, null, load);
  await load();
};

/* ---------------- قواعد التعيين + إعدادات جزاء التأخير ---------------- */
PAGES.task_rules = async (view) => {
  view.innerHTML = `${tkTabs('task_rules')}<div class="card tkpen-card" id="tkpc"></div><div id="trbody"></div>`;
  bindTabs(view, (t) => go(t));
  const st = await api('/tasks/settings'), can = has('settings.manage');
  $('#tkpc', view).innerHTML = `<h3>جزاء التأخير في تسليم المهام</h3>
    <p class="muted small" style="margin:4px 0 12px">لو موظف اتأخر في تسليم مهمة بعد تاريخ الاستحقاق، النظام بيبعت للمدير طلب جزاء تلقائي (من الطلبات ← وارد ← جزاء) يوافق عليه أو يرفضه. لو وافق بيتسجل جزاء في مرتب الشهر.</p>
    <div class="lnrow"><label class="tkswitch"><input type="checkbox" id="pon" ${st.on ? 'checked' : ''} ${can ? '' : 'disabled'}><i></i><span>تفعيل الجزاء التلقائي</span></label>
      <label class="dfi" style="min-width:210px"><span class="muted small" style="white-space:nowrap">قيمة الجزاء (يوم من الأجر)</span><input type="number" id="pdays" min="0" max="30" step="0.25" value="${st.days}" ${can ? '' : 'disabled'} style="max-width:70px"></label>
      ${can ? '<button class="btn" id="psave">حفظ</button>' : ''}</div>`;
  if (can) $('#psave', view).onclick = (e) => run(e.currentTarget, async () => { await api('/tasks/settings', 'PUT', { on: $('#pon', view).checked, days: $('#pdays', view).value }); toast('تم الحفظ'); });
  await catalog($('#trbody', view), simpleSpec('task_assign_rule', 'قاعدة تعيين جديدة', [DESC,
    { k: 'applies', l: 'تنطبق على', t: 'select', o: [['all', 'كل الموظفين'], ['dept', 'قسم محدد']] }, { k: 'department', l: 'القسم (لو قسم محدد)' },
    { k: 'priority', l: 'الأولوية الافتراضية', t: 'select', o: Object.entries(TK_PRI).map(([k, p]) => [k, p[0]]) }, { k: 'due_days', l: 'مدة التسليم الافتراضية (أيام)', t: 'number', attrs: 'min="1" max="365"' }]));
};

/* ---------------- المشاريع ---------------- */
const PJ_SCOPE = { employee: 'الموظفون', department: 'الأقسام', office: 'المكاتب', position: 'المناصب' };
function pjForm(data, p, done) {
  const edit = !!p, v = p || { scope: 'employee', targets: [], active: 1 };
  let scope = v.scope, sel = new Set(v.targets || []);
  const o = modal(`<div class="tkmh"><h3>${edit ? 'تعديل المشروع' : 'مشروع جديد'}</h3><button class="sqb" data-close>✕</button></div>
    <form class="tkform" id="pjf"><label class="f">الاسم<input name="name" maxlength="120" required placeholder="الاسم" value="${esc(v.name || '')}"></label>
      <label class="f">الوصف<textarea name="description" rows="4" placeholder="وصف...">${esc(v.description || '')}</textarea></label>
      <div class="f">ينطبق على<div class="pjscope">${Object.entries(PJ_SCOPE).map(([k, l]) => `<label class="tkp"><input type="radio" name="scope" value="${k}" ${scope === k ? 'checked' : ''}><i></i><span>${l}</span></label>`).join('')}</div></div>
      <div class="pjsel"><label class="tkp"><input type="checkbox" id="pjall"><i class="sq"></i><span>حدد الكل</span></label><div class="msel"><button type="button" id="pjb" class="msb"></button><div class="mpanel" id="pjp" hidden></div></div></div>
      ${edit ? `<label class="tkswitch"><input type="checkbox" name="active" ${v.active ? 'checked' : ''}><i></i><span>نشط</span></label>` : ''}
      <div class="tkmf"><button class="btn" id="pjsave">حفظ</button>${edit ? '<button type="button" class="btn alt bad" id="pjdel">حذف</button>' : ''}</div></form>`);
  o.querySelector('.modal').classList.add('tkmodal', 'narrow');
  const f = $('#pjf', o), opts = () => data.options[scope] || [];
  const paint = () => {
    $('#pjb', o).innerHTML = `<span>${sel.size ? `${sel.size} محدد` : 'تحديد خيار'}</span>${ico('chev')}`;
    $('#pjp', o).innerHTML = opts().map((x) => `<label class="tkp"><input type="checkbox" value="${x.id}" ${sel.has(x.id) ? 'checked' : ''}><i class="sq"></i><span>${esc(x.name)}</span></label>`).join('') || '<p class="muted small" style="padding:8px">لا توجد خيارات</p>';
    $('#pjall', o).checked = opts().length > 0 && opts().every((x) => sel.has(x.id));
    $('#pjp', o).querySelectorAll('input').forEach((c) => (c.onchange = () => { c.checked ? sel.add(Number(c.value)) : sel.delete(Number(c.value)); paint(); $('#pjp', o).hidden = false; }));
  };
  f.querySelectorAll('[name=scope]').forEach((r) => (r.onchange = () => { scope = r.value; sel = new Set(); paint(); }));
  $('#pjb', o).onclick = () => { const p2 = $('#pjp', o); p2.hidden = !p2.hidden; };
  $('#pjall', o).onchange = (e) => { sel = e.target.checked ? new Set(opts().map((x) => x.id)) : new Set(); paint(); };
  paint();
  f.onsubmit = (e) => {
    e.preventDefault();
    run($('#pjsave', o), async () => {
      const b = { name: f.name.value, description: f.description.value, scope, target_ids: [...sel] };
      if (edit) b.active = f.active.checked;
      await api(edit ? '/projects/' + p.id : '/projects', edit ? 'PUT' : 'POST', b); o.close(); toast('تم الحفظ'); done();
    });
  };
  if (edit) $('#pjdel', o).onclick = () => { if (confirm('حذف المشروع؟ المهام المرتبطة بيه هتفضل من غير مشروع.')) run($('#pjdel', o), async () => { await api('/projects/' + p.id, 'DELETE'); o.close(); toast('تم الحذف'); done(); }); };
}
PAGES.projects = async (view) => {
  const F = (S.pjf = S.pjf || { q: '', scope: '', active: '1' }), can = has('employees.manage');
  view.innerHTML = `${tkProjTabs('projects')}<div class="lnbar"><div class="lnrow"><label class="dfi grow"><input id="pq" placeholder="بحث" value="${esc(F.q)}"></label>
    <label class="dfi"><select id="ps"><option value="">ينطبق على</option>${Object.entries(PJ_SCOPE).map(([k, l]) => `<option value="${k}" ${F.scope === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="tkswitch"><input type="checkbox" id="pa" ${F.active === '1' ? 'checked' : ''}><i></i><span>نشط</span></label>
    <button class="btn alt" id="pr">${ico('filter')} إعادة تعيين المرشحات</button>${can ? '<button class="btn" id="padd">+ مشروع جديد</button>' : ''}</div></div><div id="pjtab"></div>`;
  bindTabs(view, (t) => go(t));
  let data;
  const load = async () => {
    data = await api('/projects?' + new URLSearchParams({ q: F.q, scope: F.scope, active: F.active }));
    const names = (p) => (p.targets || []).map((id) => ((data.options[p.scope] || []).find((x) => x.id === id) || {}).name).filter(Boolean);
    $('#pjtab', view).innerHTML = `<div class="tablewrap"><table><thead><tr><th>الاسم</th><th>ينطبق على</th><th>الحالة</th><th>المهام</th><th></th></tr></thead><tbody>
      ${data.rows.map((p) => { const n = names(p); return `<tr><td><b>${esc(p.name)}</b>${p.description ? `<div class="muted small">${esc(p.description.slice(0, 80))}</div>` : ''}</td>
        <td>${PJ_SCOPE[p.scope]}${n.length ? `: ${esc(n.slice(0, 3).join('، '))}${n.length > 3 ? ` +${n.length - 3}` : ''}` : ' (الكل)'}</td><td><span class="badge ${p.active ? 'b-ok' : ''}">${p.active ? 'نشط' : 'غير نشط'}</span></td>
        <td>${p.done}/${p.total}</td><td class="lnact">${can ? `<button class="sqb" data-pe="${p.id}" title="تعديل">${ico('edit')}</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">لا توجد مشاريع</td></tr>'}</tbody></table></div>`;
    view.querySelectorAll('[data-pe]').forEach((b) => (b.onclick = () => pjForm(data, data.rows.find((x) => String(x.id) === b.dataset.pe), load)));
  };
  let tm; $('#pq', view).oninput = (e) => { F.q = e.target.value; clearTimeout(tm); tm = setTimeout(load, 300); };
  $('#ps', view).onchange = (e) => { F.scope = e.target.value; load(); };
  $('#pa', view).onchange = (e) => { F.active = e.target.checked ? '1' : ''; load(); };
  $('#pr', view).onclick = () => { S.pjf = null; PAGES.projects(view); };
  if (can) $('#padd', view).onclick = () => pjForm(data, null, load);
  await load();
};
PAGES.project_report = async (view) => {
  view.innerHTML = `${tkProjTabs('project_report')}<div id="prb"><div class="empty"><span class="spin"></span></div></div>`;
  bindTabs(view, (t) => go(t));
  const { rows } = await api('/projects/report');
  $('#prb', view).innerHTML = `<div class="tablewrap"><table><thead><tr><th>المشروع</th><th>الإجمالي</th><th>للتنفيذ</th><th>قيد التنفيذ</th><th>مكتمل</th><th>متأخر</th><th style="min-width:160px">الإنجاز</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td><b>${esc(r.name)}</b>${r.active ? '' : ' <span class="badge">غير نشط</span>'}</td><td>${r.total}</td><td>${r.todo}</td><td>${r.doing}</td><td>${r.done}</td><td class="${r.overdue ? 'neg' : ''}">${r.overdue}</td>
      <td><div class="pjbar"><i style="width:${r.progress}%"></i></div><span class="small muted">${r.progress}%</span></td></tr>`).join('') || '<tr><td colspan="7" class="empty">لا توجد مشاريع</td></tr>'}</tbody></table></div>`;
};
