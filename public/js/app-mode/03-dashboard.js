'use strict';
/* app-mode/03-dashboard.js — وضع التطبيق: لوحة المعلومات */

/* لوحة المعلومات */
const GRAD = { blue: 'linear-gradient(90deg,#0a76bd,#019fff)', red: 'linear-gradient(90deg,#e0443f,#f46f6f)', green: 'linear-gradient(90deg,#2fb81f,#74c99b)', yellow: 'linear-gradient(90deg,#d5d828,#fbfbac)', orange: 'linear-gradient(90deg,#f07a22,#f8b277)', grey: 'linear-gradient(90deg,#55575a,#8c8c8c)' };
async function appDashboard(view) {
  view.innerHTML = '<div class="empty"><span class="spin"></span></div>';
  const u = S.me.user, today = S.me.today_date, nowM = thisMonth();
  const months = [];
  for (let k = 0; k < 12; k++) { const d = new Date(Date.UTC(+nowM.slice(0, 4), +nowM.slice(5) - 1 - k, 1)).toISOString().slice(0, 7); if (d < String(u.hire_date).slice(0, 7) && k) break; months.push(d); }
  const mo = months.includes(S.dmon) ? S.dmon : nowM;
  const [d, rq, att, pm] = await Promise.all([
    has('dashboard.view') ? api('/dashboard') : null, api('/requests/mine'), api('/attendance/mine?month=' + mo).catch(() => []), api('/payroll/mine?month=' + mo).catch(() => null),
  ]);
  const bl = rq.balances, dept = S.ddept || '';
  const bal = [[bl.annual_total - bl.annual_used, 'إجازة سنوية'], [bl.emergency_used, 'إجازة طارئة'], [bl.sick_used, 'إجازة مرضية'], [Number(bl.permission_hours_month).toFixed(2), 'ساعات الأذونات']];
  let stats = '';
  if (d) {
    const L = d.list.filter((x) => !dept || x.department === dept), n = (s) => L.filter((x) => x.status === s).length;
    const total = L.length;
    const card = (cls, k, num, lbl, all) => `<div class="dg ${cls}"><b>${num}</b><span>${lbl}</span>${all ? `<button class="all" data-all="${all}">عرض الكل</button>` : ''}</div>`;
    stats = `<div class="dsh"><h3>إحصائيات</h3><button class="dfil" id="dfil">${fi('sliders')}<span>تصفية</span></button></div>
      <div class="dgrid">
        <div class="dg blue wide"><b>${total}</b><span>الموظفون</span><button class="all" data-all="*">عرض الكل</button></div>
        ${card('green', 'present', n('present'), 'حاضر', 'present')}${card('red', 'late', n('late'), 'متأخر', 'late')}
        ${card('yellow', 'off', n('off'), 'يوم عطلة', '')}<div class="dg white"><b>${n('not_yet')}</b><span>لم يسجل الحضور</span><button class="all" data-all="not_yet">عرض الكل</button></div>
        ${card('grey', 'absent', n('absent'), 'غائب', 'absent')}${card('orange', 'leave', n('leave'), 'إجازة', 'leave')}
      </div>
      <div class="dmini">${has('requests.view_all') ? `<button class="card" data-go="requests"><b>${d.pending_requests}</b><span>طلبات معلّقة</span></button>` : ''}<div class="card"><b>${d.missing_face}</b><span>بدون بصمة وجه</span></div></div>`;
  }
  const hrs = att.filter((r) => r.check_in && r.check_out).reduce((s, r) => s + (new Date(r.check_out) - new Date(r.check_in)) / 3600000, 0);
  const present = pm ? pm.present_days : att.filter((r) => r.check_in).length;
  const mname = (m) => `${MONTHS_AR[Number(m.slice(5)) - 1]}-${m.slice(0, 4)}`;
  view.innerHTML = `<h3 class="dsec">الرصيد</h3><div class="dbal">${bal.map(([v, l]) => `<div class="card"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
    ${stats}
    <div class="dsh"><h3>تم استخدامه هذا الشهر</h3><label class="dmon"><select id="dmon">${months.map((m) => `<option value="${m}" ${m === mo ? 'selected' : ''}>${mname(m)}</option>`).join('')}</select><span>${mname(mo)}</span>${fi('chev_dn')}</label></div>
    <div class="dg blue wide"><b>${hrs.toFixed(2)}</b><span>ساعات العمل هذا الشهر</span></div>
    <div class="dusage">
      <div class="card"><div class="dut"><b>${pm ? pm.absent_days : 0}</b><small>الأيام</small></div><span>غائب</span>${ci('absent')}</div>
      <div class="card"><div class="dut"><b>${pm ? pm.late_days : 0}</b><small>الأيام</small></div><span>أيام التأخير</span>${ci('late')}</div>
      <div class="card"><div class="dut"><b>${Number(present).toFixed(2)}</b></div><span>أيام الحضور</span>${ci('present')}</div>
      <div class="card"><div class="dut"><b>${pm ? Number(pm.penalties).toFixed(1) : '0.0'}</b></div><span>الجزاءات</span>${ci('hourglass')}</div>
    </div>`;
  $('#dmon', view).onchange = (e) => { S.dmon = e.target.value; appDashboard(view); };
  view.querySelectorAll('[data-all]').forEach((b) => (b.onclick = () => {
    const k = b.dataset.all;
    S.empm = Object.assign(S.empm || {}, { st: k === '*' ? [] : [k], day: today, dept });
    S.emptab = 'list'; go('employees');
  }));
  view.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(b.dataset.go)));
  if ($('#dfil', view)) $('#dfil', view).onclick = () => {
    const depts = [...new Set(d.list.map((x) => x.department).filter(Boolean))];
    const o = modal(`<h3>تصفية الإحصائيات</h3><label class="f">القسم<select id="dd"><option value="">كل الأقسام</option>${depts.map((x) => `<option ${x === dept ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      <div class="actions"><button class="btn alt" data-close>إلغاء</button><button class="btn" id="dok">تطبيق</button></div>`);
    $('#dok', o).onclick = () => { S.ddept = $('#dd', o).value; o.close(); appDashboard(view); };
  };
}
