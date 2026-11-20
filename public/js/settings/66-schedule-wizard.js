'use strict';
/* settings/66-schedule-wizard.js — مواعيد العمل: معالج الإضافة والتعديل (10 خطوات) */

/* --- نصوص "ماذا يعني هذا" --- */
HELP.schedule = {
  details: ['وزن يوم العمل', 'مقدار احتساب هذه الوردية كيوم عمل – وليس عدد الساعات.', null, ['مثال', '1 يوم كامل = 0.5 نصف يوم. لو الوردية نصف يوم تُحتسب 0.5 كيومين.']],
  basic: ['وزن يوم العمل', 'مقدار احتساب هذه الوردية كيوم عمل – وليس عدد الساعات. 1 = يوم كامل و0.5 = نصف يوم.', null],
  window: ['أبكر وقت مسموح لتسجيل الدخول', 'المدة التي يُسمح للموظف بتسجيل الدخول خلالها قبل بدء نافذة تسجيل الدخول. الوقت المسجَّل قبل النافذة لا يُحتسب ضمن ساعات العمل.', null, ['مثال', 'إذا بدأ الدخول في 9:00 صباحًا وتسمح بـ 30 دقيقة مبكرًا، فسيُسجَّل الدخول في 8:35 صباحًا باعتباره 9:00 صباحًا (دون رصيد إضافي).']],
  hours: ['عدد ساعات العمل', 'عدد ساعات الوردية الفعلية. نهاية الوردية بتتحسب تلقائيًا = البداية + عدد الساعات + مدة الاستراحة، وعليها بيتحسب الانصراف المبكر والوقت الإضافي.', null],
  final_in: ['وقت تسجيل الدخول النهائي', 'لو ضبطتيه، فلن يُسمح بأي تسجيل دخول بعد هذا الوقت، ويُوسَم الموظف بأنه غائب في هذا اليوم.', null, ['مثال', 'اضبطيه 11:00 صباحًا لضمان عدم تسجيل أحد الدخول للورديّة الصباحية بعد الساعة 11.']],
  earliest_out: ['أبكر وقت مسموح به لتسجيل الانصراف', 'أي انصراف قبل هذا الوقت يُرفض. اتركيه فاضي لو مفيش حد أدنى.', null],
  penalty: ['سياسة الجزاءات', 'التأخير والغياب والانصراف المبكر وعدم تسجيل الانصراف تُحدَّد مرة واحدة في سياسة الجزاءات وتُربط هنا. لا تحتوي السياسة على أوقات فعلية – تُحسب فروقها بالنسبة لنطاق الحضور في هذا الجدول.', 'تعديل السياسة يغيّر كل مواعيد العمل المرتبطة بها. لتغيير القواعد لهذا الجدول وحده، اربطي سياسة مختلفة.'],
  overtime: ['سياسة العمل الإضافي', 'الحد الأدنى والسقف والتقريب للوقت المعمول بعد الانصراف المحسوب تُحدَّد في سياسة العمل الإضافي. اتركيها غير مرتبطة إذا كان هذا الجدول لا يدفع عملًا إضافيًا.', null],
  face: ['التعرف على الوجه', 'تحقق من الهوية عبر مسح الوجه عند تسجيل الحضور والانصراف. الموظفون اللي مالهمش صورة وجه مسجّلة بيتعاملوا حسب إعدادات الشركة.', null],
  remind: ['تذكير بتسجيل الخروج', 'يرسل تذكيرًا قرب النهاية الرسمية للموظفين اللي لسه ما سجّلوا خروج، وتجنّب علامة تسجيل الخروج المفقود.', null],
  breaks: ['فترات الاستراحة', 'عند التفعيل، تقع فترات الراحة داخل يوم العمل. تُخصم فترات الراحة غير المدفوعة من إجمالي ساعات العمل، أما المدفوعة فلا.', null, ['مثال', 'وردية مدتها 8 ساعات مع استراحة غداء غير مدفوعة لمدة ساعة تتطلب 9 ساعات حضور (9:00 صباحًا ← 6:00 مساءً).']],
  perms: ['فترات الاستراحة', 'تطبيق قواعد الإذن المخصصة لهذا التوقيت بدل القواعد العامة في ملف الإجازات.', null],
  remote: ['العمل عن بُعد', 'يسمح للموظفين على هذا الجدول بتسجيل الدخول من خارج المكتب.', null],
  assign: ['قواعد التعيين', 'يتحكم هل يقدر أي شخص يعيّن توقيت العمل ده لجدول أو مهمة أو إعداد تسجيل الدخول.', null],
};

