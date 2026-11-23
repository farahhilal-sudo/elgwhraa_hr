'use strict';
/* pages/loans.js — القروض: بتتصرف في تاريخ الموافقة وبتتخصم من المرتب آخر يوم في الشهر */
PAGES.loans = async (view) => {
  const F = (S.loanf = S.loanf || { user: '', q: '', st: 'active', from: '', to: '' });
  const STL = { active: ['جارية', 'lw'], done: ['منتهية', 'ld'], cancelled: ['ملغاة', 'lc'] };
  const dmy = (d) => (d ? `${d.slice(0, 4)} - ${d.slice(5, 7)} - ${d.slice(8, 10)}` : '—');
  view.innerHTML = `${financeTabs('loans')}<div class="lnbar">
      <div class="lnrow"><label class="dfi"><select id="lu"><option value="">اختار الموظف</option></select></label>
        <label class="dfi grow"><input id="lq" placeholder="كود / الموظف / الهاتف" value="${esc(F.q)}"></label>
        <label class="dfi"><select id="ls"><option value="">كل الحالات</option>${Object.entries(STL).map(([k, v]) => `<option value="${k}" ${F.st === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></label></div>
      <div class="lnrow"><label class="dfi dfd"><input type="date" id="lf" value="${F.from}" title="ممنوح من"></label><label class="dfi dfd"><input type="date" id="lt" value="${F.to}" title="ممنوح على"></label>
        <button class="btn alt" id="lr">إعادة تعيين المرشحات</button><span class="grow"></span>
        ${exportCsvBtn('lex')}${has('payroll.manage') ? '<button class="btn" id="ladd">+ قرض جديد</button>' : ''}</div></div>
    <div id="lt-body"></div>`;
  bindTabs(view, (t) => go(t));
  let data;
  const load = async () => {
    const qs = new URLSearchParams({ user_id: F.user, q: F.q, status: F.st, from: F.from, to: F.to });
    data = await api('/loans?' + qs);
    const u = $('#lu', view); if (u.options.length < 2) u.innerHTML += data.employees.map((e) => `<option value="${e.id}" ${String(F.user) === String(e.id) ? 'selected' : ''}>${esc(e.name)}</option>`).join('');
    $('#lt-body', view).innerHTML = `<div class="tablewrap"><table class="lnt"><thead><tr><th>الموظف</th><th>الاسم</th><th>المبلغ الإجمالي</th><th>متبقي</th><th>أقساط</th><th>أُنشئ بواسطة</th><th>ملحوظة</th><th>ممنوح في</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${data.rows.map((l) => `<tr><td class="lnu">${esc(l.user_name)}</td><td>${esc(l.name)}</td><td>${money(l.amount)} جنيه مصري</td><td>${money(l.remaining)} جنيه مصري</td><td>${l.installments}</td><td>${esc(l.created_by_name || '—')}</td><td>${esc(l.note || '')}</td><td dir="ltr">${dmy(l.disbursed_on)}</td><td><span class="${STL[l.state][1]}">${STL[l.state][0]}</span></td>
        <td class="lnact"><button class="sqb" data-lv="${l.id}" title="عرض الأقساط">${ico('eye')}</button>${has('payroll.manage') ? `<button class="sqb" data-le="${l.id}" title="تعديل">${ico('edit')}</button><button class="sqb bad" data-ld="${l.id}" title="حذف">${ico('trash')}</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="10" class="empty">لا توجد قروض</td></tr>'}</tbody></table></div>
      <p class="lnfoot muted small">عرض ${data.rows.length ? 1 : 0} إلى ${data.rows.length} من ${data.rows.length} إدخالات</p>`;
    view.querySelectorAll('[data-lv]').forEach((b) => (b.onclick = () => showLoan(data.rows.find((l) => String(l.id) === b.dataset.lv))));
    view.querySelectorAll('[data-le]').forEach((b) => (b.onclick = () => editLoan(data.rows.find((l) => String(l.id) === b.dataset.le))));
    view.querySelectorAll('[data-ld]').forEach((b) => (b.onclick = () => { const l = data.rows.find((x) => String(x.id) === b.dataset.ld); if (confirm(l.paid > 0 ? 'اتحصّل جزء من القرض ده، هيتم إلغاؤه بدل حذفه. متأكدة؟' : 'حذف القرض ده؟')) run(b, async () => { await api('/loans/' + l.id, 'DELETE'); toast('تم'); load(); }); }));
  };
  const showLoan = (l) => {
    const o = modal(`<h3>${esc(l.name)} — ${esc(l.user_name)}</h3><p class="muted small" style="margin:0 0 10px">المبلغ ${money(l.amount)} · اتصرف في ${l.disbursed_on} · متبقي ${money(l.remaining)}</p>
      <div class="tablewrap"><table class="ptinfo"><tr><th>القسط</th><th>تاريخ الاستحقاق</th><th>المبلغ</th><th>الحالة</th></tr>${l.schedule.map((x) => `<tr><td>${x.n}</td><td dir="ltr">${x.due}</td><td>${money(x.amount)}</td><td>${l.state === 'cancelled' ? 'ملغي' : x.collected ? 'اتحصّل' : 'قادم'}</td></tr>`).join('')}</table></div>
      <div class="actions" style="margin-top:12px"><button class="btn alt" data-close>إغلاق</button></div>`);
    o.querySelector('.modal').style.maxWidth = '560px';
  };
  const form = (l) => `<form class="form" id="lf2">
      ${l ? '' : `<label class="f full">الموظف<select name="user_id" required><option value="">اختار الموظف</option>${data.employees.map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></label>`}
      <label class="f">الاسم<input name="name" value="${esc(l ? l.name : 'سلفة')}" maxlength="80"></label>
      <label class="f">المبلغ<input type="number" name="amount" min="1" step="any" required value="${l ? l.amount : ''}" ${l && l.paid > 0 ? 'disabled' : ''}></label>
      <label class="f">عدد الأقساط (شهري)<input type="number" name="installments" min="1" max="60" value="${l ? l.installments : 1}" ${l && l.paid > 0 ? 'disabled' : ''}></label>
      ${l ? '' : `<label class="f">تاريخ الصرف<input type="date" name="date" value="${todayStr()}"></label>`}
      <label class="f full">ملحوظة<input name="note" maxlength="300" value="${esc(l ? l.note || '' : '')}"></label>
      <div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">${l ? 'حفظ' : 'إضافة'}</button></div></form>`;
  const editLoan = (l) => {
    const o = modal(`<h3>تعديل القرض</h3>${form(l)}`), f = $('#lf2', o);
    f.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', f), async () => { const b = { name: f.name.value, note: f.note.value }; if (!f.amount.disabled) { b.amount = f.amount.value; b.installments = f.installments.value; } await api('/loans/' + l.id, 'PUT', b); o.close(); toast('تم الحفظ'); load(); }); };
  };
  if ($('#ladd', view)) $('#ladd', view).onclick = () => {
    const o = modal(`<h3>قرض جديد</h3>${form(null)}`), f = $('#lf2', o);
    f.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', f), async () => { await api('/loans', 'POST', { user_id: f.user_id.value, name: f.name.value, amount: f.amount.value, installments: f.installments.value, date: f.date.value, note: f.note.value }); o.close(); toast('تم إضافة القرض'); load(); }); };
  };
  $('#lu', view).onchange = (e) => { F.user = e.target.value; load(); };
  $('#ls', view).onchange = (e) => { F.st = e.target.value; load(); };
  $('#lf', view).onchange = (e) => { F.from = e.target.value; load(); };
  $('#lt', view).onchange = (e) => { F.to = e.target.value; load(); };
  let tm; $('#lq', view).oninput = (e) => { F.q = e.target.value; clearTimeout(tm); tm = setTimeout(load, 300); };
  $('#lr', view).onclick = () => { S.loanf = null; PAGES.loans(view); };
  $('#lex', view).onclick = () => csv('loans.csv', [['الموظف', 'الاسم', 'المبلغ', 'متبقي', 'أقساط', 'ممنوح في', 'الحالة'], ...data.rows.map((l) => [l.user_name, l.name, l.amount, l.remaining, l.installments, l.disbursed_on, STL[l.state][0]])]);
  load();
};
