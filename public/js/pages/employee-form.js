'use strict';
/* pages/employee-form.js — نموذج إضافة/تعديل موظف (بخطوات) وبياناته */

const GENDER_AR = { male: 'ذكر', female: 'أنثى' };
const MARITAL_AR = { single: 'أعزب / عزباء', married: 'متزوج / متزوجة', divorced: 'مطلق / مطلقة', widowed: 'أرمل / أرملة' };

// ===== نموذج بيانات الموظف: خطوات بقائمة أقسام جانبية =====
async function empForm(u, done) {
  let locs = [];
  try { locs = await api('/locations'); } catch { /* مفيش صلاحية: نكمل من غير */ }
  let ppl = [];
  try { ppl = (await api('/employees')).filter((x) => !x.pending && (!u || x.id !== u.id)); } catch { /* تجاهل */ }
  let scheds = [];
  try { scheds = (await api('/config/schedule')).filter((x) => x.active); } catch { /* مفيش صلاحية إعدادات */ }
  let lprofs = [];
  try { lprofs = (await api('/config/leave_profile')).filter((x) => x.active && !x.archived); } catch { /* مفيش صلاحية إعدادات */ }
  const isNew = !u, canSal = isNew || u.base_salary !== undefined, meAdmin = S.me.user.is_admin;
  const v = (k, d = '') => esc(u && u[k] != null && u[k] !== '' ? u[k] : d);
  const uniqOf = (k) => [...new Set(ppl.map((x) => x[k]).filter(Boolean))];
  const faceTxt = isNew ? 'هتسجّلها الموظفة من جهازها عند أول تسجيل حضور' : u.face_exempt ? 'غير مطلوبة (حساب مدير)' : u.face_enrolled ? 'مسجلة' : 'غير مسجلة (بتسجّلها الموظفة من جهازها)';
  const C = (u && u.emp_cfg) || {}, cv = (k, d) => (C[k] === undefined ? d : C[k]);
  const ctg = (k, d, t, sub) => `<div class="ew-tg"><label><span><b>${t}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="tgl"><input type="checkbox" data-c="${k}" ${cv(k, d) ? 'checked' : ''}><i></i></span></label></div>`;
  const csel = (k, d, l, opts, full) => `<label class="f ${full ? 'full' : ''}">${l}<select data-c="${k}">${opts.map(([x, t]) => `<option value="${x}" ${String(cv(k, d)) === String(x) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
  const cin = (k, d, l, attrs = '') => `<label class="f">${l}<input data-c="${k}" value="${esc(cv(k, d))}" ${attrs}></label>`;
  const lists = { allow_list: (C.allow_list || (u && Number(u.allowances) > 0 ? [{ name: 'بدلات', amount: Number(u.allowances) }] : [])).map((x) => ({ ...x })), deduct_list: (C.deduct_list || []).map((x) => ({ ...x })) };
  const listHtml = (key) => `<div class="ew-list" data-list="${key}"></div><button type="button" class="btn alt sm ew-addrow" data-addrow="${key}">＋ ${key === 'allow_list' ? 'إضافة بدل' : 'إضافة خصم مخصص'}</button><div class="ew-total muted">الإجمالي: <b data-total="${key}">0.00</b></div>`;
  const steps = [
    { t: 'الهوية وتسجيل الدخول', s: 'البيانات والصورة والحساب', h: 'من هو هذا الموظف وكيف يسجّل دخوله', html: `
      <label class="f full"><span>الاسم <b class="req">*</b></span><input name="name" value="${v('name')}" required maxlength="80"></label>
      ${isNew ? `<div class="ew-info full">${ico('info')}<span>اسم المستخدم = <b>رقم الهاتف</b>، وكلمة المرور الافتراضية <b dir="ltr">123456789</b>. الموظف ما بيحتاجش يحط كلمة سر لنفسه، وتقدر تغيّرها بعدين من بياناته.</span></div>` : `<label class="f"><span>كلمة مرور جديدة (اختياري)</span><input name="password" minlength="6" autocomplete="new-password"></label>`}
      <label class="f">تاريخ الميلاد<input type="date" name="birth_date" value="${v('birth_date')}"></label>
      <div class="f"><span>النوع</span><div class="ew-radios">${Object.entries(GENDER_AR).map(([k, l]) => `<label class="ew-rad"><input type="radio" name="gender" value="${k}" ${u && u.gender === k ? 'checked' : ''}><i></i>${l}</label>`).join('')}</div></div>
      <label class="f">الحالة الاجتماعية<select name="marital_status"><option value="">—</option>${Object.entries(MARITAL_AR).map(([k, l]) => `<option value="${k}" ${u && u.marital_status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="f"><span>رقم الهاتف${isNew ? ' (اسم المستخدم) <b class="req">*</b>' : ''}</span><input name="phone" value="${v('phone')}" maxlength="30" inputmode="tel" ${isNew ? 'required pattern="[0-9+\\s\\-]{6,30}"' : ''}></label>
      <label class="f full">البريد الإلكتروني<input type="email" name="email" value="${v('email')}" maxlength="100"></label>
      <div class="f full"><span>بصمة الوجه</span><div class="ew-face">${ico('user')}<b id="ewFaceTxt">${faceTxt}</b>${!isNew && u.face_enrolled && !u.is_admin ? '<button type="button" class="btn alt sm" id="ewResetFace">إعادة ضبط</button>' : ''}</div></div>
      ${!isNew && !u.is_admin ? `<label class="ew-chk full"><input type="checkbox" name="active_cb" ${u.active ? 'checked' : ''}> السماح لهذا الموظف بتسجيل الدخول</label>` : ''}` },
    { t: 'التوظيف', s: 'الكود والتواريخ والدور', h: 'بيانات التوظيف والإجازات', html: `
      <label class="f">كود الموظف<input name="employee_code" value="${v('employee_code')}" maxlength="30"></label>
      <label class="f">تاريخ التعيين<input type="date" name="hire_date" value="${esc((u && u.hire_date) || todayStr())}"></label>
      ${meAdmin && (isNew || u.id !== S.me.user.id) ? `<label class="f">نوع الحساب<select name="role"><option value="employee" ${u && u.is_admin ? '' : 'selected'}>موظف (بصلاحيات يحددها المدير)</option><option value="admin" ${u && u.is_admin ? 'selected' : ''}>مدير (كل الصلاحيات)</option></select></label>` : ''}` },
    { t: 'مكان العمل', s: 'المكتب والقسم والمنصب', h: 'أين يعمل وبأي وردية', html: `
      ${locs.length ? `<div class="full"><div class="muted small" style="margin-bottom:6px;font-weight:600">مواقع الحضور المسموحة (لو ماحددتيش، يسجّل من أي موقع)</div><div class="row">${locs.map((l) => `<label class="perm"><input type="checkbox" data-loc="${l.id}" ${u && u.location_ids && u.location_ids.includes(l.id) ? 'checked' : ''}>${esc(l.name)}</label>`).join('')}</div></div>` : ''}
      <label class="f">القسم<input name="department" value="${v('department')}" list="ewdl-d" maxlength="80"></label>
      <label class="f">المنصب<input name="job_title" value="${v('job_title')}" list="ewdl-j" maxlength="80"></label>
      <datalist id="ewdl-d">${uniqOf('department').map((x) => `<option value="${esc(x)}">`).join('')}</datalist><datalist id="ewdl-j">${uniqOf('job_title').map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      ${scheds.length ? `<label class="f full">موعد العمل (بيملأ بداية ونهاية الوردية)<select id="schsel"><option value="">— يدوي —</option>${scheds.map((x) => `<option value="${esc(x.start)}|${esc(x.end)}">${esc(x.name)} (${esc(x.start)} - ${esc(x.end)})</option>`).join('')}</select></label>` : ''}
      <label class="f">بداية الوردية<input type="time" name="shift_start" value="${esc((u && u.shift_start) || '09:00')}"></label>
      <label class="f">نهاية الوردية<input type="time" name="shift_end" value="${esc((u && u.shift_end) || '17:00')}"></label>` },
    { t: 'التسلسل الإداري', s: 'المدير المباشر', h: 'لمن يتبع هذا الموظف', html: `
      <label class="f full">المدير المباشر<select name="manager_id"><option value="">—</option>${ppl.map((x) => `<option value="${x.id}" ${u && u.manager_id === x.id ? 'selected' : ''}>${esc(x.name)}${x.job_title ? ' — ' + esc(x.job_title) : ''}</option>`).join('')}</select></label>` },
    { t: 'متطلبات الدولة', s: 'الجنسية والهوية الوطنية', h: 'بيانات الجنسية والهوية', html: `
      <label class="f">الجنسية<input name="nationality" value="${v('nationality')}" maxlength="40"></label>
      <label class="f">الهوية الوطنية (الرقم القومي)<input name="national_id" value="${v('national_id')}" maxlength="30" inputmode="numeric"></label>` },
    { t: 'الإعدادات الأساسية', s: 'كيفية احتساب يوم العمل', h: 'كيفية احتساب يوم العمل لهذا الموظف', g: 'att', html: `
      ${csel('day_type', 'fixed', 'نوع يوم العمل', [['fixed', 'مواعيد العمل الثابتة']], true)}
      ${cin('work_group', '', 'مجموعة العمل', 'maxlength="60"')}${cin('work_team', '', 'فريق عمل', 'maxlength="60"')}
      ${csel('week_start', 'sat', 'اليوم الأول من الأسبوع', [['sat', 'السبت'], ['sun', 'الأحد'], ['mon', 'الاثنين']])}` },
    { t: 'إعدادات تسجيل الحضور', s: 'عدد مرات تسجيل الحضور', h: 'عدد مرات تسجيل حضور الموظف، ومن أين، وما النماذج التي يملؤها.', g: 'att', html: `${ctg('multi_punch', true, 'السماح بتسجيلات الوصول المتعددة أثناء الورديات', 'تمكين الموظفين من تسجيل الحضور عدة مرات في اليوم')}` },
    { t: 'العمل عن بعد', s: 'هل يمكن العمل من المنزل', h: 'هل يمكن للموظف العمل من المنزل، وكم مرة، وفي أي الأيام.', g: 'att', html: `${ctg('remote', true, 'العمل عن بعد', 'السماح للموظف بالعمل عن بعد')}` },
    { t: 'العمل في أيام العطلة', s: 'أيام الراحة', h: 'هل يمكن للموظف العمل في أيام الراحة، وكيف يُحتسب اليوم، وماذا يحصل الموظف مقابله.', g: 'att', html: `${ctg('work_rest', true, 'العمل في أيام العطلة', 'السماح بالعمل في أيام الإجازة')}` },
    { t: 'العمل في العطلات الرسمية', s: 'العطلات الرسمية', h: 'نفس قرارات أيام الراحة، إما بالوراثة أو بإعداد مستقل للعطلات.', g: 'att', html: `${ctg('work_holiday', true, 'العمل في العطلات الرسمية', 'السماح بالعمل في العطلات')}` },
    { t: 'الطلبات', s: 'أنواع الطلبات المسموحة', h: 'أنواع الطلبات التي يستطيع الموظف تقديمها وكيفية معالجة العمل الإضافي.', g: 'att', html: `
      ${ctg('req_dayoff', false, 'طلب يوم عطلة')}${ctg('req_shift', false, 'طلب تغيير الوردية')}${ctg('req_extra', false, 'طلب وردية إضافية')}
      ${csel('ot_mode', 'pay', 'إعدادات العمل الإضافي (ما يتحول إليه العمل الإضافي المعتمد)', [['pay', 'يُدفع مع الراتب'], ['leave', 'يُحوّل إلى إجازات']], true)}` },
    { t: 'الورديات المفتوحة', s: 'تسجيل الدخول للورديات المفتوحة', h: 'إعداد كيفية تسجيل الدخول إلى الورديات المفتوحة.', g: 'att', html: `${ctg('open_shifts', true, 'الورديات المفتوحة', 'السماح بالورديات المفتوحة لهذا الموظف')}${ctg('open_punch', true, 'تسجيلات الوصول المفتوحة', 'تمكين تسجيلات الوصول المفتوحة')}` },
    { t: 'الإجازات والأرصدة', s: 'الملف والرصيد الافتتاحي', h: 'قواعد الإجازات والرصيد الذي يبدأ به الموظف.', html: `
      <label class="f">رصيد الإجازة السنوية (يوم)<input type="number" min="0" name="annual_leave_days" value="${u ? u.annual_leave_days : 21}"></label>
      ${lprofs.length ? `<label class="f">ملف الإجازة والاستراحة<select name="leave_profile_id"><option value="">— بدون (يستخدم الرصيد السنوي) —</option>${lprofs.map((x) => `<option value="${x.id}" ${String((u && u.leave_profile_id) || '') === String(x.id) ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : ''}` },
    { t: 'الحضور السابق', s: 'الأيام السابقة لليوم', h: 'التعامل مع الأيام السابقة لتاريخ إضافة الموظف.', html: `
      ${ctg('prev_present', false, 'احتساب الأيام السابقة لليوم كحضور', 'لو مفعّل: الأيام من تاريخ التعيين لحد اليوم لا تُحتسب غياب')}
      <label class="f">احتساب الحضور من تاريخ<input type="date" data-c="prev_from" value="${esc(cv('prev_from', ''))}"></label>` },
    { t: 'طريقة الدفع', s: 'وجهة صرف الراتب', h: 'أين تُرسل رواتب هذا الموظف. ما يكسبه هو إعداد الراتب الموجود أسفل ذلك.', html: `
      ${csel('pay_method', 'cash', 'طريقة الدفع', [['cash', 'نقدًا'], ['bank', 'التحويل المصرفي'], ['card', 'بطاقة مسبقة الدفع'], ['wallet', 'محفظة الهاتف'], ['fawry', 'فوري'], ['instapay', 'إنستاباي']], true)}
      ${cin('pay_account', '', 'رقم الحساب / المحفظة (لو غير نقدي)', 'maxlength="60"')}` },
    ...(canSal ? [
      { t: 'أساس الدفع', s: 'الراتب الأساسي', h: 'فترات دفع المرتب وأساس الحساب.', g: 'sal', html: `
        ${csel('pay_period', 'month', 'فترات دفع المرتب', [['month', 'شهر'], ['week', 'أسبوع']])}${csel('currency', 'EGP', 'العملة', [['EGP', 'جنيه مصري (EGP)'], ['SAR', 'ريال سعودي (SAR)'], ['USD', 'دولار (USD)']])}
        ${csel('pay_basis', 'month', 'احسب الراتب حسب', [['month', 'شهر'], ['day', 'اليوم'], ['hour', 'ساعة']], true)}
        <label class="f">المرتب الأساسي <b class="req">*</b><input type="number" step="0.01" min="0" name="base_salary" value="${u && u.base_salary != null ? u.base_salary : ''}" required></label>` },
      { t: 'البدلات', s: 'الإضافات المتكررة إلى الراتب الأساسي', h: 'الإضافات المتكررة إلى الراتب الأساسي (مجموعها هو بدلات الموظف في حساب المرتب).', g: 'sal', html: listHtml('allow_list') + '<input type="hidden" name="allowances" value="0">' },
      { t: 'الخصومات', s: 'المبالغ المخصصة المأخوذة من الراتب', h: 'المبالغ المخصصة المأخوذة من الراتب الإجمالي (للتوثيق، والخصومات الفعلية تُسجَّل من صفحة الخصومات).', g: 'sal', html: listHtml('deduct_list') },
      { t: 'الحسابات', s: 'الضرائب والتأمينات', h: 'الخصومات القانونية (للتوثيق حاليًا).', g: 'sal', html: `${cin('tax_social', '', 'التأمين الاجتماعي (المبلغ)', 'type="number" step="0.01" min="0"')}${cin('tax_medical', '', 'التأمين الطبي (المبلغ)', 'type="number" step="0.01" min="0"')}${cin('tax_income', '', 'الضرائب (المبلغ)', 'type="number" step="0.01" min="0"')}` },
      { t: 'الوقت الإضافي', s: 'احتساب الوقت الإضافي', h: 'هل يُحتسب للموظف وقت إضافي (بضعف دقيقة الأساسي).', g: 'sal', html: `${ctg('ot_on', true, 'احتساب الوقت الإضافي', 'يُدفع الوقت الإضافي المعتمد للموظف')}` },
    ] : []),
  ];
  const last = steps.length - 1;
  const GROUPS = { att: ['إعدادات الحضور', 'clock', 'blue'], sal: ['تكوين المرتب', 'dollar', 'green'] };
  function navHtml() {
    let out = '', gk = null, num = 0;
    const close = () => { if (gk) out += '</div></div>'; gk = null; };
    steps.forEach((st, i) => {
      if (st.g !== gk) { close(); if (st.g) { gk = st.g; const n = steps.filter((x) => x.g === st.g).length; out += `<div class="ew-grp ${GROUPS[st.g][2]} open" data-g="${st.g}"><button type="button" class="ew-gh" data-gt="${st.g}"><span class="gi">${ico(GROUPS[st.g][1])}</span><b>${GROUPS[st.g][0]}</b><em>${n}</em><i>${ico('chev')}</i></button><div class="ew-gb">`; } }
      if (st.g) out += `<button type="button" class="ew-step sub" data-s="${i}"><span class="dot"></span><span class="tx"><b>${st.t}</b></span></button>`;
      else out += `<button type="button" class="ew-step" data-s="${i}"><span class="n">${++num}</span><span class="tx"><b>${st.t}</b><small>${st.s}</small></span></button>`;
    });
    close(); return out;
  }
  const o = modal(`<form id="ewf" novalidate class="ew">
    <div class="ew-top"><button type="button" class="im-x" data-close aria-label="إغلاق">×</button><div class="ew-title"><span class="ew-ico">${ico('user')}</span><div><h3>${isNew ? 'موظف جديد' : 'تعديل بيانات الموظف'}</h3><div class="muted small">${isNew ? 'أضيفي موظفاً جديداً وحدّدي إعداداته' : 'حدّثي بيانات هذا الموظف وإعداداته'}</div></div></div></div>
    <div class="ew-main"><nav class="ew-nav"><div class="ew-navh">الأقسام</div>${navHtml()}</nav>
      <div class="ew-panes">${steps.map((s, i) => `<section class="ew-pane" data-p="${i}" hidden><h4>${s.t}</h4><p class="muted small">${s.h}</p><div class="form">${s.html}</div></section>`).join('')}</div></div>
    <div class="ew-foot"><button class="btn" id="ewNext" type="submit">التالي</button>${isNew ? '' : '<button type="button" class="btn alt" id="ewSave">حفظ</button>'}<button type="button" class="btn alt" id="ewBack">السابق</button><button type="button" class="btn alt" data-close>إلغاء</button><span class="muted small" id="ewHint"></span></div></form>`);
  o.classList.add('ewo'); o.dataset.lock = '1';
  const f = $('#ewf', o), panes = [...o.querySelectorAll('.ew-pane')], navs = [...o.querySelectorAll('.ew-step')];
  let cur = 0;
  const show = (k) => {
    cur = k;
    panes.forEach((p, i) => (p.hidden = i !== k)); navs.forEach((n, i) => n.classList.toggle('on', i === k));
    if (navs[k] && navs[k].closest('.ew-grp')) navs[k].closest('.ew-grp').classList.add('open');
    $('#ewNext', o).textContent = k === last ? (isNew ? 'إنشاء الموظف' : 'حفظ') : 'التالي';
    $('#ewBack', o).hidden = k === 0;
    $('#ewHint', o).textContent = k < last ? 'التالي: ' + steps[k + 1].t : '';
    if ($('#ewSave', o)) $('#ewSave', o).hidden = k === last;
  };
  const validStep = (k) => { for (const el of panes[k].querySelectorAll('input,select')) if (!el.checkValidity()) { show(k); el.reportValidity(); return false; } return true; };
  const save = () => {
    if (!steps.every((_, k) => validStep(k))) return;
    run($('#ewNext', o), async () => {
      const b = Object.fromEntries(new FormData(f));
      delete b.active_cb;
      if (!isNew && !u.is_admin) b.active = f.active_cb.checked;
      if (!b.password) delete b.password;
      const cfg = {};
      f.querySelectorAll('[data-c]').forEach((el) => { cfg[el.dataset.c] = el.type === 'checkbox' ? el.checked : el.value; });
      cfg.allow_list = lists.allow_list.filter((r) => r.name || r.amount).map((r) => ({ name: r.name, amount: Number(r.amount) || 0 }));
      cfg.deduct_list = lists.deduct_list.filter((r) => r.name || r.amount).map((r) => ({ name: r.name, amount: Number(r.amount) || 0 }));
      b.emp_cfg = cfg;
      if (canSal) b.allowances = cfg.allow_list.reduce((t, r) => t + r.amount, 0);
      if (locs.length) b.location_ids = [...f.querySelectorAll('[data-loc]:checked')].map((x) => Number(x.dataset.loc));
      await api(isNew ? '/employees' : '/employees/' + u.id, isNew ? 'POST' : 'PUT', b);
      o.close(); toast('تم الحفظ'); done();
    });
  };
  f.onsubmit = (e) => { e.preventDefault(); if (cur < last) { if (validStep(cur)) show(cur + 1); } else save(); };
  navs.forEach((n) => (n.onclick = () => show(Number(n.dataset.s))));
  $('#ewBack', o).onclick = () => show(Math.max(0, cur - 1));
  if ($('#ewSave', o)) $('#ewSave', o).onclick = save;
  if ($('#ewResetFace', o)) $('#ewResetFace', o).onclick = () => { if (confirm('إعادة ضبط بصمة وجه الموظف؟ هيسجّلها من جديد.')) run($('#ewResetFace', o), async () => { await api(`/employees/${u.id}/reset-face`, 'POST'); $('#ewFaceTxt', o).textContent = 'تمت إعادة الضبط، هتسجّلها الموظفة من جهازها'; $('#ewResetFace', o).remove(); u.face_enrolled = false; }); };
  const ss = $('#schsel', o);
  if (ss) ss.onchange = () => { const [a, b] = ss.value.split('|'); if (a) { f.shift_start.value = a; f.shift_end.value = b; } };
  const money2 = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
  const drawList = (key) => {
    const box = o.querySelector(`[data-list="${key}"]`); if (!box) return;
    box.innerHTML = lists[key].map((r, i) => `<div class="ew-row"><input data-lr="${key}|${i}|name" value="${esc(r.name || '')}" placeholder="الاسم" maxlength="60"><input type="number" step="0.01" min="0" data-lr="${key}|${i}|amount" value="${esc(r.amount ?? '')}" placeholder="المبلغ"><button type="button" class="sqb" data-rmrow="${key}|${i}" aria-label="حذف">${ico('trash')}</button></div>`).join('') || '<p class="muted small">لا يوجد بعد</p>';
    const tot = lists[key].reduce((t, r) => t + (Number(r.amount) || 0), 0);
    const el = o.querySelector(`[data-total="${key}"]`); if (el) el.textContent = money2(tot);
    if (key === 'allow_list' && f.allowances) f.allowances.value = money2(tot);
    box.querySelectorAll('[data-lr]').forEach((inp) => (inp.oninput = () => { const [k, i, fld] = inp.dataset.lr.split('|'); lists[k][i][fld] = fld === 'amount' ? inp.value : inp.value; const t = lists[k].reduce((a, r) => a + (Number(r.amount) || 0), 0); o.querySelector(`[data-total="${k}"]`).textContent = money2(t); if (k === 'allow_list') f.allowances.value = money2(t); }));
    box.querySelectorAll('[data-rmrow]').forEach((b) => (b.onclick = () => { const [k, i] = b.dataset.rmrow.split('|'); lists[k].splice(Number(i), 1); drawList(k); }));
  };
  o.querySelectorAll('[data-addrow]').forEach((b) => (b.onclick = () => { lists[b.dataset.addrow].push({ name: '', amount: '' }); drawList(b.dataset.addrow); }));
  ['allow_list', 'deduct_list'].forEach(drawList);
  o.querySelectorAll('[data-gt]').forEach((b) => (b.onclick = () => b.closest('.ew-grp').classList.toggle('open')));
  show(0);
}
