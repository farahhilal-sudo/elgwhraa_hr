'use strict';
/* settings/40-payroll-presets.js — الإعدادات ← المالية ← خيارات التكوين المسبق للراتب */

/* --- خيارات التكوين المسبق للراتب --- */
const presetSpec = () => ({
  ...cfgApi('payroll_preset'), newLabel: 'إعداد مسبق جديد', searchPh: 'البحث بالاسم', noStatus: true,
  tabs: [['all', 'الكل', () => true], ['pin', 'مُثَبَّت', (it) => it.pinned === true || it.pinned === 'true']],
  sel: { ph: 'تحديد العملة', opts: Object.entries(CUR).map(([k, v]) => [k, v]), pred: (it, v) => it.currency === v },
  fields: [
    { k: 'currency', l: 'العملة', t: 'select', o: Object.entries(CUR), d: SETV.currency || 'EGP' },
    { k: 'period', l: 'الدفع', t: 'select', o: Object.entries(PERIODS), d: 'monthly' },
    { k: 'hours', l: 'ساعات العمل في اليوم', t: 'number', d: 8, attrs: 'min="1" max="24" step="0.5"' },
    { k: 'pinned', l: 'تثبيت الإعداد في أعلى القائمة', t: 'check' },
  ],
  text: (it) => it.name,
  cols: [['الاسم', (it) => `<b>${esc(it.name)}</b>`], ['العملة', (it) => esc(CUR[it.currency] || it.currency || '—')], ['الدفع', (it) => esc(PERIODS[it.period] || '—')]],
});
