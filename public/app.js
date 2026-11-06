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
const monthRange = (m) => { const [y, mo] = m.split('-').map(Number); return [`${m}-01`, `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}`]; };
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
  pin: '<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  dollar: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9a2.5 2 0 0 0-2.5-1.5c-1.5 0-2.5.8-2.5 1.8 0 2.6 5 1.4 5 4 0 1-1 1.8-2.5 1.8A2.7 2 0 0 1 9.5 14.5M12 6v1.5M12 16.5V18"/>',
  print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/>',
  building: '<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M15 9h3a2 2 0 0 1 2 2v10M2 21h20M8 7h3M8 11h3M8 15h3"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  audit: '<path d="M4 6h10M4 12h6M4 18h8"/><circle cx="17" cy="15" r="3"/><path d="M19.5 17.5L22 20"/>',
  pause: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
  key: '<circle cx="8" cy="14" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
  clockoff: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2M4 4l16 16"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/>',
};
const ico = (n, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</svg>`;
// تثبيت التطبيق: في المتصفح بس (لو مثبّت فعلاً الزرار ما بيظهرش)
const IS_APP = document.documentElement.classList.contains('is-app');
let installEv = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEv = e; });
function installApp() {
  if (installEv) { installEv.prompt(); installEv.userChoice.finally(() => { installEv = null; }); return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  modal(`<h3>تثبيت التطبيق</h3><p>${ios ? 'من Safari: اضغطي زرار المشاركة <b>⬆</b> ثم <b>إضافة إلى الشاشة الرئيسية</b>.' : 'من قائمة المتصفح (⋮): اختاري <b>تثبيت التطبيق</b> أو <b>إضافة إلى الشاشة الرئيسية</b>.'}</p>
    <p class="muted small">بعد التثبيت افتحيه من أيقونته على الشاشة، وهيظهر كتطبيق بشريط سفلي من غير شريط المتصفح.</p><div class="actions"><button class="btn" data-close>تمام</button></div>`);
}
// قائمة بمجموعات (زي الشاشة): عنصر مفرد أو مجموعة فيها عناصر فرعية
const MENU = [
  { id: 'dashboard', ic: 'grid', t: 'لوحة المعلومات', ok: () => has('dashboard.view') },
  { id: 'me', ic: 'user', t: 'حسابي', ok: () => true },
  { g: 'emp', ic: 'users', t: 'الموظفون', items: [
    ['employees', 'الموظفون', () => has('employees.view'), 'users'], ['workgroups', 'مجموعات العمل', () => has('employees.view'), 'clock'],
    ['teams', 'فرق العمل', () => has('employees.view'), 'users'], ['emp_procedures', 'إجراءات الموظفين', () => has('employees.view'), 'user'],
    ['emp_docs', 'مستندات الموظفين', () => has('employees.view'), 'file'], ['org_chart', 'الهيكل التنظيمي', () => has('employees.view'), 'grid'],
    ['transfers_log', 'سجل النقل', () => has('employees.view'), 'file'], ['title_changes', 'تغيير المسمى الوظيفي', () => has('employees.view'), 'users'],
    ['suspension_log', 'سجل الإيقاف', () => has('employees.view'), 'file'], ['pending_suspensions', 'الإيقافات المعلقة', () => has('employees.view'), 'file'],
    ['permissions', 'الصلاحيات', () => S.me.user.is_admin, 'lock']] },
  { id: 'requests', ic: 'file', t: 'الطلبات', ok: () => has('requests.view_all') },
  { g: 'att', ic: 'clock', t: 'الحضور', items: [
    ['home', 'تسجيل الحضور', () => true], ['attendance', 'سجل الحضور', () => has('attendance.view_all')]] },
  { g: 'fin', ic: 'wallet', t: 'المالية', items: [
    ['payroll', 'المرتبات والخصومات', () => has('payroll.view')], ['adjustments', 'المكافآت والجزاءات', () => has('payroll.view')], ['tiers', 'شرائح خصم التأخير', () => has('settings.manage')]] },
  { id: 'reports', ic: 'chart', t: 'التقارير', ok: () => has('reports.view') },
  { g: 'set', ic: 'sliders', t: 'الإعدادات', items: [
    ['set_company', 'شركة', () => has('settings.manage'), 'building'], ['set_attendance', 'الحضور', () => has('settings.manage'), 'clock'],
    ['set_finance', 'المالية', () => has('settings.manage'), 'wallet'], ['set_documents', 'المستندات', () => has('settings.manage'), 'file'],
    ['set_automation', 'قواعد أتمتة النظام', () => has('settings.manage')], ['set_overrides', 'قواعد تجاوز الإشعارات', () => has('settings.manage')],
    ['set_misc', 'إعدادات متنوعة', () => has('settings.manage'), 'sliders']] },
];
const menuVisible = () => MENU.map((m) => (m.g ? { ...m, items: m.items.filter((i) => i[2]()) } : m)).filter((m) => (m.g ? m.items.length : m.ok()));
const allPages = () => menuVisible().flatMap((m) => (m.g ? m.items.map((i) => i[0]) : [m.id]));
function go(page, opts = {}) { S.page = page; if (opts.tab) S.metab = opts.tab; S.q = opts.q || ''; renderShell(); window.scrollTo(0, 0); }
function menuHtml(sheet) {
  return menuVisible().map((m) => {
    if (!m.g) return `<button class="navi ${m.id === S.page ? 'on' : ''}" data-p="${m.id}">${ico(m.ic)}<span>${m.t}</span></button>`;
    const has_on = m.items.some((i) => i[0] === S.page), open = sheet || has_on || S.open[m.g];
    return `<div class="navgrp ${open ? 'open' : ''} ${has_on ? 'cur' : ''}"><button class="navi navg" data-g="${m.g}">${ico(m.ic)}<span>${m.t}</span>${ico('chev', 'chev')}</button>
      <div class="sub">${m.items.map((i) => `<button class="navi sm ${i[0] === S.page ? 'on' : ''}" data-p="${i[0]}">${i[3] ? ico(i[3]) : ''}<span>${i[1]}</span></button>`).join('')}</div></div>`;
  }).join('');
}
function menuSheet() {
  const o = modal(`<h3>القائمة</h3><nav class="nav sheetnav">${menuHtml(true)}</nav>
    <div class="row" style="margin-top:14px"><button class="btn alt" id="spw" style="flex:1">${ico('lock')} كلمة المرور</button><button class="btn alt" id="slo" style="flex:1">${ico('logout')} خروج</button></div>
    ${IS_APP ? '' : `<button class="btn alt" id="sin" style="width:100%;margin-top:8px">${ico('download')} تثبيت التطبيق</button>`}`);
  o.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { o.close(); go(b.dataset.p); }));
  $('#spw', o).onclick = () => { o.close(); changePassword(); };
  $('#slo', o).onclick = () => { o.close(); logout(); };
  if ($('#sin', o)) $('#sin', o).onclick = () => { o.close(); installApp(); };
}
function renderShell() {
  S.open = S.open || {};
  if (!allPages().includes(S.page) && !(IS_APP && (S.page === 'menu' || S.page === 'dashboard'))) S.page = 'home';
  S.pg = {};
  const u = S.me.user, canSearch = has('employees.view');
  const third = has('employees.view') ? ['employees', 'الموظفون', 'b_team'] : ['me:attendance', 'سجلي', 'b_clock'];
  const bnav = [['home', 'الجدول', 'b_sched'], ['dashboard', 'لوحة المعلومات', 'b_dash'], null, third, ['menu', 'القائمة', 'b_menu']];
  const isOn = (k) => (k === 'menu' ? !['home', 'dashboard', third[0] === 'employees' ? 'employees' : 'me'].includes(S.page) : (k === S.page || (k === 'me:attendance' && S.page === 'me')));
  $('#app').innerHTML = `<div class="shell">
    <header class="topbar">
      <button class="iconbtn hmb" id="hmb" aria-label="القائمة">${ico('menu')}</button>
      <div class="brand"><img src="/icon.svg" alt=""><span>${esc(S.me.settings.company_name)}</span></div>
      ${canSearch ? `<form class="search" id="srch">${ico('search')}<input id="sq" placeholder="ابحثي عن موظف بالاسم أو اسم المستخدم أو الهاتف..." autocomplete="off"></form>` : '<div class="grow"></div>'}
      <div class="chip" id="cdate">${ico('calendar')}<span dir="ltr"></span></div>
      <div class="chip" id="cclk">${ico('clock')}<span dir="ltr">--:--:--</span></div>
      <button class="iconbtn" id="bell">${ico('bell')}${S.me.unread ? `<span class="dot">${S.me.unread}</span>` : ''}</button>
      <div class="usermenu"><button class="chip userchip" id="um"><span class="avatar sm">${esc(initials(u.name))}</span><span class="uname">${esc(u.name)}</span>${ico('chev')}</button>
        <div class="dropdown" id="umd" hidden>${IS_APP ? '' : `<button id="inst">${ico('download')} تثبيت التطبيق</button>`}<button id="pw">${ico('lock')} تغيير كلمة المرور</button><button id="lo">${ico('logout')} تسجيل الخروج</button></div></div>
    </header>
    <aside class="side"><div class="side-head">${ico('menu')}<span>القائمة</span></div><nav class="nav" id="nav">${menuHtml(false)}</nav></aside>
    ${IS_APP ? appHeader() : `<header class="mtop"><div class="avatar big">${esc(initials(u.name))}</div>
      <div class="info"><b>${esc(u.name)}</b><span>${esc(u.job_title || (u.is_admin ? 'مدير النظام' : 'موظف'))}</span><span>${esc(u.department || '')}</span></div>
      <button class="iconbtn" id="mbell">${ico('bell')}${S.me.unread ? `<span class="dot">${S.me.unread}</span>` : ''}</button></header>`}
    <main class="content" id="view"></main>
    <nav class="bottom"><div class="bbg" aria-hidden="true"><i></i><svg viewBox="0 0 128 66" preserveAspectRatio="none"><path d="M0 0C26 0 30 31 64 31S102 0 128 0V66H0z"/></svg><i></i></div>${bnav.map((n) => (n ? `<button data-b="${n[0]}" class="${isOn(n[0]) ? 'on' : ''}"><span class="bi">${fi(n[2])}</span><span>${n[1]}</span></button>` : '<span class="gap"></span>')).join('')}
      <button class="fab" id="fab" aria-label="إضافة">${fi('plus')}</button></nav>
  </div>`;
  const bind = (root) => {
    root.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => go(b.dataset.p)));
    root.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => { S.open[b.dataset.g] = !b.parentElement.classList.contains('open'); b.parentElement.classList.toggle('open'); }));
  };
  bind($('#nav'));
  document.querySelectorAll('.bottom [data-b]').forEach((b) => (b.onclick = () => {
    const k = b.dataset.b;
    if (k === 'menu') { if (IS_APP) go('menu'); else menuSheet(); } else if (k === 'me:attendance') go('me', { tab: 'attendance' }); else { if (k === 'employees') S.emptab = 'list'; go(k); }
  }));
  $('#fab').onclick = quickSheet;
  if ($('#hmb')) $('#hmb').onclick = menuSheet;
  if ($('#inst')) $('#inst').onclick = installApp;
  $('#bell').onclick = showNotes; if ($('#mbell')) $('#mbell').onclick = showNotes;
  if (IS_APP) bindAppHeader();
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
  if (S.me.unread) { await api('/notifications/read', 'POST'); S.me.unread = 0; document.querySelectorAll('#bell .dot, #abell .dot, #mbell .dot').forEach((d) => d.remove()); }
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
      const d = u.face_exempt ? null : await captureFace(type === 'in' ? 'تأكيد الوجه للحضور' : 'تأكيد الوجه للانصراف');
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
const gbp = (n) => `${money(n)} £`;
const dmy = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');
const dmyDash = (d) => `${new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })} ${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;
const clock12 = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: TZ }) : '');
const shiftLabel = (a, b) => {
  const f = (hhmm, sep) => { const [h, m] = hhmm.split(':').map(Number); return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''}${sep}${h >= 12 ? 'pm' : 'am'}`; };
  return `(${f(a, ' ')}-${f(b, '.')})`;
};
const monthName = (m) => `${MONTHS_AR[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
const daysBetween = (a, b) => { let n = 0; for (let d = a; d <= b; d = addDays(d, 1)) n++; return n; };

/* كشف المرتب (مفردات المرتب): نفس الـ HTML للعرض والطباعة */
function slipHtml(m) {
  const mo = m.month, last = monthRange(mo)[1];
  const L = (k, v, cls = '') => `<div class="sl ${cls}"><span>${k}</span><b>${v}</b></div>`;
  const earned = m.accrued_basic + m.accrued_allowances;
  return `<div class="slipcard"><div class="slhead"><div><div class="muted small">${esc(S.me.settings.company_name)}</div><h3>${esc(m.name)}</h3><div class="muted small">${esc([m.job_title, m.department].filter(Boolean).join(' · '))}</div></div>
      <div class="slper"><div class="muted small">فترة الصرف</div><b dir="ltr">${dmy(mo + '-01')} - ${dmy(last)}</b><div class="muted small">${m.paid ? 'مدفوع ' + dmy(String(m.paid_at).slice(0, 10)) : 'قيد الحساب (لم يُصرف بعد)'}</div></div></div>
    <div class="slsec">المستحقات</div>
    ${L(`المرتب الأساسي المستحق <small class="muted">(${m.accrued_days} يوم من 30 · أجر اليوم ${money(m.daily_rate)})</small>`, gbp(m.accrued_basic))}${L('البدلات المستحقة', gbp(m.accrued_allowances))}${L('إجمالي المرتب', gbp(earned), 'tot')}
    ${L('المكافآت', gbp(m.bonuses))}${L(`وقت إضافي <small class="muted">(${m.overtime_hours} س)</small>`, gbp(m.overtime_pay))}${m.compensation_pay ? L('تعويض العمل في العطلات', gbp(m.compensation_pay)) : ''}
    <div class="slsec">الاستقطاعات</div>
    ${L(`خصم التأخير <small class="muted">(${m.late_days} يوم${m.early_minutes ? ' + انصراف مبكر ' + m.early_minutes + ' د' : ''})</small>`, `(${gbp(m.late_deduction)})`, 'neg')}${L(`خصم الغياب <small class="muted">(${m.absent_days} يوم)</small>`, `(${gbp(m.absence_deduction)})`, 'neg')}
    ${L('الجزاءات', `(${gbp(m.penalties)})`, 'neg')}${L('خصومات أخرى', `(${gbp(m.manual_deductions)})`, 'neg')}${L('إجمالي الخصومات', gbp(m.total_deductions), 'tot')}
    <div class="slnet"><span>صافي المرتب</span><b>${gbp(m.net)}</b></div>
    <div class="muted small" style="margin-top:10px">أيام العمل ${m.work_days} · حضور ${m.present_days} · غياب ${m.absent_days} · إجازات ${m.leave_days} · تأخير ${m.late_days} يوم (${m.late_minutes} د)</div>
    ${m.adjustments && m.adjustments.length ? `<div class="slsec">البنود الإضافية</div>${m.adjustments.map((a) => { const t = ADJ[a.kind] || ADJ.deduction; return L(`${t[0]}: ${esc(a.reason || '—')}`, gbp(a.amount), t[1]); }).join('')}` : ''}</div>`;
}
function printSlip(m) {
  const w = window.open('', '_blank');
  if (!w) return toast('اسمحي بالنوافذ المنبثقة عشان تتحمل النسخة PDF', true);
  const css = [...document.styleSheets].map((ss) => { try { return [...ss.cssRules].map((r) => r.cssText).join('\n'); } catch { return ''; } }).join('\n');
  w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>مفردات المرتب - ${esc(m.name)} - ${m.month}</title><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet"><style>${css} body{background:#fff;padding:24px} .slipcard{border:0!important;max-width:760px;margin:auto}</style></head><body>${slipHtml(m)}</body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 700);
}
function viewSlip(m, extra = '') {
  const o = modal(`<div class="slbar"><div><h3>مفردات المرتب – ${esc(m.name)}</h3><div class="muted small">${esc([m.job_title, m.department].filter(Boolean).join(' · '))} · ${monthName(m.month)} · £</div></div>
    <div class="row"><button class="btn" id="slpdf">${ico('download')} تحميل PDF</button><button class="iconbtn" data-close aria-label="إغلاق">✕</button></div></div>${slipHtml(m)}${extra}`);
  o.classList.add('wide');
  $('#slpdf', o).onclick = () => printSlip(m);
  return o;
}

PAGES.me = async (view) => {
  const u = S.me.user;
  let tab = S.metab || 'general'; S.metab = null;
  const t = S.me.today, today = S.me.today_date;
  const weekend = String(S.me.settings.weekend_days || '').split(',').filter(Boolean).map(Number);
  const dow = new Date(today + 'T00:00:00Z').getUTCDay();
  const chip = t && t.check_in ? (t.late_minutes > 0 ? ['b-warn', `متأخر ${t.late_minutes} د`] : ['b-ok', 'في الموعد']) : weekend.includes(dow) ? ['', 'عطلة'] : ['b-warn', 'لم يسجّل بعد'];
  view.innerHTML = `<div class="card profile"><div class="avatar xl">${esc(initials(u.name))}</div>
      <div class="pinfo"><h2>${esc(u.name)}</h2><div class="muted">${ico('case')} ${esc(u.job_title || (u.is_admin ? 'مدير النظام' : 'موظف'))}</div><div class="muted">${ico('users')} ${esc(u.department || '—')}</div></div>
      <div class="pmid"><div class="row" style="justify-content:center"><span class="badge ${chip[0]}">${chip[1]}</span>${t && t.check_in ? `<b dir="ltr" class="small">${clock12(t.check_in).replace(/:\d\d /, ' ')}${t.check_out ? ' - ' + clock12(t.check_out).replace(/:\d\d /, ' ') : ''}</b>` : ''}</div>
        <span class="muted small" dir="ltr">${shiftLabel(u.shift_start, u.shift_end)}</span></div>
      <div class="pact"><button class="btn" id="newreq">${ico('plus')} طلب جديد</button><button class="sqbtn" id="myinfo" title="بياناتي">${ico('info')}</button></div></div>
    <div class="grid g4 statrow" id="bal"></div>
    <div class="tabs" id="tabs">${[['general', 'عام'], ['calendar', 'تقويم العمل'], ['attendance', 'سجل الحضور'], ['payroll', 'المرتبات'], ['slips', 'مفردات الرواتب']].map(([k, l]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div id="tabbody"></div>`;
  $('#newreq').onclick = () => requestForm(() => PAGES.me(view));
  $('#myinfo').onclick = () => {
    const kv = [['اسم المستخدم', u.username], ['الهاتف', u.phone || '—'], ['تاريخ التعيين', dmy(u.hire_date)], ['الوردية', `${fmt12(u.shift_start)} - ${fmt12(u.shift_end)}`], ['رصيد الإجازة السنوية', u.annual_leave_days + ' يوم'], ['بصمة الوجه', u.face_exempt ? 'غير مطلوبة' : u.face_enrolled ? 'مسجلة' : 'غير مسجلة']];
    modal(`<h3>بياناتي</h3><div class="kv">${kv.map(([k, v]) => `<div><span class="muted">${k}</span><b>${esc(v)}</b></div>`).join('')}</div><div class="actions"><button class="btn" data-close>إغلاق</button></div>`);
  };
  const r = await api('/requests/mine');
  const bl = r.balances;
  $('#bal').innerHTML = [
    ['إجازة سنوية', bl.annual_total - bl.annual_used, 'الأيام', `المتبقي من رصيدك السنوي (${bl.annual_total} يوم)`],
    ['إجازة طارئة', bl.emergency_used, 'الأيام', 'المستخدم هذا العام'],
    ['إجازة مرضية', bl.sick_used, 'الأيام', 'المستخدم هذا العام'],
    ['أذونات', Number(bl.permission_hours_month).toFixed(2), 'ساعات', 'ساعات الأذونات المقبولة هذا الشهر'],
  ].map(([k, v, un, tip]) => `<div class="card sc"><div class="sct"><b>${v}</b><span class="un">${un}</span><span class="tip" title="${esc(tip)}">${ico('info')}</span><span class="grow"></span><span class="sicon">${ico('calendar')}</span></div><div class="scl">${k}</div></div>`).join('');
  const body = $('#tabbody');
  const MONTH_NOW = thisMonth();

  const draw = {
    /* ---- عام: الطلبات ---- */
    general() {
      const first = MONTH_NOW + '-01';
      body.innerHTML = `<h2 class="sect">الطلبات</h2><div class="row filt2">
        <button class="sqbtn blue" id="rreset" title="إعادة تعيين">${ico('filter')}</button>
        <select id="rtype"><option value="">أنواع الطلبات</option>${Object.entries(TYPES()).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <input type="date" id="rfrom" value="${first}"><input type="date" id="rto" value="${monthRange(MONTH_NOW)[1]}"></div><div id="myreq"></div>`;
      const show = () => {
        const from = $('#rfrom').value, to = $('#rto').value, ty = $('#rtype').value;
        const rows = r.requests.filter((x) => (!ty || x.type === ty) && (!from || x.to_date >= from) && (!to || x.from_date <= to));
        $('#myreq').innerHTML = rows.length ? `<div class="tablewrap"><table class="rq"><tr><th>النوع</th><th>المدة المطلوبة</th><th>أُوجد بواسطة</th><th>الحالة</th><th>تعليقات</th><th>ملحوظات</th><th></th></tr>
          ${rows.map((x) => {
            const one = ['overtime', 'permission', 'attendance_edit'].includes(x.type);
            const dur = one ? `<div>اليوم ${dmy(x.from_date)}</div>${x.hours ? `<div class="muted">عدد الساعات: ${x.hours}</div>` : ''}` : `<div>من ${dmy(x.from_date)}</div><div>إلى ${dmy(x.to_date)}</div><div class="muted">عدد الأيام: ${daysBetween(x.from_date, x.to_date)}</div>`;
            return `<tr><td><b>${esc(TYPES()[x.type] || x.type)}</b></td><td class="dur">${dur}</td><td>${esc(u.name)}</td><td><span class="badge ${STATUS_AR[x.status][1]}">${STATUS_AR[x.status][0]}</span></td>
              <td class="cmt">${x.decision_note ? `<span title="${esc(x.decision_note)}">${ico('info')}</span> <span class="small">${esc(x.decision_note)}</span>` : ''}</td><td class="small" style="white-space:normal;min-width:160px">${esc(x.reason || '')}</td>
              <td>${x.status === 'pending' ? `<button class="btn alt sm" data-del="${x.id}">حذف</button>` : ''}</td></tr>`;
          }).join('')}</table></div>` : '<div class="card empty">لا توجد طلبات في هذه الفترة</div>';
        body.querySelectorAll('[data-del]').forEach((bt) => (bt.onclick = () => run(bt, async () => { await api('/requests/' + bt.dataset.del, 'DELETE'); PAGES.me(view); })));
      };
      ['rtype', 'rfrom', 'rto'].forEach((i) => ($('#' + i).onchange = show));
      $('#rreset').onclick = () => { $('#rtype').value = ''; $('#rfrom').value = ''; $('#rto').value = ''; show(); };
      show();
    },
    /* ---- تقويم العمل ---- */
    async calendar() {
      let cm = S.calm || MONTH_NOW;
      body.innerHTML = `<div class="calbar"><div class="row"><button class="sqbtn" id="cnext">${ico('chev', 'rot90')}</button><b class="calttl" id="cttl"></b><button class="sqbtn" id="cprev">${ico('chev', 'rotm90')}</button></div>
        <div class="row"><button class="btn alt" id="cexp">${ico('download')} تصدير</button><button class="btn" id="cot">${ico('plus')} ورديات إضافية</button><button class="btn" id="cshift">${ico('plus')} تغيير الوردية</button></div></div><div id="cal"></div>`;
      $('#cot').onclick = () => requestForm(() => PAGES.me(view), { type: 'overtime' });
      $('#cshift').onclick = () => requestForm(() => PAGES.me(view), { type: 'shift_change' });
      const nav = (n) => { const [y, mo] = cm.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); cm = d.toISOString().slice(0, 7); S.calm = cm; load(); };
      $('#cprev').onclick = () => nav(-1); $('#cnext').onclick = () => nav(1);
      let exportRows = [];
      const load = async () => {
        $('#cttl').textContent = monthName(cm);
        const rows = await api('/attendance/mine?month=' + cm), by = Object.fromEntries(rows.map((x) => [x.date, x]));
        const leave = new Set();
        r.requests.filter((x) => x.status === 'approved' && ['annual_leave', 'sick_leave', 'emergency_leave', 'work_mission'].includes(x.type)).forEach((x) => { for (let d = x.from_date; d <= x.to_date; d = addDays(d, 1)) leave.add(d); });
        const [y, mo] = cm.split('-').map(Number), n = new Date(Date.UTC(y, mo, 0)).getUTCDate(), first = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
        const cells = []; exportRows = [['التاريخ', 'الحالة', 'حضور', 'انصراف', 'المكان']];
        for (let i = first; i > 0; i--) cells.push(`<div class="cd2 faded"><b>${new Date(Date.UTC(y, mo - 1, 1 - i)).getUTCDate()}</b></div>`);
        for (let d = 1; d <= n; d++) {
          const ds = `${cm}-${String(d).padStart(2, '0')}`, w = new Date(ds + 'T00:00:00Z').getUTCDay(), a = by[ds];
          let pill = '', cls = '', st = '';
          if (a && a.check_in) { cls = a.late_minutes > 0 ? 'late' : 'ok'; st = a.late_minutes > 0 ? 'متأخر' : 'في الموعد'; }
          else if (leave.has(ds)) { cls = 'leave'; st = 'إجازة'; }
          else if (weekend.includes(w)) { cls = 'off'; st = 'يوم عطلة'; }
          else if (ds < today && ds >= u.hire_date) { cls = 'abs'; st = 'غائب'; }
          if (st) pill = `<div class="cpill ${cls}"><div class="cst"><span>${st}</span><i></i></div><div class="cs" dir="ltr">${cls === 'off' ? '' : shiftLabel(u.shift_start, u.shift_end)}</div>${a && a.in_loc ? `<div class="cl">${ico('pin', 'pin')}${esc(a.in_loc)}</div>` : ''}</div>`;
          cells.push(`<div class="cd2 ${ds === today ? 'today' : ''}"><b>${d}</b>${pill}</div>`);
          if (st) exportRows.push([ds, st, a?.check_in ? clock12(a.check_in) : '', a?.check_out ? clock12(a.check_out) : '', a?.in_loc || '']);
        }
        const pad = (7 - (cells.length % 7)) % 7;
        for (let i = 1; i <= pad; i++) cells.push(`<div class="cd2 faded"><b>${i}</b></div>`);
        $('#cal').innerHTML = `<div class="card calcard"><div class="calgrid2">${['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'].map((x) => `<div class="ch2">${x}</div>`).join('')}${cells.join('')}</div></div>`;
      };
      $('#cexp').onclick = () => csv(`calendar-${cm}.csv`, exportRows);
      load();
    },
    /* ---- سجل الحضور ---- */
    async attendance() {
      body.innerHTML = `<div class="row filt2" style="margin-top:6px"><button class="btn alt" id="aexp">${ico('download')} تصدير</button><input type="date" id="afrom" value="${MONTH_NOW}-01"><input type="date" id="ato" value="${today}">
        <select id="ast" style="flex:1"><option value="">تحديد خيار</option><option value="ok">في الموعد</option><option value="late">متأخر</option><option value="abs">غائب</option><option value="off">يوم إجازة</option></select></div><div id="myatt"></div>`;
      let list = [];
      const load = async () => {
        let from = $('#afrom').value, to = $('#ato').value;
        if (!from || !to || to < from) return;
        if (to > today) to = today;
        if (daysBetween(from, to) > 93) from = addDays(to, -92);
        const months = []; for (let d = from.slice(0, 7); d <= to.slice(0, 7); d = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5) , 1)).toISOString().slice(0, 7)) months.push(d);
        const by = {}; (await Promise.all(months.map((m) => api('/attendance/mine?month=' + m)))).flat().forEach((x) => { by[x.date] = x; });
        const leave = new Set();
        r.requests.filter((x) => x.status === 'approved' && ['annual_leave', 'sick_leave', 'emergency_leave', 'work_mission'].includes(x.type)).forEach((x) => { for (let d = x.from_date; d <= x.to_date; d = addDays(d, 1)) leave.add(d); });
        list = [];
        for (let d = to; d >= from; d = addDays(d, -1)) {
          const w = new Date(d + 'T00:00:00Z').getUTCDay(), a = by[d];
          let kind = null;
          if (a && a.check_in) kind = a.late_minutes > 0 ? 'late' : 'ok';
          else if (leave.has(d)) kind = 'leave';
          else if (weekend.includes(w)) kind = 'off';
          else if (d < today && d >= u.hire_date) kind = 'abs';
          else if (d === today) kind = 'wait';
          if (kind) list.push({ d, a, kind });
        }
        show();
      };
      const show = () => {
        const f = $('#ast').value, rows = list.filter((x) => !f || (f === 'ok' ? x.kind === 'ok' : f === 'late' ? x.kind === 'late' : f === 'abs' ? x.kind === 'abs' : ['off', 'leave'].includes(x.kind)));
        const dur = (a) => { if (!a.check_in || !a.check_out) return ''; const mins = Math.round((new Date(a.check_out) - new Date(a.check_in)) / 60000); return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`; };
        $('#myatt').innerHTML = rows.map(({ d, a, kind }) => {
          const dt = `<div class="adate" dir="ltr">${dmyDash(d)}</div>`;
          if (kind === 'off') return `<div class="arow off">${dt}<div class="amid">يوم إجازة مجدول</div></div>`;
          if (kind === 'leave') return `<div class="arow off">${dt}<div class="amid">إجازة معتمدة</div></div>`;
          if (kind === 'wait') return `<div class="arow off">${dt}<div class="amid">لم يتم تسجيل الحضور بعد</div></div>`;
          const stb = { ok: ['b-ok', 'في الموعد'], late: ['b-warn', `متأخر ${a ? a.late_minutes : ''} د`], abs: ['b-bad', 'غائب'] }[kind];
          const io = (arrow, iso, loc) => `<div class="aio"><span class="pi ${arrow}">${arrow === 'in' ? '⇥' : '⇤'}</span><div><b dir="ltr">${clock12(iso)}</b><div class="muted small">${esc(loc || '—')}</div></div></div>`;
          return `<div class="arow">${dt}${a && a.check_in ? io('in', a.check_in, a.in_loc) : '<div class="aio muted">—</div>'}${a && a.check_out ? io('out', a.check_out, a.out_loc) : '<div class="aio muted">—</div>'}
            <div class="adur">${a ? `<span class="durchip">${dur(a) ? `<i class="gdot"></i>${dur(a)}` : '—'}</span>` : ''}</div><span class="badge ${stb[0]}">${stb[1]}</span>
            <button class="btn alt sm editreq" data-ed="${d}">${ico('edit')} طلب تعديل</button></div>`;
        }).join('') || '<div class="card empty">لا توجد سجلات</div>';
        body.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => requestForm(() => PAGES.me(view), { type: 'attendance_edit', date: b.dataset.ed })));
      };
      ['afrom', 'ato'].forEach((i) => ($('#' + i).onchange = load)); $('#ast').onchange = show;
      $('#aexp').onclick = () => csv('attendance.csv', [['التاريخ', 'الحالة', 'حضور', 'انصراف', 'مكان الحضور', 'مكان الانصراف'], ...list.map((x) => [x.d, x.kind, clock12(x.a?.check_in), clock12(x.a?.check_out), x.a?.in_loc || '', x.a?.out_loc || ''])]);
      load();
    },
    /* ---- المرتبات (جدول شهري) ---- */
    async payroll() {
      const year = S.payy || MONTH_NOW.slice(0, 4);
      body.innerHTML = '<div class="empty"><span class="spin"></span></div>';
      const h = await api('/payroll/mine/history?year=' + year);
      const rows = h.rows;
      const cols = [
        ['الأساسي', 'tb', (m) => money(m.accrued_basic)], ['البدلات', 'tb', (m) => money(m.accrued_allowances)], ['الإجمالي', 'tb', (m) => money(m.accrued_basic + m.accrued_allowances)],
        ['المكافآت', 'tg', (m) => money(m.bonuses)], ['الوقت الإضافي', 'tg', (m) => money(m.overtime_pay)],
        ['خصم التأخير', 'tp', (m) => money(m.late_deduction)], ['خصم الغياب', 'tp', (m) => money(m.absence_deduction)], ['الجزاءات', 'tp', (m) => money(m.penalties)], ['خصومات أخرى', 'tp', (m) => money(m.manual_deductions)],
        ['مستحق الدفع', 'tn', (m) => money(m.net)], ['قيد الانتظار', 'tn', (m) => money(m.paid ? 0 : m.net)], ['مدفوع', 'tn', (m) => money(m.paid ? m.net : 0)],
      ];
      body.innerHTML = rows.length ? `<div class="tablewrap ptwrap"><table class="ptable"><tr><th class="who">الفترة</th>${cols.map(([hh, c]) => `<th class="${c}">${hh}</th>`).join('')}<th></th></tr>
        ${rows.map((m, i) => `<tr><td class="who"><b>${monthName(m.month)}</b><div class="muted small">${m.paid ? 'مدفوع' : monthRange(m.month)[1] < today ? 'بانتظار الصرف' : 'جارٍ الحساب'}</div></td>${cols.map(([, c, fn]) => `<td class="${c}">${fn(m)}</td>`).join('')}<td><button class="link" data-v="${i}">عرض</button></td></tr>`).join('')}</table></div>
        <p class="muted small">المرتب الجاري بيتحسب يوم بيوم لحد النهارده، وبيتقفل ويتحول لـ «مدفوع» لما المدير يسجّل صرفه بعد نهاية الشهر.</p>` : '<div class="card empty">لا توجد مرتبات في هذه السنة</div>';
      body.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => viewSlip(rows[b.dataset.v])));
    },
    /* ---- مفردات الرواتب (كروت الشهور) ---- */
    async slips() {
      const year = S.payy || MONTH_NOW.slice(0, 4);
      body.innerHTML = '<div class="empty"><span class="spin"></span></div>';
      const h = await api('/payroll/mine/history?year=' + year);
      const rows = h.rows, paid = rows.filter((m) => m.paid);
      const sum = (arr, k) => arr.reduce((x, m) => x + m[k], 0);
      const nowY = Number(MONTH_NOW.slice(0, 4));
      body.innerHTML = `<div class="row" style="justify-content:space-between;margin:6px 0 12px"><div class="chipbtn"><select id="syr">${[nowY - 1, nowY].map((y) => `<option ${String(y) === year ? 'selected' : ''}>${y}</option>`).join('')}</select><span>${year === String(nowY) ? 'الحالي · ' : ''}${year}</span></div><span class="muted small">${monthName(`${year}-01`).split(' ')[0]} - ${monthName(`${year}-12`).split(' ')[0]} ${year}</span></div>
        <div class="grid g4">${[
          [`صافي المدفوع ${year}`, gbp(sum(paid, 'net')).replace(' £', ' £'), `${paid.length} دورة مقفلة`, ''],
          [`الإجمالي ${year}`, gbp(sum(rows, 'gross')), 'قبل الخصومات', ''],
          ['الاستقطاعات', `-${gbp(sum(rows, 'total_deductions'))}`, 'تأخير، غياب، جزاءات، خصومات', ''],
          ['متوسط الصافي', gbp(paid.length ? sum(paid, 'net') / paid.length : 0), 'لكل دورة مقفلة', 'blue'],
        ].map(([k, v, sub, c]) => `<div class="card sumc"><div class="muted small">${k}</div><b class="${c}">${v}</b><div class="muted small">${sub}</div></div>`).join('')}</div>
        <div class="grid g2 slipgrid" style="margin-top:12px">${rows.map((m, i) => `<div class="card slcard"><div class="sltxt"><b>${monthName(m.month)}</b><div class="muted small">${dmy(m.month + '-01').slice(0, 5)} - ${dmy(monthRange(m.month)[1]).slice(0, 5)} · ${m.paid ? 'مدفوع' : monthRange(m.month)[1] < today ? 'بانتظار الصرف' : 'قيد الحساب'}</div></div>
          <i class="sdot ${m.paid ? 'paid' : ''}"></i><div class="slamt"><b>${money(m.net)}</b> <small>£</small></div><div class="row"><button class="sqbtn" data-v="${i}" title="عرض">${ico('search')}</button><button class="sqbtn" data-p="${i}" title="تحميل PDF">${ico('download')}</button></div></div>`).join('') || '<div class="card empty" style="grid-column:1/-1">لا توجد مفردات مرتب في هذه السنة</div>'}</div>`;
      $('#syr').onchange = () => { S.payy = $('#syr').value; draw.slips(); };
      body.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => viewSlip(rows[b.dataset.v])));
      body.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => printSlip(rows[b.dataset.p])));
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
    ${line(`الأساسي المستحق (${m.accrued_days} يوم من 30، أجر اليوم ${money(m.daily_rate)})`, m.accrued_basic)}${line('البدلات المستحقة', m.accrued_allowances)}${line('المكافآت', m.bonuses, 'pos')}${line(`وقت إضافي (${m.overtime_hours} س)`, m.overtime_pay, 'pos')}${m.compensation_pay ? line(`تعويض العمل في العطلات (${m.off_days_worked} يوم)`, m.compensation_pay, 'pos') : ''}${m.comp_days ? `<tr><td>أيام إجازة بدل مكتسبة</td><td class="num">${m.comp_days} يوم</td></tr>` : ''}
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
function requestForm(done, preset = {}) {
  const t = preset.date || todayStr();
  const o = modal(`<h3>طلب جديد</h3><form class="form" id="rf">
    <label class="f full">نوع الطلب<select name="type">${Object.entries(TYPES()).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
    <label class="f">من تاريخ<input type="date" name="from_date" value="${t}" required></label>
    <label class="f" id="tod">إلى تاريخ<input type="date" name="to_date" value="${t}" required></label>
    <label class="f full" id="hrs" hidden>عدد الساعات<input type="number" name="hours" min="0.25" max="24" step="0.25"></label>
    <label class="f full">السبب / ملاحظات<textarea name="reason" rows="3" maxlength="500"></textarea></label>
    <div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">إرسال الطلب</button></div></form>`);
  const f = $('#rf', o);
  if (preset.type) f.type.value = preset.type;
  const sync = () => { const h = ['overtime', 'permission'].includes(f.type.value); $('#hrs', o).hidden = !h; $('#tod', o).hidden = h || f.type.value === 'attendance_edit'; };
  f.type.onchange = sync; sync();
  f.from_date.onchange = () => { if (f.to_date.value < f.from_date.value) f.to_date.value = f.from_date.value; };
  f.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', f), async () => {
    await api('/requests', 'POST', { type: f.type.value, from_date: f.from_date.value, to_date: f.to_date.value, hours: f.hours.value, reason: f.reason.value });
    o.close(); toast('تم إرسال الطلب'); done();
  }); };
}

/* --- لوحة المعلومات --- */
PAGES.dashboard = async (view) => {
  if (IS_APP) return appDashboard(view);
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

/* --- الموظفون (على شكل الشاشة المرجعية) --- */
const EMP_TABS = [
  ['employees', 'الموظفون', 'users'], ['workgroups', 'مجموعات العمل', 'clock'], ['teams', 'فرق العمل', 'users'], ['emp_procedures', 'إجراءات الموظفين', 'user'],
  ['emp_docs', 'مستندات الموظفين', 'file'], ['org_chart', 'الهيكل التنظيمي', 'grid'], ['transfers_log', 'سجل النقل', 'file'],
  ['title_changes', 'تغييرات المسمى الوظيفي', 'users'], ['suspension_log', 'سجل الإيقاف', 'file'], ['pending_suspensions', 'الإيقافات المعلقة', 'file'],
];
function empTabsHtml(cur, counts = {}) {
  const list = [EMP_TABS[0], ...(has('employees.manage') ? [['employees:pending', 'طلبات الحسابات', 'user'], ['employees:resets', 'استعادة كلمة المرور', 'lock']] : []), ...EMP_TABS.slice(1)];
  return `<div class="card setnav etabs"><div class="stabs" id="etabs">${list.map(([k, l, ic]) => `<button data-et="${k}" class="${k === cur ? 'on' : ''}">${ico(ic)}<span>${l}</span>${counts[k] ? `<em class="cnt">${counts[k]}</em>` : ''}</button>`).join('')}</div>
    <button class="tarrow" id="tarr" title="المزيد">${ico('chev', 'rotm90')}</button></div>`;
}
function bindEmpTabs(view) {
  view.querySelectorAll('[data-et]').forEach((b) => (b.onclick = () => { const [p, t] = b.dataset.et.split(':'); S.emptab = t || 'list'; go(p); }));
  const tb = $('#etabs', view);
  $('#tarr', view).onclick = () => tb.scrollBy({ left: -260, behavior: 'smooth' });
  const on = tb.querySelector('.on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
}
/* قائمة منسدلة صغيرة (زي قائمة ⋯ في الشاشة) */
function popMenu(btn, items) {
  document.querySelectorAll('.pmenu').forEach((m) => m.remove());
  const m = document.createElement('div');
  m.className = 'pmenu';
  m.innerHTML = items.map((it, i) => `<button data-i="${i}" class="${it.cls || ''}">${ico(it.ic)}<span>${it.t}</span></button>`).join('');
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect();
  const top = r.bottom + 6 + m.offsetHeight > innerHeight ? r.top - 6 - m.offsetHeight : r.bottom + 6;
  m.style.top = Math.max(8, top) + 'px';
  m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, innerWidth - m.offsetWidth - 8)) + 'px';
  const close = () => { m.remove(); document.removeEventListener('click', close, true); window.removeEventListener('scroll', close, true); };
  m.querySelectorAll('button').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); close(); items[Number(b.dataset.i)].fn(); }));
  setTimeout(() => { document.addEventListener('click', close, true); window.addEventListener('scroll', close, true); });
}

