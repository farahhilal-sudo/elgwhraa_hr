'use strict';
/* routes/requests.js — الطلبات: تقديم وإلغاء وقائمة الوارد والبت وملخص الإجازات */
const { daysBetween, eachDay, isDate } = require('../lib/utils');
const { tzParts } = require('../src/bootstrap');
const { NOW, db } = require('../src/db');
const { getPolicyCtx, profileOf } = require('../src/payroll-engine');
const { auth, need, wrap } = require('../src/middleware');
const { audit, can, notify, notifyManagers, toId } = require('../src/helpers');
const { ALL_TYPES, AMOUNT_TYPES, LEAVE_TYPES, MGR_TYPES, ON_BEHALF, REQUEST_TYPES } = require('../src/constants');
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
// قواعد الأذونات من ملف الإجازة (لو الملف فيه إعدادات أذونات)
async function checkPermRules(user, from, hours) {
  const prof = profileOf(user, await getPolicyCtx()), p = prof && prof.perm;
  if (!p) return null;
  if (p.on === false) return `الأذونات غير مسموحة في ملف «${prof.name}»`;
  const cfg = p.paid && p.paid.on !== false ? p.paid : p.unpaid && p.unpaid.on !== false ? p.unpaid : null;
  if (!cfg || cfg.limit === false) return null;
  const mins = Math.round(Number(hours) * 60);
  if (Number(cfg.min) > 0 && mins < Number(cfg.min)) return `أقل مدة للإذن ${cfg.min} دقيقة`;
  const q = (like) => db.get("SELECT COUNT(*) AS n FROM requests WHERE user_id=? AND type='permission' AND status IN ('approved','pending') AND from_date LIKE ?", user.id, like);
  if (Number(cfg.day) > 0 && Number((await q(from)).n) >= Number(cfg.day)) return `الحد الأقصى لطلبات الأذونات في اليوم ${cfg.day}`;
  if (Number(cfg.month) > 0 && Number((await q(from.slice(0, 7) + '%')).n) >= Number(cfg.month)) return `الحد الأقصى لطلبات الأذونات في الشهر ${cfg.month}`;
  return null;
}
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
  const { type, from_date, to_date, hours = 0, reason: reason0 = '', meta = {}, user_id } = req.body || {};
  let { amount = 0 } = req.body || {}, reason = reason0;
  if (!ALL_TYPES[type]) return res.status(400).json({ error: 'نوع الطلب غير صالح' });
  const isMgr = !!MGR_TYPES[type];
  if (isMgr && !can(req.user, 'requests.approve')) return res.status(403).json({ error: 'ليس لديك صلاحية لهذا النوع من الطلبات' });
  let target = req.user;
  // طلب بالنيابة عن موظف: أنواع الإدارة دايماً، وأي نوع تاني لمن عنده صلاحية الموافقة (شاشة «تقديم طلب نيابة عن» في التطبيق)
  if (ON_BEHALF.includes(type) || (toId(user_id) && toId(user_id) !== req.user.id && can(req.user, 'requests.approve'))) {
    target = toId(user_id) && await db.get('SELECT * FROM users WHERE id=? AND active=1', toId(user_id));
    if (!target || (target.is_admin && !req.user.is_admin)) return res.status(400).json({ error: 'اختاري الموظف' });
  }
  // مكافأة/خصم/جزاء بالأيام: القيمة = عدد الأيام × (الأساسي أو الأساسي + الحافز) ÷ 30
  const bDays = Number((req.body || {}).days);
  if (['bonus_req', 'deduction_req', 'allowance_req', 'penalty_req'].includes(type) && bDays > 0) {
    const both = (req.body || {}).basis === 'both', sal = await db.get('SELECT base_salary, allowances FROM users WHERE id=?', target.id);
    amount = Math.round(bDays * ((Number(sal.base_salary) || 0) + (both ? Number(sal.allowances) || 0 : 0)) / 30 * 100) / 100;
    reason = `${reason} (${bDays} يوم من ${both ? 'الأساسي والحافز' : 'الأساسي'})`.trim();
  }
  if (AMOUNT_TYPES.includes(type) && !(Number(amount) > 0)) return res.status(400).json({ error: 'اكتبي المبلغ' });
  if (!isDate(from_date) || !isDate(to_date) || to_date < from_date) return res.status(400).json({ error: 'التواريخ غير صحيحة' });
  if (daysBetween(from_date, to_date) > 366) return res.status(400).json({ error: 'مدة الطلب لا تزيد عن 366 يوم' });
  const ruleErr = (await checkLeaveRules(target, type, from_date, to_date)) || (type === 'permission' ? await checkPermRules(target, from_date, hours) : null);
  if (ruleErr) return res.status(400).json({ error: ruleErr });
  if (['overtime', 'permission'].includes(type) && !(Number(hours) > 0 && Number(hours) <= 24)) return res.status(400).json({ error: 'حددي عدد الساعات' });
  // قواعد التعيين: موعد عمل مقفول عن التعيين لا يُطلب إلا من المدير أو صاحب صلاحية الإعدادات
  if (type === 'schedule_req' && meta && /^\d{2}:\d{2}$/.test(meta.start || '') && /^\d{2}:\d{2}$/.test(meta.end || '') && !(req.user.is_admin || can(req.user, 'settings.manage'))) {
    const hh = (t) => String(t).split(':').map(Number).join(':');
    const sc = (await getPolicyCtx()).schedules.find((s) => hh(s.start) === hh(meta.start) && hh(s.end) === hh(meta.end) && s.assign_anyone === false);
    if (sc) return res.status(403).json({ error: `موعد العمل «${sc.name}» لا يمكن تعيينه إلا من المدير` });
  }
  const metaStr = JSON.stringify(meta && typeof meta === 'object' ? meta : {}).slice(0, 800);
  const id = await db.insert('INSERT INTO requests(user_id,type,from_date,to_date,hours,reason,amount,created_by,meta) VALUES(?,?,?,?,?,?,?,?,?)',
    target.id, type, from_date, ['overtime', 'permission', 'attendance_edit', 'expense', 'loan', ...Object.keys(MGR_TYPES)].includes(type) ? from_date : to_date, Number(hours) || 0, String(reason).slice(0, 500), Number(amount) || 0, req.user.id, metaStr);
  await notifyManagers(`طلب جديد (${ALL_TYPES[type]}) من ${req.user.name}${target.id !== req.user.id ? ' بخصوص ' + target.name : ''}`, req.user.id);
  if (target.id !== req.user.id) await notify(target.id, `تم تقديم طلب (${ALL_TYPES[type]}) نيابةً عنك بواسطة ${req.user.name}`, 'req_decision');
  res.json({ id });
}));

