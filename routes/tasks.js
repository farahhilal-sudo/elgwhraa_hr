'use strict';
/* routes/tasks.js — المهام (كانبان: للتنفيذ / قيد التنفيذ / مكتمل) والمشاريع وتقريرها.
   المدير بيعيّن المهمة لموظف، ولو الموظف اتأخر في تسليمها بيتولّد تلقائيًا طلب جزاء للمدير يوافق عليه أو يرفضه. */
const { auth, need, wrap } = require('../src/middleware');
const { db } = require('../src/db');
const { putSetting, resetSettingsCache, settings, tzParts } = require('../src/bootstrap');
const { can, notify, parseIds, toId } = require('../src/helpers');
const { isDate } = require('../lib/utils');
const { PRIORITIES, STATUSES, checkTaskPenalty, dayOf, isLate, ruleFor, sweepOverdueTasks } = require('../src/tasks');

const UNITS = ['minutes', 'hours', 'days'];
module.exports = function register(app) {
const isMgr = (u) => can(u, 'employees.view');
const canManage = (u) => can(u, 'employees.manage');
const NOW_ISO = () => new Date().toISOString();

const decorate = (t, today) => ({ ...t, late: isLate(t, today), overdue: t.status !== 'done' && !!t.due_date && t.due_date < today });
const SELECT = `SELECT t.*, u.name AS assignee_name, u.job_title AS assignee_title, p.name AS project_name
  FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id LEFT JOIN projects p ON p.id=t.project_id`;

app.get('/api/tasks', auth, wrap(async (req, res) => {
  await sweepOverdueTasks().catch((e) => console.error('sweepOverdueTasks', e));
  const today = tzParts().date, w = [], args = [], q = req.query;
  if (!isMgr(req.user)) { w.push('t.assignee_id=?'); args.push(req.user.id); }
  else if (toId(q.user_id)) { w.push('t.assignee_id=?'); args.push(toId(q.user_id)); }
  if (STATUSES[q.status]) { w.push('t.status=?'); args.push(q.status); }
  if (PRIORITIES[q.priority]) { w.push('t.priority=?'); args.push(q.priority); }
  if (toId(q.project_id)) { w.push('t.project_id=?'); args.push(toId(q.project_id)); }
  if (isDate(q.from)) { w.push('t.due_date>=?'); args.push(q.from); }
  if (isDate(q.to)) { w.push('t.due_date<=?'); args.push(q.to); }
  if (q.q) { w.push('(t.title ILIKE ? OR u.name ILIKE ?)'); const s = `%${String(q.q).slice(0, 60)}%`; args.push(s, s); }
  let rows = (await db.all(`${SELECT} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY t.id DESC LIMIT 1000`, ...args)).map((t) => decorate(t, today));
  if (q.overdue === '1') rows = rows.filter((t) => t.overdue);
  const mgr = isMgr(req.user);
  res.json({
    rows, today, can_manage: canManage(req.user), is_manager: mgr,
    employees: mgr ? await db.all('SELECT id,name,job_title FROM users WHERE active=1 AND is_admin=0 AND pending=0 ORDER BY name') : [],
    projects: await db.all('SELECT id,name FROM projects WHERE active=1 ORDER BY name'),
  });
}));

app.post('/api/tasks', auth, need('employees.manage'), wrap(async (req, res) => {
  const b = req.body || {}, title = String(b.title || '').trim().slice(0, 200);
  if (!title) return res.status(400).json({ error: 'اكتب عنوان المهمة' });
  const uid = toId(b.assignee_id), u = uid && await db.get('SELECT * FROM users WHERE id=? AND active=1 AND is_admin=0', uid);
  if (uid && !u) return res.status(400).json({ error: 'الموظف غير موجود' });
  let priority = PRIORITIES[b.priority] ? b.priority : '', due = isDate(b.due_date) ? b.due_date : null;
  if (u && (!priority || !due)) { // قواعد التعيين تملا الناقص
    const r = await ruleFor(u);
    if (r) {
      if (!priority && PRIORITIES[r.priority]) priority = r.priority;
      const d = Number(r.due_days);
      if (!due && d > 0 && d <= 365) due = new Date(Date.parse(tzParts().date + 'T00:00:00Z') + d * 864e5).toISOString().slice(0, 10);
    }
  }
  const pid = toId(b.project_id), est = Number(b.est_value);
  const id = await db.insert('INSERT INTO tasks(title,description,priority,assignee_id,project_id,due_date,est_value,est_unit,created_by,created_by_name) VALUES(?,?,?,?,?,?,?,?,?,?)',
    title, String(b.description || '').slice(0, 20000), priority || 'medium', u ? u.id : null, pid || null, due, est > 0 ? est : null, UNITS.includes(b.est_unit) ? b.est_unit : '', req.user.id, req.user.name);
  if (u && u.id !== req.user.id) await notify(u.id, `تم تعيين مهمة جديدة لك: ${title}${due ? ' (التسليم ' + due + ')' : ''}`, 'task');
  res.json({ ok: true, id });
}));

app.put('/api/tasks/:id', auth, wrap(async (req, res) => {
  const id = toId(req.params.id), t = id && await db.get('SELECT * FROM tasks WHERE id=?', id), b = req.body || {};
  if (!t) return res.status(404).json({ error: 'المهمة غير موجودة' });
  const mgr = canManage(req.user), mine = t.assignee_id === req.user.id;
  if (!mgr && !mine) return res.status(403).json({ error: 'ليس لديك صلاحية على المهمة دي' });
  const set = [], args = [];
  const put = (col, v) => { set.push(`${col}=?`); args.push(v); };
  if (b.status !== undefined) {
    if (!STATUSES[b.status]) return res.status(400).json({ error: 'حالة غير صالحة' });
    if (b.status !== t.status) {
      put('status', b.status);
      if (b.status === 'doing' && !t.started_at) put('started_at', NOW_ISO());
      if (b.status === 'done') put('done_at', NOW_ISO()); else if (t.done_at) put('done_at', null);
    }
  }
  if (mgr) {
    if (b.title !== undefined) { const v = String(b.title).trim().slice(0, 200); if (!v) return res.status(400).json({ error: 'اكتب عنوان المهمة' }); put('title', v); }
    if (b.description !== undefined) put('description', String(b.description).slice(0, 20000));
    if (b.priority !== undefined && PRIORITIES[b.priority]) put('priority', b.priority);
    if (b.due_date !== undefined) put('due_date', isDate(b.due_date) ? b.due_date : null);
    if (b.project_id !== undefined) put('project_id', toId(b.project_id) || null);
    if (b.est_value !== undefined) put('est_value', Number(b.est_value) > 0 ? Number(b.est_value) : null);
    if (b.est_unit !== undefined) put('est_unit', UNITS.includes(b.est_unit) ? b.est_unit : '');
    if (b.assignee_id !== undefined) {
      const uid = toId(b.assignee_id);
      if (uid && !(await db.get('SELECT 1 FROM users WHERE id=? AND active=1 AND is_admin=0', uid))) return res.status(400).json({ error: 'الموظف غير موجود' });
      if ((uid || null) !== t.assignee_id) { put('assignee_id', uid || null); if (uid) await notify(uid, `تم تعيين مهمة لك: ${t.title}`, 'task'); }
    }
  }
  if (set.length) await db.run(`UPDATE tasks SET ${set.join(',')} WHERE id=?`, ...args, id);
  const cur = await db.get('SELECT * FROM tasks WHERE id=?', id);
  await checkTaskPenalty(cur, await settings());
  res.json({ ok: true });
}));

app.delete('/api/tasks/:id', auth, need('employees.manage'), wrap(async (req, res) => {
  const id = toId(req.params.id), t = id && await db.get('SELECT * FROM tasks WHERE id=?', id);
  if (!t) return res.status(404).json({ error: 'المهمة غير موجودة' });
  if (t.penalty_req_id) await db.run("DELETE FROM requests WHERE id=? AND status='pending' AND auto=1", t.penalty_req_id);
  await db.run('DELETE FROM tasks WHERE id=?', id);
  res.json({ ok: true });
}));

/* إعدادات جزاء التأخير */
app.get('/api/tasks/settings', auth, need('employees.view'), wrap(async (req, res) => {
  const st = await settings();
  res.json({ on: st.task_penalty_on !== '0', days: Number(st.task_penalty_days) || 0 });
}));
app.put('/api/tasks/settings', auth, need('settings.manage'), wrap(async (req, res) => {
  const b = req.body || {}, days = Number(b.days);
  if (!(days >= 0) || days > 30) return res.status(400).json({ error: 'قيمة الجزاء من 0 إلى 30 يوم' });
  await putSetting('task_penalty_on', b.on ? '1' : '0'); await putSetting('task_penalty_days', String(days));
  resetSettingsCache();
  res.json({ ok: true });
}));

/* ---------- المشاريع ---------- */
const SCOPES = { employee: 'الموظفون', department: 'الأقسام', office: 'المكاتب', position: 'المناصب' };
const projRows = async () => {
  const rows = await db.all('SELECT * FROM projects ORDER BY id DESC');
  const st = await db.all("SELECT project_id, COUNT(*)::int AS total, SUM(CASE WHEN status='done' THEN 1 ELSE 0 END)::int AS done FROM tasks WHERE project_id IS NOT NULL GROUP BY project_id");
  const m = Object.fromEntries(st.map((s) => [s.project_id, s]));
  return rows.map((p) => ({ ...p, targets: parseIds(p.target_ids), total: (m[p.id] || {}).total || 0, done: (m[p.id] || {}).done || 0 }));
};
app.get('/api/projects', auth, need('employees.view'), wrap(async (req, res) => {
  let rows = await projRows();
  if (req.query.active === '1') rows = rows.filter((p) => p.active); else if (req.query.active === '0') rows = rows.filter((p) => !p.active);
  if (SCOPES[req.query.scope]) rows = rows.filter((p) => p.scope === req.query.scope);
  if (req.query.q) { const q = String(req.query.q).toLowerCase(); rows = rows.filter((p) => p.name.toLowerCase().includes(q)); }
  const [employees, departments, offices, positions] = await Promise.all([
    db.all('SELECT id,name FROM users WHERE active=1 AND is_admin=0 AND pending=0 ORDER BY name'),
    db.all("SELECT id,name FROM config_items WHERE kind='department' AND active=1 ORDER BY name"),
    db.all('SELECT id,name FROM work_locations WHERE active=1 ORDER BY name'),
    db.all("SELECT id,name FROM config_items WHERE kind='position' AND active=1 ORDER BY name"),
  ]);
  res.json({ rows, options: { employee: employees, department: departments, office: offices, position: positions } });
}));
const projBody = (b) => ({
  name: String(b.name || '').trim().slice(0, 120), description: String(b.description || '').slice(0, 2000),
  scope: SCOPES[b.scope] ? b.scope : 'employee', ids: JSON.stringify([...new Set((Array.isArray(b.target_ids) ? b.target_ids : []).map(Number).filter(Number.isInteger))].slice(0, 500)),
});
app.post('/api/projects', auth, need('employees.manage'), wrap(async (req, res) => {
  const p = projBody(req.body || {});
  if (!p.name) return res.status(400).json({ error: 'اكتب اسم المشروع' });
  const id = await db.insert('INSERT INTO projects(name,description,scope,target_ids,created_by) VALUES(?,?,?,?,?)', p.name, p.description, p.scope, p.ids, req.user.id);
  res.json({ ok: true, id });
}));
app.put('/api/projects/:id', auth, need('employees.manage'), wrap(async (req, res) => {
  const id = toId(req.params.id), cur = id && await db.get('SELECT * FROM projects WHERE id=?', id);
  if (!cur) return res.status(404).json({ error: 'المشروع غير موجود' });
  const b = req.body || {}, p = projBody({ ...cur, target_ids: parseIds(cur.target_ids), ...b });
  if (!p.name) return res.status(400).json({ error: 'اكتب اسم المشروع' });
  await db.run('UPDATE projects SET name=?,description=?,scope=?,target_ids=?,active=? WHERE id=?', p.name, p.description, p.scope, p.ids, b.active === undefined ? cur.active : (b.active ? 1 : 0), id);
  res.json({ ok: true });
}));
app.delete('/api/projects/:id', auth, need('employees.manage'), wrap(async (req, res) => {
  await db.run('DELETE FROM projects WHERE id=?', toId(req.params.id));
  res.json({ ok: true });
}));
// تقرير المشاريع: نسبة الإنجاز والمهام المتأخرة لكل مشروع
app.get('/api/projects/report', auth, need('employees.view'), wrap(async (req, res) => {
  const today = tzParts().date;
  const rows = await db.all(`SELECT p.id, p.name, p.active,
      COUNT(t.id)::int AS total,
      COALESCE(SUM(CASE WHEN t.status='todo' THEN 1 ELSE 0 END),0)::int AS todo,
      COALESCE(SUM(CASE WHEN t.status='doing' THEN 1 ELSE 0 END),0)::int AS doing,
      COALESCE(SUM(CASE WHEN t.status='done' THEN 1 ELSE 0 END),0)::int AS done,
      COALESCE(SUM(CASE WHEN t.status<>'done' AND t.due_date IS NOT NULL AND t.due_date<? THEN 1 ELSE 0 END),0)::int AS overdue
    FROM projects p LEFT JOIN tasks t ON t.project_id=p.id GROUP BY p.id ORDER BY p.id DESC`, today);
  res.json({ rows: rows.map((r) => ({ ...r, progress: r.total ? Math.round((r.done / r.total) * 100) : 0 })) });
}));
};
