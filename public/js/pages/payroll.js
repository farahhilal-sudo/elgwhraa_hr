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
    const earned = (r) => round2c(r.accrued_basic + r.accrued_allowances);
    const cols = [
      ['الأساسي', 'tb', (r) => money(r.base_salary), () => money(tot('base_salary'))],
      ['البدلات', 'tb', (r) => money(r.allowances), () => money(tot('allowances'))],
      ['أيام محتسبة', 'tb', (r) => `${r.accrued_days} من 30`, () => ''],
      ['المستحق عن الأيام', 'tb', (r) => money(earned(r)), () => money(rows.reduce((x, r) => x + earned(r), 0))],
      ['المكافآت', 'tg', (r) => money(r.bonuses), () => money(tot('bonuses'))],
      ['الوقت الإضافي', 'tg', (r) => money(r.overtime_pay), () => money(tot('overtime_pay'))],
      ['خصم التأخير', 'tp', (r) => money(r.late_deduction), () => money(tot('late_deduction'))],
      ['خصم الغياب', 'tp', (r) => money(r.absence_deduction), () => money(tot('absence_deduction'))],
      ['الجزاءات', 'tp', (r) => money(r.penalties), () => money(tot('penalties'))],
      ['خصومات أخرى', 'tp', (r) => money(r.manual_deductions), () => money(tot('manual_deductions'))],
      ['مستحق الدفع', 'tn', (r) => money(r.net), () => money(tot('net'))],
    ];
    $('#pnote').textContent = `${MONTHS_AR[Number(mm) - 1]} ${yy} · محسوب لحد ${data.month === thisMonth() ? 'اليوم' : 'نهاية الشهر'}`;
    $('#pt').innerHTML = `<div class="tablewrap ptwrap"><table class="ptable"><tr><th class="who">الموظف</th>${cols.map(([h, c]) => `<th class="${c}">${h}</th>`).join('')}</tr>
      ${rows.map((r) => `<tr><td class="who"><b>${esc(r.name)}</b> ${r.paid ? '<span class="badge b-ok">مدفوع</span>' : data.ended ? '<span class="badge b-warn">بانتظار الصرف</span>' : ''}<div class="muted small">حضور ${r.present_days} · غياب ${r.absent_days} · تأخير ${r.late_days} يوم</div>
        <div class="noprint pact2">${has('payroll.manage') && !r.paid ? `<button class="link" data-adj="${r.user_id}">+ بند</button>` : ''}<button class="link" data-sl="${r.user_id}">تفاصيل</button>${has('payroll.manage') && !r.paid && data.ended ? `<button class="link" data-pay="${r.user_id}">تسجيل الدفع</button>` : ''}${S.me.user.is_admin && r.paid ? `<button class="link" data-unpay="${r.user_id}">إلغاء الصرف</button>` : ''}</div></td>${cols.map(([, c, fn]) => `<td class="${c}">${fn(r)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length + 1}" class="empty">لا توجد بيانات</td></tr>`}
      <tr class="totrow"><th class="who">الإجمالي (${rows.length})</th>${cols.map(([, c, , t]) => `<th class="${c}">${t()}</th>`).join('')}</tr></table></div>
      <p class="muted small">المرتب بيتحسب يوم بيوم: كل يوم بيعدّي بيستحق فيه الموظف أجر يوم = (الأساسي + البدلات) ÷ 30 (والشهر المنتهي = 30 يوم كاملين). بعدين بيتزود عليه المكافآت والوقت الإضافي، وبيتخصم منه التأخير (من شرائح خصم التأخير) والغياب (أيام الغياب × أجر اليوم) والجزاءات والخصومات. الناتج = مستحق الدفع.</p>`;
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
function adjForm(r, month, done) {
  const o = modal(`<h3>مكافأة / جزاء / خصم — ${esc(r.name)}</h3><form class="form" id="af">
    <label class="f">النوع<select name="kind"><option value="bonus">مكافأة</option><option value="penalty">جزاء</option><option value="deduction">خصم</option></select></label>
    <label class="f">المبلغ<input type="number" step="0.01" min="0.01" name="amount" required></label>
    <label class="f full">السبب<input name="reason" maxlength="200" required></label>
    <div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">إضافة</button></div></form>`);
  const f = $('#af', o);
  f.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', f), async () => { await api('/adjustments', 'POST', { user_id: r.user_id, month, kind: f.kind.value, amount: f.amount.value, reason: f.reason.value }); o.close(); toast('تمت الإضافة'); done(); }); };
}
