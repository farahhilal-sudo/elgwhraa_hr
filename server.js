const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('لازم تحددي متغير البيئة DATABASE_URL (رابط قاعدة بيانات PostgreSQL). راجعي README.');
  process.exit(1);
}

/* ---------------- الاتصال بقاعدة البيانات (PostgreSQL) ---------------- */
const isLocal = /@(localhost|127\.0\.0\.1)(:|\/|$)/.test(DATABASE_URL);
const pool = new Pool({
  connectionString: DATABASE_URL,
  // Neon/Supabase بيحطوا sslmode في الرابط نفسه؛ لو مش موجود وده مش localhost نفعّل SSL
  ssl: isLocal || /sslmode=/.test(DATABASE_URL) ? undefined : true,
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 20000, // أول اتصال بعد خمول ممكن ياخد ثواني
  keepAlive: true,
});
// الاتصالات الخاملة ممكن تتقفل من طرف الاستضافة؛ من غير السطر ده التطبيق كله ممكن يقع
pool.on('error', (e) => console.error('pg idle client error:', e.message));

// "?" في الـ SQL بتتحول تلقائياً لـ $1,$2,...
const toPg = (sql) => { let i = 0; return sql.replace(/\?/g, () => '$' + (++i)); };
const db = {
  async all(sql, ...p) { return (await pool.query(toPg(sql), p)).rows; },
  async get(sql, ...p) { return (await pool.query(toPg(sql), p)).rows[0]; },
  async run(sql, ...p) { return pool.query(toPg(sql), p); },
  async insert(sql, ...p) { return (await pool.query(toPg(sql + ' RETURNING id'), p)).rows[0].id; },
};
const NOW = "to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')";

/* ---------------- الصلاحيات ---------------- */
const PERMISSIONS = {
  'dashboard.view': 'عرض لوحة المعلومات',
  'employees.view': 'عرض الموظفين',
  'employees.manage': 'إضافة وتعديل الموظفين',
  'attendance.view_all': 'عرض حضور الجميع',
  'attendance.edit': 'تعديل سجلات الحضور',
  'requests.view_all': 'عرض طلبات الجميع',
  'requests.approve': 'قبول ورفض الطلبات',
  'payroll.view': 'عرض المرتبات',
  'payroll.manage': 'إدارة الخصومات والمكافآت',
  'reports.view': 'عرض التقارير',
  'settings.manage': 'تعديل إعدادات النظام',
};
const REQUEST_TYPES = {
  overtime: 'وقت إضافي',
  permission: 'إذن',
  annual_leave: 'إجازة سنوية',
  sick_leave: 'إجازة مرضية',
  emergency_leave: 'إجازة طارئة',
  work_mission: 'مهمة عمل',
  shift_change: 'تغيير وردية',
};
const LEAVE_TYPES = ['annual_leave', 'sick_leave', 'emergency_leave', 'work_mission'];

/* ---------------- الجداول ---------------- */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  must_change INTEGER NOT NULL DEFAULT 1,
  is_admin INTEGER NOT NULL DEFAULT 0,
  permissions TEXT NOT NULL DEFAULT '[]',
  job_title TEXT DEFAULT '',
  department TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  base_salary DOUBLE PRECISION NOT NULL DEFAULT 0,
  allowances DOUBLE PRECISION NOT NULL DEFAULT 0,
  shift_start TEXT NOT NULL DEFAULT '09:00',
  shift_end TEXT NOT NULL DEFAULT '17:00',
  hire_date TEXT NOT NULL DEFAULT (to_char(current_date, 'YYYY-MM-DD')),
  annual_leave_days INTEGER NOT NULL DEFAULT 21,
  face_descriptor TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  check_in TEXT, check_out TEXT,
  in_lat DOUBLE PRECISION, in_lng DOUBLE PRECISION, out_lat DOUBLE PRECISION, out_lng DOUBLE PRECISION,
  in_face DOUBLE PRECISION, out_face DOUBLE PRECISION,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  early_minutes INTEGER NOT NULL DEFAULT 0,
  note TEXT DEFAULT '',
  UNIQUE(user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE TABLE IF NOT EXISTS requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  hours DOUBLE PRECISION DEFAULT 0,
  reason TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by INTEGER, decided_at TEXT, decision_note TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS adjustments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('deduction','bonus')),
  amount DOUBLE PRECISION NOT NULL,
  reason TEXT DEFAULT '',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