/* صفحات الموارد البشرية المبنية على قوائم (مجموعات، فرق، إجراءات، مستندات، نقل...) */
const empSel = (people) => ({ k: 'name', l: 'الموظف', t: 'select', o: people.map((u) => [u.name, u.name]), req: true, full: true });
function logSpec(kind, newLabel, nameField, fields, extra = {}) {
  return { ...simpleSpec(kind, newLabel, fields), nameField, noStatus: true, tabs: [['all', 'الكل', () => true]],
    cols: [[nameField.l, (it) => `<b>${esc(it.name)}</b>`], ...fields.map((f) => [f.l, (it) => esc(showVal(f, it[f.k]))])], ...extra };
}
function empSpecs(people) {
  const names = people.map((u) => [u.name, u.name]), nf = (l) => ({ k: 'name', l, req: true, full: true });
  const mem = { k: 'members', l: 'الأعضاء', t: 'multi', o: people.map((u) => [String(u.id), u.name]) };
  const date = (l = 'التاريخ') => ({ k: 'date', l, t: 'date', d: todayStr() });
  const notes = { k: 'notes', l: 'ملاحظات', full: true };
  const emp = (n) => people.find((u) => u.name === n);
  const putEmp = (n, body) => { const u = emp(n); if (!u) throw new Error('الموظف مش موجود'); return api('/employees/' + u.id, 'PUT', body); };
  const tc = logSpec('title_change', 'تغيير مسمى جديد', empSel(people), [{ k: 'old', l: 'المسمى السابق' }, { k: 'new', l: 'المسمى الجديد', req: true }, date()]);
  const ps = logSpec('pending_suspension', 'إيقاف معلّق جديد', empSel(people), [{ k: 'date', l: 'تاريخ الإيقاف', t: 'date', req: true }, { k: 'reason', l: 'السبب', full: true }]);
  return {
    work_group: logSpec('work_group', 'مجموعة عمل جديدة', nf('اسم المجموعة'), [DESC, mem]),
    team: logSpec('team', 'فريق جديد', nf('اسم الفريق'), [{ k: 'leader', l: 'قائد الفريق', t: 'select', o: [['', '—'], ...names] }, DESC, mem]),
    emp_procedure: logSpec('emp_procedure', 'إجراء جديد', empSel(people), [{ k: 'type', l: 'نوع الإجراء', t: 'select', o: [['promotion', 'ترقية'], ['raise', 'تعديل راتب'], ['warning', 'إنذار'], ['thanks', 'شكر وتقدير'], ['other', 'أخرى']] }, date(), notes]),
    emp_doc: logSpec('emp_doc', 'مستند جديد', empSel(people), [{ k: 'type', l: 'نوع المستند', t: 'select', o: [['id', 'بطاقة هوية'], ['contract', 'عقد عمل'], ['cert', 'شهادة'], ['license', 'رخصة'], ['other', 'أخرى']] }, { k: 'expires', l: 'تاريخ الانتهاء', t: 'date' }, notes]),
    transfer: logSpec('transfer', 'عملية نقل جديدة', empSel(people), [{ k: 'from', l: 'من' }, { k: 'to', l: 'إلى' }, date(), { k: 'reason', l: 'السبب', full: true }]),
    title_change: { ...tc, pre: (it, b) => { if (!b.old) b.old = (emp(b.name) || {}).job_title || ''; b.applied = it ? !!it.applied : false; },
      extra: (it) => (it.applied ? '<span class="badge b-ok">تم التطبيق</span>' : `<button class="vchip" data-a="apply" data-id="${it.id}">تطبيق على الموظف</button>`),
      act: async (a, it, reload) => { if (a !== 'apply') return; await putEmp(it.name, { job_title: it.new }); await tc.save(it, { name: it.name, old: it.old, new: it.new, date: it.date, applied: true }); toast('تم تحديث المسمى الوظيفي'); reload(); } },
    pending_suspension: { ...ps, extra: (it) => `<button class="vchip" data-a="exec" data-id="${it.id}">تنفيذ الإيقاف</button>`,
      act: async (a, it, reload) => { if (a !== 'exec' || !confirm('إيقاف حساب ' + it.name + ' الآن؟')) return; await putEmp(it.name, { active: false }); await ps.remove(it); toast('تم إيقاف الحساب'); reload(); } },
  };
}
const EMP_KIND = { workgroups: 'work_group', teams: 'team', emp_procedures: 'emp_procedure', emp_docs: 'emp_doc', transfers_log: 'transfer', title_changes: 'title_change', pending_suspensions: 'pending_suspension' };
async function empPage(view, key) {
  view.innerHTML = empTabsHtml(key) + '<div id="ebody"><div class="empty"><span class="spin"></span></div></div>';
  bindEmpTabs(view);
  const body = $('#ebody', view);
  try {
    const people = (await api('/employees')).filter((u) => !u.pending);
    if (key === 'org_chart') {
      const act = people.filter((u) => u.active), groups = {};
      act.forEach((u) => { const d = u.department || 'بدون قسم'; (groups[d] = groups[d] || []).push(u); });
      const mgr = (u) => { const m = people.find((x) => x.id === u.manager_id); return m ? ` · يتبع ${esc(m.name)}` : ''; };
      body.innerHTML = `<div class="grid g3">${Object.entries(groups).map(([d, arr]) => `<div class="card"><div class="orgh"><b>${esc(d)}</b><span class="badge b-info">${arr.length}</span></div>
        ${arr.map((u) => `<div class="emp orgm"><div class="avatar sm">${esc(initials(u.name))}</div><div class="info"><b>${esc(u.name)}</b><span class="muted small">${esc(u.job_title || '—')}${mgr(u)}</span></div></div>`).join('')}</div>`).join('') || '<div class="card empty" style="grid-column:1/-1">لا يوجد موظفون</div>'}</div>`;
    } else if (key === 'suspension_log') {
      const off = people.filter((u) => !u.active);
      body.innerHTML = `<div class="tablewrap st"><table><thead><tr><th>الموظف</th><th>المسمى الوظيفي</th><th>القسم</th><th>تاريخ التعيين</th><th class="actcol"></th></tr></thead><tbody>
        ${off.map((u) => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.job_title || '—')}</td><td>${esc(u.department || '—')}</td><td>${esc(u.hire_date)}</td><td class="actcol">${has('employees.manage') ? `<button class="btn alt sm" data-on="${u.id}">تفعيل الحساب</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">لا توجد حسابات موقوفة</td></tr>'}</tbody></table></div>`;
      body.querySelectorAll('[data-on]').forEach((b) => (b.onclick = () => run(b, async () => { await api('/employees/' + b.dataset.on, 'PUT', { active: true }); toast('تم تفعيل الحساب'); empPage(view, key); })));
    } else await catalog(body, empSpecs(people)[EMP_KIND[key]]);
  } catch (e) { body.innerHTML = `<div class="card empty neg">${esc(e.message)}</div>`; }
}
Object.keys(EMP_KIND).concat(['org_chart', 'suspension_log']).forEach((k) => (PAGES[k] = (v) => empPage(v, k)));

