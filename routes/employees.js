'use strict';
/* routes/employees.js — الموظفون: CRUD وموافقة التسجيل واستعادة كلمة المرور والصلاحيات */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { isDate, toMin } = require('../lib/utils');
const { settings, tzParts } = require('../src/bootstrap');
const { getPolicyCtx, graceOf, holidayMap } = require('../src/payroll-engine');
const { NOW, db } = require('../src/db');
const { adminOnly, auth, need, wrap } = require('../src/middleware');
const { USERNAME_RE, audit, can, notify, outranks, parseIds, publicUser, toId } = require('../src/helpers');
const { locIds } = require('../src/shared');
const { PERMISSIONS } = require('../src/constants');


/* ----- الموظفون ----- */
const EMP_FIELDS = ['name', 'job_title', 'department', 'phone', 'base_salary', 'allowances', 'shift_start', 'shift_end', 'hire_date', 'annual_leave_days', 'nationality', 'manager_id', 'leave_profile_id', 'employee_code', 'birth_date', 'gender', 'marital_status', 'national_id', 'email'];
function validateEmp(b, partial) {
  if (!partial && (!b.name || !b.username || !b.password)) return 'الاسم واسم المستخدم وكلمة المرور مطلوبين';
  if (b.password !== undefined && String(b.password).length < 6) return 'كلمة المرور 6 أحرف على الأقل';
  for (const f of ['shift_start', 'shift_end']) if (b[f] !== undefined && !/^\d{1,2}:\d{2}$/.test(b[f])) return 'صيغة الوقت غير صحيحة';
  if (b.hire_date !== undefined && !isDate(b.hire_date)) return 'تاريخ التعيين غير صحيح';
  for (const f of ['base_salary', 'allowances', 'annual_leave_days']) if (b[f] !== undefined && !(Number(b[f]) >= 0)) return 'قيمة رقمية غير صحيحة';
  if (b.birth_date !== undefined && b.birth_date !== '' && !isDate(b.birth_date)) return 'تاريخ الميلاد غير صحيح';
  if (b.gender !== undefined && !['', 'male', 'female'].includes(b.gender)) return 'قيمة النوع غير صحيحة';
  if (b.marital_status !== undefined && !['', 'single', 'married', 'divorced', 'widowed'].includes(b.marital_status)) return 'الحالة الاجتماعية غير صحيحة';
  if (b.email !== undefined && b.email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.email))) return 'البريد الإلكتروني غير صحيح';
  return null;
}
// حالة كل موظف النهارده (حاضر / متأخر / غائب / إجازة / عطلة / لسه ما سجّلش)
async function todayStatusMap(users) {
  const now = tzParts(), st = await settings(), pctx = await getPolicyCtx();
  const [attRows, leaveRows] = await Promise.all([
    db.all('SELECT * FROM attendance WHERE date=?', now.date),
    db.all("SELECT user_id FROM requests WHERE status='approved' AND from_date<=? AND to_date>=? AND type IN ('annual_leave','sick_leave','emergency_leave','work_mission')", now.date, now.date),
  ]);
  const att = Object.fromEntries(attRows.map((a) => [a.user_id, a])), leaves = new Set(leaveRows.map((r) => r.user_id));
  const weekendToday = String(st.weekend_days).split(',').map(Number).includes(new Date(now.date + 'T00:00:00Z').getUTCDay()) || holidayMap(pctx, now.date, now.date).has(now.date);
  const out = {};
  for (const u of users) {
    const a = att[u.id];
    let status = 'absent';
    if (a && a.check_in) status = a.late_minutes > 0 ? 'late' : 'present';
    else if (leaves.has(u.id)) status = 'leave';
    else if (weekendToday) status = 'off';
    else if (now.minutes < toMin(u.shift_start) + graceOf(u, st, pctx)) status = 'not_yet';
    out[u.id] = { status, check_in: a?.check_in || null, check_out: a?.check_out || null, late_minutes: a?.late_minutes || 0 };
  }
  return out;
}
// مدير الموارد (غير المدير العام) ما يقدرش يلمس حسابات المديرين
const guardAdminTarget = (req, res, u) => {
  if (u.is_admin && !req.user.is_admin) { res.status(403).json({ error: 'حسابات المديرين يعدّلها المدير فقط' }); return false; }
  if (u.id !== req.user.id && !outranks(req.user, u)) { res.status(403).json({ error: 'لا يمكنك التحكم في حساب صلاحياته أعلى من صلاحياتك' }); return false; }
  return true;
};