app.delete('/api/requests/:id', auth, wrap(async (req, res) => {
  const id = toId(req.params.id);
  const r = id && await db.get('SELECT * FROM requests WHERE id=? AND (user_id=? OR created_by=?)', id, req.user.id, req.user.id);
  if (!r) return res.status(404).json({ error: 'غير موجود' });
  if (r.status !== 'pending') return res.status(400).json({ error: 'لا يمكن حذف طلب تم البت فيه' });
  await db.run('DELETE FROM requests WHERE id=?', r.id);
  res.json({ ok: true });
}));

app.get('/api/requests', auth, need('requests.view_all'), wrap(async (req, res) => {
  const { status } = req.query;
  const filter = ['pending', 'approved', 'rejected'].includes(status);
  const w = [], args = [];
  if (filter) { w.push('r.status=?'); args.push(status); }
  if (isDate(req.query.from)) { w.push('r.from_date>=?'); args.push(req.query.from); }
  if (isDate(req.query.to)) { w.push('r.from_date<=?'); args.push(req.query.to); }
  res.json(await db.all(`SELECT r.*, u.name AS user_name, u.job_title, u.department, u.username, u.phone, u.location_ids, cb.name AS created_by_name
    FROM requests r JOIN users u ON u.id=r.user_id LEFT JOIN users cb ON cb.id=r.created_by
    ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY r.id DESC LIMIT 1500`, ...args));
}));
// الصادر: الطلبات اللي أنا قدمتها (لنفسي أو بخصوص موظف)
app.get('/api/requests/outgoing', auth, wrap(async (req, res) => {
  const w = ['(r.user_id=? OR r.created_by=?)'], args = [req.user.id, req.user.id];
  if (isDate(req.query.from)) { w.push('r.from_date>=?'); args.push(req.query.from); }
  if (isDate(req.query.to)) { w.push('r.from_date<=?'); args.push(req.query.to); }
  res.json(await db.all(`SELECT r.*, u.name AS user_name, u.job_title, u.department, cb.name AS created_by_name
    FROM requests r JOIN users u ON u.id=r.user_id LEFT JOIN users cb ON cb.id=r.created_by WHERE ${w.join(' AND ')} ORDER BY r.id DESC LIMIT 1000`, ...args));
}));