`;

const DEFAULT_SETTINGS = {
  company_name: 'شركتي',
  timezone: 'Africa/Cairo',
  work_lat: '',
  work_lng: '',
  radius_m: '150',
  grace_minutes: '10',
  face_threshold: '0.5',
  weekend_days: '5,6', // الجمعة والسبت (0=الأحد)
  late_factor: '1',
  absence_factor: '1',
  overtime_factor: '1.5',
};

// الإعدادات بتتخزن في الذاكرة 30 ثانية عشان نقلل الرحلات لقاعدة البيانات
let settingsCache = null, settingsAt = 0, currentTz = 'Africa/Cairo';
async function settings() {
  if (settingsCache && Date.now() - settingsAt < 30000) return { ...settingsCache };
  const out = {};
  for (const r of await db.all('SELECT key,value FROM settings')) out[r.key] = r.value;
  settingsCache = out; settingsAt = Date.now();
  currentTz = out.timezone || currentTz;
  return { ...out };
}
const putSetting = (k, v) => db.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, v);

let jwtSecret;
async function init() {
  await pool.query(SCHEMA);
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await db.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING', k, v);
  }
  const st = await settings();
  jwtSecret = process.env.JWT_SECRET || st.jwt_secret;
  if (!jwtSecret) {
    jwtSecret = crypto.randomBytes(32).toString('hex');
    await putSetting('jwt_secret', jwtSecret);
  }
  // أول مدير للنظام
  if (!(await db.get('SELECT 1 FROM users WHERE is_admin=1'))) {
    const pw = process.env.ADMIN_PASSWORD || 'admin123';
    await db.run('INSERT INTO users(name,username,password_hash,is_admin,must_change,job_title) VALUES(?,?,?,?,?,?) ON CONFLICT(username) DO NOTHING',
      'مدير النظام', 'admin', bcrypt.hashSync(pw, 10), 1, process.env.ADMIN_PASSWORD ? 0 : 1, 'مدير النظام');
    console.log('تم إنشاء حساب المدير: admin');
  }
}
const ready = init();

/* ---------------- أدوات ---------------- */
function tzParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: currentTz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date).reduce((a, p) => ((a[p.type] = p.value), a), {});
  const hh = parts.hour === '24' ? '00' : parts.hour;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: parseInt(hh, 10) * 60 + parseInt(parts.minute, 10),
  };
}
const toMin = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function faceDistance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}
const validDescriptor = (d) => Array.isArray(d) && d.length === 128 && d.every((x) => typeof x === 'number' && isFinite(x));
const round2 = (n) => Math.round(n * 100) / 100;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const isMonth = (s) => /^\d{4}-\d{2}$/.test(s || '');
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
// رقم صحيح موجب صالح كـ id، أو null
const toId = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 && n < 2147483647 ? n : null; };
function userPerms(u) {
  if (u.is_admin) return ['*', ...Object.keys(PERMISSIONS)];
  try { return JSON.parse(u.permissions || '[]'); } catch { return []; }
}
const can = (u, p) => u.is_admin || userPerms(u).includes(p);
function publicUser(u) {
  return {
    id: u.id, name: u.name, username: u.username, is_admin: !!u.is_admin, must_change: !!u.must_change,
    permissions: userPerms(u).filter((p) => p !== '*'), job_title: u.job_title, department: u.department,
    phone: u.phone, shift_start: u.shift_start, shift_end: u.shift_end, hire_date: u.hire_date,
    annual_leave_days: u.annual_leave_days, face_enrolled: !!u.face_descriptor, active: !!u.active,
  };
}
function notify(userId, text) {
  return db.run('INSERT INTO notifications(user_id,text) VALUES(?,?)', userId, text);
}
async function notifyManagers(text, exceptId) {
  const rows = await db.all('SELECT * FROM users WHERE active=1');
  await Promise.all(rows.filter((u) => u.id !== exceptId && can(u, 'requests.approve')).map((u) => notify(u.id, text)));
}
function* eachDay(from, to) {
  const d = new Date(from + 'T00:00:00Z'), end = new Date(to + 'T00:00:00Z');
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) yield d.toISOString().slice(0, 10);
}
const monthRange = (m) => {
  const [y, mo] = m.split('-').map(Number);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return [`${m}-01`, `${m}-${String(last).padStart(2, '0')}`];
};

/* ---------- حساب شهر لموظف (حضور + غياب + خصومات + مرتب) ---------- */
async function computeMonth(user, month, st) {
  const [first, last] = monthRange(month);
  const today = tzParts().date;
  const upto = last < today ? last : today;
  const weekend = String(st.weekend_days || '').split(',').filter(Boolean).map(Number);
  const [att, reqs, adj] = await Promise.all([
    db.all('SELECT * FROM attendance WHERE user_id=? AND date BETWEEN ? AND ?', user.id, first, last),
    db.all("SELECT * FROM requests WHERE user_id=? AND status='approved' AND to_date>=? AND from_date<=?", user.id, first, last),
    db.all('SELECT * FROM adjustments WHERE user_id=? AND month=? ORDER BY id', user.id, month),
  ]);
  const attByDate = Object.fromEntries(att.map((a) => [a.date, a]));
  const covered = new Set();
  let overtimeHours = 0, permissionHours = 0;
  for (const r of reqs) {
    if (LEAVE_TYPES.includes(r.type)) for (const d of eachDay(r.from_date, r.to_date)) covered.add(d);
    if (r.type === 'overtime' && r.from_date >= first && r.from_date <= last) overtimeHours += r.hours || 0;
    if (r.type === 'permission' && r.from_date >= first && r.from_date <= last) permissionHours += r.hours || 0;
  }
  let presentDays = 0, absentDays = 0, leaveDays = 0, lateMinutes = 0, earlyMinutes = 0, workDays = 0;
  if (first <= upto) {
    for (const d of eachDay(first, upto)) {
      const dow = new Date(d + 'T00:00:00Z').getUTCDay();
      if (weekend.includes(dow) || d < user.hire_date) continue;
      workDays++;
      const a = attByDate[d];
      if (a && a.check_in) { presentDays++; lateMinutes += a.late_minutes; earlyMinutes += a.early_minutes; }
      else if (covered.has(d)) leaveDays++;
      else if (d < today) absentDays++;
    }
  }
  const shiftHours = Math.max(1, (toMin(user.shift_end) - toMin(user.shift_start)) / 60);
  const dailyRate = user.base_salary / 30;
  const hourlyRate = dailyRate / shiftHours;
  const lateDeduction = round2(((lateMinutes + earlyMinutes) / 60) * hourlyRate * parseFloat(st.late_factor || 1));
  const absenceDeduction = round2(absentDays * dailyRate * parseFloat(st.absence_factor || 1));
  const overtimePay = round2(overtimeHours * hourlyRate * parseFloat(st.overtime_factor || 1.5));
  const bonuses = round2(adj.filter((a) => a.kind === 'bonus').reduce((s, a) => s + a.amount, 0));
  const manualDeductions = round2(adj.filter((a) => a.kind === 'deduction').reduce((s, a) => s + a.amount, 0));
  const gross = round2(user.base_salary + user.allowances + bonuses + overtimePay);
  const totalDeductions = round2(lateDeduction + absenceDeduction + manualDeductions);
  return {
    user_id: user.id, name: user.name, job_title: user.job_title, month,
    base_salary: user.base_salary, allowances: user.allowances,
    work_days: workDays, present_days: presentDays, absent_days: absentDays, leave_days: leaveDays,
    late_minutes: lateMinutes, early_minutes: earlyMinutes, overtime_hours: overtimeHours, permission_hours: permissionHours,
    overtime_pay: overtimePay, bonuses, late_deduction: lateDeduction, absence_deduction: absenceDeduction,
    manual_deductions: manualDeductions, gross, total_deductions: totalDeductions,
    net: round2(gross - totalDeductions), adjustments: adj,
  };
}

/* ---------------- Express ---------------- */
const app = express();
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// للاستضافات اللي بتفحص الصحة أو أدوات "إبقاء السيرفر صاحي" — مبتلمسش قاعدة البيانات
app.get('/healthz', (req, res) => res.type('text').send('ok'));

// أي طلب /api بيستنى لحد ما قاعدة البيانات تجهز (أول تشغيل)
app.use('/api', (req, res, next) => {
  ready.then(() => next(), () => res.status(503).json({ error: 'قاعدة البيانات غير متاحة حالياً، حاولي بعد لحظات' }));
});

const wrap = (fn) => (req, res) => {
  Promise.resolve().then(() => fn(req, res)).catch((e) => {
    console.error(e);
    if (res.headersSent) return;
    if (e && e.code === '23505') return res.status(409).json({ error: 'السجل موجود بالفعل' });
    res.status(500).json({ error: 'خطأ في الخادم' });
  });
};
async function auth(req, res, next) {
  let id;
  try {
    ({ id } = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), jwtSecret));
  } catch { return res.status(401).json({ error: 'سجّلي الدخول من جديد' }); }
  try {
    const u = await db.get('SELECT * FROM users WHERE id=?', id);
    if (!u || !u.active) return res.status(401).json({ error: 'الحساب غير متاح' });
    req.user = u;
    next();
  } catch (e) {
    // خطأ في قاعدة البيانات مش معناه إن الجلسة انتهت، فمنرجعش 401 (الواجهة بتعمل تسجيل خروج عليه)
    console.error(e);
    res.status(503).json({ error: 'تعذر الاتصال بقاعدة البيانات، حاولي بعد لحظات' });
  }
}
const need = (perm) => (req, res, next) =>
  can(req.user, perm) ? next() : res.status(403).json({ error: 'ليس لديك صلاحية لهذا الإجراء' });
const adminOnly = (req, res, next) => (req.user.is_admin ? next() : res.status(403).json({ error: 'للمدير فقط' }));

// محاولات الدخول الفاشلة
const fails = new Map();
app.post('/api/login', wrap(async (req, res) => {
  const { username = '', password = '' } = req.body || {};
  const key = String(username).toLowerCase();
  const f = fails.get(key) || { n: 0, until: 0 };
  if (f.until > Date.now()) return res.status(429).json({ error: 'محاولات كثيرة، جرّبي بعد دقائق' });
  const u = await db.get('SELECT * FROM users WHERE lower(username)=?', key);
  if (!u || !u.active || !bcrypt.compareSync(String(password), u.password_hash)) {
    f.n++; if (f.n >= 5) { f.until = Date.now() + 5 * 60 * 1000; f.n = 0; }
    fails.set(key, f);
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }
  fails.delete(key);
  const token = jwt.sign({ id: u.id }, jwtSecret, { expiresIn: '30d' });
  res.json({ token, user: publicUser(u) });
}));

app.get('/api/meta', (req, res) => res.json({ permissions: PERMISSIONS, request_types: REQUEST_TYPES }));

app.get('/api/me', auth, wrap(async (req, res) => {
  const st = await settings();
  const { date } = tzParts();
  const [today, unread] = await Promise.all([
    db.get('SELECT * FROM attendance WHERE user_id=? AND date=?', req.user.id, date),
    db.get('SELECT COUNT(*)::int AS c FROM notifications WHERE user_id=? AND read=0', req.user.id),
  ]);
  res.json({
    user: publicUser(req.user), today: today || null, today_date: date, unread: unread.c,
    settings: {
      company_name: st.company_name, face_threshold: parseFloat(st.face_threshold),
      work_lat: st.work_lat, work_lng: st.work_lng, radius_m: st.radius_m,
    },
  });
}));

app.post('/api/me/password', auth, wrap(async (req, res) => {
  const { old_password = '', new_password = '' } = req.body || {};
  if (String(new_password).length < 6) return res.status(400).json({ error: 'كلمة المرور لازم تكون 6 أحرف على الأقل' });
  if (!req.user.must_change && !bcrypt.compareSync(String(old_password), req.user.password_hash))
    return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  await db.run('UPDATE users SET password_hash=?, must_change=0 WHERE id=?', bcrypt.hashSync(String(new_password), 10), req.user.id);
  res.json({ ok: true });
}));

app.post('/api/me/face', auth, wrap(async (req, res) => {
  const { descriptor } = req.body || {};
  if (!validDescriptor(descriptor)) return res.status(400).json({ error: 'بيانات الوجه غير صالحة' });
  if (req.user.face_descriptor) return res.status(409).json({ error: 'بصمة الوجه مسجلة بالفعل. اطلبي من المدير إعادة ضبطها.' });
  await db.run('UPDATE users SET face_descriptor=? WHERE id=?', JSON.stringify(descriptor), req.user.id);
  res.json({ ok: true });
}));

/* ----- تسجيل الحضور والانصراف ----- */
app.post('/api/attendance/punch', auth, wrap(async (req, res) => {
  const { type, lat, lng, descriptor } = req.body || {};
  if (!['in', 'out'].includes(type)) return res.status(400).json({ error: 'نوع غير صالح' });
  const u = req.user, st = await settings();
  if (!u.face_descriptor) return res.status(403).json({ error: 'سجّلي بصمة الوجه أولاً' });
  if (!validDescriptor(descriptor)) return res.status(400).json({ error: 'لم يتم التقاط الوجه' });
  const score = faceDistance(descriptor, JSON.parse(u.face_descriptor));
  if (score > parseFloat(st.face_threshold)) return res.status(403).json({ error: 'الوجه غير مطابق، حاولي مرة أخرى في إضاءة أفضل' });
  if (st.work_lat !== '' && st.work_lng !== '') {
    if (typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ error: 'فعّلي خدمة الموقع (GPS)' });
    const dist = haversine(lat, lng, parseFloat(st.work_lat), parseFloat(st.work_lng));
    if (dist > parseFloat(st.radius_m)) return res.status(403).json({ error: `أنتِ خارج نطاق العمل (على بعد ${Math.round(dist)} متر)` });
  }
  const la = num(lat), ln = num(lng);
  const now = tzParts();
  const rec = await db.get('SELECT * FROM attendance WHERE user_id=? AND date=?', u.id, now.date);
  const iso = new Date().toISOString();
  if (type === 'in') {
    if (rec && rec.check_in) return res.status(409).json({ error: 'تم تسجيل الحضور اليوم بالفعل' });
    const start = toMin(u.shift_start), grace = parseInt(st.grace_minutes || 0, 10);
    const late = now.minutes > start + grace ? now.minutes - start : 0;
    try {
      if (rec) await db.run('UPDATE attendance SET check_in=?,in_lat=?,in_lng=?,in_face=?,late_minutes=? WHERE id=?', iso, la, ln, score, late, rec.id);
      else await db.run('INSERT INTO attendance(user_id,date,check_in,in_lat,in_lng,in_face,late_minutes) VALUES(?,?,?,?,?,?,?)', u.id, now.date, iso, la, ln, score, late);
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'تم تسجيل الحضور اليوم بالفعل' });
      throw e;
    }
  } else {
    if (!rec || !rec.check_in) return res.status(409).json({ error: 'سجّلي الحضور أولاً' });
    if (rec.check_out) return res.status(409).json({ error: 'تم تسجيل الانصراف اليوم بالفعل' });
    const early = Math.max(0, toMin(u.shift_end) - now.minutes);
    await db.run('UPDATE attendance SET check_out=?,out_lat=?,out_lng=?,out_face=?,early_minutes=? WHERE id=?', iso, la, ln, score, early, rec.id);
  }
  res.json({ ok: true, record: await db.get('SELECT * FROM attendance WHERE user_id=? AND date=?', u.id, now.date) });
}));

app.get('/api/attendance/mine', auth, wrap(async (req, res) => {
  const month = isMonth(req.query.month) ? req.query.month : tzParts().date.slice(0, 7);
  const [a, b] = monthRange(month);
  res.json(await db.all('SELECT * FROM attendance WHERE user_id=? AND date BETWEEN ? AND ? ORDER BY date DESC', req.user.id, a, b));
}));

/* ----- الطلبات ----- */
app.get('/api/requests/mine', auth, wrap(async (req, res) => {
  const year = tzParts().date.slice(0, 4);
  const typeSum = async (t) => (await db.all("SELECT from_date,to_date FROM requests WHERE user_id=? AND type=? AND status='approved' AND from_date LIKE ?", req.user.id, t, year + '%'))
    .reduce((s, r) => s + [...eachDay(r.from_date, r.to_date)].length, 0);
  const [rows, used, sick, emergency, perm] = await Promise.all([
    db.all('SELECT * FROM requests WHERE user_id=? ORDER BY id DESC LIMIT 100', req.user.id),
    typeSum('annual_leave'), typeSum('sick_leave'), typeSum('emergency_leave'),
    db.get("SELECT COALESCE(SUM(hours),0) AS h FROM requests WHERE user_id=? AND type='permission' AND status='approved' AND from_date LIKE ?", req.user.id, tzParts().date.slice(0, 7) + '%'),
  ]);
  res.json({
    requests: rows,
    balances: {
      annual_total: req.user.annual_leave_days, annual_used: used,
      sick_used: sick, emergency_used: emergency, permission_hours_month: Number(perm.h),
    },
  });
}));

app.post('/api/requests', auth, wrap(async (req, res) => {
  const { type, from_date, to_date, hours = 0, reason = '' } = req.body || {};
  if (!REQUEST_TYPES[type]) return res.status(400).json({ error: 'نوع الطلب غير صالح' });
  if (!isDate(from_date) || !isDate(to_date) || to_date < from_date) return res.status(400).json({ error: 'التواريخ غير صحيحة' });
  if (['overtime', 'permission'].includes(type) && !(Number(hours) > 0 && Number(hours) <= 24)) return res.status(400).json({ error: 'حددي عدد الساعات' });
  const id = await db.insert('INSERT INTO requests(user_id,type,from_date,to_date,hours,reason) VALUES(?,?,?,?,?,?)',
    req.user.id, type, from_date, ['overtime', 'permission'].includes(type) ? from_date : to_date, Number(hours) || 0, String(reason).slice(0, 500));
  await notifyManagers(`طلب جديد (${REQUEST_TYPES[type]}) من ${req.user.name}`, req.user.id);
  res.json({ id });
}));

app.delete('/api/requests/:id', auth, wrap(async (req, res) => {
  const id = toId(req.params.id);
  const r = id && await db.get('SELECT * FROM requests WHERE id=? AND user_id=?', id, req.user.id);
  if (!r) return res.status(404).json({ error: 'غير موجود' });
  if (r.status !== 'pending') return res.status(400).json({ error: 'لا يمكن حذف طلب تم البت فيه' });
  await db.run('DELETE FROM requests WHERE id=?', r.id);
  res.json({ ok: true });
}));

app.get('/api/requests', auth, need('requests.view_all'), wrap(async (req, res) => {
  const { status } = req.query;
  const filter = ['pending', 'approved', 'rejected'].includes(status);
  res.json(await db.all(`SELECT r.*, u.name AS user_name, u.job_title FROM requests r JOIN users u ON u.id=r.user_id
    ${filter ? 'WHERE r.status=?' : ''} ORDER BY r.id DESC LIMIT 300`, ...(filter ? [status] : [])));
}));

app.post('/api/requests/:id/decide', auth, need('requests.approve'), wrap(async (req, res) => {
  const { decision, note = '' } = req.body || {};
  if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'قرار غير صالح' });
  const id = toId(req.params.id);
  const r = id && await db.get('SELECT * FROM requests WHERE id=?', id);
  if (!r) return res.status(404).json({ error: 'غير موجود' });
  if (r.user_id === req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'لا يمكنك البت في طلبك الشخصي' });
  await db.run(`UPDATE requests SET status=?, decided_by=?, decided_at=${NOW}, decision_note=? WHERE id=?`,
    decision, req.user.id, String(note).slice(0, 300), r.id);
  await notify(r.user_id, `تم ${decision === 'approved' ? 'قبول' : 'رفض'} طلبك (${REQUEST_TYPES[r.type]})`);
  res.json({ ok: true });
}));

/* ----- الإشعارات ----- */
app.get('/api/notifications', auth, wrap(async (req, res) => {
  res.json(await db.all('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 50', req.user.id));
}));
app.post('/api/notifications/read', auth, wrap(async (req, res) => {
  await db.run('UPDATE notifications SET read=1 WHERE user_id=?', req.user.id);
  res.json({ ok: true });
}));

/* ----- لوحة المعلومات ----- */
app.get('/api/dashboard', auth, need('dashboard.view'), wrap(async (req, res) => {
  const now = tzParts();
  const [st, users, attRows, leaveRows, pending] = await Promise.all([
    settings(),
    db.all('SELECT * FROM users WHERE active=1 AND is_admin=0'),
    db.all('SELECT * FROM attendance WHERE date=?', now.date),
    db.all("SELECT user_id FROM requests WHERE status='approved' AND from_date<=? AND to_date>=? AND type IN ('annual_leave','sick_leave','emergency_leave','work_mission')", now.date, now.date),
    db.get("SELECT COUNT(*)::int AS c FROM requests WHERE status='pending'"),
  ]);
  const att = Object.fromEntries(attRows.map((a) => [a.user_id, a]));
  const leaves = leaveRows.map((r) => r.user_id);
  const dow = new Date(now.date + 'T00:00:00Z').getUTCDay();
  const weekendToday = String(st.weekend_days).split(',').map(Number).includes(dow);
  const list = users.map((u) => {
    const a = att[u.id];
    let status = 'absent';
    if (a && a.check_in) status = a.late_minutes > 0 ? 'late' : 'present';
    else if (leaves.includes(u.id)) status = 'leave';
    else if (weekendToday) status = 'off';
    else if (now.minutes < toMin(u.shift_start) + parseInt(st.grace_minutes || 0, 10)) status = 'not_yet';
    return { id: u.id, name: u.name, job_title: u.job_title, department: u.department, status, check_in: a?.check_in || null, check_out: a?.check_out || null, late_minutes: a?.late_minutes || 0 };
  });
  const count = (s) => list.filter((x) => x.status === s).length;
  res.json({
    date: now.date, total: list.length, present: count('present'), late: count('late'), absent: count('absent'),
    leave: count('leave'), not_yet: count('not_yet'), off: count('off'),
    pending_requests: pending.c,
    missing_face: users.filter((u) => !u.face_descriptor).length, list,
  });
}));

/* ----- الموظفون ----- */
const EMP_FIELDS = ['name', 'job_title', 'department', 'phone', 'base_salary', 'allowances', 'shift_start', 'shift_end', 'hire_date', 'annual_leave_days'];
function validateEmp(b, partial) {
  if (!partial && (!b.name || !b.username || !b.password)) return 'الاسم واسم المستخدم وكلمة المرور مطلوبين';
  if (b.password !== undefined && String(b.password).length < 6) return 'كلمة المرور 6 أحرف على الأقل';
  for (const f of ['shift_start', 'shift_end']) if (b[f] !== undefined && !/^\d{1,2}:\d{2}$/.test(b[f])) return 'صيغة الوقت غير صحيحة';
  if (b.hire_date !== undefined && !isDate(b.hire_date)) return 'تاريخ التعيين غير صحيح';
  for (const f of ['base_salary', 'allowances', 'annual_leave_days']) if (b[f] !== undefined && !(Number(b[f]) >= 0)) return 'قيمة رقمية غير صحيحة';
  return null;
}
app.get('/api/employees', auth, need('employees.view'), wrap(async (req, res) => {
  const rows = await db.all('SELECT * FROM users ORDER BY is_admin DESC, id');
  res.json(rows.map((u) => ({
    ...publicUser(u),
    ...(can(req.user, 'payroll.view') ? { base_salary: u.base_salary, allowances: u.allowances } : {}),
  })));
}));
app.post('/api/employees', auth, need('employees.manage'), wrap(async (req, res) => {
  const b = req.body || {};
  const err = validateEmp(b, false);
  if (err) return res.status(400).json({ error: err });
  if (await db.get('SELECT 1 FROM users WHERE lower(username)=?', String(b.username).toLowerCase())) return res.status(409).json({ error: 'اسم المستخدم مستخدم من قبل' });
  const id = await db.insert(`INSERT INTO users(name,username,password_hash,job_title,department,phone,base_salary,allowances,shift_start,shift_end,hire_date,annual_leave_days)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, b.name, String(b.username).trim(), bcrypt.hashSync(String(b.password), 10), b.job_title || '', b.department || '', b.phone || '',
    Number(b.base_salary) || 0, Number(b.allowances) || 0, b.shift_start || '09:00', b.shift_end || '17:00', b.hire_date || tzParts().date, parseInt(b.annual_leave_days ?? 21, 10));
  res.json({ id });
}));
app.put('/api/employees/:id', auth, need('employees.manage'), wrap(async (req, res) => {
  const id = toId(req.params.id);
  const u = id && await db.get('SELECT * FROM users WHERE id=?', id);
  if (!u) return res.status(404).json({ error: 'غير موجود' });
  const b = req.body || {};
  const err = validateEmp(b, true);
  if (err) return res.status(400).json({ error: err });
  const sets = [], vals = [];
  for (const f of EMP_FIELDS) {
    if (b[f] === undefined) continue;
    sets.push(`${f}=?`);
    vals.push(['base_salary', 'allowances'].includes(f) ? Number(b[f]) : f === 'annual_leave_days' ? parseInt(b[f], 10) : b[f]);
  }
  if (b.password) { sets.push('password_hash=?', 'must_change=1'); vals.push(bcrypt.hashSync(String(b.password), 10)); }
  if (b.active !== undefined && !u.is_admin) { sets.push('active=?'); vals.push(b.active ? 1 : 0); }
  if (sets.length) await db.run(`UPDATE users SET ${sets.join(',')} WHERE id=?`, ...vals, u.id);
  res.json({ ok: true });
}));
app.post('/api/employees/:id/reset-face', auth, need('employees.manage'), wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(404).json({ error: 'غير موجود' });
  await db.run('UPDATE users SET face_descriptor=NULL WHERE id=?', id);
  await notify(id, 'تمت إعادة ضبط بصمة الوجه، سجّليها من جديد');
  res.json({ ok: true });
}));

