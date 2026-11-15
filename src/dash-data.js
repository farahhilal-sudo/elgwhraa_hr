'use strict';
/* src/dash-data.js — تجميعات مشتركة للوحة المعلومات وتابات الحضور: موظفين بفلاتر، مدى تاريخ، حضور وإجازات وإضافي، وإجازة أسبوعية */
const { eachDay, isDate } = require('../lib/utils');
const { db } = require('./db');
const { toId } = require('./helpers');
const { locIds } = require('./shared');
const { tzParts } = require('./bootstrap');
const { LEAVE_TYPES } = require('./constants');

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

module.exports = { dashData, dashRange, dashUsers, isWeekendDay };
