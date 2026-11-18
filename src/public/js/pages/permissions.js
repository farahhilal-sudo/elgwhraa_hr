'use strict';
/* pages/permissions.js — صفحة «الصلاحيات» (للمدير فقط) */

/* --- الصلاحيات (المدير فقط) --- */
PAGES.permissions = async (view) => {
  const emps = (await api('/employees')).filter((e) => !e.is_admin && !e.pending);
  const P = S.meta.permissions;
  const ALL = Object.keys(P);
  view.innerHTML = `<div class="page-head"><h2>الصلاحيات</h2></div>
    <p class="muted">أنتِ المدير، ولديكِ كل الصلاحيات. حدّدي لكل موظف ما يقدر يفتحه ويعمله. الصلاحيات الأساسية (تسجيل الحضور، حسابي، تقديم الطلبات) متاحة للجميع دايماً.</p>
    ${emps.length ? emps.map((u) => `<div class="card" style="margin-bottom:12px" data-u="${u.id}"><div class="row" style="justify-content:space-between;margin-bottom:8px">
      <div class="emp"><div class="avatar">${esc(initials(u.name))}</div><div class="info"><b>${esc(u.name)}</b><span class="muted small">${esc(u.job_title || '')}</span></div></div>
      <div class="row"><button class="btn alt sm" data-preset="ops">مدير تشغيل (كل الصلاحيات)</button><button class="btn alt sm" data-preset="none">بدون صلاحيات</button></div></div>
      <div class="grid g3">${ALL.map((p) => `<label class="perm"><input type="checkbox" value="${p}" ${u.permissions.includes(p) ? 'checked' : ''}>${esc(P[p])}</label>`).join('')}</div>
      <div class="row" style="margin-top:10px"><button class="btn sm" data-save>حفظ الصلاحيات</button></div></div>`).join('') : '<div class="card empty">أضيفي موظفين أولاً من صفحة الموظفين</div>'}`;
  view.querySelectorAll('[data-u]').forEach((card) => {
    const boxes = () => [...card.querySelectorAll('input[type=checkbox]')];
    card.querySelectorAll('[data-preset]').forEach((b) => (b.onclick = () => boxes().forEach((x) => (x.checked = b.dataset.preset === 'ops'))));
    $('[data-save]', card).onclick = (e) => run(e.target, async () => {
      await api(`/users/${card.dataset.u}/permissions`, 'PUT', { permissions: boxes().filter((x) => x.checked).map((x) => x.value) });
      toast('تم حفظ الصلاحيات');
    });
  });
};
