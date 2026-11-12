'use strict';
/* routes/config.js — قوائم الإعدادات العامة /config/:kind (سياسات، مواعيد، عطلات، ملفات إجازة...) */
const { eachDay, isDate } = require('../lib/utils');
const { can, toId } = require('../src/helpers');
const { parseCfg, truthy } = require('../src/shared');
const { auth, wrap } = require('../src/middleware');
const { db } = require('../src/db');
const { invalidatePolicyCtx } = require('../src/payroll-engine');


/* ----- كتالوجات الإعدادات (جداول بسيطة: اسم + بيانات + نشط) ----- */
const CONFIG_KINDS = new Set(['schedule', 'department', 'grade', 'position', 'access_level', 'custom_field', 'announcement',
  'leave_profile', 'leave_type', 'holiday', 'compensation_rule', 'holiday_limit', 'payroll_preset', 'allowance', 'deduction',
  'expense_category', 'payroll_lieu', 'payslip_display', 'document', 'automation_rule', 'override_rule',
  'penalty_policy', 'overtime_policy', 'leave_template',
  'work_group', 'team', 'emp_procedure', 'emp_doc', 'transfer', 'title_change', 'pending_suspension', 'filter_template']);
const HR_KINDS = new Set(['work_group', 'team', 'emp_procedure', 'emp_doc', 'transfer', 'title_change', 'pending_suspension', 'filter_template']);
const cfgAuth = (req, res, next) => {
  const ok = HR_KINDS.has(req.params.kind) ? can(req.user, req.method === 'GET' ? 'employees.view' : 'employees.manage') : can(req.user, 'settings.manage');
  return ok ? next() : res.status(403).json({ error: 'ليس لديك صلاحية لهذا الإجراء' });
};
const cfgKind = (req, res, next) => (CONFIG_KINDS.has(req.params.kind) ? next() : res.status(404).json({ error: 'نوع غير معروف' }));
// تنظيف قيمة JSON جاية من العميل (نصوص قصيرة، أرقام سليمة، قوائم وكائنات بعمق محدود) — بتسمح بالشرائح والإصدارات والأنواع المتداخلة
const cleanJson = (v, depth = 0) => {
  if (typeof v === 'string') return v.slice(0, 500);
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean' || v === null) return v;
  if (depth >= 5) return null;
  if (Array.isArray(v)) return v.slice(0, 60).map((x) => cleanJson(x, depth + 1));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).slice(0, 60).map(([k, x]) => [String(k).slice(0, 40), cleanJson(x, depth + 1)]));
  return String(v ?? '').slice(0, 500);
};
const nz = (v, d = 0) => { const x = Number(v); return Number.isFinite(x) ? x : d; };
// توحيد أنواع بيانات سياسات الحضور + التحقق منها (بترجّع رسالة خطأ أو null)
function cfgPolicy(kind, d) {
  if (kind === 'penalty_policy') {
    d.grace = Math.round(nz(d.grace, 0)); d.early_grace = Math.round(nz(d.early_grace, 0));
    for (const k of ['late_on', 'early_on', 'partial_on', 'archived']) d[k] = truthy(d[k]);
    d.absence_factor = nz(d.absence_factor, 1); d.early_factor = nz(d.early_factor, 1);
    d.late_method = d.late_method === 'periods' ? 'periods' : 'minutes';
    d.partial_kind = d.partial_kind === 'fixed' ? 'fixed' : 'day_fraction'; d.partial_value = nz(d.partial_value, 0);
    d.deduct_from = 'salary';
    d.tiers = (Array.isArray(d.tiers) ? d.tiers : []).map((t) => ({
      from: Math.round(nz(t && t.from, 0)),
      to: t && (t.to === '' || t.to === null || t.to === undefined) ? null : Math.round(nz(t && t.to, NaN)),
      kind: String((t && t.kind) || ''), value: nz(t && t.value, 0),
    }));
    if (d.grace < 0 || d.grace > 240) return 'سماحية التأخير بين 0 و 240 دقيقة';
    if (d.early_grace < 0 || d.early_grace > 240) return 'سماحية الانصراف المبكر بين 0 و 240 دقيقة';
    if (d.absence_factor < 0 || d.absence_factor > 10) return 'معامل خصم الغياب بين 0 و 10';
    if (d.early_factor < 0 || d.early_factor > 10) return 'معامل خصم الانصراف المبكر بين 0 و 10';
    if (d.partial_on && !(d.partial_value > 0 && d.partial_value <= (d.partial_kind === 'fixed' ? 1000000 : 10))) return 'قيمة خصم الانصراف الناقص غير صحيحة';
    if (d.tiers.length > 20) return 'حد أقصى 20 شريحة';
    if (d.late_on) {
      if (!d.tiers.length) return 'أضيفي شريحة تأخير واحدة على الأقل';
      d.tiers.sort((a, b) => a.from - b.from);
      for (let i = 0; i < d.tiers.length; i++) {
        const t = d.tiers[i];
        if (!Number.isInteger(t.from) || t.from < 1) return 'بداية الشريحة لازم تكون رقم صحيح 1 أو أكبر';
        if (t.to !== null && (!Number.isInteger(t.to) || t.to < t.from)) return 'نهاية الشريحة لازم تكون رقم صحيح أكبر من أو يساوي بدايتها';
        if (!['minutes', 'fixed', 'day_fraction'].includes(t.kind) || (d.late_method === 'periods' && t.kind === 'minutes')) return 'نوع الخصم غير صحيح';
        if (!(t.value > 0) || t.value > (t.kind === 'fixed' ? 1000000 : 10)) return 'قيمة الخصم غير صحيحة';
        if (i && (d.tiers[i - 1].to === null || t.from <= d.tiers[i - 1].to)) return 'الشرائح متداخلة. بداية كل شريحة لازم تكون بعد نهاية اللي قبلها، والشريحة المفتوحة (وما فوق) تكون الأخيرة';
      }
    }
  } else if (kind === 'overtime_policy') {
    d.calc_on = truthy(d.calc_on); d.archived = truthy(d.archived);
    d.after_min = Math.round(nz(d.after_min, 0)); d.cap_hours = nz(d.cap_hours, 0); d.factor = nz(d.factor, 1.5);
    d.rounding = ['up', 'down'].includes(d.rounding) ? d.rounding : 'none';
    d.round_unit = [5, 10, 15, 30, 60].includes(Number(d.round_unit)) ? Number(d.round_unit) : 15;
    if (d.after_min < 0 || d.after_min > 600) return 'بداية الاحتساب بين 0 و 600 دقيقة';
    if (d.cap_hours < 0 || d.cap_hours > 24) return 'الحد اليومي بين 0 و 24 ساعة (0 = بدون حد)';
    if (!(d.factor > 0) || d.factor > 10) return 'معامل الوقت الإضافي بين 0.1 و 10';
  } else if (kind === 'holiday') {
    d.archived = truthy(d.archived); d.yearly = truthy(d.yearly);
    if (!isDate(d.date)) return 'اختاري تاريخ بداية العطلة';
    if (d.to === '' || d.to === null || d.to === undefined) d.to = d.date;
    if (!isDate(d.to) || d.to < d.date) return 'تاريخ نهاية العطلة لازم يكون بعد البداية أو نفس اليوم';
    if ([...eachDay(d.date, d.to)].length > 60) return 'العطلة الواحدة حد أقصى 60 يوم';
  } else if (kind === 'compensation_rule') {
    d.archived = truthy(d.archived);
    d.applies = ['holiday', 'weekend', 'both'].includes(d.applies) ? d.applies : 'both';
    d.mode = d.mode === 'time_off' ? 'time_off' : 'pay'; // (مش "kind" عشان parseCfg بيكتب فوق نوع العنصر)
    d.factor = nz(d.factor, 2); d.days = nz(d.days, 1); d.min_hours = nz(d.min_hours, 0);
    if (d.mode === 'pay' && (!(d.factor > 0) || d.factor > 10)) return 'معامل أجر اليوم بين 0.1 و 10';
    if (d.mode === 'time_off' && (!(d.days > 0) || d.days > 5)) return 'أيام التعويض بين 0.5 و 5';
    if (d.min_hours < 0 || d.min_hours > 24) return 'الحد الأدنى لساعات العمل بين 0 و 24';
  } else if (kind === 'holiday_limit') {
    d.archived = truthy(d.archived);
    d.rule = ['max_consecutive', 'max_concurrent', 'blackout'].includes(d.rule) ? d.rule : 'max_consecutive';
    d.scope = d.scope === 'department' ? 'department' : 'all';
    d.types = (Array.isArray(d.types) ? d.types : []).filter((t) => ['annual_leave', 'sick_leave', 'emergency_leave'].includes(t));
    if (!d.types.length) return 'اختاري نوع إجازة واحد على الأقل';
    d.value = Math.round(nz(d.value, 0));
    if (d.rule !== 'blackout' && (d.value < 1 || d.value > 365)) return 'القيمة لازم تكون من 1 إلى 365';
    if (d.rule === 'blackout') {
      if (!isDate(d.from) || !isDate(d.to) || d.to < d.from) return 'حددي فترة المنع (من وإلى)';
    } else { d.from = ''; d.to = ''; }
  } else if (kind === 'leave_profile') {
    d.archived = truthy(d.archived); d.carry = truthy(d.carry); d.break_paid = !(d.break_paid === false || d.break_paid === 'false' || d.break_paid === 0 || d.break_paid === '0');
    d.annual = Math.round(nz(d.annual, 21)); d.sick = Math.round(nz(d.sick, 0)); d.emergency = Math.round(nz(d.emergency, 0)); d.break_min = Math.round(nz(d.break_min, 0));
    if (d.annual < 0 || d.annual > 365) return 'الإجازة السنوية بين 0 و 365 يوم';
    for (const k of ['sick', 'emergency']) if (d[k] < 0 || d[k] > 365) return 'رصيد الإجازة بين 0 و 365 يوم (0 = بدون حد)';
    if (d.break_min < 0 || d.break_min > 240) return 'مدة الاستراحة بين 0 و 240 دقيقة';
  }
  return null;
}
function cfgBody(b, kind) {
  const name = String(b.name || '').trim().slice(0, 120);
  if (!name) return { error: 'اكتبي الاسم' };
  const data = {};
  for (const [k, v] of Object.entries(b)) {
    if (['id', 'kind', 'name', 'active', 'created_at'].includes(k)) continue;
    data[k] = k === 'versions' ? cleanJson(Array.isArray(v) ? v.slice(0, 30) : []) : cleanJson(v);
  }
  const err = cfgPolicy(kind, data);
  if (err) return { error: err };
  if (JSON.stringify(data).length > 60000) return { error: 'البيانات كبيرة جداً' };
  return { name, data: JSON.stringify(data) };
}

