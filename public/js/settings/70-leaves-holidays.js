'use strict';
/* settings/70-leaves-holidays.js — العطلات الرسمية وقواعد التعويض وحدود الإجازات وملفات وأنواع الإجازات */

/* ===== العطلات الرسمية + قواعد التعويض + قواعد الحد من الإجازات + ملفات الإجازة والاستراحة =====
   نفس منطق سياسات الجزاءات: إصدارات / نسخ / أرشفة / تفعيل / معالج بخطوات، والسيرفر بيطبقها فعلياً
   (حساب المرتبات + طلبات الإجازة). */
Object.assign(POL_KEYS, {
  holiday: ['name', 'date', 'to', 'yearly'],
  compensation_rule: ['name', 'applies', 'mode', 'factor', 'days', 'min_hours'],
  holiday_limit: ['name', 'rule', 'value', 'from', 'to', 'scope', 'types'],
  leave_profile: ['name', 'annual', 'sick', 'emergency', 'carry', 'break_min', 'break_paid'],
});
const LV_LIST = [['annual_leave', 'سنوية', 'الإجازة اللي بتتخصم من الرصيد السنوي'], ['emergency_leave', 'طارئة', 'إجازة عارضة بدون ترتيب مسبق'], ['sick_leave', 'مرضية', 'إجازة بتقرير طبي']];
const LV_NAME = Object.fromEntries(LV_LIST.map(([k, l]) => [k, l]));
const APPLIES = { holiday: 'العطلات الرسمية', weekend: 'الإجازة الأسبوعية', both: 'العطلات والإجازة الأسبوعية' };
const LIM_RULE = { max_consecutive: 'أقصى مدة للطلب', max_concurrent: 'أقصى عدد في نفس اليوم', blackout: 'فترة منع' };
const dayCount = (a, b) => (a && b && b >= a ? Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5) + 1 : 0);
const attOnChange = (k, dd) => {
  if (['yearly', 'carry', 'break_paid'].includes(k) && typeof dd[k] === 'string') { dd[k] = dd[k] === 'true'; return true; }
  if (k === 'rule') { dd.value = dd.rule === 'max_consecutive' ? 5 : dd.rule === 'max_concurrent' ? 2 : 0; return true; }
  return ['mode', 'applies', 'scope'].includes(k);
};
const nameFld = (d, ph) => `<div class="pwfld" data-help="details"><label class="lbl">الاسم</label><input data-k="name" value="${esc(d.name)}" placeholder="${ph}" maxlength="80"></div>`;
const nameChk = (d) => (String(d.name || '').trim() ? null : 'اكتبي الاسم');

