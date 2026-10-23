'use strict';
/* ====== أدوات ====== */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { token: localStorage.getItem('tk'), me: null, meta: null, page: 'home', open: {}, q: '', metab: null };
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
async function renderLogin() {
  let pub = { signup_enabled: true };
  try { pub = await api('/public'); } catch { /* نكمل بالافتراضي */ }
  $('#app').innerHTML = `<div class="login"><form class="card" id="lf">
    <img class="logo" src="/icon.svg" alt="">
    <h2 style="text-align:center;margin-bottom:4px">تسجيل الدخول</h2>
    <p class="muted" style="text-align:center;margin:0 0 16px">نظام الحضور والموارد البشرية</p>
    <div class="grid">
      <label class="f">اسم المستخدم<input name="u" autocomplete="username" autocapitalize="none" required></label>
      <label class="f">كلمة المرور<input name="p" type="password" autocomplete="current-password" required></label>
      <button class="btn big" style="font-size:16px;padding:12px">دخول</button>
      <div class="row" style="justify-content:space-between">
        <button type="button" class="link" id="forgot">نسيت كلمة المرور؟</button>
        ${pub.signup_enabled ? '<button type="button" class="link" id="signup">إنشاء حساب جديد</button>' : ''}
      </div>
    </div></form></div>`;
  $('#forgot').onclick = () => forgotForm($('[name=u]').value.trim());
  if ($('#signup')) $('#signup').onclick = signupForm;
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
function signupForm() {
  const o = modal(`<h3>إنشاء حساب جديد</h3>
    <p class="muted small" style="margin:0 0 12px">هيتم إنشاء حساب موظف، وهتقدري تدخلي بعد ما المدير يوافق عليه. المدير هو اللي بيحدد صلاحياتك.</p>
    <form class="form" id="sg">
      <label class="f full">الاسم بالكامل<input name="name" required minlength="3" maxlength="80" autocomplete="name"></label>
      <label class="f">اسم المستخدم (للدخول)<input name="username" required minlength="3" maxlength="30" autocapitalize="none" autocomplete="username"></label>
      <label class="f">رقم الهاتف<input name="phone" type="tel" maxlength="30" autocomplete="tel"></label>
      <label class="f">كلمة المرور (6 أحرف على الأقل)<input name="password" type="password" minlength="6" required autocomplete="new-password"></label>
      <label class="f">تأكيد كلمة المرور<input name="password2" type="password" minlength="6" required autocomplete="new-password"></label>
      <div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">إنشاء الحساب</button></div></form>`);
  const f = $('#sg', o);
  f.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', f), async () => {
    if (f.password.value !== f.password2.value) throw new Error('كلمتا المرور غير متطابقتين');
    await api('/signup', 'POST', { name: f.name.value, username: f.username.value.trim(), phone: f.phone.value, password: f.password.value });
    o.close();
    modal(`<h3>تم إرسال طلبك ✔</h3><p>حسابك بانتظار موافقة المدير. هتقدري تدخلي باسم المستخدم وكلمة المرور بعد القبول.</p><div class="actions"><button class="btn" data-close>تمام</button></div>`);
  }); };
}
function forgotForm(username) {
  const o = modal(`<h3>نسيت كلمة المرور</h3>
    <p class="muted small" style="margin:0 0 12px">اكتبي اسم المستخدم وهيوصل طلب للمدير. بعد ما يراجعه هيدّيكي كلمة مرور مؤقتة، وتغيّريها أول ما تدخلي.</p>
    <form class="grid" id="fg">
      <label class="f">اسم المستخدم<input name="username" value="${esc(username)}" required autocapitalize="none"></label>
      <label class="f">رقم الهاتف أو ملاحظة تساعد المدير يتأكد إنك أنتِ (اختياري)<input name="note" maxlength="200"></label>
      <div class="actions"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">إرسال الطلب</button></div></form>`);
  const f = $('#fg', o);
  f.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', f), async () => {
    await api('/forgot-password', 'POST', { username: f.username.value.trim(), note: f.note.value });
    o.close();
    modal(`<h3>تم إرسال الطلب</h3><p>لو اسم المستخدم صحيح، المدير هيوصله طلبك ويديكي كلمة مرور مؤقتة. تواصلي معه لو اتأخر.</p><div class="actions"><button class="btn" data-close>تمام</button></div>`);
  }); };
}
/* ====== الأيقونات والقائمة ====== */
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1"/><circle cx="17.5" cy="9" r="2.5"/><path d="M18 14a4 4 0 0 1 4 4v1"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2z"/><circle cx="16" cy="14" r="1.2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  gift: '<path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H8a2.5 2.5 0 1 1 0-5c2 0 4 2 4 5zM12 7h4a2.5 2.5 0 1 0 0-5c-2 0-4 2-4 5z"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  case: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  dots: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  dollar: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9a2.5 2 0 0 0-2.5-1.5c-1.5 0-2.5.8-2.5 1.8 0 2.6 5 1.4 5 4 0 1-1 1.8-2.5 1.8A2.7 2 0 0 1 9.5 14.5M12 6v1.5M12 16.5V18"/>',
  print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/>',
};
const ico = (n, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</svg>`;
// قائمة بمجموعات (زي الشاشة): عنصر مفرد أو مجموعة فيها عناصر فرعية
const MENU = [
  { id: 'dashboard', ic: 'grid', t: 'لوحة المعلومات', ok: () => has('dashboard.view') },
  { id: 'me', ic: 'user', t: 'حسابي', ok: () => true },
  { g: 'emp', ic: 'users', t: 'الموظفون', items: [
    ['employees', 'الموظفون', () => has('employees.view')], ['permissions', 'الصلاحيات', () => S.me.user.is_admin]] },
  { id: 'requests', ic: 'file', t: 'الطلبات', ok: () => has('requests.view_all') },
  { g: 'att', ic: 'clock', t: 'الحضور', items: [
    ['home', 'تسجيل الحضور', () => true], ['attendance', 'سجل الحضور', () => has('attendance.view_all')]] },
  { g: 'fin', ic: 'wallet', t: 'المالية', items: [
    ['payroll', 'المرتبات والخصومات', () => has('payroll.view')], ['adjustments', 'المكافآت والجزاءات', () => has('payroll.view')], ['tiers', 'شرائح خصم التأخير', () => has('settings.manage')]] },
  { id: 'reports', ic: 'chart', t: 'التقارير', ok: () => has('reports.view') },
  { id: 'settings', ic: 'sliders', t: 'الإعدادات', ok: () => has('settings.manage') },
];
const menuVisible = () => MENU.map((m) => (m.g ? { ...m, items: m.items.filter((i) => i[2]()) } : m)).filter((m) => (m.g ? m.items.length : m.ok()));
const allPages = () => menuVisible().flatMap((m) => (m.g ? m.items.map((i) => i[0]) : [m.id]));
function go(page, opts = {}) { S.page = page; if (opts.tab) S.metab = opts.tab; S.q = opts.q || ''; renderShell(); window.scrollTo(0, 0); }
function menuHtml(sheet) {
  return menuVisible().map((m) => {
    if (!m.g) return `<button class="navi ${m.id === S.page ? 'on' : ''}" data-p="${m.id}">${ico(m.ic)}<span>${m.t}</span></button>`;
    const has_on = m.items.some((i) => i[0] === S.page), open = sheet || has_on || S.open[m.g];
    return `<div class="navgrp ${open ? 'open' : ''} ${has_on ? 'cur' : ''}"><button class="navi navg" data-g="${m.g}">${ico(m.ic)}<span>${m.t}</span>${ico('chev', 'chev')}</button>
      <div class="sub">${m.items.map((i) => `<button class="navi sm ${i[0] === S.page ? 'on' : ''}" data-p="${i[0]}"><span>${i[1]}</span></button>`).join('')}</div></div>`;
  }).join('');
}
function menuSheet() {
  const o = modal(`<h3>القائمة</h3><nav class="nav sheetnav">${menuHtml(true)}</nav>
    <div class="row" style="margin-top:14px"><button class="btn alt" id="spw" style="flex:1">${ico('lock')} كلمة المرور</button><button class="btn alt" id="slo" style="flex:1">${ico('logout')} خروج</button></div>`);
  o.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { o.close(); go(b.dataset.p); }));
  $('#spw', o).onclick = () => { o.close(); changePassword(); };
  $('#slo', o).onclick = () => { o.close(); logout(); };
}
function quickSheet() {
  const o = modal(`<h3>إضافة سريعة</h3><div class="grid">
    <button class="btn alt qa" data-q="req">${ico('file')} طلب جديد (إجازة / إذن / وقت إضافي)</button>
    ${has('employees.manage') ? `<button class="btn alt qa" data-q="emp">${ico('users')} موظف جديد</button>` : ''}
    ${has('payroll.manage') ? `<button class="btn alt qa" data-q="adj">${ico('gift')} مكافأة / جزاء / خصم</button>` : ''}
    <button class="btn alt qa" data-q="notes">${ico('bell')} الإشعارات</button></div>`);
  o.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => {
    o.close();
    const k = b.dataset.q;
    if (k === 'req') requestForm(() => { if (S.page === 'me') renderShell(); });
    else if (k === 'emp') { go('employees'); setTimeout(() => $('#add') && $('#add').click(), 400); }
    else if (k === 'adj') { go('adjustments'); setTimeout(() => $('#aadd') && $('#aadd').click(), 400); }
    else showNotes();
  }));
}
function renderShell() {
  S.open = S.open || {};
  if (!allPages().includes(S.page)) S.page = 'home';
  const u = S.me.user, canSearch = has('employees.view');
  const bnav = [
    ['home', 'الجدول', 'calendar'],
    has('dashboard.view') ? ['dashboard', 'لوحة المعلومات', 'grid'] : ['me', 'حسابي', 'user'],
    null,
    has('employees.view') ? ['employees', 'الموظفون', 'users'] : ['me:attendance', 'سجلي', 'clock'],
    ['menu', 'القائمة', 'menu'],
  ];
  $('#app').innerHTML = `<div class="shell">
    <header class="topbar">
      <div class="brand"><img src="/icon.svg" alt=""><span>${esc(S.me.settings.company_name)}</span></div>
      ${canSearch ? `<form class="search" id="srch">${ico('search')}<input id="sq" placeholder="ابحثي عن موظف بالاسم أو اسم المستخدم أو الهاتف..." autocomplete="off"></form>` : '<div class="grow"></div>'}
      <div class="chip" id="cdate">${ico('calendar')}<span dir="ltr"></span></div>
      <div class="chip" id="cclk">${ico('clock')}<span dir="ltr">--:--:--</span></div>
      <button class="iconbtn" id="bell">${ico('bell')}${S.me.unread ? `<span class="dot">${S.me.unread}</span>` : ''}</button>
      <div class="usermenu"><button class="chip userchip" id="um"><span class="avatar sm">${esc(initials(u.name))}</span><span class="uname">${esc(u.name)}</span>${ico('chev')}</button>
        <div class="dropdown" id="umd" hidden><button id="pw">${ico('lock')} تغيير كلمة المرور</button><button id="lo">${ico('logout')} تسجيل الخروج</button></div></div>
    </header>
    <aside class="side"><div class="side-head">${ico('menu')}<span>القائمة</span></div><nav class="nav" id="nav">${menuHtml(false)}</nav></aside>
    <header class="mtop"><div class="avatar big">${esc(initials(u.name))}</div>
      <div class="info"><b>${esc(u.name)}</b><span>${esc(u.job_title || (u.is_admin ? 'مدير النظام' : 'موظف'))}</span><span>${esc(u.department || '')}</span></div>
      <button class="iconbtn" id="mbell">${ico('bell')}${S.me.unread ? `<span class="dot">${S.me.unread}</span>` : ''}</button></header>
    <main class="content" id="view"></main>
    <nav class="bottom">${bnav.map((n) => (n ? `<button data-b="${n[0]}" class="${(n[0] === S.page || (n[0] === 'me:attendance' && S.page === 'me')) ? 'on' : ''}"><span class="bi">${ico(n[2])}</span><span>${n[1]}</span></button>` : '<span class="gap"></span>')).join('')}
      <button class="fab" id="fab" aria-label="إضافة">${ico('plus')}</button></nav>
  </div>`;
  const bind = (root) => {
    root.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => go(b.dataset.p)));
    root.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => { S.open[b.dataset.g] = !b.parentElement.classList.contains('open'); b.parentElement.classList.toggle('open'); }));
  };
  bind($('#nav'));
  document.querySelectorAll('.bottom [data-b]').forEach((b) => (b.onclick = () => {
    const k = b.dataset.b;
    if (k === 'menu') menuSheet(); else if (k === 'me:attendance') go('me', { tab: 'attendance' }); else go(k);
  }));
  $('#fab').onclick = quickSheet;
  $('#bell').onclick = showNotes; $('#mbell').onclick = showNotes;
  $('#um').onclick = (e) => { e.stopPropagation(); $('#umd').hidden = !$('#umd').hidden; };
  document.onclick = () => { const d = $('#umd'); if (d) d.hidden = true; };
  $('#lo').onclick = () => logout(); $('#pw').onclick = changePassword;
  if ($('#srch')) $('#srch').onsubmit = (e) => { e.preventDefault(); go('employees', { q: $('#sq').value.trim() }); };
  const tick = () => {
    const c = $('#cclk span'); if (!c) return clearInterval(renderShell.t);
    const n = new Date();
    c.textContent = n.toLocaleTimeString('en-US', { timeZone: TZ });
    $('#cdate span').textContent = n.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ }).replace(/,/g, '');
  };
  tick(); clearInterval(renderShell.t); renderShell.t = setInterval(tick, 1000);
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
const fmt12 = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return `${String(h % 12 || 12).padStart(2, '0')}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'م' : 'ص'}`; };
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const timeAr = (iso) => (iso ? new Date(iso).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: TZ }) : '');
PAGES.home = async (view) => {
  const u = S.me.user, today = S.me.today_date;
  const weekend = String(S.me.settings.weekend_days || '').split(',').filter(Boolean).map(Number);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 4));
  let sel = today, recs = {};
  view.innerHTML = `<div class="narrow"><div class="card prof"><div class="avatar big">${esc(initials(u.name))}</div>
      <div class="info"><b>${esc(u.name)}</b><span class="muted">${esc(u.job_title || '')}</span><span class="muted">${esc(u.department || '')}</span></div></div>
    <div class="card" style="margin-top:12px"><div class="strip-head"><span class="strip-month" id="smon"></span><span class="muted" id="sdow"></span></div>
      <div class="strip" id="strip"></div></div>
    <div class="card punchcard" id="pc" style="margin-top:12px"></div></div>`;
  const loadRecs = async () => {
    const months = [...new Set([days[0].slice(0, 7), days[6].slice(0, 7)])];
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
    $('#smon').textContent = dt.toLocaleDateString('ar-EG-u-nu-latn', { month: 'long', year: 'numeric' });
    $('#sdow').textContent = `(${dt.toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long' })})`;
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
      action = !u.face_enrolled
        ? `<p class="small" style="background:var(--warn-l);color:var(--warn);padding:10px;border-radius:10px;margin:14px 0 10px">لازم تسجّلي بصمة وجهك مرة واحدة قبل أول تسجيل حضور.</p><button class="pbtn" id="enroll">تسجيل بصمة الوجه</button>`
        : '<button class="pbtn" id="go">تسجيل الحضور <span>⇥</span></button>';
    }
    $('#pc').innerHTML = `<div class="shift">(${esc(fmt12(u.shift_start))} - ${esc(fmt12(u.shift_end))})</div>${status}${body}${action}
      ${isToday && !(r && r.check_out) ? `<p class="muted small" style="text-align:center;margin:12px 0 0">التسجيل بالوجه ${S.me.settings.needs_geo ? 'والموقع (' + esc(S.me.settings.locations.join('، ')) + ')' : ''}</p>` : ''}`;
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
      const d = await captureFace(type === 'in' ? 'تأكيد الوجه للحضور' : 'تأكيد الوجه للانصراف');
      await api('/attendance/punch', 'POST', { type, lat: pos?.lat, lng: pos?.lng, descriptor: d });
      toast(type === 'in' ? 'تم تسجيل الحضور ✔' : 'تم تسجيل الانصراف ✔');
      S.me = await api('/me'); await loadRecs(); draw();
    });
    if (btn.isConnected) btn.innerHTML = label;
  }
  draw();
  loadRecs().then(() => { if ($('#strip')) draw(); }).catch(() => {});
};

