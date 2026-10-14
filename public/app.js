'use strict';
/* ====== أدوات ====== */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { token: localStorage.getItem('tk'), me: null, meta: null, page: 'home', navOpen: false };
const TZ = 'Africa/Cairo';
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '—');
const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'short', day: 'numeric', month: 'short' }) : '—');
const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thisMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ }).slice(0, 7);
const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const has = (p) => !!(S.me && S.me.user && (S.me.user.is_admin || S.me.user.permissions.includes(p)));
const TYPES = () => (S.meta ? S.meta.request_types : {});
const STATUS_AR = { pending: ['قيد الانتظار', 'b-warn'], approved: ['مقبول', 'b-ok'], rejected: ['مرفوض', 'b-bad'] };

function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3500);
}
async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, {
    method, headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && S.token) { logout(true); throw new Error(data.error || 'انتهت الجلسة'); }
  if (!r.ok) throw new Error(data.error || 'حدث خطأ');
  return data;
}
async function run(btn, fn) {
  if (btn) btn.disabled = true;
  try { await fn(); } catch (e) { toast(e.message, true); } finally { if (btn) btn.disabled = false; }
}
function modal(html, onMount) {
  const o = document.createElement('div');
  o.className = 'overlay';
  o.innerHTML = `<div class="modal">${html}</div>`;
  o.addEventListener('mousedown', (e) => { if (e.target === o && !o.dataset.lock) close(); });
  const close = () => { o.remove(); if (o.onclose) o.onclose(); };
  document.body.appendChild(o);
  o.close = close;
  o.querySelectorAll('[data-close]').forEach((b) => (b.onclick = close));
  if (onMount) onMount(o);
  return o;
}
function csv(filename, rows) {
  const body = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }));
  a.download = filename; a.click();
}
const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');

