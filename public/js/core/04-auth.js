'use strict';
/* core/04-auth.js — شاشات الدخول وإنشاء حساب ونسيت كلمة المرور وتسجيل الخروج */

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