/* --- حسابي --- */
PAGES.me = async (view) => {
  const u = S.me.user;
  let tab = S.metab || 'general'; S.metab = null;
  const t = S.me.today, today = S.me.today_date;
  const weekend = String(S.me.settings.weekend_days || '').split(',').filter(Boolean).map(Number);
  const dow = new Date(today + 'T00:00:00Z').getUTCDay();
  const chip = t && t.check_in ? (t.late_minutes > 0 ? ['b-warn', `متأخر ${t.late_minutes} د`] : ['b-ok', 'في الموعد']) : weekend.includes(dow) ? ['', 'عطلة'] : ['b-warn', 'لم يسجّل بعد'];
  view.innerHTML = `<div class="card profile"><div class="avatar xl">${esc(initials(u.name))}</div>
      <div class="pinfo"><h2>${esc(u.name)}</h2><div class="muted">${ico('case')} ${esc(u.job_title || (u.is_admin ? 'مدير النظام' : 'موظف'))}</div><div class="muted">${ico('users')} ${esc(u.department || '—')}</div></div>
      <div class="pmid"><span class="badge ${chip[0]}">${chip[1]}</span> <b>${esc(fmt12(u.shift_start))} - ${esc(fmt12(u.shift_end))}</b>
        <span class="badge ${u.face_enrolled ? 'b-ok' : 'b-warn'}">${u.face_enrolled ? 'بصمة الوجه مسجلة' : 'بصمة الوجه غير مسجلة'}</span></div>
      <div class="pact"><button class="btn" id="newreq">${ico('plus')} طلب جديد</button></div></div>
    <div class="grid g4 statrow" id="bal"></div>
    <div class="tabs" id="tabs">${[['general', 'عام'], ['calendar', 'تقويم العمل'], ['attendance', 'سجل الحضور'], ['payroll', 'مفردات المرتب']].map(([k, l]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div id="tabbody"></div>`;
  $('#newreq').onclick = () => requestForm(() => PAGES.me(view));
  const r = await api('/requests/mine');
  const bl = r.balances;
  $('#bal').innerHTML = [
    ['إجازة سنوية', `${bl.annual_total - bl.annual_used} / ${bl.annual_total}`, 'يوم'], ['إجازة طارئة', bl.emergency_used, 'يوم'],
    ['إجازة مرضية', bl.sick_used, 'يوم'], ['أذونات الشهر', bl.permission_hours_month, 'ساعة'],
  ].map(([k, v, un]) => `<div class="card stat2"><span class="sicon">${ico('calendar')}</span><div><div class="sval"><b>${v}</b> <span class="muted small">${un}</span></div><div class="muted">${k}</div></div></div>`).join('');
  const body = $('#tabbody');
  const draw = {
    general() {
      body.innerHTML = `<div class="page-head" style="margin-top:6px"><h2>الطلبات</h2><div class="row noprint">
        <select id="rtype" style="width:auto"><option value="">كل الأنواع</option>${Object.entries(TYPES()).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <select id="rst" style="width:auto"><option value="">كل الحالات</option><option value="pending">قيد الانتظار</option><option value="approved">مقبول</option><option value="rejected">مرفوض</option></select></div></div><div id="myreq"></div>`;
      const show = () => {
        const rows = r.requests.filter((x) => (!$('#rtype').value || x.type === $('#rtype').value) && (!$('#rst').value || x.status === $('#rst').value));
        $('#myreq').innerHTML = reqTable(rows, false);
        body.querySelectorAll('[data-del]').forEach((bt) => (bt.onclick = () => run(bt, async () => { await api('/requests/' + bt.dataset.del, 'DELETE'); PAGES.me(view); })));
      };
      $('#rtype').onchange = show; $('#rst').onchange = show; show();
    },
    async calendar() {
      body.innerHTML = `<div class="page-head" style="margin-top:6px"><h2>تقويم العمل</h2><input type="month" id="cmon" value="${thisMonth()}" style="width:auto"></div><div id="cal"></div>
        <div class="legend" style="margin-top:10px"><span style="--c:#15803d">حضور</span><span style="--c:#d97706">متأخر</span><span style="--c:#dc2626">غياب</span><span style="--c:#2563eb">إجازة</span><span style="--c:#cbd5e1">عطلة</span></div>`;
      const load = async () => {
        const m = $('#cmon').value, rows = await api('/attendance/mine?month=' + m), by = Object.fromEntries(rows.map((x) => [x.date, x]));
        const leave = new Set();
        r.requests.filter((x) => x.status === 'approved' && ['annual_leave', 'sick_leave', 'emergency_leave', 'work_mission'].includes(x.type)).forEach((x) => { for (let d = x.from_date; d <= x.to_date; d = addDays(d, 1)) leave.add(d); });
        const [y, mo] = m.split('-').map(Number), n = new Date(Date.UTC(y, mo, 0)).getUTCDate(), first = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
        const cells = Array.from({ length: (first + 1) % 7 }, () => '<div class="cd empty"></div>');
        for (let d = 1; d <= n; d++) {
          const ds = `${m}-${String(d).padStart(2, '0')}`, w = new Date(ds + 'T00:00:00Z').getUTCDay(), a = by[ds];
          let c = '', lb = '';
          if (a && a.check_in) { c = a.late_minutes > 0 ? '#d97706' : '#15803d'; lb = fmtTime(a.check_in); }
          else if (leave.has(ds)) { c = '#2563eb'; lb = 'إجازة'; }
          else if (weekend.includes(w)) { c = '#cbd5e1'; lb = 'عطلة'; }
          else if (ds < today && ds >= u.hire_date) { c = '#dc2626'; lb = 'غياب'; }
          cells.push(`<div class="cd ${ds === today ? 'today' : ''}"><b>${d}</b>${c ? `<i style="background:${c}"></i><small>${lb}</small>` : ''}</div>`);
        }
        $('#cal').innerHTML = `<div class="card"><div class="calgrid">${['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'].map((x) => `<div class="ch">${x}</div>`).join('')}${cells.join('')}</div></div>`;
      };
      $('#cmon').onchange = load; load();
    },
    async attendance() {
      body.innerHTML = `<div class="page-head" style="margin-top:6px"><h2>سجل الحضور</h2><input type="month" id="amon" value="${thisMonth()}" style="width:auto"></div><div id="myatt"></div>`;
      const load = async () => {
        const rows = await api('/attendance/mine?month=' + $('#amon').value);
        $('#myatt').innerHTML = rows.length ? `<div class="tablewrap"><table><tr><th>اليوم</th><th>حضور</th><th>مكان الحضور</th><th>انصراف</th><th>تأخير</th><th>انصراف مبكر</th></tr>
          ${rows.map((a) => `<tr><td>${fmtDate(a.date)}</td><td>${fmtTime(a.check_in)}</td><td>${esc(a.in_loc || '—')}</td><td>${fmtTime(a.check_out)}</td><td class="${a.late_minutes ? 'neg' : ''}">${a.late_minutes} د</td><td class="${a.early_minutes ? 'neg' : ''}">${a.early_minutes} د</td></tr>`).join('')}</table></div>` : '<div class="card empty">لا توجد سجلات</div>';
      };
      $('#amon').onchange = load; load();
    },
    async payroll() {
      body.innerHTML = `<div class="page-head" style="margin-top:6px"><h2>مفردات المرتب</h2><input type="month" id="pmon" value="${thisMonth()}" style="width:auto"></div><div id="mypay"></div>`;
      const load = async () => { $('#mypay').innerHTML = payslip(await api('/payroll/mine?month=' + $('#pmon').value)); };
      $('#pmon').onchange = load; load();
    },
  };
  const open = (k) => { tab = k; document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === k)); draw[k](); };
  document.querySelectorAll('#tabs button').forEach((b) => (b.onclick = () => open(b.dataset.t)));
  draw[tab]();
};
const ADJ = { bonus: ['مكافأة', 'pos', '＋'], penalty: ['جزاء', 'neg', '−'], deduction: ['خصم', 'neg', '−'] };
function payslip(m) {
  const line = (k, v, c) => `<tr><td>${k}</td><td class="num ${c || ''}">${money(v)}</td></tr>`;
  return `<div class="grid g2" style="align-items:start"><div class="tablewrap"><table style="min-width:0">
    ${line(`الأساسي المستحق (${m.accrued_days} يوم من 30، أجر اليوم ${money(m.daily_rate)})`, m.accrued_basic)}${line('البدلات المستحقة', m.accrued_allowances)}${line('المكافآت', m.bonuses, 'pos')}${line(`وقت إضافي (${m.overtime_hours} س)`, m.overtime_pay, 'pos')}
    <tr><th>الإجمالي</th><th class="num">${money(m.gross)}</th></tr>
    ${line(`خصم تأخير (${m.late_days} يوم) وانصراف مبكر (${m.early_minutes} د)`, m.late_deduction, 'neg')}${line(`خصم غياب (${m.absent_days} يوم)`, m.absence_deduction, 'neg')}${line('جزاءات', m.penalties, 'neg')}${line('خصومات أخرى', m.manual_deductions, 'neg')}
    <tr><th>الصافي</th><th class="num">${money(m.net)}</th></tr></table></div>
    <div class="card"><div class="muted small">أيام العمل ${m.work_days} · حضور ${m.present_days} · غياب ${m.absent_days} · إجازات ${m.leave_days} · تأخير ${m.late_days} يوم (${m.late_minutes} د)</div>
    ${m.adjustments.length ? `<h3 style="margin:12px 0 6px">بنود إضافية</h3>${m.adjustments.map((a) => { const t = ADJ[a.kind] || ADJ.deduction; return `<div class="row small" style="justify-content:space-between"><span>${t[2]} ${t[0]}: ${esc(a.reason || '—')}</span><b class="${t[1]}">${money(a.amount)}</b></div>`; }).join('')}` : ''}</div></div>`;
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

/* --- تابات أعلى الصفحة (زي الشاشة) --- */
const tabsBar = (items, cur) => `<div class="tabs pagetabs">${items.map(([k, l, ic, n]) => `<button data-tab="${k}" class="${k === cur ? 'on' : ''}">${ico(ic)}<span>${l}</span>${n ? `<em class="cnt">${n}</em>` : ''}</button>`).join('')}</div>`;
const bindTabs = (root, fn) => root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => fn(b.dataset.tab)));
const financeTabs = (cur) => tabsBar([
  has('payroll.view') && ['payroll', 'المرتبات', 'dollar'], has('payroll.view') && ['adjustments', 'المكافآت والجزاءات والخصومات', 'gift'], has('settings.manage') && ['tiers', 'شرائح خصم التأخير', 'timer'],
].filter(Boolean), cur);
const TODAY_ST = {
  present: ['حضر', 'ok'], late: ['متأخر', 'warn'], absent: ['غائب', 'bad'], leave: ['في إجازة', 'info'], not_yet: ['لم يسجّل الحضور', ''], off: ['عطلة', ''],
};
const exportCsvBtn = (id) => `<button class="btn alt" id="${id}">${ico('download')} تصدير</button>`;

