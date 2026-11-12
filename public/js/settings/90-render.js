'use strict';
/* settings/90-render.js — الإطار العام لصفحات الإعدادات (renderSettings) وصفحات set_* */

/* --- الإطار العام لصفحات الإعدادات --- */
async function renderSettings(view, top) {
  S.sub = S.sub || {};
  const subs = SET_SUB[top] || [];
  const cur = subs.length ? (subs.find((x) => x[0] === S.sub[top]) || subs[0])[0] : SET_SINGLE[top];
  view.innerHTML = `<div class="card setnav"><div class="stabs">${SET_TOP.map(([k, l, ic]) => `<button data-st="${k}" class="${k === top ? 'on' : ''}">${ic ? ico(ic) : ''}<span>${l}</span></button>`).join('')}</div>
    ${subs.length ? `<div class="ssubs">${subs.map(([k, l]) => `<button data-ss="${k}" class="${k === cur ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}</div><div id="sbody"><div class="empty"><span class="spin"></span></div></div>`;
  view.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => go('set_' + b.dataset.st)));
  view.querySelectorAll('[data-ss]').forEach((b) => (b.onclick = () => { S.sub[top] = b.dataset.ss; renderSettings(view, top); }));
  const body = $('#sbody', view);
  try {
    SETV = await api('/settings');
    if (cur === 'offices') await catalog(body, officesSpec());
    else if (cur === 'schedule') await catalog(body, schedSpec());
    else if (cur === 'payroll_preset') await catalog(body, presetSpec());
    else if (cur === 'penalty') await catalog(body, policySpec('penalty_policy'));
    else if (cur === 'overtime') await catalog(body, policySpec('overtime_policy'));
    else if (['holiday', 'compensation_rule', 'holiday_limit', 'leave_profile'].includes(cur)) await catalog(body, attSpec(cur));
    else if (cur === 'leave_type') await catalog(body, leaveTypeSpec());
    else if (cur === 'misc') {
      await settingsForm(body, { title: 'إعدادات متنوعة', refresh: true, fields: [
        { sec: 'بيانات الشركة' },
        { k: 'company_name', l: 'اسم الشركة', full: true }, { k: 'country', l: 'الدولة' }, { k: 'currency', l: 'العملة', t: 'select', o: Object.keys(CUR).map((c) => [c, `${c} - ${CUR[c]}`]) },
        { k: 'language', l: 'اللغة', t: 'select', o: [['arabic', 'arabic'], ['english', 'english']] }, { k: 'timezone', l: 'المنطقة الزمنية', attrs: 'dir="ltr"' },
        { k: 'month_start', l: 'بداية الشهر (يوم)', t: 'number', attrs: 'min="1" max="28"' }, { k: 'first_month', l: 'أول شهر في السنة', t: 'select', o: MONTHS.map((m) => [m, m]) },
        { k: 'week_start', l: 'بداية الأسبوع', t: 'select', o: DAYS.map((d, i) => [String(i), d]) },
        { sec: 'الحضور والأمان' }, { k: '_days' },
        { k: 'face_threshold', l: 'حساسية مطابقة الوجه (0.3 أشد – 0.7 أخف)', t: 'number', attrs: 'step="0.05" min="0.3" max="0.7"' },
        { k: 'signup_enabled', l: 'السماح بإنشاء حساب جديد من صفحة الدخول (بيحتاج موافقتك)', t: 'check' }] });
    } else if (SIMPLE[cur]) await catalog(body, simpleSpec(cur, ...SIMPLE[cur]));
  } catch (e) { body.innerHTML = `<div class="card empty neg">${esc(e.message)}</div>`; }
}
PAGES.set_company = (v) => renderSettings(v, 'company');
PAGES.set_attendance = (v) => renderSettings(v, 'attendance');
PAGES.set_finance = (v) => renderSettings(v, 'finance');
PAGES.set_documents = (v) => renderSettings(v, 'documents');
PAGES.set_automation = (v) => renderSettings(v, 'automation');
PAGES.set_overrides = (v) => renderSettings(v, 'overrides');
PAGES.set_misc = (v) => renderSettings(v, 'misc');
PAGES.settings = PAGES.set_company;
