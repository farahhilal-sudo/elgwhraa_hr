'use strict';
/* routes/avatars.js — صورة البروفايل: أول بصمة بتتحفظ تلقائي، وتتغيّر يدوي من الموظف نفسه أو من مدير الموارد */
const { auth, wrap } = require('../src/middleware');
const { can, outranks, parsePhoto, toId } = require('../src/helpers');
const { db } = require('../src/db');

module.exports = function register(app) {
const canSee = (me, uid) => me.id === uid || can(me, 'employees.view') || can(me, 'attendance.view_all');
const canSet = async (me, uid) => {
  if (me.id === uid) return true;
  if (!can(me, 'employees.manage')) return false;
  const t = await db.get('SELECT * FROM users WHERE id=?', uid);
  return !!t && (!t.is_admin || !!me.is_admin) && outranks(me, t);
};

app.get('/api/users/:id/avatar', auth, wrap(async (req, res) => {
  const uid = toId(req.params.id);
  if (!uid || !canSee(req.user, uid)) return res.status(404).end();
  const r = await db.get('SELECT photo, updated_at FROM user_avatars WHERE user_id=?', uid);
  if (!r) return res.status(404).end();
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-cache', ETag: `"${uid}-${r.updated_at}"` });
  res.send(r.photo);
}));
app.post('/api/users/:id/avatar', auth, wrap(async (req, res) => {
  const uid = toId(req.params.id);
  if (!uid || !(await canSet(req.user, uid))) return res.status(403).json({ error: 'غير مسموح' });
  const buf = parsePhoto((req.body || {}).photo);
  if (!buf) return res.status(400).json({ error: 'الصورة غير صالحة' });
  await db.run(`INSERT INTO user_avatars(user_id,photo,auto,updated_at) VALUES(?,?,0,to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'))
    ON CONFLICT(user_id) DO UPDATE SET photo=EXCLUDED.photo, auto=0, updated_at=EXCLUDED.updated_at`, uid, buf);
  res.json({ ok: true });
}));
app.delete('/api/users/:id/avatar', auth, wrap(async (req, res) => {
  const uid = toId(req.params.id);
  if (!uid || !(await canSet(req.user, uid))) return res.status(403).json({ error: 'غير مسموح' });
  await db.run('DELETE FROM user_avatars WHERE user_id=?', uid);
  res.json({ ok: true });
}));
};
