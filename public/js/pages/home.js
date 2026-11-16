'use strict';
/* pages/home.js — صفحة «تسجيل الحضور» (الرئيسية للموظف) */

/* --- تسجيل الحضور --- */

PAGES.home = async (view) => {
  const u = S.me.user, today = S.me.today_date;
  if (u.is_admin) { // البصمة للموظفين فقط، المدير بيتابع بس
    view.innerHTML = `<div class="narrow"><div class="card prof"><div class="avatar big">${esc(initials(u.name))}</div><div class="info"><b>${esc(u.name)}</b><span class="muted">${esc(u.job_title || 'مدير النظام')}</span></div></div>
      <div class="card" style="margin-top:12px;text-align:center"><p style="margin:0;font-weight:700">تسجيل الحضور والانصراف بالبصمة للموظفين فقط</p><p class="muted small" style="margin:6px 0 0">تابعي حضورهم بالصورة والموقع من «الموظفون» أو «سجل الحضور».</p></div></div>`;
    return;
  }
  const weekend = String(S.me.settings.weekend_days || '').split(',').filter(Boolean).map(Number);
  const days = IS_APP ? Array.from({ length: 48 }, (_, i) => addDays(today, i - 40)) : Array.from({ length: 7 }, (_, i) => addDays(today, i - 4));
  let sel = today, recs = {};
  view.innerHTML = `<div class="narrow"><div class="card prof"><div class="avatar big">${esc(initials(u.name))}</div>
      <div class="info"><b>${esc(u.name)}</b><span class="muted">${esc(u.job_title || '')}</span><span class="muted">${esc(u.department || '')}</span></div></div>
    <div class="card" style="margin-top:12px"><div class="strip-head">${IS_APP ? `<span class="calic">${fi('calsearch')}</span>` : ''}<span class="strip-month" id="smon"></span><span class="muted" id="sdow"></span></div>
      <div class="strip" id="strip"></div></div>
    <div class="card punchcard" id="pc" style="margin-top:12px"></div></div>`;
  const loadRecs = async () => {
    const months = [...new Set(days.map((d) => d.slice(0, 7)))];
    const lists = await Promise.all(months.map((m) => api('/attendance/mine?month=' + m)));
    recs = {}; lists.flat().forEach((r) => { recs[r.date] = r; });
    if (S.me.today) recs[today] = S.me.today;
  };
  const dotColor = (d) => {
    const r = recs[d], dow = new Date(d + 'T00:00:00Z').getUTCDay();
    if (r && r.check_in) return r.late_minutes > 0 ? '#d97706' : '#15803d';
    if (d < today && !weekend.includes(dow) && d >= u.hire_date) return '#dc2626';
    return '#cbd5e1';
  };
  const drawStrip = () => {
    const dt = new Date(sel + 'T00:00:00');
    const mon = dt.toLocaleDateString('ar-EG-u-nu-latn', { month: 'long', year: 'numeric' });
    if (IS_APP) { const pp = mon.split(' '); $('#smon').innerHTML = `<b>${esc(pp[0])}</b> <span class="yr">${esc(pp.slice(1).join(' '))}</span>`; } else $('#smon').textContent = mon;
    $('#sdow').textContent = `(${dt.toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long' })})`;
    if (IS_APP) return paintStrip($('#strip'), days, sel, dotColor, (d) => { sel = d; draw(); });
    $('#strip').innerHTML = days.map((d) => `<button class="day ${d === sel ? 'on' : ''}" data-d="${d}"><b>${Number(d.slice(8))}</b><i style="background:${d === sel ? '#0ea5e9' : dotColor(d)}"></i></button>`).join('');
    view.querySelectorAll('.day').forEach((b) => (b.onclick = () => { sel = b.dataset.d; draw(); }));
  };
  const row = (kind, iso, loc) => `<div class="prow"><span class="pi ${kind}">${kind === 'in' ? '⇥' : '⇤'}</span><b>${timeAr(iso)}</b><span class="ploc">${esc(loc || 'بدون موقع')}</span></div>`;
  const draw = () => {
    drawStrip();
    const r = recs[sel], dow = new Date(sel + 'T00:00:00Z').getUTCDay(), isToday = sel === today;
    const grace = S.me.settings.grace_minutes || 0;
    const [sh, sm] = u.shift_start.split(':').map(Number), endGrace = `${String(Math.floor((sh * 60 + sm + grace) / 60) % 24).padStart(2, '0')}:${String((sm + grace) % 60).padStart(2, '0')}`;
    let status = '', body = '', action = '';
    if (r && r.check_in) {
      status = r.late_minutes > 0 ? `<div class="pstat warn">متأخر ${r.late_minutes} دقيقة</div>` : '<div class="pstat ok">في الموعد</div>';
      body = `<div class="recbox">${row('in', r.check_in, r.in_loc)}${r.check_out ? row('out', r.check_out, r.out_loc) : ''}</div>
        ${r.early_minutes ? `<p class="small neg" style="text-align:center">انصراف مبكر ${r.early_minutes} دقيقة</p>` : ''}`;
      if (isToday && !r.check_out) action = '<button class="pbtn out" id="go">تسجيل الانصراف <span>⇤</span></button>';
      else if (isToday) action = '<p class="pos" style="text-align:center;font-weight:700;margin:12px 0 0">✔ تم تسجيل حضورك وانصرافك اليوم</p>';
    } else if (weekend.includes(dow)) status = '<div class="pstat">عطلة أسبوعية</div>';
    else if (sel > today) status = '<div class="pstat">لم يحن موعد هذا اليوم بعد</div>';
    else if (!isToday) status = '<div class="pstat bad">لا يوجد تسجيل حضور</div>';
    else {
      status = `<div class="muted" style="text-align:center">موعد تسجيل الحضور - ${fmt12(u.shift_start)} - ${fmt12(endGrace)}</div>`;
      action = !u.face_enrolled && !u.face_exempt
        ? `<p class="small" style="background:var(--warn-l);color:var(--warn);padding:10px;border-radius:10px;margin:14px 0 10px">لازم تسجّلي بصمة وجهك مرة واحدة قبل أول تسجيل حضور.</p><button class="pbtn" id="enroll">تسجيل بصمة الوجه</button>`
        : '<button class="pbtn" id="go">تسجيل الحضور <span>⇥</span></button>';
    }
    $('#pc').innerHTML = `<div class="shift">(${esc(fmt12(u.shift_start))} - ${esc(fmt12(u.shift_end))})</div>${status}${body}${action}
      ${isToday && !(r && r.check_out) ? `<p class="muted small" style="text-align:center;margin:12px 0 0">${u.face_exempt ? 'التسجيل' : 'التسجيل بالوجه'} ${S.me.settings.needs_geo ? 'والموقع (' + esc(S.me.settings.locations.join('، ')) + ')' : ''}</p>` : ''}`;
    if ($('#enroll')) $('#enroll').onclick = (e) => run(e.target, async () => {
      const d = await captureFace('تسجيل بصمة الوجه');
      await api('/me/face', 'POST', { descriptor: d });
      toast('تم تسجيل بصمة الوجه'); await boot();
    });
    if ($('#go')) $('#go').onclick = (e) => punch(r && r.check_in ? 'out' : 'in', e.currentTarget);
  };
  async function punch(type, btn) {
    const label = btn.innerHTML;
    await run(btn, async () => {
      let pos = null;
      if (S.me.settings.needs_geo) { btn.textContent = 'جارٍ تحديد موقعك...'; pos = await getPos(); }
      const d = await captureFace(type === 'in' ? 'تأكيد الوجه للحضور' : 'تأكيد الوجه للانصراف', { photo: true, quick: true });
      await api('/attendance/punch', 'POST', { type, lat: pos?.lat, lng: pos?.lng, descriptor: d.descriptor, photo: d.photo });
      toast(type === 'in' ? 'تم تسجيل الحضور ✔' : 'تم تسجيل الانصراف ✔');
      S.me = await api('/me'); await loadRecs(); draw();
    });
    if (btn.isConnected) btn.innerHTML = label;
  }
  draw();
  loadRecs().then(() => { if ($('#strip')) draw(); }).catch(() => {});
};