/* --- الموظفون --- */
PAGES.employees = async (view) => {
  const manage = has('employees.manage');
  const [all, resets, locs] = await Promise.all([api('/employees'), manage ? api('/password-resets') : [], manage || has('settings.manage') ? api('/locations').catch(() => []) : []]);
  const pend = all.filter((u) => u.pending), people = all.filter((u) => !u.pending);
  const sal = people.some((r) => r.base_salary !== undefined);
  const tab = S.emptab || 'list';
  const f = S.empf = S.empf || { role: '', dept: '', job: '', loc: '', status: '', q: '' };
  if (S.q) { f.q = S.q; S.q = ''; }
  const uniq = (k) => [...new Set(people.map((u) => u[k]).filter(Boolean))];
  const opts = (arr, cur, label) => `<option value="">${label}</option>${arr.map((x) => `<option value="${esc(x[0] ?? x)}" ${String(cur) === String(x[0] ?? x) ? 'selected' : ''}>${esc(x[1] ?? x)}</option>`).join('')}`;
  const match = (u) => {
    const q = f.q.toLowerCase();
    return (!q || [u.name, u.username, u.phone, u.job_title, u.department].some((x) => String(x || '').toLowerCase().includes(q)))
      && (!f.role || (f.role === 'admin') === !!u.is_admin) && (!f.dept || u.department === f.dept) && (!f.job || u.job_title === f.job)
      && (!f.loc || !locs.length || !u.location_ids.length || u.location_ids.includes(Number(f.loc)))
      && (!f.status || (f.status === 'active' ? u.active : f.status === 'inactive' ? !u.active : u.active && u.today && u.today.status === f.status));
  };
  const rows = people.filter(match);
  view.innerHTML = `${tabsBar([['list', 'الموظفون', 'users'], manage && ['pending', 'طلبات الحسابات', 'user', pend.length], manage && ['resets', 'استعادة كلمة المرور', 'lock', resets.length]].filter(Boolean), tab)}
    <div id="empbody"></div>`;
  bindTabs(view, (t) => { S.emptab = t; PAGES.employees(view); });
  const body = $('#empbody');
  const again = () => PAGES.employees(view);

  if (tab === 'pending') {
    body.innerHTML = pend.length ? `<div class="tablewrap"><table><tr><th>الاسم</th><th>اسم المستخدم</th><th>الهاتف</th><th>تاريخ الطلب</th><th></th></tr>
      ${pend.map((u) => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.username)}</td><td>${esc(u.phone || '—')}</td><td>—</td><td><button class="btn sm ok" data-ap="${u.id}">قبول</button> <button class="btn sm bad" data-rj="${u.id}">رفض</button></td></tr>`).join('')}</table></div>` : '<div class="card empty">لا توجد طلبات إنشاء حسابات</div>';
    body.querySelectorAll('[data-ap]').forEach((b) => (b.onclick = () => run(b, async () => { await api(`/employees/${b.dataset.ap}/approve`, 'POST'); toast('تم قبول الحساب'); again(); })));
    body.querySelectorAll('[data-rj]').forEach((b) => (b.onclick = () => { if (confirm('رفض الطلب ومسحه؟')) run(b, async () => { await api(`/employees/${b.dataset.rj}/reject`, 'POST'); toast('تم رفض الطلب'); again(); }); }));
    return;
  }
  if (tab === 'resets') {
    body.innerHTML = resets.length ? `<div class="tablewrap"><table><tr><th>الموظف</th><th>اسم المستخدم</th><th>ملاحظة</th><th>وقت الطلب (UTC)</th><th></th></tr>
      ${resets.map((r) => `<tr><td><b>${esc(r.name)}</b>${r.is_admin ? ' <span class="badge b-info">مدير</span>' : ''}</td><td>${esc(r.username)}</td><td>${esc(r.note || '—')}</td><td>${esc(r.created_at)}</td>
      <td><button class="btn sm" data-rs="${r.id}">إنشاء كلمة مؤقتة</button> <button class="btn alt sm" data-dm="${r.id}">تجاهل</button></td></tr>`).join('')}</table></div>` : '<div class="card empty">لا توجد طلبات استعادة كلمة مرور</div>';
    body.querySelectorAll('[data-dm]').forEach((b) => (b.onclick = () => run(b, async () => { await api(`/password-resets/${b.dataset.dm}/dismiss`, 'POST'); again(); })));
    body.querySelectorAll('[data-rs]').forEach((b) => (b.onclick = () => { if (confirm('إنشاء كلمة مرور مؤقتة جديدة؟ كلمة المرور القديمة هتتلغي.')) run(b, async () => {
      const r = await api(`/password-resets/${b.dataset.rs}/resolve`, 'POST');
      modal(`<h3>كلمة المرور المؤقتة</h3><p>سلّميها للموظف بشكل آمن. <b>مش هتظهر تاني</b>، وهيطلب منه النظام يغيّرها عند أول دخول.</p>
        <input readonly value="${esc(r.temp_password)}" style="font-size:22px;text-align:center;letter-spacing:2px;direction:ltr" onfocus="this.select()">
        <div class="actions"><button class="btn alt" id="cpy">نسخ</button><button class="btn" data-close>تم</button></div>`, (m) => {
        $('#cpy', m).onclick = () => { navigator.clipboard?.writeText(r.temp_password); toast('تم النسخ'); };
        m.onclose = again;
      });
    }); }));
    return;
  }

  const statChips = ['present', 'absent', 'late', 'leave', 'not_yet'];
  body.innerHTML = `<div class="card filters">
      <div class="frow">
        <select data-f="role">${opts([['admin', 'مدير'], ['employee', 'موظف']], f.role, 'الدور')}</select>
        <select data-f="dept">${opts(uniq('department'), f.dept, 'القسم')}</select>
        <select data-f="job">${opts(uniq('job_title'), f.job, 'المنصب')}</select>
        ${locs.length ? `<select data-f="loc">${opts(locs.map((l) => [l.id, l.name]), f.loc, 'المكان')}</select>` : ''}
        <label class="fsearch">${ico('search')}<input data-f="q" placeholder="بحث" value="${esc(f.q)}"></label>
      </div>
      <div class="frow">
        <select data-f="status">${opts([['active', 'نشط'], ['inactive', 'موقوف'], ...statChips.map((k) => [k, 'اليوم: ' + TODAY_ST[k][0]])], f.status, 'الحالة')}</select>
        <div class="chips">${ico('filter')}<span class="muted">الحالة</span>${statChips.map((k) => `<button class="fchip ${f.status === k ? 'on' : ''}" data-chip="${k}">${TODAY_ST[k][0]}</button>`).join('')}</div>
      </div></div>
    <div class="row actionbar">${manage ? `<button class="btn" id="add">${ico('plus')} موظف جديد</button>` : ''}${exportCsvBtn('exp')}
      <button class="link" id="reset">${ico('filter')} إعادة تعيين المرشحات</button><span class="muted small" style="margin-inline-start:auto">${rows.length} من ${people.length}</span></div>
    <div class="grid g3 ecards">${rows.map((u) => {
      const t = u.today, st = u.active && t ? TODAY_ST[t.status] : null;
      const line = !u.active ? ['bad', 'الحساب موقوف'] : t && (t.status === 'present' || t.status === 'late') ? [st[1], `${st[0]} ${fmtTime(t.check_in)}${t.late_minutes ? ' (' + t.late_minutes + ' د)' : ''}${t.check_out ? ' · انصرف ' + fmtTime(t.check_out) : ''}`] : st ? [st[1], st[0]] : ['', '—'];
      return `<div class="card ecard"><div class="ehead"><div class="avatar lg">${esc(initials(u.name))}</div>
        <div class="einfo"><b>${esc(u.name)}</b><span>${esc(u.job_title || '—')}</span><span>${esc(u.department || '')}</span></div>${u.is_admin ? '<span class="badge b-info">مدير</span>' : ''}</div>
        <div class="estat"><span class="sline ${line[0]}">${ico('clock')}${esc(line[1])}</span>
          ${has('attendance.edit') && u.active && t && ['absent', 'not_yet'].includes(t.status) ? `<button class="btn alt sm" data-in="${u.id}">${ico('clock')} تسجيل الحضور</button>` : ''}</div>
        <div class="eact"><button class="sqbtn" data-more="${u.id}" title="المزيد">${ico('dots')}</button>
          ${manage ? `<button class="sqbtn blue" data-e="${u.id}" title="تعديل">${ico('edit')}</button>` : ''}
          <button class="sqbtn" data-info="${u.id}" title="بيانات">${ico('info')}</button>
          ${u.phone ? `<a class="sqbtn" href="tel:${esc(u.phone)}" title="اتصال">${ico('phone')}</a>` : `<span class="sqbtn off">${ico('phone')}</span>`}</div></div>`;
    }).join('') || '<div class="card empty" style="grid-column:1/-1">لا يوجد موظفون بهذه المرشحات</div>'}</div>`;
  const redraw = () => PAGES.employees(view);
  body.querySelectorAll('[data-f]').forEach((el) => (el[el.tagName === 'INPUT' ? 'oninput' : 'onchange'] = () => {
    f[el.dataset.f] = el.value;
    if (el.tagName === 'INPUT') { clearTimeout(redraw.t); redraw.t = setTimeout(async () => { await redraw(); const i = view.querySelector('input[data-f=q]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); } else redraw();
  }));
  body.querySelectorAll('[data-chip]').forEach((b) => (b.onclick = () => { f.status = f.status === b.dataset.chip ? '' : b.dataset.chip; redraw(); }));
  $('#reset').onclick = () => { S.empf = null; redraw(); };
  $('#exp').onclick = () => csv('employees.csv', [['الاسم', 'اسم المستخدم', 'المسمى', 'القسم', 'الهاتف', 'الوردية', 'تاريخ التعيين', 'الحالة'], ...rows.map((u) => [u.name, u.username, u.job_title, u.department, u.phone, `${u.shift_start}-${u.shift_end}`, u.hire_date, u.active ? 'نشط' : 'موقوف'])]);
  const byId = (id) => all.find((x) => x.id == id);
  if (manage) {
    $('#add').onclick = () => empForm(null, redraw);
    body.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => empForm(byId(b.dataset.e), redraw)));
  }
  body.querySelectorAll('[data-in]').forEach((b) => (b.onclick = () => manualAtt(people, { user_id: Number(b.dataset.in), date: S.me.today_date, manual_new: true }, redraw)));
  body.querySelectorAll('[data-info]').forEach((b) => (b.onclick = () => {
    const u = byId(b.dataset.info);
    const kv = [['اسم المستخدم', u.username], ['الهاتف', u.phone || '—'], ['المسمى الوظيفي', u.job_title || '—'], ['القسم', u.department || '—'], ['تاريخ التعيين', u.hire_date], ['الوردية', `${fmt12(u.shift_start)} - ${fmt12(u.shift_end)}`],
      ['رصيد الإجازة السنوية', u.annual_leave_days + ' يوم'], ['بصمة الوجه', u.face_enrolled ? 'مسجلة' : 'غير مسجلة'],
      ['أماكن الحضور', u.location_ids.length ? u.location_ids.map((i) => (locs.find((l) => l.id === i) || {}).name).filter(Boolean).join('، ') : 'أي موقع'],
      ...(u.base_salary !== undefined && !u.is_admin ? [['المرتب الأساسي', money(u.base_salary)], ['البدلات', money(u.allowances)]] : [])];
    modal(`<div class="emp" style="margin-bottom:12px"><div class="avatar lg">${esc(initials(u.name))}</div><div class="info"><b>${esc(u.name)}</b><span class="muted small">${u.is_admin ? 'مدير' : 'موظف'}</span></div></div>
      <div class="kv">${kv.map(([k, v]) => `<div><span class="muted">${k}</span><b>${esc(v)}</b></div>`).join('')}</div><div class="actions"><button class="btn" data-close>إغلاق</button></div>`);
  }));
  body.querySelectorAll('[data-more]').forEach((b) => (b.onclick = () => {
    const u = byId(b.dataset.more);
    const o = modal(`<h3>${esc(u.name)}</h3><div class="grid">
      ${manage && u.face_enrolled && (!u.is_admin || S.me.user.is_admin) ? `<button class="btn alt qa" data-a="face">${ico('user')} إعادة ضبط بصمة الوجه</button>` : ''}
      ${manage && !u.is_admin ? `<button class="btn alt qa" data-a="active">${ico('lock')} ${u.active ? 'إيقاف الحساب' : 'تفعيل الحساب'}</button>` : ''}
      ${S.me.user.is_admin && !u.is_admin ? `<button class="btn alt qa" data-a="perm">${ico('lock')} تعديل الصلاحيات</button>` : ''}
      ${manage && (!u.is_admin || S.me.user.is_admin) ? `<button class="btn alt qa" data-a="pw">${ico('lock')} تعيين كلمة مرور جديدة</button>` : ''}
      <button class="btn alt qa" data-close>إغلاق</button></div>`);
    o.querySelectorAll('[data-a]').forEach((x) => (x.onclick = () => {
      const k = x.dataset.a;
      if (k === 'perm') { o.close(); return go('permissions'); }
      if (k === 'face') { if (!confirm('إعادة ضبط بصمة وجه الموظف؟ هيسجّلها من جديد.')) return; return run(x, async () => { await api(`/employees/${u.id}/reset-face`, 'POST'); o.close(); toast('تمت إعادة الضبط'); redraw(); }); }
      if (k === 'active') return run(x, async () => { await api('/employees/' + u.id, 'PUT', { active: !u.active }); o.close(); toast('تم'); redraw(); });
      if (k === 'pw') { const np = prompt('كلمة المرور المؤقتة الجديدة (6 أحرف على الأقل)'); if (!np) return; return run(x, async () => { await api('/employees/' + u.id, 'PUT', { password: np }); o.close(); toast('تم تعيين كلمة المرور، وهيغيّرها الموظف عند أول دخول'); }); }
    }));
  }));
};
async function empForm(u, done) {
  let locs = [];
  try { locs = await api('/locations'); } catch { /* مفيش صلاحية: نكمل من غير */ }
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
    ${locs.length ? `<div class="full"><div class="muted small" style="margin-bottom:4px;font-weight:600">مواقع الحضور المسموحة (لو ماحددتيش، يسجّل من أي موقع)</div><div class="row">${locs.map((l) => `<label class="perm"><input type="checkbox" data-loc="${l.id}" ${u?.location_ids?.includes(l.id) ? 'checked' : ''}>${esc(l.name)}</label>`).join('')}</div></div>` : ''}
    <label class="f">رصيد الإجازة السنوية (يوم)<input type="number" min="0" name="annual_leave_days" value="${u?.annual_leave_days ?? 21}"></label>
    ${S.me.user.is_admin && (isNew || u.id !== S.me.user.id) ? `<label class="f">نوع الحساب<select name="role"><option value="employee" ${u?.is_admin ? '' : 'selected'}>موظف (بصلاحيات يحددها المدير)</option><option value="admin" ${u?.is_admin ? 'selected' : ''}>مدير (كل الصلاحيات)</option></select></label>` : ''}
    ${!isNew && !u.is_admin ? `<label class="f">الحالة<select name="active"><option value="1" ${u.active ? 'selected' : ''}>نشط</option><option value="0" ${u.active ? '' : 'selected'}>موقوف</option></select></label>` : ''}
    <div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">حفظ</button></div></form>`);
  const f = $('#ef', o);
  f.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', f), async () => {
    const b = Object.fromEntries(new FormData(f));
    if (b.active !== undefined) b.active = b.active === '1';
    if (!b.password) delete b.password;
    if (locs.length) b.location_ids = [...f.querySelectorAll('[data-loc]:checked')].map((x) => Number(x.dataset.loc));
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
      <td>${a.in_face != null ? (100 - Math.round(a.in_face * 100)) + '%' : (a.note ? 'يدوي' : '—')}</td><td>${a.in_loc ? esc(a.in_loc) + ' ' : ''}${a.in_lat != null ? `<a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${a.in_lat},${a.in_lng}">خريطة</a>` : '—'}</td>
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
  const isEdit = a && !a.manual_new;
  const o = modal(`<h3>${isEdit ? 'تعديل سجل' : 'تسجيل حضور يدوي'}</h3><form class="form" id="mf">
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

/* --- المرتبات (المالية) --- */
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
PAGES.payroll = async (view) => {
  const cur = S.paym || thisMonth();
  const [yy, mm] = cur.split('-');
  const nowY = Number(thisMonth().slice(0, 4));
  const f = S.payf = S.payf || { emp: '', dept: '', q: '' };
  view.innerHTML = `${financeTabs('payroll')}
    <div class="card filters"><div class="frow">
      <select id="pmo">${MONTHS_AR.map((m, i) => `<option value="${String(i + 1).padStart(2, '0')}" ${Number(mm) === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select>
      <select id="pyr">${[nowY - 2, nowY - 1, nowY, nowY + 1].map((y) => `<option ${Number(yy) === y ? 'selected' : ''}>${y}</option>`).join('')}</select>
      <select id="pemp"></select><select id="pdep"></select>
      <label class="fsearch">${ico('search')}<input id="pq" placeholder="اسم الموظف" value="${esc(f.q)}"></label></div></div>
    <div class="row actionbar"><button class="btn alt" id="exp">${ico('download')} تصدير تقرير المرتبات</button><button class="btn alt" id="prt">${ico('print')} طباعة</button>
      <span class="muted small" id="pnote" style="margin-inline-start:auto"></span></div><div id="pt"></div>`;
  bindTabs(view, (t) => go(t));
  let data;
  const reload = () => { S.paym = `${$('#pyr').value}-${$('#pmo').value}`; PAGES.payroll(view); };
  $('#pmo').onchange = reload; $('#pyr').onchange = reload;
  $('#prt').onclick = () => print();
  const load = async () => {
    data = await api('/payroll?month=' + cur);
    const depts = [...new Set(data.rows.map((r) => r.department).filter(Boolean))];
    $('#pemp').innerHTML = `<option value="">كل الموظفين</option>${data.rows.map((r) => `<option value="${r.user_id}" ${String(f.emp) === String(r.user_id) ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}`;
    $('#pdep').innerHTML = `<option value="">كل الأقسام</option>${depts.map((d) => `<option ${f.dept === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}`;
    $('#pemp').onchange = () => { f.emp = $('#pemp').value; draw(); }; $('#pdep').onchange = () => { f.dept = $('#pdep').value; draw(); };
    $('#pq').oninput = () => { f.q = $('#pq').value; draw(); };
    draw();
  };
  const draw = () => {
    const q = f.q.trim().toLowerCase();
    const rows = data.rows.filter((r) => (!f.emp || String(r.user_id) === String(f.emp)) && (!f.dept || r.department === f.dept) && (!q || r.name.toLowerCase().includes(q)));
    const tot = (k) => rows.reduce((x, r) => x + (r[k] || 0), 0);
    const earned = (r) => round2c(r.accrued_basic + r.accrued_allowances);
    const cols = [
      ['الأساسي', 'tb', (r) => money(r.base_salary), () => money(tot('base_salary'))],
      ['البدلات', 'tb', (r) => money(r.allowances), () => money(tot('allowances'))],
      ['أيام محتسبة', 'tb', (r) => `${r.accrued_days} من 30`, () => ''],
      ['المستحق عن الأيام', 'tb', (r) => money(earned(r)), () => money(rows.reduce((x, r) => x + earned(r), 0))],
      ['المكافآت', 'tg', (r) => money(r.bonuses), () => money(tot('bonuses'))],
      ['الوقت الإضافي', 'tg', (r) => money(r.overtime_pay), () => money(tot('overtime_pay'))],
      ['خصم التأخير', 'tp', (r) => money(r.late_deduction), () => money(tot('late_deduction'))],
      ['خصم الغياب', 'tp', (r) => money(r.absence_deduction), () => money(tot('absence_deduction'))],
      ['الجزاءات', 'tp', (r) => money(r.penalties), () => money(tot('penalties'))],
      ['خصومات أخرى', 'tp', (r) => money(r.manual_deductions), () => money(tot('manual_deductions'))],
      ['مستحق الدفع', 'tn', (r) => money(r.net), () => money(tot('net'))],
    ];
    $('#pnote').textContent = `${MONTHS_AR[Number(mm) - 1]} ${yy} · محسوب لحد ${data.month === thisMonth() ? 'اليوم' : 'نهاية الشهر'}`;
    $('#pt').innerHTML = `<div class="tablewrap ptwrap"><table class="ptable"><tr><th class="who">الموظف</th>${cols.map(([h, c]) => `<th class="${c}">${h}</th>`).join('')}</tr>
      ${rows.map((r) => `<tr><td class="who"><b>${esc(r.name)}</b><div class="muted small">حضور ${r.present_days} · غياب ${r.absent_days} · تأخير ${r.late_days} يوم</div>
        <div class="noprint pact2">${has('payroll.manage') ? `<button class="link" data-adj="${r.user_id}">+ بند</button>` : ''}<button class="link" data-sl="${r.user_id}">تفاصيل</button></div></td>${cols.map(([, c, fn]) => `<td class="${c}">${fn(r)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length + 1}" class="empty">لا توجد بيانات</td></tr>`}
      <tr class="totrow"><th class="who">الإجمالي (${rows.length})</th>${cols.map(([, c, , t]) => `<th class="${c}">${t()}</th>`).join('')}</tr></table></div>
      <p class="muted small">المرتب بيتحسب يوم بيوم: كل يوم بيعدّي بيستحق فيه الموظف أجر يوم = (الأساسي + البدلات) ÷ 30 (والشهر المنتهي = 30 يوم كاملين). بعدين بيتزود عليه المكافآت والوقت الإضافي، وبيتخصم منه التأخير (من شرائح خصم التأخير) والغياب (أيام الغياب × أجر اليوم) والجزاءات والخصومات. الناتج = مستحق الدفع.</p>`;
    view.querySelectorAll('[data-adj]').forEach((b) => (b.onclick = () => adjForm(data.rows.find((r) => r.user_id == b.dataset.adj), data.month, load)));
    view.querySelectorAll('[data-sl]').forEach((b) => (b.onclick = () => {
      const r = data.rows.find((x) => x.user_id == b.dataset.sl);
      const o = modal(`<h3>${esc(r.name)} — ${data.month}</h3>${payslip(r)}${has('payroll.manage') && r.adjustments.length ? `<h3 style="margin:14px 0 6px">حذف بند</h3>${r.adjustments.map((a) => `<div class="row small" style="justify-content:space-between"><span>${(ADJ[a.kind] || ADJ.deduction)[0]} ${money(a.amount)} — ${esc(a.reason)}</span><button class="btn alt sm" data-rm="${a.id}">حذف</button></div>`).join('')}` : ''}<div class="actions"><button class="btn" data-close>إغلاق</button></div>`);
      o.querySelectorAll('[data-rm]').forEach((x) => (x.onclick = () => run(x, async () => { await api('/adjustments/' + x.dataset.rm, 'DELETE'); o.close(); load(); })));
    }));
    $('#exp').onclick = () => csv(`payroll-${data.month}.csv`, [['الموظف', ...cols.map((c) => c[0])], ...rows.map((r) => [r.name, ...cols.map((c) => c[2](r))]), ['الإجمالي', ...cols.map((c) => c[3]())]]);
  };
  load();
};
const round2c = (n) => Math.round(n * 100) / 100;
function adjForm(r, month, done) {
  const o = modal(`<h3>مكافأة / جزاء / خصم — ${esc(r.name)}</h3><form class="form" id="af">
    <label class="f">النوع<select name="kind"><option value="bonus">مكافأة</option><option value="penalty">جزاء</option><option value="deduction">خصم</option></select></label>
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
  const emps = (await api('/employees')).filter((e) => !e.is_admin && !e.pending);
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
    <div class="full card" style="background:var(--bg)"><div class="row" style="justify-content:space-between"><h3>مواقع العمل</h3><button type="button" class="btn sm" id="locadd">+ موقع جديد</button></div>
      <p class="muted small" style="margin:4px 0 10px">الموظف مش بيقدر يسجّل حضور أو انصراف إلا لو كان داخل نطاق أحد المواقع المسموحة له. تحددي المواقع المسموحة لكل موظف من «الموظفون ← تعديل». لو الموظف معندوش مواقع محددة، بيقدر يسجّل من أي موقع هنا. ولو مفيش مواقع خالص، مش بيتم التحقق من الموقع.</p>
      <div id="loclist"></div></div>
    <label class="perm full"><input type="checkbox" name="signup_enabled" value="1" ${s.signup_enabled !== '0' ? 'checked' : ''}>السماح بإنشاء حساب جديد من صفحة الدخول (بيحتاج موافقتك)</label>
    <label class="f">سماح التأخير (دقيقة)<input type="number" name="grace_minutes" min="0" value="${esc(s.grace_minutes)}"></label>
    <label class="f">حساسية مطابقة الوجه (0.3 أشد – 0.7 أخف)<input type="number" step="0.05" min="0.3" max="0.7" name="face_threshold" value="${esc(s.face_threshold)}"></label>
    <label class="f">معامل خصم التأخير<input type="number" step="0.25" min="0" name="late_factor" value="${esc(s.late_factor)}"></label>
    <label class="f">معامل خصم الغياب (يوم)<input type="number" step="0.25" min="0" name="absence_factor" value="${esc(s.absence_factor)}"></label>
    <label class="f">معامل الوقت الإضافي<input type="number" step="0.25" min="0" name="overtime_factor" value="${esc(s.overtime_factor)}"></label>
    <div class="full"><div class="muted small" style="margin-bottom:6px;font-weight:600">أيام الإجازة الأسبوعية</div><div class="row">${days.map((d, i) => `<label class="perm"><input type="checkbox" data-d="${i}" ${wk.includes(i) ? 'checked' : ''}>${d}</label>`).join('')}</div></div>
    <div class="actions full" style="justify-content:flex-start"><button class="btn">حفظ الإعدادات</button></div></form>`;
  const loadLocs = async () => {
    const locs = await api('/locations');
    $('#loclist').innerHTML = locs.map((l) => `<div class="row" style="justify-content:space-between;padding:8px 0;border-top:1px solid var(--line)"><div class="info"><b>${esc(l.name)}</b> <span class="muted small">نطاق ${l.radius_m} م · ${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}</span></div>
      <div class="row"><button type="button" class="btn alt sm" data-le="${l.id}">تعديل</button><button type="button" class="btn alt sm" data-ld="${l.id}">حذف</button></div></div>`).join('') || '<div class="muted small">مفيش مواقع مضافة.</div>';
    $('#loclist').querySelectorAll('[data-le]').forEach((b) => (b.onclick = () => locForm(locs.find((x) => x.id == b.dataset.le), loadLocs)));
    $('#loclist').querySelectorAll('[data-ld]').forEach((b) => (b.onclick = () => { if (confirm('حذف الموقع ده؟')) run(b, async () => { await api('/locations/' + b.dataset.ld, 'DELETE'); loadLocs(); }); }));
  };
  $('#locadd').onclick = () => locForm(null, loadLocs);
  loadLocs();
  $('#sf').onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', e.target), async () => {
    const b = Object.fromEntries(new FormData(e.target));
    b.signup_enabled = e.target.signup_enabled.checked ? '1' : '0';
    b.weekend_days = [...document.querySelectorAll('[data-d]:checked')].map((x) => x.dataset.d).join(',');
    await api('/settings', 'PUT', b); S.me = await api('/me'); toast('تم حفظ الإعدادات');
  }); };
};

function locForm(l, done) {
  const o = modal(`<h3>${l ? 'تعديل موقع' : 'موقع عمل جديد'}</h3><form class="form" id="lcf">
    <label class="f full">اسم الموقع (مثلاً: الإدارة)<input name="name" value="${esc(l?.name)}" required maxlength="60"></label>
    <label class="f">خط العرض<input name="lat" value="${esc(l?.lat ?? '')}" inputmode="decimal" required></label>
    <label class="f">خط الطول<input name="lng" value="${esc(l?.lng ?? '')}" inputmode="decimal" required></label>
    <label class="f">النطاق المسموح (متر)<input type="number" name="radius_m" min="20" max="5000" value="${l?.radius_m ?? 150}" required></label>
    <div style="align-self:end"><button type="button" class="btn alt" id="here" style="width:100%">استخدام موقعي الحالي</button></div>
    <p class="muted small full" style="margin:0">الأفضل تفتحي الصفحة وانتِ في مكان العمل وتضغطي «استخدام موقعي الحالي».</p>
    <div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">حفظ</button></div></form>`);
  const f = $('#lcf', o);
  $('#here', o).onclick = (e) => run(e.target, async () => { const p = await getPos(); f.lat.value = p.lat.toFixed(6); f.lng.value = p.lng.toFixed(6); toast(`تم التقاط الموقع (دقة ~${Math.round(p.acc)} م)`); });
  f.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', f), async () => {
    const b = { name: f.name.value, lat: f.lat.value, lng: f.lng.value, radius_m: f.radius_m.value };
    await api(l ? '/locations/' + l.id : '/locations', l ? 'PUT' : 'POST', b);
    o.close(); toast('تم الحفظ'); done();
  }); };
}

/* --- المكافآت والجزاءات والخصومات --- */
PAGES.adjustments = async (view) => {
  view.innerHTML = `${financeTabs('adjustments')}<div class="page-head"><h2>المكافآت والجزاءات والخصومات</h2><div class="row noprint">
    <input type="month" id="am" value="${thisMonth()}" style="width:auto">
    <select id="ak" style="width:auto"><option value="">كل الأنواع</option><option value="bonus">مكافآت</option><option value="penalty">جزاءات</option><option value="deduction">خصومات</option></select>
    ${has('payroll.manage') ? '<button class="btn" id="aadd">+ إضافة بند</button>' : ''}</div></div><div id="at"></div>`;
  bindTabs(view, (t) => go(t));
  let data;
  const load = async () => {
    data = await api('/adjustments?month=' + $('#am').value);
    const kind = $('#ak').value;
    const rows = data.rows.filter((r) => !kind || r.kind === kind);
    const sum = (k) => data.rows.filter((r) => r.kind === k).reduce((s, r) => s + r.amount, 0);
    $('#at').innerHTML = `<div class="grid g3" style="margin-bottom:12px">
      <div class="card"><div class="muted small">إجمالي المكافآت</div><b class="pos" style="font-size:22px">${money(sum('bonus'))}</b></div>
      <div class="card"><div class="muted small">إجمالي الجزاءات</div><b class="neg" style="font-size:22px">${money(sum('penalty'))}</b></div>
      <div class="card"><div class="muted small">إجمالي الخصومات</div><b class="neg" style="font-size:22px">${money(sum('deduction'))}</b></div></div>
      <div class="tablewrap"><table><tr><th>التاريخ</th><th>الموظف</th><th>النوع</th><th class="num">المبلغ</th><th>السبب</th><th>بواسطة</th><th class="noprint"></th></tr>
      ${rows.map((r) => { const t = ADJ[r.kind] || ADJ.deduction; return `<tr><td>${esc(String(r.created_at || '').slice(0, 10))}</td><td><b>${esc(r.user_name)}</b></td><td><span class="badge ${r.kind === 'bonus' ? 'b-ok' : 'b-bad'}">${t[0]}</span></td><td class="num ${t[1]}">${money(r.amount)}</td><td style="white-space:normal">${esc(r.reason || '—')}</td><td class="muted small">${esc(r.created_by_name || '—')}</td><td class="noprint">${has('payroll.manage') ? `<button class="btn alt sm" data-rm="${r.id}">حذف</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">لا توجد بنود في هذا الشهر</td></tr>'}</table></div>
      <p class="muted small">أي بند هنا بيتحسب تلقائياً في مرتب الموظف عن الشهر المحدد (صفحة المرتبات وكشف حساب الموظف): المكافآت بتزيد المرتب، والجزاءات والخصومات بتنقصه.</p>`;
    view.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { if (confirm('حذف البند ده؟')) run(b, async () => { await api('/adjustments/' + b.dataset.rm, 'DELETE'); toast('تم الحذف'); load(); }); }));
  };
  $('#am').onchange = load; $('#ak').onchange = load;
  if ($('#aadd')) $('#aadd').onclick = () => {
    const o = modal(`<h3>إضافة بند</h3><form class="form" id="nf">
      <label class="f full">الموظف<select name="user_id" required><option value="">اختاري الموظف</option>${data.employees.map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></label>
      <label class="f">النوع<select name="kind"><option value="bonus">مكافأة</option><option value="penalty">جزاء</option><option value="deduction">خصم</option></select></label>
      <label class="f">المبلغ<input type="number" step="0.01" min="0.01" name="amount" required></label>
      <label class="f">عن شهر<input type="month" name="month" value="${$('#am').value}" required></label>
      <label class="f full">السبب<input name="reason" maxlength="200" required></label>
      <div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">إضافة</button></div></form>`);
    const f = $('#nf', o);
    f.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', f), async () => {
      await api('/adjustments', 'POST', { user_id: f.user_id.value, month: f.month.value, kind: f.kind.value, amount: f.amount.value, reason: f.reason.value });
      o.close(); toast('تمت الإضافة'); load();
    }); };
  };
  load();
};