/* ====== الوجه والموقع ====== */
const FACE_CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13';
let faceReady = null;
function loadFace() {
  if (faceReady) return faceReady;
  faceReady = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = FACE_CDN + '/dist/face-api.js';
    s.onload = async () => {
      try {
        const M = FACE_CDN + '/model/';
        await faceapi.nets.tinyFaceDetector.loadFromUri(M);
        await faceapi.nets.faceLandmark68Net.loadFromUri(M);
        await faceapi.nets.faceRecognitionNet.loadFromUri(M);
        resolve();
      } catch (e) { reject(e); }
    };
    s.onerror = () => reject(new Error('تعذّر تحميل نظام التعرّف على الوجه، تأكدي من الإنترنت'));
    document.head.appendChild(s);
  }).catch((e) => { faceReady = null; throw e; });
  return faceReady;
}
const dist = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));
/** يفتح الكاميرا ويرجّع بصمة الوجه (متوسط 3 لقطات). */
function captureFace(title) {
  return new Promise((resolve, reject) => {
    let stream, done = false;
    const o = modal(`<h3>${esc(title)}</h3>
      <div class="cam"><video playsinline muted autoplay></video><div class="ring"></div></div>
      <p class="status" id="fst"><span class="spin"></span> جارٍ تجهيز الكاميرا...</p>
      <div class="actions"><button class="btn alt" data-close>إلغاء</button><button class="btn" id="fgo" disabled>التقاط</button></div>`);
    o.dataset.lock = '1';
    const stop = () => { if (stream) stream.getTracks().forEach((t) => t.stop()); };
    o.onclose = () => { stop(); if (!done) reject(new Error('تم الإلغاء')); };
    const st = (t) => ($('#fst', o).innerHTML = t);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('المتصفح لا يدعم الكاميرا (تأكدي من استخدام رابط https)');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
        const v = $('video', o); v.srcObject = stream; await v.play();
        await loadFace();
        st('ضعي وجهك داخل الدائرة ثم اضغطي التقاط');
        $('#fgo', o).disabled = false;
        $('#fgo', o).onclick = async () => {
          const btn = $('#fgo', o); btn.disabled = true;
          try {
            const ds = [];
            for (let i = 0; i < 3; i++) {
              st(`<span class="spin"></span> جارٍ التقاط الوجه (${i + 1}/3)... ثبّتي وجهك`);
              let d = null;
              for (let tries = 0; tries < 6 && !d; tries++) {
                d = await faceapi.detectSingleFace(v, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })).withFaceLandmarks().withFaceDescriptor();
                if (!d) await new Promise((r) => setTimeout(r, 300));
              }
              if (!d) throw new Error('مش لاقي وجه واضح، قرّبي وزوّدي الإضاءة');
              ds.push(Array.from(d.descriptor));
              await new Promise((r) => setTimeout(r, 350));
            }
            if (dist(ds[0], ds[1]) > 0.45 || dist(ds[0], ds[2]) > 0.45) throw new Error('الوجه اتحرك كتير، حاولي تاني وانتِ ثابتة');
            const avg = ds[0].map((_, i) => (ds[0][i] + ds[1][i] + ds[2][i]) / 3);
            done = true; stop(); o.remove(); resolve(avg);
          } catch (e) { st(`<span class="neg">${esc(e.message)}</span>`); btn.disabled = false; }
        };
      } catch (e) {
        st(`<span class="neg">${esc(e.name === 'NotAllowedError' ? 'لازم تسمحي بالكاميرا من إعدادات المتصفح' : e.message)}</span>`);
      }
    })();
  });
}
function getPos() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('المتصفح لا يدعم تحديد الموقع'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      (e) => reject(new Error(e.code === 1 ? 'لازم تسمحي بالوصول للموقع (GPS)' : 'تعذّر تحديد موقعك، فعّلي الـ GPS وحاولي تاني')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}

/* ====== الدخول والإطار العام ====== */
function logout(silent) {
  localStorage.removeItem('tk'); S.token = null; S.me = null;
  if (!silent) toast('تم تسجيل الخروج');
  renderLogin();
}
function renderLogin() {
  $('#app').innerHTML = `<div class="login"><form class="card" id="lf">
    <img class="logo" src="/icon.svg" alt="">
    <h2 style="text-align:center;margin-bottom:4px">تسجيل الدخول</h2>
    <p class="muted" style="text-align:center;margin:0 0 16px">نظام الحضور والموارد البشرية</p>
    <div class="grid">
      <label class="f">اسم المستخدم<input name="u" autocomplete="username" autocapitalize="none" required></label>
      <label class="f">كلمة المرور<input name="p" type="password" autocomplete="current-password" required></label>
      <button class="btn big" style="font-size:16px;padding:12px">دخول</button>
    </div></form></div>`;
  $('#lf').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    run($('button', f), async () => {
      const r = await api('/login', 'POST', { username: f.u.value.trim(), password: f.p.value });
      S.token = r.token; localStorage.setItem('tk', r.token);
      await boot();
    });
  };
}
const NAV = [
  ['home', '🕘', 'تسجيل الحضور', () => true],
  ['me', '👤', 'حسابي', () => true],
  ['dashboard', '📊', 'لوحة المعلومات', () => has('dashboard.view')],
  ['employees', '👥', 'الموظفون', () => has('employees.view')],
  ['attendance', '🗓️', 'سجل الحضور', () => has('attendance.view_all')],
  ['requests', '📨', 'الطلبات', () => has('requests.view_all')],
  ['payroll', '💰', 'المرتبات والخصومات', () => has('payroll.view')],
  ['reports', '📑', 'التقارير', () => has('reports.view')],
  ['permissions', '🔐', 'الصلاحيات', () => S.me.user.is_admin],
  ['settings', '⚙️', 'الإعدادات', () => has('settings.manage')],
];
function renderShell() {
  const items = NAV.filter((n) => n[3]());
  if (!items.find((n) => n[0] === S.page)) S.page = 'home';
  $('#app').innerHTML = `<div class="shell">
    <aside class="side ${S.navOpen ? 'open' : ''}">
      <div class="brand"><img src="/icon.svg" alt=""><span>${esc(S.me.settings.company_name)}</span></div>
      <nav class="nav">${items.map((n) => `<button data-p="${n[0]}" class="${n[0] === S.page ? 'on' : ''}"><span class="ic">${n[1]}</span>${n[2]}</button>`).join('')}</nav>
      <div style="margin-top:18px"><button class="btn alt sm" id="pw" style="width:100%">تغيير كلمة المرور</button>
      <button class="btn alt sm" id="lo" style="width:100%;margin-top:8px">تسجيل الخروج</button></div>
    </aside>
    <div class="main">
      <header class="top"><button class="iconbtn burger" id="bg">☰</button>
        <div class="grow">${esc(S.me.user.name)}</div>
        <button class="iconbtn" id="bell">🔔${S.me.unread ? `<span class="dot">${S.me.unread}</span>` : ''}</button></header>
      <main class="content" id="view"></main>
    </div></div>`;
  document.querySelectorAll('.nav button').forEach((b) => (b.onclick = () => { S.page = b.dataset.p; S.navOpen = false; renderShell(); }));
  $('#bg').onclick = () => { S.navOpen = !S.navOpen; $('.side').classList.toggle('open', S.navOpen); };
  $('#lo').onclick = () => logout();
  $('#pw').onclick = changePassword;
  $('#bell').onclick = showNotes;
  (PAGES[S.page] || PAGES.home)($('#view'));
}
async function boot() {
  try {
    if (!S.meta) S.meta = await api('/meta');
    S.me = await api('/me');
  } catch { return renderLogin(); }
  if (S.me.user.must_change) return forcePassword();
  renderShell();
}
function forcePassword() {
  $('#app').innerHTML = `<div class="login"><form class="card" id="pf">
    <h2 style="margin-bottom:6px">اختاري كلمة مرور جديدة</h2>
    <p class="muted" style="margin:0 0 14px">لازم تغيّري كلمة المرور المؤقتة قبل ما تكملي.</p>
    <div class="grid"><label class="f">كلمة المرور الجديدة (6 أحرف على الأقل)<input name="n" type="password" minlength="6" required autocomplete="new-password"></label>
    <button class="btn big" style="font-size:16px;padding:12px">حفظ ومتابعة</button></div></form></div>`;
  $('#pf').onsubmit = (e) => { e.preventDefault(); run($('button', e.target), async () => { await api('/me/password', 'POST', { new_password: e.target.n.value }); await boot(); }); };
}
function changePassword() {
  const o = modal(`<h3>تغيير كلمة المرور</h3><form class="grid" id="cp">
    <label class="f">الحالية<input name="o" type="password" required></label>
    <label class="f">الجديدة<input name="n" type="password" minlength="6" required></label>
    <div class="actions"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">حفظ</button></div></form>`);
  $('#cp', o).onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', e.target), async () => { await api('/me/password', 'POST', { old_password: e.target.o.value, new_password: e.target.n.value }); o.close(); toast('تم تغيير كلمة المرور'); }); };
}
async function showNotes() {
  const rows = await api('/notifications');
  modal(`<h3>الإشعارات</h3><div class="notes">${rows.length ? rows.map((n) => `<div class="note ${n.read ? '' : 'new'}">${esc(n.text)}<div class="muted small">${esc(n.created_at)} UTC</div></div>`).join('') : '<div class="empty">لا توجد إشعارات</div>'}</div>
    <div class="actions"><button class="btn" data-close>إغلاق</button></div>`);
  if (S.me.unread) { await api('/notifications/read', 'POST'); S.me.unread = 0; const d = $('#bell .dot'); if (d) d.remove(); }
}

/* ====== الصفحات ====== */
const PAGES = {};

