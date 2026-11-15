'use strict';
/* pages/payroll.js — صفحة «المرتبات والخصومات» */

/* --- المرتبات (المالية) --- */

PAGES.payroll = async (view) => {
  const cur = S.paym || thisMonth();
  const [yy, mm] = cur.split('-');
  const nowY = Number(thisMonth().slice(0, 4));
  const f = S.payf = S.payf || { emp: '', dept: '', q: '', paid: '' };
  view.innerHTML = `${financeTabs('payroll')}
    <div class="card filters"><div class="frow">
      <select id="pmo">${MONTHS_AR.map((m, i) => `<option value="${String(i + 1).padStart(2, '0')}" ${Number(mm) === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select>
      <select id="pyr">${[nowY - 2, nowY - 1, nowY, nowY + 1].map((y) => `<option ${Number(yy) === y ? 'selected' : ''}>${y}</option>`).join('')}</select>
      <select id="pemp"></select><select id="pdep"></select>
      <select id="ppaid"><option value="">كل الحالات</option><option value="paid" ${f.paid === 'paid' ? 'selected' : ''}>مدفوع</option><option value="unpaid" ${f.paid === 'unpaid' ? 'selected' : ''}>غير مدفوع</option></select>
      <label class="fsearch">${ico('search')}<input id="pq" placeholder="اسم الموظف" value="${esc(f.q)}"></label></div></div>
    <div class="row actionbar"><button class="btn alt" id="exp">${ico('download')} تصدير تقرير المرتبات</button><button class="btn alt" id="prt">${ico('print')} طباعة</button>${has('payroll.manage') ? `<button class="btn" id="payall">${ico('check')} إتمام عملية الدفع</button>` : ''}
      <span class="muted small" id="pnote" style="margin-inline-start:auto"></span></div><div id="pt"></div>`;
  bindTabs(view, (t) => go(t));
  let data;
  const reload = () => { S.paym = `${$('#pyr').value}-${$('#pmo').value}`; PAGES.payroll(view); };
  $('#pmo').onchange = reload; $('#pyr').onchange = reload;
  $('#prt').onclick = () => print();
  const load = async () => {
    data = await api('/payroll?month=' + cur);
    const depts = [...new Set(data.rows.map((r) => r.department).filter(Boolean))];
    $('#pemp').innerHTML = `<option value="">كل الموظفين</option>${data.rows.map((r) => `<option value="${r.user_id}" ${String(f.emp) === String(r.user_id) ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}`;
    $('#pdep').innerHTML = `<option value="">كل الأقسام</option>${depts.map((d) => `<option ${f.dept === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}`;
    $('#ppaid').onchange = () => { f.paid = $('#ppaid').value; draw(); };
    $('#pemp').onchange = () => { f.emp = $('#pemp').value; draw(); }; $('#pdep').onchange = () => { f.dept = $('#pdep').value; draw(); };
    $('#pq').oninput = () => { f.q = $('#pq').value; draw(); };
    draw();
  };
  const draw = () => {
    const q = f.q.trim().toLowerCase();
    const rows = data.rows.filter((r) => (!f.emp || String(r.user_id) === String(f.emp)) && (!f.dept || r.department === f.dept) && (!q || r.name.toLowerCase().includes(q)) && (!f.paid || (f.paid === 'paid') === !!r.paid));
    const tot = (k) => rows.reduce((x, r) => x + (r[k] || 0), 0);
    const info = (k, r) => ` <button type="button" class="infob noprint" data-inf="${k}:${r.user_id}" title="عرض التفاصيل" aria-label="عرض التفاصيل">!</button>`;
    const earned = (r) => round2c(r.accrued_basic + r.accrued_allowances);
    const penAll = (r) => round2c((r.late_deduction || 0) + (r.absence_deduction || 0) + (r.penalties || 0));
    const mk = (r, k) => (r.manual_social === undefined ? (k === 'other' ? r.manual_deductions : 0) : r['manual_' + k]) || 0;
    const canAdj = (r) => has('payroll.manage') && !r.paid;
    const pen = (r, cat) => `${money(mk(r, cat))}${canAdj(r) ? ` <button type="button" class="pencil noprint" data-cat="${cat}:${r.user_id}" title="إضافة خصم" aria-label="إضافة خصم">${ico('edit')}</button>` : ''}`;
    const cols = [
      ['الأساسي', 'tb', (r) => money(r.base_salary), () => money(tot('base_salary'))],
      ['البدلات', 'tb', (r) => money(r.allowances), () => money(tot('allowances')), (r) => `${money(r.allowances)}${r.allowances > 0 ? info('al', r) : ''}`],
      ['الإجمالي', 'tb', (r) => money(earned(r)), () => money(rows.reduce((x, r) => x + earned(r), 0))],
      ['العلاوات', 'tg', (r) => money(r.bonuses), () => money(tot('bonuses'))],
      ['الوقت الإضافي', 'tg', (r) => money(r.overtime_pay), () => money(tot('overtime_pay'))],
      ['غير ذلك', 'tg', (r) => money(r.compensation_pay || 0), () => money(tot('compensation_pay'))],
      ['الجزاءات', 'tp', (r) => money(penAll(r)), () => money(rows.reduce((x, r) => x + penAll(r), 0)), (r) => `${money(penAll(r))}${penAll(r) > 0 ? info('pen', r) : ''}`],
      ['اجتماعي', 'tp', (r) => money(mk(r, 'social')), () => money(rows.reduce((x, r) => x + mk(r, 'social'), 0)), (r) => pen(r, 'social')],
      ['طبي', 'tp', (r) => money(mk(r, 'medical')), () => money(rows.reduce((x, r) => x + mk(r, 'medical'), 0)), (r) => pen(r, 'medical')],
      ['الضرائب', 'tp', (r) => money(mk(r, 'tax')), () => money(rows.reduce((x, r) => x + mk(r, 'tax'), 0)), (r) => pen(r, 'tax')],
      ['أخرى', 'tp', (r) => money(mk(r, 'other')), () => money(rows.reduce((x, r) => x + mk(r, 'other'), 0)), (r) => pen(r, 'other')],
      ['مستحق الدفع', 'tw', (r) => money(r.net), () => money(tot('net'))],
      ['قيد الانتظار', 'tw', (r) => money(r.paid ? 0 : r.net), () => money(rows.reduce((x, r) => x + (r.paid ? 0 : r.net), 0))],
      ['مدفوع', 'tw', (r) => money(r.paid ? r.net : 0), () => money(rows.reduce((x, r) => x + (r.paid ? r.net : 0), 0)), (r) => `${money(r.paid ? r.net : 0)}${has('payroll.manage') && !r.paid && data.ended ? ` <button type="button" class="pencil noprint" data-pay="${r.user_id}" title="تسجيل الدفع" aria-label="تسجيل الدفع">${ico('edit')}</button>` : ''}`],
      ['الطريقة', 'tw', () => '—', () => ''],
    ];
    $('#pnote').textContent = `${MONTHS_AR[Number(mm) - 1]} ${yy} · محسوب لحد ${data.month === thisMonth() ? 'اليوم' : 'نهاية الشهر'}`;
    $('#pt').innerHTML = `<div class="tablewrap ptwrap"><table class="ptable"><tr><th class="who">الموظف</th>${cols.map(([h, c]) => `<th class="${c}">${h}</th>`).join('')}</tr>
      ${rows.map((r) => `<tr><td class="who"><b>${esc(r.name)}</b> ${r.paid ? '<span class="badge b-ok">مدفوع</span>' : data.ended ? '<span class="badge b-warn">بانتظار الصرف</span>' : ''}<div class="muted small">حضور ${r.present_days} · غياب ${r.absent_days} · تأخير ${r.late_days} يوم</div>
        <div class="noprint pact2">${has('payroll.manage') && !r.paid ? `<button class="link" data-adj="${r.user_id}">+ بند</button>` : ''}<button class="link" data-sl="${r.user_id}">تفاصيل</button>${has('payroll.manage') && !r.paid && data.ended ? `<button class="link" data-pay="${r.user_id}">تسجيل الدفع</button>` : ''}${S.me.user.is_admin && r.paid ? `<button class="link" data-unpay="${r.user_id}">إلغاء الصرف</button>` : ''}</div></td>${cols.map(([, c, fn, , h]) => `<td class="${c}">${(h || fn)(r)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length + 1}" class="empty">لا توجد بيانات</td></tr>`}
      <tr class="totrow"><th class="who">الإجمالي (${rows.length})</th>${cols.map(([, c, , t]) => `<th class="${c}">${t()}</th>`).join('')}</tr></table></div>
      <p class="muted small">المرتب بيتحسب يوم بيوم: كل يوم بيعدّي بيستحق فيه الموظف أجر يوم = (الأساسي + البدلات) ÷ 30 (والشهر المنتهي = 30 يوم كاملين). بعدين بيتزود عليه المكافآت والوقت الإضافي، وبيتخصم منه التأخير (من شرائح خصم التأخير) والغياب (أيام الغياب × أجر اليوم) والجزاءات والخصومات. الناتج = مستحق الدفع.</p>`;
    view.querySelectorAll('[data-inf]').forEach((b) => (b.onclick = () => {
      const [k, id] = b.dataset.inf.split(':'), r = data.rows.find((x) => String(x.user_id) === id);
      if (k === 'pen') return penModal(r, data.month, load);
      const head = `<h3>${k === 'pen' ? 'الجزاءات' : 'البدلات'}</h3><p class="muted small" style="margin:0 0 10px"><b>${esc(r.name)}</b> · ${MONTHS_AR[Number(mm) - 1]} ${yy}</p>`;
      let body;
      if (k === 'pen') {
        const L = (r.adjustments || []).filter((a) => a.kind === 'penalty');
        const rowsH = [['خصم التأخير', r.late_deduction, ''], ['خصم الغياب', r.absence_deduction, ''], ...L.map((a) => ['جزاء يدوي', a.amount, a.reason || '—'])].filter((x) => x[1] > 0);
        body = rowsH.length ? `<div class="tablewrap"><table class="ptinfo"><tr><th>البند</th><th>المبلغ</th><th>السبب</th></tr>${rowsH.map(([n, v, w]) => `<tr><td>${n}</td><td>${money(v)}</td><td>${esc(w)}</td></tr>`).join('')}<tr class="tot"><td>الإجمالي</td><td>${money(penAll(r))}</td><td></td></tr></table></div>` : '<p class="muted">لا توجد جزاءات.</p>';
      } else {
        body = `<div class="tablewrap"><table class="ptinfo"><tr><th>البند</th><th>القيمة</th></tr><tr><td>البدلات الشهرية</td><td>${money(r.allowances)}</td></tr><tr><td>أيام محتسبة</td><td>${r.accrued_days} من 30</td></tr><tr class="tot"><td>المستحق من البدلات</td><td>${money(r.accrued_allowances)}</td></tr></table></div>`;
      }
      modal(`${head}${body}<div class="actions" style="margin-top:12px"><button class="btn alt" data-close>إغلاق</button></div>`);
    }));
    view.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => { const [c, id] = b.dataset.cat.split(':'); adjForm(data.rows.find((r) => String(r.user_id) === id), data.month, load, { kind: 'deduction', category: c }); }));
    view.querySelectorAll('[data-adj]').forEach((b) => (b.onclick = () => adjForm(data.rows.find((r) => r.user_id == b.dataset.adj), data.month, load)));
    view.querySelectorAll('[data-sl]').forEach((b) => (b.onclick = () => {
      const r = data.rows.find((x) => x.user_id == b.dataset.sl);
      const o = viewSlip(r, has('payroll.manage') && !r.paid && r.adjustments.length ? `<h3 style="margin:14px 0 6px">حذف بند</h3>${r.adjustments.map((a) => `<div class="row small" style="justify-content:space-between"><span>${(ADJ[a.kind] || ADJ.deduction)[0]} ${money(a.amount)} — ${esc(a.reason)}</span><button class="btn alt sm" data-rm="${a.id}">حذف</button></div>`).join('')}` : '');
      o.querySelectorAll('[data-rm]').forEach((x) => (x.onclick = () => run(x, async () => { await api('/adjustments/' + x.dataset.rm, 'DELETE'); o.close(); load(); })));
    }));
    view.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = () => { if (confirm('تسجيل صرف مرتب الموظف لشهر ' + data.month + '؟ هيتقفل الكشف ومش هينفع تضيفي عليه بنود.')) run(b, async () => { await api('/payroll/pay', 'POST', { user_id: b.dataset.pay, month: data.month }); toast('تم تسجيل الصرف'); load(); }); }));
    view.querySelectorAll('[data-unpay]').forEach((b) => (b.onclick = () => { if (confirm('إلغاء صرف المرتب؟ هيتحسب الشهر من جديد.')) run(b, async () => { await api('/payroll/unpay', 'POST', { user_id: b.dataset.unpay, month: data.month }); toast('تم إلغاء الصرف'); load(); }); }));
    if ($('#payall')) $('#payall').onclick = () => { const ids = rows.filter((r) => !r.paid).map((r) => r.user_id); if (!ids.length) return toast('كل المرتبات المعروضة مدفوعة'); if (confirm(`تسجيل صرف مرتبات ${ids.length} موظف لشهر ${data.month}؟`)) run($('#payall'), async () => { const x = await api('/payroll/pay', 'POST', { user_ids: ids, month: data.month }); toast(`تم صرف ${x.paid} مرتب`); load(); }); };
    $('#exp').onclick = () => csv(`payroll-${data.month}.csv`, [['الموظف', ...cols.map((c) => c[0]), 'الحالة'], ...rows.map((r) => [r.name, ...cols.map((c) => c[2](r)), r.paid ? 'مدفوع' : 'غير مدفوع']), ['الإجمالي', ...cols.map((c) => c[3]())]]);
  };
  load();
};
const round2c = (n) => Math.round(n * 100) / 100;
function adjForm(r, month, done, preset = {}) {
  const o = modal(`<h3>مكافأة / جزاء / خصم — ${esc(r.name)}</h3><form class="form" id="af">
    <label class="f">النوع<select name="kind"><option value="bonus">مكافأة</option><option value="penalty">جزاء</option><option value="deduction">خصم</option></select></label>
    <label class="f" id="catw" hidden>التصنيف<select name="category"><option value="">أخرى</option><option value="social">اجتماعي</option><option value="medical">طبي</option><option value="tax">الضرائب</option></select></label>
    <label class="f">المبلغ<input type="number" step="0.01" min="0.01" name="amount" required></label>
    <label class="f full">السبب<input name="reason" maxlength="200" required></label>
    <div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">إضافة</button></div></form>`);
  const f = $('#af', o);
  const syncCat = () => { $('#catw', o).hidden = f.kind.value !== 'deduction'; };
  if (preset.kind) f.kind.value = preset.kind; if (preset.category) f.category.value = preset.category; f.kind.onchange = syncCat; syncCat();
  f.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', f), async () => { await api('/adjustments', 'POST', { user_id: r.user_id, month, kind: f.kind.value, category: f.kind.value === 'deduction' ? f.category.value : '', amount: f.amount.value, reason: f.reason.value }); o.close(); toast('تمت الإضافة'); done(); }); };
}

/* نافذة «الجزاء»: جزاءات الموظف يوم بيوم (غياب/تأخير/انصراف مبكر) مع تفعيل أو إلغاء تطبيقها على المرتب */
async function penModal(r, month, done) {
  const [y, m] = month.split('-').map(Number), last = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  let rows;
  const fetchRows = async () => (await api(`/att/penalties?from=${month}-01&to=${last}&user_id=${r.user_id}`)).rows;
  try { rows = await fetchRows(); } catch (e) { return toast(e.message || 'تعذّر تحميل الجزاءات', true); }
  const canEdit = has('attendance.edit');
  const manual = (r.adjustments || []).filter((a) => a.kind === 'penalty').map((a) => ({ manual: true, date: String(a.created_at || '').slice(0, 10), value: 1, unit: 'جنيه', amount: a.amount, reason: a.reason || 'جزاء يدوي', applied: true }));
  const all = () => [...rows, ...manual].sort((p, q) => (p.date < q.date ? -1 : p.date > q.date ? 1 : 0));
  const o = modal('<div id="pmb"></div>');
  const box = o.querySelector('.modal'); box.classList.add('pmodal');
  const q2 = (n) => Number(n).toFixed(2), dm = (d) => `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;
  const post = async (row, applied, note = '', extra = {}) => { await api('/att/penalties/flag', 'POST', { items: [{ user_id: row.user_id, date: row.date, kind: row.kind }], applied, note, ...extra }); Object.assign(row, { applied, note }); done(); };
  const draw = () => {
    const L = all(), tot = L.filter((x) => x.applied).reduce((t, x) => t + (x.amount || 0), 0);
    $('#pmb', o).innerHTML = `<div class="pmh"><h3>الجزاء</h3><button class="pmx" data-close aria-label="إغلاق">✕</button></div>
      <div class="pmname"><b>${esc(r.name)}</b><span dir="ltr">${last}</span></div>
      <div class="pmbody"><table class="pmt"><thead><tr><th>التاريخ</th><th>الكمية</th><th>الوحدة</th><th>المبلغ</th><th>السبب</th><th></th></tr></thead><tbody>
        ${L.map((x, i) => `<tr><td dir="ltr">${dm(x.date)}</td><td>${typeof x.value === 'number' && !x.manual ? q2(x.value) : '—'}</td><td>${x.unit}</td><td>${q2(x.amount || 0)}</td><td>${esc(x.reason)}${x.edited ? ' <span class="pmtag">معدَّل</span>' : ''}</td>
          <td><div class="pmact">${x.manual ? '' : `<button class="sqb" data-pe="${i}" title="تفاصيل / تعديل">${ico('edit')}</button><label class="tgl"><input type="checkbox" data-pt="${i}" ${x.applied ? 'checked' : ''} ${canEdit ? '' : 'disabled'}><i></i></label>`}</div></td></tr>`).join('') || '<tr><td colspan="6" class="empty">لا توجد جزاءات في هذا الشهر</td></tr>'}
      </tbody></table></div><div class="pmfoot"><span class="muted">إجمالي الجزاءات المطبّقة</span><b>${money(tot)}</b></div>`;
    o.querySelectorAll('[data-close]').forEach((b) => (b.onclick = o.close));
    o.querySelectorAll('[data-pt]').forEach((c) => (c.onchange = () => run(null, async () => { const x = L[c.dataset.pt]; try { await post(x, c.checked); toast(c.checked ? 'تم تطبيق الجزاء على المرتب' : 'تم إلغاء تطبيق الجزاء'); draw(); } catch (e) { c.checked = !c.checked; throw e; } })));
    o.querySelectorAll('[data-pe]').forEach((b) => (b.onclick = () => dayModal(L[b.dataset.pe])));
  };
  const dayModal = (x) => {
    const wd = new Date(x.date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    const d = modal(`<div class="pmh"><h3><span class="bl">${esc(r.name)}</span> <span dir="ltr" class="pmdt">${wd} ${x.date.slice(8, 10)} - ${x.date.slice(5, 7)} - ${x.date.slice(0, 4)}</span></h3><button class="pmx" data-close aria-label="إغلاق">✕</button></div>
      <div class="pmio"><div><b>تسجيل الحضور</b><span dir="ltr">${x.check_in ? clock12(x.check_in) : '-----'}</span></div><div><b>تسجيل الانصراف</b><span dir="ltr">${x.check_out ? clock12(x.check_out) : '-----'}</span></div></div>
      <div class="pmrow"><b>${esc(x.reason)}</b><span>خصم من <b class="bl">${x.from}</b></span><span>${q2(x.value)}</span><span>${x.unit}</span><span class="pmamt">${q2(x.amount || 0)} جنيه</span>
        ${canEdit ? `<button class="sqb" id="dpe" title="تعديل">${ico('edit')}</button>` : ''}<label class="tgl"><input type="checkbox" id="dpt" ${x.applied ? 'checked' : ''} ${canEdit ? '' : 'disabled'}><i></i></label><span class="pmapp">${x.applied ? 'مُطبَّق' : 'غير مُطبَّق'}</span></div>
      ${x.note ? `<p class="muted small" style="margin:10px 0 0">ملاحظة: ${esc(x.note)}</p>` : ''}`);
    d.querySelector('.modal').classList.add('pmodal', 'pmsmall');
    $('#dpt', d).onchange = (e) => run(null, async () => { try { await post(x, e.target.checked, x.note || ''); toast(e.target.checked ? 'تم تطبيق الجزاء على المرتب' : 'تم إلغاء تطبيق الجزاء'); d.close(); draw(); } catch (er) { e.target.checked = !e.target.checked; throw er; } });
    const pe = $('#dpe', d);
    if (pe) pe.onclick = () => {
      const UN = { 'الأيام': 'days', 'جنيه': 'fixed', 'الساعات': 'hours', 'الدقائق': 'minutes' }, cur = UN[x.unit] || 'days';
      const row = $('.pmrow', d), tgl = row.querySelector('.tgl'), app = row.querySelector('.pmapp');
      row.classList.add('pmedit');
      row.innerHTML = `<b>${esc(x.reason)}</b><span>خصم من <b class="bl">${x.from}</b></span><input type="number" id="ev" min="0" step="any" value="${x.value}"><select id="eu">${[['days', 'أيام'], ['fixed', 'مبلغ ثابت'], ['hours', 'ساعات'], ['minutes', 'دقائق']].map(([k, l]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${l}</option>`).join('')}</select>
        ${x.edited ? '<button type="button" class="link" id="ers">استرجاع الأصلي</button>' : ''}<span class="pmgrow"></span><button type="button" class="sqb bad" id="etr" title="حذف الجزاء (إعفاء من المرتب)">${ico('trash')}</button><button type="button" class="sqb okb" id="eok" title="حفظ">${ico('check')}</button>`;
      row.append(tgl, app);
      const refresh = async () => { rows = await fetchRows(); d.close(); draw(); done(); };
      $('#eok', d).onclick = () => run(null, async () => { const v = $('#ev', d).value; if (v === '' || !(Number(v) >= 0)) throw new Error('اكتبي رقم صحيح (صفر أو أكتر)'); await api('/att/penalties/flag', 'POST', { items: [{ user_id: x.user_id, date: x.date, kind: x.kind }], applied: true, note: x.note || '', value: Number(v), unit: $('#eu', d).value }); toast('تم تعديل الجزاء'); await refresh(); });
      $('#etr', d).onclick = () => { if (confirm('حذف الجزاء ده (إعفاء الموظف منه في المرتب)؟')) run(null, async () => { await api('/att/penalties/flag', 'POST', { items: [{ user_id: x.user_id, date: x.date, kind: x.kind }], applied: false, note: x.note || '' }); toast('تم حذف الجزاء من المرتب'); await refresh(); }); };
      const rs = $('#ers', d); if (rs) rs.onclick = () => run(null, async () => { await api('/att/penalties/flag', 'POST', { items: [{ user_id: x.user_id, date: x.date, kind: x.kind }], applied: x.applied, note: x.note || '', reset: true }); toast('تم استرجاع القيمة الأصلية'); await refresh(); });
    };
  };
  draw();
}
