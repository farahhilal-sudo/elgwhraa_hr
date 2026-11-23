'use strict';
/* routes/employee-app.js — واجهات تطبيق الموظف (شاشات: السجل، الاستراحات، المكافآت والخصومات، التكليفات، الإشعارات، دليل الموظفين، الملف الشخصي) */
const { eachDay, isMonth, monthRange } = require('../lib/utils');
const { NOW, db } = require('../src/db');
const { settings, tzParts } = require('../src/bootstrap');
const { auth, wrap } = require('../src/middleware');
const { toId } = require('../src/helpers');
const { getPolicyCtx, holidayMap } = require('../src/payroll-engine');
const { parseCfg } = require('../src/shared');
const { LEAVE_TYPES } = require('../src/constants');

// أنواع إشعارات الموظف اللي ينفع يقفلها من «الإعدادات» (القناتين: بريد / داخل التطبيق)
const NOTIF_CATS = ['penalty', 'hiring', 'adjust', 'doc_expiry', 'new_shift', 'comment_before', 'comment_mine', 'signout_reminder', 'req_decision'];
const DEFAULT_PREFS = { hiring: { email: true, push: true }, adjust: { email: true, push: true } };
const prefsOf = (u) => { let p = {}; try { p = JSON.parse(u.notif_prefs || '{}'); } catch { /* تجاهل */ } const out = {}; for (const k of NOTIF_CATS) out[k] = { email: !!(p[k] && p[k].email !== undefined ? p[k].email : (DEFAULT_PREFS[k] || {}).email), push: p[k] && p[k].push !== undefined ? !!p[k].push : true }; return out; };