/* --- تسجيل الحضور --- */
PAGES.home = async (view) => {
  const u = S.me.user;
  view.innerHTML = `<div class="page-head"><h2>تسجيل الحضور والانصراف</h2></div>
    <div class="grid g2" style="align-items:start">
      <div class="card"><div class="clock"><div class="t" id="clk">--:--:--</div><div class="d" id="cdate"></div></div>
        <div class="muted" style="text-align:center">وردية اليوم: ${esc(u.shift_start)} – ${esc(u.shift_end)}</div>
        <div id="punch" style="margin-top:16px"></div></div>
      <div class="card"><h3 style="margin-bottom:10px">اليوم</h3><div id="today"></div></div>
    </div>`;
  const tick = () => {
    const n = new Date();
    const c = $('#clk'); if (!c) return clearInterval(PAGES.home.t);
    c.textContent = n.toLocaleTimeString('en-GB', { timeZone: TZ });
    $('#cdate').textContent = n.toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
  };
  tick(); clearInterval(PAGES.home.t); PAGES.home.t = setInterval(tick, 1000);
  const draw = () => {
    const t = S.me.today;
    $('#today').innerHTML = `<div class="punchrow"><div class="cell"><span class="muted small">الحضور</span><b>${fmtTime(t?.check_in)}</b></div>
      <div class="cell"><span class="muted small">الانصراف</span><b>${fmtTime(t?.check_out)}</b></div></div>
      ${t?.late_minutes ? `<p class="small neg">تأخير ${t.late_minutes} دقيقة</p>` : ''}
      ${t?.early_minutes ? `<p class="small neg">انصراف مبكر ${t.early_minutes} دقيقة</p>` : ''}`;
    const p = $('#punch');
    if (!u.face_enrolled) {
      p.innerHTML = `<p class="small" style="background:var(--warn-l);color:var(--warn);padding:10px;border-radius:10px">لازم تسجّلي بصمة وجهك مرة واحدة قبل أول تسجيل حضور.</p>
        <button class="btn big" id="enroll">تسجيل بصمة الوجه</button>`;
      $('#enroll').onclick = (e) => run(e.target, async () => {
        const d = await captureFace('تسجيل بصمة الوجه');
        await api('/me/face', 'POST', { descriptor: d });
        toast('تم تسجيل بصمة الوجه'); await boot();
      });
    } else if (!t?.check_in) {
      p.innerHTML = `<button class="btn big ok" id="go">تسجيل حضور</button>`;
      $('#go').onclick = (e) => punch('in', e.target);
    } else if (!t.check_out) {
      p.innerHTML = `<button class="btn big bad" id="go">تسجيل انصراف</button>`;
      $('#go').onclick = (e) => punch('out', e.target);
    } else p.innerHTML = `<p class="pos" style="text-align:center;font-weight:700">✔ تم تسجيل حضورك وانصرافك اليوم</p>`;
  };
  async function punch(type, btn) {
    await run(btn, async () => {
      let pos = null;
      const needGeo = S.me.settings.work_lat !== '' && S.me.settings.work_lng !== '';
      if (needGeo) { btn.textContent = 'جارٍ تحديد موقعك...'; pos = await getPos(); }
      const d = await captureFace(type === 'in' ? 'تأكيد الوجه للحضور' : 'تأكيد الوجه للانصراف');
      await api('/attendance/punch', 'POST', { type, lat: pos?.lat, lng: pos?.lng, descriptor: d });
      toast(type === 'in' ? 'تم تسجيل الحضور ✔' : 'تم تسجيل الانصراف ✔');
      S.me = await api('/me'); draw();
    });
    if (btn.isConnected && btn.disabled === false) btn.textContent = type === 'in' ? 'تسجيل حضور' : 'تسجيل انصراف';
  }
  draw();
};