PAGES.employees = async (view) => {
  const manage = has('employees.manage');
  const [all, resets, locs, tpls] = await Promise.all([api('/employees'), manage ? api('/password-resets') : [], manage || has('settings.manage') ? api('/locations').catch(() => []) : [], api('/config/filter_template').catch(() => [])]);
  const pend = all.filter((u) => u.pending), people = all.filter((u) => !u.pending);
  const sal = people.some((r) => r.base_salary !== undefined);
  const tab = S.emptab || 'list';
  const cur = tab === 'pending' ? 'employees:pending' : tab === 'resets' ? 'employees:resets' : 'employees';
  const showTabs = !(IS_APP && tab === 'list');
  view.innerHTML = `${showTabs ? empTabsHtml(cur, { 'employees:pending': pend.length, 'employees:resets': resets.length }) : ''}<div id="empbody"></div>`;
  if (showTabs) bindEmpTabs(view);
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

  const ALLST = ['present', 'absent', 'late', 'leave', 'not_yet', 'off'];
  const STL = { present: 'حاضر', absent: 'غائب', late: 'متأخر', leave: 'إجازة', not_yet: 'لم يسجل الحضور', off: 'عطلة' };
  const EXTRA = { face_yes: ['بصمة الوجه مسجلة', (u) => u.face_enrolled], face_no: ['بصمة الوجه غير مسجلة', (u) => !u.face_enrolled && !u.face_exempt], no_loc: ['بدون مكتب محدد', (u) => !u.location_ids.length], new30: ['عُيّن خلال آخر 30 يوم', (u) => u.hire_date >= addDays(todayStr(), -30)] };
  const D = () => ({ tpl: '', q: '', loc: '', dept: '', job: '', role: '', mgr: '', nat: '', st: [...ALLST], activeOnly: true, extra: [], view: 'cards', more: false });
  const f = S.empf = { ...D(), ...(S.empf || {}) };
  if (S.q) { f.q = S.q; S.q = ''; }
  const uniq = (k) => [...new Set(people.map((u) => u[k]).filter(Boolean))];
  const byId = (id) => all.find((x) => x.id == id);
  const match = (u) => {
    const q = f.q.toLowerCase();
    return (!q || [u.name, u.username, u.phone, u.job_title, u.department].some((x) => String(x || '').toLowerCase().includes(q)))
      && (!f.role || (f.role === 'admin') === !!u.is_admin) && (!f.dept || u.department === f.dept) && (!f.job || u.job_title === f.job)
      && (!f.loc || !locs.length || !u.location_ids.length || u.location_ids.includes(Number(f.loc)))
      && (!f.mgr || String(u.manager_id) === f.mgr) && (!f.nat || u.nationality === f.nat) && (!f.activeOnly || u.active)
      && (f.st.length >= ALLST.length || (u.active && u.today && f.st.includes(u.today.status)))
      && f.extra.every((k) => EXTRA[k][1](u));
  };
  const sel2 = (k, ic, ph, arr) => `<label class="sel2 ${f[k] ? '' : 'ph'}">${ico(ic)}<select data-f="${k}"><option value="">${ph}</option>${arr.map((x) => { const v = Array.isArray(x) ? x[0] : x, l = Array.isArray(x) ? x[1] : x; return `<option value="${esc(v)}" ${String(f[k]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select></label>`;
  const btns = (u) => `${u.phone ? `<a class="sqbtn blue" href="tel:${esc(u.phone)}" title="اتصال">${ico('phone')}</a>` : `<span class="sqbtn off">${ico('phone')}</span>`}
    <button class="sqbtn" data-info="${u.id}" title="بيانات">${ico('info')}</button>
    ${manage ? `<button class="sqbtn blue" data-e="${u.id}" title="تعديل">${ico('edit')}</button>` : ''}
    <button class="sqbtn" data-more="${u.id}" title="المزيد">${ico('dots')}</button>`;
  const lineOf = (u) => {
    const t = u.today, st = u.active && t ? TODAY_ST[t.status] : null;
    if (!u.active) return ['bad', 'الحساب موقوف', 'clockoff'];
    if (t && (t.status === 'present' || t.status === 'late')) return [st[1], `${st[0]} ${fmtTime(t.check_in)}${t.late_minutes ? ' (' + t.late_minutes + ' د)' : ''}${t.check_out ? ' · انصرف ' + fmtTime(t.check_out) : ''}`, 'clock'];
    return st ? [st[1], st[0] === 'لم يسجّل الحضور' ? 'لم يسجل الحضور' : st[0], ['absent', 'not_yet'].includes(t.status) ? 'clockoff' : 'clock'] : ['', '—', 'clock'];
  };
  const punchBtn = (u) => (has('attendance.edit') && u.active && u.today && ['absent', 'not_yet'].includes(u.today.status) ? `<button class="btn alt sm" data-in="${u.id}">${ico('clock')} تسجيل الحضور</button>` : '');
  const card = (u) => { const l = lineOf(u); return `<div class="card ecard"><div class="ehead"><div class="avatar lg">${esc(initials(u.name))}</div>
    <div class="einfo"><b>${esc(u.name)}</b><span>${esc(u.job_title || '—')}</span><span>${esc(u.department || '')}</span></div>${u.is_admin ? '<span class="badge b-info">مدير</span>' : ''}</div>
    <div class="estat"><span class="sline ${l[0]}">${ico(l[2])}${esc(l[1])}</span>${punchBtn(u)}</div><div class="eact">${btns(u)}</div></div>`; };
  const trow = (u) => { const l = lineOf(u); return `<tr><td><div class="emp"><div class="avatar sm">${esc(initials(u.name))}</div><b>${esc(u.name)}</b>${u.is_admin ? ' <span class="badge b-info">مدير</span>' : ''}</div></td>
    <td>${esc(u.job_title || '—')}</td><td>${esc(u.department || '—')}</td><td dir="ltr">${fmt12(u.shift_start)} - ${fmt12(u.shift_end)}</td><td><span class="sline ${l[0]}">${ico(l[2])}${esc(l[1])}</span></td><td class="actcol"><div class="racts">${punchBtn(u)}${btns(u)}</div></td></tr>`; };

  const render = () => {
    if (IS_APP) return empMobileUI({ view, body, people, manage, again, byId, menuFor, infoModal, f });
    const rows = people.filter(match), shown = f.more ? ALLST : ALLST.slice(0, 5);
    body.innerHTML = `<div class="efil">
      <div class="frow2">
        <label class="sel2 ${f.tpl ? '' : 'ph'}">${ico('filter')}<select data-f="tpl"><option value="">حدد القالب</option>${tpls.map((t) => `<option value="${t.id}" ${String(f.tpl) === String(t.id) ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
        ${manage ? `<button class="btn alt sm hk" id="tsv">حفظ كنموذج</button>` : ''}${manage && f.tpl ? `<button class="sqb" id="tdel" title="حذف القالب">${ico('trash')}</button>` : ''}
        <label class="fs wide">${ico('search')}<input data-f="q" placeholder="بحث" value="${esc(f.q)}" autocomplete="off"></label>
        ${locs.length ? sel2('loc', 'building', 'حدد المكتب', locs.map((l) => [l.id, l.name])) : ''}${sel2('dept', 'building', 'تحديد القسم', uniq('department'))}${sel2('job', 'user', 'اختر المنصب', uniq('job_title'))}
      </div>
      <div class="frow2">
        ${sel2('role', 'users', 'حدد الدور', [['admin', 'مدير'], ['employee', 'موظف']])}${sel2('mgr', 'user', 'اختر مدير', people.map((u) => [String(u.id), u.name]))}${sel2('nat', 'pin', 'الجنسية', uniq('nationality'))}
        <div class="sel2 stbox"><span>الحالة</span><i class="n">${f.st.length}</i><button id="stall" title="تحديد الكل">×</button></div>
      </div>
      <div class="frow2 chiprow">
        <button class="addf" id="addf">${ico('filter')} اضف تصفية ${ico('chev')}</button>
        <div class="chips2">${ico('filter')}<b>الحالة</b>${shown.map((k) => `<button class="fchip2 ${f.st.includes(k) ? 'on' : 'off'}" data-st="${k}">${STL[k]} <i>${f.st.includes(k) ? '×' : '+'}</i></button>`).join('')}
          ${!f.more && ALLST.length > 5 ? `<button class="fchip2 more" id="stmore">+${ALLST.length - 5} المزيد</button>` : ''}
          ${f.extra.map((k) => `<button class="fchip2 on" data-x="${k}">${EXTRA[k][0]} <i>×</i></button>`).join('')}</div>
        <b class="xl">مرشح إضافي</b><button class="fchip2 ${f.activeOnly ? 'on' : 'off'}" id="actonly">نشط</button>
      </div>
      <div class="frow2">${manage ? `<button class="btn" id="add">${ico('plus')} موظف جديد</button>` : ''}
        <button class="link rs" id="reset">${ico('filter')} إعادة تعيين المرشحات</button><span class="muted small">${rows.length} من ${people.length}</span><span class="grow"></span>
        ${exportCsvBtn('exp')}<button class="btn vtog" id="vtog" title="تبديل العرض">${ico(f.view === 'cards' ? 'menu' : 'grid')}</button></div>
    </div>
    ${f.view === 'cards' ? `<div class="grid g3 ecards">${rows.map(card).join('') || '<div class="card empty" style="grid-column:1/-1">لا يوجد موظفون بهذه المرشحات</div>'}</div>`
      : `<div class="tablewrap st"><table><thead><tr><th>الموظف</th><th>المسمى الوظيفي</th><th>القسم</th><th>الوردية</th><th>حالة اليوم</th><th class="actcol"></th></tr></thead><tbody>${rows.map(trow).join('') || '<tr><td colspan="6" class="empty">لا يوجد موظفون بهذه المرشحات</td></tr>'}</tbody></table></div>`}`;
    bind(rows);
  };
  const applyTpl = (id) => {
    const t = tpls.find((x) => String(x.id) === String(id));
    let saved = {}; try { saved = JSON.parse((t || {}).filters || '{}'); } catch { /* تجاهل */ }
    Object.assign(f, D(), saved, { tpl: t ? String(t.id) : '', view: f.view });
  };
  const bind = (rows) => {
    body.querySelectorAll('[data-f]').forEach((el) => (el[el.tagName === 'INPUT' ? 'oninput' : 'onchange'] = () => {
      if (el.dataset.f === 'tpl') applyTpl(el.value); else f[el.dataset.f] = el.value;
      render();
      if (el.tagName === 'INPUT') { const i = body.querySelector('input[data-f=q]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    }));
    body.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => { const k = b.dataset.st; f.st = f.st.includes(k) ? f.st.filter((x) => x !== k) : [...f.st, k]; render(); }));
    body.querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => { f.extra = f.extra.filter((x) => x !== b.dataset.x); render(); }));
    if ($('#stmore', body)) $('#stmore', body).onclick = () => { f.more = true; render(); };
    $('#stall', body).onclick = () => { f.st = [...ALLST]; render(); };
    $('#actonly', body).onclick = () => { f.activeOnly = !f.activeOnly; render(); };
    $('#addf', body).onclick = (e) => popMenu(e.currentTarget, Object.entries(EXTRA).filter(([k]) => !f.extra.includes(k)).map(([k, v]) => ({ ic: 'filter', t: v[0], fn: () => { f.extra.push(k); render(); } })));
    $('#reset', body).onclick = () => { S.empf = null; PAGES.employees(view); };
    $('#vtog', body).onclick = () => { f.view = f.view === 'cards' ? 'table' : 'cards'; render(); };
    if ($('#tsv', body)) $('#tsv', body).onclick = () => { const n = prompt('اسم القالب'); if (!n) return; const { tpl, ...rest } = f; run(null, async () => { const r = await api('/config/filter_template', 'POST', { name: n, filters: JSON.stringify(rest) }); toast('تم حفظ القالب'); S.empf.tpl = String(r.id); again(); }); };
    if ($('#tdel', body)) $('#tdel', body).onclick = () => { if (confirm('حذف القالب ده؟')) run(null, async () => { await api('/config/filter_template/' + f.tpl, 'DELETE'); S.empf.tpl = ''; again(); }); };
    $('#exp', body).onclick = () => csv('employees.csv', [['الاسم', 'اسم المستخدم', 'المسمى', 'القسم', 'الجنسية', 'الهاتف', 'الوردية', 'تاريخ التعيين', 'الحالة'], ...rows.map((u) => [u.name, u.username, u.job_title, u.department, u.nationality, u.phone, `${u.shift_start}-${u.shift_end}`, u.hire_date, u.active ? 'نشط' : 'موقوف'])]);
    if (manage) {
      $('#add', body).onclick = () => empForm(null, again);
      body.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => empForm(byId(b.dataset.e), again)));
    }
    body.querySelectorAll('[data-in]').forEach((b) => (b.onclick = () => manualAtt(people, { user_id: Number(b.dataset.in), date: S.me.today_date, manual_new: true }, again)));
    body.querySelectorAll('[data-info]').forEach((b) => (b.onclick = () => infoModal(byId(b.dataset.info))));
    body.querySelectorAll('[data-more]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); popMenu(b, menuFor(byId(b.dataset.more))); }));
  };
  const infoModal = (u) => {
    const mg = byId(u.manager_id);
    const kv = [['اسم المستخدم', u.username], ['الهاتف', u.phone || '—'], ['المسمى الوظيفي', u.job_title || '—'], ['القسم', u.department || '—'], ['الجنسية', u.nationality || '—'], ['المدير المباشر', mg ? mg.name : '—'], ['تاريخ التعيين', u.hire_date], ['الوردية', `${fmt12(u.shift_start)} - ${fmt12(u.shift_end)}`],
      ['رصيد الإجازة السنوية', u.annual_leave_days + ' يوم'], ['بصمة الوجه', u.face_exempt ? 'غير مطلوبة' : u.face_enrolled ? 'مسجلة' : 'غير مسجلة'],
      ['أماكن الحضور', u.location_ids.length ? u.location_ids.map((i) => (locs.find((l) => l.id === i) || {}).name).filter(Boolean).join('، ') : 'أي موقع'],
      ...(u.base_salary !== undefined && !u.is_admin ? [['المرتب الأساسي', money(u.base_salary)], ['البدلات', money(u.allowances)]] : [])];
    modal(`<div class="emp" style="margin-bottom:12px"><div class="avatar lg">${esc(initials(u.name))}</div><div class="info"><b>${esc(u.name)}</b><span class="muted small">${u.is_admin ? 'مدير' : 'موظف'}</span></div></div>
      <div class="kv">${kv.map(([k, v]) => `<div><span class="muted">${k}</span><b>${esc(v)}</b></div>`).join('')}</div><div class="actions"><button class="btn" data-close>إغلاق</button></div>`);
  };
  const transferForm = (u) => {
    const o = modal(`<h3>تحويل ${esc(u.name)}</h3><form class="form" id="tf">
      <label class="f">القسم الجديد<input name="department" value="${esc(u.department)}" list="dl-dept"></label><label class="f">المنصب الجديد<input name="job_title" value="${esc(u.job_title)}" list="dl-job"></label>
      <datalist id="dl-dept">${uniq('department').map((x) => `<option value="${esc(x)}">`).join('')}</datalist><datalist id="dl-job">${uniq('job_title').map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      <label class="f">تاريخ التحويل<input type="date" name="date" value="${todayStr()}"></label><label class="f">السبب<input name="reason" maxlength="200"></label>
      <div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">تحويل</button></div></form>`);
    const t = $('#tf', o);
    t.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', t), async () => {
      await api('/employees/' + u.id, 'PUT', { department: t.department.value, job_title: t.job_title.value });
      await api('/config/transfer', 'POST', { name: u.name, from: [u.department, u.job_title].filter(Boolean).join(' / ') || '—', to: [t.department.value, t.job_title.value].filter(Boolean).join(' / ') || '—', date: t.date.value, reason: t.reason.value });
      o.close(); toast('تم التحويل وتسجيله في سجل النقل'); again();
    }); };
  };
  const auditModal = async (u) => {
    let rows = [];
    try { rows = await api(`/attendance?user_id=${u.id}&from=${addDays(todayStr(), -60)}&to=${todayStr()}`); } catch (e) { return toast(e.message, true); }
    modal(`<h3>عمليات التدقيق: ${esc(u.name)}</h3><p class="muted small" style="margin:0 0 8px">آخر 60 يوم</p><div class="tablewrap"><table><tr><th>التاريخ</th><th>حضور</th><th>انصراف</th><th>تأخير (د)</th></tr>
      ${rows.slice(0, 40).map((a) => `<tr><td>${esc(a.date)}</td><td>${fmtTime(a.check_in)}</td><td>${fmtTime(a.check_out)}</td><td>${a.late_minutes || 0}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">لا توجد سجلات</td></tr>'}</table></div><div class="actions"><button class="btn" data-close>إغلاق</button></div>`);
  };
  const officeModal = async (u) => {
    let log = [];
    try { log = (await api('/config/transfer')).filter((x) => x.name === u.name); } catch { /* تجاهل */ }
    const mine = u.location_ids.map((i) => (locs.find((l) => l.id === i) || {}).name).filter(Boolean);
    modal(`<h3>تاريخ المكتب: ${esc(u.name)}</h3><div class="kv"><div><span class="muted">أماكن الحضور الحالية</span><b>${esc(mine.join('، ') || 'أي موقع')}</b></div><div><span class="muted">القسم الحالي</span><b>${esc(u.department || '—')}</b></div></div>
      <h3 style="margin:14px 0 6px">سجل النقل</h3>${log.map((x) => `<div class="vrow"><span>${esc(x.from)} ← ${esc(x.to)}</span><span class="muted small">${esc(x.date || '')}</span></div>`).join('') || '<div class="muted small">لا توجد عمليات نقل.</div>'}
      <div class="actions"><button class="btn" data-close>إغلاق</button></div>`);
  };
  const menuFor = (u) => {
    const canT = manage && (!u.is_admin || S.me.user.is_admin), it = [];
    if (canT) it.push({ ic: 'shield', t: 'تعيين كلمة مرور مؤقتة', fn: () => { const np = prompt('كلمة المرور المؤقتة الجديدة (6 أحرف على الأقل)'); if (np) run(null, async () => { await api('/employees/' + u.id, 'PUT', { password: np }); toast('تم تعيين كلمة المرور، وهيغيّرها الموظف عند أول دخول'); }); } });
    if (manage) it.push({ ic: 'swap', t: 'تحويل', fn: () => transferForm(u) });
    if (has('attendance.view_all')) it.push({ ic: 'audit', t: 'عمليات التدقيق', fn: () => auditModal(u) });
    if (manage) it.push({ ic: 'building', t: 'تاريخ المكتب', fn: () => officeModal(u) });
    if (manage && u.face_enrolled && canT) it.push({ ic: 'user', t: 'إعادة ضبط بصمة الوجه', fn: () => { if (confirm('إعادة ضبط بصمة وجه الموظف؟ هيسجّلها من جديد.')) run(null, async () => { await api(`/employees/${u.id}/reset-face`, 'POST'); toast('تمت إعادة الضبط'); again(); }); } });
    if (manage && !u.is_admin) it.push({ ic: 'pause', t: u.active ? 'إيقاف' : 'تفعيل', fn: () => run(null, async () => { await api('/employees/' + u.id, 'PUT', { active: !u.active }); toast('تم'); again(); }) });
    if (manage && !u.is_admin && u.id !== S.me.user.id) it.push({ ic: 'trash', t: 'إزالة', cls: 'bad', fn: () => { if (confirm(`إزالة ${u.name} نهائياً مع كل سجلاته (حضور وطلبات ومرتبات)؟ لا يمكن التراجع.`)) run(null, async () => { await api('/employees/' + u.id, 'DELETE'); toast('تمت الإزالة'); again(); }); } });
    if (S.me.user.is_admin && !u.is_admin) it.push({ ic: 'key', t: 'إدارة الصلاحيات', fn: () => go('permissions') });
    if (!it.length) it.push({ ic: 'info', t: 'بيانات الموظف', fn: () => infoModal(u) });
    return it;
  };
  render();
};

async function empForm(u, done) {
  let locs = [];
  try { locs = await api('/locations'); } catch { /* مفيش صلاحية: نكمل من غير */ }
  let ppl = [];
  try { ppl = (await api('/employees')).filter((x) => !x.pending && (!u || x.id !== u.id)); } catch { /* تجاهل */ }
  let scheds = [];
  try { scheds = (await api('/config/schedule')).filter((x) => x.active); } catch { /* مفيش صلاحية إعدادات */ }
  let lprofs = [];
  try { lprofs = (await api('/config/leave_profile')).filter((x) => x.active && !x.archived); } catch { /* مفيش صلاحية إعدادات */ }
  const isNew = !u, canSal = isNew || u.base_salary !== undefined;
  const o = modal(`<h3>${isNew ? 'موظف جديد' : 'تعديل ' + esc(u.name)}</h3><form class="form" id="ef">
    <label class="f full">الاسم<input name="name" value="${esc(u?.name)}" required></label>
    ${isNew ? '<label class="f">اسم المستخدم (للدخول)<input name="username" autocapitalize="none" required></label>' : ''}
    <label class="f">${isNew ? 'كلمة مرور مؤقتة' : 'كلمة مرور جديدة (اختياري)'}<input name="password" minlength="6" ${isNew ? 'required' : ''}></label>
    <label class="f">المسمى الوظيفي<input name="job_title" value="${esc(u?.job_title)}"></label>
    <label class="f">القسم<input name="department" value="${esc(u?.department)}"></label>
    <label class="f">الجنسية<input name="nationality" value="${esc(u?.nationality)}"></label>
    <label class="f">المدير المباشر<select name="manager_id"><option value="">—</option>${ppl.map((x) => `<option value="${x.id}" ${u?.manager_id === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    <label class="f">الهاتف<input name="phone" value="${esc(u?.phone)}"></label>
    <label class="f">تاريخ التعيين<input type="date" name="hire_date" value="${esc(u?.hire_date || todayStr())}"></label>
    ${canSal ? `<label class="f">المرتب الأساسي<input type="number" step="0.01" min="0" name="base_salary" value="${u?.base_salary ?? 0}"></label>
    <label class="f">البدلات<input type="number" step="0.01" min="0" name="allowances" value="${u?.allowances ?? 0}"></label>` : ''}
    ${scheds.length ? `<label class="f full">موعد العمل (بيملأ بداية ونهاية الوردية)<select id="schsel"><option value="">— يدوي —</option>${scheds.map((x) => `<option value="${esc(x.start)}|${esc(x.end)}">${esc(x.name)} (${esc(x.start)} - ${esc(x.end)})</option>`).join('')}</select></label>` : ''}
    <label class="f">بداية الوردية<input type="time" name="shift_start" value="${esc(u?.shift_start || '09:00')}"></label>
    <label class="f">نهاية الوردية<input type="time" name="shift_end" value="${esc(u?.shift_end || '17:00')}"></label>
    ${locs.length ? `<div class="full"><div class="muted small" style="margin-bottom:4px;font-weight:600">مواقع الحضور المسموحة (لو ماحددتيش، يسجّل من أي موقع)</div><div class="row">${locs.map((l) => `<label class="perm"><input type="checkbox" data-loc="${l.id}" ${u?.location_ids?.includes(l.id) ? 'checked' : ''}>${esc(l.name)}</label>`).join('')}</div></div>` : ''}
    <label class="f">رصيد الإجازة السنوية (يوم)<input type="number" min="0" name="annual_leave_days" value="${u?.annual_leave_days ?? 21}"></label>
    ${lprofs.length ? `<label class="f">ملف الإجازة والاستراحة<select name="leave_profile_id"><option value="">— بدون (يستخدم الرصيد السنوي) —</option>${lprofs.map((x) => `<option value="${x.id}" ${String(u?.leave_profile_id || '') === String(x.id) ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : ''}
    ${S.me.user.is_admin && (isNew || u.id !== S.me.user.id) ? `<label class="f">نوع الحساب<select name="role"><option value="employee" ${u?.is_admin ? '' : 'selected'}>موظف (بصلاحيات يحددها المدير)</option><option value="admin" ${u?.is_admin ? 'selected' : ''}>مدير (كل الصلاحيات)</option></select></label>` : ''}
    ${!isNew && !u.is_admin ? `<label class="f">الحالة<select name="active"><option value="1" ${u.active ? 'selected' : ''}>نشط</option><option value="0" ${u.active ? '' : 'selected'}>موقوف</option></select></label>` : ''}
    <div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">حفظ</button></div></form>`);
  const f = $('#ef', o);
  const ss = $('#schsel', o);
  if (ss) ss.onchange = () => { const [a, b] = ss.value.split('|'); if (a) { f.shift_start.value = a; f.shift_end.value = b; } };
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
  const f = S.payf = S.payf || { emp: '', dept: '', q: '', paid: '' };
  view.innerHTML = `${financeTabs('payroll')}
    <div class="card filters"><div class="frow">
      <select id="pmo">${MONTHS_AR.map((m, i) => `<option value="${String(i + 1).padStart(2, '0')}" ${Number(mm) === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select>
      <select id="pyr">${[nowY - 2, nowY - 1, nowY, nowY + 1].map((y) => `<option ${Number(yy) === y ? 'selected' : ''}>${y}</option>`).join('')}</select>
      <select id="pemp"></select><select id="pdep"></select>
      <select id="ppaid"><option value="">كل الحالات</option><option value="paid" ${f.paid === 'paid' ? 'selected' : ''}>مدفوع</option><option value="unpaid" ${f.paid === 'unpaid' ? 'selected' : ''}>غير مدفوع</option></select>
      <label class="fsearch">${ico('search')}<input id="pq" placeholder="اسم الموظف" value="${esc(f.q)}"></label></div></div>
    <div class="row actionbar"><button class="btn alt" id="exp">${ico('download')} تصدير تقرير المرتبات</button><button class="btn alt" id="prt">${ico('print')} طباعة</button>${has('payroll.manage') ? `<button class="btn" id="payall">${ico('check')} إتمام عملية الدفع</button>` : ''}
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
    $('#ppaid').onchange = () => { f.paid = $('#ppaid').value; draw(); };
    $('#pemp').onchange = () => { f.emp = $('#pemp').value; draw(); }; $('#pdep').onchange = () => { f.dept = $('#pdep').value; draw(); };
    $('#pq').oninput = () => { f.q = $('#pq').value; draw(); };
    draw();
  };
  const draw = () => {
    const q = f.q.trim().toLowerCase();
    const rows = data.rows.filter((r) => (!f.emp || String(r.user_id) === String(f.emp)) && (!f.dept || r.department === f.dept) && (!q || r.name.toLowerCase().includes(q)) && (!f.paid || (f.paid === 'paid') === !!r.paid));
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
      ${rows.map((r) => `<tr><td class="who"><b>${esc(r.name)}</b> ${r.paid ? '<span class="badge b-ok">مدفوع</span>' : data.ended ? '<span class="badge b-warn">بانتظار الصرف</span>' : ''}<div class="muted small">حضور ${r.present_days} · غياب ${r.absent_days} · تأخير ${r.late_days} يوم</div>
        <div class="noprint pact2">${has('payroll.manage') && !r.paid ? `<button class="link" data-adj="${r.user_id}">+ بند</button>` : ''}<button class="link" data-sl="${r.user_id}">تفاصيل</button>${has('payroll.manage') && !r.paid && data.ended ? `<button class="link" data-pay="${r.user_id}">تسجيل الدفع</button>` : ''}${S.me.user.is_admin && r.paid ? `<button class="link" data-unpay="${r.user_id}">إلغاء الصرف</button>` : ''}</div></td>${cols.map(([, c, fn]) => `<td class="${c}">${fn(r)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length + 1}" class="empty">لا توجد بيانات</td></tr>`}
      <tr class="totrow"><th class="who">الإجمالي (${rows.length})</th>${cols.map(([, c, , t]) => `<th class="${c}">${t()}</th>`).join('')}</tr></table></div>
      <p class="muted small">المرتب بيتحسب يوم بيوم: كل يوم بيعدّي بيستحق فيه الموظف أجر يوم = (الأساسي + البدلات) ÷ 30 (والشهر المنتهي = 30 يوم كاملين). بعدين بيتزود عليه المكافآت والوقت الإضافي، وبيتخصم منه التأخير (من شرائح خصم التأخير) والغياب (أيام الغياب × أجر اليوم) والجزاءات والخصومات. الناتج = مستحق الدفع.</p>`;
    view.querySelectorAll('[data-adj]').forEach((b) => (b.onclick = () => adjForm(data.rows.find((r) => r.user_id == b.dataset.adj), data.month, load)));
    view.querySelectorAll('[data-sl]').forEach((b) => (b.onclick = () => {
      const r = data.rows.find((x) => x.user_id == b.dataset.sl);
      const o = viewSlip(r, has('payroll.manage') && !r.paid && r.adjustments.length ? `<h3 style="margin:14px 0 6px">حذف بند</h3>${r.adjustments.map((a) => `<div class="row small" style="justify-content:space-between"><span>${(ADJ[a.kind] || ADJ.deduction)[0]} ${money(a.amount)} — ${esc(a.reason)}</span><button class="btn alt sm" data-rm="${a.id}">حذف</button></div>`).join('')}` : '');
      o.querySelectorAll('[data-rm]').forEach((x) => (x.onclick = () => run(x, async () => { await api('/adjustments/' + x.dataset.rm, 'DELETE'); o.close(); load(); })));
    }));
    view.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = () => { if (confirm('تسجيل صرف مرتب الموظف لشهر ' + data.month + '؟ هيتقفل الكشف ومش هينفع تضيفي عليه بنود.')) run(b, async () => { await api('/payroll/pay', 'POST', { user_id: b.dataset.pay, month: data.month }); toast('تم تسجيل الصرف'); load(); }); }));
    view.querySelectorAll('[data-unpay]').forEach((b) => (b.onclick = () => { if (confirm('إلغاء صرف المرتب؟ هيتحسب الشهر من جديد.')) run(b, async () => { await api('/payroll/unpay', 'POST', { user_id: b.dataset.unpay, month: data.month }); toast('تم إلغاء الصرف'); load(); }); }));
    if ($('#payall')) $('#payall').onclick = () => { const ids = rows.filter((r) => !r.paid).map((r) => r.user_id); if (!ids.length) return toast('كل المرتبات المعروضة مدفوعة'); if (confirm(`تسجيل صرف مرتبات ${ids.length} موظف لشهر ${data.month}؟`)) run($('#payall'), async () => { const x = await api('/payroll/pay', 'POST', { user_ids: ids, month: data.month }); toast(`تم صرف ${x.paid} مرتب`); load(); }); };
    $('#exp').onclick = () => csv(`payroll-${data.month}.csv`, [['الموظف', ...cols.map((c) => c[0]), 'الحالة'], ...rows.map((r) => [r.name, ...cols.map((c) => c[2](r)), r.paid ? 'مدفوع' : 'غير مدفوع']), ['الإجمالي', ...cols.map((c) => c[3]())]]);
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

/* ====== الإعدادات (على شكل الشاشات المرجعية) ====== */
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CUR = { EGP: 'جنيه مصري', SAR: 'ريال سعودي', USD: 'دولار أمريكي', AED: 'درهم إماراتي', EUR: 'يورو' };
const PERIODS = { monthly: 'شهريا', weekly: 'أسبوعيا', biweekly: 'كل أسبوعين', daily: 'يوميا' };
const SET_TOP = [
  ['company', 'شركة', 'building'], ['attendance', 'الحضور', 'clock'], ['finance', 'المالية', 'wallet'], ['documents', 'المستندات', 'file'],
  ['automation', 'قواعد أتمتة النظام', ''], ['overrides', 'قواعد تجاوز الإشعارات', ''], ['misc', 'إعدادات متنوعة', 'sliders'],
];
const SET_SUB = {
  company: [['offices', 'مكاتب وأماكن العمل'], ['department', 'الأقسام'], ['grade', 'الدرجات'], ['position', 'المناصب'], ['access_level', 'مستويات الوصول'], ['custom_field', 'حقول مخصصة'], ['announcement', 'الإعلانات']],
  attendance: [['schedule', 'مواعيد العمل'], ['penalty', 'سياسات الجزاءات'], ['overtime', 'سياسات الوقت الإضافي'], ['leave_profile', 'ملفات الإجازة والاستراحة'], ['leave_type', 'أنواع الإجازات'], ['holiday', 'العطلات الرسمية'], ['compensation_rule', 'قواعد التعويض'], ['holiday_limit', 'قواعد الحد من أيام العطلات']],
  finance: [['payroll_preset', 'خيارات التكوين المسبق للراتب'], ['allowance', 'البدلات'], ['deduction', 'الخصومات'], ['expense_category', 'فئات المصاريف'], ['payroll_lieu', 'Payroll In Lieu Rules'], ['payslip_display', 'إعدادات ظهور كشف الراتب']],
};
const SET_SINGLE = { documents: 'document', automation: 'automation_rule', overrides: 'override_rule', misc: 'misc' };
let SETV = {}; // الإعدادات الحالية (بتتحمّل كل مرة تفتحي صفحة الإعدادات)

const tm12 = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const hoursOf = (s, e, brk) => {
  const tm = (x) => { const [h, m] = String(x || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  let d = tm(e) - tm(s); if (d <= 0) d += 1440;
  return Number((Math.max(0, d - (Number(brk) || 0)) / 60).toFixed(2));
};
const STATUS_TABS = [['all', 'الكل', () => true], ['1', 'نشط', (it) => it.active], ['0', 'غير نشط', (it) => !it.active]];

/* --- حقول النماذج --- */
function fieldHtml(f, v) {
  const val = v ?? f.d ?? '';
  const cls = `f${f.full ? ' full' : ''}`;
  if (f.t === 'select') return `<label class="${cls}">${f.l}<select name="${f.k}">${f.o.map(([a, b]) => `<option value="${esc(a)}" ${String(a) === String(val) ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>`;
  if (f.t === 'multi') { const on = new Set(String(val || '').split(',').filter(Boolean)); return `<div class="full"><div class="muted small" style="margin-bottom:6px;font-weight:600">${f.l}</div><div class="row mchk">${f.o.map(([a, b]) => `<label class="perm"><input type="checkbox" data-m="${f.k}" value="${esc(a)}" ${on.has(String(a)) ? 'checked' : ''}>${esc(b)}</label>`).join('')}</div></div>`; }
  if (f.t === 'check') return `<label class="perm full"><input type="checkbox" name="${f.k}" ${[true, 1, '1', 'true'].includes(val) ? 'checked' : ''}>${f.l}</label>`;
  return `<label class="${cls}">${f.l}<input name="${f.k}" type="${f.t || 'text'}" value="${esc(val)}" ${f.req ? 'required' : ''} ${f.attrs || ''}>${f.help ? `<span class="muted small" style="font-weight:400">${f.help}</span>` : ''}</label>`;
}
function readForm(f, fields) {
  const b = {};
  for (const x of fields) {
    if (x.t === 'multi') { b[x.k] = [...f.querySelectorAll(`[data-m="${x.k}"]:checked`)].map((i) => i.value).join(','); continue; }
    const el = f.elements[x.k];
    if (!el) continue;
    b[x.k] = x.t === 'check' ? el.checked : (x.t === 'number' && el.value !== '' ? Number(el.value) : el.value);
  }
  return b;
}
const showVal = (f, v) => {
  if (v === undefined || v === null || v === '') return '—';
  if (f.t === 'select') return (f.o.find((o) => String(o[0]) === String(v)) || [0, v])[1];
  if (f.t === 'check') return v === true || v === 'true' ? '✓' : '—';
  if (f.t === 'multi') return `${String(v).split(',').filter(Boolean).length} عضو`;
  return v;
};

/* --- محرك القوائم (بحث + تابات + شرائح + ترقيم + نموذج) --- */
async function catalog(box, sp) {
  const PS = 10;
  const st = { tab: sp.tabs[0][0], chip: sp.chips ? sp.chips[0][0] : '', q: '', sel: '', page: 1, open: {}, tpl: '' };
  let items = [], tpls = [];
  const getFields = () => [sp.nameField || { k: 'name', l: sp.nameLabel || 'الاسم', req: true, full: true }, ...(typeof sp.fields === 'function' ? sp.fields() : sp.fields), ...(sp.noStatus ? [] : [{ k: 'active', l: 'الحالة', t: 'select', o: sp.statusOpts || [['1', 'نشط'], ['0', 'غير نشط']] }])];
  const reload = async () => { items = await sp.load(); draw(); };
  const filtered = () => {
    const tp = (sp.tabs.find((x) => x[0] === st.tab) || sp.tabs[0])[2];
    const cp = sp.chips ? (sp.chips.find((x) => x[0] === st.chip) || sp.chips[0])[2] : null;
    const q = st.q.trim().toLowerCase();
    return items.filter((it) => tp(it) && (!cp || cp(it)) && (!st.sel || sp.sel.pred(it, st.sel)) && (!q || sp.text(it).toLowerCase().includes(q)));
  };
  const actions = (it) => (sp.rowActs ? sp.rowActs(it) : `<div class="racts">${sp.extra ? sp.extra(it) : ''}<button class="sqb" data-a="edit" data-id="${it.id}" title="تعديل">${ico('edit')}</button><button class="sqb" data-a="del" data-id="${it.id}" title="حذف">${ico('trash')}</button></div>`);
  const doAct = (a, it, el) => {
    if (a === 'edit') openForm(it);
    else if (a === 'del') { if (confirm(typeof sp.delMsg === 'function' ? sp.delMsg(it) : (sp.delMsg || 'حذف العنصر ده؟'))) run(el, async () => { await sp.remove(it); toast('تم الحذف'); reload(); }); }
    else if (sp.act) run(el, async () => { await sp.act(a, it, reload); });
  };
  const closeMenu = () => document.querySelectorAll('.mmenu').forEach((m) => m.remove());
  const tdraw = () => {
    const rows = filtered(), pages = Math.max(1, Math.ceil(rows.length / PS));
    st.page = Math.min(st.page, pages);
    const from = (st.page - 1) * PS, part = rows.slice(from, from + PS);
    const rowHtml = (it) => {
      const open = sp.expand && st.open[it.id];
      return `<tr>${sp.cols.map((c, ci) => `<td>${ci === 0 && sp.expand ? `<div class="xcell">${c[1](it)}<button class="xbtn ${open ? 'on' : ''}" data-x="${it.id}" aria-label="تفاصيل">${ico('chev')}</button></div>` : c[1](it)}</td>`).join('')}<td class="actcol">${actions(it)}</td></tr>${open ? `<tr class="xrow"><td colspan="${sp.cols.length + 1}">${sp.expand(it)}</td></tr>` : ''}`;
    };
    $('#stab', box).innerHTML = `<div class="tablewrap st"><table><thead><tr>${sp.cols.map((c) => `<th>${c[0]}</th>`).join('')}<th class="actcol">${sp.actHead || ''}</th></tr></thead>
      <tbody>${part.map(rowHtml).join('') || `<tr><td colspan="${sp.cols.length + 1}" class="empty">لا توجد نتائج</td></tr>`}</tbody></table></div>
      <div class="pager"><button class="pg" data-pg="${st.page - 1}" ${st.page <= 1 ? 'disabled' : ''}>${ico('chev', 'rot90')}</button>
        ${Array.from({ length: pages }, (_, i) => `<button class="pg ${i + 1 === st.page ? 'on' : ''}" data-pg="${i + 1}">${i + 1}</button>`).join('')}
        <button class="pg" data-pg="${st.page + 1}" ${st.page >= pages ? 'disabled' : ''}>${ico('chev', 'rotm90')}</button>
        <span class="muted small">${rows.length ? `عرض ${from + 1} إلى ${from + part.length} من ${rows.length} إدخالات` : 'لا توجد إدخالات'}</span></div>`;
    box.querySelectorAll('[data-pg]').forEach((b) => (b.onclick = () => { st.page = Number(b.dataset.pg); tdraw(); }));
    box.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => doAct(b.dataset.a, items.find((x) => x.id == b.dataset.id), b)));
    box.querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => { st.open[b.dataset.x] = !st.open[b.dataset.x]; tdraw(); }));
    box.querySelectorAll('[data-more]').forEach((b) => (b.onclick = (e) => {
      e.stopPropagation(); closeMenu();
      const it = items.find((x) => x.id == b.dataset.more), r = b.getBoundingClientRect();
      const m = document.createElement('div');
      m.className = 'mmenu';
      m.innerHTML = sp.more(it).map(([k, l, dng]) => `<button data-k="${k}" class="${dng ? 'dng' : ''}">${l}</button>`).join('');
      document.body.appendChild(m);
      m.style.top = `${Math.max(8, Math.min(r.bottom + 4, innerHeight - m.offsetHeight - 8))}px`;
      m.style.left = `${Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8))}px`;
      m.querySelectorAll('button').forEach((x) => (x.onclick = () => { closeMenu(); doAct(x.dataset.k, it, b); }));
      setTimeout(() => document.addEventListener('click', closeMenu, { once: true }));
    }));
  };
  const tplRow = () => `<div class="tplrow"><select id="tsel" class="fsel tsel"><option value="">حدد القالب</option>${tpls.map((t) => `<option value="${t.id}" ${String(t.id) === String(st.tpl) ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
    <button class="btn alt sm" id="tsv2">حفظ كنموذج</button>${st.tpl ? `<button class="sqb" id="tdel2" title="حذف القالب">${ico('trash')}</button>` : ''}</div>`;
  const draw = () => {
    const seg = (arr, key, attr, base) => `<div class="seg">${sp.chips && arr === sp.chips && sp.chipLabel !== '' ? `<span class="seglbl">${sp.chipLabel || 'النوع'}</span>` : ''}${arr.map(([k, l, p]) => `<button data-${attr}="${k}" class="${k === st[key] ? 'on' : ''}">${l}${sp.counts ? `<i class="n">${(base || items).filter(p).length}</i>` : ''}</button>`).join('')}</div>`;
    const tp = (sp.tabs.find((x) => x[0] === st.tab) || sp.tabs[0])[2];
    const segT = sp.tabs.length > 1 ? seg(sp.tabs, 'tab', 'tb') : '', segC = sp.chips ? seg(sp.chips, 'chip', 'cp', items.filter(tp)) : '';
    $('#sfil', box).innerHTML = `${sp.tpl ? tplRow() : ''}${sp.chipsFirst ? segC + segT : segT + segC}
      <label class="fs">${ico('search')}<input id="sq" placeholder="${sp.searchPh || 'بحث'}" value="${esc(st.q)}" autocomplete="off"></label>
      ${sp.sel ? `<select id="ssel" class="fsel"><option value="">${sp.sel.ph || 'الكل'}</option>${sp.sel.opts.map(([v, l]) => `<option value="${esc(v)}" ${v === st.sel ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}
      <button class="link rs" id="srs">${ico('filter')} إعادة تعيين المرشحات</button><span class="grow"></span>${sp.extraBtn || ''}
      <button class="btn sm" id="snew">${ico('plus')} ${sp.newLabel}</button>`;
    box.querySelectorAll('[data-tb]').forEach((b) => (b.onclick = () => { st.tab = b.dataset.tb; st.page = 1; draw(); }));
    box.querySelectorAll('[data-cp]').forEach((b) => (b.onclick = () => { st.chip = b.dataset.cp; st.page = 1; draw(); }));
    $('#sq', box).oninput = (e) => { st.q = e.target.value; st.page = 1; tdraw(); };
    if ($('#ssel', box)) $('#ssel', box).onchange = (e) => { st.sel = e.target.value; st.page = 1; tdraw(); };
    $('#srs', box).onclick = () => { Object.assign(st, { tab: sp.tabs[0][0], chip: sp.chips ? sp.chips[0][0] : '', q: '', sel: '', page: 1, tpl: '' }); draw(); };
    $('#snew', box).onclick = () => openForm(null);
    if (sp.bindExtra) sp.bindExtra(box, reload);
    if (sp.tpl) {
      $('#tsel', box).onchange = (e) => {
        st.tpl = e.target.value;
        const t = tpls.find((x) => String(x.id) === st.tpl);
        if (t) { try { const f = JSON.parse(t.filters || '{}'); Object.assign(st, { tab: f.tab || sp.tabs[0][0], chip: f.chip || (sp.chips ? sp.chips[0][0] : ''), q: f.q || '', sel: f.sel || '', page: 1 }); } catch { /* قالب تالف */ } }
        draw();
      };
      $('#tsv2', box).onclick = (e) => { const n = prompt('اسم النموذج'); if (!n) return; run(e.target, async () => { const r = await api('/config/' + sp.tpl, 'POST', { name: n, filters: JSON.stringify({ tab: st.tab, chip: st.chip, q: st.q, sel: st.sel }) }); tpls = await api('/config/' + sp.tpl); st.tpl = String(r.id); toast('تم حفظ النموذج'); draw(); }); };
      if ($('#tdel2', box)) $('#tdel2', box).onclick = (e) => { if (confirm('حذف النموذج ده؟')) run(e.target, async () => { await api(`/config/${sp.tpl}/${st.tpl}`, 'DELETE'); tpls = await api('/config/' + sp.tpl); st.tpl = ''; toast('تم حذف النموذج'); draw(); }); };
    }
    tdraw();
  };
  function openForm(it) {
    if (sp.form) return sp.form(it, reload);
    const fields = getFields();
    const vals = it ? { ...it, active: it.active ? '1' : '0' } : { active: '1' };
    const o = modal(`<h3>${it ? 'تعديل' : sp.newLabel}</h3><form class="form" id="cf">${fields.map((f) => fieldHtml(f, vals[f.k])).join('')}
      <div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">حفظ</button></div></form>`);
    const f = $('#cf', o);
    f.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', f), async () => {
      const b = readForm(f, fields);
      if (sp.pre) sp.pre(it, b);
      await sp.save(it, b);
      o.close(); toast('تم الحفظ'); reload();
    }); };
  }
  box.innerHTML = '<div class="sfil" id="sfil"></div><div id="stab"></div>';
  items = await sp.load();
  if (sp.tpl) tpls = await api('/config/' + sp.tpl).catch(() => []);
  draw();
}

/* قوائم الإعدادات البسيطة المخزنة في قاعدة البيانات (config_items) */
const cfgApi = (kind) => ({
  load: async () => api('/config/' + kind),
  save: (it, b) => api(it ? `/config/${kind}/${it.id}` : '/config/' + kind, it ? 'PUT' : 'POST', b),
  remove: (it) => api(`/config/${kind}/${it.id}`, 'DELETE'),
});
const statusBadge = (it) => `<span class="badge ${it.active ? 'b-ok' : ''}">${it.active ? 'نشط' : 'غير نشط'}</span>`;
function simpleSpec(kind, newLabel, fields) {
  return {
    kind, newLabel, ...cfgApi(kind), tabs: STATUS_TABS, fields,
    cols: [['الاسم', (it) => `<b>${esc(it.name)}</b>`], ...fields.map((f) => [f.l, (it) => esc(showVal(f, it[f.k]))]), ['الحالة', statusBadge]],
    text: (it) => [it.name, ...fields.map((f) => it[f.k])].join(' '),
  };
}
const DESC = { k: 'description', l: 'الوصف', full: true };
const KIND_OPTS = [['fixed', 'مبلغ ثابت'], ['percent', 'نسبة من الأساسي']];
const SIMPLE = {
  department: ['قسم جديد', [DESC]],
  grade: ['درجة جديدة', [{ k: 'level', l: 'المستوى', t: 'number', attrs: 'min="1"' }, DESC]],
  position: ['منصب جديد', [DESC]],
  access_level: ['مستوى وصول جديد', [DESC]],
  custom_field: ['حقل مخصص جديد', [{ k: 'type', l: 'نوع الحقل', t: 'select', o: [['text', 'نص'], ['number', 'رقم'], ['date', 'تاريخ'], ['list', 'قائمة']] }, { k: 'applies', l: 'يظهر في', t: 'select', o: [['employee', 'بيانات الموظف'], ['office', 'المكاتب'], ['department', 'الأقسام']] }, { k: 'required', l: 'حقل إلزامي', t: 'check' }]],
  announcement: ['إعلان جديد', [{ k: 'text', l: 'نص الإعلان', full: true }, { k: 'from', l: 'من', t: 'date' }, { k: 'to', l: 'إلى', t: 'date' }]],
  leave_profile: ['ملف إجازة جديد', [{ k: 'annual', l: 'الرصيد السنوي (يوم)', t: 'number', d: 21, attrs: 'min="0"' }, { k: 'carry', l: 'ترحيل الرصيد للسنة التالية', t: 'check' }]],
  holiday: ['عطلة رسمية جديدة', [{ k: 'date', l: 'من تاريخ', t: 'date', req: true }, { k: 'to', l: 'إلى تاريخ', t: 'date' }]],
  compensation_rule: ['قاعدة تعويض جديدة', [DESC]],
  holiday_limit: ['قاعدة جديدة', [{ k: 'max', l: 'أقصى عدد أيام متتالية', t: 'number', attrs: 'min="1"' }, DESC]],
  allowance: ['بدل جديد', [{ k: 'kind', l: 'النوع', t: 'select', o: KIND_OPTS }, { k: 'amount', l: 'القيمة', t: 'number', attrs: 'min="0" step="0.01"' }]],
  deduction: ['خصم جديد', [{ k: 'kind', l: 'النوع', t: 'select', o: KIND_OPTS }, { k: 'amount', l: 'القيمة', t: 'number', attrs: 'min="0" step="0.01"' }]],
  expense_category: ['فئة مصروف جديدة', [DESC]],
  payroll_lieu: ['قاعدة جديدة', [DESC]],
  payslip_display: ['إعداد جديد', [DESC]],
  document: ['مستند جديد', [{ k: 'required', l: 'مطلوب من كل موظف', t: 'check' }, DESC]],
  automation_rule: ['قاعدة أتمتة جديدة', [{ k: 'trigger', l: 'الحدث', full: true }, { k: 'action', l: 'الإجراء', full: true }]],
  override_rule: ['قاعدة جديدة', [DESC]],
};

/* --- مكاتب وأماكن العمل (مواقع الحضور بالـ GPS) --- */
const officesSpec = () => ({
  newLabel: 'مكتب جديد', searchPh: 'بحث', tabs: STATUS_TABS, fields: [],
  sel: { ph: 'الكل', opts: [['office', 'المكتب']], pred: () => true },
  load: async () => {
    const [locs, emps] = await Promise.all([api('/locations'), api('/employees').catch(() => [])]);
    return locs.map((l) => ({ ...l, active: !!l.active, n: emps.filter((u) => u.active && !u.pending && (u.location_ids || []).includes(l.id)).length }));
  },
  remove: (it) => api('/locations/' + it.id, 'DELETE'),
  form: (it, reload) => locForm(it, reload),
  delMsg: 'حذف المكتب ده؟',
  text: (it) => `${it.name} ${it.lat} ${it.lng}`,
  cols: [
    ['الاسم', (it) => `<b>${esc(it.name)}</b>`], ['النوع', () => 'المكتب'], ['عدد الموظفين', (it) => `${it.n} / غير محدد`],
    ['اللغة', () => esc(SETV.language)], ['دولة', () => esc(SETV.country)], ['العملة', () => esc(SETV.currency)],
    ['بداية الشهر', () => esc(SETV.month_start)], ['أول شهر في السنة', () => esc(SETV.first_month)], ['بداية الأسبوع', () => DAYS[Number(SETV.week_start)] || '—'],
    ['العنوان', (it) => `<span dir="ltr">${it.lat.toFixed(5)}, ${it.lng.toFixed(5)}</span><div class="muted small">نطاق ${it.radius_m} م</div>`],
    ['المنطقة الزمنية', () => esc(SETV.timezone)],
  ],
});

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

/* --- خيارات التكوين المسبق للراتب --- */
const presetSpec = () => ({
  ...cfgApi('payroll_preset'), newLabel: 'إعداد مسبق جديد', searchPh: 'البحث بالاسم', noStatus: true,
  tabs: [['all', 'الكل', () => true], ['pin', 'مُثَبَّت', (it) => it.pinned === true || it.pinned === 'true']],
  sel: { ph: 'تحديد العملة', opts: Object.entries(CUR).map(([k, v]) => [k, v]), pred: (it, v) => it.currency === v },
  fields: [
    { k: 'currency', l: 'العملة', t: 'select', o: Object.entries(CUR), d: SETV.currency || 'EGP' },
    { k: 'period', l: 'الدفع', t: 'select', o: Object.entries(PERIODS), d: 'monthly' },
    { k: 'hours', l: 'ساعات العمل في اليوم', t: 'number', d: 8, attrs: 'min="1" max="24" step="0.5"' },
    { k: 'pinned', l: 'تثبيت الإعداد في أعلى القائمة', t: 'check' },
  ],
  text: (it) => it.name,
  cols: [['الاسم', (it) => `<b>${esc(it.name)}</b>`], ['العملة', (it) => esc(CUR[it.currency] || it.currency || '—')], ['الدفع', (it) => esc(PERIODS[it.period] || '—')]],
});

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

/* ====== سياسات الحضور (جزاءات + وقت إضافي): قوائم + معالج بخطوات على شكل الشاشات المرجعية ====== */
const POL = { pen: [], ot: [] }; // آخر سياسات اتحمّلت (بتظهر في اختيار السياسة داخل مواعيد العمل)
const clone = (x) => JSON.parse(JSON.stringify(x ?? null));
const plural = (n, one, many) => (n === 1 ? one : `${n} ${many}`);
const stamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ');
const POL_KEYS = {
  penalty_policy: ['name', 'grace', 'early_grace', 'late_on', 'early_on', 'partial_on', 'absence_factor', 'early_factor', 'late_method', 'partial_kind', 'partial_value', 'tiers'],
  overtime_policy: ['name', 'calc_on', 'after_min', 'cap_hours', 'factor', 'rounding', 'round_unit'],
};
const polState = (it) => (it.archived ? 'arch' : it.active ? 'on' : 'off');
const POL_TABS = [['on', 'نشط', (it) => polState(it) === 'on'], ['off', 'غير نشط', (it) => polState(it) === 'off'], ['arch', 'محفوظ', (it) => polState(it) === 'arch']];
const polBadge = (it) => { const s = polState(it); return `<span class="badge ${s === 'on' ? 'b-ok' : s === 'arch' ? 'b-info' : ''}">${{ on: 'نشط', off: 'غير نشط', arch: 'محفوظ' }[s]}</span>`; };
const linkedCell = (it) => (it._sch && it._sch.length
  ? `<button class="link lk" data-a="links" data-id="${it.id}">${plural(it._sch.length, 'توقيت عمل واحد', 'توقيتات عمل')}</button><div class="muted small">${esc(it._sch.slice(0, 3).map((s) => s.name).join('، '))}${it._sch.length > 3 ? '…' : ''}</div>`
  : '<span class="muted small">غير مرتبط بعد</span>');

/* نفس معادلات السيرفر (server.js) عشان المعاينة تطلع بنفس الرقم */
function polLateCalc(p, late, daily, hourly) {
  if (late <= (Number(p.grace) || 0)) return 0;
  let total = 0;
  for (const t of [...(p.tiers || [])].sort((a, b) => a.from - b.from)) {
    const to = t.to === null || t.to === undefined || t.to === '' ? Infinity : Number(t.to);
    if (late < t.from) break;
    if (t.kind === 'minutes') total += ((Math.min(late, to) - t.from + 1) / 60) * hourly * Number(t.value);
    else if (late <= to) total += t.kind === 'fixed' ? Number(t.value) : Number(t.value) * daily;
  }
  return total;
}
function polOtCalc(o, hours) {
  if (!o.calc_on) return 0;
  let h = Math.max(0, hours - (Number(o.after_min) || 0) / 60);
  if (Number(o.cap_hours) > 0) h = Math.min(h, Number(o.cap_hours));
  const unit = (Number(o.round_unit) || 15) / 60;
  if (o.rounding === 'up') h = Math.ceil(h / unit - 1e-9) * unit;
  else if (o.rounding === 'down') h = Math.floor(h / unit + 1e-9) * unit;
  return h;
}

/* --- نصوص "ماذا يعني هذا" --- */
const HELP = {
  penalty_policy: {
    details: ['سياسة الجزاءات', 'سياسة واحدة بتغطي التأخير والانصراف المبكر والغياب والانصراف الناقص. بتتكتب مرة واحدة وبتتربط بمواعيد العمل من صفحة «مواعيد العمل».', 'مفيش هنا أوقات فعلية: كل حاجة بتتحسب بفرق الدقائق عن وردية الموظف.'],
    pick: ['اختيار الجزاءات', 'فعّلي البنود اللي عايزة السياسة دي تطبقها. البند غير المفعّل بيتجاهل خالص ومش بيتخصم منه حاجة. الغياب مطبق دايماً.', null],
    absence: ['الغياب', 'الغياب هو يوم عمل مفيهوش تسجيل حضور ولا إجازة معتمدة. بيتخصم أجر اليوم × المعامل (المعامل 1 = يوم كامل).', 'أجر اليوم = المرتب الأساسي ÷ 30.'],
    grace: ['السماحية', 'لو الموظف وصل خلال المدة دي بعد بداية الوردية يعتبر في الميعاد ومفيش خصم. لو عدّاها، التأخير بيتحسب من بداية الوردية حسب الشرائح.', null],
    method: ['طريقة الحساب', 'دقائق: الخصم = المعامل × الدقائق اللي وقعت داخل نطاق الشريحة ÷ 60 × أجر الساعة. فترات زمنية: لو التأخير وقع داخل الشريحة بيتخصم مبلغ ثابت (أو جزء من اليوم) مرة واحدة.', null],
    deduct: ['خصم من', 'الجهة اللي بيتخصم منها الجزاء. حالياً الخصم بيتم من المرتب فقط. الخصم من رصيد الإجازات غير متاح في النظام.', 'الخصم من الإجازات مش مفعّل، فالجزاءات كلها بتتخصم من المرتب.'],
    tier: ['نطاق الشريحة', 'بداية الشريحة ونهايتها بالدقائق من بداية الوردية. الشريحة اللي بعدها لازم تبدأ بعد نهاية اللي قبلها، وسيبي «إلى» فاضية في آخر شريحة عشان تشمل أي تأخير أكبر.', 'أي تأخير بعد نهاية آخر شريحة (لو ليها حد أعلى) مش هيتخصم.'],
    calc: ['جرّبي حساب خصم', 'اكتبي مرتب ودقائق تأخير وشوفي الخصم بنفس معادلة الرواتب.', null],
    early: ['الانصراف المبكر', 'لو الموظف مشي قبل نهاية الوردية بأكتر من السماحية، كل دقائق الانصراف المبكر بتتخصم: الدقائق ÷ 60 × أجر الساعة × المعامل.', null],
    partial: ['الانصراف الناقص', 'يوم فيه تسجيل حضور من غير تسجيل انصراف (وفات اليوم). بيتخصم جزء من أجر اليوم أو مبلغ ثابت عن كل يوم.', 'مش بيتطبق على اليوم الحالي.'],
  },
  overtime_policy: {
    details: ['سياسة الوقت الإضافي', 'قواعد احتساب الساعات الإضافية المعتمدة. بتتكتب مرة واحدة وبتتربط بمواعيد العمل من صفحة «مواعيد العمل».', null],
    calc: ['يُحتسب / لا يُحتسب', 'لو «لا يُحتسب»، الساعات الإضافية المعتمدة على الورديات المربوطة بالسياسة دي مش بتتدفع.', null],
    start: ['بداية الاحتساب', 'عدد الدقائق اللي بتتشال من أول كل طلب وقت إضافي معتمد قبل ما يبدأ الاحتساب (0 = من أول دقيقة).', null],
    cap: ['الحد اليومي', 'أقصى عدد ساعات إضافية بتتحسب في الطلب الواحد. اكتبي 0 لو مفيش حد.', null],
    rounding: ['التقريب', 'الدقائق الفعلية: من غير تقريب. للأعلى/للأسفل: بيتقرب لأقرب وحدة (مثلاً 15 دقيقة).', null],
    factor: ['معامل الأجر', 'أجر الساعة الإضافية = أجر الساعة العادية × المعامل (مثلاً 1.5).', null],
    sim: ['جرّبي حساب', 'اكتبي ساعات طلب معتمد وشوفي الساعات المحتسبة بعد البداية والحد والتقريب.', null],
  },
};

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

/* ===== العطلات الرسمية + قواعد التعويض + قواعد الحد من الإجازات + ملفات الإجازة والاستراحة =====
   نفس منطق سياسات الجزاءات: إصدارات / نسخ / أرشفة / تفعيل / معالج بخطوات، والسيرفر بيطبقها فعلياً
   (حساب المرتبات + طلبات الإجازة). */
Object.assign(POL_KEYS, {
  holiday: ['name', 'date', 'to', 'yearly'],
  compensation_rule: ['name', 'applies', 'mode', 'factor', 'days', 'min_hours'],
  holiday_limit: ['name', 'rule', 'value', 'from', 'to', 'scope', 'types'],
  leave_profile: ['name', 'annual', 'sick', 'emergency', 'carry', 'break_min', 'break_paid'],
});
const LV_LIST = [['annual_leave', 'سنوية', 'الإجازة اللي بتتخصم من الرصيد السنوي'], ['emergency_leave', 'طارئة', 'إجازة عارضة بدون ترتيب مسبق'], ['sick_leave', 'مرضية', 'إجازة بتقرير طبي']];
const LV_NAME = Object.fromEntries(LV_LIST.map(([k, l]) => [k, l]));
const APPLIES = { holiday: 'العطلات الرسمية', weekend: 'الإجازة الأسبوعية', both: 'العطلات والإجازة الأسبوعية' };
const LIM_RULE = { max_consecutive: 'أقصى مدة للطلب', max_concurrent: 'أقصى عدد في نفس اليوم', blackout: 'فترة منع' };
const dayCount = (a, b) => (a && b && b >= a ? Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5) + 1 : 0);
const attOnChange = (k, dd) => {
  if (['yearly', 'carry', 'break_paid'].includes(k) && typeof dd[k] === 'string') { dd[k] = dd[k] === 'true'; return true; }
  if (k === 'rule') { dd.value = dd.rule === 'max_consecutive' ? 5 : dd.rule === 'max_concurrent' ? 2 : 0; return true; }
  return ['mode', 'applies', 'scope'].includes(k);
};
const nameFld = (d, ph) => `<div class="pwfld" data-help="details"><label class="lbl">الاسم</label><input data-k="name" value="${esc(d.name)}" placeholder="${ph}" maxlength="80"></div>`;
const nameChk = (d) => (String(d.name || '').trim() ? null : 'اكتبي الاسم');

HELP.holiday = {
  details: ['العطلة الرسمية', 'يوم أو فترة بتتعامل معاها الشركة كإجازة رسمية. الموظفين مش بيتحسبلهم غياب ولا تأخير في الأيام دي، وبتظهر في لوحة المعلومات كيوم عطلة.', 'لو موظف اشتغل في العطلة، بتتطبق عليه «قاعدة التعويض» المناسبة (لو فيه).'],
  yearly: ['التكرار', 'تتكرر كل سنة: نفس اليوم والشهر كل سنة (مناسبة للأعياد الثابتة). مرة واحدة: بتتطبق في السنة اللي اخترتيها بس (مناسبة للأعياد المتحركة).', null],
  dates: ['فترة العطلة', 'اختاري أول يوم وآخر يوم. لو العطلة يوم واحد سيبي «إلى» فاضية.', 'الحد الأقصى للعطلة الواحدة 60 يوم.'],
};
HELP.compensation_rule = {
  details: ['قاعدة التعويض', 'بتحدد إيه اللي الموظف بياخده لو اشتغل في يوم المفروض يكون إجازة. بتتطبق في حساب المرتب الشهري.', 'أول قاعدة مفعّلة مطابقة هي اللي بتتطبق: المحددة (عطلة/أسبوعية) قبل «الاثنين».'],
  applies: ['بتنطبق على', 'العطلات الرسمية: الأيام المسجّلة في «العطلات الرسمية». الإجازة الأسبوعية: أيام الويك إند من الإعدادات المتنوعة. الاثنين: أي يوم من النوعين.', null],
  ckind: ['شكل التعويض', 'أجر إضافي: بيتضاف للمرتب (أجر اليوم × المعامل). يوم إجازة بدل: بيتسجل للموظف رصيد أيام بدل بتظهر في كشف المرتب.', null],
  cfactor: ['معامل أجر اليوم', 'أجر اليوم = المرتب الأساسي ÷ 30. المعامل 2 يعني الموظف بياخد أجر يومين عن اليوم اللي اشتغله.', null],
  csim: ['جرّبي حساب', 'اكتبي مرتب وشوفي قيمة التعويض عن يوم عمل واحد.', null],
  cdays: ['أيام الإجازة البدل', 'عدد أيام الإجازة اللي الموظف يكسبها عن كل يوم اشتغله في العطلة.', null],
  cmin: ['الحد الأدنى لساعات العمل', 'التعويض مش بيتطبق إلا لو الموظف سجّل حضور وانصراف وساعاته وصلت للحد ده. 0 = أي يوم فيه تسجيل حضور.', null],
};
HELP.holiday_limit = {
  details: ['قاعدة الحد من الإجازات', 'بتمنع طلبات الإجازة اللي بتخالف الحدود اللي بتحطيها. بتتفحص أوتوماتيك لحظة تقديم الموظف للطلب ولو خالف بيظهرله سبب الرفض.', null],
  rule: ['نوع القاعدة', 'أقصى مدة: عدد الأيام في الطلب الواحد. أقصى عدد في نفس اليوم: كام موظف يقدروا يكونوا في إجازة في نفس اليوم. فترة منع: تواريخ مش بيتقبل فيها أي طلب.', null],
  value: ['القيمة', 'الحد الأقصى المسموح بيه. الطلبات المعتمدة والمنتظرة بتتحسب.', null],
  scope: ['النطاق', 'كل الشركة: العدد بيتحسب على كل الموظفين. نفس القسم: بيتحسب على موظفين نفس قسم مقدّم الطلب.', null],
  block: ['فترة المنع', 'أي طلب بيتقاطع مع الفترة دي بيترفض.', null],
  types: ['أنواع الإجازات', 'القاعدة بتتطبق على الأنواع المختارة فقط.', null],
};
HELP.leave_profile = {
  details: ['ملف الإجازة والاستراحة', 'مجموعة أرصدة إجازات وقواعد استراحة بتتربط بالموظف من صفحة بياناته. الموظف اللي ليه ملف بيتفحص رصيده عند تقديم أي طلب إجازة.', 'الموظف اللي مالوش ملف بيستخدم «الإجازة السنوية» من بياناته.'],
  annual: ['الإجازة السنوية', 'عدد أيام الإجازة السنوية في السنة. لو الطلب هيعدي الرصيد بيترفض.', null],
  sick: ['المرضية والطارئة', 'أقصى أيام في السنة لكل نوع. اكتبي 0 لو مفيش حد.', null],
  carry: ['ترحيل الرصيد', 'لو مفعّل، الرصيد المتبقي بيتنقل للسنة اللي بعدها.', null],
  brk: ['الاستراحة', 'مدة الاستراحة اليومية. لو غير مدفوعة بتتشال من ساعات الوردية المدفوعة (فبيزيد أجر الساعة المستخدم في الخصومات والوقت الإضافي).', 'مدفوعة: مفيش أي تأثير على الحساب.'],
};

const ATT_DEF = {
  holiday: {
    title: 'عطلة رسمية', newLabel: 'إضافة عطلة رسمية', search: 'ابحث في العطلات الرسمية',
    nw: () => ({ name: '', date: '', to: '', yearly: true }),
    groups: [{ title: 'العطلة', idx: [0] }, { title: 'المدة', idx: [1] }],
    subtitle: 'يوم أو فترة عطلة رسمية بدون خصم غياب',
    brief: (it) => { const n = dayCount(it.date, it.to || it.date); return `${dmy(it.date)}${n > 1 ? ` ← ${dmy(it.to)}` : ''} · ${plural(n, 'يوم واحد', 'أيام')}${truthy2(it.yearly) ? ' · كل سنة' : ''}`; },
    chipLabel: 'التكرار', chips: [['all', 'الكل', () => true], ['y', 'سنوياً', (it) => truthy2(it.yearly)], ['o', 'مرة واحدة', (it) => !truthy2(it.yearly)]],
    cols: [
      ['العطلة', (it) => `<b>${esc(it.name)}</b>`],
      ['الفترة', (it) => { const n = dayCount(it.date, it.to || it.date); return `<span dir="ltr">${dmy(it.date)}${n > 1 ? ` ← ${dmy(it.to)}` : ''}</span>`; }],
      ['المدة', (it) => `<span class="badge b-info">${plural(dayCount(it.date, it.to || it.date), 'يوم واحد', 'أيام')}</span>`],
      ['التكرار', (it) => `<span class="badge ${truthy2(it.yearly) ? 'b-ok' : ''}">${truthy2(it.yearly) ? 'كل سنة' : 'مرة واحدة'}</span>`],
    ],
    steps: () => [
      { title: 'تفاصيل العطلة', sub: 'اسم العطلة وهل بتتكرر', icon: 'gift', help: 'details',
        body: (d) => `${nameFld(d, 'مثلاً: عيد الفطر')}<div class="pwfld" data-help="yearly"><label class="lbl">التكرار</label>${pwRadio('yearly', d.yearly ? 'true' : 'false', [['true', 'تتكرر كل سنة', 'نفس اليوم والشهر كل سنة'], ['false', 'مرة واحدة', 'السنة المحددة فقط']], 'two')}</div>`,
        check: nameChk },
      { title: 'فترة العطلة', sub: 'أول يوم وآخر يوم', icon: 'calendar', help: 'dates',
        body: (d) => `<div class="pwfld" data-help="dates"><label class="lbl">من تاريخ</label><input type="date" data-k="date" value="${esc(d.date)}"></div>
          <div class="pwfld" data-help="dates"><label class="lbl">إلى تاريخ <span class="muted small">(سيبيه فاضي لو يوم واحد)</span></label><input type="date" data-k="to" value="${esc(d.to && d.to !== d.date ? d.to : '')}"></div>
          <div class="pwcalc"><b id="hsum"></b></div>`,
        on: (root, d) => { const s = root.querySelector('#hsum'); const c = () => { const n = dayCount(d.date, d.to || d.date); s.textContent = d.date && n ? `${plural(n, 'يوم واحد', 'أيام')} · ${dmy(d.date)}${n > 1 ? ' ← ' + dmy(d.to) : ''}` : ''; }; root.querySelectorAll('[data-k]').forEach((i) => i.addEventListener('input', c)); c(); },
        check: (d) => (!d.date ? 'اختاري تاريخ بداية العطلة' : d.to && d.to < d.date ? 'نهاية العطلة قبل بدايتها' : dayCount(d.date, d.to || d.date) > 60 ? 'العطلة الواحدة حد أقصى 60 يوم' : null) },
    ],
  },
  compensation_rule: {
    title: 'قاعدة تعويض', newLabel: 'إضافة قاعدة تعويض', search: 'ابحث في قواعد التعويض',
    nw: () => ({ name: '', applies: 'both', mode: 'pay', factor: 2, days: 1, min_hours: 0 }),
    groups: [{ title: 'القاعدة', idx: [0] }, { title: 'التعويض', idx: [1] }],
    subtitle: 'تعويض الموظف اللي بيشتغل في عطلة رسمية أو إجازة أسبوعية',
    brief: (it) => `${APPLIES[it.applies] || ''} · ${it.mode === 'time_off' ? `${plural(Number(it.days), 'يوم إجازة بدل', 'أيام إجازة بدل')}` : `أجر يوم × ${it.factor}`}${Number(it.min_hours) > 0 ? ` · من ${it.min_hours} س` : ''}`,
    chipLabel: 'التعويض', chips: [['all', 'الكل', () => true], ['pay', 'أجر إضافي', (it) => it.mode !== 'time_off'], ['off', 'إجازة بدل', (it) => it.mode === 'time_off']],
    cols: [
      ['القاعدة', (it) => `<b>${esc(it.name)}</b>`],
      ['تنطبق على', (it) => `<span class="badge b-info">${APPLIES[it.applies] || '—'}</span>`],
      ['التعويض', (it) => (it.mode === 'time_off' ? `<span class="badge b-warn">${plural(Number(it.days), 'يوم إجازة بدل', 'أيام إجازة بدل')}</span>` : `<span class="badge b-ok">أجر يوم × ${esc(it.factor)}</span>`)],
      ['الحد الأدنى', (it) => (Number(it.min_hours) > 0 ? `${it.min_hours} ساعة` : '<span class="muted small">أي حضور</span>')],
    ],
    steps: () => [
      { title: 'تفاصيل القاعدة', sub: 'الاسم وبتنطبق على إيه', icon: 'shield', help: 'details',
        body: (d) => `${nameFld(d, 'مثلاً: العمل في العطلات')}<div class="pwfld" data-help="applies"><label class="lbl">بتنطبق على</label>${pwRadio('applies', d.applies, [['holiday', 'العطلات الرسمية', 'الأيام المسجلة في العطلات الرسمية'], ['weekend', 'الإجازة الأسبوعية', 'أيام الويك إند'], ['both', 'الاثنين', 'أي يوم من النوعين']])}</div>`,
        check: nameChk },
      { title: 'التعويض', sub: 'أجر إضافي أو يوم إجازة بدل', icon: 'dollar', help: 'ckind',
        body: (d) => `<div class="pwfld" data-help="ckind"><label class="lbl">شكل التعويض</label>${pwRadio('mode', d.mode, [['pay', 'أجر إضافي', 'بيتضاف للمرتب'], ['time_off', 'يوم إجازة بدل', 'رصيد أيام بدل']], 'two')}</div>
          ${d.mode === 'time_off'
    ? `<div class="pwfld" data-help="cdays"><label class="lbl">أيام الإجازة البدل عن كل يوم عمل</label>${pwStep('data-k="days"', d.days, 0.5, 0.5, 5)}</div>`
    : `<div class="pwfld" data-help="cfactor"><label class="lbl">معامل أجر اليوم</label>${pwStep('data-k="factor"', d.factor, 0.25, 0.25, 10)}</div>
          <div class="pwcalc" data-help="csim"><b>جرّبي حساب</b><div class="ufld"><input type="number" id="csal" min="0" step="100" value="6000"><span>مرتب</span></div><div id="cres" class="pwres"></div></div>`}
          <div class="pwfld" data-help="cmin"><label class="lbl">الحد الأدنى لساعات العمل</label>${pwNum('min="0" max="24" step="0.5" data-k="min_hours"', d.min_hours, 'ساعة')}</div>`,
        on: (root, d) => { const s = root.querySelector('#csal'), r = root.querySelector('#cres'); if (!s) return; const c = () => { const day = (Number(s.value) || 0) / 30; r.innerHTML = `أجر اليوم ${money(day)} ← تعويض اليوم الواحد <b>${money(day * (Number(d.factor) || 0))}</b>`; }; s.addEventListener('input', c); root.querySelectorAll('[data-k="factor"],[data-sp]').forEach((i) => i.addEventListener(i.dataset.sp ? 'click' : 'input', () => setTimeout(c, 0))); c(); },
        check: (d) => (d.mode === 'time_off' ? (!(Number(d.days) > 0) || Number(d.days) > 5 ? 'أيام الإجازة البدل بين 0.5 و 5' : null) : (!(Number(d.factor) > 0) || Number(d.factor) > 10 ? 'معامل أجر اليوم بين 0.25 و 10' : null)) || (Number(d.min_hours) < 0 || Number(d.min_hours) > 24 ? 'ساعات العمل بين 0 و 24' : null) },
    ],
  },
  holiday_limit: {
    title: 'قاعدة حد من الإجازات', newLabel: 'إضافة قاعدة', search: 'ابحث في قواعد الحد من الإجازات',
    nw: () => ({ name: '', rule: 'max_consecutive', value: 5, from: '', to: '', scope: 'all', types: ['annual_leave'] }),
    groups: [{ title: 'القاعدة', idx: [0] }, { title: 'الحد', idx: [1] }, { title: 'الإجازات', idx: [2] }],
    subtitle: 'تُفحص تلقائياً عند تقديم طلب الإجازة',
    brief: (it) => (it.rule === 'blackout' ? `ممنوع من ${dmy(it.from)} إلى ${dmy(it.to)}` : it.rule === 'max_concurrent' ? `حد أقصى ${plural(Number(it.value), 'موظف واحد', 'موظفين')} في نفس اليوم · ${it.scope === 'department' ? 'نفس القسم' : 'كل الشركة'}` : `حد أقصى ${plural(Number(it.value), 'يوم واحد', 'أيام')} في الطلب الواحد`),
    chipLabel: 'النوع', chips: [['all', 'الكل', () => true], ...Object.entries(LIM_RULE).map(([k, l]) => [k, l, (it) => it.rule === k])],
    cols: [
      ['القاعدة', (it) => `<b>${esc(it.name)}</b>`],
      ['النوع', (it) => `<span class="badge b-info">${LIM_RULE[it.rule] || '—'}</span>`],
      ['الحد', (it) => `<span class="small">${esc(ATT_DEF.holiday_limit.brief(it))}</span>`],
      ['تشمل', (it) => `<div class="pcs">${(it.types || []).map((t) => `<span class="pc">${LV_NAME[t] || t}</span>`).join('')}</div>`],
    ],
    steps: () => [
      { title: 'تفاصيل القاعدة', sub: 'الاسم ونوع الحد', icon: 'shield', help: 'details',
        body: (d) => `${nameFld(d, 'مثلاً: حد الإجازة المتواصلة')}<div class="pwfld" data-help="rule"><label class="lbl">نوع القاعدة</label>${pwRadio('rule', d.rule, [['max_consecutive', 'أقصى مدة للطلب', 'عدد أيام الطلب الواحد'], ['max_concurrent', 'أقصى عدد في نفس اليوم', 'كام موظف في إجازة مع بعض'], ['blackout', 'فترة منع', 'تواريخ ممنوع فيها الإجازات']])}</div>`,
        check: nameChk },
      { title: 'الحد', sub: 'القيمة اللي القاعدة بتفرضها', icon: 'sliders', help: 'value',
        body: (d) => (d.rule === 'blackout'
          ? `<div class="pwfld" data-help="block"><label class="lbl">ممنوع من</label><input type="date" data-k="from" value="${esc(d.from)}"></div><div class="pwfld" data-help="block"><label class="lbl">إلى</label><input type="date" data-k="to" value="${esc(d.to)}"></div>`
          : `<div class="pwfld" data-help="value"><label class="lbl">${d.rule === 'max_concurrent' ? 'أقصى عدد موظفين في إجازة في نفس اليوم' : 'أقصى عدد أيام في الطلب الواحد'}</label>${pwStep('data-k="value"', d.value, 1, 1, 365)}</div>
            ${d.rule === 'max_concurrent' ? `<div class="pwfld" data-help="scope"><label class="lbl">النطاق</label>${pwRadio('scope', d.scope, [['all', 'كل الشركة', 'كل الموظفين'], ['department', 'نفس القسم', 'موظفين نفس قسم مقدم الطلب']], 'two')}</div>` : ''}`),
        check: (d) => (d.rule === 'blackout' ? (!d.from || !d.to ? 'حددي فترة المنع (من وإلى)' : d.to < d.from ? 'نهاية الفترة قبل بدايتها' : null) : (!(Number(d.value) >= 1) ? 'القيمة لازم تكون 1 أو أكتر' : null)) },
      { title: 'أنواع الإجازات', sub: 'القاعدة بتتطبق على أنهي إجازات', icon: 'calendar', help: 'types',
        body: (d) => `<div class="pwfld" data-help="types"><label class="lbl">تُطبق على</label>${LV_LIST.map(([k, l, s]) => `<label class="cc ${d.types.includes(k) ? 'on' : ''}"><input type="checkbox" data-ty="${k}" ${d.types.includes(k) ? 'checked' : ''}><span><b>إجازة ${l}</b><small>${s}</small></span></label>`).join('')}</div>`,
        on: (root, d) => root.querySelectorAll('[data-ty]').forEach((el) => (el.onchange = () => { const s = new Set(d.types); if (el.checked) s.add(el.dataset.ty); else s.delete(el.dataset.ty); d.types = [...s]; el.closest('.cc').classList.toggle('on', el.checked); })),
        check: (d) => (d.types.length ? null : 'اختاري نوع إجازة واحد على الأقل') },
    ],
  },
  leave_profile: {
    title: 'ملف إجازة واستراحة', newLabel: 'إضافة ملف', search: 'ابحث في ملفات الإجازة والاستراحة',
    nw: () => ({ name: '', annual: 21, sick: 0, emergency: 0, carry: false, break_min: 60, break_paid: true }),
    groups: [{ title: 'الملف', idx: [0] }, { title: 'بنود الملف', idx: [1, 2] }],
    subtitle: 'أرصدة الإجازات وقواعد الاستراحة للموظفين المربوطين بيه',
    brief: (it) => `سنوية ${it.annual} · مرضية ${Number(it.sick) > 0 ? it.sick : 'بدون حد'} · طارئة ${Number(it.emergency) > 0 ? it.emergency : 'بدون حد'}`,
    chipLabel: 'الاستراحة', chips: [['all', 'الكل', () => true], ['p', 'مدفوعة', (it) => it.break_paid !== false], ['u', 'غير مدفوعة', (it) => it.break_paid === false]],
    cols: [
      ['الملف', (it) => `<b>${esc(it.name)}</b>`],
      ['الأرصدة', (it) => `<span class="small">${esc(ATT_DEF.leave_profile.brief(it))}${it.carry ? ' · يُرحَّل' : ''}</span>`],
      ['الاستراحة', (it) => (Number(it.break_min) > 0 ? `<span class="badge ${it.break_paid === false ? 'b-warn' : 'b-ok'}">${it.break_min} د ${it.break_paid === false ? 'غير مدفوعة' : 'مدفوعة'}</span>` : '<span class="muted small">بدون</span>')],
      ['الموظفون', (it) => (it._n ? `<span class="badge b-info">${plural(it._n, 'موظف واحد', 'موظفين')}</span>` : '<span class="muted small">غير مربوط بعد</span>')],
    ],
    async load(rows) { const emps = await api('/employees').catch(() => []); rows.forEach((r) => { r._n = emps.filter((e) => String(e.leave_profile_id || '') === String(r.id)).length; }); },
    delMsg: (it) => (it._n ? `الملف ده مربوط بـ ${it._n} موظف، ولو اتحذف هيرجعوا لرصيد «الإجازة السنوية» من بياناتهم. متأكدة؟` : 'حذف الملف ده؟'),
    steps: () => [
      { title: 'تفاصيل الملف', sub: 'اسم الملف', icon: 'file', help: 'details', body: (d) => nameFld(d, 'مثلاً: موظفين بدوام كامل'), check: nameChk },
      { title: 'أرصدة الإجازات', sub: 'أيام كل نوع في السنة', icon: 'calendar', help: 'annual',
        body: (d) => `<div class="pwfld" data-help="annual"><label class="lbl">الإجازة السنوية</label>${pwNum('min="0" max="365" data-k="annual"', d.annual, 'يوم')}</div>
          <div class="pwfld" data-help="sick"><label class="lbl">الإجازة المرضية <span class="muted small">(0 = بدون حد)</span></label>${pwNum('min="0" max="365" data-k="sick"', d.sick, 'يوم')}</div>
          <div class="pwfld" data-help="sick"><label class="lbl">الإجازة الطارئة <span class="muted small">(0 = بدون حد)</span></label>${pwNum('min="0" max="365" data-k="emergency"', d.emergency, 'يوم')}</div>
          <div class="pwfld" data-help="carry"><label class="lbl">ترحيل الرصيد المتبقي</label>${pwRadio('carry', d.carry ? 'true' : 'false', [['false', 'لا يُرحَّل', 'الرصيد بيتصفّر كل سنة'], ['true', 'يُرحَّل', 'الباقي بيتنقل للسنة اللي بعدها']], 'two')}</div>`,
        check: (d) => (['annual', 'sick', 'emergency'].some((k) => Number(d[k]) < 0 || Number(d[k]) > 365) ? 'الأرصدة بين 0 و 365 يوم' : null) },
      { title: 'الاستراحة', sub: 'مدتها وهل هي مدفوعة', icon: 'pause', help: 'brk',
        body: (d) => `<div class="pwfld" data-help="brk"><label class="lbl">مدة الاستراحة اليومية</label>${pwNum('min="0" max="240" data-k="break_min"', d.break_min, 'دقيقة')}</div>
          <div class="pwfld" data-help="brk"><label class="lbl">الاستراحة</label>${pwRadio('break_paid', d.break_paid !== false ? 'true' : 'false', [['true', 'مدفوعة', 'بدون تأثير على الحساب'], ['false', 'غير مدفوعة', 'بتتشال من ساعات الوردية المدفوعة']], 'two')}</div>`,
        check: (d) => (Number(d.break_min) < 0 || Number(d.break_min) > 240 ? 'الاستراحة بين 0 و 240 دقيقة' : null) },
    ],
  },
};
const truthy2 = (v) => v === true || v === 'true' || v === 1 || v === '1';

function attSpec(kind) {
  const def = ATT_DEF[kind], keys = POL_KEYS[kind], api_ = cfgApi(kind);
  const pick = (it) => Object.fromEntries(keys.map((k) => [k, clone(k === 'name' ? it.name : it[k])]));
  const snap = (it) => ({ at: stamp(), ...pick(it) });
  const brief = def.brief;
  const spec = { kind, keys, snap, brief };
  spec.saveWith = (it, d, over = {}) => {
    const body = { ...clone(d), name: String(d.name || '').trim(), active: over.active ?? (it ? (it.active ? '1' : '0') : '1'), archived: over.archived ?? (it ? !!it.archived : false) };
    const changed = it && keys.some((k) => JSON.stringify(clone(k === 'name' ? it.name : it[k]) ?? null) !== JSON.stringify(clone(k === 'name' ? body.name : body[k]) ?? null));
    body.versions = it ? (changed ? [snap(it), ...(it.versions || [])].slice(0, 30) : (it.versions || [])) : [];
    return api_.save(it, body);
  };
  const flip = (it, over) => spec.saveWith(it, { ...pick(it), name: it.name }, over);
  return Object.assign(spec, {
    ...api_, newLabel: def.newLabel, searchPh: def.search, counts: true, tabs: POL_TABS, actHead: 'الإصدارات والإجراءات',
    chips: def.chips, chipLabel: def.chipLabel, text: (it) => `${it.name} ${brief(it)}`,
    load: async () => { const rows = await api_.load(); if (def.load) await def.load(rows); return rows; },
    cols: [...def.cols, ['حالة', polBadge]],
    rowActs: (it) => `<div class="racts"><button class="vchip" data-a="ver" data-id="${it.id}" ${(it.versions || []).length ? '' : 'disabled'}>${(it.versions || []).length ? `إصدارات ${it.versions.length}` : 'لا توجد إصدارات سابقة'}</button>
      <button class="sqb" data-a="edit" data-id="${it.id}" title="تعديل">${ico('edit')}</button><button class="sqb" data-a="dup" data-id="${it.id}" title="نسخ">${ico('copy')}</button>
      <button class="sqb" data-a="arch" data-id="${it.id}" title="${it.archived ? 'استرجاع' : 'أرشفة'}">${ico('archive')}</button><button class="sqb" data-more="${it.id}" title="المزيد">${ico('dots')}</button></div>`,
    more: (it) => [['tog', it.active ? 'تعطيل' : 'تفعيل'], ['del', 'حذف', 1]],
    delMsg: def.delMsg || (() => 'حذف السجل ده؟'),
    form: (it, reload) => {
      const base = def.nw();
      const d = it ? { ...base, ...Object.fromEntries(keys.map((k) => [k, clone(k === 'name' ? it.name : it[k])]).filter(([, v]) => v !== null && v !== undefined)) } : base;
      policyWizard({ d, guided: !it, groups: def.groups, steps: def.steps(), help: HELP[kind], title: `${it ? 'تعديل' : 'إضافة'} ${def.title}`, subtitle: def.subtitle, progressLabel: def.title, onChange: attOnChange, onSave: (dd) => spec.saveWith(it, dd), done: reload });
    },
    act: async (a, it, reload) => {
      if (a === 'ver') return polVersions(it, spec, reload);
      if (a === 'dup') { await spec.saveWith(null, { ...pick(it), name: `${it.name} (نسخة)` }, { active: '1', archived: false }); toast('تم النسخ'); return reload(); }
      if (a === 'arch') { await flip(it, { archived: !it.archived }); toast(it.archived ? 'تم الاسترجاع' : 'تمت الأرشفة'); return reload(); }
      if (a === 'tog') { await flip(it, { active: it.active ? '0' : '1' }); toast(it.active ? 'تم التعطيل' : 'تم التفعيل'); return reload(); }
    },
  });
}

/* --- أنواع الإجازات --- */
const PAY = { paid: ['مدفوع', 'b-ok'], partial: ['جزئي', 'b-info'], unpaid: ['غير مدفوع', 'b-warn'] };
const payOf = (it) => it.pay || (it.paid === false || it.paid === 'false' ? 'unpaid' : 'paid');
const leaveTypeSpec = () => {
  const api_ = cfgApi('leave_type');
  return {
    ...api_, newLabel: 'إنشاء نوع إجازة', searchPh: 'البحث عن أنواع الإجازات...', tpl: 'leave_template', chipsFirst: true, chipLabel: '',
    fields: [
      { k: 'pay', l: 'نوع الدفع', t: 'select', o: [['paid', 'مدفوع'], ['partial', 'مدفوع جزئياً'], ['unpaid', 'غير مدفوع']], d: 'paid' },
      { k: 'pay_pct', l: 'نسبة الدفع % (للمدفوع جزئياً)', t: 'number', d: 50, attrs: 'min="1" max="99"' },
      { k: 'days', l: 'الحد الأقصى سنوياً (يوم)', t: 'number', attrs: 'min="0"' }, { k: 'description', l: 'الوصف', full: true },
    ],
    nameLabel: 'اسم الإجازة',
    tabs: [['all', 'الكل', () => true], ['1', 'نشط', (it) => it.active], ['0', 'غير نشط', (it) => !it.active]],
    chips: [['all', 'الكل', () => true], ['paid', 'مدفوع', (it) => payOf(it) === 'paid'], ['unpaid', 'غير مدفوع', (it) => payOf(it) === 'unpaid'], ['partial', 'مدفوع جزئياً', (it) => payOf(it) === 'partial']],
    text: (it) => `${it.name} ${it.description || ''}`,
    cols: [['اسم الإجازة', (it) => `<b>${esc(it.name)}</b>`], ['نوع الدفع', (it) => `<span class="badge ${PAY[payOf(it)][1]}">${PAY[payOf(it)][0]}</span>`], ['حالة', statusBadge]],
    expand: (it) => `<div class="xgrid"><div><span class="muted small">الحد الأقصى سنوياً</span><b>${it.days ? `${esc(it.days)} يوم` : 'غير محدد'}</b></div><div><span class="muted small">نسبة الدفع</span><b>${payOf(it) === 'paid' ? '100%' : payOf(it) === 'unpaid' ? '0%' : `${esc(it.pay_pct || 50)}%`}</b></div><div><span class="muted small">الوصف</span><b>${esc(it.description || '—')}</b></div></div>`,
    pre: (it, b) => { b.paid = b.pay === 'paid'; if (b.pay !== 'partial') b.pay_pct = b.pay === 'paid' ? 100 : 0; },
    rowActs: (it) => `<div class="racts"><button class="sqb" data-a="del" data-id="${it.id}" title="حذف">${ico('trash')}</button><button class="sqb" data-a="arch" data-id="${it.id}" title="${it.active ? 'تعطيل' : 'تفعيل'}">${ico('archive')}</button><button class="sqb" data-a="edit" data-id="${it.id}" title="تعديل">${ico('edit')}</button><button class="sqb" data-a="dup" data-id="${it.id}" title="نسخ">${ico('copy')}</button></div>`,
    act: async (a, it, reload) => {
      const body = { name: it.name, pay: payOf(it), pay_pct: it.pay_pct, days: it.days, description: it.description, paid: payOf(it) === 'paid' };
      if (a === 'dup') { await api_.save(null, { ...body, name: `${it.name} (نسخة)`, active: '1' }); toast('تم النسخ'); reload(); }
      else if (a === 'arch') { await api_.save(it, { ...body, active: it.active ? '0' : '1' }); toast(it.active ? 'تم التعطيل' : 'تم التفعيل'); reload(); }
    },
  };
};

/* --- الإطار العام لصفحات الإعدادات --- */
async function renderSettings(view, top) {
  S.sub = S.sub || {};
  const subs = SET_SUB[top] || [];
  const cur = subs.length ? (subs.find((x) => x[0] === S.sub[top]) || subs[0])[0] : SET_SINGLE[top];
  view.innerHTML = `<div class="card setnav"><div class="stabs">${SET_TOP.map(([k, l, ic]) => `<button data-st="${k}" class="${k === top ? 'on' : ''}">${ic ? ico(ic) : ''}<span>${l}</span></button>`).join('')}</div>
    ${subs.length ? `<div class="ssubs">${subs.map(([k, l]) => `<button data-ss="${k}" class="${k === cur ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}</div><div id="sbody"><div class="empty"><span class="spin"></span></div></div>`;
  view.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => go('set_' + b.dataset.st)));
  view.querySelectorAll('[data-ss]').forEach((b) => (b.onclick = () => { S.sub[top] = b.dataset.ss; renderSettings(view, top); }));
  const body = $('#sbody', view);
  try {
    SETV = await api('/settings');
    if (cur === 'offices') await catalog(body, officesSpec());
    else if (cur === 'schedule') await catalog(body, schedSpec());
    else if (cur === 'payroll_preset') await catalog(body, presetSpec());
    else if (cur === 'penalty') await catalog(body, policySpec('penalty_policy'));
    else if (cur === 'overtime') await catalog(body, policySpec('overtime_policy'));
    else if (['holiday', 'compensation_rule', 'holiday_limit', 'leave_profile'].includes(cur)) await catalog(body, attSpec(cur));
    else if (cur === 'leave_type') await catalog(body, leaveTypeSpec());
    else if (cur === 'misc') {
      await settingsForm(body, { title: 'إعدادات متنوعة', refresh: true, fields: [
        { sec: 'بيانات الشركة' },
        { k: 'company_name', l: 'اسم الشركة', full: true }, { k: 'country', l: 'الدولة' }, { k: 'currency', l: 'العملة', t: 'select', o: Object.keys(CUR).map((c) => [c, `${c} - ${CUR[c]}`]) },
        { k: 'language', l: 'اللغة', t: 'select', o: [['arabic', 'arabic'], ['english', 'english']] }, { k: 'timezone', l: 'المنطقة الزمنية', attrs: 'dir="ltr"' },
        { k: 'month_start', l: 'بداية الشهر (يوم)', t: 'number', attrs: 'min="1" max="28"' }, { k: 'first_month', l: 'أول شهر في السنة', t: 'select', o: MONTHS.map((m) => [m, m]) },
        { k: 'week_start', l: 'بداية الأسبوع', t: 'select', o: DAYS.map((d, i) => [String(i), d]) },
        { sec: 'الحضور والأمان' }, { k: '_days' },
        { k: 'face_threshold', l: 'حساسية مطابقة الوجه (0.3 أشد – 0.7 أخف)', t: 'number', attrs: 'step="0.05" min="0.3" max="0.7"' },
        { k: 'signup_enabled', l: 'السماح بإنشاء حساب جديد من صفحة الدخول (بيحتاج موافقتك)', t: 'check' }] });
    } else if (SIMPLE[cur]) await catalog(body, simpleSpec(cur, ...SIMPLE[cur]));
  } catch (e) { body.innerHTML = `<div class="card empty neg">${esc(e.message)}</div>`; }
}
PAGES.set_company = (v) => renderSettings(v, 'company');
PAGES.set_attendance = (v) => renderSettings(v, 'attendance');
PAGES.set_finance = (v) => renderSettings(v, 'finance');
PAGES.set_documents = (v) => renderSettings(v, 'documents');
PAGES.set_automation = (v) => renderSettings(v, 'automation');
PAGES.set_overrides = (v) => renderSettings(v, 'overrides');
PAGES.set_misc = (v) => renderSettings(v, 'misc');
PAGES.settings = PAGES.set_company;

function locForm(l, done) {
  const o = modal(`<h3>${l ? 'تعديل موقع' : 'موقع عمل جديد'}</h3><form class="form" id="lcf">
    <label class="f full">اسم الموقع (مثلاً: الإدارة)<input name="name" value="${esc(l?.name)}" required maxlength="60"></label>
    <label class="f">خط العرض<input name="lat" value="${esc(l?.lat ?? '')}" inputmode="decimal" required></label>
    <label class="f">خط الطول<input name="lng" value="${esc(l?.lng ?? '')}" inputmode="decimal" required></label>
    <label class="f">النطاق المسموح (متر)<input type="number" name="radius_m" min="20" max="5000" value="${l?.radius_m ?? 150}" required></label>
    <div style="align-self:end"><button type="button" class="btn alt" id="here" style="width:100%">استخدام موقعي الحالي</button></div>
    <label class="f">الحالة<select name="active"><option value="1" ${l && !l.active ? '' : 'selected'}>نشط</option><option value="0" ${l && !l.active ? 'selected' : ''}>غير نشط</option></select></label>
    <p class="muted small full" style="margin:0">الأفضل تفتحي الصفحة وانتِ في مكان العمل وتضغطي «استخدام موقعي الحالي».</p>
    <div class="actions full"><button type="button" class="btn alt" data-close>إلغاء</button><button class="btn">حفظ</button></div></form>`);
  const f = $('#lcf', o);
  $('#here', o).onclick = (e) => run(e.target, async () => { const p = await getPos(); f.lat.value = p.lat.toFixed(6); f.lng.value = p.lng.toFixed(6); toast(`تم التقاط الموقع (دقة ~${Math.round(p.acc)} م)`); });
  f.onsubmit = (e) => { e.preventDefault(); run($('.btn:not(.alt)', f), async () => {
    const b = { name: f.name.value, lat: f.lat.value, lng: f.lng.value, radius_m: f.radius_m.value, active: f.active.value };
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
async function tiersUI(view, embedded) {
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
    view.innerHTML = `${embedded ? '' : financeTabs('tiers') + '<div class="page-head"><h2>شرائح خصم التأخير</h2></div>'}
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
    if (!embedded) bindTabs(view, (t) => go(t));
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
}
PAGES.tiers = (view) => tiersUI(view, false);

/* ====== وضع التطبيق (شكل الموبايل زي الشاشات المرجعية) — بيشتغل بس لما is-app ====== */
const G = (inner) => `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
const FI = {
  b_sched: '<circle cx="10" cy="7.2" r="3.8" fill="currentColor"/><path d="M3 19.5c0-3.7 3-6 7-6 1.3 0 2.5.2 3.5.7a5.2 5.2 0 0 0-.9 3c0 .8.2 1.6.5 2.3H3z" fill="currentColor"/><circle cx="18" cy="17.2" r="4.4" fill="currentColor" opacity=".55"/><path d="M16 17.3l1.4 1.4 2.6-2.8" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  b_dash: '<rect x="3" y="3" width="8" height="8" rx="2.2" fill="currentColor" opacity=".45"/><rect x="13" y="3" width="8" height="13" rx="2.2" fill="currentColor"/><rect x="3" y="13" width="8" height="8" rx="2.2" fill="currentColor"/><rect x="13" y="18" width="8" height="3" rx="1.5" fill="currentColor" opacity=".45"/>',
  b_team: '<circle cx="12" cy="8" r="3.6" fill="currentColor"/><path d="M5.5 20c0-3.6 2.7-5.8 6.5-5.8s6.5 2.2 6.5 5.8z" fill="currentColor"/><circle cx="4.8" cy="9.6" r="2.3" fill="currentColor" opacity=".5"/><circle cx="19.2" cy="9.6" r="2.3" fill="currentColor" opacity=".5"/><path d="M1 18c0-2.3 1.6-3.8 4-3.8.5 0 1 .1 1.4.2-1 .9-1.6 2.1-1.8 3.6H1zM23 18c0-2.3-1.6-3.8-4-3.8-.5 0-1 .1-1.4.2 1 .9 1.6 2.1 1.8 3.6H23z" fill="currentColor" opacity=".5"/>',
  b_menu: '<rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="currentColor" opacity=".22"/><path d="M7 9h10M7 12.5h10M7 16h10" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  b_clock: '<circle cx="12" cy="12" r="9.5" fill="currentColor" opacity=".25"/><path d="M12 6.5V12l3.5 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  plus: G('<path d="M12 4.5v15M4.5 12h15"/>'),
  bell: G('<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  sliders: G('<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>'),
  search: G('<circle cx="11" cy="11" r="6.5"/><path d="M16.5 16.5L21 21"/>'),
  back: G('<path d="M9 5l7 7-7 7"/>'),
  chev_l: G('<path d="M15 5l-7 7 7 7"/>'),
  chev_up: G('<path d="M6 15l6-6 6 6"/>'),
  chev_dn: G('<path d="M6 9l6 6 6-6"/>'),
  info_fill: '<circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M12 11v5.2" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7.9" r="1.2" fill="#fff"/>',
  clock_c: G('<path d="M12 6.5V12l3.2 2"/>'),
  pin: G('<path d="M12 21s-6.5-5.4-6.5-10.2a6.5 6.5 0 0 1 13 0C18.5 15.6 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>'),
  in_m: G('<path d="M4 12h11M11 8l4 4-4 4M20 5v14"/>'),
  out_m: G('<path d="M20 12H9M13 8l-4 4 4 4M4 5v14"/>'),
  sq_in: G('<path d="M3.5 12h10M10 8.2l3.8 3.8-3.8 3.8"/><path d="M16 4.5h2.2A1.8 1.8 0 0 1 20 6.3v11.4a1.8 1.8 0 0 1-1.8 1.8H16"/>'),
  sq_out: G('<path d="M20.5 12h-10M14 8.2L10.2 12l3.8 3.8"/><path d="M8 4.5H5.8A1.8 1.8 0 0 0 4 6.3v11.4a1.8 1.8 0 0 0 1.8 1.8H8"/>'),
  calsearch: G('<rect x="3" y="4.5" width="15.5" height="15.5" rx="3"/><path d="M3 9.8h15.5M8 2.8v3.4M13.5 2.8v3.4"/><circle cx="16.8" cy="16.8" r="3.4" fill="var(--abg,#fff)"/><path d="M19.4 19.4L22 22"/>'),
  q_swap: G('<path d="M5 12a7 7 0 0 1 12-4.9L19 9M19 4.5V9h-4.5M19 12a7 7 0 0 1-12 4.9L5 15M5 19.5V15h4.5"/>'),
  q_in: '<rect x="13" y="4.5" width="7.5" height="15" rx="2.2" fill="currentColor" opacity=".35"/><path d="M3.5 12H14M10.3 8.3L14 12l-3.7 3.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  q_file: '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H13l6 6v9.5A2.5 2.5 0 0 1 16.5 21h-9A2.5 2.5 0 0 1 5 18.5z" fill="currentColor" opacity=".3"/><path d="M13 3l6 6h-3.5A2.5 2.5 0 0 1 13 6.5z" fill="currentColor"/><text x="11.5" y="17.4" font-size="9" font-weight="800" fill="currentColor" text-anchor="middle" font-family="Arial,sans-serif">?</text>',
  q_dollar: '<circle cx="12" cy="12" r="9" fill="currentColor"/><text x="12" y="16.4" font-size="12" font-weight="800" fill="#fff" text-anchor="middle" font-family="Arial,sans-serif">$</text>',
  q_userplus: '<circle cx="10" cy="8" r="4" fill="currentColor"/><path d="M2.5 20.5c0-4 3.2-6.4 7.5-6.4 1 0 2 .1 2.8.4a5.2 5.2 0 0 0-.8 2.8c0 1.2.4 2.4 1.1 3.2z" fill="currentColor" opacity=".55"/><circle cx="18" cy="17" r="4" fill="currentColor"/><path d="M18 15v4M16 17h4" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>',
  q_task: '<rect x="4.5" y="4" width="15" height="17" rx="3" fill="currentColor" opacity=".3"/><rect x="8.5" y="2" width="7" height="4" rx="1.5" fill="currentColor"/><path d="M8.5 12h7M8.5 16h4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  logout: G('<path d="M4 12h12M12 7.5l4.5 4.5-4.5 4.5"/><path d="M17 4.5h1.5A1.5 1.5 0 0 1 20 6v12a1.5 1.5 0 0 1-1.5 1.5H17"/>'),
};
const fi = (n, cls = '') => `<svg class="ico fi ${cls}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${FI[n] || ''}</svg>`;
// أيقونات كروت القائمة الملوّنة
const CI = {
  att: '<circle cx="12" cy="12" r="9.2" fill="none" stroke="#2c3138" stroke-width="1.8"/><path d="M12 7.2v5.6" stroke="#2c3138" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.5" r="1.15" fill="#2c3138"/>',
  req: '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H13l6 6v9.5A2.5 2.5 0 0 1 16.5 21h-9A2.5 2.5 0 0 1 5 18.5z" fill="#cfe2f6"/><path d="M13 3l6 6h-3.5A2.5 2.5 0 0 1 13 6.5z" fill="#2d6cc4"/><text x="11.5" y="17.4" font-size="9.5" font-weight="800" fill="#2d6cc4" text-anchor="middle" font-family="Arial,sans-serif">?</text>',
  inbox: '<rect x="3" y="6.5" width="18" height="13" rx="3.2" fill="#cddff2"/><path d="M6.5 11l5.5 3.4 5.5-3.4" fill="none" stroke="#2d6cc4" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="19" cy="5.5" r="3" fill="#2d6cc4"/>',
  list: '<rect x="3" y="3" width="18" height="18" rx="5" fill="#cdeaf9"/><path d="M7 9.2l1.4 1.4L10.8 8M13 9.4h4M7 15.4l1.4 1.4 2.4-2.6M13 15.6h4" fill="none" stroke="#0e8fd0" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  money: '<circle cx="12" cy="12" r="9.5" fill="#cdeed6"/><text x="12" y="16.6" font-size="12.5" font-weight="800" fill="#1fa545" text-anchor="middle" font-family="Arial,sans-serif">$</text>',
  slip: '<path d="M6 3h12v17.5l-3-1.8-3 1.8-3-1.8-3 1.8z" fill="#d6f0dd"/><path d="M9 8h6M9 11.5h6M9 15h3.5" stroke="#1fa545" stroke-width="1.6" stroke-linecap="round"/>',
  penalty: '<circle cx="10" cy="8" r="4" fill="#a6b222"/><path d="M3 21c0-4 3-6.5 7-6.5s7 2.5 7 6.5z" fill="#eaedc0"/><circle cx="18" cy="16.6" r="3.7" fill="#a6b222"/><path d="M16.3 16.6h3.4" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3.5" fill="#fde5c8"/><path d="M3 10h18" stroke="#f08a1c" stroke-width="1.8"/><path d="M8 3v4M16 3v4" stroke="#f08a1c" stroke-width="2" stroke-linecap="round"/><rect x="7" y="13" width="3.2" height="3.2" rx=".8" fill="#f08a1c"/><rect x="13.5" y="13" width="3.2" height="3.2" rx=".8" fill="#f08a1c" opacity=".55"/>',
  users: '<circle cx="9" cy="8" r="3.6" fill="#14a9b7"/><path d="M2 20c0-3.6 3-5.8 7-5.8s7 2.2 7 5.8z" fill="#c9eef2"/><circle cx="17.5" cy="9" r="2.6" fill="#7fd0d9"/><path d="M17.5 14.2c2.6 0 4.5 1.6 4.5 4.3v1.5h-4" fill="#c9eef2"/>',
  user: '<circle cx="12" cy="8" r="4.2" fill="#3b82f6"/><path d="M4 21c0-4.2 3.6-6.8 8-6.8s8 2.6 8 6.8z" fill="#cfe0fb"/>',
  userplus: '<circle cx="10" cy="8" r="4" fill="#3b82f6"/><path d="M2.5 21c0-4 3.4-6.5 7.5-6.5 1 0 2 .1 2.8.4a5.2 5.2 0 0 0-.8 2.9c0 1.2.4 2.3 1.1 3.2z" fill="#cfe0fb"/><circle cx="18" cy="17" r="4" fill="#3b82f6"/><path d="M18 15v4M16 17h4" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>',
  key: '<circle cx="8.5" cy="14.5" r="4.5" fill="#e7defc"/><circle cx="8.5" cy="14.5" r="1.4" fill="#7c4ddb"/><path d="M12 11.5L20 3.5M16.5 7l3 3M14.3 9.2l2.2 2.2" stroke="#7c4ddb" stroke-width="2" stroke-linecap="round"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="3" fill="#e7defc"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="#7c4ddb" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="15.7" r="1.5" fill="#7c4ddb"/>',
  doc: '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H13l6 6v9.5A2.5 2.5 0 0 1 16.5 21h-9A2.5 2.5 0 0 1 5 18.5z" fill="#dfe4fb"/><path d="M13 3l6 6h-3.5A2.5 2.5 0 0 1 13 6.5z" fill="#5468d6"/><path d="M8.5 13h7M8.5 16.5h5" stroke="#5468d6" stroke-width="1.6" stroke-linecap="round"/>',
  org: '<rect x="9" y="3" width="6" height="5" rx="1.5" fill="#14a9b7"/><rect x="2.5" y="16" width="6" height="5" rx="1.5" fill="#7fd0d9"/><rect x="15.5" y="16" width="6" height="5" rx="1.5" fill="#7fd0d9"/><path d="M12 8v4M5.5 16v-4h13v4" fill="none" stroke="#14a9b7" stroke-width="1.7" stroke-linejoin="round"/>',
  swap: '<path d="M4 8h13l-3.2-3.2M20 16H7l3.2 3.2" fill="none" stroke="#1d9bf0" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  pause: '<circle cx="12" cy="12" r="9.5" fill="#fcd9d9"/><path d="M10 8.8v6.4M14 8.8v6.4" stroke="#e24141" stroke-width="2.2" stroke-linecap="round"/>',
  timer: '<circle cx="12" cy="13.2" r="8" fill="#fde5c8"/><path d="M12 8.8v4.8l3 1.8M9.5 2.8h5" fill="none" stroke="#f08a1c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  chart: '<rect x="3.5" y="12" width="4.6" height="8.5" rx="1.3" fill="#f6b04a"/><rect x="9.7" y="4" width="4.6" height="16.5" rx="1.3" fill="#f08a1c"/><rect x="15.9" y="9" width="4.6" height="11.5" rx="1.3" fill="#f9cd86"/>',
  building: '<path d="M4.5 20.5V6.5A2 2 0 0 1 6.5 4.5H13a2 2 0 0 1 2 2v14z" fill="#c4ecd0"/><path d="M15 9.5h2.5a2 2 0 0 1 2 2v9H15z" fill="#27b24a"/><path d="M8 8.5h3M8 12h3M8 15.5h3" stroke="#27b24a" stroke-width="1.7" stroke-linecap="round"/><path d="M2.5 20.5h19" stroke="#27b24a" stroke-width="1.8" stroke-linecap="round"/>',
  bolt: '<path d="M13.5 2.5L5 13.2h6L10 21.5l9-11.2h-6.2z" fill="#f9cd86" stroke="#f08a1c" stroke-width="1.6" stroke-linejoin="round"/>',
  bellx: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" fill="#fcd9d9"/><path d="M10 20a2 2 0 0 0 4 0" fill="none" stroke="#e24141" stroke-width="1.8" stroke-linecap="round"/><path d="M4 4l16 16" stroke="#e24141" stroke-width="2" stroke-linecap="round"/>',
  sliders: '<rect x="3" y="3" width="18" height="18" rx="5" fill="#cdeaf9"/><path d="M7 9h6M17 9h0M7 15h0M11 15h6" stroke="#0e8fd0" stroke-width="1.8" stroke-linecap="round"/><circle cx="15.5" cy="9" r="1.9" fill="#fff" stroke="#0e8fd0" stroke-width="1.6"/><circle cx="8.5" cy="15" r="1.9" fill="#fff" stroke="#0e8fd0" stroke-width="1.6"/>',
  clock: '<circle cx="12" cy="12" r="9.5" fill="#cdeaf9"/><path d="M12 6.8V12l3.5 2.1" fill="none" stroke="#0e8fd0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  absent: '<circle cx="12" cy="12" r="9.5" fill="#fcd9d9"/><path d="M5.5 5.5l13 13" stroke="#e24141" stroke-width="2.2" stroke-linecap="round"/>',
  late: '<circle cx="12" cy="13" r="8.2" fill="#fde5c8"/><path d="M12 8.5v5l3 1.7M9.5 3h5" fill="none" stroke="#f08a1c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  present: '<rect x="3" y="5" width="18" height="16" rx="3.5" fill="#c4ecd0"/><path d="M3 10h18" stroke="#27b24a" stroke-width="1.8"/><path d="M8 3v4M16 3v4" stroke="#27b24a" stroke-width="2" stroke-linecap="round"/><path d="M8.5 15.2l2.4 2.4 4.6-4.8" fill="none" stroke="#27b24a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  hourglass: '<path d="M7 3h10M7 21h10M8 3c0 4 3 5 4 9-1 4-4 5-4 9M16 3c0 4-3 5-4 9 1 4 4 5 4 9" fill="none" stroke="#e24141" stroke-width="2" stroke-linecap="round"/><path d="M9.2 18.6c.8-1.2 1.8-1.6 2.8-1.6s2 .4 2.8 1.6z" fill="#f1a1a1"/>',
};
const ci = (n, cls = '') => `<svg class="cic ${cls}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${CI[n] || CI.doc}</svg>`;
const CARD_IC = { employees: 'list', workgroups: 'users', teams: 'users', emp_procedures: 'doc', emp_docs: 'doc', org_chart: 'org', transfers_log: 'swap', title_changes: 'user', suspension_log: 'pause', pending_suspensions: 'pause', permissions: 'lock', requests: 'inbox', attendance: 'clock', payroll: 'money', adjustments: 'penalty', tiers: 'timer', reports: 'chart', set_company: 'building', set_attendance: 'clock', set_finance: 'money', set_documents: 'doc', set_automation: 'bolt', set_overrides: 'bellx', set_misc: 'sliders' };
const PAGE_LABELS = { attendance: 'سجل حضور الموظفين', employees: 'قائمة الموظفين', payroll: 'رواتب الموظفين', adjustments: 'جزاءات ومكافآت الموظفين' };
const pageTitles = () => {
  const t = { me: 'حسابي', menu: 'القائمة', dashboard: 'لوحة المعلومات', employees: 'الموظفون', home: 'الجدول', requests: 'الطلبات الواردة' };
  MENU.forEach((m) => (m.g ? m.items.forEach((i) => { t[i[0]] = t[i[0]] || i[1]; }) : (t[m.id] = t[m.id] || m.t)));
  return t;
};

/* الهيدر العلوي لكل شاشة */
function appHeader() {
  const u = S.me.user, p = S.page, ini = esc(initials(u.name));
  const bell = `<button class="ab-circle" id="abell" aria-label="الإشعارات">${fi('bell')}${S.me.unread ? `<span class="dot">${S.me.unread}</span>` : ''}</button>`;
  if (p === 'home') {
    return `<header class="ahead home"><div class="avatar big">${ini}</div><div class="info"><b>${esc(u.name)}</b><span>${esc(u.job_title || (u.is_admin ? 'مدير النظام' : 'موظف'))}</span><span>${esc(u.department || '')}</span></div>${bell}</header>`;
  }
  let a = '<span></span>', b = bell;
  if (p === 'dashboard') a = `<button class="ab-av" id="aav" aria-label="حسابي"><span class="avatar">${ini}</span></button>`;
  else if (p === 'employees' && (S.emptab || 'list') === 'list') { a = `<button class="ab-circle" id="hsearch" aria-label="بحث">${fi('search')}</button>`; b = `<button class="ab-circle" id="hfilter" aria-label="تصفية">${fi('sliders')}</button>`; }
  else if (p !== 'menu') a = `<button class="ab-circle" id="aback" aria-label="رجوع">${fi('back')}</button>`;
  return `<header class="ahead plain">${a}<h1>${esc(pageTitles()[p] || '')}</h1>${b}</header>`;
}
function bindAppHeader() {
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on('#abell', showNotes);
  on('#aback', () => go('menu'));
  on('#aav', () => go('me'));
  on('#hsearch', () => S.pg && S.pg.search && S.pg.search());
  on('#hfilter', () => S.pg && S.pg.filter && S.pg.filter());
}

/* شريط الأيام (بيتبني مرة واحدة وبيتلوّن عند كل اختيار) */
function paintStrip(el, days, sel, dotFn, onPick) {
  if (!el.children.length) {
    el.innerHTML = days.map((d) => `<button class="day" data-d="${d}"><b>${Number(d.slice(8))}</b><i></i></button>`).join('');
    el.onclick = (e) => { const b = e.target.closest('.day'); if (b && el._pick) el._pick(b.dataset.d); };
    const i = Math.max(0, days.indexOf(sel) - 2), w = el.children[0].offsetWidth || 0;
    el.scrollLeft = getComputedStyle(el).direction === 'rtl' ? -i * w : i * w;
  }
  el._pick = onPick;
  el.querySelectorAll('.day').forEach((b) => {
    const d = b.dataset.d, on = d === sel;
    b.classList.toggle('on', on);
    b.lastChild.style.background = on ? '#0ea5e9' : dotFn(d);
  });
}

/* القائمة الرئيسية: كروت (نفس الصلاحيات والصفحات الموجودة) */
PAGES.menu = (view) => {
  const u = S.me.user, ok = (id) => allPages().includes(id), T = pageTitles();
  const mk = (ic, t, fn) => ({ ic, t, fn });
  const toP = (id) => ok(id) && mk(CARD_IC[id] || 'doc', PAGE_LABELS[id] || T[id], () => go(id));
  const manage = has('employees.manage');
  const secs = [
    { t: '', cards: [
      mk('att', 'سجل الحضور', () => go('me', { tab: 'attendance' })), mk('req', 'طلباتي', () => go('me', { tab: 'general' })),
      mk('calendar', 'تقويم العمل', () => go('me', { tab: 'calendar' })), mk('money', 'الرواتب', () => go('me', { tab: 'payroll' })),
      mk('slip', 'مفردات الرواتب', () => go('me', { tab: 'slips' })), mk('lock', 'تغيير كلمة المرور', changePassword)] },
    { t: 'الموظفون', cards: [toP('employees'), manage && mk('userplus', 'طلبات الحسابات', () => { S.emptab = 'pending'; go('employees'); }), manage && mk('key', 'استعادة كلمة المرور', () => { S.emptab = 'resets'; go('employees'); }),
      ...['workgroups', 'teams', 'emp_procedures', 'emp_docs', 'org_chart', 'transfers_log', 'title_changes', 'suspension_log', 'pending_suspensions', 'permissions'].map(toP)] },
    { t: 'الطلبات والحضور', cards: [toP('requests'), toP('attendance')] },
    { t: 'المالية والتقارير', cards: ['payroll', 'adjustments', 'tiers', 'reports'].map(toP) },
    { t: 'الإعدادات', cards: ['set_company', 'set_attendance', 'set_finance', 'set_documents', 'set_automation', 'set_overrides', 'set_misc'].map(toP) },
  ].map((s) => ({ ...s, cards: s.cards.filter(Boolean) })).filter((s) => s.cards.length);
  const all = [];
  view.innerHTML = `<button class="card mprof" id="mprof"><div class="avatar big">${esc(initials(u.name))}</div><div class="mpi"><b>${esc(u.name)}</b><span>${esc(u.job_title || (u.is_admin ? 'مدير النظام' : 'موظف'))}</span><span>${esc(u.department || '')}</span></div><span class="mpc">${fi('chev_l')}</span></button>
    ${secs.map((s) => `${s.t ? `<h3 class="msec">${s.t}</h3>` : ''}<div class="mgrid">${s.cards.map((c) => { all.push(c); return `<button class="mc" data-i="${all.length - 1}"><span class="mct">${esc(c.t)}</span>${ci(c.ic)}</button>`; }).join('')}</div>`).join('')}
    <button class="mc mlogout" id="mlo"><span class="mlic">${fi('logout')}</span><span class="mct">تسجيل الخروج</span></button>`;
  view.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => all[Number(b.dataset.i)].fn()));
  $('#mprof', view).onclick = () => go('me', { tab: 'general' });
  $('#mlo', view).onclick = () => logout();
};

/* قائمة الإضافة السريعة (زرار +) */
function quickSheet() {
  const refresh = () => renderShell();
  const items = [
    ['q_swap', 'تغيير الوردية', () => requestForm(refresh, { type: 'shift_change' })],
    has('attendance.edit') && ['q_in', 'سجل حضور جديد', async () => { const emps = await api('/employees'); manualAtt(emps, null, refresh); }],
    ['q_file', 'طلب جديد', () => requestForm(refresh)],
    has('payroll.manage') && ['q_dollar', 'خصم جديد', () => { go('adjustments'); setTimeout(() => { if ($('#aadd')) { $('#aadd').click(); setTimeout(() => { const s = $('#nf [name=kind]'); if (s) s.value = 'deduction'; }, 60); } }, 450); }],
    has('payroll.manage') && ['q_dollar', 'إضافة مكافأة', () => { go('adjustments'); setTimeout(() => { if ($('#aadd')) { $('#aadd').click(); setTimeout(() => { const s = $('#nf [name=kind]'); if (s) s.value = 'bonus'; }, 60); } }, 450); }],
    has('employees.manage') && ['q_userplus', 'إضافة موظف جديد', () => empForm(null, () => { if (S.page === 'employees') renderShell(); else go('employees'); })],
  ].filter(Boolean);
  const o = document.createElement('div');
  o.className = 'qov';
  o.innerHTML = `<div class="qmenu">${items.map((it, i) => `<button class="qitem" data-i="${i}"><span class="qic">${fi(it[0])}</span><span>${it[1]}</span></button>`).join('')}</div><button class="fab qfab" aria-label="إغلاق">${fi('plus')}</button>`;
  document.body.appendChild(o);
  const close = () => o.remove();
  o.onclick = (e) => { if (e.target === o || e.target.closest('.qfab')) close(); };
  o.querySelectorAll('.qitem').forEach((b) => (b.onclick = () => { close(); items[Number(b.dataset.i)][2](); }));
}

/* لوحة المعلومات */
const GRAD = { blue: 'linear-gradient(90deg,#0a76bd,#019fff)', red: 'linear-gradient(90deg,#e0443f,#f46f6f)', green: 'linear-gradient(90deg,#2fb81f,#74c99b)', yellow: 'linear-gradient(90deg,#d5d828,#fbfbac)', orange: 'linear-gradient(90deg,#f07a22,#f8b277)', grey: 'linear-gradient(90deg,#55575a,#8c8c8c)' };
async function appDashboard(view) {
  view.innerHTML = '<div class="empty"><span class="spin"></span></div>';
  const u = S.me.user, today = S.me.today_date, nowM = thisMonth();
  const months = [];
  for (let k = 0; k < 12; k++) { const d = new Date(Date.UTC(+nowM.slice(0, 4), +nowM.slice(5) - 1 - k, 1)).toISOString().slice(0, 7); if (d < String(u.hire_date).slice(0, 7) && k) break; months.push(d); }
  const mo = months.includes(S.dmon) ? S.dmon : nowM;
  const [d, rq, att, pm] = await Promise.all([
    has('dashboard.view') ? api('/dashboard') : null, api('/requests/mine'), api('/attendance/mine?month=' + mo).catch(() => []), api('/payroll/mine?month=' + mo).catch(() => null),
  ]);
  const bl = rq.balances, dept = S.ddept || '';
  const bal = [[bl.annual_total - bl.annual_used, 'إجازة سنوية'], [bl.emergency_used, 'إجازة طارئة'], [bl.sick_used, 'إجازة مرضية'], [Number(bl.permission_hours_month).toFixed(2), 'ساعات الأذونات']];
  let stats = '';
  if (d) {
    const L = d.list.filter((x) => !dept || x.department === dept), n = (s) => L.filter((x) => x.status === s).length;
    const total = L.length;
    const card = (cls, k, num, lbl, all) => `<div class="dg ${cls}"><b>${num}</b><span>${lbl}</span>${all ? `<button class="all" data-all="${all}">عرض الكل</button>` : ''}</div>`;
    stats = `<div class="dsh"><h3>إحصائيات</h3><button class="dfil" id="dfil">${fi('sliders')}<span>تصفية</span></button></div>
      <div class="dgrid">
        <div class="dg blue wide"><b>${total}</b><span>الموظفون</span><button class="all" data-all="*">عرض الكل</button></div>
        ${card('green', 'present', n('present'), 'حاضر', 'present')}${card('red', 'late', n('late'), 'متأخر', 'late')}
        ${card('yellow', 'off', n('off'), 'يوم عطلة', '')}<div class="dg white"><b>${n('not_yet')}</b><span>لم يسجل الحضور</span><button class="all" data-all="not_yet">عرض الكل</button></div>
        ${card('grey', 'absent', n('absent'), 'غائب', 'absent')}${card('orange', 'leave', n('leave'), 'إجازة', 'leave')}
      </div>
      <div class="dmini">${has('requests.view_all') ? `<button class="card" data-go="requests"><b>${d.pending_requests}</b><span>طلبات معلّقة</span></button>` : ''}<div class="card"><b>${d.missing_face}</b><span>بدون بصمة وجه</span></div></div>`;
  }
  const hrs = att.filter((r) => r.check_in && r.check_out).reduce((s, r) => s + (new Date(r.check_out) - new Date(r.check_in)) / 3600000, 0);
  const present = pm ? pm.present_days : att.filter((r) => r.check_in).length;
  const mname = (m) => `${MONTHS_AR[Number(m.slice(5)) - 1]}-${m.slice(0, 4)}`;
  view.innerHTML = `<h3 class="dsec">الرصيد</h3><div class="dbal">${bal.map(([v, l]) => `<div class="card"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
    ${stats}
    <div class="dsh"><h3>تم استخدامه هذا الشهر</h3><label class="dmon"><select id="dmon">${months.map((m) => `<option value="${m}" ${m === mo ? 'selected' : ''}>${mname(m)}</option>`).join('')}</select><span>${mname(mo)}</span>${fi('chev_dn')}</label></div>
    <div class="dg blue wide"><b>${hrs.toFixed(2)}</b><span>ساعات العمل هذا الشهر</span></div>
    <div class="dusage">
      <div class="card"><div class="dut"><b>${pm ? pm.absent_days : 0}</b><small>الأيام</small></div><span>غائب</span>${ci('absent')}</div>
      <div class="card"><div class="dut"><b>${pm ? pm.late_days : 0}</b><small>الأيام</small></div><span>أيام التأخير</span>${ci('late')}</div>
      <div class="card"><div class="dut"><b>${Number(present).toFixed(2)}</b></div><span>أيام الحضور</span>${ci('present')}</div>
      <div class="card"><div class="dut"><b>${pm ? Number(pm.penalties).toFixed(1) : '0.0'}</b></div><span>الجزاءات</span>${ci('hourglass')}</div>
    </div>`;
  $('#dmon', view).onchange = (e) => { S.dmon = e.target.value; appDashboard(view); };
  view.querySelectorAll('[data-all]').forEach((b) => (b.onclick = () => {
    const k = b.dataset.all;
    S.empm = Object.assign(S.empm || {}, { st: k === '*' ? [] : [k], day: today, dept });
    S.emptab = 'list'; go('employees');
  }));
  view.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(b.dataset.go)));
  if ($('#dfil', view)) $('#dfil', view).onclick = () => {
    const depts = [...new Set(d.list.map((x) => x.department).filter(Boolean))];
    const o = modal(`<h3>تصفية الإحصائيات</h3><label class="f">القسم<select id="dd"><option value="">كل الأقسام</option>${depts.map((x) => `<option ${x === dept ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      <div class="actions"><button class="btn alt" data-close>إلغاء</button><button class="btn" id="dok">تطبيق</button></div>`);
    $('#dok', o).onclick = () => { S.ddept = $('#dd', o).value; o.close(); appDashboard(view); };
  };
}

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
    const line = (kind, iso, loc) => `<div class="mline"><span class="mi ${kind}">${fi(kind === 'in' ? 'in_m' : 'out_m')}</span><b>${timeAr(iso)}</b>${loc ? `<span class="mloc">${fi('pin')}<span>${esc(loc)}</span></span>` : ''}</div>`;
    const shift = `<div class="mshift"><span class="mclk">${fi('clock_c')}</span><span dir="auto">${esc(shiftTxt(u))}</span></div>`;
    const chev = `<button class="mchev" data-ex="${u.id}" aria-label="المزيد">${fi('chev_dn')}</button>`;
    const info = `<button class="minfo" data-info="${u.id}" aria-label="بيانات">${fi('info_fill')}</button>`;
    const bottom = hasIn
      ? `${shift}<div class="mrow">${sq}<div class="mlines">${line('in', s.ci, s.inLoc)}${hasOut ? line('out', s.co, s.outLoc) : ''}</div><span class="grow"></span>${info}${chev}</div>`
      : `<div class="mrow">${sq}${shift}${chev}</div>`;
    const tel = u.phone ? `<a class="btn alt sm" href="tel:${esc(u.phone)}">اتصال</a>` : '';
    return `<div class="card mcard" data-u="${u.id}"><div class="mhead"><span class="mav" style="--ring:${ring}"><span class="avatar">${esc(initials(u.name))}</span></span>
      <div class="mname"><b>${esc(u.name)}</b><span>${esc([u.job_title, u.department].filter(Boolean).join(' - ') || '—')}</span></div></div>${bottom}
      <div class="mexp" hidden><div class="kv"><div><span class="muted">الحالة</span><b>${(EM_ST[s.status] || [''])[0]}${s.late ? ` (${s.late} د)` : ''}</b></div><div><span class="muted">الوردية</span><b dir="ltr">${fmt12(u.shift_start)} - ${fmt12(u.shift_end)}</b></div>${u.phone ? `<div><span class="muted">الهاتف</span><b dir="ltr">${esc(u.phone)}</b></div>` : ''}</div>
        <div class="row" style="margin-top:10px">${tel}${manage ? `<button class="btn alt sm" data-e="${u.id}">تعديل</button>` : ''}<button class="btn alt sm" data-more="${u.id}">المزيد</button></div></div></div>`;
  };
  const drawList = () => {
    const rs = rows();
    $('#mlist', body).innerHTML = rs.map(card).join('') || '<div class="card empty">لا يوجد موظفون</div>';
    $('#mcount', body).textContent = `${rs.length} من ${people.filter((u) => u.active).length}`;
    const L = $('#mlist', body);
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


/* ====== تشغيل ====== */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
if (S.token) boot(); else renderLogin();