HELP.holiday = {
  details: ['العطلة الرسمية', 'يوم أو فترة بتتعامل معاها الشركة كإجازة رسمية. الموظفين مش بيتحسبلهم غياب ولا تأخير في الأيام دي، وبتظهر في لوحة المعلومات كيوم عطلة.', 'لو موظف اشتغل في العطلة، بتتطبق عليه «قاعدة التعويض» المناسبة (لو فيه).'],
  yearly: ['التكرار', 'تتكرر كل سنة: نفس اليوم والشهر كل سنة (مناسبة للأعياد الثابتة). مرة واحدة: بتتطبق في السنة اللي اخترتيها بس (مناسبة للأعياد المتحركة).', null],
  dates: ['فترة العطلة', 'اختاري أول يوم وآخر يوم. لو العطلة يوم واحد سيبي «إلى» فاضية.', 'الحد الأقصى للعطلة الواحدة 60 يوم.'],
};
HELP.compensation_rule = {
  details: ['قاعدة التعويض', 'بتحدد إيه اللي الموظف بياخده لو اشتغل في يوم المفروض يكون إجازة. بتتطبق في حساب المرتب الشهري.', 'أول قاعدة مفعّلة مطابقة هي اللي بتتطبق: المحددة (عطلة/أسبوعية) قبل «الاثنين».'],
  applies: ['بتنطبق على', 'العطلات الرسمية: الأيام المسجّلة في «العطلات الرسمية». الإجازة الأسبوعية: أيام الويك إند من الإعدادات المتنوعة. الاثنين: أي يوم من النوعين.', null],
  ckind: ['شكل التعويض', 'أجر إضافي: بيتضاف للمرتب (أجر اليوم × المعامل). يوم إجازة بدل: بيتسجل للموظف رصيد أيام بدل بتظهر في كشف المرتب.', null],
  cfactor: ['معامل أجر اليوم', 'أجر اليوم = المرتب الأساسي ÷ 30. المعامل 2 يعني الموظف بياخد أجر يومين عن اليوم اللي اشتغله.', null],
  csim: ['جرّبي حساب', 'اكتبي مرتب وشوفي قيمة التعويض عن يوم عمل واحد.', null],
  cdays: ['أيام الإجازة البدل', 'عدد أيام الإجازة اللي الموظف يكسبها عن كل يوم اشتغله في العطلة.', null],
  cmin: ['الحد الأدنى لساعات العمل', 'التعويض مش بيتطبق إلا لو الموظف سجّل حضور وانصراف وساعاته وصلت للحد ده. 0 = أي يوم فيه تسجيل حضور.', null],
};
HELP.holiday_limit = {
  details: ['قاعدة الحد من الإجازات', 'بتمنع طلبات الإجازة اللي بتخالف الحدود اللي بتحطيها. بتتفحص أوتوماتيك لحظة تقديم الموظف للطلب ولو خالف بيظهرله سبب الرفض.', null],
  rule: ['نوع القاعدة', 'أقصى مدة: عدد الأيام في الطلب الواحد. أقصى عدد في نفس اليوم: كام موظف يقدروا يكونوا في إجازة في نفس اليوم. فترة منع: تواريخ مش بيتقبل فيها أي طلب.', null],
  value: ['القيمة', 'الحد الأقصى المسموح بيه. الطلبات المعتمدة والمنتظرة بتتحسب.', null],
  scope: ['النطاق', 'كل الشركة: العدد بيتحسب على كل الموظفين. نفس القسم: بيتحسب على موظفين نفس قسم مقدّم الطلب.', null],
  block: ['فترة المنع', 'أي طلب بيتقاطع مع الفترة دي بيترفض.', null],
  types: ['أنواع الإجازات', 'القاعدة بتتطبق على الأنواع المختارة فقط.', null],
};
HELP.leave_profile = {
  details: ['ملف الإجازة والاستراحة', 'مجموعة أرصدة إجازات وقواعد استراحة بتتربط بالموظف من صفحة بياناته. الموظف اللي ليه ملف بيتفحص رصيده عند تقديم أي طلب إجازة.', 'الموظف اللي مالوش ملف بيستخدم «الإجازة السنوية» من بياناته.'],
  annual: ['الإجازة السنوية', 'عدد أيام الإجازة السنوية في السنة. لو الطلب هيعدي الرصيد بيترفض.', null],
  sick: ['المرضية والطارئة', 'أقصى أيام في السنة لكل نوع. اكتبي 0 لو مفيش حد.', null],
  carry: ['ترحيل الرصيد', 'لو مفعّل، الرصيد المتبقي بيتنقل للسنة اللي بعدها.', null],
  brk: ['الاستراحة', 'مدة الاستراحة اليومية. لو غير مدفوعة بتتشال من ساعات الوردية المدفوعة (فبيزيد أجر الساعة المستخدم في الخصومات والوقت الإضافي).', 'مدفوعة: مفيش أي تأثير على الحساب.'],
};

