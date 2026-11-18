'use strict';
/* settings/30-schedules.js — الإعدادات ← الحضور ← مواعيد العمل */

/* --- مواعيد العمل --- */
const SCHED_FIELDS = [
  { k: 'type', l: 'النوع', t: 'select', o: [['full', 'يوم كامل'], ['half', 'نصف يوم']] },
  { k: 'brk', l: 'استراحة (دقيقة)', t: 'number', d: 0, attrs: 'min="0" step="5"' },
  { k: 'start', l: 'بداية الدوام', t: 'time', d: '09:00', req: true },
  { k: 'end', l: 'نهاية الدوام', t: 'time', d: '17:00', req: true },
];
const SCHED_KEYS = ['name', 'type', 'brk', 'start', 'end', 'penalty_id', 'overtime_id'];
const polSel = (k, l, arr) => ({ k, l, t: 'select', d: '', o: [['', 'بدون سياسة (الإعدادات العامة)'], ...arr.map((p) => [String(p.id), `${p.name}${p.archived ? ' (محفوظ)' : !p.active ? ' (غير نشط)' : ''}`])] });
const schedSpec = () => {
  const api_ = cfgApi('schedule');
  const snap = (it) => ({ at: new Date().toISOString().slice(0, 16).replace('T', ' '), ...Object.fromEntries(SCHED_KEYS.map((k) => [k, it[k]])) });
  const save = (it, b) => api_.save(it, b);
  return {
    ...api_, newLabel: 'موعد عمل جديد', searchPh: 'ابحث في أوقات العمل', counts: true, nameLabel: 'اسم موعد العمل',
    fields: () => [...SCHED_FIELDS, polSel('penalty_id', 'سياسة الجزاءات', POL.pen), polSel('overtime_id', 'سياسة الوقت الإضافي', POL.ot)],
    load: async () => {
      const [sch, pen, ot] = await Promise.all([api('/config/schedule'), api('/config/penalty_policy').catch(() => []), api('/config/overtime_policy').catch(() => [])]);
      POL.pen = pen; POL.ot = ot;
      return sch;
    },
    statusOpts: [['1', 'نشط'], ['0', 'محفوظ (أرشيف)']], actHead: 'الإصدارات والإجراءات',
    tabs: [['1', 'نشط', (it) => it.active], ['0', 'محفوظ', (it) => !it.active]],
    chips: [['all', 'الكل', () => true], ['full', 'يوم كامل', (it) => it.type !== 'half'], ['half', 'نصف يوم', (it) => it.type === 'half']],
    text: (it) => `${it.name} ${it.start} ${it.end}`,
    cols: [
      ['مواعيد العمل', (it) => `<b>${esc(it.name)}</b>`],
      ['الجدول', (it) => `<b dir="ltr">${tm12(it.start)} - ${tm12(it.end)}</b><div class="muted small">${hoursOf(it.start, it.end, it.brk)} س · استراحة ${Number(it.brk) || 0} د</div>`],
      ['النوع', (it) => `<span class="badge ${it.type === 'half' ? 'b-warn' : 'b-info'}">${it.type === 'half' ? 'نصف يوم' : 'يوم كامل'}</span>`],
      ['السياسات', (it) => {
        const pn = POL.pen.find((p) => String(p.id) === String(it.penalty_id ?? '')), ot = POL.ot.find((p) => String(p.id) === String(it.overtime_id ?? ''));
        return `<div class="small"><span class="muted">الجزاءات</span> ${pn ? `<b>${esc(pn.name)}</b>` : '<span class="muted">الإعدادات العامة</span>'}</div><div class="small"><span class="muted">وقت إضافي</span> ${ot ? `<b>${esc(ot.name)}</b>` : `<span class="muted">× ${esc(SETV.overtime_factor)} (عام)</span>`}</div>`;
      }],
      ['حالة', (it) => `<span class="badge ${it.active ? 'b-ok' : ''}">${it.active ? 'نشط' : 'محفوظ'}</span>`],
    ],
    pre: (it, b) => {
      if (!it) { b.versions = []; return; }
      const changed = SCHED_KEYS.some((k) => String(it[k] ?? '') !== String(b[k] ?? ''));
      b.versions = changed ? [snap(it), ...(it.versions || [])].slice(0, 30) : (it.versions || []);
    },
    save,
    extra: (it) => `<button class="vchip" data-a="ver" data-id="${it.id}" ${(it.versions || []).length ? '' : 'disabled'}>${(it.versions || []).length ? `إصدارات ${it.versions.length}` : 'لا يوجد إصدارات سابقة'}</button>
      <button class="sqb" data-a="dup" data-id="${it.id}" title="نسخ">${ico('copy')}</button>
      <button class="sqb" data-a="arch" data-id="${it.id}" title="${it.active ? 'أرشفة' : 'استرجاع'}">${ico('archive')}</button>`,
    act: async (a, it, reload) => {
      const base = Object.fromEntries(SCHED_KEYS.map((k) => [k, it[k]]));
      if (a === 'dup') { await save(null, { ...base, name: it.name + ' (نسخة)', active: '1', versions: [] }); toast('تم النسخ'); reload(); }
      else if (a === 'arch') { await save(it, { ...base, active: it.active ? '0' : '1', versions: it.versions || [] }); toast(it.active ? 'تمت الأرشفة' : 'تم الاسترجاع'); reload(); }
      else if (a === 'ver') {
        const o = modal(`<h3>إصدارات ${esc(it.name)}</h3><div class="vlist">${(it.versions || []).map((v, i) => `<div class="vrow"><div><b dir="ltr">${tm12(v.start)} - ${tm12(v.end)}</b> <span class="muted small">${esc(v.name)} · ${v.type === 'half' ? 'نصف يوم' : 'يوم كامل'} · ${esc(v.at)}</span></div><button class="btn alt sm" data-rv="${i}">استرجاع</button></div>`).join('')}</div>
          <div class="actions"><button class="btn alt" data-close>إغلاق</button></div>`);
        o.querySelectorAll('[data-rv]').forEach((b) => (b.onclick = () => run(b, async () => {
          const v = it.versions[Number(b.dataset.rv)], nb = { ...Object.fromEntries(SCHED_KEYS.map((k) => [k, v[k]])), active: it.active ? '1' : '0' };
          nb.versions = [snap(it), ...it.versions.filter((_, i) => i !== Number(b.dataset.rv))].slice(0, 30);
          await save(it, nb); o.close(); toast('تم استرجاع الإصدار'); reload();
        })));
      }
    },
  };
};
