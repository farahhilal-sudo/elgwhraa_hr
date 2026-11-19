'use strict';
/* routes/hr-docs.js — مستندات الموارد البشرية: طلبات المستندات، الخطابات الصادرة (من قوالب)، والقوالب (config_items kind=doc_template) */
const { auth, need, wrap } = require('../src/middleware');
const { db } = require('../src/db');
const { settings, tzParts } = require('../src/bootstrap');
const { can, notify, toId } = require('../src/helpers');
const { isDate } = require('../lib/utils');
const { parseCfg } = require('../src/shared');

const LANGS = { ar: 'العربية', en: 'الإنجليزية' };
const DEFAULT_TEMPLATES = [
  ['خطاب إثبات التوظيف', 'ar', 'إلى من يهمه الأمر،\n\nنفيدكم بأن السيد/ة {{name}} يعمل لدى {{company}} بوظيفة {{job_title}} بقسم {{department}} منذ تاريخ {{hire_date}}، ولا يزال على رأس عمله حتى تاريخه.\n\nوقد أُعطي هذا الخطاب بناءً على طلبه لتقديمه إلى {{destination}} دون أدنى مسؤولية على الشركة.\n\nتحريرًا في {{date}}'],
  ['شهادة خبرة', 'ar', 'شهادة خبرة\n\nتشهد {{company}} بأن السيد/ة {{name}} عمل لديها بوظيفة {{job_title}} بقسم {{department}} منذ {{hire_date}}، وقد كان مثالًا في الالتزام والكفاءة.\n\nأُعطيت له هذه الشهادة بناءً على طلبه، ونتمنى له التوفيق.\n\n{{date}}'],
  ['خطاب ترحيب بالموظف الجديد', 'ar', 'عزيزي/عزيزتي {{name}}،\n\nيسعدنا انضمامك إلى {{company}} بوظيفة {{job_title}} بقسم {{department}} اعتبارًا من {{hire_date}}. نتمنى لك مسيرة مهنية ناجحة معنا.\n\nمع أطيب التحيات،\nإدارة الموارد البشرية'],
  ['خطاب إنذار', 'ar', 'السيد/ة {{name}} ({{job_title}})،\n\nنلفت انتباهكم إلى مخالفتكم لقواعد العمل في {{company}}، وعليه نوجّه لكم هذا الإنذار، ونؤكد أن تكرار المخالفة يعرّضكم لإجراءات أشد وفق لوائح الشركة.\n\nتحريرًا في {{date}}'],
  ['Proof of Employment Letter', 'en', 'To whom it may concern,\n\nThis is to certify that {{name}} has been employed at {{company}} as {{job_title}} in the {{department}} department since {{hire_date}} and is still in service as of the date of this letter.\n\nThis letter is issued upon the employee\'s request to be presented to {{destination}}.\n\n{{date}}'],
];
async function seedTemplates() {
  if (await db.get("SELECT 1 FROM settings WHERE key='doc_templates_seeded'")) return;
  if (!(await db.get("SELECT 1 FROM config_items WHERE kind='doc_template'")))
    for (const [name, language, body] of DEFAULT_TEMPLATES) await db.run("INSERT INTO config_items(kind,name,data,active) VALUES('doc_template',?,?,1)", name, JSON.stringify({ language, body }));
  await db.run("INSERT INTO settings(key,value) VALUES('doc_templates_seeded','1') ON CONFLICT(key) DO NOTHING");
}
const fill = (body, vars) => String(body || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in vars ? String(vars[k] ?? '') : m));

