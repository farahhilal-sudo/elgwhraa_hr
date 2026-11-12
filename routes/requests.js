'use strict';
/* routes/requests.js — الطلبات: تقديم وإلغاء وقائمة الوارد والبت وملخص الإجازات */
const { daysBetween, eachDay, isDate } = require('../lib/utils');
const { tzParts } = require('../src/bootstrap');
const { NOW, db } = require('../src/db');
const { getPolicyCtx, profileOf } = require('../src/payroll-engine');
const { auth, need, wrap } = require('../src/middleware');
const { audit, notify, notifyManagers, toId } = require('../src/helpers');
const { REQUEST_TYPES } = require('../src/constants');
const { parseCfg } = require('../src/shared');


/* ----- الطلبات ----- */
// طلبات وأرصدة إجازات موظف (للموظف نفسه، وللمدير في صفحة بروفايل الموظف)
async function leaveSummary(user) {
  const year = tzParts().date.slice(0, 4);
  const typeSum = async (t) => (await db.all("SELECT from_date,to_date FROM requests WHERE user_id=? AND type=? AND status='approved' AND from_date LIKE ?", user.id, t, year + '%'))
    .reduce((s, r) => s + [...eachDay(r.from_date, r.to_date)].length, 0);
  const [rows, used, sick, emergency, perm] = await Promise.all([
    db.all('SELECT * FROM requests WHERE user_id=? ORDER BY id DESC LIMIT 100', user.id),
    typeSum('annual_leave'), typeSum('sick_leave'), typeSum('emergency_leave'),
    db.get("SELECT COALESCE(SUM(hours),0) AS h FROM requests WHERE user_id=? AND type='permission' AND status='approved' AND from_date LIKE ?", user.id, tzParts().date.slice(0, 7) + '%'),
  ]);
  const prof = profileOf(user, await getPolicyCtx());
  return {
    requests: rows,
    balances: {
      annual_total: prof ? Number(prof.annual) : user.annual_leave_days, annual_used: used,
      sick_total: prof ? Number(prof.sick) || 0 : 0, emergency_total: prof ? Number(prof.emergency) || 0 : 0,
      sick_used: sick, emergency_used: emergency, permission_hours_month: Number(perm.h),
    },
  };
}

// قواعد الإجازات: رصيد «ملف الإجازة» المربوط بالموظف + «قواعد الحد من أيام العطلات» (أقصى مدة / أقصى عدد في نفس اليوم / فترات منع)
const LIMITED_LEAVES = ['annual_leave', 'sick_leave', 'emergency_leave'];
async function checkLeaveRules(user, type, from, to) {
  if (!LIMITED_LEAVES.includes(type)) return null;
  const days = [...eachDay(from, to)];
  const pctx = await getPolicyCtx();
  const prof = profileOf(user, pctx);
  // من غير ملف إجازة: رصيد الإجازة السنوية من بيانات الموظف نفسه (قبل كده كان من غير حد)
  if (!prof && type === 'annual_leave') {
    const cap = Number(user.annual_leave_days) || 0;
    const rows = await db.all("SELECT from_date,to_date FROM requests WHERE user_id=? AND type='annual_leave' AND status IN ('approved','pending') AND from_date LIKE ?", user.id, from.slice(0, 4) + '%');
    const used = rows.reduce((t, r) => t + daysBetween(r.from_date, r.to_date), 0);
    if (used + days.length > cap) return `رصيد الإجازة السنوية ${cap} يوم، المستخدم والمحجوز ${used} والمطلوب ${days.length}`;
  }
  if (prof) {
    const key = { annual_leave: 'annual', sick_leave: 'sick', emergency_leave: 'emergency' }[type];
    const cap = Number(prof[key]) || 0;
    if (cap > 0 || key === 'annual') {
      const rows = await db.all("SELECT from_date,to_date FROM requests WHERE user_id=? AND type=? AND status IN ('approved','pending') AND from_date LIKE ?", user.id, type, from.slice(0, 4) + '%');
      const used = rows.reduce((s, r) => s + [...eachDay(r.from_date, r.to_date)].length, 0);
      if (used + days.length > cap) return `رصيد ${REQUEST_TYPES[type]} في ملف «${prof.name}» ${cap} يوم، المستخدم والمحجوز ${used} والمطلوب ${days.length}`;
    }
  }
  const rules = (await db.all("SELECT * FROM config_items WHERE kind='holiday_limit' AND active=1")).map(parseCfg).filter((r) => !r.archived && (r.types || []).includes(type));
  for (const r of rules) {
    if (r.rule === 'max_consecutive' && days.length > r.value) return `قاعدة «${r.name}»: أقصى مدة للطلب الواحد ${r.value} يوم`;
    if (r.rule === 'blackout' && from <= r.to && to >= r.from) return `قاعدة «${r.name}»: الإجازات ممنوعة من ${r.from} إلى ${r.to}`;
    if (r.rule === 'max_concurrent') {
      const dept = r.scope === 'department';
      const others = await db.all(`SELECT q.from_date, q.to_date FROM requests q JOIN users u ON u.id=q.user_id WHERE q.user_id<>? AND q.status IN ('approved','pending')
        AND q.type IN ('annual_leave','sick_leave','emergency_leave') AND q.from_date<=? AND q.to_date>=? ${dept ? 'AND u.department=?' : ''}`, user.id, to, from, ...(dept ? [user.department || ''] : []));
      for (const d of days) {
        const n = others.filter((o) => o.from_date <= d && o.to_date >= d).length;
        if (n + 1 > r.value) return `قاعدة «${r.name}»: ${dept ? 'في نفس القسم' : 'في الشركة'} يوم ${d} فيه ${n} في إجازة بالفعل والحد الأقصى ${r.value}`;
      }
    }
  }
  return null;
}

