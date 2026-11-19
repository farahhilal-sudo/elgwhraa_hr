'use strict';
/* pages/assets.js — إدارة الأصول: أصول الشركة / طلبات الأصول / أنواع الأصول / مكان التخزين / الأصول الخردة / سجل الأصول (يعتمد على hr-docs.js للمكوّن المشترك) */
const AS_ACT = { add: 'إضافة', edit: 'تعديل', delete: 'حذف', assign: 'تسليم', return: 'استرجاع', scrap: 'تحويل لخردة', restore: 'استعادة' };
const asTabs = (cur) => tabsBar([['as_assets', 'أصول الشركة', 'hd_box'], ['as_requests', 'طلبات الأصول', 'hd_box'], ['as_types', 'أنواع الأصول', 'hd_box'], ['as_locations', 'مكان التخزين', 'hd_box'], ['as_scrap', 'الأصول الخردة', 'hd_box'], ['as_log', 'سجل الأصول', 'hd_box']], cur);
const asAvail = (a) => (a.available_units > 0 ? `<span class="hbd ok">متوفر</span>` : '<span class="hbd bad">غير متوفر</span>');

function asForm(d, a, done) {
  const edit = !!a, v = a || { serialized: 1, units: '', serials: [] };
  let ser = v.serialized ? 1 : 0;
  const m = modal(`<div class="tkmh"><h3>${edit ? 'تعديل الأصل' : 'الأصول الجديدة'}</h3><button class="sqb" data-close>✕</button></div><form class="tkform" id="asf">
    <label class="f">الاسم<input name="name" required maxlength="150" placeholder="إدخال اسم الأصل" value="${esc(v.name || '')}"></label>
    <div class="tkgrid" style="margin-top:12px">
      <label class="f">النوع<select name="type_name"><option value="">تحديد خيار</option>${d.types.map((t) => `<option ${v.type_name === t.name ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
      <label class="f">الماركة<input name="brand" placeholder="أدخل العلامة التجارية للأصول" value="${esc(v.brand || '')}"></label>
      <label class="f">الطراز<input name="model" placeholder="أدخل نموذج الأصول" value="${esc(v.model || '')}"></label>
      <label class="f">عدد الوحدات<input name="units" type="number" min="1" placeholder="أدخل عدد الوحدات" value="${esc(v.units || '')}"></label></div>
    <div class="f" style="margin-top:12px">نوع المنتج<div class="tkpri two"><label class="tkp"><input type="radio" name="serialized" value="1" ${ser ? 'checked' : ''}><i></i><span>مسلسل</span></label><label class="tkp"><input type="radio" name="serialized" value="0" ${ser ? '' : 'checked'}><i></i><span>غير مسلسل</span></label></div></div>
    <label class="f" style="margin-top:12px">مواقع التخزين<select name="location"><option value="">تحديد خيار</option>${d.locations.map((t) => `<option ${v.location === t.name ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
    <label class="f" id="serbox" style="margin-top:12px">الأرقام التسلسلية<textarea name="serials" rows="3" placeholder="أدخل عدد الوحدات، أو الصق الأرقام التسلسلية لإضافتها (رقم في كل سطر).">${esc((v.serials || []).join('\n'))}</textarea></label>
    <div class="tkmf"><button class="btn" id="assave">حفظ</button></div></form>`);
  m.querySelector('.modal').classList.add('tkmodal', 'narrow');
  const f = $('#asf', m), tog = () => { $('#serbox', m).hidden = f.serialized.value !== '1'; }; f.querySelectorAll('[name=serialized]').forEach((r) => (r.onchange = tog)); tog();
  f.onsubmit = (e) => { e.preventDefault(); run($('#assave', m), async () => {
    const b = { name: f.name.value, type_name: f.type_name.value, brand: f.brand.value, model: f.model.value, units: f.units.value, serialized: f.serialized.value === '1', location: f.location.value, serials: f.serials.value };
    await api(edit ? '/assets/' + a.id : '/assets', edit ? 'PUT' : 'POST', b); m.close(); toast('تم الحفظ'); done();
  }); };
}
function asDetails(d, a, done) {
  const m = modal(`<div class="tkmh"><h3>${esc(a.name)}</h3><button class="sqb" data-close>✕</button></div><div class="tkform">
    <p class="muted small">${esc(a.type_name || '—')} · ${esc(a.brand || '')} ${esc(a.model || '')} · المكان: ${esc(a.location || '—')} · المتاح ${a.available_units} من ${a.units}</p>
    ${a.serials.length ? `<div class="f">الأرقام التسلسلية<div class="hser">${a.serials.map((s) => `<span>${esc(s)}</span>`).join('')}</div></div>` : ''}
    <div class="f" style="margin-top:12px">المسلّم لهم${a.assigned.length ? '' : ' <span class="muted small">— لا أحد</span>'}</div>
    ${a.assigned.map((x) => `<div class="hrow"><b>${esc(x.name)}</b><span class="muted small">${x.units} وحدة · ${hdDate(x.at)}</span><span class="grow"></span>${d.can_manage ? `<button class="btn alt" data-ret="${x.user_id}">استرجاع</button>` : ''}</div>`).join('')}</div>`);
  m.querySelector('.modal').classList.add('tkmodal', 'narrow');
  m.querySelectorAll('[data-ret]').forEach((b) => (b.onclick = () => run(b, async () => { await api(`/assets/${a.id}/return`, 'POST', { user_id: b.dataset.ret }); m.close(); toast('تم الاسترجاع'); done(); })));
}
function asImport(done) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,text/csv';
  inp.onchange = async () => {
    const txt = await inp.files[0].text(), lines = txt.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
    const rows = lines.map((l) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim()));
    const data = rows.filter((r, i) => !(i === 0 && /الاسم|name/i.test(r[0])));
    if (!data.length) return toast('الملف فاضي');
    let ok = 0, bad = 0;
    for (const r of data) { try { await api('/assets', 'POST', { name: r[0], type_name: r[1], brand: r[2], model: r[3], units: r[4] || 1, location: r[5], serials: (r[6] || '').replace(/[|;]/g, '\n'), serialized: !!r[6] }); ok++; } catch { bad++; } }
    toast(`تم استيراد ${ok} أصل${bad ? ` (فشل ${bad})` : ''}`); done();
  };
  inp.click();
}
PAGES.as_assets = (view) => hdList(view, {
  tabs: asTabs, cur: 'as_assets', key: 'asa', defaults: { avail: '' }, seg: [['', 'الكل'], ['1', 'متوفر'], ['0', 'غير متوفر']], segKey: 'avail',
  filters: [{ k: 'q', ph: 'بحث' }],
  load: (F) => api('/assets?' + hdQs(F, ['q', 'avail'])),
  add: { label: 'أصل جديد', fn: (d, reload) => asForm(d, null, reload) },
  extraBtns: [`<button class="btn alt" id="asimp">${ico('hd_up')} استيراد الأصول</button>`, `<button class="btn alt" id="asexp">${ico('download')} تصدير</button>`],
  mounted: (view2, get, reload) => { $('#asimp', view2).onclick = () => asImport(reload); $('#asexp', view2).onclick = () => csv('assets.csv', [['الاسم', 'النوع', 'الماركة', 'الطراز', 'الوحدات', 'المتاح', 'المكان', 'الأرقام التسلسلية'], ...get().rows.map((a) => [a.name, a.type_name, a.brand, a.model, a.units, a.available_units, a.location, a.serials.join(' | ')])]); },
  cols: [['الاسم', (a) => `<b>${esc(a.name)}</b>`], ['النوع', (a) => esc(a.type_name || '—')], ['الماركة / الطراز', (a) => esc([a.brand, a.model].filter(Boolean).join(' / ') || '—')], ['الوحدات', (a) => `${a.available_units} / ${a.units}`], ['المكان', (a) => esc(a.location || '—')], ['الحالة', asAvail]],
  acts: (a, d) => `<button class="sqb" data-ad="${a.id}" title="تفاصيل">${ico('eye')}</button>${d.can_manage ? `<button class="sqb" data-as="${a.id}" title="تسليم لموظف">${ico('hd_up')}</button><button class="sqb" data-ae="${a.id}" title="تعديل">${ico('edit')}</button><button class="sqb" data-ax="${a.id}" title="تحويل لخردة">${ico('trash')}</button>` : ''}`,
  onActs: (root, d, reload) => {
    const get = (b, k) => d.rows.find((x) => String(x.id) === b.dataset[k]);
    root.querySelectorAll('[data-ad]').forEach((b) => (b.onclick = () => asDetails(d, get(b, 'ad'), reload)));
    root.querySelectorAll('[data-ae]').forEach((b) => (b.onclick = () => asForm(d, get(b, 'ae'), reload)));
    root.querySelectorAll('[data-as]').forEach((b) => (b.onclick = () => { const a = get(b, 'as'); if (a.available_units < 1) return toast('مفيش وحدات متاحة'); hdForm(`تسليم: ${a.name}`, [{ k: 'user_id', l: 'الموظف', t: 'select', opts: d.employees.map((e) => [e.id, e.name]) }, { k: 'units', l: 'عدد الوحدات', t: 'number', v: 1, attrs: `min="1" max="${a.available_units}"` }], async (x) => { await api(`/assets/${a.id}/assign`, 'POST', x); toast('تم التسليم'); reload(); }, { btn: 'تسليم' }); }));
    root.querySelectorAll('[data-ax]').forEach((b) => (b.onclick = () => { const a = get(b, 'ax'); hdForm(`تحويل «${a.name}» لخردة`, [{ k: 'reason', l: 'السبب', t: 'textarea', full: true }], async (x) => { await api(`/assets/${a.id}/scrap`, 'POST', x); toast('اتحوّل للخردة'); reload(); }, { btn: 'تحويل' }); }));
  },
});

PAGES.as_requests = (view) => hdList(view, {
  tabs: asTabs, cur: 'as_requests', key: 'asr', defaults: { status: 'pending' },
  filters: [{ k: 'q', ph: 'بحث' }, { k: 'status', ph: 'الحالة', t: 'select', opts: [['pending', 'قيد الانتظار'], ['approved', 'مقبول'], ['rejected', 'مرفوض']] }],
  load: (F) => api('/asset-requests?' + hdQs(F, ['q', 'status'])),
  add: { label: 'طلب جديد', show: (d) => d.can_manage, fn: (d, reload) => hdForm('طلب أصل جديد', [{ k: 'user_id', l: 'الموظف', t: 'select', opts: d.employees.map((e) => [e.id, e.name]) }, { k: 'type_name', l: 'نوع الأصل', t: 'select', opts: d.types.map((t) => [t.name, t.name]) }, { k: 'note', l: 'ملاحظة', t: 'textarea', full: true }], async (b) => { await api('/asset-requests', 'POST', b); toast('تم الطلب'); reload(); }) },
  cols: [['الموظف', (r) => `<b>${esc(r.user_name)}</b>`], ['نوع الأصل', (r) => esc(r.type_name)], ['ملاحظة', (r) => esc(r.note || '—')], ['التاريخ', (r) => hdDate(r.created_at)], ['الحالة', (r) => hdSt(r.status)]],
  acts: (r, d) => (r.status === 'pending' && d.can_manage ? `<button class="hq ok" data-d="approved" data-id="${r.id}">قبول ${ico('check')}</button><button class="hq bad" data-d="rejected" data-id="${r.id}">رفض ${ico('trash')}</button>` : ''),
  onActs: (root, d, reload) => root.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => {
    if (b.dataset.d === 'rejected') return run(b, async () => { await api(`/asset-requests/${b.dataset.id}/decide`, 'POST', { decision: 'rejected' }); toast('تم الرفض'); reload(); });
    const r = d.rows.find((x) => String(x.id) === b.dataset.id), opts = d.assets.filter((a) => !r.type_name || a.type_name === r.type_name || !a.type_name).map((a) => [a.id, `${a.name} (متاح ${a.available_units})`]);
    if (!opts.length) return toast('مفيش أصل متاح من النوع ده في المخزن');
    hdForm('قبول طلب الأصل', [{ k: 'asset_id', l: 'الأصل المراد تسليمه', t: 'select', opts, full: true }], async (x) => { await api(`/asset-requests/${r.id}/decide`, 'POST', { decision: 'approved', asset_id: x.asset_id }); toast('تم التسليم'); reload(); }, { btn: 'قبول وتسليم' });
  })),
});

