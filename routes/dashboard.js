'use strict';
/* routes/dashboard.js — لوحة المعلومات: /dashboard و /dash/* */
const { eachDay, isDate, shiftMinutes, toMin } = require('../lib/utils');
const { db } = require('../src/db');
const { round2, toId } = require('../src/helpers');
const { locIds } = require('../src/shared');
const { settings, tzParts } = require('../src/bootstrap');
const { LEAVE_TYPES, REQUEST_TYPES } = require('../src/constants');
const { auth, need, wrap } = require('../src/middleware');
const { getPolicyCtx, getTiers, graceOf, holidayMap, policiesFor, policyLate, policyOvertime, profileOf, tierDeduction } = require('../src/payroll-engine');

async function dashUsers(q) {
  let users = await db.all('SELECT * FROM users WHERE active=1 AND is_admin=0 AND pending=0');
  const office = toId(q.office);
  if (office) users = users.filter((u) => { const l = locIds(u); return !l.length || l.includes(office); });
  if (q.dept) users = users.filter((u) => u.department === String(q.dept));
  if (q.job) users = users.filter((u) => u.job_title === String(q.job));
  return users;
}
function dashRange(q) {
  const today = tzParts().date;
  let from = isDate(q.from) ? q.from : today.slice(0, 7) + '-01', to = isDate(q.to) ? q.to : today;
  if (from > to) [from, to] = [to, from];
  const lim = new Date(from + 'T00:00:00Z'); lim.setUTCDate(lim.getUTCDate() + 400);
  if (to > lim.toISOString().slice(0, 10)) to = lim.toISOString().slice(0, 10);
  return { from, to, today };
}
async function dashData(users, from, to) {
  const ids = new Set(users.map((u) => u.id));
  const [attAll, reqAll] = await Promise.all([
    db.all('SELECT * FROM attendance WHERE date BETWEEN ? AND ?', from, to),
    db.all("SELECT * FROM requests WHERE status='approved' AND to_date>=? AND from_date<=?", from, to),
  ]);
  const att = new Map(), covered = new Set(), otReqs = new Map();
  for (const a of attAll) if (ids.has(a.user_id)) att.set(a.user_id + '|' + a.date, a);
  for (const r of reqAll) {
    if (!ids.has(r.user_id)) continue;
    if (LEAVE_TYPES.includes(r.type)) for (const d of eachDay(r.from_date < from ? from : r.from_date, r.to_date > to ? to : r.to_date)) covered.add(r.user_id + '|' + d);
    if (r.type === 'overtime' && r.from_date >= from && r.from_date <= to) { if (!otReqs.has(r.user_id)) otReqs.set(r.user_id, []); otReqs.get(r.user_id).push(r.hours || 0); }
  }
  return { att, covered, otReqs };
}
const isWeekendDay = (st, d) => String(st.weekend_days || '').split(',').filter(Boolean).map(Number).includes(new Date(d + 'T00:00:00Z').getUTCDay());