/* --- حسابي --- */
PAGES.me = async (view) => {
  const u = S.me.user;
  view.innerHTML = `<div class="page-head"><h2>حسابي</h2><button class="btn" id="newreq">+ طلب جديد</button></div>
    <div class="card emp" style="margin-bottom:12px"><div class="avatar">${esc(initials(u.name))}</div>
      <div class="info"><b>${esc(u.name)}</b><span class="muted small">${esc(u.job_title || '')} ${u.department ? '· ' + esc(u.department) : ''}</span></div>
      <span class="badge ${u.face_enrolled ? 'b-ok' : 'b-warn'}">${u.face_enrolled ? 'بصمة الوجه مسجلة' : 'بصمة الوجه غير مسجلة'}</span></div>
    <div class="grid g4" id="bal"></div>
    <div class="row" style="margin:16px 0 8px"><h3 style="flex:1">طلباتي</h3></div><div id="myreq"></div>
    <div class="row" style="margin:20px 0 8px"><h3 style="flex:1">حضوري</h3><input type="month" id="amon" value="${thisMonth()}" style="width:auto"></div><div id="myatt"></div>
    <div class="row" style="margin:20px 0 8px"><h3 style="flex:1">مفردات المرتب</h3><input type="month" id="pmon" value="${thisMonth()}" style="width:auto"></div><div id="mypay"></div>`;
  $('#newreq').onclick = () => requestForm(() => PAGES.me(view));
  const r = await api('/requests/mine');
  const b = r.balances;
  $('#bal').innerHTML = [
    ['إجازة سنوية (المتبقي)', `${b.annual_total - b.annual_used} / ${b.annual_total} يوم`],
    ['إجازة مرضية', `${b.sick_used} يوم`], ['إجازة طارئة', `${b.emergency_used} يوم`], ['أذونات الشهر', `${b.permission_hours_month} ساعة`],
  ].map(([k, v]) => `<div class="card stat"><b style="font-size:22px">${v}</b><span>${k}</span></div>`).join('');
  $('#myreq').innerHTML = reqTable(r.requests, false);
  document.querySelectorAll('[data-del]').forEach((bt) => (bt.onclick = () => run(bt, async () => { await api('/requests/' + bt.dataset.del, 'DELETE'); PAGES.me(view); })));
  const loadAtt = async () => {
    const rows = await api('/attendance/mine?month=' + $('#amon').value);
    $('#myatt').innerHTML = rows.length ? `<div class="tablewrap"><table><tr><th>اليوم</th><th>حضور</th><th>انصراف</th><th>تأخير</th><th>انصراف مبكر</th></tr>
      ${rows.map((a) => `<tr><td>${fmtDate(a.date)}</td><td>${fmtTime(a.check_in)}</td><td>${fmtTime(a.check_out)}</td><td class="${a.late_minutes ? 'neg' : ''}">${a.late_minutes} د</td><td class="${a.early_minutes ? 'neg' : ''}">${a.early_minutes} د</td></tr>`).join('')}</table></div>` : '<div class="card empty">لا توجد سجلات</div>';
  };
  const loadPay = async () => { $('#mypay').innerHTML = payslip(await api('/payroll/mine?month=' + $('#pmon').value)); };
  $('#amon').onchange = loadAtt; $('#pmon').onchange = loadPay;
  loadAtt(); loadPay();
};
function payslip(m) {
  const line = (k, v, c) => `<tr><td>${k}</td><td class="num ${c || ''}">${money(v)}</td></tr>`;
  return `<div class="grid g2" style="align-items:start"><div class="tablewrap"><table style="min-width:0">
    ${line('الأساسي', m.base_salary)}${line('البدلات', m.allowances)}${line('المكافآت', m.bonuses, 'pos')}${line(`وقت إضافي (${m.overtime_hours} س)`, m.overtime_pay, 'pos')}
    <tr><th>الإجمالي</th><th class="num">${money(m.gross)}</th></tr>
    ${line(`خصم تأخير وانصراف مبكر (${m.late_minutes + m.early_minutes} د)`, m.late_deduction, 'neg')}${line(`خصم غياب (${m.absent_days} يوم)`, m.absence_deduction, 'neg')}${line('خصومات أخرى', m.manual_deductions, 'neg')}
    <tr><th>الصافي</th><th class="num">${money(m.net)}</th></tr></table></div>
    <div class="card"><div class="muted small">أيام العمل ${m.work_days} · حضور ${m.present_days} · غياب ${m.absent_days} · إجازات ${m.leave_days}</div>
    ${m.adjustments.length ? `<h3 style="margin:12px 0 6px">بنود إضافية</h3>${m.adjustments.map((a) => `<div class="row small" style="justify-content:space-between"><span>${a.kind === 'bonus' ? '＋ مكافأة' : '− خصم'}: ${esc(a.reason || '—')}</span><b class="${a.kind === 'bonus' ? 'pos' : 'neg'}">${money(a.amount)}</b></div>`).join('')}` : ''}</div></div>`;
}
function reqTable(rows, manage) {
  if (!rows.length) return '<div class="card empty">لا توجد طلبات</div>';
  return `<div class="tablewrap"><table><tr>${manage ? '<th>الموظف</th>' : ''}<th>النوع</th><th>من</th><th>إلى</th><th>ساعات</th><th>السبب</th><th>الحالة</th><th></th></tr>
    ${rows.map((r) => `<tr>${manage ? `<td>${esc(r.user_name)}</td>` : ''}<td>${esc(TYPES()[r.type] || r.type)}</td><td>${fmtDate(r.from_date)}</td><td>${fmtDate(r.to_date)}</td><td>${r.hours || '—'}</td>
    <td style="white-space:normal;min-width:140px">${esc(r.reason || '')}${r.decision_note ? `<div class="muted small">رد: ${esc(r.decision_note)}</div>` : ''}</td>
    <td><span class="badge ${STATUS_AR[r.status][1]}">${STATUS_AR[r.status][0]}</span></td>
    <td>${manage ? (r.status === 'pending' && has('requests.approve') ? `<button class="btn sm ok" data-dec="approved" data-id="${r.id}">قبول</button> <button class="btn sm bad" data-dec="rejected" data-id="${r.id}">رفض</button>` : '')
      : (r.status === 'pending' ? `<button class="btn sm alt" data-del="${r.id}">حذف</button>` : '')}</td></tr>`).join('')}</table></div>`;
}
function requestForm(done) {
  const t = todayStr();
  const o = modal(`<h3>طلب جديد</h3><form class="form" id="rf">
    <label class="f full">نوع الطلب<select name="type">${Object.entries(TYPES()).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
    <label class="f">من تاريخ<input type="date" name="from_date" value="${t}" required></label>
    <label class="f" id="tod">إلى تاريخ<input type="date" name="to_date" value="${t}" required></label>
    <label class="f full" id="hrs" hidden>عدد الساعات<input type="number" name="hours" min="0.25" max="24" step="0.25"></label>
    <label class="f full">السبب / ملاحظات<textarea name="reason" rows="3" maxlength="500"></textarea></label>
    <div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">إرسال الطلب</button></div></form>`);
  const f = $('#rf', o);
  const sync = () => { const h = ['overtime', 'permission'].includes(f.type.value); $('#hrs', o).hidden = !h; $('#tod', o).hidden = h; };
  f.type.onchange = sync; sync();
  f.from_date.onchange = () => { if (f.to_date.value < f.from_date.value) f.to_date.value = f.from_date.value; };
  f.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', f), async () => {
    await api('/requests', 'POST', { type: f.type.value, from_date: f.from_date.value, to_date: f.to_date.value, hours: f.hours.value, reason: f.reason.value });
    o.close(); toast('تم إرسال الطلب'); done();
  }); };
}

