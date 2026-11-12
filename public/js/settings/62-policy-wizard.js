'use strict';
/* settings/62-policy-wizard.js — سياسات الحضور: معالج الخطوات (جزاءات + وقت إضافي) */

/* --- مكونات صغيرة للمعالج --- */
const pwNum = (attrs, v, unit) => `<div class="ufld"><input type="number" ${attrs} value="${esc(v ?? '')}">${unit ? `<span>${unit}</span>` : ''}</div>`;
const pwStep = (attrs, v, step, min, max) => `<div class="stp"><button type="button" data-sp="-1" data-step="${step}" aria-label="إنقاص">−</button><input type="number" step="${step}" min="${min}" max="${max}" ${attrs} value="${esc(v ?? '')}"><button type="button" data-sp="1" data-step="${step}" aria-label="زيادة">+</button></div>`;
const pwRadio = (name, val, opts, cls = '') => `<div class="rcs ${cls}">${opts.map(([v, t, s, dis]) => `<button type="button" class="rc ${String(val) === String(v) ? 'on' : ''}" data-rc="${name}" data-v="${v}" ${dis ? 'disabled' : ''}><span class="rd"></span><span><b>${t}</b>${s ? `<small>${s}</small>` : ''}</span></button>`).join('')}</div>`;
const pwCheck = (key, on, t, s) => `<label class="cc ${on ? 'on' : ''}"><input type="checkbox" data-ck="${key}" ${on ? 'checked' : ''}><span><b>${t}</b><small>${s}</small></span></label>`;
const pwOff = (title, key, btn) => `<div class="pwoff"><b>${title}</b><p class="muted small">فعّليه الأول عشان تقدري تضبطي إعداداته.</p><button type="button" class="btn" data-enable="${key}">${btn}</button></div>`;