const ATT_DEF = {
  holiday: {
    title: 'عطلة رسمية', newLabel: 'إضافة عطلة رسمية', search: 'ابحث في العطلات الرسمية',
    nw: () => ({ name: '', date: '', to: '', yearly: true }),
    groups: [{ title: 'العطلة', idx: [0] }, { title: 'المدة', idx: [1] }],
    subtitle: 'يوم أو فترة عطلة رسمية بدون خصم غياب',
    brief: (it) => { const n = dayCount(it.date, it.to || it.date); return `${dmy(it.date)}${n > 1 ? ` ← ${dmy(it.to)}` : ''} · ${plural(n, 'يوم واحد', 'أيام')}${truthy2(it.yearly) ? ' · كل سنة' : ''}`; },
    chipLabel: 'التكرار', chips: [['all', 'الكل', () => true], ['y', 'سنوياً', (it) => truthy2(it.yearly)], ['o', 'مرة واحدة', (it) => !truthy2(it.yearly)]],
    cols: [
      ['العطلة', (it) => `<b>${esc(it.name)}</b>`],
      ['الفترة', (it) => { const n = dayCount(it.date, it.to || it.date); return `<span dir="ltr">${dmy(it.date)}${n > 1 ? ` ← ${dmy(it.to)}` : ''}</span>`; }],
      ['المدة', (it) => `<span class="badge b-info">${plural(dayCount(it.date, it.to || it.date), 'يوم واحد', 'أيام')}</span>`],
      ['التكرار', (it) => `<span class="badge ${truthy2(it.yearly) ? 'b-ok' : ''}">${truthy2(it.yearly) ? 'كل سنة' : 'مرة واحدة'}</span>`],
    ],
    steps: () => [
      { title: 'تفاصيل العطلة', sub: 'اسم العطلة وهل بتتكرر', icon: 'gift', help: 'details',
        body: (d) => `${nameFld(d, 'مثلاً: عيد الفطر')}<div class="pwfld" data-help="yearly"><label class="lbl">التكرار</label>${pwRadio('yearly', d.yearly ? 'true' : 'false', [['true', 'تتكرر كل سنة', 'نفس اليوم والشهر كل سنة'], ['false', 'مرة واحدة', 'السنة المحددة فقط']], 'two')}</div>`,
        check: nameChk },
      { title: 'فترة العطلة', sub: 'أول يوم وآخر يوم', icon: 'calendar', help: 'dates',
        body: (d) => `<div class="pwfld" data-help="dates"><label class="lbl">من تاريخ</label><input type="date" data-k="date" value="${esc(d.date)}"></div>
          <div class="pwfld" data-help="dates"><label class="lbl">إلى تاريخ <span class="muted small">(سيبيه فاضي لو يوم واحد)</span></label><input type="date" data-k="to" value="${esc(d.to && d.to !== d.date ? d.to : '')}"></div>
          <div class="pwcalc"><b id="hsum"></b></div>`,
        on: (root, d) => { const s = root.querySelector('#hsum'); const c = () => { const n = dayCount(d.date, d.to || d.date); s.textContent = d.date && n ? `${plural(n, 'يوم واحد', 'أيام')} · ${dmy(d.date)}${n > 1 ? ' ← ' + dmy(d.to) : ''}` : ''; }; root.querySelectorAll('[data-k]').forEach((i) => i.addEventListener('input', c)); c(); },
        check: (d) => (!d.date ? 'اختاري تاريخ بداية العطلة' : d.to && d.to < d.date ? 'نهاية العطلة قبل بدايتها' : dayCount(d.date, d.to || d.date) > 60 ? 'العطلة الواحدة حد أقصى 60 يوم' : null) },
    ],
  },
  compensation_rule: {
    title: 'قاعدة تعويض', newLabel: 'إضافة قاعدة تعويض', search: 'ابحث في قواعد التعويض',
    nw: () => ({ name: '', applies: 'both', mode: 'pay', factor: 2, days: 1, min_hours: 0 }),
    groups: [{ title: 'القاعدة', idx: [0] }, { title: 'التعويض', idx: [1] }],
    subtitle: 'تعويض الموظف اللي بيشتغل في عطلة رسمية أو إجازة أسبوعية',
    brief: (it) => `${APPLIES[it.applies] || ''} · ${it.mode === 'time_off' ? `${plural(Number(it.days), 'يوم إجازة بدل', 'أيام إجازة بدل')}` : `أجر يوم × ${it.factor}`}${Number(it.min_hours) > 0 ? ` · من ${it.min_hours} س` : ''}`,
    chipLabel: 'التعويض', chips: [['all', 'الكل', () => true], ['pay', 'أجر إضافي', (it) => it.mode !== 'time_off'], ['off', 'إجازة بدل', (it) => it.mode === 'time_off']],
    cols: [
      ['القاعدة', (it) => `<b>${esc(it.name)}</b>`],
      ['تنطبق على', (it) => `<span class="badge b-info">${APPLIES[it.applies] || '—'}</span>`],
      ['التعويض', (it) => (it.mode === 'time_off' ? `<span class="badge b-warn">${plural(Number(it.days), 'يوم إجازة بدل', 'أيام إجازة بدل')}</span>` : `<span class="badge b-ok">أجر يوم × ${esc(it.factor)}</span>`)],
      ['الحد الأدنى', (it) => (Number(it.min_hours) > 0 ? `${it.min_hours} ساعة` : '<span class="muted small">أي حضور</span>')],
    ],
    steps: () => [
      { title: 'تفاصيل القاعدة', sub: 'الاسم وبتنطبق على إيه', icon: 'shield', help: 'details',
        body: (d) => `${nameFld(d, 'مثلاً: العمل في العطلات')}<div class="pwfld" data-help="applies"><label class="lbl">بتنطبق على</label>${pwRadio('applies', d.applies, [['holiday', 'العطلات الرسمية', 'الأيام المسجلة في العطلات الرسمية'], ['weekend', 'الإجازة الأسبوعية', 'أيام الويك إند'], ['both', 'الاثنين', 'أي يوم من النوعين']])}</div>`,
        check: nameChk },
      { title: 'التعويض', sub: 'أجر إضافي أو يوم إجازة بدل', icon: 'dollar', help: 'ckind',
        body: (d) => `<div class="pwfld" data-help="ckind"><label class="lbl">شكل التعويض</label>${pwRadio('mode', d.mode, [['pay', 'أجر إضافي', 'بيتضاف للمرتب'], ['time_off', 'يوم إجازة بدل', 'رصيد أيام بدل']], 'two')}</div>
          ${d.mode === 'time_off'
    ? `<div class="pwfld" data-help="cdays"><label class="lbl">أيام الإجازة البدل عن كل يوم عمل</label>${pwStep('data-k="days"', d.days, 0.5, 0.5, 5)}</div>`
    : `<div class="pwfld" data-help="cfactor"><label class="lbl">معامل أجر اليوم</label>${pwStep('data-k="factor"', d.factor, 0.25, 0.25, 10)}</div>
          <div class="pwcalc" data-help="csim"><b>جرّبي حساب</b><div class="ufld"><input type="number" id="csal" min="0" step="100" value="6000"><span>مرتب</span></div><div id="cres" class="pwres"></div></div>`}
          <div class="pwfld" data-help="cmin"><label class="lbl">الحد الأدنى لساعات العمل</label>${pwNum('min="0" max="24" step="0.5" data-k="min_hours"', d.min_hours, 'ساعة')}</div>`,
        on: (root, d) => { const s = root.querySelector('#csal'), r = root.querySelector('#cres'); if (!s) return; const c = () => { const day = (Number(s.value) || 0) / 30; r.innerHTML = `أجر اليوم ${money(day)} ← تعويض اليوم الواحد <b>${money(day * (Number(d.factor) || 0))}</b>`; }; s.addEventListener('input', c); root.querySelectorAll('[data-k="factor"],[data-sp]').forEach((i) => i.addEventListener(i.dataset.sp ? 'click' : 'input', () => setTimeout(c, 0))); c(); },
        check: (d) => (d.mode === 'time_off' ? (!(Number(d.days) > 0) || Number(d.days) > 5 ? 'أيام الإجازة البدل بين 0.5 و 5' : null) : (!(Number(d.factor) > 0) || Number(d.factor) > 10 ? 'معامل أجر اليوم بين 0.25 و 10' : null)) || (Number(d.min_hours) < 0 || Number(d.min_hours) > 24 ? 'ساعات العمل بين 0 و 24' : null) },
    ],
  },
  holiday_limit: {
    title: 'قاعدة حد من الإجازات', newLabel: 'إضافة قاعدة', search: 'ابحث في قواعد الحد من الإجازات',
    nw: () => ({ name: '', rule: 'max_consecutive', value: 5, from: '', to: '', scope: 'all', types: ['annual_leave'] }),
    groups: [{ title: 'القاعدة', idx: [0] }, { title: 'الحد', idx: [1] }, { title: 'الإجازات', idx: [2] }],
    subtitle: 'تُفحص تلقائياً عند تقديم طلب الإجازة',
    brief: (it) => (it.rule === 'blackout' ? `ممنوع من ${dmy(it.from)} إلى ${dmy(it.to)}` : it.rule === 'max_concurrent' ? `حد أقصى ${plural(Number(it.value), 'موظف واحد', 'موظفين')} في نفس اليوم · ${it.scope === 'department' ? 'نفس القسم' : 'كل الشركة'}` : `حد أقصى ${plural(Number(it.value), 'يوم واحد', 'أيام')} في الطلب الواحد`),
    chipLabel: 'النوع', chips: [['all', 'الكل', () => true], ...Object.entries(LIM_RULE).map(([k, l]) => [k, l, (it) => it.rule === k])],
    cols: [
      ['القاعدة', (it) => `<b>${esc(it.name)}</b>`],
      ['النوع', (it) => `<span class="badge b-info">${LIM_RULE[it.rule] || '—'}</span>`],
      ['الحد', (it) => `<span class="small">${esc(ATT_DEF.holiday_limit.brief(it))}</span>`],
      ['تشمل', (it) => `<div class="pcs">${(it.types || []).map((t) => `<span class="pc">${LV_NAME[t] || t}</span>`).join('')}</div>`],
    ],
    steps: () => [
      { title: 'تفاصيل القاعدة', sub: 'الاسم ونوع الحد', icon: 'shield', help: 'details',
        body: (d) => `${nameFld(d, 'مثلاً: حد الإجازة المتواصلة')}<div class="pwfld" data-help="rule"><label class="lbl">نوع القاعدة</label>${pwRadio('rule', d.rule, [['max_consecutive', 'أقصى مدة للطلب', 'عدد أيام الطلب الواحد'], ['max_concurrent', 'أقصى عدد في نفس اليوم', 'كام موظف في إجازة مع بعض'], ['blackout', 'فترة منع', 'تواريخ ممنوع فيها الإجازات']])}</div>`,
        check: nameChk },
      { title: 'الحد', sub: 'القيمة اللي القاعدة بتفرضها', icon: 'sliders', help: 'value',
        body: (d) => (d.rule === 'blackout'
          ? `<div class="pwfld" data-help="block"><label class="lbl">ممنوع من</label><input type="date" data-k="from" value="${esc(d.from)}"></div><div class="pwfld" data-help="block"><label class="lbl">إلى</label><input type="date" data-k="to" value="${esc(d.to)}"></div>`
          : `<div class="pwfld" data-help="value"><label class="lbl">${d.rule === 'max_concurrent' ? 'أقصى عدد موظفين في إجازة في نفس اليوم' : 'أقصى عدد أيام في الطلب الواحد'}</label>${pwStep('data-k="value"', d.value, 1, 1, 365)}</div>
            ${d.rule === 'max_concurrent' ? `<div class="pwfld" data-help="scope"><label class="lbl">النطاق</label>${pwRadio('scope', d.scope, [['all', 'كل الشركة', 'كل الموظفين'], ['department', 'نفس القسم', 'موظفين نفس قسم مقدم الطلب']], 'two')}</div>` : ''}`),
        check: (d) => (d.rule === 'blackout' ? (!d.from || !d.to ? 'حددي فترة المنع (من وإلى)' : d.to < d.from ? 'نهاية الفترة قبل بدايتها' : null) : (!(Number(d.value) >= 1) ? 'القيمة لازم تكون 1 أو أكتر' : null)) },
      { title: 'أنواع الإجازات', sub: 'القاعدة بتتطبق على أنهي إجازات', icon: 'calendar', help: 'types',
        body: (d) => `<div class="pwfld" data-help="types"><label class="lbl">تُطبق على</label>${LV_LIST.map(([k, l, s]) => `<label class="cc ${d.types.includes(k) ? 'on' : ''}"><input type="checkbox" data-ty="${k}" ${d.types.includes(k) ? 'checked' : ''}><span><b>إجازة ${l}</b><small>${s}</small></span></label>`).join('')}</div>`,
        on: (root, d) => root.querySelectorAll('[data-ty]').forEach((el) => (el.onchange = () => { const s = new Set(d.types); if (el.checked) s.add(el.dataset.ty); else s.delete(el.dataset.ty); d.types = [...s]; el.closest('.cc').classList.toggle('on', el.checked); })),
        check: (d) => (d.types.length ? null : 'اختاري نوع إجازة واحد على الأقل') },
    ],
  },
  leave_profile: {
    title: 'ملف إجازة واستراحة', newLabel: 'إضافة ملف', search: 'ابحث في ملفات الإجازة والاستراحة',
    nw: () => ({ name: '', annual: 21, sick: 0, emergency: 0, carry: false, break_min: 60, break_paid: true }),
    groups: [{ title: 'الملف', idx: [0] }, { title: 'بنود الملف', idx: [1, 2] }],
    subtitle: 'أرصدة الإجازات وقواعد الاستراحة للموظفين المربوطين بيه',
    brief: (it) => `سنوية ${it.annual} · مرضية ${Number(it.sick) > 0 ? it.sick : 'بدون حد'} · طارئة ${Number(it.emergency) > 0 ? it.emergency : 'بدون حد'}`,
    chipLabel: 'الاستراحة', chips: [['all', 'الكل', () => true], ['p', 'مدفوعة', (it) => it.break_paid !== false], ['u', 'غير مدفوعة', (it) => it.break_paid === false]],
    cols: [
      ['الملف', (it) => `<b>${esc(it.name)}</b>`],
      ['الأرصدة', (it) => `<span class="small">${esc(ATT_DEF.leave_profile.brief(it))}${it.carry ? ' · يُرحَّل' : ''}</span>`],
      ['الاستراحة', (it) => (Number(it.break_min) > 0 ? `<span class="badge ${it.break_paid === false ? 'b-warn' : 'b-ok'}">${it.break_min} د ${it.break_paid === false ? 'غير مدفوعة' : 'مدفوعة'}</span>` : '<span class="muted small">بدون</span>')],
      ['الموظفون', (it) => (it._n ? `<span class="badge b-info">${plural(it._n, 'موظف واحد', 'موظفين')}</span>` : '<span class="muted small">غير مربوط بعد</span>')],
    ],
    async load(rows) { const emps = await api('/employees').catch(() => []); rows.forEach((r) => { r._n = emps.filter((e) => String(e.leave_profile_id || '') === String(r.id)).length; }); },
    delMsg: (it) => (it._n ? `الملف ده مربوط بـ ${it._n} موظف، ولو اتحذف هيرجعوا لرصيد «الإجازة السنوية» من بياناتهم. متأكدة؟` : 'حذف الملف ده؟'),
    steps: () => [
      { title: 'تفاصيل الملف', sub: 'اسم الملف', icon: 'file', help: 'details', body: (d) => nameFld(d, 'مثلاً: موظفين بدوام كامل'), check: nameChk },
      { title: 'أرصدة الإجازات', sub: 'أيام كل نوع في السنة', icon: 'calendar', help: 'annual',
        body: (d) => `<div class="pwfld" data-help="annual"><label class="lbl">الإجازة السنوية</label>${pwNum('min="0" max="365" data-k="annual"', d.annual, 'يوم')}</div>
          <div class="pwfld" data-help="sick"><label class="lbl">الإجازة المرضية <span class="muted small">(0 = بدون حد)</span></label>${pwNum('min="0" max="365" data-k="sick"', d.sick, 'يوم')}</div>
          <div class="pwfld" data-help="sick"><label class="lbl">الإجازة الطارئة <span class="muted small">(0 = بدون حد)</span></label>${pwNum('min="0" max="365" data-k="emergency"', d.emergency, 'يوم')}</div>
          <div class="pwfld" data-help="carry"><label class="lbl">ترحيل الرصيد المتبقي</label>${pwRadio('carry', d.carry ? 'true' : 'false', [['false', 'لا يُرحَّل', 'الرصيد بيتصفّر كل سنة'], ['true', 'يُرحَّل', 'الباقي بيتنقل للسنة اللي بعدها']], 'two')}</div>`,
        check: (d) => (['annual', 'sick', 'emergency'].some((k) => Number(d[k]) < 0 || Number(d[k]) > 365) ? 'الأرصدة بين 0 و 365 يوم' : null) },
      { title: 'الاستراحة', sub: 'مدتها وهل هي مدفوعة', icon: 'pause', help: 'brk',
        body: (d) => `<div class="pwfld" data-help="brk"><label class="lbl">مدة الاستراحة اليومية</label>${pwNum('min="0" max="240" data-k="break_min"', d.break_min, 'دقيقة')}</div>
          <div class="pwfld" data-help="brk"><label class="lbl">الاستراحة</label>${pwRadio('break_paid', d.break_paid !== false ? 'true' : 'false', [['true', 'مدفوعة', 'بدون تأثير على الحساب'], ['false', 'غير مدفوعة', 'بتتشال من ساعات الوردية المدفوعة']], 'two')}</div>`,
        check: (d) => (Number(d.break_min) < 0 || Number(d.break_min) > 240 ? 'الاستراحة بين 0 و 240 دقيقة' : null) },
    ],
  },
};
const truthy2 = (v) => v === true || v === 'true' || v === 1 || v === '1';

