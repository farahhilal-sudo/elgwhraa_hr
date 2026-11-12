'use strict';
/* app-mode/04-employees.js — وضع التطبيق: شاشة الموظفين */

/* شاشة الموظفون (تتشغّل من جوّه PAGES.employees وبتستخدم نفس دوالها: التعديل، القائمة، البيانات) */
const EM_ST = { present: ['حاضر', '#22c55e'], late: ['متأخر', '#f59e0b'], absent: ['غائب', '#ef4444'], leave: ['إجازة', '#3b82f6'], not_yet: ['لم يسجل الحضور', '#9ca3af'], off: ['عطلة', '#cbd5e1'] };
function empMobileUI(c) {
  const { view, body, people, manage, again, byId, menuFor, infoModal, f } = c;
  const today = S.me.today_date;
  const E = (S.empm = Object.assign({ day: today, st: [], dept: '', open: true, find: false }, S.empm || {}));
  if (f.q) E.find = true;
  const weekend = String(S.me.settings.weekend_days || '').split(',').filter(Boolean).map(Number);
  const dowOf = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
  const days = Array.from({ length: 40 }, (_, i) => addDays(today, i - 32));
  let recs = {}, leaves = [], scheds = S.scheds || [];
  const norm = (t) => String(t || '').replace(/^0/, '');
  const shiftTxt = (u) => { const m = scheds.find((x) => norm(x.start) === norm(u.shift_start) && norm(x.end) === norm(u.shift_end)); return m && m.name ? m.name : shiftLabel(u.shift_start, u.shift_end); };
  const dayInfo = (u) => {
    const r = recs[u.id], t = u.today;
    let status, ci = null, co = null, late = 0;
    if (E.day === today && t) { status = t.status; ci = t.check_in; co = t.check_out; late = t.late_minutes; }
    else if (r && r.check_in) { ci = r.check_in; co = r.check_out; late = r.late_minutes || 0; status = late > 0 ? 'late' : 'present'; }
    else if (leaves.some((l) => l.user_id === u.id && l.from_date <= E.day && l.to_date >= E.day)) status = 'leave';
    else if (weekend.includes(dowOf(E.day))) status = 'off';
    else if (E.day > today) status = 'not_yet';
    else status = 'absent';
    if (E.day === today && r) { ci = ci || r.check_in; co = co || r.check_out; }
    return { status, ci, co, late, inLoc: r && r.in_loc, outLoc: r && r.out_loc, rec: r };
  };
  const rows = () => {
    const q = (f.q || '').toLowerCase();
    return people.filter((u) => u.active && (!E.dept || u.department === E.dept) && (!q || [u.name, u.username, u.phone, u.job_title, u.department].some((x) => String(x || '').toLowerCase().includes(q))))
      .map((u) => ({ u, s: dayInfo(u) })).filter(({ s }) => !E.st.length || E.st.includes(s.status));
  };
  const card = ({ u, s }) => {
    const ring = (EM_ST[s.status] || [0, '#e5e7eb'])[1], hasIn = !!s.ci, hasOut = !!s.co, canEdit = has('attendance.edit');
    const tag = canEdit ? 'button' : 'span';
    const sq = hasIn && !hasOut ? `<${tag} class="msq out" data-sq="${u.id}" aria-label="تعديل الانصراف">${fi('sq_out')}</${tag}>`
      : !hasIn && E.day <= today && !['off', 'leave'].includes(s.status) ? `<${tag} class="msq in" data-sq="${u.id}" aria-label="تسجيل حضور">${fi('sq_in')}</${tag}>` : '';
    const line = (kind, iso, loc) => `<div class="mline" ${s.rec && s.rec.id ? `data-view="${u.id}" data-k="${kind}"` : ''}><span class="mi ${kind}">${fi(kind === 'in' ? 'in_m' : 'out_m')}</span><b>${timeAr(iso)}</b>${loc ? `<span class="mloc">${fi('pin')}<span>${esc(loc)}</span></span>` : ''}</div>`;
    const shift = `<div class="mshift"><span class="mclk">${fi('clock_c')}</span><span dir="auto">${esc(shiftTxt(u))}</span></div>`;
    const chev = `<button class="mchev" data-ex="${u.id}" aria-label="المزيد">${fi('chev_dn')}</button>`;
    const info = `<button class="minfo" data-info="${u.id}" aria-label="بيانات">${fi('info_fill')}</button>`;
    const bottom = hasIn
      ? `${shift}<div class="mrow">${sq}<div class="mlines">${line('in', s.ci, s.inLoc)}${hasOut ? line('out', s.co, s.outLoc) : ''}</div><span class="grow"></span>${info}${chev}</div>`
      : `<div class="mrow">${sq}${shift}${chev}</div>`;
    const tel = u.phone ? `<a class="btn alt sm" href="tel:${esc(u.phone)}">اتصال</a>` : '';
    return `<div class="card mcard" data-u="${u.id}"><div class="mhead"><span class="mav" style="--ring:${ring}">${empAv(u, '')}</span>
      <div class="mname"><b>${esc(u.name)}</b><span>${esc([u.job_title, u.department].filter(Boolean).join(' - ') || '—')}</span></div></div>${bottom}
      <div class="mexp" hidden><div class="kv"><div><span class="muted">الحالة</span><b>${(EM_ST[s.status] || [''])[0]}${s.late ? ` (${s.late} د)` : ''}</b></div><div><span class="muted">الوردية</span><b dir="ltr">${fmt12(u.shift_start)} - ${fmt12(u.shift_end)}</b></div>${u.phone ? `<div><span class="muted">الهاتف</span><b dir="ltr">${esc(u.phone)}</b></div>` : ''}</div>
        <div class="row" style="margin-top:10px">${tel}${manage ? `<button class="btn alt sm" data-e="${u.id}">تعديل</button>` : ''}<button class="btn alt sm" data-more="${u.id}">المزيد</button></div></div></div>`;
  };
  const drawList = () => {
    const rs = rows();
    $('#mlist', body).innerHTML = rs.map(card).join('') || '<div class="card empty">لا يوجد موظفون</div>';
    $('#mcount', body).textContent = `${rs.length} من ${people.filter((u) => u.active).length}`;
    const L = $('#mlist', body);
    fillPhotos(L);
    L.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => { const u = byId(b.dataset.view), s = dayInfo(u); if (s.rec && s.rec.id) attViewModal(u, s.rec, E.day, b.dataset.k); }));
    L.querySelectorAll('[data-info]').forEach((b) => (b.onclick = () => infoModal(byId(b.dataset.info))));
    L.querySelectorAll('[data-ex]').forEach((b) => (b.onclick = () => { const p = b.closest('.mcard'), x = $('.mexp', p); x.hidden = !x.hidden; b.innerHTML = fi(x.hidden ? 'chev_dn' : 'chev_up'); }));
    L.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => empForm(byId(b.dataset.e), again)));
    L.querySelectorAll('[data-more]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); popMenu(b, menuFor(byId(b.dataset.more))); }));
    L.querySelectorAll('button[data-sq]').forEach((b) => (b.onclick = () => {
      const u = byId(b.dataset.sq), s = dayInfo(u);
      manualAtt(people, s.rec && (s.ci || s.rec.id) ? s.rec : { user_id: u.id, date: E.day, manual_new: true }, again);
    }));
  };
  const drawHead = () => {
    const dt = new Date(E.day + 'T00:00:00'), mon = dt.toLocaleDateString('ar-EG-u-nu-latn', { month: 'long', year: 'numeric' }).split(' ');
    $('#mdnum', body).textContent = Number(E.day.slice(8));
    $('#mdmon', body).innerHTML = `<b>${esc(mon[0])}</b> <span class="yr">${esc(mon.slice(1).join(' '))}</span>`;
    paintStrip($('#mstrip', body), days, E.day, () => '#d1d5db', (d) => { E.day = d; drawHead(); load(); });
  };
  const load = async () => {
    drawList();
    recs = {};
    if (has('attendance.view_all')) { try { (await api(`/attendance?from=${E.day}&to=${E.day}`)).forEach((r) => { recs[r.user_id] = r; }); } catch { /* مفيش صلاحية */ } }
    if (!leaves.length && has('requests.view_all')) { try { leaves = (await api('/requests?status=approved')).filter((r) => ['annual_leave', 'sick_leave', 'emergency_leave', 'work_mission'].includes(r.type)); } catch { /* تجاهل */ } }
    if ($('#mlist', body)) drawList();
  };
  body.innerHTML = `<div class="msearch" ${E.find ? '' : 'hidden'}>${fi('search')}<input id="mq" placeholder="ابحث بالاسم أو الوظيفة أو الهاتف" value="${esc(f.q)}" autocomplete="off"></div>
    <div class="card mdate"><div class="mdhead"><span class="mdnum" id="mdnum"></span><span class="mdmon" id="mdmon"></span><span class="grow"></span><button class="mcol" id="mcol" aria-label="طي">${fi(E.open ? 'chev_up' : 'chev_dn')}</button></div>
      <div class="strip" id="mstrip" ${E.open ? '' : 'hidden'}></div></div>
    <div class="mmeta"><span id="mcount"></span>${E.st.length || E.dept ? '<button class="link" id="mreset">إلغاء التصفية</button>' : ''}</div><div id="mlist"></div>`;
  $('#mq', body).oninput = (e) => { f.q = e.target.value; drawList(); };
  $('#mcol', body).onclick = () => { E.open = !E.open; $('#mstrip', body).hidden = !E.open; $('#mcol', body).innerHTML = fi(E.open ? 'chev_up' : 'chev_dn'); };
  if ($('#mreset', body)) $('#mreset', body).onclick = () => { E.st = []; E.dept = ''; again(); };
  S.pg = {
    search: () => { E.find = !E.find; const s = $('.msearch', body); s.hidden = !E.find; if (E.find) $('#mq', body).focus(); else { f.q = ''; $('#mq', body).value = ''; drawList(); } },
    filter: () => {
      const depts = [...new Set(people.map((u) => u.department).filter(Boolean))];
      const o = modal(`<h3>تصفية الموظفين</h3><div class="grid"><div><div class="muted small" style="margin-bottom:6px;font-weight:600">الحالة</div><div class="fchips">${Object.entries(EM_ST).map(([k, v]) => `<label class="fc"><input type="checkbox" value="${k}" ${E.st.includes(k) ? 'checked' : ''}><span>${v[0]}</span></label>`).join('')}</div></div>
        <label class="f">القسم<select id="fd"><option value="">كل الأقسام</option>${depts.map((x) => `<option ${x === E.dept ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label></div>
        <div class="actions"><button class="btn alt" id="fre">إعادة تعيين</button><button class="btn" id="fok">تطبيق</button></div>`);
      $('#fre', o).onclick = () => { E.st = []; E.dept = ''; o.close(); again(); };
      $('#fok', o).onclick = () => { E.st = [...o.querySelectorAll('.fchips input:checked')].map((x) => x.value); E.dept = $('#fd', o).value; o.close(); again(); };
    },
  };
  drawHead(); load();
  if (!S.scheds && (has('settings.manage'))) api('/config/schedule').then((x) => { S.scheds = scheds = x; drawList(); }).catch(() => { S.scheds = []; });
}
