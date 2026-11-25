'use strict';
/* pages/employees-more2.js — الهيكل التنظيمي ومستندات الموظفين وإجراءات الموظفين، على شكل الشاشات المرجعية (بتعتمد على employees-more.js) */

/* ===== الهيكل التنظيمي: أقسام / موظفين، تكبير وتصغير، توسيع الكل، تصدير PDF ===== */
function orgPage(view) {
  view.innerHTML = empTabsHtml('org_chart') + '<div id="ebody"><div class="empty"><span class="spin"></span></div></div>';
  bindEmpTabs(view);
  const body = $('#ebody', view);
  api('/employees').then((all) => {
    const people = all.filter((u) => !u.pending && u.active), byId = Object.fromEntries(people.map((u) => [u.id, u])), company = (S.me.settings && S.me.settings.company_name) || 'الشركة';
    const kids = {}; people.forEach((u) => { const k = byId[u.manager_id] ? u.manager_id : 0; (kids[k] = kids[k] || []).push(u); });
    const st = { mode: 'emp', zoom: 1, open: new Set(), all: false };
    const root = `<div class="onode oco">${ico('building')}<b>${esc(company)}</b></div>`;
    const empNode = (u) => {
      const ch = kids[u.id] || [], on = st.all || st.open.has(u.id);
      return `<li><div class="onode oemp"><div class="avatar sm">${esc(initials(u.name))}</div><div class="oi"><b>${esc(u.name)}</b><span>${esc(u.job_title || '')}</span></div>${ch.length ? `<button class="otg" data-o="${u.id}">${ch.length} يدير ${ico('chev', on ? 'rot180' : '')}</button>` : ''}</div>${ch.length && on ? `<ul>${ch.map(empNode).join('')}</ul>` : ''}</li>`;
    };
    const deptHtml = () => {
      const g = {}; people.forEach((u) => { const d = u.department || 'بدون قسم'; (g[d] = g[d] || []).push(u); });
      return `<div class="odepts">${Object.entries(g).map(([d, arr]) => {
        const c = {}; arr.forEach((u) => { if (u.manager_id && byId[u.manager_id]) c[u.manager_id] = (c[u.manager_id] || 0) + 1; });
        const hid = Object.keys(c).sort((a, b) => c[b] - c[a])[0], head = hid ? byId[hid].name : '';
        return `<div class="onode odep"><b>${esc(d)}</b>${head ? `<span>${esc(head)}</span>` : ''}<em>${arr.length} الأعضاء</em></div>`;
      }).join('')}</div>`;
    };
    const chart = () => `${root}${st.mode === 'dept' ? `<div class="oline"></div>${deptHtml()}` : `<ul class="otree"><li style="padding-top:0"><ul style="padding-top:22px">${(kids[0] || []).map(empNode).join('')}</ul></li></ul>`}`;
    const draw = () => {
      body.innerHTML = `<div class="orgbar"><div class="orgseg"><button data-m="emp" class="${st.mode === 'emp' ? 'on' : ''}">الموظفون</button><button data-m="dept" class="${st.mode === 'dept' ? 'on' : ''}">الأقسام</button></div><span class="grow"></span>
        <button class="btn alt sm" id="opdf">تصدير بصيغة PDF</button>${st.mode === 'emp' ? `<button class="btn alt sm" id="oall">${st.all ? 'انهيار الكل' : 'توسيع الكل'}</button>` : ''}<button class="link" id="ors">إعادة تعيين</button>
        <button class="sqb" id="ozm" title="تصغير">−</button><button class="sqb" id="ozp" title="تكبير">+</button></div>
        <div class="orgbox"><div class="orgz" id="orgz" style="transform:scale(${st.zoom})">${chart()}</div></div>`;
      const bx = $('.orgbox', body); bx.scrollLeft = (bx.clientWidth - bx.scrollWidth) / 2; // يفتح على منتصف الشجرة (الاتجاه من اليمين لليسار)
      body.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { st.mode = b.dataset.m; draw(); }));
      body.querySelectorAll('[data-o]').forEach((b) => (b.onclick = () => { const id = Number(b.dataset.o); if (st.all) { st.all = false; people.forEach((u) => st.open.add(u.id)); } st.open.has(id) ? st.open.delete(id) : st.open.add(id); draw(); }));
      if ($('#oall', body)) $('#oall', body).onclick = () => { st.all = !st.all; st.open.clear(); draw(); };
      $('#ors', body).onclick = () => { Object.assign(st, { zoom: 1, all: false }); st.open.clear(); draw(); };
      $('#ozp', body).onclick = () => { st.zoom = Math.min(1.6, st.zoom + 0.15); draw(); };
      $('#ozm', body).onclick = () => { st.zoom = Math.max(0.4, st.zoom - 0.15); draw(); };
      $('#opdf', body).onclick = () => {
        const w = window.open('', '_blank'); if (!w) return toast('اسمح بالنوافذ المنبثقة عشان يتصدّر الـPDF', true);
        const head = [...document.head.querySelectorAll('link[rel=stylesheet],style')].map((n) => n.outerHTML).join('');
        w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>الهيكل التنظيمي</title>${head}<style>body{background:#fff;padding:16px}.otg{display:none}@page{size:landscape}</style></head><body><div class="orgz" style="transform:none;text-align:center">${chart().replace(/<button class="otg"[^>]*>.*?<\/button>/g, '')}</div></body></html>`);
        w.document.close(); setTimeout(() => w.print(), 700);
      };
    };
    draw();
  }).catch((e) => (body.innerHTML = `<div class="card empty neg">${esc(e.message)}</div>`));
}
PAGES.org_chart = orgPage;