function attSpec(kind) {
  const def = ATT_DEF[kind], keys = POL_KEYS[kind], api_ = cfgApi(kind);
  const pick = (it) => Object.fromEntries(keys.map((k) => [k, clone(k === 'name' ? it.name : it[k])]));
  const snap = (it) => ({ at: stamp(), ...pick(it) });
  const brief = def.brief;
  const spec = { kind, keys, snap, brief };
  spec.saveWith = (it, d, over = {}) => {
    const body = { ...clone(d), name: String(d.name || '').trim(), active: over.active ?? (it ? (it.active ? '1' : '0') : '1'), archived: over.archived ?? (it ? !!it.archived : false) };
    const changed = it && keys.some((k) => JSON.stringify(clone(k === 'name' ? it.name : it[k]) ?? null) !== JSON.stringify(clone(k === 'name' ? body.name : body[k]) ?? null));
    body.versions = it ? (changed ? [snap(it), ...(it.versions || [])].slice(0, 30) : (it.versions || [])) : [];
    return api_.save(it, body);
  };
  const flip = (it, over) => spec.saveWith(it, { ...pick(it), name: it.name }, over);
  return Object.assign(spec, {
    ...api_, newLabel: def.newLabel, searchPh: def.search, counts: true, tabs: POL_TABS, actHead: 'الإصدارات والإجراءات',
    chips: def.chips, chipLabel: def.chipLabel, text: (it) => `${it.name} ${brief(it)}`,
    load: async () => { const rows = await api_.load(); if (def.load) await def.load(rows); return rows; },
    cols: [...def.cols, ['حالة', polBadge]],
    rowActs: (it) => `<div class="racts"><button class="vchip" data-a="ver" data-id="${it.id}" ${(it.versions || []).length ? '' : 'disabled'}>${(it.versions || []).length ? `إصدارات ${it.versions.length}` : 'لا توجد إصدارات سابقة'}</button>
      <button class="sqb" data-a="edit" data-id="${it.id}" title="تعديل">${ico('edit')}</button><button class="sqb" data-a="dup" data-id="${it.id}" title="نسخ">${ico('copy')}</button>
      <button class="sqb" data-a="arch" data-id="${it.id}" title="${it.archived ? 'استرجاع' : 'أرشفة'}">${ico('archive')}</button><button class="sqb" data-more="${it.id}" title="المزيد">${ico('dots')}</button></div>`,
    more: (it) => [['tog', it.active ? 'تعطيل' : 'تفعيل'], ['del', 'حذف', 1]],
    delMsg: def.delMsg || (() => 'حذف السجل ده؟'),
    form: (it, reload) => {
      const base = def.nw();
      const d = it ? { ...base, ...Object.fromEntries(keys.map((k) => [k, clone(k === 'name' ? it.name : it[k])]).filter(([, v]) => v !== null && v !== undefined)) } : base;
      policyWizard({ d, guided: !it, groups: def.groups, steps: def.steps(), help: HELP[kind], title: `${it ? 'تعديل' : 'إضافة'} ${def.title}`, subtitle: def.subtitle, progressLabel: def.title, onChange: attOnChange, onSave: (dd) => spec.saveWith(it, dd), done: reload });
    },
    act: async (a, it, reload) => {
      if (a === 'ver') return polVersions(it, spec, reload);
      if (a === 'dup') { await spec.saveWith(null, { ...pick(it), name: `${it.name} (نسخة)` }, { active: '1', archived: false }); toast('تم النسخ'); return reload(); }
      if (a === 'arch') { await flip(it, { archived: !it.archived }); toast(it.archived ? 'تم الاسترجاع' : 'تمت الأرشفة'); return reload(); }
      if (a === 'tog') { await flip(it, { active: it.active ? '0' : '1' }); toast(it.active ? 'تم التعطيل' : 'تم التفعيل'); return reload(); }
    },
  });
}

