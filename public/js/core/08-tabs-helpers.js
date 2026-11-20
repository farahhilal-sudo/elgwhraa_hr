'use strict';
/* core/08-tabs-helpers.js — تابات الصفحات والمالية وزرار التصدير ومسميات حالة اليوم وأنواع التسويات (ADJ) */
const ADJ = { bonus: ['مكافأة', 'pos', '＋'], penalty: ['جزاء', 'neg', '−'], deduction: ['خصم', 'neg', '−'] };


/* --- تابات أعلى الصفحة (زي الشاشة) --- */
const tabsBar = (items, cur) => `<div class="tabs pagetabs">${items.map(([k, l, ic, n]) => `<button data-tab="${k}" class="${k === cur ? 'on' : ''}">${ico(ic)}<span>${l}</span>${n ? `<em class="cnt">${n}</em>` : ''}</button>`).join('')}</div>`;
const bindTabs = (root, fn) => root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => fn(b.dataset.tab)));
const financeTabs = (cur) => tabsBar([
  has('payroll.view') && ['payroll', 'المرتبات', 'dollar'], has('payroll.view') && ['bonuses', 'المكافآت', 'gift'], has('payroll.view') && ['deductions', 'الخصومات', 'shield'], has('settings.manage') && ['tiers', 'سياسة الخصومات', 'timer'], has('payroll.view') && ['loans', 'قروض', 'wallet'],
].filter(Boolean), cur === 'adjustments' ? 'bonuses' : cur);
const TODAY_ST = {
  present: ['حضر', 'ok'], late: ['متأخر', 'warn'], absent: ['غائب', 'bad'], leave: ['في إجازة', 'info'], not_yet: ['لم يسجّل الحضور', ''], off: ['عطلة', ''],
};
const exportCsvBtn = (id) => `<button class="btn alt" id="${id}">${ico('download')} تصدير</button>`;

/* حقول المبلغ في نماذج المكافأة/الجزاء/الخصم: مبلغ ثابت أو عدد أيام (من الأساسي أو الأساسي + الحافز) */
const adjAmtHtml = () => `<label class="f">طريقة الحساب<select name="unit"><option value="fixed">مبلغ ثابت</option><option value="days">أيام</option></select></label>
  <label class="f"><span data-alab>المبلغ</span><input type="number" step="0.01" min="0.01" name="amount" required></label>
  <label class="f" data-basisw hidden>يُحسب اليوم من<select name="basis"><option value="base">الأساسي</option><option value="both">الأساسي والحافز</option></select></label>`;
function adjAmtBind(f) {
  const sync = () => {
    const d = f.unit.value === 'days';
    f.querySelector('[data-basisw]').hidden = !d; f.querySelector('[data-alab]').textContent = d ? 'عدد الأيام' : 'المبلغ';
    if (f.kind && f.basis) f.basis.value = f.kind.value === 'bonus' ? 'base' : 'both'; // المكافأة غالبًا من الأساسي، والخصم/الجزاء من الأساسي + الحافز
  };
  f.unit.onchange = sync; if (f.kind) f.kind.addEventListener('change', sync); sync();
}
const adjAmtPayload = (f) => (f.unit.value === 'days' ? { days: f.amount.value, basis: f.basis.value } : { amount: f.amount.value });