function policyWizard(cfg) {
  const { d, steps, groups } = cfg;
  const init = JSON.stringify(d);
  const st = { i: 0, done: new Set(), guided: !!cfg.guided, help: true, col: {}, hk: 'details' };
  const o = document.createElement('div');
  o.className = 'overlay pwz';
  o.innerHTML = `<div class="pw" id="pw">
    <header class="pwh"><div class="pwt"><h2>${cfg.title}</h2><p>${cfg.subtitle}</p></div>
      <div class="pwc"><div class="seg" id="pwmode"><button data-mode="guided">موجّه</button><button data-mode="adv">متقدم</button></div>
        <button class="pwhelp" id="pwhelp" type="button"><i></i><span>مساعدة</span></button>
        <button class="pwx" id="pwx" type="button" aria-label="إغلاق">×</button></div></header>
    <div class="pwb"><aside class="pwn" id="pwn"></aside><section class="pwm" id="pwm"></section><aside class="pwi" id="pwi"></aside></div>
    <footer class="pwfoot"><span class="muted small" id="pwsec"></span><span class="grow"></span>
      <button class="btn alt" id="pwback" type="button">عودة</button><button class="btn alt" id="pwcancel" type="button">إلغاء</button><button class="btn alt" id="pwsave" type="button">حفظ</button><button class="btn" id="pwnext" type="button">التالي</button></footer></div>`;
  document.body.appendChild(o);
  const q = (s) => o.querySelector(s);
  const onKey = (e) => { if (e.key === 'Escape') tryClose(); };
  document.addEventListener('keydown', onKey);
  const close = () => { document.removeEventListener('keydown', onKey); o.remove(); };
  const tryClose = () => { if (JSON.stringify(d) === init || confirm('إغلاق من غير حفظ التعديلات؟')) close(); };
  const isOff = (i) => !!(steps[i].off && steps[i].off(d));
  const h = { redraw: () => drawMain(), help: (k) => drawHelp(k) };
  const can = (i) => !st.guided || i <= st.i || st.done.has(i) || [...st.done, st.i].some((x) => x + 1 === i);

  const drawNav = () => {
    const doneN = steps.filter((_, i) => st.done.has(i)).length;
    q('#pwn').innerHTML = `<div class="pwp"><div class="pwpl">${cfg.progressLabel}</div><div class="pwpb"><b>${doneN}/${steps.length}</b><span class="bar"><i style="width:${(doneN / steps.length) * 100}%"></i></span></div></div>
      ${groups.map((g) => { const dn = g.idx.filter((i) => st.done.has(i)).length; return `<div class="pwg"><div class="pwgh"><span>${g.title}</span><em class="${dn === g.idx.length ? 'ok' : ''}">${dn}/${g.idx.length}</em></div>
        ${g.idx.map((i) => `<button type="button" class="pws ${i === st.i ? 'on' : ''} ${st.done.has(i) ? 'done' : ''} ${isOff(i) ? 'dim' : ''}" data-go="${i}" ${can(i) ? '' : 'disabled'}><span class="pwsi">${st.done.has(i) && i !== st.i ? ico('check') : ico(steps[i].icon)}</span><span class="pwst"><b>${steps[i].title}</b><small>${isOff(i) ? 'غير مفعّل في السياسة' : steps[i].sub}</small></span></button>`).join('')}</div>`; }).join('')}`;
    o.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => goTo(Number(b.dataset.go))));
  };
  const drawHelp = (k) => {
    st.hk = k || st.hk;
    const hp = cfg.help[st.hk] || cfg.help.details;
    q('#pwi').innerHTML = `<div class="pwih"><span>ماذا يعني هذا</span><i>${ico('info')}</i></div><div class="pwic"><h4>${hp[0]}</h4><p>${hp[1]}</p>${hp[2] ? `<div class="pwwarn">${ico('info')}<span>${hp[2]}</span></div>` : ''}</div>`;
  };
  const drawFoot = () => {
    const last = lastIdx();
    q('#pwsec').textContent = `القسم ${st.i + 1} من ${steps.length}`;
    q('#pwback').style.visibility = st.i === 0 ? 'hidden' : 'visible';
    q('#pwnext').textContent = st.i >= last ? 'حفظ' : 'التالي';
    q('#pwsave').hidden = st.guided || st.i >= last;
    q('#pwmode').querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b.dataset.mode === 'guided') === st.guided));
    q('#pw').classList.toggle('nohelp', !st.help);
    q('#pwhelp').classList.toggle('off', !st.help);
  };
  const lastIdx = () => { for (let i = steps.length - 1; i >= 0; i--) if (!st.guided || !isOff(i)) return i; return steps.length - 1; };

  function drawMain() {
    const s = steps[st.i];
    const y = q('#pwm').scrollTop;
    q('#pwm').innerHTML = `<div class="pwcard"><div class="pwch"><span class="pwnum">${st.i + 1}</span><div><h3>${s.title}</h3><p class="muted small">${s.sub}</p></div></div>${s.body(d, st)}</div>`;
    q('#pwm').scrollTop = y;
    bind(q('#pwm'));
    if (s.on) s.on(q('#pwm'), d, h, st);
    drawNav(); drawFoot(); drawHelp(s.help);
  }

  function bind(root) {
    root.querySelectorAll('[data-k]').forEach((el) => {
      el.oninput = () => { const old = d[el.dataset.k]; d[el.dataset.k] = el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value; if (cfg.onInput) cfg.onInput(el.dataset.k, d, old, root); };
      el.onchange = () => { if (cfg.onChange && cfg.onChange(el.dataset.k, d)) drawMain(); };
    });
    root.querySelectorAll('[data-ck]').forEach((el) => (el.onchange = () => { d[el.dataset.ck] = el.checked; el.closest('.cc').classList.toggle('on', el.checked); drawNav(); }));
    root.querySelectorAll('[data-rc]').forEach((b) => (b.onclick = () => { const k = b.dataset.rc; d[k] = /^-?[\d.]+$/.test(b.dataset.v) ? Number(b.dataset.v) : b.dataset.v; if (cfg.onChange) cfg.onChange(k, d); drawMain(); }));
    root.querySelectorAll('[data-enable]').forEach((b) => (b.onclick = () => { d[b.dataset.enable] = true; if (cfg.onEnable) cfg.onEnable(b.dataset.enable, d); drawMain(); }));
    root.querySelectorAll('[data-sp]').forEach((b) => (b.onclick = () => {
      const inp = b.parentElement.querySelector('input'), step = Number(b.dataset.step) || 1;
      const min = inp.min === '' ? -Infinity : Number(inp.min), max = inp.max === '' ? Infinity : Number(inp.max);
      const nv = Math.min(max, Math.max(min, Math.round((Number(inp.value || 0) + step * Number(b.dataset.sp)) * 1000) / 1000));
      inp.value = nv; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
    }));
    root.querySelectorAll('[data-help]').forEach((el) => el.addEventListener('focusin', () => drawHelp(el.dataset.help)));
    root.querySelectorAll('[data-help]').forEach((el) => el.addEventListener('click', () => drawHelp(el.dataset.help)));
  }

  function goTo(i) {
    if (i === st.i || i < 0 || i >= steps.length || !can(i)) return;
    if (i > st.i) { const err = steps[st.i].check && !isOff(st.i) ? steps[st.i].check(d) : null; if (err) return toast(err, true); }
    st.done.add(st.i); st.i = i; drawMain();
  }
  function next() {
    const last = lastIdx();
    const err = isOff(st.i) ? null : (steps[st.i].check ? steps[st.i].check(d) : null);
    if (err) return toast(err, true);
    if (st.i >= last) return save();
    st.done.add(st.i);
    let j = st.i + 1;
    while (st.guided && j < last && isOff(j)) { st.done.add(j); j++; }
    st.i = j; drawMain();
  }
  function save() {
    for (let i = 0; i < steps.length; i++) {
      const err = !isOff(i) && steps[i].check ? steps[i].check(d) : null;
      if (err) { st.i = i; drawMain(); return toast(err, true); }
    }
    run(q('#pwnext'), async () => { await cfg.onSave(d); close(); toast('تم الحفظ'); cfg.done(); });
  }

  q('#pwx').onclick = tryClose; q('#pwcancel').onclick = tryClose;
  o.addEventListener('mousedown', (e) => { if (e.target === o) tryClose(); });
  q('#pwback').onclick = () => { if (st.i > 0) { let j = st.i - 1; while (st.guided && j > 0 && isOff(j)) j--; st.i = j; drawMain(); } };
  q('#pwnext').onclick = next; q('#pwsave').onclick = save;
  q('#pwhelp').onclick = () => { st.help = !st.help; drawFoot(); };
  q('#pwmode').querySelectorAll('button').forEach((b) => (b.onclick = () => { st.guided = b.dataset.mode === 'guided'; drawMain(); }));
  drawMain();
}

