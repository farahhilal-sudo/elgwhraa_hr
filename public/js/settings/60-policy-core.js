'use strict';
/* settings/60-policy-core.js — سياسات الحضور: الحالة والتبويبات والحسابات التجريبية ونصوص المساعدة */

/* ====== سياسات الحضور (جزاءات + وقت إضافي): قوائم + معالج بخطوات على شكل الشاشات المرجعية ====== */
const POL = { pen: [], ot: [] }; // آخر سياسات اتحمّلت (بتظهر في اختيار السياسة داخل مواعيد العمل)
const clone = (x) => JSON.parse(JSON.stringify(x ?? null));
const plural = (n, one, many) => (n === 1 ? one : `${n} ${many}`);
const stamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ');
const POL_KEYS = {
  penalty_policy: ['name', 'grace', 'early_grace', 'late_on', 'early_on', 'partial_on', 'absence_factor', 'early_factor', 'late_method', 'partial_kind', 'partial_value', 'tiers'],
  overtime_policy: ['name', 'calc_on', 'after_min', 'cap_hours', 'factor', 'rounding', 'round_unit'],
};
const polState = (it) => (it.archived ? 'arch' : it.active ? 'on' : 'off');
const POL_TABS = [['on', 'نشط', (it) => polState(it) === 'on'], ['off', 'غير نشط', (it) => polState(it) === 'off'], ['arch', 'محفوظ', (it) => polState(it) === 'arch']];
const polBadge = (it) => { const s = polState(it); return `<span class="badge ${s === 'on' ? 'b-ok' : s === 'arch' ? 'b-info' : ''}">${{ on: 'نشط', off: 'غير نشط', arch: 'محفوظ' }[s]}</span>`; };
const linkedCell = (it) => (it._sch && it._sch.length
  ? `<button class="link lk" data-a="links" data-id="${it.id}">${plural(it._sch.length, 'توقيت عمل واحد', 'توقيتات عمل')}</button><div class="muted small">${esc(it._sch.slice(0, 3).map((s) => s.name).join('، '))}${it._sch.length > 3 ? '…' : ''}</div>`
  : '<span class="muted small">غير مرتبط بعد</span>');

/* نفس معادلات السيرفر (server.js) عشان المعاينة تطلع بنفس الرقم */
function polLateCalc(p, late, daily, hourly) {
  if (late <= (Number(p.grace) || 0)) return 0;
  let total = 0;
  for (const t of [...(p.tiers || [])].sort((a, b) => a.from - b.from)) {
    const to = t.to === null || t.to === undefined || t.to === '' ? Infinity : Number(t.to);
    if (late < t.from) break;
    if (t.kind === 'minutes') total += ((Math.min(late, to) - t.from + 1) / 60) * hourly * Number(t.value);
    else if (late <= to) total += t.kind === 'fixed' ? Number(t.value) : Number(t.value) * daily;
  }
  return total;
}
function polOtCalc(o, hours) {
  if (!o.calc_on) return 0;
  let h = Math.max(0, hours - (Number(o.after_min) || 0) / 60);
  if (Number(o.cap_hours) > 0) h = Math.min(h, Number(o.cap_hours));
  const unit = (Number(o.round_unit) || 15) / 60;
  if (o.rounding === 'up') h = Math.ceil(h / unit - 1e-9) * unit;
  else if (o.rounding === 'down') h = Math.floor(h / unit + 1e-9) * unit;
  return h;
}

