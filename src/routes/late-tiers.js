'use strict';
/* routes/late-tiers.js — شرائح خصم التأخير */
const { auth, need, wrap } = require('../src/middleware');
const { getTiers } = require('../src/payroll-engine');
const { tx } = require('../src/db');


module.exports = function register(app) {

/* ----- شرائح خصم التأخير ----- */
app.get('/api/late-tiers', auth, need('settings.manage'), wrap(async (req, res) => {
  res.json({ tiers: await getTiers() });
}));
app.put('/api/late-tiers', auth, need('settings.manage'), wrap(async (req, res) => {
  const list = req.body && Array.isArray(req.body.tiers) ? req.body.tiers : null;
  if (!list || list.length > 20) return res.status(400).json({ error: 'بيانات الشرائح غير صحيحة (حد أقصى 20 شريحة)' });
  const tiers = [];
  for (const t of list) {
    const from = Number(t.from_minutes);
    const to = t.to_minutes === '' || t.to_minutes === null || t.to_minutes === undefined ? null : Number(t.to_minutes);
    const value = Number(t.value);
    if (!Number.isInteger(from) || from < 1) return res.status(400).json({ error: 'بداية الشريحة لازم تكون رقم صحيح 1 أو أكبر' });
    if (to !== null && (!Number.isInteger(to) || to < from)) return res.status(400).json({ error: 'نهاية الشريحة لازم تكون رقم صحيح أكبر من أو يساوي بدايتها' });
    if (!['fixed', 'day_fraction'].includes(t.kind)) return res.status(400).json({ error: 'نوع الخصم غير صحيح' });
    if (!(value > 0) || value > 1000000 || (t.kind === 'day_fraction' && value > 10)) return res.status(400).json({ error: 'قيمة الخصم غير صحيحة' });
    tiers.push({ from, to, kind: t.kind, value });
  }
  tiers.sort((a, b) => a.from - b.from);
  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i - 1].to === null || tiers[i].from <= tiers[i - 1].to) {
      return res.status(400).json({ error: 'الشرائح متداخلة. بداية كل شريحة لازم تكون بعد نهاية اللي قبلها، والشريحة المفتوحة (وما فوق) تكون الأخيرة' });
    }
  }
  await tx(async (q) => {
    await q.run('DELETE FROM late_tiers');
    for (const t of tiers) await q.run('INSERT INTO late_tiers(from_minutes,to_minutes,kind,value) VALUES(?,?,?,?)', t.from, t.to, t.kind, t.value);
  });
  res.json({ ok: true, tiers: await getTiers() });
}));
};