/* --- لوحة المعلومات --- */
PAGES.dashboard = async (view) => {
  view.innerHTML = '<div class="empty"><span class="spin"></span></div>';
  const d = await api('/dashboard');
  const SL = { present: ['في الموعد', 'b-ok', '#15803d'], late: ['متأخر', 'b-warn', '#d97706'], absent: ['غائب', 'b-bad', '#dc2626'], leave: ['إجازة', 'b-info', '#2563eb'], not_yet: ['لم يسجّل بعد', '', '#94a3b8'], off: ['عطلة', '', '#cbd5e1'] };
  view.innerHTML = `<div class="page-head"><h2>لوحة المعلومات</h2><span class="muted">${fmtDate(d.date)}</span></div>
    <div class="grid g4">${[['الموظفون', d.total], ['في الموعد', d.present], ['متأخر', d.late], ['غائب', d.absent], ['إجازة', d.leave], ['لم يسجّل بعد', d.not_yet], ['طلبات معلّقة', d.pending_requests], ['بدون بصمة وجه', d.missing_face]]
      .map(([k, v]) => `<div class="card stat"><b>${v}</b><span>${k}</span></div>`).join('')}</div>
    <div class="card" style="margin-top:12px"><h3 style="margin-bottom:10px">توزيع الحضور اليوم</h3>
      <div class="bar">${['present', 'late', 'absent', 'leave', 'not_yet', 'off'].map((k) => (d[k] ? `<i style="width:${(d[k] / Math.max(1, d.total)) * 100}%;background:${SL[k][2]}"></i>` : '')).join('')}</div>
      <div class="legend">${['present', 'late', 'absent', 'leave', 'not_yet'].map((k) => `<span style="--c:${SL[k][2]}">${SL[k][0]} (${d[k]})</span>`).join('')}</div></div>
    <div class="tablewrap" style="margin-top:12px"><table><tr><th>الموظف</th><th>الحالة</th><th>حضور</th><th>انصراف</th><th>تأخير</th></tr>
    ${d.list.map((x) => `<tr><td><b>${esc(x.name)}</b> <span class="muted small">${esc(x.job_title || '')}</span></td><td><span class="badge ${SL[x.status][1]}">${SL[x.status][0]}</span></td><td>${fmtTime(x.check_in)}</td><td>${fmtTime(x.check_out)}</td><td>${x.late_minutes ? x.late_minutes + ' د' : '—'}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">لا يوجد موظفون</td></tr>'}</table></div>`;
};

/* --- الموظفون --- */
PAGES.employees = async (view) => {
  const rows = await api('/employees');
  const sal = rows.some((r) => r.base_salary !== undefined);
  view.innerHTML = `<div class="page-head"><h2>الموظفون (${rows.length})</h2>${has('employees.manage') ? '<button class="btn" id="add">+ موظف جديد</button>' : ''}</div>
    <div class="grid g3">${rows.map((u) => `<div class="card"><div class="emp"><div class="avatar">${esc(initials(u.name))}</div>
      <div class="info"><b>${esc(u.name)}</b><span class="muted small">${esc(u.job_title || '')}${u.department ? ' · ' + esc(u.department) : ''}</span></div>
      ${u.active ? '' : '<span class="badge b-bad">موقوف</span>'}</div>
      <div class="small muted" style="margin:10px 0">وردية ${esc(u.shift_start)}–${esc(u.shift_end)} · ${u.face_enrolled ? '✔ بصمة وجه' : '✖ بدون بصمة'}${u.is_admin ? ' · مدير النظام' : ''}${sal && !u.is_admin ? ` · أساسي ${money(u.base_salary)}` : ''}</div>
      ${has('employees.manage') ? `<div class="row"><button class="btn alt sm" data-e="${u.id}">تعديل</button>${u.face_enrolled && !u.is_admin ? `<button class="btn alt sm" data-rf="${u.id}">إعادة ضبط الوجه</button>` : ''}</div>` : ''}</div>`).join('')}</div>`;
  if (has('employees.manage')) {
    $('#add').onclick = () => empForm(null, () => PAGES.employees(view));
    view.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => empForm(rows.find((r) => r.id == b.dataset.e), () => PAGES.employees(view))));
    view.querySelectorAll('[data-rf]').forEach((b) => (b.onclick = () => { if (confirm('إعادة ضبط بصمة وجه الموظف؟ هيسجّلها من جديد.')) run(b, async () => { await api(`/employees/${b.dataset.rf}/reset-face`, 'POST'); toast('تمت إعادة الضبط'); PAGES.employees(view); }); }));
  }
};
function empForm(u, done) {
  const isNew = !u, canSal = isNew || u.base_salary !== undefined;
  const o = modal(`<h3>${isNew ? 'موظف جديد' : 'تعديل ' + esc(u.name)}</h3><form class="form" id="ef">
    <label class="f full">الاسم<input name="name" value="${esc(u?.name)}" required></label>
    ${isNew ? '<label class="f">اسم المستخدم (للدخول)<input name="username" autocapitalize="none" required></label>' : ''}
    <label class="f">${isNew ? 'كلمة مرور مؤقتة' : 'كلمة مرور جديدة (اختياري)'}<input name="password" minlength="6" ${isNew ? 'required' : ''}></label>
    <label class="f">المسمى الوظيفي<input name="job_title" value="${esc(u?.job_title)}"></label>
    <label class="f">القسم<input name="department" value="${esc(u?.department)}"></label>
    <label class="f">الهاتف<input name="phone" value="${esc(u?.phone)}"></label>
    <label class="f">تاريخ التعيين<input type="date" name="hire_date" value="${esc(u?.hire_date || todayStr())}"></label>
    ${canSal ? `<label class="f">المرتب الأساسي<input type="number" step="0.01" min="0" name="base_salary" value="${u?.base_salary ?? 0}"></label>
    <label class="f">البدلات<input type="number" step="0.01" min="0" name="allowances" value="${u?.allowances ?? 0}"></label>` : ''}
    <label class="f">بداية الوردية<input type="time" name="shift_start" value="${esc(u?.shift_start || '09:00')}"></label>
    <label class="f">نهاية الوردية<input type="time" name="shift_end" value="${esc(u?.shift_end || '17:00')}"></label>
    <label class="f">رصيد الإجازة السنوية (يوم)<input type="number" min="0" name="annual_leave_days" value="${u?.annual_leave_days ?? 21}"></label>
    ${!isNew && !u.is_admin ? `<label class="f">الحالة<select name="active"><option value="1" ${u.active ? 'selected' : ''}>نشط</option><option value="0" ${u.active ? '' : 'selected'}>موقوف</option></select></label>` : ''}
    <div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">حفظ</button></div></form>`);
  const f = $('#ef', o);
  f.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', f), async () => {
    const b = Object.fromEntries(new FormData(f));
    if (b.active !== undefined) b.active = b.active === '1';
    if (!b.password) delete b.password;
    await api(isNew ? '/employees' : '/employees/' + u.id, isNew ? 'POST' : 'PUT', b);
    o.close(); toast('تم الحفظ'); done();
  }); };
}