/* --- خطوات سياسة الجزاءات --- */
function penaltySteps() {
  const kinds = (d) => (d.late_method === 'periods' ? [['fixed', 'كمية ثابتة'], ['day_fraction', 'جزء من أجر اليوم']] : [['minutes', 'دقائق'], ['fixed', 'كمية ثابتة'], ['day_fraction', 'جزء من أجر اليوم']]);
  const tierCard = (d, st, t, i) => {
    const open = !st.col[i];
    const vl = { minutes: ['اضرب دقائق التأخير في', 0.25, 0.25, 10], fixed: ['المبلغ المخصوم (جنيه)', 1, 1, 1000000], day_fraction: ['جزء من أجر اليوم (0.25 = ربع يوم)', 0.25, 0.25, 10] }[t.kind] || ['القيمة', 1, 1, 100];
    return `<div class="tier" data-help="tier"><div class="tierh"><button type="button" class="tcol ${open ? 'on' : ''}" data-tcol="${i}">${ico('chev')}</button>
      <div class="tierti"><b>شريحة ${i + 1}</b><small>${t.to === null || t.to === '' ? `من ${t.from} د فأكثر` : `من ${t.from} إلى ${t.to} د`}</small></div>${d.tiers.length > 1 ? `<button type="button" class="tdel" data-tdel="${i}" aria-label="حذف الشريحة">×</button>` : ''}</div>
      ${open ? `<div class="tierb"><label class="lbl">دقائق التأخير محسوبة من بداية الوردية</label>
        <div class="trange">${pwNum(`min="1" data-ti="${i}" data-tk="from"`, t.from, 'د')}<i>←</i>${pwNum(`min="1" data-ti="${i}" data-tk="to" placeholder="وما فوق"`, t.to ?? '', 'د')}<em>متأخر</em></div>
        <label class="lbl">خصم كـ</label>${`<div class="rcs">${kinds(d).map(([v, l]) => `<button type="button" class="rc ${t.kind === v ? 'on' : ''}" data-tkind="${i}" data-v="${v}"><span class="rd"></span><span><b>${l}</b></span></button>`).join('')}</div>`}
        <label class="lbl">${vl[0]}</label>${pwStep(`data-ti="${i}" data-tk="value"`, t.value, vl[2], vl[1], vl[3])}</div>` : ''}</div>`;
  };
  const tierBind = (root, d, h, st) => {
    root.querySelectorAll('[data-ti]').forEach((el) => {
      const set = () => {
        const i = Number(el.dataset.ti), t = d.tiers[i], k = el.dataset.tk;
        t[k] = el.value === '' ? (k === 'to' ? null : '') : Number(el.value);
        const sub = el.closest('.tier').querySelector('.tierti small');
        if (sub) sub.textContent = t.to === null || t.to === '' ? `من ${t.from} د فأكثر` : `من ${t.from} إلى ${t.to} د`;
      };
      el.addEventListener('input', set);
    });
    root.querySelectorAll('[data-tkind]').forEach((b) => (b.onclick = () => { const t = d.tiers[Number(b.dataset.tkind)]; t.kind = b.dataset.v; t.value = { minutes: 1, fixed: 50, day_fraction: 0.25 }[t.kind]; h.redraw(); }));
    root.querySelectorAll('[data-tcol]').forEach((b) => (b.onclick = () => { st.col[b.dataset.tcol] = !st.col[b.dataset.tcol]; h.redraw(); }));
    root.querySelectorAll('[data-tdel]').forEach((b) => (b.onclick = () => { d.tiers.splice(Number(b.dataset.tdel), 1); h.redraw(); }));
    const add = root.querySelector('#tadd');
    if (add) add.onclick = () => {
      const last = d.tiers[d.tiers.length - 1];
      let from = (Number(d.grace) || 0) + 1;
      if (last) { if (last.to === null || last.to === '') last.to = Number(last.from) + 29; from = Number(last.to) + 1; }
      d.tiers.push({ from, to: null, kind: last ? last.kind : (d.late_method === 'periods' ? 'day_fraction' : 'minutes'), value: last ? last.value : 1 });
      h.redraw();
    };
    const sal = root.querySelector('#pcs'), hrs = root.querySelector('#pch'), mn = root.querySelector('#pcm'), res = root.querySelector('#pcr');
    if (sal) {
      const calc = () => {
        const daily = Number(sal.value) / 30, hourly = daily / (Number(hrs.value) || 8), m = Number(mn.value);
        res.textContent = !(Number(sal.value) > 0) || !(m > 0) ? '' : m <= (Number(d.grace) || 0) ? 'لا يوجد خصم (داخل السماحية)' : `الخصم: ${money(polLateCalc(d, m, daily, hourly))} جنيه`;
      };
      [sal, hrs, mn].forEach((x) => (x.oninput = calc)); calc();
    }
  };
  return [
    { title: 'تفاصيل السياسة', sub: 'اسم السياسة والجزاءات التي تغطيها', icon: 'file', help: 'details',
      body: (d) => `<div class="pwfld" data-help="details"><label class="lbl">اسم السياسة</label><input data-k="name" value="${esc(d.name)}" maxlength="120" placeholder="مثال: سياسة جزاءات الإنتاج" autocomplete="off"></div>
        <div class="pwfld" data-help="pick"><label class="lbl">أيّ من هذه الجزاءات تطبقها هذه السياسة؟</label><p class="muted small">الغياب غير مدرج لأنه مطبق دائماً: اليوم الذي لا يوجد به تسجيل حضور ولا طلب إجازة لا بد أن يُحسم بشيء ما.</p>
        <div class="ccs">${pwCheck('late_on', d.late_on, 'التأخير', 'الوصول بعد بداية الوردية وانتهاء السماحية')}${pwCheck('early_on', d.early_on, 'الانصراف المبكر', 'الانصراف قبل نهاية الوردية')}${pwCheck('partial_on', d.partial_on, 'الانصراف الناقص', 'يوم به تسجيل حضور دون تسجيل انصراف')}</div></div>`,
      check: (d) => (String(d.name || '').trim() ? null : 'اكتبي اسم السياسة') },
    { title: 'الغياب', sub: 'لا يوجد تسجيل حضور على الإطلاق', icon: 'user', help: 'absence',
      body: (d) => `<div class="pwfld" data-help="absence"><label class="lbl">معامل خصم الغياب</label><p class="muted small">عدد أيام الأجر المخصومة عن كل يوم غياب (1 = أجر يوم كامل).</p>${pwStep('data-k="absence_factor"', d.absence_factor, 0.25, 0, 10)}</div>
        <div class="pwfld" data-help="deduct"><label class="lbl">خصم من</label>${pwRadio('deduct_from', 'salary', [['salary', 'المرتب'], ['leave', 'الأجازات', null, true]], 'two')}<p class="muted small">الخصم من رصيد الإجازات غير متاح، فالجزاءات بتتخصم من المرتب.</p></div>`,
      check: (d) => (Number(d.absence_factor) >= 0 && Number(d.absence_factor) <= 10 ? null : 'معامل خصم الغياب بين 0 و 10') },
    { title: 'التأخير', sub: 'الوصول بعد بداية الوردية', icon: 'timer', help: 'grace', off: (d) => !d.late_on,
      body: (d, st) => (!d.late_on ? pwOff('التأخير غير مفعّل في هذه السياسة', 'late_on', 'تفعيل التأخير') : `<div class="pwnote">كل الدقائق هنا بتتحسب <b>من بداية الوردية</b> وليس بأوقات فعلية، وكل موعد عمل مربوط بالسياسة بيحدد بداية الوردية الخاصة بيه. وده اللي بيسمح بتطبيق سياسة واحدة على ورديات متعددة.</div>
        <div class="pwfld" data-help="grace"><label class="lbl">السماحية</label>${pwNum('min="0" max="240" data-k="grace"', d.grace, 'د')}<p class="muted small">يُعتبر في الموعد ولا يُخصم شيء. تبدأ الشريحة 1 عند نهاية هذه الفترة.</p></div>
        <div class="pwfld" data-help="method"><label class="lbl">كيف يجب حساب عقوبات التأخير؟</label>${pwRadio('late_method', d.late_method, [['minutes', 'دقائق', 'المُعامل × الدقائق داخل النطاق'], ['periods', 'فترات زمنية', 'خصم ثابت لكل شريحة']], 'two')}</div>
        <div class="pwfld" data-help="deduct"><label class="lbl">خصم من</label>${pwRadio('deduct_from', 'salary', [['salary', 'المرتب'], ['leave', 'الأجازات', null, true]], 'two')}</div>
        <div class="pwfld"><div class="tiersh"><label class="lbl">مستويات الجزاءات النشطة</label><button type="button" class="btn alt sm" id="tadd">+ إضافة شريحة</button></div>${d.tiers.map((t, i) => tierCard(d, st, t, i)).join('')}</div>
        <div class="pwcalc" data-help="calc"><b>جرّبي حساب خصم</b><div class="row"><input type="number" id="pcs" placeholder="المرتب الشهري" value="6000"><input type="number" id="pch" placeholder="ساعات الوردية" value="8"><input type="number" id="pcm" placeholder="دقائق التأخير" value="45"><b id="pcr"></b></div></div>`),
      on: (root, d, h, st) => { if (d.late_on) tierBind(root, d, h, st); },
      check: (d) => {
        if (!d.late_on) return null;
        if (!(Number(d.grace) >= 0 && Number(d.grace) <= 240)) return 'سماحية التأخير بين 0 و 240 دقيقة';
        if (!d.tiers.length) return 'أضيفي شريحة تأخير واحدة على الأقل';
        const ts = [...d.tiers].sort((a, b) => a.from - b.from);
        for (let i = 0; i < ts.length; i++) {
          const t = ts[i], to = t.to === null || t.to === '' ? null : Number(t.to);
          if (!Number.isInteger(Number(t.from)) || Number(t.from) < 1) return 'بداية الشريحة لازم تكون رقم صحيح 1 أو أكبر';
          if (to !== null && (!Number.isInteger(to) || to < Number(t.from))) return 'نهاية الشريحة لازم تكون رقم صحيح أكبر من أو يساوي بدايتها';
          if (!(Number(t.value) > 0) || Number(t.value) > (t.kind === 'fixed' ? 1000000 : 10)) return 'قيمة الخصم غير صحيحة';
          if (i && (ts[i - 1].to === null || ts[i - 1].to === '' || Number(t.from) <= Number(ts[i - 1].to))) return 'الشرائح متداخلة. بداية كل شريحة لازم تكون بعد نهاية اللي قبلها، والشريحة المفتوحة (وما فوق) تكون الأخيرة';
        }
        return null;
      } },
    { title: 'الانصراف المبكر', sub: 'الانصراف قبل نهاية الوردية', icon: 'logout', help: 'early', off: (d) => !d.early_on,
      body: (d) => (!d.early_on ? pwOff('الانصراف المبكر غير مفعّل في هذه السياسة', 'early_on', 'تفعيل الانصراف المبكر') : `<div class="pwfld" data-help="early"><label class="lbl">السماحية</label>${pwNum('min="0" max="240" data-k="early_grace"', d.early_grace, 'د')}<p class="muted small">لو الانصراف المبكر أقل من أو يساوي المدة دي مفيش خصم. لو أكبر منها بتتحسب كل الدقائق.</p></div>
        <div class="pwfld" data-help="early"><label class="lbl">معامل خصم الانصراف المبكر</label><p class="muted small">الخصم = (دقائق الانصراف المبكر ÷ 60) × أجر الساعة × المعامل.</p>${pwStep('data-k="early_factor"', d.early_factor, 0.25, 0, 10)}</div>`),
      check: (d) => (!d.early_on ? null : !(Number(d.early_grace) >= 0 && Number(d.early_grace) <= 240) ? 'سماحية الانصراف المبكر بين 0 و 240 دقيقة' : !(Number(d.early_factor) >= 0 && Number(d.early_factor) <= 10) ? 'معامل خصم الانصراف المبكر بين 0 و 10' : null) },
    { title: 'الانصراف الناقص', sub: 'يوم به تسجيل حضور دون تسجيل انصراف', icon: 'clockoff', help: 'partial', off: (d) => !d.partial_on,
      body: (d) => (!d.partial_on ? pwOff('الانصراف الناقص غير مفعّل في هذه السياسة', 'partial_on', 'تفعيل الانصراف الناقص') : `<div class="pwfld" data-help="partial"><label class="lbl">نوع الخصم</label>${pwRadio('partial_kind', d.partial_kind, [['day_fraction', 'جزء من أجر اليوم', '0.5 = نصف يوم'], ['fixed', 'كمية ثابتة', 'مبلغ بالجنيه']], 'two')}</div>
        <div class="pwfld" data-help="partial"><label class="lbl">${d.partial_kind === 'fixed' ? 'المبلغ المخصوم عن كل يوم (جنيه)' : 'جزء أجر اليوم المخصوم عن كل يوم'}</label>${pwStep('data-k="partial_value"', d.partial_value, d.partial_kind === 'fixed' ? 1 : 0.25, 0, d.partial_kind === 'fixed' ? 1000000 : 10)}</div>`),
      check: (d) => (d.partial_on && !(Number(d.partial_value) > 0 && Number(d.partial_value) <= (d.partial_kind === 'fixed' ? 1000000 : 10)) ? 'قيمة خصم الانصراف الناقص غير صحيحة' : null) },
  ];
}