for (const v of Object.values(HELP.schedule)) if (v[3]) { v[1] += ` ${v[3][0]}: ${v[3][1]}`; v.length = 3; }

const SCHED_NEW = () => ({
  name: '', name_en: '', type: 'full', weight: 1, require_start: false, penalty_id: '', overtime_id: '',
  start: '09:00', ci_to: '', end: '17:00', brk: 0, work_hours: 8, last_out: '', earliest_in: '', calc_out_from_in: true,
  final_in: '', earliest_out: '', allow_early_out: false, auto_out: false,
  face_on: false, face_remote: false, remind_in: false, remind_in_t: '08:20', remind_out: false, remind_out_t: '16:30',
  break_override: true, perm_paid: true, perm_unpaid: true, remote_override: true, assign_anyone: true,
});
const swMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const swAdd = (t, n) => { const v = (((swMin(t) + Math.round(n)) % 1440) + 1440) % 1440; return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; };
const swTog = (key, on, title, sub, extra = '') => `<div class="swrow ${on ? 'on' : ''}"><label class="swtg"><span><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="tgl"><input type="checkbox" data-tg="${key}" ${on ? 'checked' : ''}><i></i></span></label>${extra}</div>`;
const swTime = (key, v, help) => `<input type="time" class="swt" data-k="${key}" value="${esc(v || '')}" ${help ? `data-help="${help}"` : ''}>`;
const swPolSel = (key, arr, v, ph) => `<select data-k="${key}"><option value="">${ph}</option>${arr.map((p) => `<option value="${p.id}" ${String(v ?? '') === String(p.id) ? 'selected' : ''}>${esc(p.name)}${p.archived ? ' (محفوظ)' : !p.active ? ' (غير نشط)' : ''}</option>`).join('')}</select>`;