/* --- سجل الحضور للجميع --- */
PAGES.attendance = async (view) => {
  const emps = has('employees.view') ? await api('/employees') : [];
  const first = thisMonth() + '-01';
  view.innerHTML = `<div class="page-head"><h2>سجل الحضور</h2><div class="row noprint">${has('attendance.edit') ? '<button class="btn" id="man">+ تسجيل يدوي</button>' : ''}<button class="btn alt" id="exp">تصدير CSV</button></div></div>
    <div class="card form" style="margin-bottom:12px;grid-template-columns:repeat(3,1fr)"><label class="f">من<input type="date" id="f1" value="${first}"></label><label class="f">إلى<input type="date" id="f2" value="${todayStr()}"></label>
    <label class="f">الموظف<select id="f3"><option value="">الكل</option>${emps.filter((e) => !e.is_admin).map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></label></div><div id="al"></div>`;
  let rows = [];
  const load = async () => {
    rows = await api(`/attendance?from=${$('#f1').value}&to=${$('#f2').value}&user_id=${$('#f3').value}`);
    $('#al').innerHTML = rows.length ? `<div class="tablewrap"><table><tr><th>اليوم</th><th>الموظف</th><th>حضور</th><th>انصراف</th><th>تأخير</th><th>مبكر</th><th>تطابق الوجه</th><th>الموقع</th><th></th></tr>
      ${rows.map((a) => `<tr><td>${fmtDate(a.date)}</td><td>${esc(a.user_name)}</td><td>${fmtTime(a.check_in)}</td><td>${fmtTime(a.check_out)}</td><td class="${a.late_minutes ? 'neg' : ''}">${a.late_minutes} د</td><td class="${a.early_minutes ? 'neg' : ''}">${a.early_minutes} د</td>
      <td>${a.in_face != null ? (100 - Math.round(a.in_face * 100)) + '%' : (a.note ? 'يدوي' : '—')}</td><td>${a.in_lat != null ? `<a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${a.in_lat},${a.in_lng}">خريطة</a>` : '—'}</td>
      <td>${has('attendance.edit') ? `<button class="btn alt sm" data-ed="${a.id}">تعديل</button> <button class="btn alt sm" data-rm="${a.id}">حذف</button>` : ''}</td></tr>`).join('')}</table></div>` : '<div class="card empty">لا توجد سجلات</div>';
    view.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { if (confirm('حذف السجل؟')) run(b, async () => { await api('/attendance/' + b.dataset.rm, 'DELETE'); load(); }); }));
    view.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => { const a = rows.find((r) => r.id == b.dataset.ed); manualAtt(emps, a, load); }));
  };
  ['f1', 'f2', 'f3'].forEach((i) => ($('#' + i).onchange = load));
  if ($('#man')) $('#man').onclick = () => manualAtt(emps, null, load);
  $('#exp').onclick = () => csv('attendance.csv', [['التاريخ', 'الموظف', 'حضور', 'انصراف', 'تأخير (د)', 'انصراف مبكر (د)'], ...rows.map((a) => [a.date, a.user_name, fmtTime(a.check_in), fmtTime(a.check_out), a.late_minutes, a.early_minutes])]);
  load();
};
function manualAtt(emps, a, done) {
  const hm = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '');
  const o = modal(`<h3>${a ? 'تعديل سجل' : 'تسجيل حضور يدوي'}</h3><form class="form" id="mf">
    <label class="f full">الموظف<select name="user_id" ${a ? 'disabled' : ''}>${emps.filter((e) => !e.is_admin).map((e) => `<option value="${e.id}" ${a && a.user_id === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>
    <label class="f">التاريخ<input type="date" name="date" value="${a?.date || todayStr()}" ${a ? 'readonly' : ''} required></label>
    <label class="f">ملاحظة<input name="note" value="${esc(a?.note)}" placeholder="سبب التعديل"></label>
    <label class="f">الحضور<input type="time" name="check_in" value="${hm(a?.check_in)}"></label>
    <label class="f">الانصراف<input type="time" name="check_out" value="${hm(a?.check_out)}"></label>
    <div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">حفظ</button></div></form>`);
  const f = $('#mf', o);
  f.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', f), async () => {
    await api('/attendance', 'POST', { user_id: a ? a.user_id : f.user_id.value, date: f.date.value, check_in: f.check_in.value, check_out: f.check_out.value, note: f.note.value || 'تعديل يدوي' });
    o.close(); toast('تم الحفظ'); done();
  }); };
}

/* --- الطلبات (إدارة) --- */
PAGES.requests = async (view) => {
  view.innerHTML = `<div class="page-head"><h2>الطلبات</h2><select id="st" style="width:auto"><option value="pending">قيد الانتظار</option><option value="">الكل</option><option value="approved">المقبولة</option><option value="rejected">المرفوضة</option></select></div><div id="rl"></div>`;
  const load = async () => {
    $('#rl').innerHTML = reqTable(await api('/requests?status=' + $('#st').value), true);
    view.querySelectorAll('[data-dec]').forEach((b) => (b.onclick = () => {
      const note = prompt(b.dataset.dec === 'approved' ? 'ملاحظة (اختياري)' : 'سبب الرفض (اختياري)') ;
      if (note === null) return;
      run(b, async () => { await api(`/requests/${b.dataset.id}/decide`, 'POST', { decision: b.dataset.dec, note }); toast('تم'); load(); });
    }));
  };
  $('#st').onchange = load; load();
};

