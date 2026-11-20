'use strict';
/* settings/72-leave-wizard.js — ملف الإجازة: معالج بخطوات (أنواع الإجازات ← تهيئة ← أذونات ← استراحات) */

const LW_MAP = [['annual', /اعتياد|سنوي/], ['sick', /مرض/], ['emergency', /طارئ|عارض/]];
const LW_ACCRUE = [['paid', 'إجازات مدفوعة'], ['attend', 'أيام الحضور'], ['holiday', 'عطلة'], ['official', 'عطلة رسمية'], ['absent', 'الغياب']];
const lwType = () => ({ track: true, unit: 'days', seniority: true, basis: 'prepaid', repeat: 'yearly', amount: 15, eoy: 'bonus', add_after: 31, em_same: true, em_kind: 'prepaid', em_amount: 3, em_repeat: 'yearly',
  hold_wait: true, wait_emerg: true, r_trial: true, r_docs: true, r_count_off: false, r_edges: true, r_eos: false, r_deadline: false, r_notice: 48, accrue: LW_ACCRUE.map((x) => x[0]) });
const lwNew = () => ({ name: '', name_en: '', hours_day: 8, hours_off: 8, hours_hol: 8, types: [], cfg: {}, annual: 21, sick: 0, emergency: 0, carry: false, brk_on: true, break_min: 60, break_paid: true,
  perm: { on: true, paid: { on: true, before: true, min: 30, day: 2, month: 4, who: 'both' }, unpaid: { on: true, before: true, limit: true, min: 30, day: 2, month: 4, who: 'both' } } });
const lwGet = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const lwSet = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => (a[k] = a[k] || {}), o); t[last] = v; };

function lwDerive(d) {
  const out = { annual: 365, sick: 0, emergency: 0, carry: false };
  for (const [key, re] of LW_MAP) {
    const t = (d._types || []).find((x) => d.types.includes(String(x.id)) && re.test(x.name)); if (!t) continue;
    const c = d.cfg[String(t.id)]; if (!c || !c.track) continue;
    const per = { yearly: 1, monthly: 12, weekly: 52 }[c.repeat] || 1;
    out[key] = Math.min(365, Math.round((Number(c.amount) || 0) * per));
    if (key === 'annual') out.carry = c.eoy === 'carry';
  }
  return out;
}

