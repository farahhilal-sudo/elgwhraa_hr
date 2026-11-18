'use strict';
/* pages/employees-tabs.js — تابات الموظفين: مجموعات العمل وفرق العمل والهيكل التنظيمي وسجل النقل والإيقاف (empPage) */

/* --- الموظفون (على شكل الشاشة المرجعية) --- */
const EMP_TABS = [
  ['employees', 'الموظفون', 'users'], ['workgroups', 'مجموعات العمل', 'clock'], ['teams', 'فرق العمل', 'users'], ['emp_procedures', 'إجراءات الموظفين', 'user'],
  ['emp_docs', 'مستندات الموظفين', 'file'], ['org_chart', 'الهيكل التنظيمي', 'grid'], ['transfers_log', 'سجل النقل', 'file'],
  ['title_changes', 'تغييرات المسمى الوظيفي', 'users'], ['suspension_log', 'سجل الإيقاف', 'file'], ['pending_suspensions', 'الإيقافات المعلقة', 'file'],
];
function empTabsHtml(cur, counts = {}) {
  const list = [EMP_TABS[0], ...(has('employees.manage') ? [['employees:pending', 'طلبات الحسابات', 'user'], ['employees:resets', 'استعادة كلمة المرور', 'lock']] : []), ...EMP_TABS.slice(1)];
  return `<div class="card setnav etabs"><div class="stabs" id="etabs">${list.map(([k, l, ic]) => `<button data-et="${k}" class="${k === cur ? 'on' : ''}">${ico(ic)}<span>${l}</span>${counts[k] ? `<em class="cnt">${counts[k]}</em>` : ''}</button>`).join('')}</div>
    <button class="tarrow" id="tarr" title="المزيد">${ico('chev', 'rotm90')}</button></div>`;
}
function bindEmpTabs(view) {
  view.querySelectorAll('[data-et]').forEach((b) => (b.onclick = () => { const [p, t] = b.dataset.et.split(':'); S.emptab = t || 'list'; go(p); }));
  const tb = $('#etabs', view);
  $('#tarr', view).onclick = () => tb.scrollBy({ left: -260, behavior: 'smooth' });
  const on = tb.querySelector('.on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
}

/* صفحات الموارد البشرية المبنية على قوائم (مجموعات، فرق، إجراءات، مستندات، نقل...) */
const empSel = (people) => ({ k: 'name', l: 'الموظف', t: 'select', o: people.map((u) => [u.name, u.name]), req: true, full: true });
function logSpec(kind, newLabel, nameField, fields, extra = {}) {
  return { ...simpleSpec(kind, newLabel, fields), nameField, noStatus: true, tabs: [['all', 'الكل', () => true]],
    cols: [[nameField.l, (it) => `<b>${esc(it.name)}</b>`], ...fields.map((f) => [f.l, (it) => esc(showVal(f, it[f.k]))])], ...extra };
}
function empSpecs(people) {
  const names = people.map((u) => [u.name, u.name]), nf = (l) => ({ k: 'name', l, req: true, full: true });
  const mem = { k: 'members', l: 'الأعضاء', t: 'multi', o: people.map((u) => [String(u.id), u.name]) };
  const date = (l = 'التاريخ') => ({ k: 'date', l, t: 'date', d: todayStr() });
  const notes = { k: 'notes', l: 'ملاحظات', full: true };
  const emp = (n) => people.find((u) => u.name === n);
  const putEmp = (n, body) => { const u = emp(n); if (!u) throw new Error('الموظف مش موجود'); return api('/employees/' + u.id, 'PUT', body); };
  const tc = logSpec('title_change', 'تغيير مسمى جديد', empSel(people), [{ k: 'old', l: 'المسمى السابق' }, { k: 'new', l: 'المسمى الجديد', req: true }, date()]);
  const ps = logSpec('pending_suspension', 'إيقاف معلّق جديد', empSel(people), [{ k: 'date', l: 'تاريخ الإيقاف', t: 'date', req: true }, { k: 'reason', l: 'السبب', full: true }]);
  return {
    work_group: logSpec('work_group', 'مجموعة عمل جديدة', nf('اسم المجموعة'), [DESC, mem]),
    team: logSpec('team', 'فريق جديد', nf('اسم الفريق'), [{ k: 'leader', l: 'قائد الفريق', t: 'select', o: [['', '—'], ...names] }, DESC, mem]),
    emp_procedure: logSpec('emp_procedure', 'إجراء جديد', empSel(people), [{ k: 'type', l: 'نوع الإجراء', t: 'select', o: [['promotion', 'ترقية'], ['raise', 'تعديل راتب'], ['warning', 'إنذار'], ['thanks', 'شكر وتقدير'], ['other', 'أخرى']] }, date(), notes]),
    emp_doc: logSpec('emp_doc', 'مستند جديد', empSel(people), [{ k: 'type', l: 'نوع المستند', t: 'select', o: [['id', 'بطاقة هوية'], ['contract', 'عقد عمل'], ['cert', 'شهادة'], ['license', 'رخصة'], ['other', 'أخرى']] }, { k: 'expires', l: 'تاريخ الانتهاء', t: 'date' }, notes]),
    transfer: logSpec('transfer', 'عملية نقل جديدة', empSel(people), [{ k: 'from', l: 'من' }, { k: 'to', l: 'إلى' }, date(), { k: 'reason', l: 'السبب', full: true }]),
    title_change: { ...tc, pre: (it, b) => { if (!b.old) b.old = (emp(b.name) || {}).job_title || ''; b.applied = it ? !!it.applied : false; },
      extra: (it) => (it.applied ? '<span class="badge b-ok">تم التطبيق</span>' : `<button class="vchip" data-a="apply" data-id="${it.id}">تطبيق على الموظف</button>`),
      act: async (a, it, reload) => { if (a !== 'apply') return; await putEmp(it.name, { job_title: it.new }); await tc.save(it, { name: it.name, old: it.old, new: it.new, date: it.date, applied: true }); toast('تم تحديث المسمى الوظيفي'); reload(); } },
    pending_suspension: { ...ps, extra: (it) => `<button class="vchip" data-a="exec" data-id="${it.id}">تنفيذ الإيقاف</button>`,
      act: async (a, it, reload) => { if (a !== 'exec' || !confirm('إيقاف حساب ' + it.name + ' الآن؟')) return; await putEmp(it.name, { active: false }); await ps.remove(it); toast('تم إيقاف الحساب'); reload(); } },
  };
}
const EMP_KIND = { workgroups: 'work_group', teams: 'team', emp_procedures: 'emp_procedure', emp_docs: 'emp_doc', transfers_log: 'transfer', title_changes: 'title_change', pending_suspensions: 'pending_suspension' };
async function empPage(view, key) {
  view.innerHTML = empTabsHtml(key) + '<div id="ebody"><div class="empty"><span class="spin"></span></div></div>';
  bindEmpTabs(view);
  const body = $('#ebody', view);
  try {
    const people = (await api('/employees')).filter((u) => !u.pending);
    if (key === 'org_chart') {
      const act = people.filter((u) => u.active), groups = {};
      act.forEach((u) => { const d = u.department || 'بدون قسم'; (groups[d] = groups[d] || []).push(u); });
      const mgr = (u) => { const m = people.find((x) => x.id === u.manager_id); return m ? ` · يتبع ${esc(m.name)}` : ''; };
      body.innerHTML = `<div class="grid g3">${Object.entries(groups).map(([d, arr]) => `<div class="card"><div class="orgh"><b>${esc(d)}</b><span class="badge b-info">${arr.length}</span></div>
        ${arr.map((u) => `<div class="emp orgm"><div class="avatar sm">${esc(initials(u.name))}</div><div class="info"><b>${esc(u.name)}</b><span class="muted small">${esc(u.job_title || '—')}${mgr(u)}</span></div></div>`).join('')}</div>`).join('') || '<div class="card empty" style="grid-column:1/-1">لا يوجد موظفون</div>'}</div>`;
    } else if (key === 'suspension_log') {
      const off = people.filter((u) => !u.active);
      body.innerHTML = `<div class="tablewrap st"><table><thead><tr><th>الموظف</th><th>المسمى الوظيفي</th><th>القسم</th><th>تاريخ التعيين</th><th class="actcol"></th></tr></thead><tbody>
        ${off.map((u) => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.job_title || '—')}</td><td>${esc(u.department || '—')}</td><td>${esc(u.hire_date)}</td><td class="actcol">${has('employees.manage') ? `<button class="btn alt sm" data-on="${u.id}">تفعيل الحساب</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">لا توجد حسابات موقوفة</td></tr>'}</tbody></table></div>`;
      body.querySelectorAll('[data-on]').forEach((b) => (b.onclick = () => run(b, async () => { await api('/employees/' + b.dataset.on, 'PUT', { active: true }); toast('تم تفعيل الحساب'); empPage(view, key); })));
    } else await catalog(body, empSpecs(people)[EMP_KIND[key]]);
  } catch (e) { body.innerHTML = `<div class="card empty neg">${esc(e.message)}</div>`; }
}
Object.keys(EMP_KIND).concat(['org_chart', 'suspension_log']).forEach((k) => (PAGES[k] = (v) => empPage(v, k)));