/* --- شرائح خصم التأخير --- */
PAGES.tiers = async (view) => {
  const [{ tiers }, st] = await Promise.all([api('/late-tiers'), api('/settings')]);
  let rows = tiers.map((t) => ({ ...t }));
  const grace = parseInt(st.grace_minutes, 10) || 0;
  const startAt = `${9 + Math.floor(grace / 60)}:${String(grace % 60).padStart(2, '0')}`;
  const isOpen = (v) => v === '' || v === null || v === undefined;
  const sync = () => {
    view.querySelectorAll('tr[data-i]').forEach((tr) => {
      const r = rows[Number(tr.dataset.i)];
      tr.querySelectorAll('[data-f]').forEach((el) => { r[el.dataset.f] = el.value; });
    });
  };
  const calc = () => {
    sync();
    const sal = Number($('#tsal').value), min = Number($('#tmin').value);
    if (!(sal > 0) || !(min > 0)) { $('#tres').textContent = ''; return; }
    if (!rows.length) { $('#tres').textContent = 'مفيش شرائح محفوظة: الخصم بالدقيقة (دقائق التأخير ÷ 60 × أجر الساعة)'; return; }
    const t = rows.find((x) => min >= Number(x.from_minutes) && (isOpen(x.to_minutes) || min <= Number(x.to_minutes)));
    $('#tres').textContent = t ? `الخصم: ${money(t.kind === 'fixed' ? Number(t.value) : Number(t.value) * (sal / 30))} جنيه` : 'لا يوجد خصم (التأخير ده خارج الشرائح)';
  };
  const draw = () => {
    const lastT = rows[rows.length - 1];
    view.innerHTML = `${financeTabs('tiers')}<div class="page-head"><h2>شرائح خصم التأخير</h2></div>
      <div class="card" style="margin-bottom:12px"><p>التأخير بيتحسب بالدقايق من <b>بداية وردية الموظف</b>، وبيبدأ بعد فترة السماح (حالياً <b>${grace} دقايق</b>؛ يعني لو الوردية 9:00 الخصم بيبدأ بعد ${startAt}). فترة السماح تتغير من صفحة الإعدادات.</p>
      <p class="muted small" style="margin-top:6px">حددي لكل شريحة تأخير (من – إلى بالدقيقة) الخصم اللي يتطبق على اليوم ده: إما <b>جزء من أجر اليوم</b> (مثلاً 0.25 = ربع يوم، وأجر اليوم = الأساسي ÷ 30) أو <b>مبلغ ثابت</b> بالجنيه. سيبي خانة «إلى» فاضية للشريحة الأخيرة (وما فوق). لو مفيش شرائح محفوظة، النظام بيخصم بالدقيقة (دقائق التأخير ÷ 60 × أجر الساعة).</p></div>
      <div class="tablewrap"><table style="min-width:620px"><tr><th>من (دقيقة)</th><th>إلى (دقيقة)</th><th>نوع الخصم</th><th>القيمة</th><th></th></tr>
      ${rows.map((r, i) => `<tr data-i="${i}">
        <td><input type="number" min="1" data-f="from_minutes" value="${esc(r.from_minutes)}" style="width:90px"></td>
        <td><input type="number" min="1" data-f="to_minutes" value="${esc(r.to_minutes ?? '')}" placeholder="وما فوق" style="width:110px"></td>
        <td><select data-f="kind"><option value="day_fraction" ${r.kind === 'day_fraction' ? 'selected' : ''}>جزء من أجر اليوم</option><option value="fixed" ${r.kind === 'fixed' ? 'selected' : ''}>مبلغ ثابت (جنيه)</option></select></td>
        <td><input type="number" step="0.01" min="0.01" data-f="value" value="${esc(r.value ?? '')}" style="width:100px"></td>
        <td><button class="btn alt sm" data-rm="${i}">حذف</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">مفيش شرائح. الخصم حالياً بالدقيقة.</td></tr>'}</table></div>
      ${lastT && !isOpen(lastT.to_minutes) ? `<p class="neg small" style="margin-top:8px">تنبيه: أي تأخير أكبر من ${esc(lastT.to_minutes)} دقيقة مش هيتخصم، لأن آخر شريحة ليها حد أعلى. سيبي خانة «إلى» فاضية في آخر شريحة لو عايزاها تشمل أي تأخير أكبر.</p>` : ''}
      <div class="row" style="margin-top:12px"><button class="btn alt" id="tadd">+ إضافة شريحة</button><button class="btn" id="tsave">حفظ الشرائح</button></div>
      <div class="card" style="margin-top:14px"><h3 style="margin-bottom:8px">جرّبي حساب خصم</h3><div class="row"><input type="number" id="tsal" placeholder="المرتب الأساسي" style="width:170px"><input type="number" id="tmin" placeholder="دقايق التأخير" style="width:150px"><b id="tres"></b></div></div>`;
    bindTabs(view, (t) => go(t));
    view.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { sync(); rows.splice(Number(b.dataset.rm), 1); draw(); }));
    $('#tadd').onclick = () => {
      sync();
      const last = rows[rows.length - 1];
      const from = !last ? grace + 1 : (isOpen(last.to_minutes) ? '' : Number(last.to_minutes) + 1);
      rows.push({ from_minutes: from, to_minutes: '', kind: 'day_fraction', value: '' });
      draw();
    };
    $('#tsave').onclick = (e) => run(e.target, async () => {
      sync();
      const r = await api('/late-tiers', 'PUT', { tiers: rows.map((x) => ({ from_minutes: x.from_minutes, to_minutes: x.to_minutes, kind: x.kind, value: x.value })) });
      rows = r.tiers.map((t) => ({ ...t }));
      draw(); toast('تم حفظ الشرائح');
    });
    ['#tsal', '#tmin'].forEach((id) => ($(id).oninput = calc));
    view.querySelectorAll('[data-f]').forEach((el) => (el.oninput = calc));
  };
  draw();
};

/* ====== تشغيل ====== */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
if (S.token) boot(); else renderLogin();
