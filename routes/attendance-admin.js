'use strict';
/* routes/attendance-admin.js — الحضور (إدارة): قائمة وتعديل يدوي وحذف */
const { isDate, isHHMM, toMin, zonedToUtc } = require('../lib/utils');
const { auth, need, wrap } = require('../src/middleware');
const { settings, tzParts } = require('../src/bootstrap');
const { audit, toId } = require('../src/helpers');
const { db } = require('../src/db');
const { getPolicyCtx, graceOf } = require('../src/payroll-engine');


module.exports = function register(app) {

/* ----- سجل الحضور للجميع ----- */
app.get('/api/attendance', auth, need('attendance.view_all'), wrap(async (req, res) => {
  const now = tzParts().date;
  const from = isDate(req.query.from) ? req.query.from : now.slice(0, 7) + '-01';
  const to = isDate(req.query.to) ? req.query.to : now;
  const uid = toId(req.query.user_id);
  res.json(await db.all(`SELECT a.*, EXISTS(SELECT 1 FROM attendance_photos p WHERE p.attendance_id=a.id AND p.kind='in') AS in_photo, EXISTS(SELECT 1 FROM attendance_photos p WHERE p.attendance_id=a.id AND p.kind='out') AS out_photo, u.name AS user_name FROM attendance a JOIN users u ON u.id=a.user_id
    WHERE a.date BETWEEN ? AND ? ${uid ? 'AND a.user_id=?' : ''} ORDER BY a.date DESC, u.name LIMIT 1000`, ...(uid ? [from, to, uid] : [from, to])));
}));
app.post('/api/attendance', auth, need('attendance.edit'), wrap(async (req, res) => {
  const { user_id, date, check_in, check_out, note = '' } = req.body || {};
  const uid = toId(user_id);
  const u = uid && await db.get('SELECT * FROM users WHERE id=?', uid);
  if (!u || !isDate(date)) return res.status(400).json({ error: 'بيانات غير صحيحة' });
  for (const t of [check_in, check_out]) if (t && !isHHMM(t)) return res.status(400).json({ error: 'صيغة الوقت غير صحيحة' });
  const tz = (await settings()).timezone || 'Africa/Cairo'; // (كانت +03:00 ثابتة، فكانت بتغلط ساعة شتاءً)
  const mk = (t) => (t ? zonedToUtc(date, t, tz).toISOString() : null);
  const ci = mk(check_in), co = mk(check_out);
  const grace = graceOf(u, await settings(), await getPolicyCtx());
  const late = check_in &&toMin(check_in) > toMin(u.shift_start) + grace ? toMin(check_in) - toMin(u.shift_start) : 0;
  const early = check_out ? Math.max(0, toMin(u.shift_end) - toMin(check_out)) : 0;
  await db.run(`INSERT INTO attendance(user_id,date,check_in,check_out,late_minutes,early_minutes,note) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(user_id,date) DO UPDATE SET check_in=excluded.check_in, check_out=excluded.check_out, late_minutes=excluded.late_minutes, early_minutes=excluded.early_minutes, note=excluded.note`,
    u.id, date, ci, co, late, early, String(note).slice(0, 200));
  await audit(req, 'attendance.edit', `${u.name} ${date}`, `in=${check_in || '-'} out=${check_out || '-'}`);
  res.json({ ok: true });
}));
app.delete('/api/attendance/:id', auth, need('attendance.edit'), wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (id) {
    const a = await db.get('SELECT a.date, u.name AS user_name FROM attendance a JOIN users u ON u.id=a.user_id WHERE a.id=?', id);
    if (a) { await db.run('DELETE FROM attendance WHERE id=?', id); await audit(req, 'attendance.delete', `${a.user_name} ${a.date}`); }
  }
  res.json({ ok: true });
}));
};