// أثر الطلبات اللي ليها تنفيذ فعلي بعد القبول
async function applyRequestEffect(r, by) {
  let meta = {}; try { meta = JSON.parse(r.meta || '{}'); } catch { /* تجاهل */ }
  const month = r.from_date.slice(0, 7), why = `${ALL_TYPES[r.type]}${r.reason ? ': ' + r.reason : ''}`.slice(0, 200);
  if (['bonus_req', 'allowance_req'].includes(r.type) && r.amount > 0) await db.run('INSERT INTO adjustments(user_id,month,kind,amount,reason,created_by) VALUES(?,?,?,?,?,?)', r.user_id, month, 'bonus', r.amount, why, by.id);
  else if (r.type === 'penalty_req' && r.amount > 0) await db.run('INSERT INTO adjustments(user_id,month,kind,amount,reason,created_by) VALUES(?,?,?,?,?,?)', r.user_id, month, 'penalty', r.amount, why, by.id);
  else if (r.type === 'deduction_req' && r.amount > 0) await db.run('INSERT INTO adjustments(user_id,month,kind,amount,reason,created_by) VALUES(?,?,?,?,?,?)', r.user_id, month, 'deduction', r.amount, why, by.id);
  else if (r.type === 'loan' && r.amount > 0) { const inst = Math.min(60, Math.max(1, parseInt(meta.installments, 10) || 1)); await app.locals.createLoan({ user_id: r.user_id, name: 'سلفة', amount: r.amount, installments: inst, date: tzParts().date, note: r.reason, request_id: r.id, by }); }
  else if (r.type === 'suspend_req') await db.run('UPDATE users SET active=0, suspended_at=? WHERE id=? AND is_admin=0 AND active=1', tzParts().date, r.user_id);
  else if (r.type === 'transfer_req') {
    const u = await db.get('SELECT * FROM users WHERE id=?', r.user_id);
    if (u) {
      await db.run("UPDATE users SET department=COALESCE(NULLIF(?,''),department), job_title=COALESCE(NULLIF(?,''),job_title) WHERE id=?", String(meta.department || ''), String(meta.job_title || ''), u.id);
      await db.run('INSERT INTO config_items(kind,name,data) VALUES(?,?,?)', 'transfer', u.name, JSON.stringify({ from: [u.department, u.job_title].filter(Boolean).join(' / ') || '—', to: [meta.department || u.department, meta.job_title || u.job_title].filter(Boolean).join(' / ') || '—', date: r.from_date, reason: r.reason || '' }));
    }
  } else if (r.type === 'schedule_req' && /^\d{2}:\d{2}$/.test(meta.start || '') && /^\d{2}:\d{2}$/.test(meta.end || '')) await db.run('UPDATE users SET shift_start=?, shift_end=? WHERE id=?', meta.start, meta.end, r.user_id);
}
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
  if (decision === 'approved' && r.status !== 'approved') await applyRequestEffect(r, req.user);
  await notify(r.user_id, `تم ${decision === 'approved' ? 'قبول' : 'رفض'} طلبك (${ALL_TYPES[r.type] || r.type})`, 'req_decision');
  res.json({ ok: true });
}));
};
