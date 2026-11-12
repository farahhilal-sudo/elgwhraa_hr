'use strict';
/* pages/dashboard.js — صفحة «لوحة المعلومات» (الويب): كروت اليوم والرسوم والتوفير والجزاءات */

/* --- لوحة المعلومات (على شكل الشاشات المرجعية) --- */
const DSVG = {
  users: '<svg viewBox="0 0 32 32"><circle cx="11" cy="10" r="4.5" fill="#38bdf8"/><circle cx="22" cy="12" r="4.5" fill="#0ea5e9"/><circle cx="12" cy="22" r="4.5" fill="#0ea5e9"/><circle cx="23" cy="23" r="3.5" fill="#7dd3fc"/></svg>',
  present: '<svg viewBox="0 0 32 32"><circle cx="16" cy="18" r="11" fill="#86efac"/><circle cx="16" cy="18" r="8" fill="#fff" opacity=".55"/><path d="M13 4h6M16 4v3M12.5 18.5l2.5 2.5 5-5.5" stroke="#16a34a" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  late: '<svg viewBox="0 0 32 32"><circle cx="16" cy="18" r="11" fill="#fecaca"/><path d="M4 9l5-4M28 9l-5-4" stroke="#ef4444" stroke-width="3" stroke-linecap="round"/><path d="M16 12v6l4 2" stroke="#dc2626" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>',
  absent: '<svg viewBox="0 0 32 32"><circle cx="16" cy="9" r="6" fill="#f87171"/><path d="M5 28c0-7 5-11 11-11s11 4 11 11z" fill="#fca5a5"/><rect x="11" y="21" width="10" height="3" rx="1.5" fill="#dc2626"/></svg>',
  not_yet: '<svg viewBox="0 0 32 32"><path d="M8 4h16M8 28h16" stroke="#d97706" stroke-width="3" stroke-linecap="round"/><path d="M10 4c0 7 6 8 6 12s-6 5-6 12h12c0-7-6-8-6-12s6-5 6-12z" fill="#fdba74" stroke="#d97706" stroke-width="1.5"/></svg>',
  leave: '<svg viewBox="0 0 32 32"><circle cx="19" cy="6" r="3.5" fill="#38bdf8"/><path d="M17 12l-5 6 3 3-3 7M17 12l5 5 5-1M15 21l5 7" stroke="#0ea5e9" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18M9 15.5l2 2 4-4"/></svg>',
};
const DASH_WN = { att: 'سجل الحضور', req: 'الطلبات الشهرية', hour: 'الحضور بالساعة', sav: 'التوفير', ot: 'الوقت الإضافي', hrs: 'ساعات العمل لكل قسم', pen: 'الجزاءات', bon: 'المكافآت / الخصومات', leg: 'حضور اليوم (التفصيل)' };
const monthStart = (d = todayStr()) => d.slice(0, 7) + '-01';
const monthEnd = (d = todayStr()) => { const [y, m] = d.split('-').map(Number); return `${d.slice(0, 7)}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };
const yearAgo = () => { const t = todayStr(); return `${Number(t.slice(0, 4)) - 1}${t.slice(4)}`; };
const monthsBetween = (a, b) => { const out = []; let [y, m] = a.slice(0, 7).split('-').map(Number); const [y2, m2] = b.slice(0, 7).split('-').map(Number); while (y < y2 || (y === y2 && m <= m2)) { out.push(`${y}-${String(m).padStart(2, '0')}`); if (++m > 12) { m = 1; y++; } } return out; };
const hrs2 = (min) => (min / 60).toFixed(2);

/* رسوم SVG بسيطة */
const niceMax = (m) => { if (!(m > 0)) return 4; const e = 10 ** Math.floor(Math.log10(m)), f = m / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 4 ? 4 : f <= 5 ? 5 : 10) * e; };
const smoothPath = (pts, base) => {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, Math.min(base, p1[1] + (p2[1] - p0[1]) / 6)], c2 = [p2[0] - (p3[0] - p1[0]) / 6, Math.min(base, p2[1] - (p3[1] - p1[1]) / 6)];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
};
const chartFrame = (W, H, padL, padT, base, max, fmt = (v) => v) => [0, 1, 2, 3, 4].map((i) => {
  const y = base - (i / 4) * (base - padT);
  return `<line x1="${padL}" x2="${W - 10}" y1="${y}" y2="${y}" stroke="#e5e9ee" stroke-dasharray="${i ? '4 4' : '0'}"/><text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10.5" fill="#6b7280">${fmt((max * i) / 4)}</text>`;
}).join('');
const legendHtml = (series) => `<div class="lgd">${series.map((s) => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('')}</div>`;
function lineChart(labels, series, o = {}) {
  const H = o.h || 300, padL = 46, padT = 16, padB = 36, base = H - padB, n = labels.length;
  const step = Math.max(o.step || 74, ((o.minW || 700) - padL - 40) / Math.max(1, n - 1)), W = padL + 30 + step * Math.max(1, n - 1) + 30;
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.data))), X = (i) => padL + 30 + i * step, Y = (v) => base - (v / max) * (base - padT);
  return `<div class="chscroll"><svg class="chart" viewBox="0 0 ${W} ${H}" style="width:${W}px;min-width:100%;height:${H}px" role="img">${chartFrame(W, H, padL, padT, base, max, (v) => +v.toFixed(2))}
    ${series.map((s) => { const pts = s.data.map((v, i) => [X(i), Y(v)]); return `<path d="${smoothPath(pts, base)}" fill="none" stroke="${s.color}" stroke-width="3" stroke-linecap="round"/>${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.6" fill="#fff" stroke="${s.color}" stroke-width="2"><title>${s.name}: ${s.data[i]} (${labels[i]})</title></circle>`).join('')}`; }).join('')}
    ${labels.map((l, i) => `<text x="${X(i)}" y="${base + 22}" text-anchor="middle" font-size="11" fill="#374151">${l}</text>`).join('')}<line x1="${padL}" x2="${W - 10}" y1="${base + 30}" y2="${base + 30}" stroke="#374151" stroke-width="2.5" opacity=".0"/></svg></div>`;
}
function barChart(labels, series, o = {}) {
  const H = o.h || 320, padL = 50, padT = 14, padB = o.rot ? 70 : 36, base = H - padB, n = labels.length;
  const step = Math.max(o.step || 56, ((o.minW || 520) - padL - 20) / Math.max(1, n)), W = padL + 20 + step * n;
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.data))), bw = Math.min(20, (step - 14) / series.length), Y = (v) => base - (v / max) * (base - padT);
  return `<div class="chscroll"><svg class="chart" viewBox="0 0 ${W} ${H}" style="width:${W}px;min-width:100%;height:${H}px" role="img">${chartFrame(W, H, padL, padT, base, max, (v) => +v.toFixed(2))}
    ${labels.map((l, i) => { const cx = padL + 10 + step * i + step / 2; return `${series.map((s, k) => { const v = s.data[i] || 0, x = cx - (series.length * bw) / 2 + k * bw + 1, h = base - Y(v); return h > 0 ? `<rect x="${x}" y="${Y(v)}" width="${bw - 2}" height="${h}" rx="3" fill="${s.color}"><title>${s.name}: ${+v.toFixed(2)} (${l})</title></rect>` : ''; }).join('')}
      <text ${o.rot ? `transform="rotate(-35 ${cx} ${base + 16})" text-anchor="end"` : 'text-anchor="middle"'} x="${cx}" y="${base + 16}" font-size="11" fill="#374151">${esc(l)}</text>`; }).join('')}</svg></div>`;
}
const gcard = (cls, big, unit, label, val, ic) => `<div class="gc ${cls}"><div class="gct"><div class="gbig"><b>${big}</b> <span>${unit}</span></div><i class="gi">${ico(ic || 'chev', ic ? '' : 'rotm90')}</i></div><div class="gcl">${label}${val !== undefined ? ` <b>${val}</b>` : ''}</div><div class="gbar"></div></div>`;

PAGES.dashboard = async (view) => {
  if (IS_APP) return appDashboard(view);
  view.innerHTML = '<div class="empty"><span class="spin"></span></div>';
  const [d0, locs] = await Promise.all([api('/dashboard'), api('/locations').catch(() => [])]);
  const uniq = (a) => [...new Set(a.filter(Boolean))].sort();
  const OPT = { office: ['building', 'جميع المكاتب', locs.map((l) => [l.id, l.name])], dept: ['building', 'جميع الأقسام', uniq(d0.list.map((x) => x.department))], job: ['users', 'جميع المناصب', uniq(d0.list.map((x) => x.job_title))] };
  let hidden = []; try { hidden = JSON.parse(localStorage.getItem('dash_hide') || '[]'); } catch { /* تجاهل */ }
  const G = S.dashG = S.dashG || { office: '', dept: '', job: '' };
  const selHtml = (k, v, kk) => { const [ic, ph, arr] = kk || OPT[k]; return `<label class="sel2 ${v ? '' : 'ph'}">${ico(ic)}<select data-k="${k}"><option value="">${ph}</option>${arr.map((x) => { const val = Array.isArray(x) ? x[0] : x, l = Array.isArray(x) ? x[1] : x; return `<option value="${esc(val)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select></label>`; };
  const dateHtml = (k, v) => `<label class="dt">${ico('calendar')}<input type="date" data-k="${k}" value="${v}"></label>`;

  view.innerHTML = `<div class="dhead"><h2>لوحة المعلومات</h2><button class="sqb" id="dcust" title="تخصيص اللوحة">${ico('menu')}</button>
      <div class="dgf">${['office', 'dept', 'job'].map((k) => selHtml(k, G[k])).join('')}</div></div>
    <div class="dstats" id="dstats"></div><div id="dmiss"></div>
    ${['att', 'req', 'hour', 'sav'].map((id) => `<div id="w-${id}" ${hidden.includes(id) ? 'hidden' : ''}></div>`).join('')}
    <div class="grid dg2 drow"><div id="w-ot" ${hidden.includes('ot') ? 'hidden' : ''}></div><div id="w-hrs" ${hidden.includes('hrs') ? 'hidden' : ''}></div></div>
    <div class="grid dg2 drow"><div id="w-pen" ${hidden.includes('pen') ? 'hidden' : ''}></div><div id="w-bon" ${hidden.includes('bon') ? 'hidden' : ''}></div></div>
    <div id="dleg" ${hidden.includes('leg') ? 'hidden' : ''}></div>`;


  /* --- اللي كان في اللوحة القديمة (توزيع الحضور اليوم + جدول الحضور) — محفوظ زي ما هو --- */
  const drawLegacy = (d) => {
    const SL = { present: ['في الموعد', 'b-ok', '#15803d'], late: ['متأخر', 'b-warn', '#d97706'], absent: ['غائب', 'b-bad', '#dc2626'], leave: ['إجازة', 'b-info', '#2563eb'], not_yet: ['لم يسجّل بعد', '', '#94a3b8'], off: ['عطلة', '', '#cbd5e1'] };
    $('#dleg', view).innerHTML = `<div class="card" style="margin-top:16px"><h3 style="margin-bottom:10px">توزيع الحضور اليوم <span class="muted small">${fmtDate(d.date)}</span></h3>
      <div class="bar">${['present', 'late', 'absent', 'leave', 'not_yet', 'off'].map((k) => (d[k] ? `<i style="width:${(d[k] / Math.max(1, d.total)) * 100}%;background:${SL[k][2]}"></i>` : '')).join('')}</div>
      <div class="legend">${['present', 'late', 'absent', 'leave', 'not_yet'].map((k) => `<span style="--c:${SL[k][2]}">${SL[k][0]} (${d[k]})</span>`).join('')}</div></div>
    <div class="tablewrap" style="margin-top:12px"><table><tr><th>الموظف</th><th>الحالة</th><th>حضور</th><th>انصراف</th><th>تأخير</th></tr>
    ${d.list.map((x) => `<tr><td><b>${esc(x.name)}</b> <span class="muted small">${esc(x.job_title || '')}</span></td><td><span class="badge ${SL[x.status][1]}">${SL[x.status][0]}</span></td><td>${fmtTime(x.check_in)}</td><td>${fmtTime(x.check_out)}</td><td>${x.late_minutes ? x.late_minutes + ' د' : '—'}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">لا يوجد موظفون</td></tr>'}</table></div>`;
  };

  /* --- بطاقات اليوم --- */
  const drawStats = async () => {
    const q = new URLSearchParams(Object.entries(G).filter(([, v]) => v));
    const d = await api('/dashboard?' + q);
    const go2 = (st) => { if (st && st[0] === '@') { go(st === '@requests' && !has('requests.view_all') ? 'me' : st.slice(1)); return; } S.empf = st ? { st: [st], activeOnly: true } : null; S.emptab = 'list'; go('employees'); };
    const C = [['الموظفون', d.total, 'users', ''], ['في الموعد', d.present, 'present', 'present'], ['متأخر', d.late, 'late', 'late'], ['غائب', d.absent, 'absent', 'absent'], ['لم يسجل الحضور', d.not_yet, 'not_yet', 'not_yet'], ['إجازة', d.leave, 'leave', 'leave'], ['طلبات معلّقة', d.pending_requests, 'leave', '@requests'], ['بدون بصمة وجه', d.missing_face, 'absent', '@employees']];
    $('#dstats', view).innerHTML = C.map(([l, n, ic, st], i) => `<div class="card dsc"><div class="dsh"><span>${l}</span><i class="dsi">${DSVG[ic]}</i></div><b>${n}</b>${n > 0 && has('employees.view') ? `<button class="link" data-go="${i}">عرض الكل</button>` : ''}</div>`).join('');
    view.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go2(C[Number(b.dataset.go)][3])));
    drawLegacy(d);
    $('#dmiss', view).innerHTML = `<div class="card dmiss"><div class="dwh"><h3>موظفون بجداول ناقصة</h3><i class="dsq">${DSVG.cal}</i></div>
      ${d.no_schedule ? `<div class="dmrow warn"><i class="dsq warn">${DSVG.cal}</i><div><b>${d.no_schedule} موظف بدون موعد عمل</b><span>حددي الوردية من بيانات الموظف</span></div></div>`
        : `<div class="dmrow"><i class="dsq ok">${DSVG.cal}</i><div><b>جميع الموظفين لديهم جدول اليوم</b><span>لا يلزم اتخاذ إجراء الآن</span></div></div>`}</div>`;
  };
  view.querySelectorAll('.dgf [data-k]').forEach((el) => (el.onchange = () => { G[el.dataset.k] = el.value; el.closest('.sel2').classList.toggle('ph', !el.value); drawStats().catch((e) => toast(e.message, true)); }));
  $('#dcust', view).onclick = (e) => popMenu(e.currentTarget, Object.entries(DASH_WN).map(([id, l]) => ({ ic: hidden.includes(id) ? 'plus' : 'check', t: l, fn: () => { hidden = hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id]; try { localStorage.setItem('dash_hide', JSON.stringify(hidden)); } catch { /* تجاهل */ } PAGES.dashboard(view); } })));

  /* --- إطار الكروت: فلاتر + تبديل مخطط/جدول + تحميل مستقل لكل كارت --- */
  const widget = (cfg) => {
    const root = $('#w-' + cfg.id, view), s = { office: '', dept: '', job: '', mode: cfg.mode || 'chart', ...cfg.state };
    const fl = cfg.filters.map((k) => (k === 'from' || k === 'to' ? dateHtml(k, s[k]) : k === 'type' ? selHtml(k, s[k], ['file', 'تحديد خيار', Object.entries(TYPES())]) : k === 'cur' ? '<label class="sel2"><select disabled><option>جنيه مصري</option></select></label>' : selHtml(k, s[k])));
    const lab = (k) => ({ from: 'من تاريخ', to: 'إلى تاريخ', office: 'المكتب', dept: 'القسم', job: 'المنصب', type: 'نوع الطلب' }[k]);
    root.innerHTML = `<div class="card dw"><div class="dwh"><h3>${cfg.title}</h3><span class="dwhead"></span><span class="grow"></span>${cfg.top || ''}${cfg.toggle ? `<label class="tg"><span>مخطط</span><input type="checkbox" ${s.mode === 'table' ? 'checked' : ''}><i></i><span>جدول</span></label>` : ''}</div>
      <div class="dwf ${cfg.fcls || ''}">${fl.map((h, i) => (cfg.labels ? `<div class="fl"><small>${lab(cfg.filters[i])}</small>${h}</div>` : h)).join('')}</div><div class="dwb"><div class="empty"><span class="spin"></span></div></div></div>`;
    let data = null;
    const paint = () => {
      const body = $('.dwb', root);
      body.innerHTML = cfg.render(data, s);
      $('.dwhead', root).innerHTML = cfg.head ? cfg.head(data, s) : '';
      if (cfg.after) cfg.after(body, data, s, root);
      const sc = body.querySelector('.chscroll'); if (sc && cfg.endScroll) sc.scrollLeft = sc.scrollWidth;
    };
    const load = async () => {
      const q = new URLSearchParams(cfg.filters.filter((k) => s[k]).map((k) => [k, s[k]]));
      try { data = await cfg.fetch(q); paint(); } catch (e) { $('.dwb', root).innerHTML = `<div class="empty neg">${esc(e.message)}</div>`; }
    };
    root.querySelectorAll('[data-k]').forEach((el) => (el.onchange = () => { s[el.dataset.k] = el.value; const w = el.closest('.sel2'); if (w) w.classList.toggle('ph', !el.value); load(); }));
    const tg = root.querySelector('.tg input'); if (tg) tg.onchange = () => { s.mode = tg.checked ? 'table' : 'chart'; if (data) paint(); };
    load();
  };
  const T = (heads, rows, cls = '') => `<div class="tablewrap st ${cls}"><table><thead><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${heads.length}" class="empty">لا توجد بيانات</td></tr>`}</tbody></table></div>`;
  const byDept = (users) => { const m = {}; users.forEach((u) => { const k = u.department || 'بدون قسم'; (m[k] = m[k] || []).push(u); }); return Object.entries(m); };
  const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);
  const aggFetch = (q) => api('/dash/agg?' + q);

  widget({ id: 'att', title: 'سجل الحضور', filters: ['office', 'dept', 'job', 'from', 'to'], state: { from: monthStart(), to: monthEnd() }, endScroll: true,
    fetch: (q) => api('/dash/daily?' + q),
    head: () => legendHtml([{ name: 'في الموعد', color: '#16a34a' }, { name: 'متأخر', color: '#ef4444' }, { name: 'غائب', color: '#facc15' }]),
    render: (d) => lineChart(d.days.map((x) => new Date(x.date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: '2-digit', timeZone: 'UTC' })), [
      { name: 'في الموعد', color: '#16a34a', data: d.days.map((x) => x.present) }, { name: 'متأخر', color: '#ef4444', data: d.days.map((x) => x.late) }, { name: 'غائب', color: '#facc15', data: d.days.map((x) => x.absent) }], { minW: 1000 }) });

  widget({ id: 'req', title: 'الطلبات الشهرية', toggle: true, mode: 'table', labels: true, fcls: 'six', filters: ['from', 'to', 'office', 'dept', 'job', 'type'], state: { from: monthStart(), to: monthEnd() },
    fetch: (q) => api('/dash/requests?' + q),
    head: (d) => `<span class="drchips"><em class="drc b">الإجمالي: ${d.totals.total}</em><em class="drc w">قيد الانتظار: ${d.totals.pending}</em><em class="drc g">مقبولة: ${d.totals.approved}</em><em class="drc r">مرفوضة: ${d.totals.rejected}</em></span>`,
    render: (d, s) => {
      if (s.mode === 'chart') return barChart(d.rows.map((r) => r.label), [{ name: 'قيد الانتظار', color: '#f59e0b', data: d.rows.map((r) => r.pending) }, { name: 'مقبولة', color: '#22c55e', data: d.rows.map((r) => r.approved) }, { name: 'مرفوضة', color: '#ef4444', data: d.rows.map((r) => r.rejected) }], { minW: 800, rot: true });
      const tb = (rows) => `<table class="drq"><thead><tr><th class="c-name">نوع الطلب</th><th class="c-t">${ico('menu')} الإجمالي</th><th class="c-p">${ico('clock')} قيد الانتظار</th><th class="c-a">${ico('check')} مقبولة</th><th class="c-r">✕ مرفوضة</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td class="c-name">${r.total ? `<a class="dlk" data-lk="1">${esc(r.label)} <i>›</i></a>` : `<span>${esc(r.label)}</span>`}<em class="dico">${ico('file')}</em></td><td class="c-t">${r.total}</td><td class="c-p">${r.pending}</td><td class="c-a">${r.approved}</td><td class="c-r">${r.rejected}</td></tr>`).join('')}</tbody></table>`;
      const h = Math.ceil(d.rows.length / 2);
      return `<div class="dqwrap">${tb(d.rows.slice(0, h))}${tb(d.rows.slice(h))}</div>`;
    },
    after: (body) => body.querySelectorAll('[data-lk]').forEach((a) => (a.onclick = () => go(has('requests.view_all') ? 'requests' : 'me'))) });

  widget({ id: 'hour', title: 'الحضور بالساعة', toggle: true, filters: ['office', 'dept', 'job', 'from', 'to'], state: { from: monthStart(), to: monthEnd() },
    fetch: (q) => api('/dash/hourly?' + q), head: () => legendHtml([{ name: 'حضور', color: '#16a34a' }, { name: 'انصراف', color: '#ef4444' }]),
    render: (d, s) => {
      const labels = d.in.map((_, h) => String(h).padStart(2, '0') + ':00');
      return s.mode === 'table' ? T(['الساعة', 'تسجيلات الحضور', 'تسجيلات الانصراف'], labels.map((l, h) => [l, d.in[h], d.out[h]]).filter((r) => r[1] || r[2]))
        : lineChart(labels, [{ name: 'حضور', color: '#16a34a', data: d.in }, { name: 'انصراف', color: '#ef4444', data: d.out }], { minW: 1000, step: 46 });
    } });

  widget({ id: 'sav', title: 'التوفير', filters: ['office', 'dept', 'job', 'cur', 'from', 'to'], state: { from: monthStart(), to: monthEnd() }, fetch: aggFetch,
    top: exportCsvBtn('sexp'),
    head: (d) => `<b class="bl">${money(sum(d.users, (u) => u.absence_deduction + u.late_deduction))}</b> <span class="curl">${esc(d.currency === 'EGP' ? 'جنيه مصري' : d.currency)}</span>`,
    render: (d) => {
      const U = d.users, n = U.length, cur = d.currency === 'EGP' ? 'جنيه مصري' : d.currency;
      const days = sum(U, (u) => u.absent_days), lateH = sum(U, (u) => u.late_minutes) / 60, otH = sum(U, (u) => u.overtime_minutes) / 60;
      return `<div class="ssec"><div class="sh"><b>يتم إدارته داخليًا</b><span>الموظف <b class="bl">${n}</b></span></div><div class="dash3">
        ${gcard('g-blue', money(sum(U, (u) => u.absence_deduction)), cur, 'العقوبات بالأيام', days.toFixed(2))}${gcard('g-green', money(sum(U, (u) => u.late_deduction)), cur, 'العقوبات بالساعات', lateH.toFixed(2))}${gcard('g-purple', money(sum(U, (u) => u.overtime_pay)), cur, 'فرق ساعات العمل الإضافي', otH.toFixed(2))}</div></div>
        <div class="ssec"><div class="sh"><b>آلة حاسبة مُدارة خارجيًا</b><span>الموظف <input type="number" min="0" id="xn" value="0" class="mini"></span></div><div class="dash3x">
        <div class="calc"><label>متوسط أيام العقوبة<div class="pf"><span>${cur}</span><input type="number" min="0" step="0.01" id="xd"></div></label><div id="xc1"></div></div>
        <div class="calc"><label>متوسط ساعات العقوبة<div class="pf"><span>${cur}</span><input type="number" min="0" step="0.01" id="xh"></div></label><div id="xc2"></div></div>
        <div class="calc"><label>متوسط ساعات العمل الإضافي<div class="pf"><span>${cur}</span><input type="number" min="0" step="0.01" id="xo"></div></label><div id="xc3"></div></div></div></div>`;
    },
    after: (body, d, s, root) => {
      const U = d.users, n = Math.max(1, U.length), cur = d.currency === 'EGP' ? 'جنيه مصري' : d.currency;
      const avg = { days: sum(U, (u) => u.absent_days) / n, lateH: sum(U, (u) => u.late_minutes) / 60 / n, otH: sum(U, (u) => u.overtime_minutes) / 60 / n };
      const calc = () => {
        const k = Number($('#xn', body).value) || 0, v = (id) => Number($(id, body).value) || 0;
        $('#xc1', body).innerHTML = gcard('g-red', money(avg.days * k * v('#xd')), cur, 'العقوبات بالأيام', (avg.days * k).toFixed(2));
        $('#xc2', body).innerHTML = gcard('g-pink', money(avg.lateH * k * v('#xh')), cur, 'العقوبات بالساعات', (avg.lateH * k).toFixed(2));
        $('#xc3', body).innerHTML = gcard('g-orange', money(avg.otH * k * v('#xo')), cur, 'فرق ساعات العمل الإضافي', (avg.otH * k).toFixed(2));
      };
      body.querySelectorAll('input').forEach((i) => (i.oninput = calc)); calc();
      $('#sexp', root).onclick = () => csv('savings.csv', [['الموظف', 'القسم', 'أيام الغياب', 'خصم الغياب', 'دقائق التأخير', 'خصم التأخير', 'دقائق الإضافي', 'قيمة الإضافي'], ...U.map((u) => [u.name, u.department, u.absent_days, u.absence_deduction, u.late_minutes, u.late_deduction, u.overtime_minutes, u.overtime_pay])]);
    } });

  widget({ id: 'ot', title: 'الوقت الإضافي', toggle: true, mode: 'table', filters: ['office', 'dept', 'job', 'from', 'to'], state: { from: monthStart(), to: monthEnd() }, fetch: aggFetch,
    render: (d, s) => {
      const U = d.users, cur = d.currency === 'EGP' ? 'جنيه مصري' : d.currency, g = byDept(U);
      if (s.mode === 'chart') return barChart(g.map(([k]) => k), [{ name: 'ساعات إضافي', color: '#f59e0b', data: g.map(([, a]) => +hrs2(sum(a, (u) => u.overtime_minutes))) }], { rot: true, minW: 420 });
      return `<div class="gstack">${gcard('g-orange', hrs2(sum(U, (u) => u.overtime_minutes)), 'ساعات', 'إجمالي ساعات الإضافي', U.filter((u) => u.overtime_minutes).length + ' موظف', 'clock')}${gcard('g-lime', money(sum(U, (u) => u.overtime_pay)), cur, 'قيمة الإضافي (حسب سياسة الإضافي)', undefined, 'dollar')}</div>`
        + T(['الموظف', 'دقائق إضافي', 'القيمة'], U.filter((u) => u.overtime_minutes).sort((a, b) => b.overtime_minutes - a.overtime_minutes).slice(0, 8).map((u) => [esc(u.name), u.overtime_minutes, money(u.overtime_pay)]));
    } });

  widget({ id: 'hrs', title: 'ساعات العمل لكل قسم', toggle: true, filters: ['office', 'dept', 'job'], fcls: 'two', fetch: aggFetch,
    render: (d, s) => {
      const g = byDept(d.users);
      return s.mode === 'table' ? T(['القسم', 'عدد الموظفين', 'ساعات العمل'], g.map(([k, a]) => [esc(k), a.length, hrs2(sum(a, (u) => u.worked_minutes))]))
        : barChart(g.map(([k]) => k), [{ name: 'ساعات العمل', color: '#0ea5e9', data: g.map(([, a]) => +hrs2(sum(a, (u) => u.worked_minutes))) }], { rot: true, minW: 420 });
    } });

  widget({ id: 'pen', title: 'الجزاءات', toggle: true, mode: 'table', filters: ['office', 'dept', 'job', 'from', 'to'], fcls: 'two', state: { from: monthStart(), to: monthEnd() }, fetch: aggFetch,
    render: (d, s) => {
      const U = d.users, fixed = sum(d.adj.filter((a) => a.kind === 'penalty'), (a) => a.amount), g = byDept(U);
      if (s.mode === 'chart') return barChart(g.map(([k]) => k), [{ name: 'ساعات تأخير', color: '#d946ef', data: g.map(([, a]) => +hrs2(sum(a, (x) => x.late_minutes))) }, { name: 'أيام غياب', color: '#ef4444', data: g.map(([, a]) => sum(a, (x) => x.absent_days)) }], { rot: true, minW: 420 });
      return `<div class="gpen">${gcard('g-red', sum(U, (u) => u.absent_days).toFixed(2), 'الأيام', 'إجمالي العقوبات كأيام', undefined, 'calendar')}${gcard('g-magenta', hrs2(sum(U, (u) => u.late_minutes)), 'ساعات', 'إجمالي العقوبات كساعات', undefined, 'clock')}${gcard('g-lime', money(fixed), 'ثابتة', 'إجمالي العقوبات كقيمة ثابتة', undefined, 'dollar')}</div>`;
    } });

  widget({ id: 'bon', title: 'المكافآت / الخصومات', toggle: true, filters: ['office', 'dept', 'job', 'from', 'to'], fcls: 'two', state: { from: yearAgo(), to: todayStr() }, fetch: aggFetch,
    render: (d, s) => {
      const ms = monthsBetween(s.from, s.to), val = (m, ks) => sum(d.adj.filter((a) => a.month === m && ks.includes(a.kind)), (a) => a.amount);
      const lab = ms.map((m) => `${m.slice(5)}-${m.slice(0, 4)}`), bon = ms.map((m) => val(m, ['bonus'])), ded = ms.map((m) => val(m, ['deduction', 'penalty']));
      return s.mode === 'table' ? T(['الشهر', 'المكافآت', 'الخصومات'], lab.map((l, i) => [l, money(bon[i]), money(ded[i])]))
        : legendHtml([{ name: 'مكافآت', color: '#0ea5e9' }, { name: 'خصومات', color: '#f43f5e' }]) + barChart(lab, [{ name: 'خصومات', color: '#f43f5e', data: ded }, { name: 'مكافآت', color: '#0ea5e9', data: bon }], { rot: true, minW: 520 });
    } });

  drawStats().catch((e) => toast(e.message, true));
};