/* ----- الصلاحيات (المدير فقط) ----- */
app.put('/api/users/:id/permissions', auth, adminOnly, wrap(async (req, res) => {
  const id = toId(req.params.id);
  const u = id && await db.get('SELECT * FROM users WHERE id=?', id);
  if (!u) return res.status(404).json({ error: 'غير موجود' });
  if (u.is_admin) return res.status(400).json({ error: 'المدير لديه كل الصلاحيات' });
  const perms = (req.body.permissions || []).filter((p) => PERMISSIONS[p]);
  await db.run('UPDATE users SET permissions=? WHERE id=?', JSON.stringify(perms), u.id);
  await notify(u.id, 'تم تحديث صلاحياتك');
  res.json({ ok: true });
}));

/* ----- سجل الحضور للجميع ----- */
app.get('/api/attendance', auth, need('attendance.view_all'), wrap(async (req, res) => {
  const now = tzParts().date;
  const from = isDate(req.query.from) ? req.query.from : now.slice(0, 7) + '-01';
  const to = isDate(req.query.to) ? req.query.to : now;
  const uid = toId(req.query.user_id);
  res.json(await db.all(`SELECT a.*, u.name AS user_name FROM attendance a JOIN users u ON u.id=a.user_id
    WHERE a.date BETWEEN ? AND ? ${uid ? 'AND a.user_id=?' : ''} ORDER BY a.date DESC, u.name LIMIT 1000`, ...(uid ? [from, to, uid] : [from, to])));
}));
app.post('/api/attendance', auth, need('attendance.edit'), wrap(async (req, res) => {
  const { user_id, date, check_in, check_out, note = '' } = req.body || {};
  const uid = toId(user_id);
  const u = uid && await db.get('SELECT * FROM users WHERE id=?', uid);
  if (!u || !isDate(date)) return res.status(400).json({ error: 'بيانات غير صحيحة' });
  const mk = (t) => (t ? new Date(`${date}T${t}:00+03:00`).toISOString() : null);
  const ci = mk(check_in), co = mk(check_out);
  const grace = parseInt((await settings()).grace_minutes || 0, 10);
  const late = check_in && toMin(check_in) > toMin(u.shift_start) + grace ? toMin(check_in) - toMin(u.shift_start) : 0;
  const early = check_out ? Math.max(0, toMin(u.shift_end) - toMin(check_out)) : 0;
  await db.run(`INSERT INTO attendance(user_id,date,check_in,check_out,late_minutes,early_minutes,note) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(user_id,date) DO UPDATE SET check_in=excluded.check_in, check_out=excluded.check_out, late_minutes=excluded.late_minutes, early_minutes=excluded.early_minutes, note=excluded.note`,
    u.id, date, ci, co, late, early, String(note).slice(0, 200));
  res.json({ ok: true });
}));
app.delete('/api/attendance/:id', auth, need('attendance.edit'), wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (id) await db.run('DELETE FROM attendance WHERE id=?', id);
  res.json({ ok: true });
}));

