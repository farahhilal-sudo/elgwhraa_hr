'use strict';
/* routes/payroll.js — المرتبات والتسويات (مكافآت/خصومات/جزاءات) */
const { isMonth, monthRange } = require('../lib/utils');
const { db } = require('../src/db');
const { computeMonth, getTiers } = require('../src/payroll-engine');
const { settings, tzParts } = require('../src/bootstrap');
const { adminOnly, auth, need, wrap } = require('../src/middleware');
const { audit, notify, toId } = require('../src/helpers');
const { monthUsers } = require('../src/shared');


/* ----- المرتبات والخصومات ----- */
// كشف الشهر: لو اتصرف (اتقفل) بنرجّع النسخة المحفوظة وقت الصرف، غير كده بنحسبه لحظياً يوم بيوم
async function monthRow(user, month, st, tiers) {
  const p = await db.get('SELECT * FROM payslips WHERE user_id=? AND month=?', user.id, month);
  if (p) return { ...JSON.parse(p.data), paid: true, paid_at: p.paid_at };
  const lk = await db.get('SELECT * FROM payroll_locks WHERE user_id=? AND month=?', user.id, month);
  if (lk) return { ...JSON.parse(lk.data), paid: false, paid_at: null, locked: true };
  return { ...(await computeMonth(user, month, st, tiers)), paid: false, paid_at: null, locked: false };
}
const monthEnded = (m) => monthRange(m)[1] < tzParts().date;

