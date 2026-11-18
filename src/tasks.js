'use strict';
/* src/tasks.js — المهام: كشف التأخير وتوليد طلب جزاء تلقائي للمدير (يوافق أو يرفض) + تطبيق قواعد التعيين */
const { db } = require('./db');
const { settings, tzParts } = require('./bootstrap');
const { notifyManagers } = require('./helpers');

const PRIORITIES = { low: 'منخفض', medium: 'متوسط', high: 'مرتفع', urgent: 'عاجل' };
const STATUSES = { todo: 'للتنفيذ', doing: 'قيد التنفيذ', done: 'مكتمل' };
const dayOf = (iso) => (iso ? tzParts(new Date(iso)).date : '');

// المهمة متأخرة: لسه مخلصتش بعد معاد التسليم، أو اتسلّمت بعد المعاد
function isLate(t, today) {
  if (!t.due_date) return false;
  return t.status === 'done' ? !!t.done_at && dayOf(t.done_at) > t.due_date : t.due_date < today;
}

// لو المهمة متأخرة ومفيش طلب جزاء ليها: نعمل طلب جزاء (pending) ونبلّغ المديرين. مرة واحدة لكل مهمة.
async function checkTaskPenalty(t, st, today = tzParts().date) {
  if (!t || t.penalty_req_id || !t.assignee_id || st.task_penalty_on === '0' || !isLate(t, today)) return null;
  const u = await db.get('SELECT * FROM users WHERE id=? AND active=1 AND is_admin=0', t.assignee_id);
  if (!u) return null;
  const days = Number(st.task_penalty_days);
  const daily = ((Number(u.base_salary) || 0) + (Number(u.allowances) || 0)) / 30;
  const amount = Math.round((days > 0 ? days : 0) * daily * 100) / 100;
  if (!(amount > 0)) return null;
  // حجز المهمة الأول (UPDATE شرطي) عشان مفيش طلبين لو اتنفّذ الفحص مرتين في نفس الوقت
  const claim = await db.run('UPDATE tasks SET penalty_req_id=0 WHERE id=? AND penalty_req_id IS NULL', t.id);
  if (claim && claim.rowCount === 0) return null;
  const reason = `تأخر في تسليم المهمة «${t.title}» (معاد التسليم ${t.due_date})`;
  let id;
  try {
    id = await db.insert('INSERT INTO requests(user_id,type,from_date,to_date,reason,amount,status,auto,meta) VALUES(?,?,?,?,?,?,?,?,?)',
      u.id, 'penalty_req', today, today, reason, amount, 'pending', 1, JSON.stringify({ task_id: t.id }));
  } catch (e) { await db.run('UPDATE tasks SET penalty_req_id=NULL WHERE id=?', t.id); throw e; }
  await db.run('UPDATE tasks SET penalty_req_id=? WHERE id=?', id, t.id);
  await notifyManagers(`طلب جزاء تلقائي: ${u.name} اتأخر في المهمة «${t.title}» — ${amount} جنيه، محتاج موافقتك`, u.id);
  return id;
}

async function sweepOverdueTasks() {
  const st = await settings();
  if (st.task_penalty_on === '0') return 0;
  const today = tzParts().date;
  const rows = await db.all("SELECT * FROM tasks WHERE penalty_req_id IS NULL AND assignee_id IS NOT NULL AND due_date IS NOT NULL AND due_date<>'' AND status<>'done' AND due_date<?", today);
  let n = 0;
  for (const t of rows) if (await checkTaskPenalty(t, st, today)) n++;
  return n;
}

// قاعدة التعيين الأولى المناسبة للموظف (كل الموظفين أو قسم محدد) بتملا الأولوية والمدة لو مش مكتوبة
async function ruleFor(user) {
  const rows = await db.all("SELECT * FROM config_items WHERE kind='task_assign_rule' AND active=1 ORDER BY id");
  for (const r of rows) {
    let d = {}; try { d = JSON.parse(r.data || '{}'); } catch { /* تجاهل */ }
    if (!d.applies || d.applies === 'all' || (d.applies === 'dept' && d.department && d.department === user.department)) return d;
  }
  return null;
}

module.exports = { PRIORITIES, STATUSES, checkTaskPenalty, dayOf, isLate, ruleFor, sweepOverdueTasks };