/* ===== مستندات الموظفين: مفقودة / منتهية الصلاحية ===== */
const DOC_TYPES = { id: 'بطاقة هوية', contract: 'عقد عمل', cert: 'شهادة', license: 'رخصة', other: 'أخرى' };
const DOC_REQUIRED = ['id', 'contract'];
async function docsPage(view) {
  view.innerHTML = empTabsHtml('emp_docs') + '<div id="ebody"><div class="empty"><span class="spin"></span></div></div>';
  bindEmpTabs(view);
  const body = $('#ebody', view), manage = has('employees.manage'), today = todayStr();
  let people = [], docs = [], ftpls = [], locs = [];
  try { people = (await api('/employees')).filter((u) => !u.pending && u.active && !u.is_admin); docs = await api('/config/emp_doc'); ftpls = (await api('/config/export_template').catch(() => [])).filter((t) => t.page === 'filters:emp_docs'); locs = await api('/locations').catch(() => []); } catch (e) { body.innerHTML = `<div class="card empty neg">${esc(e.message)}</div>`; return; }
  const locName = (u) => (u.location_ids || []).map((i) => (locs.find((l) => l.id === i) || {}).name).filter(Boolean).join('، ');
  const D = () => ({ tpl: '', q: '', emp: '', office: '', dept: '', type: '', until: '' });
  const f = D();
  const okU = (u) => (!f.q || [u.employee_code, u.phone, u.name].join(' ').toLowerCase().includes(f.q.toLowerCase())) && (!f.emp || String(u.id) === f.emp) && (!f.office || locName(u).includes(f.office)) && (!f.dept || u.department === f.dept);
  const compute = () => {
    const missing = [], expired = [], mine = Object.fromEntries(people.map((u) => [u.name, []]));
    docs.forEach((d) => { if (mine[d.name]) mine[d.name].push(d); });
    people.filter(okU).forEach((u) => {
      const have = new Set(mine[u.name].map((d) => d.type));
      DOC_REQUIRED.filter((t) => (!f.type || f.type === t) && !have.has(t)).forEach((t) => missing.push({ u, t }));
      mine[u.name].filter((d) => d.expires && d.expires <= (f.until || today) && (!f.type || d.type === f.type)).forEach((d) => expired.push({ u, d }));
    });
    return { missing, expired };
  };
  const card = (id, title, label, n, tbl) => `<div class="card mdoc"><div class="mdh"><button class="btn alt sm" id="${id}">${ico('download')} تصدير</button><h3>${title}</h3></div><div class="mdc"><span>${label}</span><b>${n}</b></div><div class="mdb">${tbl}</div></div>`;
  const tbl = (heads, rows) => rows.length ? `<table><thead><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<div class="empty">لا توجد سجلات لعرضها</div>';
  const draw = () => {
    const { missing, expired } = compute();
    body.innerHTML = `<div class="card mfcard"><div class="mfg">${mfIn('q', 'كود / هاتف الموظف', f.q)}${mfSel('emp', 'الموظف', people.map((u) => [String(u.id), u.name]), f.emp, 'اختر الموظف')}${mfSel('office', 'المكتب', locs.map((l) => l.name), f.office, 'حدد المكتب')}
      ${mfSel('dept', 'القسم', uniqV(people, 'department'), f.dept, 'اختر الأقسام')}${mfSel('type', 'المستند', Object.entries(DOC_TYPES), f.type, 'اختر المستند')}${mfIn('until', 'تاريخ انتهاء الصلاحية حتى', f.until, 'date')}</div>
      <div class="mfbar"><button class="link rs" id="drs">${ico('filter')} إعادة تعيين المرشحات</button>${manage ? `<button class="btn" id="dnew">${ico('plus')} مستند جديد</button>` : ''}<span class="grow"></span>${tplHtml(ftpls, f.tpl)}</div></div>
      <div class="mdocs">${card('dxe', 'مستندات منتهية الصلاحية', 'عدد الموظفين', new Set(expired.map((x) => x.u.id)).size, tbl(['الموظف', 'المستند', 'تاريخ الانتهاء'], expired.map((x) => [`<b>${esc(x.u.name)}</b>`, DOC_TYPES[x.d.type] || esc(x.d.type), mfDate(x.d.expires)])))}
      ${card('dxm', 'مستندات مفقودة', 'عدد المستندات', missing.length, tbl(['الموظف', 'المستند المفقود'], missing.map((x) => [`<b>${esc(x.u.name)}</b>`, DOC_TYPES[x.t]])))}</div>
      <h4 class="mdt">كل المستندات المسجلة</h4><div class="tablewrap st"><table><thead><tr><th>الموظف</th><th>نوع المستند</th><th>تاريخ الانتهاء</th><th>ملاحظات</th>${manage ? '<th class="actcol"></th>' : ''}</tr></thead><tbody>
      ${docs.map((d) => `<tr><td><b>${esc(d.name)}</b></td><td>${DOC_TYPES[d.type] || esc(d.type || '-')}</td><td>${mfDate(d.expires)}</td><td>${esc(d.notes || '-')}</td>${manage ? `<td class="actcol"><button class="sqb" data-dl="${d.id}" title="حذف">${ico('trash')}</button></td>` : ''}</tr>`).join('') || `<tr><td colspan="5" class="empty">لا توجد مستندات مسجلة</td></tr>`}</tbody></table></div>`;
    mfBind(body, f, () => { const y = window.scrollY; draw(); window.scrollTo(0, y); });
    tplBind(body, ftpls, f, 'filters:emp_docs', D, draw);
    $('#drs', body).onclick = () => { Object.assign(f, D()); draw(); };
    $('#dxe', body).onclick = () => xlSave('expired_documents', { noTitle: true, sheet: 'Worksheet', headers: ['الموظف', 'كود الموظف', 'المستند', 'تاريخ الانتهاء'], widths: [31, 16, 20, 18], rows: expired.map((x) => [x.u.name, x.u.employee_code || '', DOC_TYPES[x.d.type] || x.d.type, xlDate(x.d.expires)]) });
    $('#dxm', body).onclick = () => xlSave('missing_documents', { noTitle: true, sheet: 'Worksheet', headers: ['الموظف', 'كود الموظف', 'المستند المفقود'], widths: [31, 16, 22], rows: missing.map((x) => [x.u.name, x.u.employee_code || '', DOC_TYPES[x.t]]) });
    if ($('#dnew', body)) $('#dnew', body).onclick = () => {
      const o = modal(`<h3>مستند جديد</h3><form class="form" id="df"><label class="f full">الموظف<select name="emp" required><option value="">اختر الموظف</option>${people.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></label>
        <label class="f">نوع المستند<select name="type">${Object.entries(DOC_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label><label class="f">تاريخ الانتهاء<input type="date" name="expires"></label><label class="f full">ملاحظات<input name="notes" maxlength="200"></label>
        <div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">حفظ</button></div></form>`);
      const df = $('#df', o);
      df.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', df), async () => { const u = people.find((x) => String(x.id) === df.emp.value); await api('/config/emp_doc', 'POST', { name: u.name, type: df.type.value, expires: df.expires.value, notes: df.notes.value }); o.close(); toast('تم الحفظ'); docsPage(view); }); };
    };
    body.querySelectorAll('[data-dl]').forEach((b) => (b.onclick = () => { if (confirm('حذف المستند ده؟')) run(b, async () => { await api('/config/emp_doc/' + b.dataset.dl, 'DELETE'); docsPage(view); }); }));
  };
  draw();
}
PAGES.emp_docs = docsPage;

/* ===== إجراءات الموظفين: لوحة أعمدة بالإجراءات المتاحة ===== */
async function procPage(view) {
  view.innerHTML = empTabsHtml('emp_procedures') + '<div id="ebody"><div class="empty"><span class="spin"></span></div></div>';
  bindEmpTabs(view);
  const body = $('#ebody', view);
  if (!has('employees.manage')) { body.innerHTML = '<div class="card empty">ليس لديك صلاحية لتنفيذ إجراءات الموظفين</div>'; return; }
  let all = [], locs = [], log = [];
  try { all = (await api('/employees')).filter((u) => !u.pending); locs = await api('/locations').catch(() => []); log = await api('/config/emp_procedure').catch(() => []); } catch (e) { body.innerHTML = `<div class="card empty neg">${esc(e.message)}</div>`; return; }
  const staff = all.filter((u) => !u.is_admin), me = S.me.user, again = () => procPage(view);
  const hasSal = all.some((u) => u.base_salary !== undefined);
  const opt = (arr, cur) => arr.map(([a, b]) => `<option value="${esc(a)}" ${String(a) === String(cur) ? 'selected' : ''}>${esc(b)}</option>`).join('');
  const dl = (id, arr) => `<datalist id="${id}">${arr.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`;
  // نافذة إجراء: اختيار الموظف + حقول الإجراء + تنفيذ (وبيتسجل في سجل الإجراءات)
  const act = (title, fields, apply, pool = staff.filter((u) => u.active)) => () => {
    const o = modal(`<h3>${title}</h3><form class="form" id="pf"><label class="f full">الموظف<select name="emp" required><option value="">اختر الموظف</option>${pool.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></label>${fields}
      <div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">تنفيذ</button></div></form>`);
    const f = $('#pf', o); if (f.querySelector('[data-rs]')) reasonBind(f);
    f.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', f), async () => {
      const u = pool.find((x) => String(x.id) === f.emp.value), note = await apply(u, f.elements);
      await api('/config/emp_procedure', 'POST', { name: u.name, type: title, date: todayStr(), notes: String(note || '').slice(0, 200) });
      o.close(); toast('تم تنفيذ الإجراء'); again();
    }); };
  };
  const put = (u, b) => api('/employees/' + u.id, 'PUT', b);
  const num = (n, l, d = 0, attrs = '') => `<label class="f">${l}<input type="number" name="${n}" value="${d}" step="any" ${attrs} required></label>`;
  const cols = [
    ['إدارة الموظف', 'users', [
      ['تعيين مستوى الصلاحيات', 'shield', me.is_admin ? act('تعيين مستوى الصلاحيات', `<label class="f full">المستوى<select name="role"><option value="employee">موظف</option><option value="admin">مدير</option></select></label>`, async (u, e) => { await put(u, { role: e.role.value }); return e.role.value === 'admin' ? 'مدير' : 'موظف'; }) : () => toast('تعيين الصلاحيات للمدير فقط', true)],
      ['تغيير القسم', 'building', act('تغيير القسم', `<label class="f full">القسم الجديد<input name="v" required list="dl1" maxlength="60"></label>${dl('dl1', uniqV(staff, 'department'))}`, async (u, e) => { await put(u, { department: e.v.value }); return `${u.department || '-'} ← ${e.v.value}`; })],
      ['تغيير المنصب', 'user', act('تغيير المنصب', `<label class="f full">المنصب الجديد<input name="v" required list="dl2" maxlength="80"></label>${dl('dl2', uniqV(staff, 'job_title'))}`, async (u, e) => { await put(u, { job_title: e.v.value }); return `${u.job_title || '-'} ← ${e.v.value}`; })],
      ['تغيير المدير المباشر', 'users', act('تغيير المدير المباشر', `<label class="f full">المدير المباشر<select name="m"><option value="">بدون مدير</option>${opt(all.filter((x) => x.active).map((x) => [x.id, x.name]))}</select></label>`, async (u, e) => { await put(u, { manager_id: e.m.value ? Number(e.m.value) : null }); return e.m.selectedOptions[0].text; })],
      ['نقل موظف', 'swap', act('نقل موظف', `<label class="f full">إلى مكتب / موقع<select name="l" required><option value="">اختر</option>${opt(locs.map((l) => [l.id, l.name]))}</select></label><label class="f full">السبب<input name="r" maxlength="120"></label>`, async (u, e) => {
        const from = (u.location_ids || []).map((i) => (locs.find((l) => l.id === i) || {}).name).filter(Boolean).join('، '), to = e.l.selectedOptions[0].text;
        await put(u, { location_ids: [Number(e.l.value)] }); await api('/config/transfer', 'POST', { name: u.name, from, to, date: todayStr(), reason: e.r.value }); return `${from || '-'} ← ${to}`; })],
      ['إيقاف / تفعيل موظف', 'pause', act('إيقاف / تفعيل موظف', `<label class="f full">الإجراء<select name="a"><option value="off">إيقاف</option><option value="on">تفعيل</option></select></label>${reasonHtml()}`, async (u, e) => {
        if (e.a.value === 'on') { await put(u, { active: true }); return 'تفعيل'; }
        await put(u, { active: false, suspend_reason: e.reason.value, suspend_sub: e.sub.value, suspend_start: todayStr() }); return `إيقاف · ${e.reason.value}`; }, staff)],
    ]],
    ['إعدادات الحضور', 'clock', [
      ['تغيير مواقع تسجيل الحضور', 'pin', act('تغيير مواقع تسجيل الحضور', `<div class="full"><div class="muted small">المواقع المسموحة (من غير تحديد = أي موقع)</div><div class="row mchk">${locs.map((l) => `<label class="perm"><input type="checkbox" data-loc="${l.id}">${esc(l.name)}</label>`).join('') || '<span class="muted small">لا توجد مواقع</span>'}</div></div>`, async (u, e) => { const ids = [...document.querySelectorAll('#pf [data-loc]:checked')].map((x) => Number(x.dataset.loc)); await put(u, { location_ids: ids }); return `${ids.length} موقع`; })],
      ['تغيير مواعيد الدوام', 'timer', act('تغيير مواعيد الدوام', `<label class="f">بداية الدوام<input type="time" name="s" value="09:00" required></label><label class="f">نهاية الدوام<input type="time" name="e" value="17:00" required></label>`, async (u, e) => { await put(u, { shift_start: e.s.value, shift_end: e.e.value }); return `${e.s.value} - ${e.e.value}`; })],
    ]],
    ['تعديلات الرصيد', 'wallet', [
      ['إضافة رصيد إجازات', 'plus', act('إضافة رصيد إجازات', num('n', 'عدد الأيام', 1, 'min="0.5"'), async (u, e) => { const v = Number(u.annual_leave_days || 0) + Number(e.n.value); await put(u, { annual_leave_days: Math.round(v) }); return `+${e.n.value} يوم`; })],
      ['إعادة ضبط الرصيد', 'archive', act('إعادة ضبط الرصيد', num('n', 'الرصيد السنوي (يوم)', 21, 'min="0"'), async (u, e) => { await put(u, { annual_leave_days: Math.round(Number(e.n.value)) }); return `${e.n.value} يوم`; })],
      ['تصدير إجازات الموظفين', 'download', () => xlSave('employees_leave_balance', { noTitle: true, sheet: 'Worksheet', headers: ['الموظف', 'كود الموظف', 'القسم', 'رصيد الإجازة السنوي (يوم)'], widths: [31, 16, 22, 24], rows: staff.filter((u) => u.active).map((u) => [u.name, u.employee_code || '', u.department || '', u.annual_leave_days]) })],
    ]],
    ['الرواتب', 'dollar', [
      ...(hasSal ? [['تعديل إعدادات الراتب', 'dollar', act('تعديل إعدادات الراتب', `${num('b', 'الراتب الأساسي', 0, 'min="0"')}${num('a', 'البدلات', 0, 'min="0"')}`, async (u, e) => { await put(u, { base_salary: Number(e.b.value), allowances: Number(e.a.value) }); return `أساسي ${e.b.value} · بدلات ${e.a.value}`; })]] : []),
      ['إتمام عملية الدفع', 'wallet', () => go('payroll')],
    ]],
    ['الأصول', 'case', [['تعيين الأصول', 'case', () => go('assets')]]],
  ];
  const OLD = { promotion: 'ترقية', raise: 'تعديل راتب', warning: 'إنذار', thanks: 'شكر وتقدير', other: 'أخرى' };
  body.innerHTML = `<h3 class="procq">ماذا تريد أن تفعل؟</h3><div class="pboard">${cols.map(([t, ic, items], ci) => `<div class="pcol"><div class="pch">${ico(ic)}<b>${t}</b></div>${items.map(([l, i2], ii) => `<button class="pact" data-c="${ci}" data-i="${ii}">${ico(i2)}<span>${l}</span></button>`).join('')}</div>`).join('')}</div>
    <h4 class="mdt">آخر الإجراءات</h4><div class="tablewrap st"><table><thead><tr><th>الموظف</th><th>الإجراء</th><th>التاريخ</th><th>تفاصيل</th></tr></thead><tbody>${log.slice().reverse().slice(0, 15).map((l) => `<tr><td><b>${esc(l.name)}</b></td><td>${esc(OLD[l.type] || l.type || '-')}</td><td>${mfDate(l.date)}</td><td>${esc(l.notes || '-')}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">لا توجد إجراءات مسجلة</td></tr>'}</tbody></table></div>`;
  body.querySelectorAll('.pact').forEach((b) => (b.onclick = () => cols[Number(b.dataset.c)][2][Number(b.dataset.i)][2]()));
}
PAGES.emp_procedures = procPage;