/* --- خطوات سياسة الوقت الإضافي --- */
function overtimeSteps() {
  return [
    { title: 'تفاصيل السياسة', sub: 'الاسم وهل الوقت الإضافي يُحتسب', icon: 'file', help: 'details',
      body: (d) => `<div class="pwfld" data-help="details"><label class="lbl">اسم السياسة</label><input data-k="name" value="${esc(d.name)}" maxlength="120" placeholder="مثال: وقت إضافي الإنتاج" autocomplete="off"></div>
        <div class="pwfld" data-help="calc"><label class="lbl">هل يُحتسب الوقت الإضافي؟</label>${pwRadio('calc_on', d.calc_on ? 'true' : 'false', [['true', 'يُحتسب', 'الساعات الإضافية المعتمدة بتتدفع'], ['false', 'لا يُحتسب', 'لا تُحتسب الساعات بعد الانصراف']], 'two')}</div>`,
      check: (d) => (String(d.name || '').trim() ? null : 'اكتبي اسم السياسة') },
    { title: 'البداية والحد', sub: 'متى يبدأ الاحتساب وأقصى ساعات', icon: 'timer', help: 'start', off: (d) => !d.calc_on,
      body: (d) => (!d.calc_on ? pwOff('الوقت الإضافي لا يُحتسب في هذه السياسة', 'calc_on', 'تفعيل احتساب الوقت الإضافي') : `<div class="pwfld" data-help="start"><label class="lbl">يبدأ الاحتساب بعد</label>${pwNum('min="0" max="600" data-k="after_min"', d.after_min, 'د')}<p class="muted small">من أول كل طلب وقت إضافي معتمد (0 = من أول دقيقة).</p></div>
        <div class="pwfld" data-help="cap"><label class="lbl">الحد اليومي</label>${pwNum('min="0" max="24" step="0.25" data-k="cap_hours"', d.cap_hours, 'س')}<p class="muted small">أقصى ساعات إضافية في الطلب الواحد (0 = بدون حد).</p></div>`),
      check: (d) => (!d.calc_on ? null : !(Number(d.after_min) >= 0 && Number(d.after_min) <= 600) ? 'بداية الاحتساب بين 0 و 600 دقيقة' : !(Number(d.cap_hours) >= 0 && Number(d.cap_hours) <= 24) ? 'الحد اليومي بين 0 و 24 ساعة (0 = بدون حد)' : null) },
    { title: 'التقريب والمعامل', sub: 'تقريب الساعات ومعامل الأجر', icon: 'dollar', help: 'rounding', off: (d) => !d.calc_on,
      body: (d) => (!d.calc_on ? pwOff('الوقت الإضافي لا يُحتسب في هذه السياسة', 'calc_on', 'تفعيل احتساب الوقت الإضافي') : `<div class="pwfld" data-help="rounding"><label class="lbl">التقريب</label>${pwRadio('rounding', d.rounding, [['none', 'الدقائق الفعلية', 'من غير تقريب'], ['up', 'تقريب للأعلى'], ['down', 'تقريب للأسفل']])}
        ${d.rounding !== 'none' ? `<label class="lbl" style="margin-top:12px">وحدة التقريب</label><select data-k="round_unit">${[5, 10, 15, 30, 60].map((n) => `<option value="${n}" ${Number(d.round_unit) === n ? 'selected' : ''}>${n} دقيقة</option>`).join('')}</select>` : ''}</div>
        <div class="pwfld" data-help="factor"><label class="lbl">معامل أجر الساعة الإضافية</label>${pwStep('data-k="factor"', d.factor, 0.25, 0.25, 10)}</div>
        <div class="pwcalc" data-help="sim"><b>جرّبي حساب</b><div class="row"><input type="number" id="osh" step="0.25" placeholder="ساعات الطلب" value="2.4"><b id="osr"></b></div></div>`),
      on: (root, d) => { const i = root.querySelector('#osh'), r = root.querySelector('#osr'); if (i) { const c = () => { r.textContent = Number(i.value) > 0 ? `المحتسب: ${Math.round(polOtCalc(d, Number(i.value)) * 100) / 100} ساعة × ${d.factor}` : ''; }; i.oninput = c; c(); } },
      check: (d) => (!d.calc_on ? null : !(Number(d.factor) > 0 && Number(d.factor) <= 10) ? 'معامل الوقت الإضافي بين 0.1 و 10' : null) },
  ];
}