module.exports = function register(app) {
app.get('/api/requests/mine', auth, wrap(async (req, res) => { res.json(await leaveSummary(req.user)); }));
app.get('/api/employees/:id/summary', auth, need('employees.view'), wrap(async (req, res) => {
  const id = toId(req.params.id);
  const u = id && await db.get('SELECT * FROM users WHERE id=?', id);
  if (!u) return res.status(404).json({ error: 'غير موجود' });
  res.json(await leaveSummary(u));
}));

app.post('/api/requests', auth, wrap(async (req, res) => {
  const { type, from_date, to_date, hours = 0, reason = '' } = req.body || {};
  if (!REQUEST_TYPES[type]) return res.status(400).json({ error: 'نوع الطلب غير صالح' });
  if (!isDate(from_date) || !isDate(to_date) || to_date < from_date) return res.status(400).json({ error: 'التواريخ غير صحيحة' });
  if (daysBetween(from_date, to_date) > 366) return res.status(400).json({ error: 'مدة الطلب لا تزيد عن 366 يوم' });
  const ruleErr = await checkLeaveRules(req.user, type, from_date, to_date);
  if (ruleErr) return res.status(400).json({ error: ruleErr });
  if (['overtime', 'permission'].includes(type) && !(Number(hours) > 0 && Number(hours) <= 24)) return res.status(400).json({ error: 'حددي عدد الساعات' });
  const id = await db.insert('INSERT INTO requests(user_id,type,from_date,to_date,hours,reason) VALUES(?,?,?,?,?,?)',
    req.user.id, type, from_date, ['overtime', 'permission', 'attendance_edit'].includes(type) ? from_date : to_date, Number(hours) || 0, String(reason).slice(0, 500));
  await notifyManagers(`طلب جديد (${REQUEST_TYPES[type]}) من ${req.user.name}`, req.user.id);
  res.json({ id });
}));

app.delete('/api/requests/:id', auth, wrap(async (req, res) => {
  const id = toId(req.params.id);
  const r = id && await db.get('SELECT * FROM requests WHERE id=? AND user_id=?', id, req.user.id);
  if (!r) return res.status(404).json({ error: 'غير موجود' });
  if (r.status !== 'pending') return res.status(400).json({ error: 'لا يمكن حذف طلب تم البت فيه' });
  await db.run('DELETE FROM requests WHERE id=?', r.id);
  res.json({ ok: true });
}));

app.get('/api/requests', auth, need('requests.view_all'), wrap(async (req, res) => {
  const { status } = req.query;
  const filter = ['pending', 'approved', 'rejected'].includes(status);
  res.json(await db.all(`SELECT r.*, u.name AS user_name, u.job_title FROM requests r JOIN users u ON u.id=r.user_id
    ${filter ? 'WHERE r.status=?' : ''} ORDER BY r.id DESC LIMIT 300`, ...(filter ? [status] : [])));
}));

app.post('/api/requests/:id/decide', auth, need('requests.approve'), wrap(async (req, res) => {
  const { decision, note = '' } = req.body || {};
  if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'قرار غير صالح' });
  const id = toId(req.params.id);
  const r = id && await db.get('SELECT * FROM requests WHERE id=?', id);
  if (!r) return res.status(404).json({ error: 'غير موجود' });
  if (r.user_id === req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'لا يمكنك البت في طلبك الشخصي' });
  await db.run(`UPDATE requests SET status=?, decided_by=?, decided_at=${NOW}, decision_note=? WHERE id=?`,
    decision, req.user.id, String(note).slice(0, 300), r.id);
  await audit(req, 'request.' + decision, `#${r.id} ${REQUEST_TYPES[r.type]}`, `user_id=${r.user_id}`);
  await notify(r.user_id, `تم ${decision === 'approved' ? 'قبول' : 'رفض'} طلبك (${REQUEST_TYPES[r.type]})`);
  res.json({ ok: true });
}));
};