module.exports = function register(app) {
// حضور/تأخير/غياب/إجازة لكل يوم في المدى (العطلات الأسبوعية والرسمية مش بتتحسب)
app.get('/api/dash/daily', auth, need('dashboard.view'), wrap(async (req, res) => {
  const { from, to, today } = dashRange(req.query);
  const [st, users, pctx] = await Promise.all([settings(), dashUsers(req.query), getPolicyCtx()]);
  const { att, covered } = await dashData(users, from, to), hmap = holidayMap(pctx, from, to), days = [];
  for (const d of eachDay(from, to)) {
    const row = { date: d, present: 0, late: 0, absent: 0, leave: 0 };
    if (!isWeekendDay(st, d) && !hmap.has(d)) for (const u of users) {
      if (d < u.hire_date) continue;
      const a = att.get(u.id + '|' + d);
      if (a && a.check_in) a.late_minutes > 0 ? row.late++ : row.present++;
      else if (covered.has(u.id + '|' + d)) row.leave++;
      else if (d < today) row.absent++;
    }
    days.push(row);
  }
  res.json({ days });
}));
// الطلبات حسب النوع والحالة
app.get('/api/dash/requests', auth, need('dashboard.view'), wrap(async (req, res) => {
  const { from, to } = dashRange(req.query);
  const users = await dashUsers(req.query), ids = new Set(users.map((u) => u.id));
  const only = REQUEST_TYPES[req.query.type] ? req.query.type : null;
  const rows = Object.entries(REQUEST_TYPES).filter(([k]) => !only || k === only).map(([k, label]) => ({ type: k, label, total: 0, pending: 0, approved: 0, rejected: 0 }));
  const by = Object.fromEntries(rows.map((r) => [r.type, r]));
  for (const r of await db.all('SELECT user_id,type,status FROM requests WHERE from_date BETWEEN ? AND ?', from, to)) {
    if (!ids.has(r.user_id) || !by[r.type]) continue;
    by[r.type].total++; if (r.status in by[r.type]) by[r.type][r.status]++;
  }
  const totals = rows.reduce((t, r) => ({ total: t.total + r.total, pending: t.pending + r.pending, approved: t.approved + r.approved, rejected: t.rejected + r.rejected }), { total: 0, pending: 0, approved: 0, rejected: 0 });
  res.json({ rows, totals });
}));
// توزيع تسجيلات الحضور والانصراف على ساعات اليوم
app.get('/api/dash/hourly', auth, need('dashboard.view'), wrap(async (req, res) => {
  const { from, to } = dashRange(req.query);
  const users = await dashUsers(req.query), ids = new Set(users.map((u) => u.id));
  const inn = Array(24).fill(0), out = Array(24).fill(0);
  for (const a of await db.all('SELECT user_id,check_in,check_out FROM attendance WHERE date BETWEEN ? AND ?', from, to)) {
    if (!ids.has(a.user_id)) continue;
    if (a.check_in) inn[Math.floor(tzParts(new Date(a.check_in)).minutes / 60)]++;
    if (a.check_out) out[Math.floor(tzParts(new Date(a.check_out)).minutes / 60)]++;
  }
  res.json({ in: inn, out });
}));
// تجميع لكل موظف في المدى: غياب، تأخير، إضافي، ساعات عمل، وقيمها (نفس منطق computeMonth)
app.get('/api/dash/agg', auth, need('dashboard.view'), wrap(async (req, res) => {
  const { from, to, today } = dashRange(req.query);
  const [st, tiers, users, pctx] = await Promise.all([settings(), getTiers(), dashUsers(req.query), getPolicyCtx()]);
  const { att, covered, otReqs } = await dashData(users, from, to);
  const hmap = holidayMap(pctx, from, to), upto = to < today ? to : today, lateFactor = parseFloat(st.late_factor || 1);
  const list = users.map((u) => {
    const { pen, ot } = policiesFor(u, pctx), polGrace = pen && Number.isFinite(Number(pen.grace)) ? Number(pen.grace) : null;
    const prof = profileOf(u, pctx), unpaidBreak = prof && prof.break_paid === false ? Math.max(0, Number(prof.break_min) || 0) : 0;
    const shiftHours = Math.max(1, (shiftMinutes(u.shift_start, u.shift_end) - unpaidBreak) / 60), dailyRate = u.base_salary / 30, hourlyRate = dailyRate / shiftHours;
    let absentDays = 0, lateMinutes = 0, earlyMinutes = 0, tierTotal = 0, partialTotal = 0, worked = 0;
    if (from <= upto) for (const d of eachDay(from, upto)) {
      if (d < u.hire_date || isWeekendDay(st, d) || hmap.has(d)) continue;
      const a = att.get(u.id + '|' + d);
      if (a && a.check_in) {
        const lm = polGrace !== null && a.late_minutes <= polGrace ? 0 : a.late_minutes;
        const em = pen && a.early_minutes <= (Number(pen.early_grace) || 0) ? 0 : a.early_minutes;
        lateMinutes += lm; earlyMinutes += em;
        if (lm > 0) tierTotal += pen ? policyLate(pen, lm, dailyRate, hourlyRate) : tierDeduction(tiers, lm, dailyRate);
        if (pen && pen.partial_on && !a.check_out && d < today) partialTotal += pen.partial_kind === 'fixed' ? Number(pen.partial_value) || 0 : (Number(pen.partial_value) || 0) * dailyRate;
        if (a.check_out) worked += Math.max(0, (new Date(a.check_out) - new Date(a.check_in)) / 60000);
      } else if (!covered.has(u.id + '|' + d) && d < today) absentDays++;
    }
    const lateOnly = pen ? (pen.late_on ? tierTotal : 0) : (tiers.length ? tierTotal : (lateMinutes / 60) * hourlyRate * lateFactor);
    const earlyDed = pen ? (pen.early_on ? (earlyMinutes / 60) * hourlyRate * (Number(pen.early_factor) || 0) : 0) : (earlyMinutes / 60) * hourlyRate * lateFactor;
    const otHours = (otReqs.get(u.id) || []).reduce((t, h) => t + policyOvertime(ot, h), 0);
    return { id: u.id, name: u.name, department: u.department || '', job_title: u.job_title || '', absent_days: absentDays, late_minutes: lateMinutes,
      absence_deduction: round2(absentDays * dailyRate * (pen ? Number(pen.absence_factor) || 0 : parseFloat(st.absence_factor || 1))), late_deduction: round2(lateOnly + earlyDed + partialTotal),
      overtime_minutes: Math.round(otHours * 60), overtime_pay: round2(otHours * hourlyRate * (ot ? Number(ot.factor) || 0 : parseFloat(st.overtime_factor || 1.5))), worked_minutes: Math.round(worked) };
  });
  const ids = new Set(users.map((u) => u.id));
  const adj = (await db.all('SELECT user_id,month,kind,amount FROM adjustments WHERE month BETWEEN ? AND ?', from.slice(0, 7), to.slice(0, 7))).filter((a) => ids.has(a.user_id));
  res.json({ users: list, adj, currency: st.currency });
}));

app.get('/api/dashboard', auth, need('dashboard.view'), wrap(async (req, res) => {
  const now = tzParts();
  const [st, users, attRows, leaveRows, pending, pctx] = await Promise.all([
    settings(),
    dashUsers(req.query),
    db.all('SELECT * FROM attendance WHERE date=?', now.date),
    db.all("SELECT user_id FROM requests WHERE status='approved' AND from_date<=? AND to_date>=? AND type IN ('annual_leave','sick_leave','emergency_leave','work_mission')", now.date, now.date),
    db.get("SELECT COUNT(*)::int AS c FROM requests WHERE status='pending'"),
    getPolicyCtx(),
  ]);
  const att = Object.fromEntries(attRows.map((a) => [a.user_id, a]));
  const leaves = leaveRows.map((r) => r.user_id);
  const dow = new Date(now.date + 'T00:00:00Z').getUTCDay();
  const weekendToday = String(st.weekend_days).split(',').map(Number).includes(dow) || holidayMap(pctx, now.date, now.date).has(now.date);
  const list = users.map((u) => {
    const a = att[u.id];
    let status = 'absent';
    if (a && a.check_in) status = a.late_minutes > 0 ? 'late' : 'present';
    else if (leaves.includes(u.id)) status = 'leave';
    else if (weekendToday) status = 'off';
    else if (now.minutes < toMin(u.shift_start) + graceOf(u, st, pctx)) status = 'not_yet';
    return { id: u.id, name: u.name, job_title: u.job_title, department: u.department, status, check_in: a?.check_in || null, check_out: a?.check_out || null, late_minutes: a?.late_minutes || 0 };
  });
  const count = (s) => list.filter((x) => x.status === s).length;
  res.json({
    date: now.date, total: list.length, present: count('present'), late: count('late'), absent: count('absent'),
    leave: count('leave'), not_yet: count('not_yet'), off: count('off'),
    pending_requests: pending.c,
    no_schedule: users.filter((u) => !u.shift_start || !u.shift_end).length,
    missing_face: users.filter((u) => !u.face_descriptor && !u.is_admin).length, list,
  });
}));
};
