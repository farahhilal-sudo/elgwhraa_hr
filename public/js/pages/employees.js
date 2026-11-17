'use strict';
/* pages/employees.js — صفحة «الموظفون» الرئيسية: الفلاتر والكروت والجدول وقايمة ⋯ */

PAGES.employees = async (view) => {
  const manage = has('employees.manage');
  const [all, resets, locs, tpls] = await Promise.all([api('/employees'), manage ? api('/password-resets') : [], manage || has('settings.manage') ? api('/locations').catch(() => []) : [], api('/config/filter_template').catch(() => [])]);
  const pend = all.filter((u) => u.pending), people = all.filter((u) => !u.pending), staff = people.filter((u) => !u.is_admin); // المدير مش موظف: مابيظهرش في قائمة الموظفين
  const sal = people.some((r) => r.base_salary !== undefined);
  const tab = S.emptab || 'list';
  const cur = tab === 'pending' ? 'employees:pending' : tab === 'resets' ? 'employees:resets' : 'employees';
  const showTabs = !(IS_APP && tab === 'list');
  view.innerHTML = `${showTabs ? empTabsHtml(cur, { 'employees:pending': pend.length, 'employees:resets': resets.length }) : ''}<div id="empbody"></div>`;
  if (showTabs) bindEmpTabs(view);
  const body = $('#empbody');
  const again = () => PAGES.employees(view);
  if (tab === 'pending') {
    body.innerHTML = pend.length ? `<div class="tablewrap"><table><tr><th>الاسم</th><th>اسم المستخدم</th><th>الهاتف</th><th>تاريخ الطلب</th><th></th></tr>
      ${pend.map((u) => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.username)}</td><td>${esc(u.phone || '—')}</td><td>—</td><td><button class="btn sm ok" data-ap="${u.id}">قبول</button> <button class="btn sm bad" data-rj="${u.id}">رفض</button></td></tr>`).join('')}</table></div>` : '<div class="card empty">لا توجد طلبات إنشاء حسابات</div>';
    body.querySelectorAll('[data-ap]').forEach((b) => (b.onclick = () => run(b, async () => { await api(`/employees/${b.dataset.ap}/approve`, 'POST'); toast('تم قبول الحساب'); again(); })));
    body.querySelectorAll('[data-rj]').forEach((b) => (b.onclick = () => { if (confirm('رفض الطلب ومسحه؟')) run(b, async () => { await api(`/employees/${b.dataset.rj}/reject`, 'POST'); toast('تم رفض الطلب'); again(); }); }));
    return;
  }
  if (tab === 'resets') {
    body.innerHTML = resets.length ? `<div class="tablewrap"><table><tr><th>الموظف</th><th>اسم المستخدم</th><th>ملاحظة</th><th>وقت الطلب (UTC)</th><th></th></tr>
      ${resets.map((r) => `<tr><td><b>${esc(r.name)}</b>${r.is_admin ? ' <span class="badge b-info">مدير</span>' : ''}</td><td>${esc(r.username)}</td><td>${esc(r.note || '—')}</td><td>${esc(r.created_at)}</td>
      <td><button class="btn sm" data-rs="${r.id}">إنشاء كلمة مؤقتة</button> <button class="btn alt sm" data-dm="${r.id}">تجاهل</button></td></tr>`).join('')}</table></div>` : '<div class="card empty">لا توجد طلبات استعادة كلمة مرور</div>';
    body.querySelectorAll('[data-dm]').forEach((b) => (b.onclick = () => run(b, async () => { await api(`/password-resets/${b.dataset.dm}/dismiss`, 'POST'); again(); })));
    body.querySelectorAll('[data-rs]').forEach((b) => (b.onclick = () => { if (confirm('إنشاء كلمة مرور مؤقتة جديدة؟ كلمة المرور القديمة هتتلغي.')) run(b, async () => {
      const r = await api(`/password-resets/${b.dataset.rs}/resolve`, 'POST');
      modal(`<h3>كلمة المرور المؤقتة</h3><p>سلّميها للموظف بشكل آمن. <b>مش هتظهر تاني</b>، وهيطلب منه النظام يغيّرها عند أول دخول.</p>
        <input readonly value="${esc(r.temp_password)}" style="font-size:22px;text-align:center;letter-spacing:2px;direction:ltr" onfocus="this.select()">
        <div class="actions"><button class="btn alt" id="cpy">نسخ</button><button class="btn" data-close>تم</button></div>`, (m) => {
        $('#cpy', m).onclick = () => { navigator.clipboard?.writeText(r.temp_password); toast('تم النسخ'); };
        m.onclose = again;
      });
    }); }));
    return;
  }

  const ALLST = ['present', 'absent', 'late', 'leave', 'not_yet', 'off'];
  const STL = { present: 'حاضر', absent: 'غائب', late: 'متأخر', leave: 'إجازة', not_yet: 'لم يسجل الحضور', off: 'عطلة' };
  const EXTRA = { face_yes: ['بصمة الوجه مسجلة', (u) => u.face_enrolled], face_no: ['بصمة الوجه غير مسجلة', (u) => !u.face_enrolled && !u.face_exempt], no_loc: ['بدون مكتب محدد', (u) => !u.location_ids.length], new30: ['عُيّن خلال آخر 30 يوم', (u) => u.hire_date >= addDays(todayStr(), -30)] };
  const D = () => ({ tpl: '', q: '', loc: '', dept: '', job: '', role: '', mgr: '', nat: '', st: [...ALLST], activeOnly: true, extra: [], view: 'cards', more: false });
  const f = S.empf = { ...D(), ...(S.empf || {}) };
  if (S.q) { f.q = S.q; S.q = ''; }
  const uniq = (k) => [...new Set(people.map((u) => u[k]).filter(Boolean))];
  const byId = (id) => all.find((x) => x.id == id);
  const match = (u) => {
    const q = f.q.toLowerCase();
    return (!q || [u.name, u.username, u.phone, u.job_title, u.department].some((x) => String(x || '').toLowerCase().includes(q)))
      && (!f.role || (f.role === 'admin') === !!u.is_admin) && (!f.dept || u.department === f.dept) && (!f.job || u.job_title === f.job)
      && (!f.loc || !locs.length || !u.location_ids.length || u.location_ids.includes(Number(f.loc)))
      && (!f.mgr || String(u.manager_id) === f.mgr) && (!f.nat || u.nationality === f.nat) && (!f.activeOnly || u.active)
      && (f.st.length >= ALLST.length || (u.active && u.today && f.st.includes(u.today.status)))
      && f.extra.every((k) => EXTRA[k][1](u));
  };
  const sel2 = (k, ic, ph, arr) => `<label class="sel2 ${f[k] ? '' : 'ph'}">${ico(ic)}<select data-f="${k}"><option value="">${ph}</option>${arr.map((x) => { const v = Array.isArray(x) ? x[0] : x, l = Array.isArray(x) ? x[1] : x; return `<option value="${esc(v)}" ${String(f[k]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select></label>`;
  const btns = (u) => `${u.phone ? `<a class="sqbtn blue" href="tel:${esc(u.phone)}" title="اتصال">${ico('phone')}</a>` : `<span class="sqbtn off">${ico('phone')}</span>`}
    <button class="sqbtn" data-info="${u.id}" title="بيانات">${ico('info')}</button>
    ${manage ? `<button class="sqbtn blue" data-e="${u.id}" title="تعديل">${ico('edit')}</button>` : ''}
    <button class="sqbtn" data-more="${u.id}" title="المزيد">${ico('dots')}</button>`;
  const lineOf = (u) => {
    const t = u.today, st = u.active && t ? TODAY_ST[t.status] : null;
    if (!u.active) return ['bad', 'الحساب موقوف', 'clockoff'];
    if (t && (t.status === 'present' || t.status === 'late')) return [st[1], `${st[0]} ${fmtTime(t.check_in)}${t.late_minutes ? ' (' + t.late_minutes + ' د)' : ''}${t.check_out ? ' · انصرف ' + fmtTime(t.check_out) : ''}`, 'clock'];
    return st ? [st[1], st[0] === 'لم يسجّل الحضور' ? 'لم يسجل الحضور' : st[0], ['absent', 'not_yet'].includes(t.status) ? 'clockoff' : 'clock'] : ['', '—', 'clock'];
  };
  // الإجراء المتاح للمدير على الموظف الآن: تسجيل حضور (غائب / لم يسجّل) أو تسجيل انصراف (حاضر ولسه ما انصرفش)
  const EC_IN = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7l5 5-5 5M3 12h11M21 4v16"/></svg>';
  const EC_OUT = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 7l-5 5 5 5M21 12H10M3 4v16"/></svg>';
  const actOf = (u) => {
    const t = u.today;
    if (!has('attendance.edit') || !u.active || u.is_admin || u.pending || !t) return null;
    if (['absent', 'not_yet'].includes(t.status)) return 'in';
    return t.check_in && !t.check_out ? 'out' : null;
  };
  const punchBtn = (u) => { const a = actOf(u); return a === 'in' ? `<button class="btn alt sm" data-in="${u.id}">${ico('clock')} تسجيل الحضور</button>` : a === 'out' ? `<button class="btn alt sm ec-outsm" data-out="${u.id}">تسجيل الانصراف</button>` : ''; };
  const card = (u) => {
    const t = u.active ? u.today : null, st = t ? TODAY_ST[t.status] : null, a = actOf(u);
    const badge = !u.active ? '<span class="ec-badge bad">موقوف</span>' : st && t.status !== 'not_yet' ? `<span class="ec-badge ${st[1]}">${t.status === 'present' ? 'حاضر' : st[0]}${t.status === 'late' && t.late_minutes ? ' ' + t.late_minutes + ' د' : ''}</span>` : '';
    const line = (k, iso, loc) => `<div class="ec-line"><span class="ec-t ${k}">${k === 'in' ? EC_IN : EC_OUT}${clock12(iso)}</span>${loc ? `<span class="ec-p ${k}">${ICO_PIN}${esc(loc)}</span>` : ''}</div>`;
    const lines = (t && t.check_in ? line('in', t.check_in, t.in_loc) : '') + (t && t.check_out ? line('out', t.check_out, t.out_loc) : '');
    const note = !lines && t && t.status === 'not_yet' ? '<div class="ec-note">لم يسجل الحضور بعد</div>' : '';
    const btn = a === 'in' ? `<button class="ec-btn in" data-in="${u.id}">${EC_IN} تسجيل الحضور</button>` : a === 'out' ? `<button class="ec-btn out" data-out="${u.id}">${EC_OUT} تسجيل الانصراف</button>` : '';
    return `<div class="card ec"><div class="ec-head" data-prof="${u.id}" title="فتح الملف الشخصي"><div class="avatar lg ec-av"${avAttr(u)}>${esc(initials(u.name))}</div><div class="ec-info"><b>${esc(u.name)}</b><span>${esc(u.job_title || '—')}</span><span>${esc(u.department || '')}</span></div>${badge}</div>
      <div class="ec-body">${lines}${note}${btn}</div><div class="ec-foot">${btns(u)}</div></div>`;
  };
  const trow = (u) => { const l = lineOf(u); return `<tr><td><div class="emp" data-prof="${u.id}" title="فتح الملف الشخصي"><div class="avatar sm"${avAttr(u)}>${esc(initials(u.name))}</div><b>${esc(u.name)}</b>${u.is_admin ? ' <span class="badge b-info">مدير</span>' : ''}</div></td>
    <td>${esc(u.job_title || '—')}</td><td>${esc(u.department || '—')}</td><td dir="ltr">${fmt12(u.shift_start)} - ${fmt12(u.shift_end)}</td><td><span class="sline ${l[0]}">${ico(l[2])}${esc(l[1])}</span></td><td class="actcol"><div class="racts">${punchBtn(u)}${btns(u)}</div></td></tr>`; };

  const render = () => {
    if (IS_APP) return empMobileUI({ view, body, people: staff, manage, again, byId, menuFor, infoModal, f });
    const rows = staff.filter(match), shown = f.more ? ALLST : ALLST.slice(0, 5);
    body.innerHTML = `<div class="efil">
      <div class="frow2">
        <label class="sel2 ${f.tpl ? '' : 'ph'}">${ico('filter')}<select data-f="tpl"><option value="">حدد القالب</option>${tpls.map((t) => `<option value="${t.id}" ${String(f.tpl) === String(t.id) ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
        ${manage ? `<button class="btn alt sm hk" id="tsv">حفظ كنموذج</button>` : ''}${manage && f.tpl ? `<button class="sqb" id="tdel" title="حذف القالب">${ico('trash')}</button>` : ''}
        <label class="fs wide">${ico('search')}<input data-f="q" placeholder="بحث" value="${esc(f.q)}" autocomplete="off"></label>
        ${locs.length ? sel2('loc', 'building', 'حدد المكتب', locs.map((l) => [l.id, l.name])) : ''}${sel2('dept', 'building', 'تحديد القسم', uniq('department'))}${sel2('job', 'user', 'اختر المنصب', uniq('job_title'))}
      </div>
      <div class="frow2">
        ${sel2('mgr', 'user', 'اختر مدير', people.map((u) => [String(u.id), u.name]))}${sel2('nat', 'pin', 'الجنسية', uniq('nationality'))}
        <div class="sel2 stbox"><span>الحالة</span><i class="n">${f.st.length}</i><button id="stall" title="تحديد الكل">×</button></div>
      </div>
      <div class="frow2 chiprow">
        <button class="addf" id="addf">${ico('filter')} اضف تصفية ${ico('chev')}</button>
        <div class="chips2">${ico('filter')}<b>الحالة</b>${shown.map((k) => `<button class="fchip2 ${f.st.includes(k) ? 'on' : 'off'}" data-st="${k}">${STL[k]} <i>${f.st.includes(k) ? '×' : '+'}</i></button>`).join('')}
          ${!f.more && ALLST.length > 5 ? `<button class="fchip2 more" id="stmore">+${ALLST.length - 5} المزيد</button>` : ''}
          ${f.extra.map((k) => `<button class="fchip2 on" data-x="${k}">${EXTRA[k][0]} <i>×</i></button>`).join('')}</div>
        <b class="xl">مرشح إضافي</b><button class="fchip2 ${f.activeOnly ? 'on' : 'off'}" id="actonly">نشط</button>
      </div>
      <div class="frow2">${manage ? `<button class="btn" id="add">${ico('plus')} موظف جديد</button>` : ''}
        <button class="link rs" id="reset">${ico('filter')} إعادة تعيين المرشحات</button><span class="muted small">${rows.length} من ${staff.length}</span><span class="grow"></span>
        ${exportCsvBtn('exp')}<button class="btn vtog" id="vtog" title="تبديل العرض">${ico(f.view === 'cards' ? 'menu' : 'grid')}</button></div>
    </div>
    ${f.view === 'cards' ? `<div class="grid g3 ecards">${rows.map(card).join('') || '<div class="card empty" style="grid-column:1/-1">لا يوجد موظفون بهذه المرشحات</div>'}</div>`
      : `<div class="tablewrap st"><table><thead><tr><th>الموظف</th><th>المسمى الوظيفي</th><th>القسم</th><th>الوردية</th><th>حالة اليوم</th><th class="actcol"></th></tr></thead><tbody>${rows.map(trow).join('') || '<tr><td colspan="6" class="empty">لا يوجد موظفون بهذه المرشحات</td></tr>'}</tbody></table></div>`}`;
    bind(rows);
  };
  const applyTpl = (id) => {
    const t = tpls.find((x) => String(x.id) === String(id));
    let saved = {}; try { saved = JSON.parse((t || {}).filters || '{}'); } catch { /* تجاهل */ }
    Object.assign(f, D(), saved, { tpl: t ? String(t.id) : '', view: f.view });
  };
  const bind = (rows) => {
    body.querySelectorAll('[data-f]').forEach((el) => (el[el.tagName === 'INPUT' ? 'oninput' : 'onchange'] = () => {
      if (el.dataset.f === 'tpl') applyTpl(el.value); else f[el.dataset.f] = el.value;
      render();
      if (el.tagName === 'INPUT') { const i = body.querySelector('input[data-f=q]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    }));
    body.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => { const k = b.dataset.st; f.st = f.st.includes(k) ? f.st.filter((x) => x !== k) : [...f.st, k]; render(); }));
    body.querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => { f.extra = f.extra.filter((x) => x !== b.dataset.x); render(); }));
    if ($('#stmore', body)) $('#stmore', body).onclick = () => { f.more = true; render(); };
    $('#stall', body).onclick = () => { f.st = [...ALLST]; render(); };
    $('#actonly', body).onclick = () => { f.activeOnly = !f.activeOnly; render(); };
    $('#addf', body).onclick = (e) => popMenu(e.currentTarget, Object.entries(EXTRA).filter(([k]) => !f.extra.includes(k)).map(([k, v]) => ({ ic: 'filter', t: v[0], fn: () => { f.extra.push(k); render(); } })));
    $('#reset', body).onclick = () => { S.empf = null; PAGES.employees(view); };
    $('#vtog', body).onclick = () => { f.view = f.view === 'cards' ? 'table' : 'cards'; render(); };
    if ($('#tsv', body)) $('#tsv', body).onclick = () => { const n = prompt('اسم القالب'); if (!n) return; const { tpl, ...rest } = f; run(null, async () => { const r = await api('/config/filter_template', 'POST', { name: n, filters: JSON.stringify(rest) }); toast('تم حفظ القالب'); S.empf.tpl = String(r.id); again(); }); };
    if ($('#tdel', body)) $('#tdel', body).onclick = () => { if (confirm('حذف القالب ده؟')) run(null, async () => { await api('/config/filter_template/' + f.tpl, 'DELETE'); S.empf.tpl = ''; again(); }); };
    $('#exp', body).onclick = () => csv('employees.csv', [['الاسم', 'اسم المستخدم', 'المسمى', 'القسم', 'الجنسية', 'الهاتف', 'الوردية', 'تاريخ التعيين', 'الحالة'], ...rows.map((u) => [u.name, u.username, u.job_title, u.department, u.nationality, u.phone, `${u.shift_start}-${u.shift_end}`, u.hire_date, u.active ? 'نشط' : 'موقوف'])]);
    if (manage) {
      $('#add', body).onclick = () => empForm(null, again);
      body.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => empForm(byId(b.dataset.e), again)));
    }
    body.querySelectorAll('[data-in]').forEach((b) => (b.onclick = () => manualAtt(staff, { user_id: Number(b.dataset.in), date: S.me.today_date, manual_new: true }, again)));
    body.querySelectorAll('[data-out]').forEach((b) => (b.onclick = () => {
      const u = byId(b.dataset.out);
      if (confirm(`تسجيل انصراف «${u.name}» الآن؟`)) run(b, async () => { await api('/attendance/checkout', 'POST', { user_id: u.id }); toast('تم تسجيل الانصراف'); again(); });
    }));
    body.querySelectorAll('[data-info]').forEach((b) => (b.onclick = () => infoModal(byId(b.dataset.info))));
    body.querySelectorAll('[data-prof]').forEach((b) => (b.onclick = () => openProfile(b.dataset.prof)));
    body.querySelectorAll('[data-more]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); popMenu(b, menuFor(byId(b.dataset.more))); }));
  };
  const officesOf = (u) => (u.location_ids || []).map((i) => (locs.find((l) => l.id === i) || {}).name).filter(Boolean).join('، ');
  const openProfile = (id) => { S.empProfileId = Number(id); S.proftab = 'data'; again(); window.scrollTo(0, 0); };
  const infoModal = (u) => {
    const mg = byId(u.manager_id), canEdit = manage && (!u.is_admin || S.me.user.is_admin);
    const rows = (arr) => arr.map(([k, v]) => `<div class="im-kv"><span>${k}</span><b>${esc(v || '—')}</b></div>`).join('');
    const perm = u.is_admin ? 'مدير (كل الصلاحيات)' : (u.permissions || []).length ? `موظف بصلاحيات إضافية (${u.permissions.length})` : 'الموظف';
    const o = modal(`<div class="im-head"><button class="im-x" data-close aria-label="إغلاق">×</button><div class="im-id"><div class="avatar lg">${esc(initials(u.name))}</div><div><b>${esc(u.name)}</b><span class="muted small">${esc([u.job_title, u.department].filter(Boolean).join(' · ') || '—')}</span></div></div></div>
      <div class="im-body">
        <div class="im-col"><div class="im-sec"><h5>التوظيف</h5>${rows([['المنصب', u.job_title], ['القسم', u.department], ['انضم من', u.hire_date ? new Date(u.hire_date + 'T00:00:00').toLocaleDateString('ar-EG-u-nu-latn', { month: 'short', year: 'numeric' }) : ''], ['المكتب', officesOf(u) || 'أي موقع'], ['الوردية', `${fmt12(u.shift_start)} - ${fmt12(u.shift_end)}`], ['الهاتف', u.phone]])}</div>
          <div class="im-sec"><h5>الهوية</h5>${rows([['اسم المستخدم', u.username], ['تاريخ الميلاد', u.birth_date ? dmy(u.birth_date) : ''], ['النوع', GENDER_AR[u.gender]], ['الحالة الاجتماعية', MARITAL_AR[u.marital_status]], ['بصمة الوجه', u.face_exempt ? 'غير مطلوبة' : u.face_enrolled ? 'مسجلة' : 'غير مسجلة']])}</div></div>
        <div class="im-col"><div class="im-sec"><h5>خط الإبلاغ</h5>${mg ? `<div class="im-mgr"><span class="avatar sm">${esc(initials(mg.name))}</span><div><b>${esc(mg.name)}</b><span class="muted small">المدير المباشر</span></div></div>` : '<div class="muted small">لا يوجد مدير مباشر</div>'}</div>
          <div class="im-sec"><h5>مستوى الصلاحيات</h5><div class="im-perm">${esc(perm)}</div></div>
          ${u.base_salary !== undefined && !u.is_admin ? `<div class="im-sec"><h5>المرتب</h5>${rows([['المرتب الأساسي', money(u.base_salary)], ['البدلات', money(u.allowances)]])}</div>` : ''}</div>
      </div>
      <div class="im-foot">${canEdit ? '<button class="btn alt" id="imEdit">تعديل الموظف</button>' : ''}<button class="btn alt" id="imProf">عرض الملف الشخصي</button></div>`);
    o.classList.add('infom');
    $('#imProf', o).onclick = () => { o.close(); openProfile(u.id); };
    if (canEdit) $('#imEdit', o).onclick = () => { o.close(); empForm(u, again); };
  };
  const transferForm = (u) => {
    const o = modal(`<h3>تحويل ${esc(u.name)}</h3><form class="form" id="tf">
      <label class="f">القسم الجديد<input name="department" value="${esc(u.department)}" list="dl-dept"></label><label class="f">المنصب الجديد<input name="job_title" value="${esc(u.job_title)}" list="dl-job"></label>
      <datalist id="dl-dept">${uniq('department').map((x) => `<option value="${esc(x)}">`).join('')}</datalist><datalist id="dl-job">${uniq('job_title').map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      <label class="f">تاريخ التحويل<input type="date" name="date" value="${todayStr()}"></label><label class="f">السبب<input name="reason" maxlength="200"></label>
      <div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">تحويل</button></div></form>`);
    const t = $('#tf', o);
    t.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', t), async () => {
      await api('/employees/' + u.id, 'PUT', { department: t.department.value, job_title: t.job_title.value });
      await api('/config/transfer', 'POST', { name: u.name, from: [u.department, u.job_title].filter(Boolean).join(' / ') || '—', to: [t.department.value, t.job_title.value].filter(Boolean).join(' / ') || '—', date: t.date.value, reason: t.reason.value });
      o.close(); toast('تم التحويل وتسجيله في سجل النقل'); again();
    }); };
  };
  const auditModal = async (u) => {
    let rows = [];
    try { rows = await api(`/attendance?user_id=${u.id}&from=${addDays(todayStr(), -60)}&to=${todayStr()}`); } catch (e) { return toast(e.message, true); }
    modal(`<h3>عمليات التدقيق: ${esc(u.name)}</h3><p class="muted small" style="margin:0 0 8px">آخر 60 يوم</p><div class="tablewrap"><table><tr><th>التاريخ</th><th>حضور</th><th>انصراف</th><th>تأخير (د)</th></tr>
      ${rows.slice(0, 40).map((a) => `<tr><td>${esc(a.date)}</td><td>${fmtTime(a.check_in)}</td><td>${fmtTime(a.check_out)}</td><td>${a.late_minutes || 0}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">لا توجد سجلات</td></tr>'}</table></div><div class="actions"><button class="btn" data-close>إغلاق</button></div>`);
  };
  const officeModal = async (u) => {
    let log = [];
    try { log = (await api('/config/transfer')).filter((x) => x.name === u.name); } catch { /* تجاهل */ }
    const mine = u.location_ids.map((i) => (locs.find((l) => l.id === i) || {}).name).filter(Boolean);
    modal(`<h3>تاريخ المكتب: ${esc(u.name)}</h3><div class="kv"><div><span class="muted">أماكن الحضور الحالية</span><b>${esc(mine.join('، ') || 'أي موقع')}</b></div><div><span class="muted">القسم الحالي</span><b>${esc(u.department || '—')}</b></div></div>
      <h3 style="margin:14px 0 6px">سجل النقل</h3>${log.map((x) => `<div class="vrow"><span>${esc(x.from)} ← ${esc(x.to)}</span><span class="muted small">${esc(x.date || '')}</span></div>`).join('') || '<div class="muted small">لا توجد عمليات نقل.</div>'}
      <div class="actions"><button class="btn" data-close>إغلاق</button></div>`);
  };
  const menuFor = (u) => {
    const canT = manage && (!u.is_admin || S.me.user.is_admin), it = [];
    if (canT) it.push({ ic: 'shield', t: 'تعيين كلمة مرور مؤقتة', fn: () => { const np = prompt('كلمة المرور المؤقتة الجديدة (6 أحرف على الأقل)'); if (np) run(null, async () => { await api('/employees/' + u.id, 'PUT', { password: np }); toast('تم تعيين كلمة المرور، وهيغيّرها الموظف عند أول دخول'); }); } });
    if (manage) it.push({ ic: 'swap', t: 'تحويل', fn: () => transferForm(u) });
    if (has('attendance.view_all')) it.push({ ic: 'audit', t: 'عمليات التدقيق', fn: () => auditModal(u) });
    if (manage) it.push({ ic: 'building', t: 'تاريخ المكتب', fn: () => officeModal(u) });
    if (manage && u.face_enrolled && canT) it.push({ ic: 'user', t: 'إعادة ضبط بصمة الوجه', fn: () => { if (confirm('إعادة ضبط بصمة وجه الموظف؟ هيسجّلها من جديد.')) run(null, async () => { await api(`/employees/${u.id}/reset-face`, 'POST'); toast('تمت إعادة الضبط'); again(); }); } });
    if (manage && !u.is_admin) it.push({ ic: 'pause', t: u.active ? 'إيقاف' : 'تفعيل', fn: () => run(null, async () => { await api('/employees/' + u.id, 'PUT', { active: !u.active }); toast('تم'); again(); }) });
    if (manage && !u.is_admin && u.id !== S.me.user.id) it.push({ ic: 'trash', t: 'إزالة', cls: 'bad', fn: () => { if (confirm(`إزالة ${u.name} نهائياً مع كل سجلاته (حضور وطلبات ومرتبات)؟ لا يمكن التراجع.`)) run(null, async () => { await api('/employees/' + u.id, 'DELETE'); toast('تمت الإزالة'); again(); }); } });
    if (S.me.user.is_admin && !u.is_admin) it.push({ ic: 'key', t: 'إدارة الصلاحيات', fn: () => go('permissions') });
    if (!it.length) it.push({ ic: 'info', t: 'بيانات الموظف', fn: () => infoModal(u) });
    return it;
  };
  // ===== صفحة الملف الشخصي للموظف (بتفتح بالضغط على الموظف) =====
  const renderProfile = async (u) => {
    const tab = S.proftab || 'data';
    const canEdit = manage && (!u.is_admin || S.me.user.is_admin), showSal = u.base_salary !== undefined && !u.is_admin;
    const items = menuFor(u).filter((x) => x.t !== 'بيانات الموظف');
    const TABS = [['data', 'بيانات الموظف'], ['att', 'سجل الحضور'], ['req', 'الطلبات والإجازات'], ['shift', 'الوردية والمكتب'], ...(showSal ? [['sal', 'المرتب']] : [])];
    const TAB_IC = { data: 'user', att: 'clock', req: 'calendar', shift: 'timer', sal: 'wallet' };
    const mg = byId(u.manager_id);
    const dataRows = [['كود الموظف', u.employee_code], ['اسم المستخدم', u.username], ['الهاتف', u.phone], ['البريد الإلكتروني', u.email], ['المنصب', u.job_title], ['القسم', u.department], ['المكتب', officesOf(u) || 'أي موقع'], ['المدير المباشر', mg && mg.name],
      ['تاريخ التعيين', u.hire_date ? dmy(u.hire_date) : ''], ['تاريخ الميلاد', u.birth_date ? dmy(u.birth_date) : ''], ['النوع', GENDER_AR[u.gender]], ['الحالة الاجتماعية', MARITAL_AR[u.marital_status]], ['الجنسية', u.nationality],
      ...(u.national_id !== undefined ? [['الهوية الوطنية', u.national_id]] : [])];
    view.innerHTML = `<div class="epf"><div class="epf-back"><button class="btn alt sm" id="pfBack">${ico('chev')} كل الموظفين</button></div>
      <div class="card epf-head v2"><div class="epf-id"><div class="epf-av"${avAttr(u)}>${esc(initials(u.name))}${(canEdit || u.id === S.me.user.id) ? `<button class="cam" id="pfCam" title="تغيير الصورة"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.2"/></svg></button>` : ''}</div><div class="epf-info"><h2>${esc(u.name)}${u.is_admin ? ' <span class="badge b-info">مدير</span>' : ''}${u.active ? '' : ' <span class="badge b-bad">موقوف</span>'}</h2>
          <div class="epf-ln">${ico('case')}<span>${esc(u.job_title || '—')}</span></div><div class="epf-ln">${ico('users')}<span>${esc(u.department || '—')}</span></div></div></div>
        <div class="epf-mid"><div class="row1"><span class="badge ${lineOf(u)[0]}">${esc(lineOf(u)[1])}</span><span class="tm">${esc(fmt12(u.shift_start))} - ${esc(fmt12(u.shift_end))}</span></div><div class="sh">${esc(officesOf(u) || 'أي موقع')} · من ${esc(fmt12(u.shift_start))} حتى ${esc(fmt12(u.shift_end))}</div></div>
        <div class="epf-side v2"><div class="epf-top"><button class="btn alt sm" id="pfExp">${ico('download')} تصدير</button>${u.id === S.me.user.id ? `<button class="btn sm" id="pfNew">${ico('plus')} طلب جديد</button>` : ''}</div>
          <div class="epf-icons">
            ${u.phone ? `<a class="sqbtn blue" href="tel:${esc(u.phone)}" title="اتصال">${ico('phone')}</a>` : ''}${canEdit ? `<button class="sqbtn blue" id="pfEdit" title="تعديل">${ico('edit')}</button>` : ''}<button class="sqbtn" id="pfInfo" title="بيانات">${ico('info')}</button>
            ${items.map((x, i) => `<button class="sqbtn ${x.cls === 'bad' ? 'bad' : ''}" data-mi="${i}" title="${esc(x.t)}">${ico(x.ic)}</button>`).join('')}</div></div></div>
      <div class="epf-stats" id="pfStats">${'<div class="card epf-stat"><div class="sk"></div></div>'.repeat(4)}</div>
      <div class="card epf-tabs v2">${TABS.map(([k, l]) => `<button class="epf-tab ${k === tab ? 'on' : ''}" data-pt="${k}">${ico(TAB_IC[k] || 'file')}${l}</button>`).join('')}</div>
      <div class="card epf-body" id="pfBody"><div class="empty">جارٍ التحميل...</div></div></div>`;
    $('#pfBack').onclick = () => { S.empProfileId = null; again(); };
    $('#pfInfo').onclick = () => infoModal(u);
    if ($('#pfCam')) $('#pfCam').onclick = () => pickAvatar(u.id, () => { u.has_avatar = true; renderProfile(u); });
    if ($('#pfNew')) $('#pfNew').onclick = () => requestForm(() => renderProfile(u));
    if ($('#pfEdit')) $('#pfEdit').onclick = () => empForm(u, again);
    $('#pfExp').onclick = () => csv('employee-' + u.username + '.csv', [dataRows.map((r) => r[0]), dataRows.map((r) => r[1] || '')]);
    view.querySelectorAll('[data-mi]').forEach((b) => (b.onclick = () => items[Number(b.dataset.mi)].fn()));
    view.querySelectorAll('[data-pt]').forEach((b) => (b.onclick = () => { S.proftab = b.dataset.pt; renderProfile(u); }));
    let sumP = null; const getSum = () => (sumP = sumP || api(`/employees/${u.id}/summary`));
    getSum().then((sm) => {
      const b = sm.balances, left = (t, used) => Math.max(0, t - used);
      const card = (lbl, n, unit, sub) => `<div class="card epf-stat v2"><div class="top"><div class="epf-sn"><b>${n}</b><span>${unit}</span></div><span class="sic">${ico('calendar')}</span></div><div class="epf-sl">${lbl}</div><div class="epf-ss">${sub}</div></div>`;
      const el = $('#pfStats'); if (!el) return;
      el.innerHTML = card('إجازة سنوية', b.annual_used, 'الأيام', `المتبقي ${left(b.annual_total, b.annual_used)} من ${b.annual_total}`)
        + card('إجازة طارئة', b.emergency_used, 'الأيام', b.emergency_total ? `المتبقي ${left(b.emergency_total, b.emergency_used)} من ${b.emergency_total}` : 'بدون رصيد محدد')
        + card('إجازة مرضية', b.sick_used, 'الأيام', b.sick_total ? `المتبقي ${left(b.sick_total, b.sick_used)} من ${b.sick_total}` : 'بدون رصيد محدد')
        + card('أذونات', Number(b.permission_hours_month).toFixed(2), 'ساعات', 'هذا الشهر');
    }).catch(() => { const el = $('#pfStats'); if (el) el.remove(); });
    const kv = (arr) => `<div class="epf-kv">${arr.map(([k, v]) => `<div><span>${k}</span><b>${esc(v || '—')}</b></div>`).join('')}</div>`;
    const sec = (t, ic) => `<div class="epf-sec"><span class="epf-sic">${ico(ic)}</span><b>${t}</b></div>`;
    const body = $('#pfBody');
    if (tab === 'data') body.innerHTML = sec('بيانات الموظف العامة', 'user') + kv(dataRows);
    else if (tab === 'shift') body.innerHTML = sec('الوردية والمكتب', 'clock') + kv([['بداية الوردية', fmt12(u.shift_start)], ['نهاية الوردية', fmt12(u.shift_end)], ['أماكن الحضور المسموحة', officesOf(u) || 'أي موقع'], ['رصيد الإجازة السنوية', u.annual_leave_days + ' يوم'], ['بصمة الوجه', u.face_exempt ? 'غير مطلوبة' : u.face_enrolled ? 'مسجلة' : 'غير مسجلة']]);
    else if (tab === 'sal') body.innerHTML = sec('المرتب', 'shield') + kv([['المرتب الأساسي', money(u.base_salary)], ['البدلات', money(u.allowances)], ['الإجمالي', money(Number(u.base_salary || 0) + Number(u.allowances || 0))]]);
    else if (tab === 'req') {
      try {
        const sm = await getSum();
        body.innerHTML = sec('الطلبات والإجازات', 'audit') + (sm.requests.length ? `<div class="tablewrap"><table><tr><th>النوع</th><th>من</th><th>إلى</th><th>الحالة</th><th>السبب</th></tr>${sm.requests.map((r) => { const st = STATUS_AR[r.status] || [r.status, '']; return `<tr><td>${esc(TYPES()[r.type] || r.type)}</td><td>${dmy(r.from_date)}</td><td>${dmy(r.to_date)}</td><td><span class="badge ${st[1]}">${st[0]}</span></td><td>${esc((r.reason || '—').slice(0, 80))}</td></tr>`; }).join('')}</table></div>` : '<div class="empty">لا توجد طلبات</div>');
      } catch (e) { body.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    } else if (tab === 'att') {
      const af = S.pfatt = S.pfatt || { from: thisMonth() + '-01', to: todayStr(), st: '', ex: '' };
      body.innerHTML = `<div class="alog-filters"><button class="btn alt" id="aExp">${ico('download')} تصدير</button>
        <label>مرشح إضافي<select id="aEx"><option value="">مرشح إضافي</option><option value="manual">تعديل يدوي</option><option value="noout">بدون انصراف</option></select></label>
        <label>إلى<input type="date" id="aTo" value="${af.to}"></label><label>من<input type="date" id="aFrom" value="${af.from}"></label>
        <label>الحالة<select id="aSt"><option value="">تحديد خيار</option><option value="ok">في الموعد</option><option value="late">متأخر</option><option value="abs">غائب</option><option value="off">يوم إجازة</option></select></label></div><div id="alogList"><div class="empty">جارٍ التحميل...</div></div>`;
      $('#aEx').value = af.ex; $('#aSt').value = af.st;
      const weekend = String(S.me.settings.weekend_days || '').split(',').filter(Boolean).map(Number), today = todayStr();
      let list = [];
      const dur = (a) => { if (!a.check_in || !a.check_out) return ''; const m = Math.round((new Date(a.check_out) - new Date(a.check_in)) / 60000); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
      const t12 = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: TZ }) : '');
      const draw = () => {
        const f = af.st, ex = af.ex;
        const rows = list.filter((x) => (!f || (f === 'off' ? ['off', 'leave'].includes(x.kind) : x.kind === f)) && (!ex || (x.a && (ex === 'manual' ? !!x.a.note : x.a.check_in && !x.a.check_out))));
        const pen = (d, a) => (has('attendance.edit') ? `<button class="alog-pen" data-ed="${d}" title="تعديل">${ico('edit')}</button>` : '<span></span>');
        $('#alogList').innerHTML = rows.map(({ d, a, kind }) => {
          const dt = `<div class="d">${dmyDash(d)}</div>`;
          if (kind === 'off' || kind === 'leave' || kind === 'wait') return `<div class="alog-row off">${dt}<div class="mid">${kind === 'off' ? 'يوم إجازة مجدول' : kind === 'leave' ? 'إجازة معتمدة' : 'لم يتم تسجيل الحضور بعد'}</div>${pen(d, a)}</div>`;
          const stb = { ok: ['b-ok', 'في الموعد'], late: ['b-warn', `متأخر ${a ? a.late_minutes : ''} د`], abs: ['b-bad', 'غائب'] }[kind];
          const io = (arrow, iso, loc) => iso ? `<div class="alog-io"><span class="arr ${arrow}">${arrow === 'in' ? '⇥' : '⇤'}</span><div><b>${t12(iso)}</b><small>${esc(loc || '—')}</small></div></div>` : '<div class="alog-io none">——</div>';
          return `<div class="alog-row">${dt}${io('in', a && a.check_in, a && a.in_loc)}${io('out', a && a.check_out, a && a.out_loc)}<div>${a && dur(a) ? `<span class="alog-dur"><i></i>${dur(a)}</span>` : ''}</div><span class="badge ${stb[0]}">${stb[1]}</span>${pen(d, a)}</div>`;
        }).join('') || '<div class="empty">لا توجد سجلات</div>';
        body.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => { const x = list.find((r) => r.d === b.dataset.ed); manualAtt(people, x.a || { user_id: u.id, date: x.d, id: null }, () => load()); }));
      };
      const load = async () => {
        let from = af.from, to = af.to;
        if (!from || !to || to < from) return;
        if (to > today) to = today;
        if (daysBetween(from, to) > 93) from = addDays(to, -92);
        let recs = [], sm = null;
        try { [recs, sm] = await Promise.all([api(`/attendance?user_id=${u.id}&from=${from}&to=${to}`), getSum()]); } catch (e) { $('#alogList').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
        const by = Object.fromEntries(recs.map((x) => [x.date, x])), leave = new Set();
        (sm.requests || []).filter((x) => x.status === 'approved' && ['annual_leave', 'sick_leave', 'emergency_leave', 'work_mission'].includes(x.type)).forEach((x) => { for (let d = x.from_date; d <= x.to_date; d = addDays(d, 1)) leave.add(d); });
        list = [];
        for (let d = to; d >= from; d = addDays(d, -1)) {
          const w = new Date(d + 'T00:00:00Z').getUTCDay(), a = by[d];
          let kind = null;
          if (a && a.check_in) kind = a.late_minutes > 0 ? 'late' : 'ok';
          else if (leave.has(d)) kind = 'leave';
          else if (weekend.includes(w)) kind = 'off';
          else if (d < today && d >= (u.hire_date || '0000')) kind = 'abs';
          else if (d === today) kind = 'wait';
          if (kind) list.push({ d, a, kind });
        }
        draw();
      };
      $('#aFrom').onchange = () => { af.from = $('#aFrom').value; load(); }; $('#aTo').onchange = () => { af.to = $('#aTo').value; load(); };
      $('#aSt').onchange = () => { af.st = $('#aSt').value; draw(); }; $('#aEx').onchange = () => { af.ex = $('#aEx').value; draw(); };
      $('#aExp').onclick = () => csv('attendance-' + u.username + '.csv', [['التاريخ', 'الحالة', 'حضور', 'انصراف', 'مكان الحضور', 'مكان الانصراف'], ...list.map((x) => [x.d, x.kind, t12(x.a && x.a.check_in), t12(x.a && x.a.check_out), (x.a && x.a.in_loc) || '', (x.a && x.a.out_loc) || ''])]);
      load();
    }
  };
  if (S.empProfileId) { const pu = byId(S.empProfileId); if (pu && !pu.pending) return renderProfile(pu); S.empProfileId = null; }
  render();
};
