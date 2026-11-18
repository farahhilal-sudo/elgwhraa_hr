'use strict';
/* pages/requests.js — صفحة «الطلبات الواردة» (للمدير) */

/* --- الطلبات (إدارة) --- */
PAGES.requests = async (view) => {
  view.innerHTML = `<div class="page-head"><h2>الطلبات</h2><select id="st" style="width:auto"><option value="pending">قيد الانتظار</option><option value="">الكل</option><option value="approved">المقبولة</option><option value="rejected">المرفوضة</option></select></div><div id="rl"></div>`;
  const load = async () => {
    $('#rl').innerHTML = reqTable(await api('/requests?status=' + $('#st').value), true);
    view.querySelectorAll('[data-dec]').forEach((b) => (b.onclick = () => {
      const note = prompt(b.dataset.dec === 'approved' ? 'ملاحظة (اختياري)' : 'سبب الرفض (اختياري)') ;
      if (note === null) return;
      run(b, async () => { await api(`/requests/${b.dataset.id}/decide`, 'POST', { decision: b.dataset.dec, note }); toast('تم'); load(); });
    }));
  };
  $('#st').onchange = load; load();
};