module.exports = function register(app) {
const isMgr = (u) => can(u, 'employees.view'), canManage = (u) => can(u, 'employees.manage');
const deny = (res) => res.status(403).json({ error: 'ليس لديك صلاحية لهذا الإجراء' });

async function issueLetter({ user, tpl, language, destination, date, by, requestId }) {
  const st = await settings();
  const vars = { name: user.name, job_title: user.job_title || '—', department: user.department || '—', hire_date: user.hire_date, company: st.company_name || '', destination: destination || '—', date, employee_code: user.employee_code || '' };
  const body = fill(tpl.body, vars);
  return db.insert('INSERT INTO doc_letters(user_id,template_id,template_name,language,destination,body,issued_on,issued_by,issued_by_name,request_id) VALUES(?,?,?,?,?,?,?,?,?,?)',
    user.id, tpl.id || null, tpl.name, language || tpl.language || 'ar', String(destination || '').slice(0, 200), body, date, by.id, by.name, requestId || null);
}
const tplOf = async (id) => { const r = id && await db.get("SELECT * FROM config_items WHERE id=? AND kind='doc_template'", id); return r ? parseCfg(r) : null; };

/* ---- طلبات المستندات ---- */
app.get('/api/doc-requests', auth, wrap(async (req, res) => {
  await seedTemplates();
  const w = [], args = [], q = req.query;
  if (!isMgr(req.user)) { w.push('r.user_id=?'); args.push(req.user.id); }
  if (['pending', 'approved', 'rejected'].includes(q.status)) { w.push('r.status=?'); args.push(q.status); }
  if (toId(q.user_id)) { w.push('r.user_id=?'); args.push(toId(q.user_id)); }
  if (LANGS[q.language]) { w.push('r.language=?'); args.push(q.language); }
  if (q.q) { w.push('(u.name ILIKE ? OR r.type_name ILIKE ?)'); const s = `%${String(q.q).slice(0, 60)}%`; args.push(s, s); }
  const rows = await db.all(`SELECT r.*, u.name AS user_name FROM doc_requests r JOIN users u ON u.id=r.user_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY r.id DESC LIMIT 1000`, ...args);
  const [employees, templates] = await Promise.all([
    isMgr(req.user) ? db.all('SELECT id,name FROM users WHERE active=1 AND is_admin=0 AND pending=0 ORDER BY name') : [],
    db.all("SELECT * FROM config_items WHERE kind='doc_template' AND active=1 ORDER BY id").then((l) => l.map(parseCfg).map((t) => ({ id: t.id, name: t.name, language: t.language }))),
  ]);
  res.json({ rows, employees, templates, can_manage: canManage(req.user) });
}));
app.post('/api/doc-requests', auth, wrap(async (req, res) => {
  const b = req.body || {}, tpl = await tplOf(toId(b.template_id));
  if (!tpl || !tpl.active) return res.status(400).json({ error: 'اختاري نوع المستند' });
  let uid = req.user.id;
  if (toId(b.user_id) && toId(b.user_id) !== req.user.id) { if (!canManage(req.user)) return deny(res); uid = toId(b.user_id); }
  const u = await db.get('SELECT * FROM users WHERE id=? AND active=1', uid);
  if (!u) return res.status(400).json({ error: 'الموظف غير موجود' });
  const id = await db.insert('INSERT INTO doc_requests(user_id,template_id,type_name,language,destination,note) VALUES(?,?,?,?,?,?)', u.id, tpl.id, tpl.name, tpl.language || 'ar', String(b.destination || '').slice(0, 200), String(b.note || '').slice(0, 300));
  const { notifyManagers } = require('../src/helpers');
  await notifyManagers(`طلب مستند جديد (${tpl.name}) من ${u.name}`, req.user.id, 'employees.manage');
  res.json({ ok: true, id });
}));
app.post('/api/doc-requests/:id/decide', auth, need('employees.manage'), wrap(async (req, res) => {
  const id = toId(req.params.id), r = id && await db.get('SELECT * FROM doc_requests WHERE id=?', id), d = (req.body || {}).decision;
  if (!r) return res.status(404).json({ error: 'الطلب غير موجود' });
  if (r.status !== 'pending') return res.status(400).json({ error: 'الطلب اتبتّ فيه قبل كده' });
  if (!['approved', 'rejected'].includes(d)) return res.status(400).json({ error: 'قرار غير صالح' });
  let letterId = null;
  if (d === 'approved') {
    const tpl = await tplOf(r.template_id), user = await db.get('SELECT * FROM users WHERE id=?', r.user_id);
    if (!tpl) return res.status(400).json({ error: 'القالب اتحذف، ارفضي الطلب أو أعيدي إنشاء القالب' });
    letterId = await issueLetter({ user, tpl, language: r.language, destination: r.destination, date: tzParts().date, by: req.user, requestId: r.id });
  }
  await db.run('UPDATE doc_requests SET status=?, decided_by=?, decided_at=?, letter_id=? WHERE id=?', d, req.user.id, new Date().toISOString(), letterId, r.id);
  await notify(r.user_id, d === 'approved' ? `تم إصدار مستند (${r.type_name}) الخاص بك` : `تم رفض طلب المستند (${r.type_name})`);
  res.json({ ok: true, letter_id: letterId });
}));

/* ---- الخطابات الصادرة ---- */
app.get('/api/doc-letters', auth, wrap(async (req, res) => {
  await seedTemplates();
  const w = [], args = [], q = req.query;
  if (!isMgr(req.user)) { w.push('l.user_id=?'); args.push(req.user.id); }
  if (toId(q.user_id)) { w.push('l.user_id=?'); args.push(toId(q.user_id)); }
  if (LANGS[q.language]) { w.push('l.language=?'); args.push(q.language); }
  if (toId(q.template_id)) { w.push('l.template_id=?'); args.push(toId(q.template_id)); }
  if (isDate(q.date)) { w.push('l.issued_on=?'); args.push(q.date); }
  if (q.q) { w.push('(u.name ILIKE ? OR l.template_name ILIKE ? OR l.destination ILIKE ?)'); const s = `%${String(q.q).slice(0, 60)}%`; args.push(s, s, s); }
  const rows = await db.all(`SELECT l.id,l.user_id,l.template_id,l.template_name,l.language,l.destination,l.issued_on,l.issued_by,l.issued_by_name,u.name AS user_name FROM doc_letters l JOIN users u ON u.id=l.user_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY l.id DESC LIMIT 1000`, ...args);
  res.json({
    rows, can_manage: canManage(req.user),
    employees: isMgr(req.user) ? await db.all('SELECT id,name FROM users WHERE active=1 AND is_admin=0 AND pending=0 ORDER BY name') : [],
    templates: (await db.all("SELECT * FROM config_items WHERE kind='doc_template' AND active=1 ORDER BY id")).map(parseCfg).map((t) => ({ id: t.id, name: t.name, language: t.language })),
  });
}));
app.get('/api/doc-letters/:id', auth, wrap(async (req, res) => {
  const l = await db.get('SELECT l.*, u.name AS user_name FROM doc_letters l JOIN users u ON u.id=l.user_id WHERE l.id=?', toId(req.params.id));
  if (!l || (l.user_id !== req.user.id && !isMgr(req.user))) return res.status(404).json({ error: 'الخطاب غير موجود' });
  res.json(l);
}));
app.post('/api/doc-letters', auth, need('employees.manage'), wrap(async (req, res) => {
  const b = req.body || {}, tpl = await tplOf(toId(b.template_id)), u = toId(b.user_id) && await db.get('SELECT * FROM users WHERE id=? AND is_admin=0', toId(b.user_id));
  if (!u) return res.status(400).json({ error: 'اختاري الموظف' });
  if (!tpl) return res.status(400).json({ error: 'اختاري القالب' });
  const id = await issueLetter({ user: u, tpl, language: tpl.language, destination: b.destination, date: isDate(b.date) ? b.date : tzParts().date, by: req.user });
  await notify(u.id, `تم إصدار خطاب (${tpl.name}) لك`);
  res.json({ ok: true, id });
}));
app.delete('/api/doc-letters/:id', auth, need('employees.manage'), wrap(async (req, res) => {
  await db.run('DELETE FROM doc_letters WHERE id=?', toId(req.params.id));
  res.json({ ok: true });
}));
};