/* --- معاينة سياسة الجزاءات المرتبطة --- */
const swPenaltyPreview = (d) => {
  const p = POL.pen.find((x) => String(x.id) === String(d.penalty_id ?? ''));
  const head = (title, goBtn) => `<div class="swlink ${p ? 'on' : ''}" data-help="penalty"><div><small>سياسة الجزاءات المرتبطة</small><b>${p ? esc(p.name) : 'لا توجد سياسة – تُطبَّق الإعدادات العامة'}</b></div>${goBtn}</div>`;
  const goBtn = '<button type="button" class="swgo" data-swgo="0">التغيير من المعلومات الأساسية</button>';
  if (!p) return head('', goBtn) + '<p class="muted small">اربطي سياسة جزاءات من الخطوة الأولى لتظهر تفاصيل التأخير والانصراف المبكر هنا.</p>';
  const s = d.start, g = Number(p.grace) || 0, e = d.end;
  const tiers = (p.tiers || []).slice().sort((a, b) => a.from - b.from);
  const kindTxt = (t) => (t.kind === 'minutes' ? `راتب × ${t.value} عن كل دقيقة` : t.kind === 'fixed' ? `خصم ${t.value} جنيه` : `خصم ${t.value} من أجر اليوم`);
  const sec = (title, rows, foot) => `<div class="swsec"><div class="swsh">${title}</div>${rows ? `<div class="swth"><span>متى</span><span>الجزاءات</span></div>${rows}` : ''}${foot ? `<div class="swsf">${foot}</div>` : ''}</div>`;
  const rowH = (a, b, c, col) => `<div class="swr ${col || ''}"><div><b>${a}</b>${b ? `<small>${b}</small>` : ''}</div><div>${c}</div></div>`;
  const out = [`<div class="muted small swcalc">محسوبة وفق هذا الجدول · آخر موعد حضور ${tm12(s)} · الانصراف المحسوب ${tm12(e)}</div>`,
    `<div class="swsec"><div class="swsh">في الموعد</div><div class="swr ok"><div><b dir="ltr">${tm12(s)} - ${tm12(swAdd(s, g))}</b></div><div></div></div></div>`];
  if (p.late_on) {
    out.push(sec('التأخير', tiers.map((t) => {
      const a = swAdd(s, t.from), b = t.to === null || t.to === '' || t.to === undefined ? null : swAdd(s, t.to);
      return rowH(b ? `تأخير ${t.from}-${t.to} دقيقة` : `يُعتبر متأخرًا من ${t.from} دقيقة فأكثر`, `الشريحة ${tiers.indexOf(t) + 1} · ${tm12(a)}${b ? ` - ${tm12(b)}` : ' فأكثر'}`, kindTxt(t), 'blue');
    }).join(''), 'الرواتب لكل دقيقة <b>مخصومة من المرتب</b>'));
  }
  if (p.early_on) out.push(sec('الانصراف المبكر', rowH(`الانصراف قبل ${tm12(e)}`, `بعد سماحية ${Number(p.early_grace) || 0} د`, `راتب × ${p.early_factor} عن كل دقيقة`, 'blue'), 'مخصومة من <b>المرتب</b>'));
  out.push(sec('غياب', rowH('يُعتبر غائبًا', 'لا يوجد حضور ولا إجازة معتمدة', `خصم ${p.absence_factor} يوم(أيام)`, 'blue'), 'مخصومة من <b>المرتب</b>'));
  if (p.partial_on) out.push(sec('تسجيل حضور دون انصراف', rowH('سجّل حضورًا ولم يسجّل انصرافًا', '', p.partial_kind === 'fixed' ? `خصم ${p.partial_value} جنيه` : `خصم ${p.partial_value} من أجر اليوم`, 'blue'), 'مخصومة من <b>المرتب</b>'));
  return head('', goBtn) + out.join('');
};

/* --- معاينة سياسة الوقت الإضافي المرتبطة --- */
const swOvertimePreview = (d) => {
  const p = POL.ot.find((x) => String(x.id) === String(d.overtime_id ?? ''));
  const goBtn = '<button type="button" class="swgo" data-swgo="0">التغيير من المعلومات الأساسية</button>';
  const head = `<div class="swlink ${p ? 'on' : ''}" data-help="overtime"><div><small>سياسة العمل الإضافي المرتبطة</small><b>${p ? esc(p.name) : 'لا توجد سياسة – تُطبَّق الإعدادات العامة'}</b></div>${goBtn}</div>`;
  if (!p) return `${head}<p class="muted small">اربطي سياسة وقت إضافي من الخطوة الأولى لتظهر تفاصيلها هنا.</p>`;
  const row = (l, v) => `<div class="swkv"><b>${l}</b><span>${v}</span></div>`;
  const rnd = !p.calc_on ? '—' : p.rounding === 'up' ? `تقريب للأعلى · ${p.round_unit} د` : p.rounding === 'down' ? `تقريب للأسفل · ${p.round_unit} د` : 'الدقائق الفعلية';
  return head + `<div class="swkvs">${row('يبدأ الحساب', !p.calc_on ? 'لا يُحتسب' : Number(p.after_min) > 0 ? `بعد ${p.after_min} دقيقة من الانصراف` : 'من أول دقيقة إضافية')}${row('التقريب', rnd)}${row('الحد اليومي', Number(p.cap_hours) > 0 ? `${p.cap_hours} ساعة` : 'لا أحد')}${row('معامل الأجر', `× ${p.factor ?? SETV.overtime_factor ?? 1.5}`)}${row('طلب العمل الإضافي', 'يبدأه النظام تلقائيًا (ويحتاج إلى موافقة)')}</div>`;
};

