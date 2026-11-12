'use strict';
/* settings/50-general-form.js — نموذج الإعدادات العامة (بيحفظ في /settings) */

/* --- نموذج إعدادات عامة (بيحفظ في /settings) --- */
async function settingsForm(box, cfg) {
  const fields = cfg.fields;
  box.innerHTML = `<div class="card sform"><h3>${cfg.title}</h3>${cfg.intro ? `<p class="muted small" style="margin:4px 0 12px">${cfg.intro}</p>` : ''}
    <form class="form" id="setf">${fields.map((f) => (f.sec ? `<h4 class="full sec">${f.sec}</h4>` : f.k === '_days'
      ? `<div class="full"><div class="muted small" style="margin-bottom:6px;font-weight:600">أيام الإجازة الأسبوعية</div><div class="row">${DAYS.map((d, i) => `<label class="perm"><input type="checkbox" data-d="${i}" ${String(SETV.weekend_days).split(',').filter(Boolean).map(Number).includes(i) ? 'checked' : ''}>${d}</label>`).join('')}</div></div>`
      : fieldHtml(f, SETV[f.k]))).join('')}
    <div class="actions full" style="justify-content:flex-start"><button class="btn">حفظ الإعدادات</button></div></form></div>`;
  const f = $('#setf', box);
  f.onsubmit = (e) => { e.preventDefault(); run($('.btn', f), async () => {
    const real = fields.filter((x) => x.k && x.k !== '_days');
    const b = readForm(f, real);
    for (const x of real) if (x.t === 'check') b[x.k] = b[x.k] ? '1' : '0';
    if (fields.some((x) => x.k === '_days')) b.weekend_days = [...f.querySelectorAll('[data-d]:checked')].map((x) => x.dataset.d).join(',');
    await api('/settings', 'PUT', b);
    Object.assign(SETV, b);
    S.me = await api('/me');
    toast('تم حفظ الإعدادات');
    if (cfg.refresh) renderShell();
  }); };
}
