'use strict';
/* settings/00-constants.js — ثوابت الإعدادات: الأيام والشهور والعملات وتابات الإعدادات */

/* ====== الإعدادات (على شكل الشاشات المرجعية) ====== */
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CUR = { EGP: 'جنيه مصري', SAR: 'ريال سعودي', USD: 'دولار أمريكي', AED: 'درهم إماراتي', EUR: 'يورو' };
const PERIODS = { monthly: 'شهريا', weekly: 'أسبوعيا', biweekly: 'كل أسبوعين', daily: 'يوميا' };
const SET_TOP = [
  ['company', 'شركة', 'building'], ['attendance', 'الحضور', 'clock'], ['finance', 'المالية', 'wallet'], ['documents', 'المستندات', 'file'],
  ['automation', 'قواعد أتمتة النظام', ''], ['overrides', 'قواعد تجاوز الإشعارات', ''], ['misc', 'إعدادات متنوعة', 'sliders'],
];
const SET_SUB = {
  company: [['offices', 'مكاتب وأماكن العمل'], ['department', 'الأقسام'], ['grade', 'الدرجات'], ['position', 'المناصب'], ['access_level', 'مستويات الوصول'], ['custom_field', 'حقول مخصصة'], ['announcement', 'الإعلانات']],
  attendance: [['schedule', 'مواعيد العمل'], ['penalty', 'سياسات الجزاءات'], ['overtime', 'سياسات الوقت الإضافي'], ['leave_profile', 'ملفات الإجازة والاستراحة'], ['leave_type', 'أنواع الإجازات'], ['holiday', 'العطلات الرسمية'], ['compensation_rule', 'قواعد التعويض'], ['holiday_limit', 'قواعد الحد من أيام العطلات']],
  finance: [['payroll_preset', 'خيارات التكوين المسبق للراتب'], ['allowance', 'البدلات'], ['deduction', 'الخصومات'], ['expense_category', 'فئات المصاريف'], ['payroll_lieu', 'Payroll In Lieu Rules'], ['payslip_display', 'إعدادات ظهور كشف الراتب']],
};
const SET_SINGLE = { documents: 'document', automation: 'automation_rule', overrides: 'override_rule', misc: 'misc' };
let SETV = {}; // الإعدادات الحالية (بتتحمّل كل مرة تفتحي صفحة الإعدادات)

const tm12 = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const hoursOf = (s, e, brk) => {
  const tm = (x) => { const [h, m] = String(x || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  let d = tm(e) - tm(s); if (d <= 0) d += 1440;
  return Number((Math.max(0, d - (Number(brk) || 0)) / 60).toFixed(2));
};
const STATUS_TABS = [['all', 'الكل', () => true], ['1', 'نشط', (it) => it.active], ['0', 'غير نشط', (it) => !it.active]];