module.exports = function register(app) {
app.get('/api/config/:kind', auth, cfgKind, cfgAuth, wrap(async (req, res) => {
  res.json((await db.all('SELECT * FROM config_items WHERE kind=? ORDER BY id', req.params.kind)).map(parseCfg));
}));
app.post('/api/config/:kind', auth, cfgKind, cfgAuth, wrap(async (req, res) => {
  const c = cfgBody(req.body || {}, req.params.kind);
  if (c.error) return res.status(400).json({ error: c.error });
  const active = req.body.active === 0 || req.body.active === false || req.body.active === '0' ? 0 : 1;
  const id = await db.insert('INSERT INTO config_items(kind,name,data,active) VALUES(?,?,?,?)', req.params.kind, c.name, c.data, active);
  invalidatePolicyCtx();
  res.json({ id });
}));
app.put('/api/config/:kind/:id', auth, cfgKind, cfgAuth, wrap(async (req, res) => {
  const id = toId(req.params.id), c = cfgBody(req.body || {}, req.params.kind);
  if (c.error) return res.status(400).json({ error: c.error });
  const act = req.body.active === undefined ? null : (req.body.active === 0 || req.body.active === false || req.body.active === '0' ? 0 : 1);
  const r = id && await db.run('UPDATE config_items SET name=?,data=?,active=COALESCE(?,active) WHERE id=? AND kind=?', c.name, c.data, act, id, req.params.kind);
  if (!r || !r.rowCount) return res.status(404).json({ error: 'غير موجود' });
  invalidatePolicyCtx();
  res.json({ ok: true });
}));
app.delete('/api/config/:kind/:id', auth, cfgKind, cfgAuth, wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (id) await db.run('DELETE FROM config_items WHERE id=? AND kind=?', id, req.params.kind);
  invalidatePolicyCtx();
  res.json({ ok: true });
}));
};
