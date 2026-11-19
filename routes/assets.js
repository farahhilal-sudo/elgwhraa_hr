'use strict';
/* routes/assets.js — إدارة الأصول: الأصول، طلبات الأصول، الخردة، السجل. (الأنواع وأماكن التخزين = config_items: asset_type / asset_location) */
const { auth, need, wrap } = require('../src/middleware');
const { db } = require('../src/db');
const { can, notify, notifyManagers, toId } = require('../src/helpers');
const { parseCfg } = require('../src/shared');

const jarr = (t) => { try { const a = JSON.parse(t || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
module.exports = function register(app) {
const isMgr = (u) => can(u, 'employees.view');
const log = (a, action, by, { user, note } = {}) => db.run('INSERT INTO asset_log(asset_id,asset_name,action,user_id,user_name,by_name,note) VALUES(?,?,?,?,?,?,?)', a.id, a.name, action, user ? user.id : null, user ? user.name : '', by ? by.name : '', note || '');
// حالة الأصل: مسلّم كام وحدة، ومتاح كام
const decorate = (a) => { const as = jarr(a.assigned), out = as.reduce((t, x) => t + (Number(x.units) || 1), 0); return { ...a, serials: jarr(a.serials), assigned: as, assigned_units: out, available_units: Math.max(0, a.units - out) }; };

app.get('/api/assets', auth, need('employees.view'), wrap(async (req, res) => {
  const q = req.query, w = [`a.status=?`], args = [q.scrapped === '1' ? 'scrapped' : 'active'];
  if (q.q) { w.push('(a.name ILIKE ? OR a.brand ILIKE ? OR a.model ILIKE ? OR a.serials ILIKE ?)'); const s = `%${String(q.q).slice(0, 60)}%`; args.push(s, s, s, s); }
  let rows = (await db.all(`SELECT a.* FROM assets a WHERE ${w.join(' AND ')} ORDER BY a.id DESC LIMIT 1000`, ...args)).map(decorate);
  if (q.avail === '1') rows = rows.filter((a) => a.available_units > 0); else if (q.avail === '0') rows = rows.filter((a) => a.available_units === 0);
  const [types, locations, employees] = await Promise.all([
    db.all("SELECT id,name FROM config_items WHERE kind='asset_type' AND active=1 ORDER BY name"), db.all("SELECT id,name FROM config_items WHERE kind='asset_location' AND active=1 ORDER BY name"),
    db.all('SELECT id,name FROM users WHERE active=1 AND is_admin=0 AND pending=0 ORDER BY name'),
  ]);
  res.json({ rows, types, locations, employees, can_manage: can(req.user, 'employees.manage') });
}));
const body = (b) => {
  const name = String(b.name || '').trim().slice(0, 150); if (!name) return { error: 'اكتبي اسم الأصل' };
  const serialized = b.serialized === false || b.serialized === 0 || b.serialized === '0' ? 0 : 1;
  let serials = serialized ? [...new Set(String(Array.isArray(b.serials) ? b.serials.join('\n') : b.serials || '').split(/[\n,،;]+/).map((s) => s.trim()).filter(Boolean))].slice(0, 2000) : [];
  let units = Math.floor(Number(b.units));
  if (serialized && serials.length) units = serials.length; // الأرقام التسلسلية هي اللي بتحدد العدد
  if (!(units >= 1) || units > 100000) return { error: 'اكتبي عدد الوحدات (1 أو أكتر)' };
  return { name, type_name: String(b.type_name || '').slice(0, 100), brand: String(b.brand || '').slice(0, 100), model: String(b.model || '').slice(0, 100), units, serialized, location: String(b.location || '').slice(0, 120), serials: JSON.stringify(serials) };
};
app.post('/api/assets', auth, need('employees.manage'), wrap(async (req, res) => {
  const p = body(req.body || {}); if (p.error) return res.status(400).json({ error: p.error });
  const id = await db.insert('INSERT INTO assets(name,type_name,brand,model,units,serialized,location,serials,created_by) VALUES(?,?,?,?,?,?,?,?,?)', p.name, p.type_name, p.brand, p.model, p.units, p.serialized, p.location, p.serials, req.user.id);
  await log({ id, name: p.name }, 'add', req.user, { note: `${p.units} وحدة` });
  res.json({ ok: true, id });
}));
app.put('/api/assets/:id', auth, need('employees.manage'), wrap(async (req, res) => {
  const id = toId(req.params.id), a = id && await db.get('SELECT * FROM assets WHERE id=?', id);
  if (!a) return res.status(404).json({ error: 'الأصل غير موجود' });
  const p = body({ ...a, serials: jarr(a.serials), ...(req.body || {}) }); if (p.error) return res.status(400).json({ error: p.error });
  const out = jarr(a.assigned).reduce((t, x) => t + (Number(x.units) || 1), 0);
  if (p.units < out) return res.status(400).json({ error: `فيه ${out} وحدة مسلّمة، مينفعش العدد يبقى أقل منها` });
  await db.run('UPDATE assets SET name=?,type_name=?,brand=?,model=?,units=?,serialized=?,location=?,serials=? WHERE id=?', p.name, p.type_name, p.brand, p.model, p.units, p.serialized, p.location, p.serials, id);
  await log(a, 'edit', req.user);
  res.json({ ok: true });
}));
app.delete('/api/assets/:id', auth, need('employees.manage'), wrap(async (req, res) => {
  const id = toId(req.params.id), a = id && await db.get('SELECT * FROM assets WHERE id=?', id);
  if (!a) return res.status(404).json({ error: 'الأصل غير موجود' });
  if (jarr(a.assigned).length) return res.status(409).json({ error: 'الأصل مسلّم لموظفين، استرجعيه الأول' });
  await db.run('DELETE FROM assets WHERE id=?', id);
  await log(a, 'delete', req.user);
  res.json({ ok: true });
}));
// تسليم / استرجاع / تحويل لخردة
app.post('/api/assets/:id/assign', auth, need('employees.manage'), wrap(async (req, res) => {
  const id = toId(req.params.id), a = id && await db.get("SELECT * FROM assets WHERE id=? AND status='active'", id), uid = toId((req.body || {}).user_id);
  const u = uid && await db.get('SELECT id,name FROM users WHERE id=? AND active=1 AND is_admin=0', uid), units = Math.max(1, Math.floor(Number((req.body || {}).units) || 1));
  if (!a || !u) return res.status(400).json({ error: 'بيانات غير صحيحة' });
  const d = decorate(a); if (units > d.available_units) return res.status(400).json({ error: `المتاح ${d.available_units} وحدة بس` });
  const as = [...d.assigned]; const ex = as.find((x) => x.user_id === u.id);
  if (ex) ex.units = (Number(ex.units) || 1) + units; else as.push({ user_id: u.id, name: u.name, units, at: new Date().toISOString() });
  await db.run('UPDATE assets SET assigned=? WHERE id=?', JSON.stringify(as), a.id);
  await log(a, 'assign', req.user, { user: u, note: `${units} وحدة` }); await notify(u.id, `تم تسليمك أصل: ${a.name}`);
  res.json({ ok: true });
}));
app.post('/api/assets/:id/return', auth, need('employees.manage'), wrap(async (req, res) => {
  const id = toId(req.params.id), a = id && await db.get('SELECT * FROM assets WHERE id=?', id), uid = toId((req.body || {}).user_id);
  if (!a) return res.status(404).json({ error: 'الأصل غير موجود' });
  const as = jarr(a.assigned), ex = as.find((x) => x.user_id === uid);
  if (!ex) return res.status(400).json({ error: 'الأصل مش مسلّم للموظف ده' });
  await db.run('UPDATE assets SET assigned=? WHERE id=?', JSON.stringify(as.filter((x) => x !== ex)), a.id);
  await log(a, 'return', req.user, { user: { id: uid, name: ex.name } });
  res.json({ ok: true });
}));
app.post('/api/assets/:id/scrap', auth, need('employees.manage'), wrap(async (req, res) => {
  const id = toId(req.params.id), a = id && await db.get("SELECT * FROM assets WHERE id=? AND status='active'", id);
  if (!a) return res.status(404).json({ error: 'الأصل غير موجود' });
  if (jarr(a.assigned).length) return res.status(409).json({ error: 'الأصل مسلّم لموظفين، استرجعيه الأول' });
  await db.run("UPDATE assets SET status='scrapped', scrapped_at=?, scrap_reason=? WHERE id=?", new Date().toISOString(), String((req.body || {}).reason || '').slice(0, 300), a.id);
  await log(a, 'scrap', req.user, { note: String((req.body || {}).reason || '').slice(0, 300) });
  res.json({ ok: true });
}));
app.post('/api/assets/:id/restore', auth, need('employees.manage'), wrap(async (req, res) => {
  const id = toId(req.params.id), a = id && await db.get("SELECT * FROM assets WHERE id=? AND status='scrapped'", id);
  if (!a) return res.status(404).json({ error: 'الأصل غير موجود' });
  await db.run("UPDATE assets SET status='active', scrapped_at=NULL, scrap_reason='' WHERE id=?", a.id); await log(a, 'restore', req.user);
  res.json({ ok: true });
}));
app.get('/api/assets-log', auth, need('employees.view'), wrap(async (req, res) => {
  const w = [], args = [];
  if (req.query.q) { w.push('(asset_name ILIKE ? OR user_name ILIKE ? OR by_name ILIKE ?)'); const s = `%${String(req.query.q).slice(0, 60)}%`; args.push(s, s, s); }
  if (req.query.action) { w.push('action=?'); args.push(String(req.query.action)); }
  res.json({ rows: await db.all(`SELECT * FROM asset_log ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY id DESC LIMIT 1000`, ...args) });
}));

/* ---- طلبات الأصول ---- */
app.get('/api/asset-requests', auth, wrap(async (req, res) => {
  const w = [], args = [], q = req.query;
  if (!isMgr(req.user)) { w.push('r.user_id=?'); args.push(req.user.id); }
  if (['pending', 'approved', 'rejected'].includes(q.status)) { w.push('r.status=?'); args.push(q.status); }
  if (q.q) { w.push('(u.name ILIKE ? OR r.type_name ILIKE ?)'); const s = `%${String(q.q).slice(0, 60)}%`; args.push(s, s); }
  const rows = await db.all(`SELECT r.*, u.name AS user_name FROM asset_requests r JOIN users u ON u.id=r.user_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY r.id DESC LIMIT 1000`, ...args);
  res.json({ rows, can_manage: can(req.user, 'employees.manage'),
    types: await db.all("SELECT id,name FROM config_items WHERE kind='asset_type' AND active=1 ORDER BY name"),
    employees: isMgr(req.user) ? await db.all('SELECT id,name FROM users WHERE active=1 AND is_admin=0 AND pending=0 ORDER BY name') : [],
    assets: can(req.user, 'employees.manage') ? (await db.all("SELECT * FROM assets WHERE status='active' ORDER BY name")).map(decorate).filter((a) => a.available_units > 0).map((a) => ({ id: a.id, name: a.name, type_name: a.type_name, available_units: a.available_units })) : [] });
}));
app.post('/api/asset-requests', auth, wrap(async (req, res) => {
  const b = req.body || {}, type = String(b.type_name || '').trim().slice(0, 100);
  if (!type) return res.status(400).json({ error: 'اختاري نوع الأصل' });
  let uid = req.user.id;
  if (toId(b.user_id) && toId(b.user_id) !== req.user.id) { if (!can(req.user, 'employees.manage')) return res.status(403).json({ error: 'ليس لديك صلاحية لهذا الإجراء' }); uid = toId(b.user_id); }
  const u = await db.get('SELECT id,name FROM users WHERE id=? AND active=1', uid);
  if (!u) return res.status(400).json({ error: 'الموظف غير موجود' });
  const id = await db.insert('INSERT INTO asset_requests(user_id,type_name,note) VALUES(?,?,?)', u.id, type, String(b.note || '').slice(0, 300));
  await notifyManagers(`طلب أصل جديد (${type}) من ${u.name}`, req.user.id, 'employees.manage');
  res.json({ ok: true, id });
}));
app.post('/api/asset-requests/:id/decide', auth, need('employees.manage'), wrap(async (req, res) => {
  const id = toId(req.params.id), r = id && await db.get('SELECT * FROM asset_requests WHERE id=?', id), b = req.body || {};
  if (!r) return res.status(404).json({ error: 'الطلب غير موجود' });
  if (r.status !== 'pending') return res.status(400).json({ error: 'الطلب اتبتّ فيه قبل كده' });
  if (!['approved', 'rejected'].includes(b.decision)) return res.status(400).json({ error: 'قرار غير صالح' });
  let assetId = null;
  if (b.decision === 'approved') {
    const a = toId(b.asset_id) && await db.get("SELECT * FROM assets WHERE id=? AND status='active'", toId(b.asset_id));
    if (!a) return res.status(400).json({ error: 'اختاري الأصل اللي هيتسلّم' });
    const d = decorate(a); if (d.available_units < 1) return res.status(400).json({ error: 'الأصل ده مفيش منه وحدات متاحة' });
    const u = await db.get('SELECT id,name FROM users WHERE id=?', r.user_id), as = [...d.assigned], ex = as.find((x) => x.user_id === u.id);
    if (ex) ex.units = (Number(ex.units) || 1) + 1; else as.push({ user_id: u.id, name: u.name, units: 1, at: new Date().toISOString() });
    await db.run('UPDATE assets SET assigned=? WHERE id=?', JSON.stringify(as), a.id); await log(a, 'assign', req.user, { user: u, note: 'من طلب أصل' }); assetId = a.id;
  }
  await db.run('UPDATE asset_requests SET status=?, decided_by=?, decided_at=?, asset_id=? WHERE id=?', b.decision, req.user.id, new Date().toISOString(), assetId, r.id);
  await notify(r.user_id, b.decision === 'approved' ? `تمت الموافقة على طلب الأصل (${r.type_name})` : `تم رفض طلب الأصل (${r.type_name})`);
  res.json({ ok: true });
}));
};
