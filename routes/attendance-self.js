'use strict';
/* routes/attendance-self.js — تسجيل الحضور والانصراف من الموظف وصور الحضور وسجلي */
const { haversine, isLatLng, isMonth, monthRange, toMin } = require('../lib/utils');
const { auth, wrap } = require('../src/middleware');
const { settings, tzParts } = require('../src/bootstrap');
const { allowedLocations, can, faceDistance, parsePhoto, toId, validDescriptor } = require('../src/helpers');
const { db } = require('../src/db');
const { getPolicyCtx, graceOf } = require('../src/payroll-engine');


module.exports = function register(app) {

/* ----- تسجيل الحضور والانصراف ----- */
app.post('/api/attendance/punch', auth, wrap(async (req, res) => {
  const { type, lat, lng, descriptor, photo } = req.body || {};
  if (!['in', 'out'].includes(type)) return res.status(400).json({ error: 'نوع غير صالح' });
  const u = req.user, st = await settings();
  // البصمة للموظفين فقط: حساب المدير مش بيسجّل حضور ولا انصراف
  if (u.is_admin) return res.status(403).json({ error: 'حسابات المديرين لا تسجّل حضور وانصراف' });
  if (!u.face_descriptor) return res.status(403).json({ error: 'سجّلي بصمة الوجه أولاً' });
  if (!validDescriptor(descriptor)) return res.status(400).json({ error: 'لم يتم التقاط الوجه' });
  const photoBuf = parsePhoto(photo);
  if (!photoBuf) return res.status(400).json({ error: 'لم يتم التقاط الصورة، حاولي مرة أخرى' });
  const score = faceDistance(descriptor, JSON.parse(u.face_descriptor));
  if (score > parseFloat(st.face_threshold)) return res.status(403).json({ error: 'الوجه غير مطابق، حاولي مرة أخرى في إضاءة أفضل' });
  // الموقع إجباري لو فيه مواقع معرّفة: لازم يكون الموظف داخل نطاق واحد من مواقعه المسموحة
  let where = null;
  const locs = await allowedLocations(u);
  if (locs.length) {
    if (!isLatLng(lat, lng)) return res.status(400).json({ error: 'فعّلي خدمة الموقع (GPS)' });
    const scored = locs.map((l) => ({ l, d: haversine(lat, lng, l.lat, l.lng) })).sort((a, b) => (a.d - a.l.radius_m) - (b.d - b.l.radius_m));
    const best = scored[0];
    if (best.d > best.l.radius_m) return res.status(403).json({ error: `أنتِ خارج نطاق العمل (على بعد ${Math.round(best.d)} متر من ${best.l.name})` });
    where = best.l.name;
  }
  const okLL = isLatLng(lat, lng), la = okLL ? lat : null, ln = okLL ? lng : null;
  const now = tzParts();
  const rec = await db.get('SELECT * FROM attendance WHERE user_id=? AND date=?', u.id, now.date);
  const iso = new Date().toISOString();
  if (type === 'in') {
    if (rec && rec.check_in) return res.status(409).json({ error: 'تم تسجيل الحضور اليوم بالفعل' });
    const start = toMin(u.shift_start), grace = graceOf(u, st, await getPolicyCtx());
    const late = now.minutes > start + grace ? now.minutes - start : 0;
    try {
      if (rec) {
        const up = await db.run('UPDATE attendance SET check_in=?,in_lat=?,in_lng=?,in_face=?,late_minutes=?,in_loc=? WHERE id=? AND check_in IS NULL', iso, la, ln, score, late, where, rec.id);
        if (!up.rowCount) return res.status(409).json({ error: 'تم تسجيل الحضور اليوم بالفعل' });
      }
      else await db.run('INSERT INTO attendance(user_id,date,check_in,in_lat,in_lng,in_face,late_minutes,in_loc) VALUES(?,?,?,?,?,?,?,?)', u.id, now.date, iso, la, ln, score, late, where);
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'تم تسجيل الحضور اليوم بالفعل' });
      throw e;
    }
  } else {
    if (!rec || !rec.check_in) return res.status(409).json({ error: 'سجّلي الحضور أولاً' });
    if (rec.check_out) return res.status(409).json({ error: 'تم تسجيل الانصراف اليوم بالفعل' });
    const early = Math.max(0, toMin(u.shift_end) - now.minutes);
    const up = await db.run('UPDATE attendance SET check_out=?,out_lat=?,out_lng=?,out_face=?,early_minutes=?,out_loc=? WHERE id=? AND check_out IS NULL', iso, la, ln, score, early, where, rec.id);
    if (!up.rowCount) return res.status(409).json({ error: 'تم تسجيل الانصراف اليوم بالفعل' });
  }
  const saved = await db.get('SELECT * FROM attendance WHERE user_id=? AND date=?', u.id, now.date);
  try { // الصورة دليل إضافي، فلو فشل حفظها ما نفشّلش التسجيل نفسه
    await db.run('INSERT INTO attendance_photos(attendance_id,kind,photo) VALUES(?,?,?) ON CONFLICT(attendance_id,kind) DO UPDATE SET photo=EXCLUDED.photo, created_at=EXCLUDED.created_at', saved.id, type, photoBuf);
  } catch (e) { console.error('photo save failed:', e.message); }
  res.json({ ok: true, record: saved });
}));

// صورة الحضور/الانصراف: للموظفة نفسها أو لمن عنده صلاحية عرض الحضور للجميع
app.get('/api/attendance/:id/photo/:kind', auth, wrap(async (req, res) => {
  const id = toId(req.params.id), kind = req.params.kind;
  if (!id || !['in', 'out'].includes(kind)) return res.status(404).end();
  const a = await db.get('SELECT user_id FROM attendance WHERE id=?', id);
  if (!a) return res.status(404).end();
  if (a.user_id !== req.user.id && !can(req.user, 'attendance.view_all')) return res.status(403).end();
  const ph = await db.get('SELECT photo FROM attendance_photos WHERE attendance_id=? AND kind=?', id, kind);
  if (!ph) return res.status(404).end();
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' });
  res.send(ph.photo);
}));

app.get('/api/attendance/mine', auth, wrap(async (req, res) => {
  const month = isMonth(req.query.month) ? req.query.month : tzParts().date.slice(0, 7);
  const [a, b] = monthRange(month);
  res.json(await db.all(`SELECT a.*, EXISTS(SELECT 1 FROM attendance_photos p WHERE p.attendance_id=a.id AND p.kind='in') AS in_photo, EXISTS(SELECT 1 FROM attendance_photos p WHERE p.attendance_id=a.id AND p.kind='out') AS out_photo FROM attendance a WHERE a.user_id=? AND a.date BETWEEN ? AND ? ORDER BY a.date DESC`, req.user.id, a, b));
}));
};
