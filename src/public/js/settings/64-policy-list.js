'use strict';
/* settings/64-policy-list.js — سياسات الحضور: قائمة السياسات والمواعيد المرتبطة والنسخ */

/* --- مواعيد مرتبطة بسياسة --- */
function linksModal(it) {
  const o = modal(`<h3>مواعيد العمل المرتبطة بـ ${esc(it.name)}</h3><div class="vlist">${it._sch.map((s) => `<div class="vrow"><div><b>${esc(s.name)}</b> <span class="muted small" dir="ltr">${tm12(s.start)} - ${tm12(s.end)}</span></div></div>`).join('')}</div>
    <p class="muted small" style="margin-top:10px">الربط من صفحة «مواعيد العمل» (تعديل موعد العمل واختيار السياسة).</p><div class="actions"><button class="btn alt" data-close>إغلاق</button></div>`);
  return o;
}

/* --- قائمة السياسات --- */
function policySpec(kind) {
  const isPen = kind === 'penalty_policy', keys = POL_KEYS[kind], api_ = cfgApi(kind), idKey = isPen ? 'penalty_id' : 'overtime_id';
  const pick = (it) => Object.fromEntries(keys.map((k) => [k, clone(k === 'name' ? it.name : it[k])]));
  const snap = (it) => ({ at: stamp(), ...pick(it) });
  const brief = isPen
    ? (it) => [Number(it.grace) > 0 ? `سماحية ${it.grace} دقيقة` : 'بدون سماحية', it.late_on ? plural((it.tiers || []).length, 'شريحة تأخير واحدة', 'شرائح تأخير') : 'التأخير غير مفعّل', it.early_on ? `انصراف مبكر ×${it.early_factor}` : 'انصراف مبكر غير مفعّل'].join(' · ')
    : (it) => (it.calc_on ? [Number(it.after_min) > 0 ? `يبدأ بعد ${it.after_min} دقيقة من الانصراف` : 'يبدأ من أول دقيقة إضافية', Number(it.cap_hours) > 0 ? `حد يومي ${it.cap_hours} س` : 'بدون حد يومي', `×${it.factor}`].join(' · ') : 'لا تُحتسب الساعات بعد الانصراف');
  const spec = { kind, keys, snap, brief };
  spec.saveWith = (it, d, over = {}) => {
    const body = { ...clone(d), name: d.name.trim(), active: over.active ?? (it ? (it.active ? '1' : '0') : '1'), archived: over.archived ?? (it ? !!it.archived : false) };
    if (isPen) { body.deduct_from = 'salary'; body.tiers = (d.tiers || []).map((t) => ({ from: Number(t.from), to: t.to === null || t.to === '' ? null : Number(t.to), kind: t.kind, value: Number(t.value) })); }
    else { body.calc_on = d.calc_on === true || d.calc_on === 'true'; }
    const changed = it && keys.some((k) => JSON.stringify(clone(k === 'name' ? it.name : it[k]) ?? null) !== JSON.stringify(clone(k === 'name' ? body.name : body[k]) ?? null));
    body.versions = it ? (changed ? [snap(it), ...(it.versions || [])].slice(0, 30) : (it.versions || [])) : [];
    return api_.save(it, body);
  };
  const flip = (it, over) => spec.saveWith(it, { ...pick(it), name: it.name }, over);
  const roundOf = (it) => (!it.calc_on ? 'x' : it.rounding === 'up' ? 'up' : it.rounding === 'down' ? 'down' : 'none');
  return Object.assign(spec, {
    ...api_, newLabel: isPen ? 'إضافة سياسة جزاءات' : 'إضافة سياسة وقت إضافي', searchPh: isPen ? 'ابحث في سياسات الجزاءات' : 'ابحث في سياسات العمل الإضافي', counts: true,
    tabs: POL_TABS, actHead: 'الإصدارات والإجراءات',
    chips: isPen ? null : [['all', 'الكل', () => true], ['up', 'تقريب للأعلى', (it) => roundOf(it) === 'up'], ['down', 'تقريب للأسفل', (it) => roundOf(it) === 'down'], ['none', 'الدقائق الفعلية', (it) => roundOf(it) === 'none']], chipLabel: 'التقريب',
    text: (it) => `${it.name} ${brief(it)}`,
    load: async () => {
      const [rows, sch] = await Promise.all([api_.load(), api('/config/schedule')]);
      POL[isPen ? 'pen' : 'ot'] = rows;
      return rows.map((p) => ({ ...p, _sch: sch.filter((s) => String(s[idKey] ?? '') === String(p.id)) }));
    },
    cols: isPen ? [
      ['السياسة', (it) => `<b>${esc(it.name)}</b><div class="muted small">${esc(brief(it))}</div>`],
      ['المجالات', (it) => `<div class="pcs"><span class="pc ${it.late_on ? '' : 'off'}">متأخر</span><span class="pc ${it.early_on ? '' : 'off'}">مبكر</span><span class="pc">غياب</span><span class="pc ${it.partial_on ? '' : 'off'}">الانصراف ناقص</span></div>`],
      ['مرتبط بـ', linkedCell], ['حالة', polBadge],
    ] : [
      ['السياسة', (it) => `<b>${esc(it.name)}</b>`],
      ['وقت إضافي', (it) => `<span class="badge ${it.calc_on ? 'b-ok' : 'b-warn'}">${it.calc_on ? 'يُحتسب' : 'لا يُحتسب'}</span><div class="muted small">${esc(brief(it))}</div>`],
      ['التقريب', (it) => (!it.calc_on ? '<span class="muted">—</span>' : `<span class="badge b-info">${it.rounding === 'up' ? `تقريب للأعلى · ${it.round_unit} د` : it.rounding === 'down' ? `تقريب للأسفل · ${it.round_unit} د` : 'الدقائق الفعلية'}</span>`)],
      ['مرتبط بـ', linkedCell], ['حالة', polBadge],
    ],
    rowActs: (it) => `<div class="racts"><button class="vchip" data-a="ver" data-id="${it.id}" ${(it.versions || []).length ? '' : 'disabled'}>${(it.versions || []).length ? `إصدارات ${it.versions.length}` : 'لا توجد إصدارات سابقة'}</button>
      <button class="sqb" data-a="edit" data-id="${it.id}" title="تعديل">${ico('edit')}</button><button class="sqb" data-a="dup" data-id="${it.id}" title="نسخ">${ico('copy')}</button>
      <button class="sqb" data-a="arch" data-id="${it.id}" title="${it.archived ? 'استرجاع' : 'أرشفة'}">${ico('archive')}</button><button class="sqb" data-more="${it.id}" title="المزيد">${ico('dots')}</button></div>`,
    more: (it) => [['tog', it.active ? 'تعطيل' : 'تفعيل'], ['del', 'حذف', 1]],
    delMsg: (it) => (it._sch && it._sch.length ? `السياسة دي مربوطة بـ ${it._sch.length} مواعيد عمل، ولو اتحذفت الموظفين دول هيرجعوا للإعدادات العامة. متأكدة؟` : 'حذف السياسة دي؟'),
    form: (it, reload) => openPolicyWizard(spec, it, reload),
    act: async (a, it, reload) => {
      if (a === 'ver') return polVersions(it, spec, reload);
      if (a === 'links') return linksModal(it);
      if (a === 'dup') { await spec.saveWith(null, { ...pick(it), name: `${it.name} (نسخة)` }, { active: '1', archived: false }); toast('تم النسخ'); return reload(); }
      if (a === 'arch') { await flip(it, { archived: !it.archived }); toast(it.archived ? 'تم الاسترجاع' : 'تمت الأرشفة'); return reload(); }
      if (a === 'tog') { await flip(it, { active: it.active ? '0' : '1' }); toast(it.active ? 'تم التعطيل' : 'تم التفعيل'); return reload(); }
    },
    extraBtn: '<button class="btn alt sm" id="sglob">الإعدادات العامة</button>',
    bindExtra: (box) => { $('#sglob', box).onclick = () => globalPolicyModal(kind); },
  });
}
function polVersions(it, spec, reload) {
  const o = modal(`<h3>إصدارات ${esc(it.name)}</h3><div class="vlist">${(it.versions || []).map((v, i) => `<div class="vrow"><div><b>${esc(v.name)}</b> <span class="muted small">${esc(v.at)}</span><div class="muted small">${esc(spec.brief(v))}</div></div><button class="btn alt sm" data-rv="${i}">استرجاع</button></div>`).join('')}</div><div class="actions"><button class="btn alt" data-close>إغلاق</button></div>`);
  o.querySelectorAll('[data-rv]').forEach((b) => (b.onclick = () => run(b, async () => {
    const i = Number(b.dataset.rv), v = it.versions[i];
    const body = { ...Object.fromEntries(spec.keys.map((k) => [k, clone(v[k])])), active: it.active ? '1' : '0', archived: !!it.archived, ...(spec.kind === 'penalty_policy' ? { deduct_from: 'salary' } : {}) };
    body.versions = [spec.snap(it), ...it.versions.filter((_, j) => j !== i)].slice(0, 30);
    await cfgApi(spec.kind).save(it, body); o.close(); toast('تم استرجاع الإصدار'); reload();
  })));
}
/* الإعدادات العامة (بتتطبق على الموظفين اللي موعد عملهم مش مربوط بسياسة) */
async function globalPolicyModal(kind) {
  const isPen = kind === 'penalty_policy';
  const o = modal(`<h3>الإعدادات العامة ${isPen ? 'للجزاءات' : 'للوقت الإضافي'}</h3><p class="muted small" style="margin-bottom:10px">بتتطبق على الموظفين اللي موعد عملهم مش مربوط بسياسة ${isPen ? 'جزاءات' : 'وقت إضافي'}.</p><div id="gset"></div>${isPen ? '<div id="gtier" style="margin-top:12px"></div>' : ''}<div class="actions"><button class="btn alt" data-close>إغلاق</button></div>`);
  o.classList.add('wide');
  try {
    if (isPen) {
      await settingsForm($('#gset', o), { title: 'فترة السماح ومعاملات الخصم', fields: [
        { k: 'grace_minutes', l: 'سماح التأخير (دقيقة)', t: 'number', attrs: 'min="0"' }, { k: 'late_factor', l: 'معامل خصم التأخير', t: 'number', attrs: 'step="0.25" min="0"' }, { k: 'absence_factor', l: 'معامل خصم الغياب (يوم)', t: 'number', attrs: 'step="0.25" min="0"' }] });
      await tiersUI($('#gtier', o), true);
    } else await settingsForm($('#gset', o), { title: 'معامل الوقت الإضافي', fields: [{ k: 'overtime_factor', l: 'معامل الوقت الإضافي', t: 'number', attrs: 'step="0.25" min="0"' }] });
  } catch (e) { toast(e.message, true); }
}
