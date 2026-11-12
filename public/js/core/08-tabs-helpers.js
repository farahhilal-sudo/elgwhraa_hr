'use strict';
/* core/08-tabs-helpers.js — تابات الصفحات والمالية وزرار التصدير ومسميات حالة اليوم وأنواع التسويات (ADJ) */
const ADJ = { bonus: ['مكافأة', 'pos', '＋'], penalty: ['جزاء', 'neg', '−'], deduction: ['خصم', 'neg', '−'] };


/* --- تابات أعلى الصفحة (زي الشاشة) --- */
const tabsBar = (items, cur) => `<div class="tabs pagetabs">${items.map(([k, l, ic, n]) => `<button data-tab="${k}" class="${k === cur ? 'on' : ''}">${ico(ic)}<span>${l}</span>${n ? `<em class="cnt">${n}</em>` : ''}</button>`).join('')}</div>`;
const bindTabs = (root, fn) => root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => fn(b.dataset.tab)));
const financeTabs = (cur) => tabsBar([
  has('payroll.view') && ['payroll', 'المرتبات', 'dollar'], has('payroll.view') && ['adjustments', 'المكافآت والجزاءات والخصومات', 'gift'], has('settings.manage') && ['tiers', 'شرائح خصم التأخير', 'timer'],
].filter(Boolean), cur);
const TODAY_ST = {
  present: ['حضر', 'ok'], late: ['متأخر', 'warn'], absent: ['غائب', 'bad'], leave: ['في إجازة', 'info'], not_yet: ['لم يسجّل الحضور', ''], off: ['عطلة', ''],
};
const exportCsvBtn = (id) => `<button class="btn alt" id="${id}">${ico('download')} تصدير</button>`;
