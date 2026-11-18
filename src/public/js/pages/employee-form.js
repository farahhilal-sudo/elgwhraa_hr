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
  const steps = [
    { t: 'الهوية وتسجيل الدخول', s: 'البيانات والصورة والحساب', h: 'من هو هذا الموظف وكيف يسجّل دخوله', html: `
      <label class="f full"><span>الاسم <b class="req">*</b></span><input name="name" value="${v('name')}" required maxlength="80"></label>
      ${isNew ? '<label class="f"><span>اسم المستخدم (للدخول) <b class="req">*</b></span><input name="username" autocapitalize="none" required></label>' : ''}
      <label class="f"><span>${isNew ? 'كلمة مرور مؤقتة <b class="req">*</b>' : 'كلمة مرور جديدة (اختياري)'}</span><input name="password" minlength="6" autocomplete="new-password" ${isNew ? 'required' : ''}></label>
      <label class="f">تاريخ الميلاد<input type="date" name="birth_date" value="${v('birth_date')}"></label>
      <div class="f"><span>النوع</span><div class="ew-radios">${Object.entries(GENDER_AR).map(([k, l]) => `<label class="ew-rad"><input type="radio" name="gender" value="${k}" ${u && u.gender === k ? 'checked' : ''}><i></i>${l}</label>`).join('')}</div></div>
      <label class="f">الحالة الاجتماعية<select name="marital_status"><option value="">—</option>${Object.entries(MARITAL_AR).map(([k, l]) => `<option value="${k}" ${u && u.marital_status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="f">الهاتف<input name="phone" value="${v('phone')}" maxlength="30"></label>
      <label class="f full">البريد الإلكتروني<input type="email" name="email" value="${v('email')}" maxlength="100"></label>
      <div class="f full"><span>بصمة الوجه</span><div class="ew-face">${ico('user')}<b id="ewFaceTxt">${faceTxt}</b>${!isNew && u.face_enrolled && !u.is_admin ? '<button type="button" class="btn alt sm" id="ewResetFace">إعادة ضبط</button>' : ''}</div></div>
      ${!isNew && !u.is_admin ? `<label class="ew-chk full"><input type="checkbox" name="active_cb" ${u.active ? 'checked' : ''}> السماح لهذا الموظف بتسجيل الدخول</label>` : ''}` },
    { t: 'التوظيف', s: 'الكود والتواريخ والدور', h: 'بيانات التوظيف والإجازات', html: `
      <label class="f">كود الموظف<input name="employee_code" value="${v('employee_code')}" maxlength="30"></label>
      <label class="f">تاريخ التعيين<input type="date" name="hire_date" value="${esc((u && u.hire_date) || todayStr())}"></label>
      ${meAdmin && (isNew || u.id !== S.me.user.id) ? `<label class="f">نوع الحساب<select name="role"><option value="employee" ${u && u.is_admin ? '' : 'selected'}>موظف (بصلاحيات يحددها المدير)</option><option value="admin" ${u && u.is_admin ? 'selected' : ''}>مدير (كل الصلاحيات)</option></select></label>` : ''}
      <label class="f">رصيد الإجازة السنوية (يوم)<input type="number" min="0" name="annual_leave_days" value="${u ? u.annual_leave_days : 21}"></label>
      ${lprofs.length ? `<label class="f">ملف الإجازة والاستراحة<select name="leave_profile_id"><option value="">— بدون (يستخدم الرصيد السنوي) —</option>${lprofs.map((x) => `<option value="${x.id}" ${String((u && u.leave_profile_id) || '') === String(x.id) ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : ''}` },
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
    ...(canSal ? [{ t: 'المرتب', s: 'الراتب الأساسي والبدلات', h: 'بيانات الراتب (بتظهر لمن عنده صلاحية المرتبات فقط)', html: `
      <label class="f">المرتب الأساسي<input type="number" step="0.01" min="0" name="base_salary" value="${u && u.base_salary != null ? u.base_salary : 0}"></label>
      <label class="f">البدلات<input type="number" step="0.01" min="0" name="allowances" value="${u && u.allowances != null ? u.allowances : 0}"></label>` }] : []),
  ];
  const last = steps.length - 1;
  const o = modal(`<form id="ewf" novalidate class="ew">
    <div class="ew-top"><button type="button" class="im-x" data-close aria-label="إغلاق">×</button><div class="ew-title"><span class="ew-ico">${ico('user')}</span><div><h3>${isNew ? 'موظف جديد' : 'تعديل بيانات الموظف'}</h3><div class="muted small">${isNew ? 'أضيفي موظفاً جديداً وحدّدي إعداداته' : 'حدّثي بيانات هذا الموظف وإعداداته'}</div></div></div></div>
    <div class="ew-main"><nav class="ew-nav"><div class="ew-navh">الأقسام</div>${steps.map((s, i) => `<button type="button" class="ew-step" data-s="${i}"><span class="n">${i + 1}</span><span class="tx"><b>${s.t}</b><small>${s.s}</small></span></button>`).join('')}</nav>
      <div class="ew-panes">${steps.map((s, i) => `<section class="ew-pane" data-p="${i}" hidden><h4>${s.t}</h4><p class="muted small">${s.h}</p><div class="form">${s.html}</div></section>`).join('')}</div></div>
    <div class="ew-foot"><button class="btn" id="ewNext" type="submit">التالي</button>${isNew ? '' : '<button type="button" class="btn alt" id="ewSave">حفظ</button>'}<button type="button" class="btn alt" id="ewBack">السابق</button><button type="button" class="btn alt" data-close>إلغاء</button><span class="muted small" id="ewHint"></span></div></form>`);
  o.classList.add('ewo'); o.dataset.lock = '1';
  const f = $('#ewf', o), panes = [...o.querySelectorAll('.ew-pane')], navs = [...o.querySelectorAll('.ew-step')];
  let cur = 0;
  const show = (k) => {
    cur = k;
    panes.forEach((p, i) => (p.hidden = i !== k)); navs.forEach((n, i) => n.classList.toggle('on', i === k));
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
  show(0);
}