/* --- المرتبات والخصومات --- */
PAGES.payroll = async (view) => {
  view.innerHTML = `<div class="page-head"><h2>المرتبات والخصومات</h2><div class="row noprint"><input type="month" id="pm" value="${thisMonth()}" style="width:auto"><button class="btn alt" id="exp">تصدير CSV</button><button class="btn alt" onclick="print()">طباعة</button></div></div><div id="pt"></div>`;
  let data;
  const load = async () => {
    data = await api('/payroll?month=' + $('#pm').value);
    const tot = (k) => data.rows.reduce((s, r) => s + r[k], 0);
    $('#pt').innerHTML = `<div class="tablewrap"><table><tr><th>الموظف</th><th class="num">الأساسي</th><th class="num">بدلات</th><th class="num">مكافآت</th><th class="num">وقت إضافي</th><th class="num">خصم تأخير</th><th class="num">خصم غياب</th><th class="num">خصومات أخرى</th><th class="num">الصافي</th><th class="noprint"></th></tr>
      ${data.rows.map((r) => `<tr><td><b>${esc(r.name)}</b><div class="muted small">حضور ${r.present_days} · غياب ${r.absent_days} · تأخير ${r.late_minutes + r.early_minutes} د</div></td>
      <td class="num">${money(r.base_salary)}</td><td class="num">${money(r.allowances)}</td><td class="num pos">${money(r.bonuses)}</td><td class="num pos">${money(r.overtime_pay)}</td>
      <td class="num neg">${money(r.late_deduction)}</td><td class="num neg">${money(r.absence_deduction)}</td><td class="num neg">${money(r.manual_deductions)}</td><td class="num"><b>${money(r.net)}</b></td>
      <td class="noprint">${has('payroll.manage') ? `<button class="btn alt sm" data-adj="${r.user_id}">+ خصم/مكافأة</button>` : ''}<button class="btn alt sm" data-sl="${r.user_id}">تفاصيل</button></td></tr>`).join('')}
      <tr><th>الإجمالي</th><th class="num">${money(tot('base_salary'))}</th><th class="num">${money(tot('allowances'))}</th><th class="num">${money(tot('bonuses'))}</th><th class="num">${money(tot('overtime_pay'))}</th><th class="num">${money(tot('late_deduction'))}</th><th class="num">${money(tot('absence_deduction'))}</th><th class="num">${money(tot('manual_deductions'))}</th><th class="num">${money(tot('net'))}</th><th class="noprint"></th></tr></table></div>
      <p class="muted small">الخصم = (دقائق التأخير ÷ 60) × أجر الساعة، والغياب = أيام الغياب × أجر اليوم (الأساسي ÷ 30). النسب قابلة للتعديل من الإعدادات.</p>`;
    view.querySelectorAll('[data-adj]').forEach((b) => (b.onclick = () => adjForm(data.rows.find((r) => r.user_id == b.dataset.adj), data.month, load)));
    view.querySelectorAll('[data-sl]').forEach((b) => (b.onclick = () => {
      const r = data.rows.find((x) => x.user_id == b.dataset.sl);
      const o = modal(`<h3>${esc(r.name)} — ${data.month}</h3>${payslip(r)}${has('payroll.manage') && r.adjustments.length ? `<h3 style="margin:14px 0 6px">حذف بند</h3>${r.adjustments.map((a) => `<div class="row small" style="justify-content:space-between"><span>${a.kind === 'bonus' ? 'مكافأة' : 'خصم'} ${money(a.amount)} — ${esc(a.reason)}</span><button class="btn alt sm" data-rm="${a.id}">حذف</button></div>`).join('')}` : ''}<div class="actions"><button class="btn" data-close>إغلاق</button></div>`);
      o.querySelectorAll('[data-rm]').forEach((x) => (x.onclick = () => run(x, async () => { await api('/adjustments/' + x.dataset.rm, 'DELETE'); o.close(); load(); })));
    }));
  };
  $('#pm').onchange = load;
  $('#exp').onclick = () => csv(`payroll-${data.month}.csv`, [['الموظف', 'الأساسي', 'بدلات', 'مكافآت', 'وقت إضافي', 'خصم تأخير', 'خصم غياب', 'خصومات أخرى', 'الصافي'], ...data.rows.map((r) => [r.name, r.base_salary, r.allowances, r.bonuses, r.overtime_pay, r.late_deduction, r.absence_deduction, r.manual_deductions, r.net])]);
  load();
};
function adjForm(r, month, done) {
  const o = modal(`<h3>خصم / مكافأة — ${esc(r.name)}</h3><form class="form" id="af">
    <label class="f">النوع<select name="kind"><option value="deduction">خصم</option><option value="bonus">مكافأة</option></select></label>
    <label class="f">المبلغ<input type="number" step="0.01" min="0.01" name="amount" required></label>
    <label class="f full">السبب<input name="reason" maxlength="200" required></label>
    <div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">إضافة</button></div></form>`);
  const f = $('#af', o);
  f.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', f), async () => { await api('/adjustments', 'POST', { user_id: r.user_id, month, kind: f.kind.value, amount: f.amount.value, reason: f.reason.value }); o.close(); toast('تمت الإضافة'); done(); }); };
}

/* --- التقارير --- */
PAGES.reports = async (view) => {
  view.innerHTML = `<div class="page-head"><h2>التقرير الشهري</h2><div class="row noprint"><input type="month" id="rm" value="${thisMonth()}" style="width:auto"><button class="btn alt" id="exp">تصدير CSV</button><button class="btn alt" onclick="print()">طباعة</button></div></div><div id="rt"></div>`;
  let data;
  const load = async () => {
    data = await api('/reports/monthly?month=' + $('#rm').value);
    $('#rt').innerHTML = `<div class="tablewrap"><table><tr><th>الموظف</th><th class="num">أيام العمل</th><th class="num">حضور</th><th class="num">غياب</th><th class="num">إجازات</th><th class="num">تأخير (د)</th><th class="num">انصراف مبكر (د)</th><th class="num">إضافي (س)</th><th class="num">أذونات (س)</th></tr>
      ${data.rows.map((r) => `<tr><td><b>${esc(r.name)}</b></td><td class="num">${r.work_days}</td><td class="num">${r.present_days}</td><td class="num ${r.absent_days ? 'neg' : ''}">${r.absent_days}</td><td class="num">${r.leave_days}</td><td class="num">${r.late_minutes}</td><td class="num">${r.early_minutes}</td><td class="num">${r.overtime_hours}</td><td class="num">${r.permission_hours}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">لا توجد بيانات</td></tr>'}</table></div>`;
  };
  $('#rm').onchange = load;
  $('#exp').onclick = () => csv(`report-${data.month}.csv`, [['الموظف', 'أيام العمل', 'حضور', 'غياب', 'إجازات', 'تأخير (د)', 'انصراف مبكر (د)', 'إضافي (س)', 'أذونات (س)'], ...data.rows.map((r) => [r.name, r.work_days, r.present_days, r.absent_days, r.leave_days, r.late_minutes, r.early_minutes, r.overtime_hours, r.permission_hours])]);
  load();
};

