'use strict';
/* pages/reports.js — صفحة «التقارير» */

/* --- التقارير --- */
PAGES.reports = async (view) => {
  view.innerHTML = `<div class="page-head"><h2>التقرير الشهري</h2><div class="row noprint"><input type="month" id="rm" value="${thisMonth()}" style="width:auto"><button class="btn alt" id="exp">تصدير CSV</button><button class="btn alt" onclick="print()">طباعة</button></div></div><div id="rt"></div>`;
  let data;
  const load = async () => {
    data = await api('/reports/monthly?month=' + $('#rm').value);
    $('#rt').innerHTML = `<div class="tablewrap"><table><tr><th>الموظف</th><th class="num">أيام العمل</th><th class="num">حضور</th><th class="num">غياب</th><th class="num">إجازات</th><th class="num">تأخير (د)</th><th class="num">انصراف مبكر (د)</th><th class="num">إضافي (س)</th><th class="num">أذونات (س)</th></tr>
      ${data.rows.map((r) => `<tr><td><b>${esc(r.name)}</b></td><td class="num">${r.work_days}</td><td class="num">${r.present_days}</td><td class="num ${r.absent_days ? 'neg' : ''}">${r.absent_days}</td><td class="num">${r.leave_days}</td><td class="num">${r.late_minutes}</td><td class="num">${r.early_minutes}</td><td class="num">${r.overtime_hours}</td><td class="num">${r.permission_hours}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">لا توجد بيانات</td></tr>'}</table></div>`;
  };
  $('#rm').onchange = load;
  $('#exp').onclick = () => csv(`report-${data.month}.csv`, [['الموظف', 'أيام العمل', 'حضور', 'غياب', 'إجازات', 'تأخير (د)', 'انصراف مبكر (د)', 'إضافي (س)', 'أذونات (س)'], ...data.rows.map((r) => [r.name, r.work_days, r.present_days, r.absent_days, r.leave_days, r.late_minutes, r.early_minutes, r.overtime_hours, r.permission_hours])]);
  load();
};