const POL_NEW = {
  penalty_policy: () => ({ name: '', grace: 10, early_grace: 0, late_on: true, early_on: false, partial_on: false, absence_factor: 1, early_factor: 1, late_method: 'minutes', partial_kind: 'day_fraction', partial_value: 0.5, deduct_from: 'salary', tiers: [{ from: 11, to: 30, kind: 'minutes', value: 1 }, { from: 31, to: null, kind: 'minutes', value: 2 }] }),
  overtime_policy: () => ({ name: '', calc_on: true, after_min: 0, cap_hours: 0, factor: 1.5, rounding: 'none', round_unit: 15 }),
};

function openPolicyWizard(spec, it, reload) {
  const isPen = spec.kind === 'penalty_policy';
  const d = it ? { ...POL_NEW[spec.kind](), ...Object.fromEntries(spec.keys.map((k) => [k, clone(k === 'name' ? it.name : it[k])]).filter(([, v]) => v !== null && v !== undefined)) } : POL_NEW[spec.kind]();
  if (isPen && Array.isArray(d.tiers)) d.tiers = d.tiers.map((t) => ({ ...t, to: t.to === undefined || t.to === '' ? null : t.to }));
  policyWizard({
    d, guided: !it, groups: isPen ? [{ title: 'السياسة', idx: [0] }, { title: 'بنود الجزاءات', idx: [1, 2, 3, 4] }] : [{ title: 'السياسة', idx: [0] }, { title: 'بنود الوقت الإضافي', idx: [1, 2] }],
    steps: isPen ? penaltySteps() : overtimeSteps(), help: HELP[spec.kind],
    title: `${it ? 'تعديل' : 'إضافة'} ${isPen ? 'سياسة الجزاءات' : 'سياسة الوقت الإضافي'}`,
    subtitle: isPen ? 'التأخير والغياب والانصراف المبكر والانصراف الناقص – تُكتب مرة واحدة وتُربط بكل موعد عمل تحكمه' : 'قواعد احتساب الوقت الإضافي – تُكتب مرة واحدة وتُربط بكل موعد عمل تحكمه',
    progressLabel: isPen ? 'سياسة الجزاءات' : 'سياسة الوقت الإضافي',
    onInput: (k, dd, old, root) => {
      if (k === 'grace' && dd.tiers && dd.tiers[0] && Number(dd.tiers[0].from) === Number(old) + 1) { dd.tiers[0].from = (Number(dd.grace) || 0) + 1; const f = root.querySelector('[data-ti="0"][data-tk="from"]'); if (f) f.value = dd.tiers[0].from; }
      if (k === 'round_unit') dd.round_unit = Number(dd.round_unit);
    },
    onChange: (k, dd) => {
      if (k === 'late_method' && dd.late_method === 'periods') { dd.tiers.forEach((t) => { if (t.kind === 'minutes') { t.kind = 'day_fraction'; t.value = 0.25; } }); return true; }
      if (k === 'calc_on') { dd.calc_on = dd.calc_on === true || dd.calc_on === 'true'; return true; }
      if (k === 'partial_kind') { dd.partial_value = dd.partial_kind === 'fixed' ? 50 : 0.5; return true; }
      return false;
    },
    onEnable: (k, dd) => { if (k === 'late_on' && !dd.tiers.length) dd.tiers = POL_NEW.penalty_policy().tiers.map((t) => ({ ...t, from: t.from - 10 + (Number(dd.grace) || 0) })); },
    onSave: (dd) => spec.saveWith(it, dd), done: reload,
  });
}