module.exports = function register(app) {
app.get('/api/employees', auth, need('employees.view'), wrap(async (req, res) => {
  const rows = await db.all('SELECT * FROM users ORDER BY is_admin DESC, id');
  const tmap = await todayStatusMap(rows.filter((u) => u.active && !u.pending));
  res.json(rows.map((u) => ({
    ...publicUser(u), today: tmap[u.id] || null,
    ...(can(req.user, 'payroll.view') ? { base_salary: u.base_salary, allowances: u.allowances } : {}),
    ...(can(req.user, 'employees.manage') ? { national_id: u.national_id || '' } : {}),
  })));
}));
app.post('/api/employees', auth, need('employees.manage'), wrap(async (req, res) => {
  const b = req.body || {};
  const err = validateEmp(b, false);
  if (err) return res.status(400).json({ error: err });
  if (!USERNAME_RE.test(String(b.username).trim())) return res.status(400).json({ error: 'اسم المستخدم من 3 إلى 30 حرف/رقم بدون مسافات' });
  if (b.role === 'admin' && !req.user.is_admin) return res.status(403).json({ error: 'إنشاء حساب مدير للمدير فقط' });
  if (await db.get('SELECT 1 FROM users WHERE lower(username)=?', String(b.username).toLowerCase())) return res.status(409).json({ error: 'اسم المستخدم مستخدم من قبل' });
  const code = String(b.employee_code || '').trim().slice(0, 30);
  if (code && await db.get('SELECT 1 FROM users WHERE employee_code=?', code)) return res.status(409).json({ error: 'كود الموظف مستخدم من قبل' });
  const locIds = b.location_ids === undefined ? [] : parseIds(JSON.stringify(b.location_ids));
  const id = await db.insert(`INSERT INTO users(name,username,password_hash,job_title,department,phone,base_salary,allowances,shift_start,shift_end,hire_date,annual_leave_days,is_admin,location_ids)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, String(b.name).trim().slice(0, 80), String(b.username).trim(), bcrypt.hashSync(String(b.password), 10), String(b.job_title || '').slice(0, 80), String(b.department || '').slice(0, 80), String(b.phone || '').slice(0, 30),
    Number(b.base_salary) || 0, Number(b.allowances) || 0, b.shift_start || '09:00', b.shift_end || '17:00', b.hire_date || tzParts().date, (Number.isInteger(parseInt(b.annual_leave_days, 10)) ? parseInt(b.annual_leave_days, 10) : 21), b.role === 'admin' ? 1 : 0, JSON.stringify(locIds));
  await db.run('UPDATE users SET nationality=?, manager_id=?, employee_code=?, birth_date=?, gender=?, marital_status=?, national_id=?, email=? WHERE id=?',
    String(b.nationality || '').slice(0, 40), toId(b.manager_id), code, b.birth_date || '', b.gender || '', b.marital_status || '', String(b.national_id || '').trim().slice(0, 30), String(b.email || '').trim().slice(0, 100), id);
  await audit(req, 'employee.create', String(b.username).trim(), b.role === 'admin' ? 'role=admin' : '');
  res.json({ id });
}));
app.put('/api/employees/:id', auth, need('employees.manage'), wrap(async (req, res) => {
  const id = toId(req.params.id);
  const u = id && await db.get('SELECT * FROM users WHERE id=?', id);
  if (!u) return res.status(404).json({ error: 'غير موجود' });
  if (!guardAdminTarget(req, res, u)) return;
  const b = req.body || {};
  const err = validateEmp(b, true);
  if (err) return res.status(400).json({ error: err });
  if (b.employee_code !== undefined && String(b.employee_code).trim() && await db.get('SELECT 1 FROM users WHERE employee_code=? AND id<>?', String(b.employee_code).trim().slice(0, 30), u.id)) return res.status(409).json({ error: 'كود الموظف مستخدم من قبل' });
  const sets = [], vals = [];
  for (const f of EMP_FIELDS) {
    if (b[f] === undefined) continue;
    sets.push(`${f}=?`);
    vals.push(['base_salary', 'allowances'].includes(f) ? Number(b[f]) : f === 'annual_leave_days' ? parseInt(b[f], 10) : f === 'manager_id' ? (toId(b[f]) === u.id ? null : toId(b[f])) : f === 'leave_profile_id' ? toId(b[f]) : f === 'nationality' ? String(b[f]).slice(0, 40) : f === 'employee_code' ? String(b[f]).trim().slice(0, 30) : f === 'national_id' ? String(b[f]).trim().slice(0, 30) : f === 'email' ? String(b[f]).trim().slice(0, 100) : (typeof b[f] === 'string' ? b[f].trim().slice(0, 100) : b[f]));
  }
  if (b.location_ids !== undefined) {
    const ids = parseIds(JSON.stringify(b.location_ids));
    const ok = ids.length ? (await db.all('SELECT id FROM work_locations WHERE id = ANY(?::int[])', ids)).map((r) => r.id) : [];
    sets.push('location_ids=?'); vals.push(JSON.stringify(ok));
  }
  if (b.password) { sets.push('password_hash=?', 'must_change=1'); vals.push(bcrypt.hashSync(String(b.password), 10)); }
  if (b.active !== undefined && !u.is_admin && !u.pending) { sets.push('active=?'); vals.push(b.active ? 1 : 0); }
  // تغيير نوع الحساب (مدير / موظف): للمدير فقط، ومش على حسابه الشخصي (عشان النظام ما يفضلش من غير مدير)
  if (b.role !== undefined && ['admin', 'employee'].includes(b.role) && req.user.is_admin && u.id !== req.user.id) {
    sets.push('is_admin=?'); vals.push(b.role === 'admin' ? 1 : 0);
    if (b.role === 'admin') { sets.push('active=1'); }
  }
  if (sets.length) await db.run(`UPDATE users SET ${sets.join(',')} WHERE id=?`, ...vals, u.id);
  if (sets.length) await audit(req, 'employee.update', u.username, 'fields: ' + sets.map((x) => x.split('=')[0]).join(','));
  res.json({ ok: true });
}));
app.delete('/api/employees/:id', auth, need('employees.manage'), wrap(async (req, res) => {
  const id = toId(req.params.id);
  const u = id && await db.get('SELECT * FROM users WHERE id=?', id);
  if (!u) return res.status(404).json({ error: 'غير موجود' });
  if (u.is_admin) return res.status(403).json({ error: 'لا يمكن إزالة حساب مدير' });
  if (u.id === req.user.id) return res.status(403).json({ error: 'لا يمكنك إزالة حسابك' });
  if (!outranks(req.user, u)) return res.status(403).json({ error: 'لا يمكنك إزالة حساب صلاحياته أعلى من صلاحياتك' });
  if (await db.get('SELECT 1 FROM payslips WHERE user_id=?', id))
    return res.status(409).json({ error: 'للموظف مرتبات مصروفة، والإزالة النهائية هتمسح سجله المالي. استخدمي «إيقاف» بدل الإزالة.' });
  await db.run('UPDATE users SET manager_id=NULL WHERE manager_id=?', id);
  await db.run('DELETE FROM users WHERE id=?', id); // باقي بياناته بتتمسح تلقائياً (ON DELETE CASCADE)
  await audit(req, 'employee.delete', u.username, u.name);
  res.json({ ok: true });
}));
app.post('/api/employees/:id/reset-face', auth, need('employees.manage'), wrap(async (req, res) => {
  const id = toId(req.params.id);
  const tu = id && await db.get('SELECT * FROM users WHERE id=?', id);
  if (!tu) return res.status(404).json({ error: 'غير موجود' });
  if (!guardAdminTarget(req, res, tu)) return;
  await db.run('UPDATE users SET face_descriptor=NULL WHERE id=?', id);
  await audit(req, 'employee.reset_face', tu.username);
  await notify(id, 'تمت إعادة ضبط بصمة الوجه، سجّليها من جديد');
  res.json({ ok: true });
}));

/* ----- طلبات إنشاء الحسابات ----- */
app.post('/api/employees/:id/approve', auth, need('employees.manage'), wrap(async (req, res) => {
  const id = toId(req.params.id);
  const u = id && await db.get('SELECT * FROM users WHERE id=? AND pending=1', id);
  if (!u) return res.status(404).json({ error: 'الطلب غير موجود' });
  await db.run('UPDATE users SET pending=0, active=1 WHERE id=?', u.id);
  await notify(u.id, 'تم قبول حسابك، أهلاً بك');
  res.json({ ok: true });
}));
app.post('/api/employees/:id/reject', auth, need('employees.manage'), wrap(async (req, res) => {
  const id = toId(req.params.id);
  // الرفض بيمسح الطلب نهائياً (الحساب ما اتفعّلش أصلاً)
  const r = id && await db.run('DELETE FROM users WHERE id=? AND pending=1', id);
  if (!r || !r.rowCount) return res.status(404).json({ error: 'الطلب غير موجود' });
  res.json({ ok: true });
}));

/* ----- طلبات استعادة كلمة المرور ----- */
app.get('/api/password-resets', auth, need('employees.manage'), wrap(async (req, res) => {
  res.json(await db.all(`SELECT p.id, p.note, p.created_at, u.id AS user_id, u.name, u.username, u.is_admin FROM password_resets p
    JOIN users u ON u.id=p.user_id WHERE p.status='pending' ${req.user.is_admin ? '' : 'AND u.is_admin=0'} ORDER BY p.id`));
}));
app.post('/api/password-resets/:id/resolve', auth, need('employees.manage'), wrap(async (req, res) => {
  const id = toId(req.params.id);
  const p = id && await db.get("SELECT p.*, u.is_admin, u.permissions, u.username FROM password_resets p JOIN users u ON u.id=p.user_id WHERE p.id=? AND p.status='pending'", id);
  if (!p) return res.status(404).json({ error: 'الطلب غير موجود' });
  if (p.is_admin && !req.user.is_admin) return res.status(403).json({ error: 'حسابات المديرين يعدّلها المدير فقط' });
  if (p.user_id !== req.user.id && !outranks(req.user, { is_admin: p.is_admin, permissions: p.permissions })) return res.status(403).json({ error: 'لا يمكنك التحكم في حساب صلاحياته أعلى من صلاحياتك' });
  // كلمة مؤقتة عشوائية (من غير حروف متشابهة)، بتظهر مرة واحدة للمدير وبيتغيّرها الموظف عند أول دخول
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const temp = Array.from(crypto.randomBytes(8), (b) => alphabet[b % alphabet.length]).join('');
  await db.run('UPDATE users SET password_hash=?, must_change=1 WHERE id=?', bcrypt.hashSync(temp, 10), p.user_id);
  await db.run(`UPDATE password_resets SET status='done', handled_by=?, handled_at=${NOW} WHERE id=?`, req.user.id, p.id);
  await audit(req, 'password.reset_by_admin', p.username);
  res.json({ ok: true, temp_password: temp });
}));
app.post('/api/password-resets/:id/dismiss', auth, need('employees.manage'), wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (id) await db.run(`UPDATE password_resets SET status='dismissed', handled_by=?, handled_at=${NOW} WHERE id=? AND status='pending'`, req.user.id, id);
  res.json({ ok: true });
}));

/* ----- الصلاحيات (المدير فقط) ----- */
app.put('/api/users/:id/permissions', auth, adminOnly, wrap(async (req, res) => {
  const id = toId(req.params.id);
  const u = id && await db.get('SELECT * FROM users WHERE id=?', id);
  if (!u) return res.status(404).json({ error: 'غير موجود' });
  if (u.is_admin) return res.status(400).json({ error: 'المدير لديه كل الصلاحيات' });
  const perms = (Array.isArray(req.body.permissions) ? req.body.permissions : []).filter((p) => PERMISSIONS[p]);
  await db.run('UPDATE users SET permissions=? WHERE id=?', JSON.stringify(perms), u.id);
  await audit(req, 'permissions.update', u.username, perms.join(','));
  await notify(u.id, 'تم تحديث صلاحياتك');
  res.json({ ok: true });
}));
};