function scheduleSteps() {
  const tgBind = (root, d, h) => root.querySelectorAll('[data-swgo]').forEach((b) => (b.onclick = () => h.go(Number(b.dataset.swgo))));
  const endNote = (d) => `<p class="muted small" id="swend">نهاية الوردية المحسوبة: <b dir="ltr">${tm12(d.end)}</b> (البداية + ${Number(d.work_hours) || 0} س + استراحة ${Number(d.brk) || 0} د)</p>`;
  return [
    { title: 'المعلومات الأساسية', sub: 'الاسم ونوع يوم العمل', icon: 'file', help: 'basic',
      body: (d) => `<div class="pwfld" data-help="basic"><label class="lbl">اسم التوقيت</label><input data-k="name" value="${esc(d.name)}" maxlength="120" placeholder="مثال: (9 am-5 pm)" autocomplete="off">
          ${d.name_en || d._en ? `<input data-k="name_en" value="${esc(d.name_en)}" maxlength="120" placeholder="Name in English" dir="ltr" style="margin-top:8px">` : '<button type="button" class="swadd" data-swen>+ أضف اسمًا بلغات متعددة</button>'}</div>
        <div class="pwfld" data-help="basic"><label class="lbl">نوع يوم العمل</label>${pwRadio('type', d.type, [['full', 'يوم كامل', 'تُحتسب الوردية كيوم عمل كامل'], ['half', 'نصف يوم', 'تُحتسب الوردية كنصف يوم']], 'two')}</div>
        <div class="pwfld" data-help="details"><label class="lbl">وزن يوم العمل</label>${pwStep('data-k="weight"', d.weight, 0.25, 0.25, 5)}</div>
        ${swTog('require_start', d.require_start, 'هل يحتاج الموظفون إلى تسجيل الدخول في بداية كل يوم عمل؟', 'مطلوب قبل الحضور.')}
        <div class="pwfld" style="margin-top:18px" data-help="penalty"><label class="lbl">سياسة الجزاءات المرتبطة</label>${swPolSel('penalty_id', POL.pen, d.penalty_id, 'بدون سياسة (الإعدادات العامة)')}<p class="muted small">تُكتب السياسات لمجموعة من الموظفين كفروق زمنية عن مواعيد توقيت العمل هذا. اختاري واحدة وستُطبَّق على هذا الجدول فورًا.</p></div>
        <div class="pwfld" data-help="overtime"><label class="lbl">سياسة العمل الإضافي المرتبطة</label>${swPolSel('overtime_id', POL.ot, d.overtime_id, 'بدون سياسة (الإعدادات العامة)')}</div>`,
      on: (root, d, h) => { const b = root.querySelector('[data-swen]'); if (b) b.onclick = () => { d._en = true; h.redraw(); }; },
      check: (d) => (String(d.name || '').trim() ? (Number(d.weight) > 0 && Number(d.weight) <= 5 ? null : 'وزن يوم العمل بين 0.25 و 5') : 'اكتبي اسم التوقيت') },
    { title: 'تفاصيل الجدول', sub: 'متى يمكن للموظفين تسجيل الحضور وما مدة العمل؟', icon: 'clock', help: 'window',
      body: (d) => `<div class="pwfld" data-help="window"><label class="lbl">ما هو النطاق الزمني المتوقع لتسجيل الحضور؟ <em class="req">*</em></label>
          <div class="swpair">${swTime('start', d.start)}<i>←</i>${swTime('ci_to', d.ci_to)}</div></div>
        <div class="swgrid"><div class="pwfld" data-help="hours"><label class="lbl">عدد ساعات العمل؟ <em class="req">*</em></label>${pwStep('data-k="work_hours"', d.work_hours, 0.5, 0.5, 24)}</div>
          <div class="pwfld" data-help="hours"><label class="lbl">ما هو آخر وقت لتسجيل الخروج؟ <em class="req">*</em></label>${swTime('last_out', d.last_out)}</div></div>
        ${endNote(d)}
        <div class="pwfld" data-help="hours"><label class="lbl">استراحة (دقيقة)</label>${pwNum('min="0" max="480" step="5" data-k="brk"', d.brk, 'د')}</div>
        <div class="pwfld" data-help="window"><label class="lbl">ما المدة التي يمكن للموظفين تسجيل الدخول قبل وقتهم المجدول؟</label>${swTime('earliest_in', d.earliest_in)}</div>
        ${swTog('calc_out_from_in', d.calc_out_from_in, 'هل يجب حساب وقت تسجيل الخروج بناءً على وقت تسجيل الدخول الفعلي؟', 'يربط وقت تسجيل الخروج وحساب العمل الإضافي بوقت تسجيل الدخول الفعلي للموظف.')}
        <details class="swadv" ${d.final_in || d.earliest_out ? 'open' : ''}><summary>إعدادات إضافية <span class="muted">– اختياري</span></summary>
          <div class="swgrid"><div class="pwfld" data-help="final_in"><label class="lbl">ما هو وقت تسجيل الدخول النهائي؟</label>${swTime('final_in', d.final_in)}</div>
            <div class="pwfld" data-help="earliest_out"><label class="lbl">ما أبكر وقت مسموح به لتسجيل الانصراف؟</label>${swTime('earliest_out', d.earliest_out)}</div></div></details>
        ${swTog('allow_early_out', d.allow_early_out, 'السماح بتسجيل الانصراف مبكرًا', '')}${swTog('auto_out', d.auto_out, 'تسجيل الانصراف التلقائي للموظفين الذين لم يسجلوا انصرافهم', '')}`,
      check: (d) => (!d.start || !d.end ? 'حددي وقت البداية'
        : !(Number(d.work_hours) > 0 && Number(d.work_hours) <= 24) ? 'عدد ساعات العمل بين 0.5 و 24'
          : d.final_in && swMin(d.final_in) < swMin(d.start) ? 'وقت الدخول النهائي لازم يكون بعد بداية الوردية' : null) },
    { title: 'سياسة الجزاءات', sub: 'التأخير والغياب والانصراف المبكر وعدم تسجيل الانصراف', icon: 'shield', help: 'penalty',
      body: (d) => swPenaltyPreview(d), on: tgBind },
    { title: 'سياسة العمل الإضافي', sub: 'الحد الأدنى والسقف والتقريب للوقت بعد الانصراف المحسوب', icon: 'chart', help: 'overtime',
      body: (d) => swOvertimePreview(d), on: tgBind },
    { title: 'التعرف على الوجه', sub: 'تحقق من الهوية عبر مسح الوجه عند تسجيل الحضور والانصراف', icon: 'eye', help: 'face',
      body: (d) => `${swTog('face_on', d.face_on, 'تفعيل التعرف على الوجه عند تسجيل الدخول / الخروج', '')}${swTog('face_remote', d.face_remote, 'يتطلب أيضًا التعرف على الوجه للعاملين عن بُعد', '')}` },
    { title: 'تذكيرات الحضور والانصراف', sub: 'تنبيه الموظفين الذين قد ينسون تسجيل الحضور أو الانصراف', icon: 'bell', help: 'remind',
      body: (d) => `${swTog('remind_in', d.remind_in, 'تذكير الموظفين بتسجيل الدخول', '', d.remind_in ? `<div class="swsub">${swTime('remind_in_t', d.remind_in_t)}</div>` : '')}
        ${swTog('remind_out', d.remind_out, 'تذكير الموظفين بتسجيل الخروج', '', d.remind_out ? `<div class="swsub">${swTime('remind_out_t', d.remind_out_t)}</div>` : '')}`,
      check: (d) => ((d.remind_in && !d.remind_in_t) || (d.remind_out && !d.remind_out_t) ? 'حددي وقت التذكير' : null) },
    { title: 'إعدادات الاستراحات', sub: 'استراحات مدفوعة وغير مدفوعة ضمن يوم العمل', icon: 'pause', help: 'breaks',
      body: (d) => swTog('break_override', d.break_override, 'تجاوز إعدادات الاستراحة الافتراضية', 'يطبق قواعد استراحة مخصصة، متجاوزًا أي قواعد محددة في ملفات تعريف الإجازات والاستراحات.') },
    { title: 'إعدادات الأذونات', sub: 'غيابات قصيرة مدفوعة وغير مدفوعة أثناء الوردية', icon: 'key', help: 'perms',
      body: (d) => `${swTog('perm_paid', d.perm_paid, 'تجاوز إعدادات الأذونات المدفوعة', 'يطبق قواعد الإذن المدفوع المخصصة لتوقيت العمل هذا، مع تجاوز تلك المحددة في ملف الإجازات والاستراحات.')}${swTog('perm_unpaid', d.perm_unpaid, 'تجاوز إعدادات الأذونات غير المدفوعة', 'يطبق قواعد الإذن غير المدفوع المخصصة لتوقيت العمل هذا، مع تجاوز تلك المحددة في ملف الإجازات والاستراحات.')}` },
    { title: 'العمل عن بُعد', sub: 'ما إذا كان هذا التوقيت يسمح بالعمل من أي مكان', icon: 'pin', help: 'remote',
      body: (d) => swTog('remote_override', d.remote_override, 'تجاوز إعدادات العمل عن بعد', 'تطبيق قواعد العمل عن بُعد المخصصة لهذا التوقيت، مع تجاوز أي قواعد محددة في ملف الشركة.') },
    { title: 'قواعد التعيين', sub: 'من يمكنه تعيين هذا التوقيت للجداول وإعدادات الحضور', icon: 'users', help: 'assign',
      body: (d) => swTog('assign_anyone', d.assign_anyone, 'يمكن لأي شخص تعيين توقيت العمل هذا لجدول أو مهمة أو إعداد تسجيل الدخول', '') },
  ];
}