/* ----- المرتبات والخصومات ----- */
app.get('/api/payroll', auth, need('payroll.view'), wrap(async (req, res) => {
  const month = isMonth(req.query.month) ? req.query.month : tzParts().date.slice(0, 7);
  const [st, users] = await Promise.all([settings(), db.all('SELECT * FROM users WHERE active=1 AND is_admin=0 ORDER BY id')]);
  res.json({ month, rows: await Promise.all(users.map((u) => computeMonth(u, month, st))) });
}));
app.get('/api/payroll/mine', auth, wrap(async (req, res) => {
  const month = isMonth(req.query.month) ? req.query.month : tzParts().date.slice(0, 7);
  res.json(await computeMonth(req.user, month, await settings()));
}));
app.post('/api/adjustments', auth, need('payroll.manage'), wrap(async (req, res) => {
  const { user_id, month, kind, amount, reason = '' } = req.body || {};
  const uid = toId(user_id);
  if (!uid || !(await db.get('SELECT 1 FROM users WHERE id=?', uid)) || !isMonth(month) || !['deduction', 'bonus'].includes(kind) || !(Number(amount) > 0))
    return res.status(400).json({ error: 'بيانات غير صحيحة' });
  await db.run('INSERT INTO adjustments(user_id,month,kind,amount,reason,created_by) VALUES(?,?,?,?,?,?)', uid, month, kind, Number(amount), String(reason).slice(0, 200), req.user.id);
  await notify(uid, `تمت إضافة ${kind === 'bonus' ? 'مكافأة' : 'خصم'} بقيمة ${Number(amount)} عن شهر ${month}`);
  res.json({ ok: true });
}));
app.delete('/api/adjustments/:id', auth, need('payroll.manage'), wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (id) await db.run('DELETE FROM adjustments WHERE id=?', id);
  res.json({ ok: true });
}));

