'use strict';
/* routes/reports.js — التقارير الشهرية */
const { isMonth } = require('../lib/utils');
const { auth, need, wrap } = require('../src/middleware');
const { settings, tzParts } = require('../src/bootstrap');
const { db } = require('../src/db');
const { computeMonth, getTiers } = require('../src/payroll-engine');


module.exports = function register(app) {

/* ----- التقارير ----- */
app.get('/api/reports/monthly', auth, need('reports.view'), wrap(async (req, res) => {
  const month = isMonth(req.query.month) ? req.query.month : tzParts().date.slice(0, 7);
  const [st, users, tiers] = await Promise.all([settings(), db.all('SELECT * FROM users WHERE active=1 AND is_admin=0 ORDER BY id'), getTiers()]);
  const rows = await Promise.all(users.map(async (u) => {
    const m = await computeMonth(u, month, st, tiers);
    return {
      user_id: u.id, name: u.name, job_title: u.job_title, work_days: m.work_days, present_days: m.present_days,
      absent_days: m.absent_days, leave_days: m.leave_days, late_minutes: m.late_minutes, early_minutes: m.early_minutes,
      overtime_hours: m.overtime_hours, permission_hours: m.permission_hours,
    };
  }));
  res.json({ month, rows });
}));
};
