'use strict';
/* routes/auth.js — الدخول وإنشاء حساب ونسيت كلمة المرور وبياناتي /me وتغيير كلمة المرور وبصمة الوجه */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { auth, wrap } = require('../src/middleware');
const { db } = require('../src/db');
const { USERNAME_RE, allowedLocations, audit, limited, notifyManagers, publicUser, pwVersion, validDescriptor } = require('../src/helpers');
const { getJwtSecret, jwtSecret, settings, tzParts } = require('../src/bootstrap');
const { PERMISSIONS, REQUEST_TYPES } = require('../src/constants');
const { getPolicyCtx, graceOf } = require('../src/payroll-engine');


// محاولات الدخول الفاشلة
// سجل المحاولات الفاشلة (في الذاكرة): 5 محاولات لكل (IP + مستخدم) في 5 دقائق، و50 لكل IP في 15 دقيقة
// المفتاح فيه الـ IP عشان حد من بره ما يقفلش حساب موظف بالتخمين عليه
const failLog = new Map();
const recentFails = (k, windowMs) => { const now = Date.now(); const a = (failLog.get(k) || []).filter((t) => now - t < windowMs); failLog.set(k, a); return a.length; };
const addFail = (k) => { const a = failLog.get(k) || []; a.push(Date.now()); failLog.set(k, a); if (failLog.size > 5000) failLog.clear(); };
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

module.exports = function register(app) { // عشان وقت الرد يبقى واحد سواء المستخدم موجود أو لأ
app.post('/api/login', wrap(async (req, res) => {
  const { username = '', password = '' } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || username.length > 100 || password.length > 200)
    return res.status(400).json({ error: 'بيانات غير صحيحة' });
  const lname = username.trim().toLowerCase();
  const ip = req.ip || '', userKey = ip + '|' + lname;
  if (recentFails(userKey, 5 * 60 * 1000) >= 5 || recentFails(ip + '|*', 15 * 60 * 1000) >= 50)
    return res.status(429).json({ error: 'محاولات كثيرة، جرّبي بعد دقائق' });
  const u = await db.get('SELECT * FROM users WHERE lower(username)=?', lname);
  const pwOk = bcrypt.compareSync(password, u ? u.password_hash : DUMMY_HASH) && !!u;
  if (u && u.pending && pwOk)
    return res.status(403).json({ error: 'حسابك بانتظار موافقة المدير. هيوصلك الدخول بعد المراجعة.' });
  if (!u || !u.active || u.pending || !pwOk) {
    addFail(userKey); addFail(ip + '|*');
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }
  failLog.delete(userKey);
  const token = jwt.sign({ id: u.id, pv: pwVersion(u) }, getJwtSecret(), { expiresIn: '30d' });
  res.json({ token, user: publicUser(u) });
}));

/* ----- إنشاء حساب ونسيت كلمة المرور (من غير تسجيل دخول) ----- */
app.get('/api/public', wrap(async (req, res) => {
  const st = await settings();
  res.json({ company_name: st.company_name, signup_enabled: st.signup_enabled !== '0' });
}));

app.post('/api/signup', wrap(async (req, res) => {
  const st = await settings();
  if (st.signup_enabled === '0') return res.status(403).json({ error: 'إنشاء الحسابات الجديدة مغلق حالياً، تواصلي مع المدير' });
  if (limited(req, 'signup', 5, 60 * 60 * 1000)) return res.status(429).json({ error: 'محاولات كثيرة، جرّبي بعد قليل' });
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 80), username = String(b.username || '').trim();
  const password = String(b.password || ''), phone = String(b.phone || '').trim().slice(0, 30);
  if (name.length < 3) return res.status(400).json({ error: 'اكتبي الاسم بالكامل' });
  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'اسم المستخدم من 3 إلى 30 حرف/رقم بدون مسافات' });
  if (password.length < 6) return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });
  if (await db.get('SELECT 1 FROM users WHERE lower(username)=?', username.toLowerCase())) return res.status(409).json({ error: 'اسم المستخدم مستخدم من قبل' });
  // حساب موظف عادي، بدون أي صلاحيات، وبانتظار موافقة المدير
  await db.run(`INSERT INTO users(name,username,password_hash,must_change,phone,active,pending,permissions,is_admin) VALUES(?,?,?,?,?,?,?,?,?)`,
    name, username, bcrypt.hashSync(password, 10), 0, phone, 0, 1, '[]', 0);
  await notifyManagers(`طلب إنشاء حساب جديد من ${name} (${username}) بانتظار موافقتك`, null, 'employees.manage');
  res.json({ ok: true });
}));