const asCat = (cur, kind, label) => async (view) => { view.innerHTML = `${asTabs(cur)}<div id="ascat"></div>`; bindTabs(view, (t) => go(t)); await catalog($('#ascat', view), simpleSpec(kind, label, [DESC])); };
PAGES.as_types = asCat('as_types', 'asset_type', 'نوع أصل جديد');
PAGES.as_locations = asCat('as_locations', 'asset_location', 'مكان تخزين جديد');

PAGES.as_scrap = (view) => hdList(view, {
  tabs: asTabs, cur: 'as_scrap', key: 'ass', filters: [{ k: 'q', ph: 'بحث' }],
  load: (F) => api('/assets?scrapped=1&' + hdQs(F, ['q'])),
  cols: [['الاسم', (a) => `<b>${esc(a.name)}</b>`], ['النوع', (a) => esc(a.type_name || '—')], ['الوحدات', (a) => a.units], ['تاريخ التحويل', (a) => hdDate(a.scrapped_at)], ['السبب', (a) => esc(a.scrap_reason || '—')]],
  acts: (a, d) => (d.can_manage ? `<button class="btn alt" data-rs="${a.id}">استعادة</button>` : ''),
  onActs: (root, d, reload) => root.querySelectorAll('[data-rs]').forEach((b) => (b.onclick = () => run(b, async () => { await api(`/assets/${b.dataset.rs}/restore`, 'POST'); toast('تمت الاستعادة'); reload(); }))),
});
PAGES.as_log = (view) => hdList(view, {
  tabs: asTabs, cur: 'as_log', key: 'asl',
  filters: [{ k: 'q', ph: 'بحث' }, { k: 'action', ph: 'الإجراء', t: 'select', opts: Object.entries(AS_ACT) }],
  load: (F) => api('/assets-log?' + hdQs(F, ['q', 'action'])),
  cols: [['التاريخ', (r) => `${hdDate(r.at)} <span class="muted small">${esc(String(r.at).slice(11, 16))}</span>`], ['الإجراء', (r) => AS_ACT[r.action] || r.action], ['الأصل', (r) => `<b>${esc(r.asset_name)}</b>`], ['الموظف', (r) => esc(r.user_name || '—')], ['بواسطة', (r) => esc(r.by_name || '—')], ['ملاحظة', (r) => esc(r.note || '—')]],
});