module.exports = function register(app) {
/* سجل الجدول: كل يوم في الشهر بحالته (غائب / يوم عطلة / إجازة / حضر) ووقت الحضور والانصراف ومدة الاستراحات */
app.get('/api/app/history', auth, wrap(async (req, res) => {
  const month = isMonth(req.query.month) ? req.query.month : tzParts().date.slice(0, 7);
  const [first, last] = monthRange(month), today = tzParts().date, u = req.user;
  const [st, att, reqs, pctx, brk] = await Promise.all([
    settings(), db.all('SELECT * FROM attendance WHERE user_id=? AND date BETWEEN ? AND ?', u.id, first, last),
    db.all("SELECT * FROM requests WHERE user_id=? AND status='approved' AND to_date>=? AND from_date<=?", u.id, first, last),
    getPolicyCtx(), db.all('SELECT * FROM breaks WHERE user_id=? AND date BETWEEN ? AND ?', u.id, first, last),
  ]);
  const weekend = String(st.weekend_days || '').split(',').filter(Boolean).map(Number), hmap = holidayMap(pctx, first, last);
  const byDate = Object.fromEntries(att.map((a) => [a.date, a])), leave = new Set();
  for (const r of reqs) if (LEAVE_TYPES.includes(r.type)) for (const d of eachDay(r.from_date, r.to_date)) leave.add(d);
  const days = [];
  for (const d of eachDay(first, last < today ? last : today)) {
    if (d < u.hire_date) continue;
    const a = byDate[d], dow = new Date(d + 'T00:00:00Z').getUTCDay();
    const secs = brk.filter((b) => b.date === d && b.end_at).reduce((s, b) => s + Math.max(0, (new Date(b.end_at) - new Date(b.start_at)) / 1000), 0);
    let status = 'absent';
    if (a && a.check_in) status = a.late_minutes > 0 ? 'late' : 'present';
    else if (weekend.includes(dow) || hmap.has(d)) status = 'off';
    else if (leave.has(d)) status = 'leave';
    days.push({ date: d, status, check_in: a ? a.check_in : null, check_out: a ? a.check_out : null, late_minutes: a ? a.late_minutes : 0, break_seconds: Math.round(secs), holiday: hmap.has(d) ? String(hmap.get(d)) : '' });
  }
  res.json({ month, days: days.reverse() });
}));

/* الاستراحات */
app.get('/api/app/breaks', auth, wrap(async (req, res) => {
  const today = tzParts().date;
  res.json({ today, rows: await db.all('SELECT * FROM breaks WHERE user_id=? AND date=? ORDER BY id', req.user.id, today) });
}));
app.post('/api/app/breaks/start', auth, wrap(async (req, res) => {
  const today = tzParts().date, a = await db.get('SELECT * FROM attendance WHERE user_id=? AND date=?', req.user.id, today);
  if (!a || !a.check_in) return res.status(400).json({ error: 'سجّل الحضور الأول' });
  if (a.check_out) return res.status(400).json({ error: 'تم تسجيل الانصراف' });
  if (await db.get('SELECT 1 FROM breaks WHERE user_id=? AND date=? AND end_at IS NULL', req.user.id, today)) return res.status(400).json({ error: 'عندك استراحة شغالة' });
  await db.run('INSERT INTO breaks(user_id,date,start_at) VALUES(?,?,?)', req.user.id, today, new Date().toISOString());
  res.json({ ok: true });
}));
app.post('/api/app/breaks/end', auth, wrap(async (req, res) => {
  const r = await db.run('UPDATE breaks SET end_at=? WHERE user_id=? AND date=? AND end_at IS NULL', new Date().toISOString(), req.user.id, tzParts().date);
  if (!r.rowCount) return res.status(400).json({ error: 'مفيش استراحة شغالة' });
  res.json({ ok: true });
}));

/* مكافآتي وخصوماتي (من التسويات) — «مدفوع» لما كشف الشهر يتصرف */
app.get('/api/app/adjustments', auth, wrap(async (req, res) => {
  const rows = await db.all(`SELECT a.id, a.month, a.kind, a.amount, a.reason, a.created_at, c.name AS created_by_name,
      EXISTS(SELECT 1 FROM payslips p WHERE p.user_id=a.user_id AND p.month=a.month) AS paid
    FROM adjustments a LEFT JOIN users c ON c.id=a.created_by WHERE a.user_id=? ORDER BY a.id DESC LIMIT 300`, req.user.id);
  res.json({ rows });
}));

/* التكليفات الخاصة بالموظف (من تابات الحضور) */
app.get('/api/app/assignments', auth, wrap(async (req, res) => {
  const rows = (await db.all("SELECT * FROM config_items WHERE kind='assignment' ORDER BY id DESC LIMIT 500")).map(parseCfg)
    .filter((r) => r.active && (String(r.name) === req.user.name || String(r.user_id || r.emp_id || r.employee_id || '') === String(req.user.id)));
  res.json({ rows });
}));

/* فئات المطالبات (لزرار «مطالبة جديدة») */
app.get('/api/app/claim-categories', auth, wrap(async (req, res) => {
  res.json((await db.all("SELECT id,name FROM config_items WHERE kind='expense_category' AND active=1 ORDER BY id")).map((r) => ({ id: r.id, name: r.name })));
}));

/* الإشعارات: السجل + الإعلانات + الإعدادات */
app.get('/api/app/notifications', auth, wrap(async (req, res) => {
  const where = ['user_id=?'], args = [req.user.id];
  const from = String(req.query.from || ''), to = String(req.query.to || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) { where.push('created_at>=?'); args.push(from + ' 00:00:00'); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) { where.push('created_at<=?'); args.push(to + ' 23:59:59'); }
  res.json(await db.all(`SELECT id,text,cat,read,created_at FROM notifications WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 100`, ...args));
}));
app.get('/api/app/announcements', auth, wrap(async (req, res) => {
  const today = tzParts().date;
  res.json((await db.all("SELECT * FROM config_items WHERE kind='announcement' AND active=1 ORDER BY id DESC LIMIT 50")).map(parseCfg)
    .filter((r) => (!r.from || r.from <= today) && (!r.to || r.to >= today)).map((r) => ({ id: r.id, title: r.name, text: r.text || '', created_at: r.created_at })));
}));
app.get('/api/app/notif-prefs', auth, wrap(async (req, res) => { res.json({ cats: NOTIF_CATS, prefs: prefsOf(req.user) }); }));
app.put('/api/app/notif-prefs', auth, wrap(async (req, res) => {
  const { cat, channel, value } = req.body || {};
  if (!NOTIF_CATS.includes(cat) || !['email', 'push'].includes(channel)) return res.status(400).json({ error: 'بيانات غير صحيحة' });
  const p = prefsOf(req.user); p[cat][channel] = !!value;
  await db.run('UPDATE users SET notif_prefs=? WHERE id=?', JSON.stringify(p), req.user.id);
  res.json({ ok: true, prefs: p });
}));

/* دليل الموظفين */
app.get('/api/app/directory', auth, wrap(async (req, res) => {
  res.json(await db.all(`SELECT u.id,u.name,u.job_title,u.department,u.phone,u.email,EXISTS(SELECT 1 FROM user_avatars a WHERE a.user_id=u.id) AS has_avatar
    FROM users u WHERE u.active=1 AND u.is_admin=0 AND u.pending=0 ORDER BY u.name`));
}));

/* الملف الشخصي: بيانات إضافية (المدير المباشر، المكاتب، ملف الإجازة) */
app.get('/api/app/profile', auth, wrap(async (req, res) => {
  const u = req.user, mgr = u.manager_id && await db.get('SELECT name FROM users WHERE id=?', u.manager_id);
  let ids = []; try { ids = JSON.parse(u.location_ids || '[]'); } catch { /* تجاهل */ }
  const offices = ids.length ? await db.all('SELECT name FROM work_locations WHERE id = ANY(?::int[])', ids) : [];
  res.json({ manager_name: mgr ? mgr.name : '', offices: offices.map((o) => o.name) });
}));
};
