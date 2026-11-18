'use strict';
/* settings/20-offices.js — الإعدادات ← شركة ← مكاتب وأماكن العمل (GPS) ونموذج المكتب */

/* --- مكاتب وأماكن العمل (مواقع الحضور بالـ GPS) --- */
const officesSpec = () => ({
  newLabel: 'مكتب جديد', searchPh: 'بحث', tabs: STATUS_TABS, fields: [],
  sel: { ph: 'الكل', opts: [['office', 'المكتب']], pred: () => true },
  load: async () => {
    const [locs, emps] = await Promise.all([api('/locations'), api('/employees').catch(() => [])]);
    return locs.map((l) => ({ ...l, active: !!l.active, n: emps.filter((u) => u.active && !u.pending && (u.location_ids || []).includes(l.id)).length }));
  },
  remove: (it) => api('/locations/' + it.id, 'DELETE'),
  form: (it, reload) => locForm(it, reload),
  delMsg: 'حذف المكتب ده؟',
  text: (it) => `${it.name} ${it.lat} ${it.lng}`,
  cols: [
    ['الاسم', (it) => `<b>${esc(it.name)}</b>`], ['النوع', () => 'المكتب'], ['عدد الموظفين', (it) => `${it.n} / غير محدد`],
    ['اللغة', () => esc(SETV.language)], ['دولة', () => esc(SETV.country)], ['العملة', () => esc(SETV.currency)],
    ['بداية الشهر', () => esc(SETV.month_start)], ['أول شهر في السنة', () => esc(SETV.first_month)], ['بداية الأسبوع', () => DAYS[Number(SETV.week_start)] || '—'],
    ['العنوان', (it) => `<span dir="ltr">${it.lat.toFixed(5)}, ${it.lng.toFixed(5)}</span><div class="muted small">نطاق ${it.radius_m} م</div>`],
    ['المنطقة الزمنية', () => esc(SETV.timezone)],
  ],
});

function locForm(l, done) {
  const o = modal(`<h3>${l ? 'تعديل موقع' : 'موقع عمل جديد'}</h3><form class="form" id="lcf">
    <label class="f full">اسم الموقع (مثلاً: الإدارة)<input name="name" value="${esc(l?.name)}" required maxlength="60"></label>
    <label class="f">خط العرض<input name="lat" value="${esc(l?.lat ?? '')}" inputmode="decimal" required></label>
    <label class="f">خط الطول<input name="lng" value="${esc(l?.lng ?? '')}" inputmode="decimal" required></label>
    <label class="f">النطاق المسموح (متر)<input type="number" name="radius_m" min="20" max="5000" value="${l?.radius_m ?? 150}" required></label>
    <div style="align-self:end"><button type="button" class="btn alt" id="here" style="width:100%">استخدام موقعي الحالي</button></div>
    <label class="f">الحالة<select name="active"><option value="1" ${l && !l.active ? '' : 'selected'}>نشط</option><option value="0" ${l && !l.active ? 'selected' : ''}>غير نشط</option></select></label>
    <p class="muted small full" style="margin:0">الأفضل تفتحي الصفحة وانتِ في مكان العمل وتضغطي «استخدام موقعي الحالي».</p>
    <div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">حفظ</button></div></form>`);
  const f = $('#lcf', o);
  $('#here', o).onclick = (e) => run(e.target, async () => { const p = await getPos(); f.lat.value = p.lat.toFixed(6); f.lng.value = p.lng.toFixed(6); toast(`تم التقاط الموقع (دقة ~${Math.round(p.acc)} م)`); });
  f.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', f), async () => {
    const b = { name: f.name.value, lat: f.lat.value, lng: f.lng.value, radius_m: f.radius_m.value, active: f.active.value };
    await api(l ? '/locations/' + l.id : '/locations', l ? 'PUT' : 'POST', b);
    o.close(); toast('تم الحفظ'); done();
  }); };
}
