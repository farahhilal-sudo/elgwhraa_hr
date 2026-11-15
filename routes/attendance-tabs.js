'use strict';
/* routes/attendance-tabs.js — تابات الحضور: الجزاءات (وإعفاؤها من المرتب) وتقويم العمل وسجل رصيد الإجازات */
const { eachDay, isDate, isMonth, monthRange, toMin } = require('../lib/utils');
const { auth, need, wrap } = require('../src/middleware');
const { settings, tzParts } = require('../src/bootstrap');
const { round2, toId } = require('../src/helpers');
const { db } = require('../src/db');
const { REQUEST_TYPES } = require('../src/constants');
const { dashData, dashRange, dashUsers, isWeekendDay } = require('../src/dash-data');
const { getPolicyCtx, getTiers, holidayMap, policiesFor, policyLate, profileOf } = require('../src/payroll-engine');

module.exports = function register(app) {
// جزاءات الحضور (غياب/تأخير/انصراف مبكر) يوم بيوم، مع حالة التطبيق على المرتب (بنفس سياسات الجزاءات والعطلات)
app.get('/api/att/penalties', auth, need('attendance.view_all'), wrap(async (req, res) => {
  const { from, to, today } = dashRange(req.query);
  const [st, tiers, all, pctx] = await Promise.all([settings(), getTiers(), dashUsers(req.query), getPolicyCtx()]);
  const uid = toId(req.query.user_id), users = uid ? all.filter((u) => u.id === uid) : all;
  const { att, covered } = await dashData(users, from, to), hmap = holidayMap(pctx, from, to);
  const flags = new Map((await db.all('SELECT * FROM penalty_flags WHERE date BETWEEN ? AND ?', from, to)).map((f) => [`${f.user_id}|${f.date}|${f.kind}`, f]));
  const lateFactor = parseFloat(st.late_factor || 1), rows = [];
  const push = (u, d, kind, reason, value, unit) => {
    const f = flags.get(`${u.id}|${d}|${kind}`);
    const inf = info.find((x) => x.u.id === u.id), at = att.get(u.id + '|' + d);
    const amount = round2(unit === 'الأيام' ? value * inf.dailyRate : unit === 'الساعات' ? value * inf.hourlyRate : value);
    rows.push({ user_id: u.id, user_name: u.name, department: u.department || '', date: d, kind, reason, value, unit, amount, check_in: at ? at.check_in : null, check_out: at ? at.check_out : null, from: 'المرتب', applied: f ? !!f.applied : true, by: f ? f.by_name : '', at: f ? f.at : null, note: f ? f.note : '' });
  };
  const info = users.map((u) => {
    const { pen } = policiesFor(u, pctx), prof = profileOf(u, pctx), ub = prof && prof.break_paid === false ? Math.max(0, Number(prof.break_min) || 0) : 0;
    const dailyRate = u.base_salary / 30, hourlyRate = dailyRate / Math.max(1, (toMin(u.shift_end) - toMin(u.shift_start) - ub) / 60);
    return { u, pen, dailyRate, hourlyRate, grace: pen && Number.isFinite(Number(pen.grace)) ? Number(pen.grace) : null };
  });
  for (const d of eachDay(from, to < today ? to : today)) {
    if (isWeekendDay(st, d) || hmap.has(d)) continue;
    for (const { u, pen, dailyRate, hourlyRate, grace } of info) {
      if (d < u.hire_date) continue;
      const a = att.get(u.id + '|' + d);
      if (a && a.check_in) {
        const lm = grace !== null && a.late_minutes <= grace ? 0 : a.late_minutes, em = pen && a.early_minutes <= (Number(pen.early_grace) || 0) ? 0 : a.early_minutes;
        if (lm > 0 && (!pen || pen.late_on)) {
          if (pen) push(u, d, 'late', `جزاء التأخير (${lm} دقيقة)`, round2(policyLate(pen, lm, dailyRate, hourlyRate)), 'جنيه');
          else if (tiers.length) { const t = tiers.find((x) => lm >= x.from_minutes && (x.to_minutes === null || lm <= x.to_minutes)); if (t) push(u, d, 'late', `جزاء التأخير (${lm} دقيقة)`, t.value, t.kind === 'fixed' ? 'جنيه' : 'الأيام'); }
          else push(u, d, 'late', `جزاء التأخير (${lm} دقيقة)`, round2((lm / 60) * lateFactor), 'الساعات');
        }
        if (em > 0 && (!pen || pen.early_on)) push(u, d, 'early', 'جزاء تسجيل الانصراف مبكرًا', round2((em / 60) * (pen ? Number(pen.early_factor) || 0 : lateFactor)), 'الساعات');
      } else if (!covered.has(u.id + '|' + d) && d < today) {
        const v = pen ? Number(pen.absence_factor) || 0 : parseFloat(st.absence_factor || 1);
        if (v > 0) push(u, d, 'absent', 'غائب - عدم الحضور', v, 'الأيام');
      }
    }
  }
  const reason = ['absent', 'late', 'early'].includes(req.query.reason) ? req.query.reason : null;
  res.json({ rows: rows.filter((r) => !reason || r.kind === reason).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.user_name.localeCompare(b.user_name))).slice(0, 3000) });
}));
app.post('/api/att/penalties/flag', auth, need('attendance.edit'), wrap(async (req, res) => {
  const items = Array.isArray(req.body && req.body.items) ? req.body.items.slice(0, 500) : [];
  const applied = req.body.applied === false || req.body.applied === 0 ? 0 : 1, note = String(req.body.note || '').slice(0, 200);
  if (!items.length) return res.status(400).json({ error: 'اختاري عنصر واحد على الأقل' });
  for (const it of items) {
    const uid = toId(it.user_id);
    if (!uid || !isDate(it.date) || !['absent', 'late', 'early'].includes(it.kind)) return res.status(400).json({ error: 'بيانات غير صحيحة' });
    if (!(await db.get('SELECT id FROM users WHERE id=?', uid))) return res.status(404).json({ error: 'موظف غير موجود' });
    await db.run(`INSERT INTO penalty_flags(user_id,date,kind,applied,note,by_user,by_name,at) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id,date,kind) DO UPDATE SET applied=excluded.applied, note=excluded.note, by_user=excluded.by_user, by_name=excluded.by_name, at=excluded.at`,
      uid, it.date, it.kind, applied, note, req.user.id, req.user.name, new Date().toISOString());
  }
  res.json({ ok: true, count: items.length });
}));
// تقويم العمل: حالة كل يوم في الشهر + العطلات الأسبوعية والرسمية
app.get('/api/att/calendar', auth, need('attendance.view_all'), wrap(async (req, res) => {
  const month = isMonth(req.query.month) ? req.query.month : tzParts().date.slice(0, 7);
  const [first, last] = monthRange(month), today = tzParts().date;
  const [st, users, pctx] = await Promise.all([settings(), dashUsers({}), getPolicyCtx()]);
  const { att, covered } = await dashData(users, first, last), hmap = holidayMap(pctx, first, last), days = [];
  for (const d of eachDay(first, last)) {
    const row = { date: d, present: 0, late: 0, absent: 0, leave: 0, weekend: isWeekendDay(st, d), holidays: hmap.has(d) ? [String(hmap.get(d))] : [] };
    if (!row.weekend && !row.holidays.length) for (const u of users) {
      if (d < u.hire_date) continue;
      const a = att.get(u.id + '|' + d);
      if (a && a.check_in) a.late_minutes > 0 ? row.late++ : row.present++;
      else if (covered.has(u.id + '|' + d)) row.leave++;
      else if (d < today) row.absent++;
    }
    days.push(row);
  }
  res.json({ month, days, employees: users.length });
}));
// سجل رصيد الإجازات السنوية
app.get('/api/att/balance', auth, need('attendance.view_all'), wrap(async (req, res) => {
  const year = /^\d{4}$/.test(req.query.year || '') ? req.query.year : tzParts().date.slice(0, 4);
  const uid = toId(req.query.user_id), pctx = await getPolicyCtx(), users = (await dashUsers({})).filter((u) => !uid || u.id === uid), ids = new Set(users.map((u) => u.id));
  const reqs = (await db.all("SELECT * FROM requests WHERE status='approved' AND type IN ('annual_leave','sick_leave','emergency_leave') AND from_date LIKE ? ORDER BY from_date", year + '%')).filter((r) => ids.has(r.user_id));
  const rows = [];
  for (const u of users) {
    const prof = profileOf(u, pctx), open = prof && Number.isFinite(Number(prof.annual)) ? Number(prof.annual) : u.annual_leave_days;
    let bal = open;
    rows.push({ user_id: u.id, user_name: u.name, date: `${year}-01-01`, type: 'رصيد افتتاحي', days: open, change: open, balance: bal });
    for (const r of reqs.filter((x) => x.user_id === u.id)) {
      const days = [...eachDay(r.from_date, r.to_date)].length, annual = r.type === 'annual_leave';
      if (annual) bal -= days;
      rows.push({ user_id: u.id, user_name: u.name, date: r.from_date, type: REQUEST_TYPES[r.type], days, change: annual ? -days : 0, balance: bal });
    }
  }
  res.json({ year, rows });
}));
};