async function openLeaveWizard(spec, it, reload) {
  const types = await cfgApi('leave_type').load().catch(() => []);
  const d = it ? { ...lwNew(), ...clone(Object.fromEntries(POL_KEYS.leave_profile.map((k) => [k, k === 'name' ? it.name : it[k]]).filter(([, v]) => v !== null && v !== undefined))) } : lwNew();
  d._types = types.filter((x) => x.active !== false);
  d.types = (d.types || []).map(String); d.cfg = d.cfg || {};
  if (it && !d.types.length) { // ملف قديم: نفترض الأنواع الثلاثة القديمة لو موجودة
    for (const [key, re] of LW_MAP) { const t = d._types.find((x) => re.test(x.name)); if (t && (key === 'annual' || Number(it[key]) > 0)) { d.types.push(String(t.id)); d.cfg[t.id] = { ...lwType(), amount: Number(it[key]) || 0, eoy: it.carry && key === 'annual' ? 'carry' : 'zero' }; } }
    d.brk_on = Number(it.break_min) > 0;
  }
  const init = JSON.stringify(d);
  const steps = it ? ['تهيئة أنواع الإجازات', 'أذونات', 'فترات الاستراحة'] : ['أنواع الإجازات', 'تهيئة أنواع الإجازات', 'أذونات', 'فترات الاستراحة'];
  const st = { i: 0, sel: d.types[0] || null, q: '', open: { bal: true, req: true, wait: false, adv: false }, en: !!d.name_en };
  const o = document.createElement('div'); o.className = 'overlay lw';
  document.body.appendChild(o);
  const close = () => o.remove();
  const tryClose = () => { if (JSON.stringify(d) === init || confirm('إغلاق من غير حفظ التعديلات؟')) close(); };
  const tn = (id) => (d._types.find((x) => String(x.id) === String(id)) || {}).name || '';
  const tg = (p, title, sub) => `<div class="lwrow"><label class="lwtg"><span><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="tgl"><input type="checkbox" data-lt="${p}" ${lwGet(d, p) ? 'checked' : ''}><i></i></span></label></div>`;
  const rd = (p, opts, cls = '') => `<div class="rcs ${cls}">${opts.map(([v, t, s]) => `<button type="button" class="rc ${String(lwGet(d, p)) === v ? 'on' : ''}" data-lr="${p}" data-v="${v}"><span class="rd"></span><span><b>${t}</b>${s ? `<small>${s}</small>` : ''}</span></button>`).join('')}</div>`;
  const nm = (p, unit, extra = '') => `<div class="ufld"><input type="number" min="0" step="any" data-ln="${p}" value="${esc(lwGet(d, p) ?? '')}" ${extra}>${unit ? `<span ${/^perm\.\w+\.(day|month)$/.test(p) ? `data-calc="${p}"` : ''}>${unit}</span>` : ''}</div>`;
  const fld = (l, body, sub, req) => `<div class="pwfld"><label class="lbl">${l}${req ? ' <em class="req">*</em>' : ''}</label>${sub ? `<p class="muted small lwsub">${sub}</p>` : ''}${body}</div>`;
  const sec = (key, title, icon, body) => `<div class="lwsec ${st.open[key] ? 'open' : ''}"><button type="button" class="lwsh" data-sec="${key}"><span class="lwsi">${ico(icon)}</span><b>${title}</b><i>${ico('chev') || '⌄'}</i></button>${st.open[key] ? `<div class="lwsb">${body}</div>` : ''}</div>`;

  const head = () => `<div class="pwfld"><label class="lbl">اسم الملف <em class="req">*</em></label><input data-lx="name" value="${esc(d.name)}" maxlength="120" placeholder="مثال: دوام كامل" autocomplete="off">
      ${st.en ? `<input data-lx="name_en" value="${esc(d.name_en)}" maxlength="120" placeholder="Name in English" dir="ltr" style="margin-top:8px">` : '<button type="button" class="swadd" data-en>+ أضف اسمًا بلغات متعددة</button>'}</div>
    <div class="lw3">${[['hours_day', 'الساعات في اليوم'], ['hours_off', 'عدد الساعات لكل يوم عطلة'], ['hours_hol', 'عدد الساعات لكل يوم عطلة رسمية']].map(([k, l]) => fld(l, nm(k, 'ساعات', 'max="24"'))).join('')}</div>`;

  const pick = () => { const q = st.q.trim(); const rows = d._types.filter((x) => !q || x.name.includes(q));
    return `<div class="lwtt"><h4>أنواع الإجازات <em class="opt">اختياري</em></h4><p class="muted small">أضف أنواع الإجازات إلى هذا الملف. يمكنك الاختيار من الأنواع الموجودة أو إنشاء نوع جديد.</p>
      <div class="lwbar"><button type="button" class="btn alt" data-newtype>＋ إنشاء نوع إجازة جديد</button><input class="lwq" data-q placeholder="بحث" value="${esc(st.q)}"></div>
      <div class="lwtab"><div class="lwth"><span></span><span>نوع الإجازة</span><span>نوع الدفع</span></div>${rows.map((x) => `<label class="lwtr"><input type="checkbox" data-pt="${x.id}" ${d.types.includes(String(x.id)) ? 'checked' : ''}><b>${esc(x.name)}</b><span>${{ paid: 'مدفوع', partial: 'مدفوع جزئياً', unpaid: 'غير مدفوع' }[payOf(x)]}</span></label>`).join('') || '<div style="padding:18px;text-align:center"><p class="muted small">لا توجد أنواع إجازات بعد</p><button type="button" class="btn" data-seed>إضافة الأنواع الشائعة</button></div>'}</div></div>`; };

  const cfgPanel = () => {
    const id = st.sel, p = `cfg.${id}`;
    if (!id) return '<p class="lwempty muted">اختر إجازة من القائمة على اليمين لتهيئة قواعدها.</p>';
    if (!d.cfg[id]) d.cfg[id] = lwType();
    const c = d.cfg[id];
    const bal = tg(`${p}.track`, 'تتبع رصيد الإجازة', 'إدارة الأيام/الساعات المتاحة للإجازة') + (c.track ? `
      ${fld('وحدة القياس', rd(`${p}.unit`, [['days', 'أيام'], ['hours', 'ساعات']], 'two'), 'اختر هل تتبع هذه الإجازة بالأيام أم بالساعات')}
      ${tg(`${p}.seniority`, 'رصيد قائم على الأقدمية', 'ضبط إعدادات رصيد مختلفة بناء على أقدمية الموظف (سنوات الخدمة)')}
      <div class="lwbox">${fld('أساس رصيد الإجازة', rd(`${p}.basis`, [['prepaid', 'أساس الإجازة المدفوعة مقدمًا'], ['accrual', 'أساس الاستحقاق']], 'two'))}
        ${fld('تكرار التخصيص', rd(`${p}.repeat`, [['yearly', 'سنوي'], ['monthly', 'شهريًا'], ['weekly', 'أسبوعي']], 'three'))}
        ${fld('الرصيد لكل فترة', nm(`${p}.amount`, c.unit === 'hours' ? 'ساعات' : 'الأيام'), '', true)}
        ${fld('رصيد نهاية السنة', rd(`${p}.eoy`, [['carry', 'ترحيل'], ['zero', 'تصفير الرصيد'], ['bonus', 'تحويل إلى مكافأة'], ['manual', 'يدوي']], 'four'), 'ما يحدث للإجازة غير المستخدمة في نهاية السنة')}
        ${fld('إضافة الرصيد بعد عدد من الأيام من بداية السنة', nm(`${p}.add_after`, 'الأيام'), '', true)}</div>
      <div class="lwdiv"></div><h5>إعدادات رصيد الطوارئ</h5><p class="muted small">ضبط رصيد إجازة الطوارئ للطلبات العاجلة التي تتجاوز فترة الإشعار المسبق.</p>
      ${tg(`${p}.em_same`, 'إعدادات الطوارئ مطابقة للإعدادات العادية', 'استخدم نفس إعدادات الرصيد العادي، مع تحديد مبلغ رصيد الطوارئ فقط')}
      ${fld('نوع رصيد الطوارئ', rd(`${p}.em_kind`, [['prepaid', 'مدفوع مسبقًا'], ['cumulative', 'تراكمي']], 'two'))}
      ${fld('رصيد الطوارئ', nm(`${p}.em_amount`, 'الأيام'), '', true)}${fld('تكرار التخصيص', rd(`${p}.em_repeat`, [['yearly', 'سنوي'], ['monthly', 'شهريًا'], ['weekly', 'أسبوعي']], 'three'))}` : '');
    const req = tg(`${p}.r_trial`, 'السماح بالطلب خلال فترة الاختبار') + tg(`${p}.r_docs`, 'إلزام الموظفين بإرفاق مستندات') + tg(`${p}.r_count_off`, 'احتساب العطلات الأسبوعية والرسمية ضمن المدة')
      + tg(`${p}.r_edges`, 'السماح بأيام الراحة / العطلات في بداية ونهاية الإجازة') + tg(`${p}.r_eos`, 'إدراج الرصيد غير المستخدم في تسوية نهاية الخدمة') + tg(`${p}.r_deadline`, 'تحديد موعد نهائي للطلب')
      + (c.r_deadline ? fld('أقل مدة إشعار مسبق', nm(`${p}.r_notice`, 'ساعات')) : '');
    const wait = tg(`${p}.hold_wait`, 'حجب الرصيد حتى انتهاء فترة الانتظار') + tg(`${p}.wait_emerg`, 'فترة انتظار الطوارئ', 'تأخير قبل الوصول إلى رصيد الطوارئ');
    const adv = `<p class="muted small">أوزان الاستحقاق. هذه الإعدادات الافتراضية تناسب معظم الفرق – عدّلها فقط إذا كنت بحاجة لتغيير طريقة اكتساب الرصيد.</p>${fld('الإجازات تستحق بناءً على', `<div class="lwchips">${LW_ACCRUE.map(([k, l]) => `<button type="button" class="lwchip ${(c.accrue || []).includes(k) ? 'on' : ''}" data-ac="${k}">${l}</button>`).join('')}</div>`, 'أنواع الحضور / الأيام التي تُحتسب لاستحقاق الرصيد')}`;
    return `<div class="lwtitle"><b>${esc(tn(id))}</b>${it || true ? `<button type="button" class="lwdel" data-rm="${id}">حذف ✕</button>` : ''}</div>`
      + sec('bal', 'الرصيد والاستحقاق', 'chart', bal) + sec('req', 'قواعد الطلب', 'file', req) + sec('wait', 'فترة الانتظار', 'clock', wait) + sec('adv', 'إعدادات متقدمة', 'sliders', adv);
  };

  const cfgStep = () => `${it ? `<div class="lwcard">${head()}</div>` : ''}<div class="lwcfg"><aside class="lwlist"><h4>أنواع الإجازات</h4>
      <div class="lwbar2"><input class="lwq" data-q2 placeholder="بحث"></div>
      ${d.types.map((id) => `<button type="button" class="lwit ${String(st.sel) === id ? 'on' : ''}" data-sel="${id}"><b>${esc(tn(id))}</b><small>${{ paid: 'مدفوع', partial: 'مدفوع جزئياً', unpaid: 'غير مدفوع' }[payOf(d._types.find((x) => String(x.id) === id) || {})]}</small></button>`).join('') || '<p class="muted small">لم تتم إضافة أنواع بعد</p>'}
      <select data-addt class="lwadd"><option value="">＋ إضافة نوع إجازة</option>${d._types.filter((x) => !d.types.includes(String(x.id))).map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>
      <button type="button" class="btn alt lwnew" data-newtype>＋ إنشاء نوع إجازة جديد</button></aside>
    <section class="lwmain">${cfgPanel()}</section>
    <aside class="lwhelp"><b>لماذا يهم هذا</b><p>اضبط قواعد كل نوع إجازة: الرصيد وتكراره، قواعد الطلب، وفترة الانتظار. القيم هنا هي اللي بيطبّقها النظام عند تقديم طلبات الإجازة ورصيد كل موظف.</p></aside></div>`;

  const permBlock = (k, title) => { const p = `perm.${k}`; const lim = k === 'paid' || d.perm.unpaid.limit; const mins = Number(lwGet(d, `${p}.min`)) || 0;
    return `<div class="lwcard">${tg(`${p}.on`, title)}${lwGet(d, `${p}.on`) ? `${tg(`${p}.before`, 'يجب على الموظف تقديم طلب إذن قبل الموعد النهائي')}
      ${k === 'unpaid' ? tg(`${p}.limit`, 'تحديد حدود للأذونات غير المدفوعة') : ''}
      ${lim ? `${fld('أقل مدة للإذن', nm(`${p}.min`, 'دقائق'))}<div class="lw2">${fld('الحد الأقصى لعدد طلبات الأذونات في اليوم', `${nm(`${p}.day`, `يوم / دقيقة ${(mins * (Number(lwGet(d, `${p}.day`)) || 0)).toFixed(2)}`)}`)}
        ${fld('الحد الأقصى لعدد الأذونات في الشهر', nm(`${p}.month`, `شهر / دقيقة ${(mins * (Number(lwGet(d, `${p}.month`)) || 0)).toFixed(2)}`))}</div>` : ''}
      ${fld('من يمكنه تقديم هذا الطلب', rd(`${p}.who`, [['both', 'كلاهما'], ['manager', 'المدير فقط']], 'two'), 'اختر من يمكنه تقديم طلب الاستئذان هذا')}` : ''}</div>`; };
  const permStep = () => `<div class="lwcard">${tg('perm.on', 'السماح للموظف بطلب إذن', 'لو مقفول: لا يمكن لموظفي هذا الملف تقديم طلبات أذونات')}</div>${d.perm.on ? permBlock('paid', 'السماح للموظفين بطلب أذونات مدفوعة') + permBlock('unpaid', 'السماح للموظفين بطلب أذونات غير مدفوعة') : ''}`;
  const brkStep = () => `<div class="lwcard">${tg('brk_on', 'السماح للموظف بأخذ فترات استراحة')}${d.brk_on ? `${fld('مدة الاستراحة اليومية', nm('break_min', 'دقيقة', 'max="240"'))}${fld('نوع الاستراحة', rd('break_paid', [['true', 'مدفوعة', 'بدون تأثير على الحساب'], ['false', 'غير مدفوعة', 'بتتشال من ساعات الوردية المدفوعة']], 'two'))}` : ''}</div>`;

  const pages = it ? [cfgStep, permStep, brkStep] : [() => `<div class="lwcard">${head()}</div><div class="lwcard">${pick()}</div>`, cfgStep, permStep, brkStep];
  const sub = it ? `تحديث أنواع الإجازات والأذونات وقواعد الاستراحة – ${esc(it.name)}` : 'قم بتهيئة معايير وسياسات الإجازة الجديدة.';

  const check = (i) => {
    if (!String(d.name || '').trim()) return it || i > 0 ? 'اكتب اسم الملف' : 'اكتب اسم الملف';
    if (['hours_day', 'hours_off', 'hours_hol'].some((k) => Number(d[k]) < 0 || Number(d[k]) > 24)) return 'الساعات بين 0 و 24';
    for (const id of d.types) { const c = d.cfg[id]; if (c && c.track && !(Number(c.amount) >= 0)) return `رصيد «${tn(id)}» غير صحيح`; }
    return null;
  };
  const save = (btn) => {
    const err = check(); if (err) return toast(err, true);
    d.types.forEach((id) => { if (!d.cfg[id]) d.cfg[id] = lwType(); });
    Object.keys(d.cfg).forEach((id) => { if (!d.types.includes(id)) delete d.cfg[id]; });
    const body = { ...clone(d), ...lwDerive(d), break_min: d.brk_on ? Math.round(Number(d.break_min) || 0) : 0 }; delete body._types;
    run(btn, async () => { await spec.saveWith(it, body); close(); toast('تم الحفظ'); reload(); });
  };

  function draw() {
    const last = st.i === steps.length - 1, y = (o.querySelector('.lwbody') || {}).scrollTop || 0;
    o.innerHTML = `<div class="lwm"><header><button class="pwx" data-x type="button" aria-label="إغلاق">×</button><div class="lwt"><h2>${it ? 'تعديل ملف الإجازة' : 'إنشاء ملف إجازة'}</h2><p>${sub}</p></div></header>
      <div class="lwsteps">${steps.map((s, i) => `<button type="button" class="lwst ${i === st.i ? 'on' : ''} ${i < st.i ? 'done' : ''}" data-go="${i}"><span>${i < st.i ? '✓' : i + 1}</span>${s}</button>`).join('<i></i>')}</div>
      <div class="lwbody">${pages[st.i]()}</div>
      <footer><button class="btn" data-next type="button">${last ? 'حفظ' : 'التالي'}</button><span class="grow"></span>${st.i ? '<button class="btn alt" data-back type="button">السابق</button>' : ''}</footer></div>`;
    o.querySelector('.lwbody').scrollTop = y; bind();
  }
  function bind() {
    const q = (s) => o.querySelectorAll(s), one = (s) => o.querySelector(s);
    one('[data-x]').onclick = tryClose;
    const nx = one('[data-next]'); nx.onclick = () => { if (st.i === steps.length - 1) return save(nx); const e = (!it && st.i === 0) ? check() : null; if (e) return toast(e, true); st.i++; draw(); };
    if (one('[data-back]')) one('[data-back]').onclick = () => { st.i--; draw(); };
    q('[data-go]').forEach((b) => (b.onclick = () => { const i = Number(b.dataset.go); if (i > st.i && !it && st.i === 0 && check()) return toast(check(), true); st.i = i; draw(); }));
    q('[data-lx]').forEach((el) => (el.oninput = () => { d[el.dataset.lx] = el.value; }));
    q('[data-ln]').forEach((el) => { el.oninput = () => {
      lwSet(d, el.dataset.ln, el.value === '' ? '' : Number(el.value));
      q('[data-calc]').forEach((s) => { const [, k, f] = s.dataset.calc.split('.'); s.textContent = `${f === 'day' ? 'يوم' : 'شهر'} / دقيقة ${((Number(d.perm[k].min) || 0) * (Number(d.perm[k][f]) || 0)).toFixed(2)}`; });
    }; });
    q('[data-lt]').forEach((el) => (el.onchange = () => { lwSet(d, el.dataset.lt, el.checked); draw(); }));
    q('[data-lr]').forEach((b) => (b.onclick = () => { const v = b.dataset.v; lwSet(d, b.dataset.lr, v === 'true' ? true : v === 'false' ? false : v); draw(); }));
    q('[data-sec]').forEach((b) => (b.onclick = () => { st.open[b.dataset.sec] = !st.open[b.dataset.sec]; draw(); }));
    q('[data-sel]').forEach((b) => (b.onclick = () => { st.sel = b.dataset.sel; draw(); }));
    q('[data-ac]').forEach((b) => (b.onclick = () => { const c = d.cfg[st.sel], s = new Set(c.accrue || []); s.has(b.dataset.ac) ? s.delete(b.dataset.ac) : s.add(b.dataset.ac); c.accrue = [...s]; draw(); }));
    q('[data-rm]').forEach((b) => (b.onclick = () => { d.types = d.types.filter((x) => x !== b.dataset.rm); delete d.cfg[b.dataset.rm]; st.sel = d.types[0] || null; draw(); }));
    if (one('[data-addt]')) one('[data-addt]').onchange = (e) => { if (e.target.value) { d.types.push(e.target.value); st.sel = e.target.value; draw(); } };
    q('[data-pt]').forEach((el) => (el.onchange = () => { const id = el.dataset.pt, s = new Set(d.types); el.checked ? s.add(id) : s.delete(id); d.types = [...s]; if (!st.sel || !d.types.includes(st.sel)) st.sel = d.types[0] || null; }));
    if (one('[data-q]')) one('[data-q]').oninput = (e) => { st.q = e.target.value; const pos = e.target.selectionStart; draw(); const n = one('[data-q]'); n.focus(); n.setSelectionRange(pos, pos); };
    if (one('[data-en]')) one('[data-en]').onclick = () => { st.en = true; draw(); };
    if (one('[data-seed]')) one('[data-seed]').onclick = (e) => run(e.target, async () => {
      const A = cfgApi('leave_type');
      for (const [name, pay] of [['إجازات اعتيادية', 'paid'], ['إجازة مرضية', 'partial'], ['إجازة طارئة', 'paid'], ['إجازة غير مدفوعة', 'unpaid'], ['إجازة وفاة', 'paid'], ['إجازة حج', 'paid']])
        await A.save(null, { name, pay, pay_pct: pay === 'paid' ? 100 : pay === 'unpaid' ? 0 : 75, paid: pay === 'paid', days: '', description: '', active: '1' });
      d._types = (await A.load()).filter((x) => x.active !== false); draw();
    });
    q('[data-newtype]').forEach((b) => (b.onclick = () => run(b, async () => {
      const name = (prompt('اسم نوع الإجازة الجديد') || '').trim(); if (!name) return;
      const r = await cfgApi('leave_type').save(null, { name, pay: 'paid', pay_pct: 100, paid: true, days: '', description: '', active: '1' });
      const fresh = await cfgApi('leave_type').load(); d._types = fresh.filter((x) => x.active !== false);
      const nt = d._types.find((x) => x.name === name); if (nt) { d.types.push(String(nt.id)); st.sel = String(nt.id); } draw();
    })));
  }
  o.addEventListener('mousedown', (e) => { if (e.target === o) tryClose(); });
  document.addEventListener('keydown', function esc_(e) { if (!document.body.contains(o)) return document.removeEventListener('keydown', esc_); if (e.key === 'Escape') tryClose(); });
  draw();
}