/* --- الصلاحيات (المدير فقط) --- */
PAGES.permissions = async (view) => {
  const emps = (await api('/employees')).filter((e) => !e.is_admin);
  const P = S.meta.permissions;
  const ALL = Object.keys(P);
  view.innerHTML = `<div class="page-head"><h2>الصلاحيات</h2></div>
    <p class="muted">أنتِ المدير، ولديكِ كل الصلاحيات. حدّدي لكل موظف ما يقدر يفتحه ويعمله. الصلاحيات الأساسية (تسجيل الحضور، حسابي، تقديم الطلبات) متاحة للجميع دايماً.</p>
    ${emps.length ? emps.map((u) => `<div class="card" style="margin-bottom:12px" data-u="${u.id}"><div class="row" style="justify-content:space-between;margin-bottom:8px">
      <div class="emp"><div class="avatar">${esc(initials(u.name))}</div><div class="info"><b>${esc(u.name)}</b><span class="muted small">${esc(u.job_title || '')}</span></div></div>
      <div class="row"><button class="btn alt sm" data-preset="ops">مدير تشغيل (كل الصلاحيات)</button><button class="btn alt sm" data-preset="none">بدون صلاحيات</button></div></div>
      <div class="grid g3">${ALL.map((p) => `<label class="perm"><input type="checkbox" value="${p}" ${u.permissions.includes(p) ? 'checked' : ''}>${esc(P[p])}</label>`).join('')}</div>
      <div class="row" style="margin-top:10px"><button class="btn sm" data-save>حفظ الصلاحيات</button></div></div>`).join('') : '<div class="card empty">أضيفي موظفين أولاً من صفحة الموظفين</div>'}`;
  view.querySelectorAll('[data-u]').forEach((card) => {
    const boxes = () => [...card.querySelectorAll('input[type=checkbox]')];
    card.querySelectorAll('[data-preset]').forEach((b) => (b.onclick = () => boxes().forEach((x) => (x.checked = b.dataset.preset === 'ops'))));
    $('[data-save]', card).onclick = (e) => run(e.target, async () => {
      await api(`/users/${card.dataset.u}/permissions`, 'PUT', { permissions: boxes().filter((x) => x.checked).map((x) => x.value) });
      toast('تم حفظ الصلاحيات');
    });
  });
};

/* --- الإعدادات --- */
PAGES.settings = async (view) => {
  const s = await api('/settings');
  const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const wk = String(s.weekend_days).split(',').filter(Boolean).map(Number);
  view.innerHTML = `<div class="page-head"><h2>الإعدادات</h2></div><form class="card form" id="sf">
    <label class="f full">اسم الشركة<input name="company_name" value="${esc(s.company_name)}"></label>
    <div class="full card" style="background:var(--bg)"><h3>موقع العمل</h3><p class="muted small" style="margin:4px 0 10px">لو سبتيهم فاضيين، مش هيتم التحقق من الموقع. الأفضل تفتحي الصفحة وانتِ في مكان العمل وتضغطي الزرار.</p>
      <div class="form"><label class="f">خط العرض<input name="work_lat" value="${esc(s.work_lat)}" inputmode="decimal"></label><label class="f">خط الطول<input name="work_lng" value="${esc(s.work_lng)}" inputmode="decimal"></label>
      <label class="f">النطاق المسموح (متر)<input type="number" name="radius_m" min="20" value="${esc(s.radius_m)}"></label><div style="align-self:end"><button type="button" class="btn alt" id="here">استخدام موقعي الحالي</button></div></div></div>
    <label class="f">سماح التأخير (دقيقة)<input type="number" name="grace_minutes" min="0" value="${esc(s.grace_minutes)}"></label>
    <label class="f">حساسية مطابقة الوجه (0.3 أشد – 0.7 أخف)<input type="number" step="0.05" min="0.3" max="0.7" name="face_threshold" value="${esc(s.face_threshold)}"></label>
    <label class="f">معامل خصم التأخير<input type="number" step="0.25" min="0" name="late_factor" value="${esc(s.late_factor)}"></label>
    <label class="f">معامل خصم الغياب (يوم)<input type="number" step="0.25" min="0" name="absence_factor" value="${esc(s.absence_factor)}"></label>
    <label class="f">معامل الوقت الإضافي<input type="number" step="0.25" min="0" name="overtime_factor" value="${esc(s.overtime_factor)}"></label>
    <div class="full"><div class="muted small" style="margin-bottom:6px;font-weight:600">أيام الإجازة الأسبوعية</div><div class="row">${days.map((d, i) => `<label class="perm"><input type="checkbox" data-d="${i}" ${wk.includes(i) ? 'checked' : ''}>${d}</label>`).join('')}</div></div>
    <div class="actions full" style="justify-content:flex-start"><button class="btn">حفظ الإعدادات</button></div></form>`;
  $('#here').onclick = (e) => run(e.target, async () => { const p = await getPos(); $('[name=work_lat]').value = p.lat.toFixed(6); $('[name=work_lng]').value = p.lng.toFixed(6); toast(`تم التقاط الموقع (دقة ~${Math.round(p.acc)} م)`); });
  $('#sf').onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', e.target), async () => {
    const b = Object.fromEntries(new FormData(e.target));
    b.weekend_days = [...document.querySelectorAll('[data-d]:checked')].map((x) => x.dataset.d).join(',');
    await api('/settings', 'PUT', b); S.me = await api('/me'); toast('تم حفظ الإعدادات');
  }); };
};

/* ====== تشغيل ====== */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
if (S.token) boot(); else renderLogin();