/* --- أنواع الإجازات --- */
const PAY = { paid: ['مدفوع', 'b-ok'], partial: ['جزئي', 'b-info'], unpaid: ['غير مدفوع', 'b-warn'] };
const payOf = (it) => it.pay || (it.paid === false || it.paid === 'false' ? 'unpaid' : 'paid');
const leaveTypeSpec = () => {
  const api_ = cfgApi('leave_type');
  return {
    ...api_, newLabel: 'إنشاء نوع إجازة', searchPh: 'البحث عن أنواع الإجازات...', tpl: 'leave_template', chipsFirst: true, chipLabel: '',
    fields: [
      { k: 'pay', l: 'نوع الدفع', t: 'select', o: [['paid', 'مدفوع'], ['partial', 'مدفوع جزئياً'], ['unpaid', 'غير مدفوع']], d: 'paid' },
      { k: 'pay_pct', l: 'نسبة الدفع % (للمدفوع جزئياً)', t: 'number', d: 50, attrs: 'min="1" max="99"' },
      { k: 'days', l: 'الحد الأقصى سنوياً (يوم)', t: 'number', attrs: 'min="0"' }, { k: 'description', l: 'الوصف', full: true },
    ],
    nameLabel: 'اسم الإجازة',
    tabs: [['all', 'الكل', () => true], ['1', 'نشط', (it) => it.active], ['0', 'غير نشط', (it) => !it.active]],
    chips: [['all', 'الكل', () => true], ['paid', 'مدفوع', (it) => payOf(it) === 'paid'], ['unpaid', 'غير مدفوع', (it) => payOf(it) === 'unpaid'], ['partial', 'مدفوع جزئياً', (it) => payOf(it) === 'partial']],
    text: (it) => `${it.name} ${it.description || ''}`,
    cols: [['اسم الإجازة', (it) => `<b>${esc(it.name)}</b>`], ['نوع الدفع', (it) => `<span class="badge ${PAY[payOf(it)][1]}">${PAY[payOf(it)][0]}</span>`], ['حالة', statusBadge]],
    expand: (it) => `<div class="xgrid"><div><span class="muted small">الحد الأقصى سنوياً</span><b>${it.days ? `${esc(it.days)} يوم` : 'غير محدد'}</b></div><div><span class="muted small">نسبة الدفع</span><b>${payOf(it) === 'paid' ? '100%' : payOf(it) === 'unpaid' ? '0%' : `${esc(it.pay_pct || 50)}%`}</b></div><div><span class="muted small">الوصف</span><b>${esc(it.description || '—')}</b></div></div>`,
    pre: (it, b) => { b.paid = b.pay === 'paid'; if (b.pay !== 'partial') b.pay_pct = b.pay === 'paid' ? 100 : 0; },
    rowActs: (it) => `<div class="racts"><button class="sqb" data-a="del" data-id="${it.id}" title="حذف">${ico('trash')}</button><button class="sqb" data-a="arch" data-id="${it.id}" title="${it.active ? 'تعطيل' : 'تفعيل'}">${ico('archive')}</button><button class="sqb" data-a="edit" data-id="${it.id}" title="تعديل">${ico('edit')}</button><button class="sqb" data-a="dup" data-id="${it.id}" title="نسخ">${ico('copy')}</button></div>`,
    act: async (a, it, reload) => {
      const body = { name: it.name, pay: payOf(it), pay_pct: it.pay_pct, days: it.days, description: it.description, paid: payOf(it) === 'paid' };
      if (a === 'dup') { await api_.save(null, { ...body, name: `${it.name} (نسخة)`, active: '1' }); toast('تم النسخ'); reload(); }
      else if (a === 'arch') { await api_.save(it, { ...body, active: it.active ? '0' : '1' }); toast(it.active ? 'تم التعطيل' : 'تم التفعيل'); reload(); }
    },
  };
};