app.post('/api/forgot-password', wrap(async (req, res) => {
  if (limited(req, 'forgot', 5, 60 * 60 * 1000)) return res.status(429).json({ error: 'محاولات كثيرة، جرّبي بعد قليل' });
  const username = String((req.body || {}).username || '').trim().toLowerCase();
  const note = String((req.body || {}).note || '').trim().slice(0, 200);
  if (!username) return res.status(400).json({ error: 'اكتبي اسم المستخدم' });
  const u = await db.get('SELECT * FROM users WHERE lower(username)=? AND active=1 AND pending=0', username);
  if (u && !(await db.get("SELECT 1 FROM password_resets WHERE user_id=? AND status='pending'", u.id))) {
    await db.run('INSERT INTO password_resets(user_id,note) VALUES(?,?)', u.id, note);
    // طلب المدير يروح للمديرين فقط؛ وطلب الموظف يروح لكل من عنده صلاحية إدارة الموظفين
    await notifyManagers(`طلب استعادة كلمة المرور من ${u.name} (${u.username})`, u.id, 'employees.manage', !!u.is_admin);
  }
  // نفس الرد دايماً، عشان محدش يعرف مين له حساب ومين لأ
  res.json({ ok: true });
}));

app.get('/api/meta', (req, res) => res.json({ permissions: PERMISSIONS, request_types: REQUEST_TYPES }));

app.get('/api/me', auth, wrap(async (req, res) => {
  const st = await settings();
  const { date } = tzParts();
  const [today, unread, locs] = await Promise.all([
    db.get('SELECT * FROM attendance WHERE user_id=? AND date=?', req.user.id, date),
    db.get('SELECT COUNT(*)::int AS c FROM notifications WHERE user_id=? AND read=0', req.user.id),
    allowedLocations(req.user),
  ]);
  res.json({
    user: publicUser(req.user), today: today || null, today_date: date, unread: unread.c,
    settings: {
      company_name: st.company_name, face_threshold: parseFloat(st.face_threshold),
      weekend_days: st.weekend_days, grace_minutes: graceOf(req.user, st, await getPolicyCtx()),
      needs_geo: locs.length > 0, locations: locs.map((l) => l.name),
    },
  });
}));

app.post('/api/me/password', auth, wrap(async (req, res) => {
  const { old_password = '', new_password = '' } = req.body || {};
  if (String(new_password).length < 6) return res.status(400).json({ error: 'كلمة المرور لازم تكون 6 أحرف على الأقل' });
  if (String(new_password).length > 200) return res.status(400).json({ error: 'كلمة المرور طويلة جداً' });
  if (!req.user.must_change && !bcrypt.compareSync(String(old_password), req.user.password_hash))
    return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  const newHash = bcrypt.hashSync(String(new_password), 10);
  await db.run('UPDATE users SET password_hash=?, must_change=0 WHERE id=?', newHash, req.user.id);
  await audit(req, 'password.change', req.user.username);
  // توكن جديد: التوكنات القديمة بتبطل بعد تغيير كلمة المرور
  res.json({ ok: true, token: jwt.sign({ id: req.user.id, pv: pwVersion({ password_hash: newHash }) }, getJwtSecret(), { expiresIn: '30d' }) });
}));

app.post('/api/me/face', auth, wrap(async (req, res) => {
  const { descriptor } = req.body || {};
  if (!validDescriptor(descriptor)) return res.status(400).json({ error: 'بيانات الوجه غير صالحة' });
  if (req.user.face_descriptor) return res.status(409).json({ error: 'بصمة الوجه مسجلة بالفعل. اطلبي من المدير إعادة ضبطها.' });
  await db.run('UPDATE users SET face_descriptor=? WHERE id=?', JSON.stringify(descriptor), req.user.id);
  res.json({ ok: true });
}));
};