/* ----- التقارير ----- */
app.get('/api/reports/monthly', auth, need('reports.view'), wrap(async (req, res) => {
  const month = isMonth(req.query.month) ? req.query.month : tzParts().date.slice(0, 7);
  const [st, users] = await Promise.all([settings(), db.all('SELECT * FROM users WHERE active=1 AND is_admin=0 ORDER BY id')]);
  const rows = await Promise.all(users.map(async (u) => {
    const m = await computeMonth(u, month, st);
    return {
      user_id: u.id, name: u.name, job_title: u.job_title, work_days: m.work_days, present_days: m.present_days,
      absent_days: m.absent_days, leave_days: m.leave_days, late_minutes: m.late_minutes, early_minutes: m.early_minutes,
      overtime_hours: m.overtime_hours, permission_hours: m.permission_hours,
    };
  }));
  res.json({ month, rows });
}));

/* ----- الإعدادات ----- */
app.get('/api/settings', auth, need('settings.manage'), wrap(async (req, res) => {
  const s = await settings(); delete s.jwt_secret; res.json(s);
}));
app.put('/api/settings', auth, need('settings.manage'), wrap(async (req, res) => {
  const b = req.body || {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (b[k] === undefined) continue;
    const v = String(b[k]).trim();
    if (['work_lat', 'work_lng'].includes(k) && v !== '' && !isFinite(Number(v))) return res.status(400).json({ error: 'إحداثيات غير صحيحة' });
    if (['radius_m', 'grace_minutes', 'late_factor', 'absence_factor', 'overtime_factor'].includes(k) && !(Number(v) >= 0)) return res.status(400).json({ error: 'قيمة رقمية غير صحيحة' });
    if (k === 'face_threshold' && !(Number(v) >= 0.3 && Number(v) <= 0.7)) return res.status(400).json({ error: 'حساسية الوجه بين 0.3 و 0.7' });
    if (k === 'timezone') {
      try { new Intl.DateTimeFormat('en', { timeZone: v }); } catch { return res.status(400).json({ error: 'المنطقة الزمنية غير صحيحة' }); }
    }
    await putSetting(k, v);
  }
  settingsCache = null; // نحمّل الإعدادات الجديدة فوراً
  await settings();
  res.json({ ok: true });
}));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

module.exports = { app, db, pool, computeMonth, settings, ready };
if (require.main === module) {
  ready.catch((e) => { console.error('فشل تجهيز قاعدة البيانات:', e); process.exit(1); });
  app.listen(PORT, () => console.log(`الخادم يعمل على المنفذ ${PORT}`));
}