/* --- نصوص "ماذا يعني هذا" --- */
const HELP = {
  penalty_policy: {
    details: ['سياسة الجزاءات', 'سياسة واحدة بتغطي التأخير والانصراف المبكر والغياب والانصراف الناقص. بتتكتب مرة واحدة وبتتربط بمواعيد العمل من صفحة «مواعيد العمل».', 'مفيش هنا أوقات فعلية: كل حاجة بتتحسب بفرق الدقائق عن وردية الموظف.'],
    pick: ['اختيار الجزاءات', 'فعّلي البنود اللي عايزة السياسة دي تطبقها. البند غير المفعّل بيتجاهل خالص ومش بيتخصم منه حاجة. الغياب مطبق دايماً.', null],
    absence: ['الغياب', 'الغياب هو يوم عمل مفيهوش تسجيل حضور ولا إجازة معتمدة. بيتخصم أجر اليوم × المعامل (المعامل 1 = يوم كامل).', 'أجر اليوم = المرتب الأساسي ÷ 30.'],
    grace: ['السماحية', 'لو الموظف وصل خلال المدة دي بعد بداية الوردية يعتبر في الميعاد ومفيش خصم. لو عدّاها، التأخير بيتحسب من بداية الوردية حسب الشرائح.', null],
    method: ['طريقة الحساب', 'دقائق: الخصم = المعامل × الدقائق اللي وقعت داخل نطاق الشريحة ÷ 60 × أجر الساعة. فترات زمنية: لو التأخير وقع داخل الشريحة بيتخصم مبلغ ثابت (أو جزء من اليوم) مرة واحدة.', null],
    deduct: ['خصم من', 'الجهة اللي بيتخصم منها الجزاء. حالياً الخصم بيتم من المرتب فقط. الخصم من رصيد الإجازات غير متاح في النظام.', 'الخصم من الإجازات مش مفعّل، فالجزاءات كلها بتتخصم من المرتب.'],
    tier: ['نطاق الشريحة', 'بداية الشريحة ونهايتها بالدقائق من بداية الوردية. الشريحة اللي بعدها لازم تبدأ بعد نهاية اللي قبلها، وسيبي «إلى» فاضية في آخر شريحة عشان تشمل أي تأخير أكبر.', 'أي تأخير بعد نهاية آخر شريحة (لو ليها حد أعلى) مش هيتخصم.'],
    calc: ['جرّبي حساب خصم', 'اكتبي مرتب ودقائق تأخير وشوفي الخصم بنفس معادلة الرواتب.', null],
    early: ['الانصراف المبكر', 'لو الموظف مشي قبل نهاية الوردية بأكتر من السماحية، كل دقائق الانصراف المبكر بتتخصم: الدقائق ÷ 60 × أجر الساعة × المعامل.', null],
    partial: ['الانصراف الناقص', 'يوم فيه تسجيل حضور من غير تسجيل انصراف (وفات اليوم). بيتخصم جزء من أجر اليوم أو مبلغ ثابت عن كل يوم.', 'مش بيتطبق على اليوم الحالي.'],
  },
  overtime_policy: {
    details: ['سياسة الوقت الإضافي', 'قواعد احتساب الساعات الإضافية المعتمدة. بتتكتب مرة واحدة وبتتربط بمواعيد العمل من صفحة «مواعيد العمل».', null],
    calc: ['يُحتسب / لا يُحتسب', 'لو «لا يُحتسب»، الساعات الإضافية المعتمدة على الورديات المربوطة بالسياسة دي مش بتتدفع.', null],
    start: ['بداية الاحتساب', 'عدد الدقائق اللي بتتشال من أول كل طلب وقت إضافي معتمد قبل ما يبدأ الاحتساب (0 = من أول دقيقة).', null],
    cap: ['الحد اليومي', 'أقصى عدد ساعات إضافية بتتحسب في الطلب الواحد. اكتبي 0 لو مفيش حد.', null],
    rounding: ['التقريب', 'الدقائق الفعلية: من غير تقريب. للأعلى/للأسفل: بيتقرب لأقرب وحدة (مثلاً 15 دقيقة).', null],
    factor: ['معامل الأجر', 'أجر الساعة الإضافية = أجر الساعة العادية × المعامل (مثلاً 1.5).', null],
    sim: ['جرّبي حساب', 'اكتبي ساعات طلب معتمد وشوفي الساعات المحتسبة بعد البداية والحد والتقريب.', null],
  },
};
