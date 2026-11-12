'use strict';
/* pages/attendance-log.js — صفحة «سجل الحضور» وتفاصيل الحضور والتسجيل اليدوي */

/* --- سجل الحضور للجميع --- */
PAGES.attendance = async (view) => {
  const emps = has('employees.view') ? await api('/employees') : [];
  const first = thisMonth() + '-01';
  view.innerHTML = `<div class="page-head"><h2>سجل الحضور</h2><div class="row noprint">${has('attendance.edit') ? '<button class="btn" id="man">+ تسجيل يدوي</button>' : ''}<button class="btn alt" id="exp">تصدير CSV</button></div></div>
    <div class="card form" style="margin-bottom:12px;grid-template-columns:repeat(3,1fr)"><label class="f">من<input type="date" id="f1" value="${first}"></label><label class="f">إلى<input type="date" id="f2" value="${todayStr()}"></label>
    <label class="f">الموظف<select id="f3"><option value="">الكل</option>${emps.filter((e) => !e.is_admin).map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></label></div><div id="al"></div>`;
  let rows = [];
  const load = async () => {
    rows = await api(`/attendance?from=${$('#f1').value}&to=${$('#f2').value}&user_id=${$('#f3').value}`);
    $('#al').innerHTML = rows.length ? `<div class="tablewrap"><table><tr><th>اليوم</th><th>الموظف</th><th>حضور</th><th>انصراف</th><th>تأخير</th><th>مبكر</th><th>تطابق الوجه</th><th>الموقع</th><th></th></tr>
      ${rows.map((a) => `<tr><td>${fmtDate(a.date)}</td><td>${esc(a.user_name)}</td><td>${fmtTime(a.check_in)}</td><td>${fmtTime(a.check_out)}</td><td class="${a.late_minutes ? 'neg' : ''}">${a.late_minutes} د</td><td class="${a.early_minutes ? 'neg' : ''}">${a.early_minutes} د</td>
      <td>${a.in_face != null ? (100 - Math.round(a.in_face * 100)) + '%' : (a.note ? 'يدوي' : '—')}</td><td>${a.in_loc ? esc(a.in_loc) + ' ' : ''}${a.in_lat != null ? `<a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${a.in_lat},${a.in_lng}">خريطة</a>` : '—'}</td>
      <td>${has('attendance.edit') ? `<button class="btn alt sm" data-ed="${a.id}">تعديل</button> <button class="btn alt sm" data-rm="${a.id}">حذف</button>` : ''}</td></tr>`).join('')}</table></div>` : '<div class="card empty">لا توجد سجلات</div>';
    view.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { if (confirm('حذف السجل؟')) run(b, async () => { await api('/attendance/' + b.dataset.rm, 'DELETE'); load(); }); }));
    view.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => { const a = rows.find((r) => r.id == b.dataset.ed); manualAtt(emps, a, load); }));
  };
  ['f1', 'f2', 'f3'].forEach((i) => ($('#' + i).onchange = load));
  if ($('#man')) $('#man').onclick = () => manualAtt(emps, null, load);
  $('#exp').onclick = () => csv('attendance.csv', [['التاريخ', 'الموظف', 'حضور', 'انصراف', 'تأخير (د)', 'انصراف مبكر (د)'], ...rows.map((a) => [a.date, a.user_name, fmtTime(a.check_in), fmtTime(a.check_out), a.late_minutes, a.early_minutes])]);
  load();
};
const locBox = (a, kind) => {
  const has = hasLL(a, kind), ph = !!a[kind + '_photo'];
  return `<div class="locbox"><h4>${kind === 'in' ? 'موقع تسجيل الحضور' : 'موقع تسجيل الانصراف'}</h4>
    <div class="locmap phwrap">${has ? mapFrame(a[kind + '_lat'], a[kind + '_lng']) : '<div class="locnone">لا يوجد موقع مسجل</div>'}${ph ? `<img class="locphoto" alt="صورة البصمة" data-aid="${a.id}" data-kind="${kind}" hidden>` : ''}</div>
    ${a['check_' + kind] ? `<div class="muted small" style="margin-top:6px">${fmtTime(a['check_' + kind])}${a[kind + '_loc'] ? ' · ' + esc(a[kind + '_loc']) : ''}</div>` : ''}</div>`;
};
// نافذة الموبايل لعرض موقع/صورة حضور موظف (للمدير)
function attViewModal(u, rec, day, kind0) {
  let kind = kind0 === 'out' && rec.check_out ? 'out' : 'in', photoView = false;
  const dt = new Date(day + 'T00:00:00').toLocaleDateString('ar-EG-u-nu-latn', { day: '2-digit', month: 'long', year: 'numeric' });
  const o = modal('<div class="avm"></div>');
  const draw = () => {
    const iso = rec['check_' + kind], place = rec[kind + '_loc'] || '', hasPh = !!rec[kind + '_photo'];
    const tm = iso ? new Date(iso).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: TZ }) : '—';
    $('.avm', o).innerHTML = `<div class="avm-top"><span class="avm-name">${esc(u.name)}</span><span class="avm-date">${esc(dt)}</span></div>
      <div class="avm-tabs"><button data-k="in" class="${kind === 'in' ? 'on' : ''}">تسجيل الدخول</button><button data-k="out" class="${kind === 'out' ? 'on' : ''}" ${rec.check_out ? '' : 'disabled'}>تسجيل الخروج</button></div>
      ${photoView
        ? `<div class="avm-photo phwrap">${hasPh ? `<img alt="صورة البصمة" data-aid="${rec.id}" data-kind="${kind}" hidden>` : ''}<div class="avm-none">${hasPh ? 'جارٍ تحميل الصورة...' : 'لا توجد صورة لهذا التسجيل'}</div></div>`
        : `${place ? `<div class="avm-place">${esc(place)}</div>` : ''}<div class="avm-map">${hasLL(rec, kind) ? mapFrame(rec[kind + '_lat'], rec[kind + '_lng']) : '<div class="avm-none">لا يوجد موقع مسجل</div>'}</div>`}
      <div class="avm-btns"><span class="avm-pill">${esc(tm)}<span class="avm-ic ${kind}">${kind === 'in' ? '⇥' : '⇤'}</span></span>
        <button class="avm-pill tog" id="avtog">${photoView ? `${esc(place || 'الموقع')} ${ICO_PIN}` : `صورة ${ICO_EYE}`}</button></div>
      <button class="avm-back" data-close>عودة</button>`;
    o.querySelectorAll('[data-close]').forEach((b) => (b.onclick = o.close));
    o.querySelectorAll('.avm-tabs [data-k]').forEach((b) => (b.onclick = () => { kind = b.dataset.k; draw(); }));
    $('#avtog', o).onclick = () => { photoView = !photoView; draw(); };
    fillPhotos(o);
    o.querySelectorAll('.avm-photo img').forEach((img) => (img.onload = () => { const n = img.parentElement.querySelector('.avm-none'); if (n) n.remove(); }));
  };
  draw();
}
function manualAtt(emps, a, done) {
  const hm = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '');
  const isEdit = a && !a.manual_new;
  const emp = a && emps.find((e) => e.id === a.user_id);
  const head = isEdit
    ? `<div class="atthead"><div><h3 style="margin:0">تعديل بيانات الحضور</h3><div class="muted small">${esc((emp && emp.name) || a.user_name || '')} · ${esc(fmtDate(a.date))}${emp ? ` · (${esc(fmt12(emp.shift_start))} - ${esc(fmt12(emp.shift_end))})` : ''}</div></div><span class="badge-admin">تعديل المدير</span></div>`
    : '<h3>تسجيل حضور يدوي</h3>';
  const o = modal(`${head}<form class="form" id="mf">
    <label class="f full">الموظف<select name="user_id" ${a ? 'disabled' : ''}>${emps.filter((e) => !e.is_admin).map((e) => `<option value="${e.id}" ${a && a.user_id === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>
    <label class="f">التاريخ<input type="date" name="date" value="${a?.date || todayStr()}" ${a ? 'readonly' : ''} required></label>
    <label class="f">ملاحظة<input name="note" value="${esc(a?.note)}" placeholder="سبب التعديل"></label>
    <label class="f">الحضور<input type="time" name="check_in" value="${hm(a?.check_in)}"></label>
    <label class="f">الانصراف<input type="time" name="check_out" value="${hm(a?.check_out)}"></label>
    ${isEdit && !IS_APP && a.id ? `<div class="locsec full"><h4>مواقع تسجيل الحضور والانصراف</h4><div class="locgrid">${locBox(a, 'in')}${locBox(a, 'out')}</div></div>` : ''}
    <div class="actions full efoot"><span class="chg"><b id="chgn">0 التغييرات</b> <span class="muted" id="chgt">لا توجد تغييرات بعد</span></span><span class="grow"></span><button type="button" class="btn alt" data-close>${isEdit ? 'إلغاء' : 'إلغاء'}</button><button class="btn" id="msave">${isEdit ? 'حفظ التغييرات' : 'حفظ'}</button></div></form>`);
  if (isEdit) o.classList.add('att');
  const f = $('#mf', o);
  if (isEdit) fillPhotos(o);
  // عدّاد التغييرات: الحفظ مايتفعّلش إلا لو فيه تعديل فعلاً
  const FIELDS = { check_in: 'الحضور', check_out: 'الانصراف', note: 'الملاحظة' }, init = {};
  Object.keys(FIELDS).forEach((k) => (init[k] = f[k].value));
  const upd = () => {
    const ch = Object.keys(FIELDS).filter((k) => f[k].value !== init[k]);
    $('#chgn', o).textContent = `${ch.length} التغييرات`;
    $('#chgt', o).textContent = ch.length ? ch.map((k) => FIELDS[k]).join('، ') : 'لا توجد تغييرات بعد';
    if (isEdit) $('#msave', o).disabled = !ch.length;
  };
  if (!isEdit) $('.chg', o).hidden = true;
  f.addEventListener('input', upd); upd();
  f.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', f), async () => {
    await api('/attendance', 'POST', { user_id: a ? a.user_id : f.user_id.value, date: f.date.value, check_in: f.check_in.value, check_out: f.check_out.value, note: f.note.value || 'تعديل يدوي' });
    o.close(); toast('تم الحفظ'); done();
  }); };
}