function openScheduleWizard(spec, it, reload) {
  const base = SCHED_NEW();
  const d = it ? { ...base, ...Object.fromEntries(SCHED_KEYS.map((k) => [k, k === 'name' ? it.name : it[k]]).filter(([, v]) => v !== null && v !== undefined)) } : base;
  if (it) {
    if (it.work_hours === undefined || it.work_hours === null) d.work_hours = Number(((swMin(d.end) - swMin(d.start) + (swMin(d.end) <= swMin(d.start) ? 1440 : 0) - (Number(d.brk) || 0)) / 60).toFixed(4));
    ['penalty_id', 'overtime_id'].forEach((k) => { d[k] = d[k] === null || d[k] === undefined ? '' : String(d[k]); });
  } else d.end = swAdd(d.start, d.work_hours * 60 + (Number(d.brk) || 0));
  const recalcEnd = (dd) => { dd.end = swAdd(dd.start, (Number(dd.work_hours) || 0) * 60 + (Number(dd.brk) || 0)); };
  policyWizard({
    d, guided: !it, noMode: true, icon: 'clock', groups: [{ title: 'الجدول', idx: [0, 1, 2, 3] }, { title: 'إعدادات يوم العمل', idx: [4, 5, 6, 7, 8, 9] }],
    steps: scheduleSteps(), help: HELP.schedule,
    title: 'مواعيد العمل', subtitle: it ? `تعديل: ${it.name}` : 'اضبطي القواعد التي تنظم الحضور لهذا الجدول', progressLabel: 'مواعيد العمل',
    onInput: (k, dd, old, root) => {
      if (['start', 'work_hours', 'brk'].includes(k)) {
        recalcEnd(dd);
        const n = root.querySelector('#swend');
        if (n) n.innerHTML = `نهاية الوردية المحسوبة: <b dir="ltr">${tm12(dd.end)}</b> (البداية + ${Number(dd.work_hours) || 0} س + استراحة ${Number(dd.brk) || 0} د)`;
      }
    },
    onChange: (k, dd) => {
      if (k === 'type') { if (dd.type === 'half' && Number(dd.weight) === 1) dd.weight = 0.5; else if (dd.type === 'full' && Number(dd.weight) === 0.5) dd.weight = 1; return true; }
      return ['remind_in', 'remind_out'].includes(k);
    },
    onSave: (dd) => spec.saveWith(it, dd), done: reload,
  });
}
