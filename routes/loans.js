'use strict';
/* routes/loans.js — القروض: بتتصرف في تاريخ الموافقة وبتتخصم من المرتب آخر يوم في الشهر */
const { auth, need, wrap } = require('../src/middleware');
const { db } = require('../src/db');
const { tzParts } = require('../src/bootstrap');
const { toId } = require('../src/helpers');
const { isDate } = require('../lib/utils');
const { loanState } = require('../src/loans');

module.exports = function register(app) {
const decorate = (l, today) => ({ ...l, ...loanState(l, today) });

async function createLoan({ user_id, name, amount, installments, date, note, request_id, by }) {
  const today = tzParts().date, on = isDate(date) ? date : today;
  return db.insert('INSERT INTO loans(user_id,name,amount,installments,disbursed_on,start_month,note,request_id,created_by,created_by_name) VALUES(?,?,?,?,?,?,?,?,?,?)',
    user_id, String(name || 'سلفة').slice(0, 80), Number(amount), installments, on, on.slice(0, 7), String(note || '').slice(0, 300), request_id || null, by ? by.id : null, by ? by.name : '');
}
app.locals.createLoan = createLoan;

app.get('/api/loans', auth, need('payroll.view'), wrap(async (req, res) => {
  const today = tzParts().date, w = [], args = [];
  if (toId(req.query.user_id)) { w.push('l.user_id=?'); args.push(toId(req.query.user_id)); }
  if (isDate(req.query.from)) { w.push('l.disbursed_on>=?'); args.push(req.query.from); }
  if (isDate(req.query.to)) { w.push('l.disbursed_on<=?'); args.push(req.query.to); }
  if (req.query.q) { w.push('(u.name ILIKE ? OR u.username ILIKE ? OR u.phone ILIKE ? OR l.name ILIKE ?)'); const q = `%${String(req.query.q).slice(0, 60)}%`; args.push(q, q, q, q); }
  const rows = await db.all(`SELECT l.*, u.name AS user_name, u.job_title FROM loans l JOIN users u ON u.id=l.user_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY l.id DESC LIMIT 1000`, ...args);
  const st = String(req.query.status || '');
  const out = rows.map((l) => decorate(l, today)).filter((l) => !st || l.state === st);
  const employees = await db.all('SELECT id,name FROM users WHERE active=1 AND is_admin=0 ORDER BY name');
  res.json({ rows: out, employees });
}));
app.post('/api/loans', auth, need('payroll.manage'), wrap(async (req, res) => {
  const b = req.body || {}, uid = toId(b.user_id), amount = Number(b.amount), inst = Number(b.installments) || 1;
  const u = uid && await db.get('SELECT id,name FROM users WHERE id=?', uid);
  if (!u) return res.status(400).json({ error: 'اختاري الموظف' });
  if (!(amount > 0) || amount > 100000000) return res.status(400).json({ error: 'اكتبي مبلغ القرض' });
  if (!Number.isInteger(inst) || inst < 1 || inst > 60) return res.status(400).json({ error: 'عدد الأقساط من 1 إلى 60' });
  const id = await createLoan({ user_id: uid, name: b.name, amount, installments: inst, date: b.date, note: b.note, by: req.user });
  res.json({ ok: true, id });
}));
app.get('/api/loans/:id', auth, need('payroll.view'), wrap(async (req, res) => {
  const l = await db.get('SELECT l.*, u.name AS user_name FROM loans l JOIN users u ON u.id=l.user_id WHERE l.id=?', toId(req.params.id));
  if (!l) return res.status(404).json({ error: 'القرض غير موجود' });
  res.json(decorate(l, tzParts().date));
}));
app.put('/api/loans/:id', auth, need('payroll.manage'), wrap(async (req, res) => {
  const id = toId(req.params.id), l = await db.get('SELECT * FROM loans WHERE id=?', id), b = req.body || {};
  if (!l) return res.status(404).json({ error: 'القرض غير موجود' });
  const cur = decorate(l, tzParts().date);
  const name = b.name !== undefined ? String(b.name).slice(0, 80) : l.name, note = b.note !== undefined ? String(b.note).slice(0, 300) : l.note;
  let inst = l.installments, amount = l.amount;
  if (b.installments !== undefined || b.amount !== undefined) {
    if (cur.paid > 0) return res.status(400).json({ error: 'اتحصّل جزء من القرض، مينفعش تغيير المبلغ أو عدد الأقساط' });
    inst = Number(b.installments ?? l.installments); amount = Number(b.amount ?? l.amount);
    if (!Number.isInteger(inst) || inst < 1 || inst > 60 || !(amount > 0)) return res.status(400).json({ error: 'المبلغ أو عدد الأقساط غير صحيح' });
  }
  const status = b.status === 'cancelled' ? 'cancelled' : b.status === 'active' ? 'active' : l.status;
  await db.run('UPDATE loans SET name=?, note=?, installments=?, amount=?, status=? WHERE id=?', name, note, inst, amount, status, id);
  res.json({ ok: true });
}));
app.delete('/api/loans/:id', auth, need('payroll.manage'), wrap(async (req, res) => {
  const id = toId(req.params.id), l = await db.get('SELECT * FROM loans WHERE id=?', id);
  if (!l) return res.status(404).json({ error: 'القرض غير موجود' });
  if (loanState(l, tzParts().date).paid > 0) { await db.run("UPDATE loans SET status='cancelled' WHERE id=?", id); return res.json({ ok: true, cancelled: true }); }
  await db.run('DELETE FROM loans WHERE id=?', id);
  res.json({ ok: true });
}));
};