module.exports = function register(app) {
app.get('/api/payroll', auth, need('payroll.view'), wrap(async (req, res) => {
  const month = isMonth(req.query.month) ? req.query.month : tzParts().date.slice(0, 7);
  const [st, users, tiers] = await Promise.all([settings(), monthUsers(month), getTiers()]);
  res.json({ month, ended: monthEnded(month), rows: await Promise.all(users.map((u) => monthRow(u, month, st, tiers))) });
}));
app.get('/api/payroll/mine', auth, wrap(async (req, res) => {
  const month = isMonth(req.query.month) ? req.query.month : tzParts().date.slice(0, 7);
  res.json(await monthRow(req.user, month, await settings(), await getTiers()));
}));
// سجل مرتبات الموظف لسنة معيّنة (من شهر التعيين لحد الشهر الحالي)، الأحدث أولاً
app.get('/api/payroll/mine/history', auth, wrap(async (req, res) => {
  const nowM = tzParts().date.slice(0, 7);
  const year = /^\d{4}$/.test(req.query.year || '') ? req.query.year : nowM.slice(0, 4);
  const from = req.user.hire_date.slice(0, 7);
  const [st, tiers] = await Promise.all([settings(), getTiers()]);
  const months = [];
  for (let m = 1; m <= 12; m++) { const k = `${year}-${String(m).padStart(2, '0')}`; if (k >= from && k <= nowM) months.push(k); }
  const rows = await Promise.all(months.reverse().map((m) => monthRow(req.user, m, st, tiers)));
  res.json({ year, rows });
}));
// تسجيل صرف المرتب: بيقفل كشف الشهر للموظفين المحددين (لازم الشهر يكون انتهى)
app.post('/api/payroll/pay', auth, need('payroll.manage'), wrap(async (req, res) => {
  const { month } = req.body || {};
  const ids = (Array.isArray(req.body.user_ids) ? req.body.user_ids : [req.body.user_id]).map(toId).filter(Boolean);
  if (!isMonth(month) || !ids.length) return res.status(400).json({ error: 'بيانات غير صحيحة' });
  if (!monthEnded(month)) return res.status(400).json({ error: 'لا يمكن صرف مرتب شهر لم ينتهِ بعد' });
  const [st, tiers] = await Promise.all([settings(), getTiers()]);
  let n = 0;
  for (const id of ids) {
    const u = await db.get('SELECT * FROM users WHERE id=? AND is_admin=0', id);
    if (!u || (await db.get('SELECT 1 FROM payslips WHERE user_id=? AND month=?', id, month))) continue;
    const lk = await db.get('SELECT data FROM payroll_locks WHERE user_id=? AND month=?', id, month);
    const row = lk ? JSON.parse(lk.data) : await computeMonth(u, month, st, tiers);
    const r = await db.run('INSERT INTO payslips(user_id,month,data,net,paid_by) VALUES(?,?,?,?,?) ON CONFLICT(user_id,month) DO NOTHING', id, month, JSON.stringify(row), row.net, req.user.id);
    if (r.rowCount) { n++; await db.run('DELETE FROM payroll_locks WHERE user_id=? AND month=?', id, month); await notify(id, `تم صرف مرتب شهر ${month} (الصافي ${row.net})`); }
  }
  await audit(req, 'payroll.pay', month, `${n} موظف`);
  res.json({ ok: true, paid: n });
}));
// قفل الدفع: تجميد أرقام كشف الموظفين المحددين (نسخة ثابتة) قبل الصرف، فمفيش بنود تتضاف أو تتحذف عليه
app.post('/api/payroll/lock', auth, need('payroll.manage'), wrap(async (req, res) => {
  const { month } = req.body || {};
  const ids = (Array.isArray(req.body.user_ids) ? req.body.user_ids : [req.body.user_id]).map(toId).filter(Boolean);
  if (!isMonth(month) || !ids.length) return res.status(400).json({ error: 'بيانات غير صحيحة' });
  if (!monthEnded(month)) return res.status(400).json({ error: 'لا يمكن قفل مرتب شهر لم ينتهِ بعد' });
  const [st, tiers] = await Promise.all([settings(), getTiers()]);
  let n = 0;
  for (const id of ids) {
    const u = await db.get('SELECT * FROM users WHERE id=? AND is_admin=0', id);
    if (!u || (await db.get('SELECT 1 FROM payslips WHERE user_id=? AND month=?', id, month))) continue;
    const row = await computeMonth(u, month, st, tiers);
    const r = await db.run('INSERT INTO payroll_locks(user_id,month,data,locked_by) VALUES(?,?,?,?) ON CONFLICT(user_id,month) DO NOTHING', id, month, JSON.stringify(row), req.user.id);
    if (r.rowCount) n++;
  }
  await audit(req, 'payroll.lock', month, `${n} موظف`);
  res.json({ ok: true, locked: n });
}));
app.post('/api/payroll/unlock', auth, need('payroll.manage'), wrap(async (req, res) => {
  const { month } = req.body || {};
  const ids = (Array.isArray(req.body.user_ids) ? req.body.user_ids : [req.body.user_id]).map(toId).filter(Boolean);
  if (!isMonth(month) || !ids.length) return res.status(400).json({ error: 'بيانات غير صحيحة' });
  for (const id of ids) await db.run('DELETE FROM payroll_locks WHERE user_id=? AND month=?', id, month);
  await audit(req, 'payroll.unlock', month, `${ids.length} موظف`);
  res.json({ ok: true });
}));
// إلغاء الصرف (المدير فقط) لو حصل خطأ، فبيتحسب الشهر لحظياً تاني
app.post('/api/payroll/unpay', auth, adminOnly, wrap(async (req, res) => {
  const { month } = req.body || {}, uid = toId(req.body.user_id);
  if (!isMonth(month) || !uid) return res.status(400).json({ error: 'بيانات غير صحيحة' });
  await db.run('DELETE FROM payslips WHERE user_id=? AND month=?', uid, month);
  await audit(req, 'payroll.unpay', month, `user_id=${uid}`);
  res.json({ ok: true });
}));
app.get('/api/adjustments', auth, need('payroll.view'), wrap(async (req, res) => {
  const month = isMonth(req.query.month) ? req.query.month : tzParts().date.slice(0, 7);
  const [rows, employees] = await Promise.all([
    db.all(`SELECT a.*, u.name AS user_name, c.name AS created_by_name FROM adjustments a
      JOIN users u ON u.id=a.user_id LEFT JOIN users c ON c.id=a.created_by WHERE a.month=? ORDER BY a.id DESC`, month),
    monthUsers(month).then((l) => l.map((u) => ({ id: u.id, name: u.name })).sort((a, b) => a.name.localeCompare(b.name, 'ar'))),
  ]);
  res.json({ month, rows, employees });
}));
app.post('/api/adjustments', auth, need('payroll.manage'), wrap(async (req, res) => {
  const { user_id, month, kind, reason: reason0 = '' } = req.body || {};
  let { amount } = req.body || {}, reason = reason0;
  const category = kind === 'deduction' && ['social', 'medical', 'tax'].includes((req.body || {}).category) ? req.body.category : '';
  const uid = toId(user_id);
  const target = uid && await db.get('SELECT base_salary, allowances FROM users WHERE id=?', uid);
  // بالأيام: قيمة اليوم = الأساسي (أو الأساسي + الحافز) ÷ 30 حسب اختيار اللي بيضيف البند
  const days = Number((req.body || {}).days), basis = (req.body || {}).basis === 'both' ? 'both' : 'base';
  if (target && days > 0) {
    amount = Math.round(days * ((Number(target.base_salary) || 0) + (basis === 'both' ? Number(target.allowances) || 0 : 0)) / 30 * 100) / 100;
    reason = `${reason} (${days} يوم من ${basis === 'both' ? 'الأساسي والحافز' : 'الأساسي'})`.trim();
  }
  if (!uid || !target || !isMonth(month) || !['deduction', 'bonus', 'penalty'].includes(kind) || !(Number(amount) > 0))
    return res.status(400).json({ error: 'بيانات غير صحيحة' });
  if (await db.get('SELECT 1 FROM payslips WHERE user_id=? AND month=?', uid, month)) return res.status(400).json({ error: 'تم صرف مرتب هذا الشهر، لا يمكن إضافة بنود عليه' });
  if (await db.get('SELECT 1 FROM payroll_locks WHERE user_id=? AND month=?', uid, month)) return res.status(400).json({ error: 'مرتب هذا الشهر مقفول، افتح القفل الأول' });
  await db.run('INSERT INTO adjustments(user_id,month,kind,amount,reason,created_by,category) VALUES(?,?,?,?,?,?,?)', uid, month, kind, Number(amount), String(reason).slice(0, 200), req.user.id, category);
  await audit(req, 'adjustment.add', `user_id=${uid} ${month}`, `${kind} ${Number(amount)}`);
  await notify(uid, `تمت إضافة ${{ bonus: 'مكافأة', penalty: 'جزاء', deduction: 'خصم' }[kind]} بقيمة ${Number(amount)} عن شهر ${month}${String(reason || '').trim() ? ' — ' + String(reason).trim().slice(0, 80) : ''}`, kind === 'penalty' ? 'penalty' : 'adjust');
  res.json({ ok: true });
}));
app.delete('/api/adjustments/:id', auth, need('payroll.manage'), wrap(async (req, res) => {
  const id = toId(req.params.id);
  const a = id && await db.get('SELECT * FROM adjustments WHERE id=?', id);
  if (a && (await db.get('SELECT 1 FROM payslips WHERE user_id=? AND month=?', a.user_id, a.month))) return res.status(400).json({ error: 'تم صرف مرتب هذا الشهر، لا يمكن حذف بنوده' });
  if (a && (await db.get('SELECT 1 FROM payroll_locks WHERE user_id=? AND month=?', a.user_id, a.month))) return res.status(400).json({ error: 'مرتب هذا الشهر مقفول، افتح القفل الأول' });
  if (id) { await db.run('DELETE FROM adjustments WHERE id=?', id); if (a) await audit(req, 'adjustment.delete', `user_id=${a.user_id} ${a.month}`, `${a.kind} ${a.amount}`); }
  res.json({ ok: true });
}));
};
