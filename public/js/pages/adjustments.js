'use strict';
/* pages/adjustments.js — صفحة «المكافآت والجزاءات والخصومات» */

/* --- المكافآت والجزاءات والخصومات --- */
const adjPage = (cfg) => async (view) => {
  const KIND_LBL = { bonus: 'مكافآت', penalty: 'جزاءات', deduction: 'خصومات' };
  view.innerHTML = `${financeTabs(cfg.tab)}<div class="page-head"><h2>${cfg.title}</h2><div class="row noprint">
    <input type="month" id="am" value="${thisMonth()}" style="width:auto">
    ${cfg.kinds.length > 1 ? `<select id="ak" style="width:auto"><option value="">كل الأنواع</option>${cfg.kinds.map((k) => `<option value="${k}">${KIND_LBL[k]}</option>`).join('')}</select>` : '<select id="ak" hidden></select>'}
    ${has('payroll.manage') ? '<button class="btn" id="aadd">+ إضافة بند</button>' : ''}</div></div><div id="at"></div>`;
  bindTabs(view, (t) => go(t));
  let data;
  const load = async () => {
    data = await api('/adjustments?month=' + $('#am').value);
    const kind = $('#ak').value;
    data.rows = data.rows.filter((r) => cfg.kinds.includes(r.kind));
    const rows = data.rows.filter((r) => !kind || r.kind === kind);
    const sum = (k) => data.rows.filter((r) => r.kind === k).reduce((s, r) => s + r.amount, 0);
    $('#at').innerHTML = `<div class="grid g3" style="margin-bottom:12px">${cfg.kinds.map((k) => `<div class="card"><div class="muted small">إجمالي ${KIND_LBL[k]}</div><b class="${k === 'bonus' ? 'pos' : 'neg'}" style="font-size:20px">${money(sum(k))}</b></div>`).join('')}</div>
      <div class="tablewrap"><table><tr><th>التاريخ</th><th>الموظف</th><th>النوع</th><th class="num">المبلغ</th><th>السبب</th><th>بواسطة</th><th class="noprint"></th></tr>
      ${rows.map((r) => { const t = ADJ[r.kind] || ADJ.deduction; return `<tr><td>${esc(String(r.created_at || '').slice(0, 10))}</td><td><b>${esc(r.user_name)}</b></td><td><span class="badge ${r.kind === 'bonus' ? 'b-ok' : 'b-bad'}">${t[0]}</span></td><td class="num ${t[1]}">${money(r.amount)}</td><td style="white-space:normal">${esc(r.reason || '—')}</td><td class="muted small">${esc(r.created_by_name || '—')}</td><td class="noprint">${has('payroll.manage') ? `<button class="btn alt sm" data-rm="${r.id}">حذف</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">لا توجد بنود في هذا الشهر</td></tr>'}</table></div>`;
    view.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { if (confirm('حذف البند ده؟')) run(b, async () => { await api('/adjustments/' + b.dataset.rm, 'DELETE'); toast('تم الحذف'); load(); }); }));
  };
  $('#am').onchange = load; $('#ak').onchange = load;
  if ($('#aadd')) $('#aadd').onclick = () => {
    const o = modal(`<h3>إضافة بند</h3><form class="form" id="nf">
      <label class="f full">الموظف<select name="user_id" required><option value="">اختار الموظف</option>${data.employees.map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></label>
      <label class="f">النوع<select name="kind">${cfg.kinds.map((k) => `<option value="${k}">${{ bonus: 'مكافأة', penalty: 'جزاء', deduction: 'خصم' }[k]}</option>`).join('')}</select></label>
      ${adjAmtHtml()}
      <label class="f">عن شهر<input type="month" name="month" value="${$('#am').value}" required></label>
      <label class="f full">السبب<input name="reason" maxlength="200" required></label>
      <div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">إضافة</button></div></form>`);
    const f = $('#nf', o); adjAmtBind(f);
    f.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', f), async () => {
      await api('/adjustments', 'POST', { user_id: f.user_id.value, month: f.month.value, kind: f.kind.value, ...adjAmtPayload(f), reason: f.reason.value });
      o.close(); toast('تمت الإضافة'); load();
    }); };
  };
  load();
};
PAGES.adjustments = adjPage({ tab: 'adjustments', title: 'المكافآت والجزاءات والخصومات', kinds: ['bonus', 'penalty', 'deduction'] });
PAGES.bonuses = adjPage({ tab: 'bonuses', title: 'المكافآت', kinds: ['bonus'] });
PAGES.deductions = adjPage({ tab: 'deductions', title: 'الخصومات والجزاءات', kinds: ['deduction', 'penalty'] });
