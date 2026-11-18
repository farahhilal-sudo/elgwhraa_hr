'use strict';
/* routes/locations.js — مواقع العمل (GPS) */
const { can, toId } = require('../src/helpers');
const { auth, need, wrap } = require('../src/middleware');
const { db } = require('../src/db');


/* ----- مواقع العمل ----- */
const needLocAccess = (req, res, next) => (can(req.user, 'settings.manage') || can(req.user, 'employees.manage') ? next() : res.status(403).json({ error: 'ليس لديك صلاحية لهذا الإجراء' }));
function parseLoc(b) {
  const name = String(b.name || '').trim().slice(0, 60), lat = Number(b.lat), lng = Number(b.lng), radius = parseInt(b.radius_m, 10);
  if (!name) return { error: 'اكتبي اسم الموقع' };
  if (!(b.lat !== '' && b.lng !== '' && isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return { error: 'إحداثيات غير صحيحة' };
  if (!(radius >= 20 && radius <= 5000)) return { error: 'النطاق من 20 إلى 5000 متر' };
  return { name, lat, lng, radius };
}

module.exports = function register(app) {
app.get('/api/locations', auth, needLocAccess, wrap(async (req, res) => {
  res.json(await db.all('SELECT * FROM work_locations ORDER BY id'));
}));
app.post('/api/locations', auth, need('settings.manage'), wrap(async (req, res) => {
  const l = parseLoc(req.body || {});
  if (l.error) return res.status(400).json({ error: l.error });
  res.json({ id: await db.insert('INSERT INTO work_locations(name,lat,lng,radius_m,active) VALUES(?,?,?,?,?)', l.name, l.lat, l.lng, l.radius, req.body.active === 0 || req.body.active === '0' ? 0 : 1) });
}));
app.put('/api/locations/:id', auth, need('settings.manage'), wrap(async (req, res) => {
  const id = toId(req.params.id), l = parseLoc(req.body || {});
  if (l.error) return res.status(400).json({ error: l.error });
  const act = req.body.active === undefined ? null : (req.body.active === 0 || req.body.active === '0' || req.body.active === false ? 0 : 1);
  const r = id && await db.run('UPDATE work_locations SET name=?,lat=?,lng=?,radius_m=?,active=COALESCE(?,active) WHERE id=?', l.name, l.lat, l.lng, l.radius, act, id);
  if (!r || !r.rowCount) return res.status(404).json({ error: 'غير موجود' });
  res.json({ ok: true });
}));
app.delete('/api/locations/:id', auth, need('settings.manage'), wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (id) await db.run('DELETE FROM work_locations WHERE id=?', id);
  res.json({ ok: true });
}));
};
