'use strict';
/* routes/attendance-self.js — تسجيل الحضور والانصراف من الموظف وصور الحضور وسجل */
const { haversine, isLatLng, isMonth, monthRange, toMin } = require('../lib/utils');
const { auth, wrap } = require('../src/middleware');
const { settings, tzParts } = require('../src/bootstrap');
const { allowedLocations, can, faceDistance, parsePhoto, toId, validDescriptor } = require('../src/helpers');
const { db } = require('../src/db');
const { computeMonth, getPolicyCtx, getTiers, graceOf, scheduleOf, syncAutoOvertime } = require('../src/payroll-engine');
const { notify } = require('../src/helpers');
// خصم التأخير/الانصراف المبكر للشهر الجاري (بيتحسب فوراً من سجل الحضور) — بنقارن قبل وبعد التسجيل عشان نعرف قيمة خصم اليوم
const monthLate = async (u, st, date) => { try { return (await computeMonth(u, date.slice(0, 7), st, await getTiers())).late_deduction; } catch (e) { return null; } };



module.exports = function register(app) {

/* ----- تسجيل الحضور والانصراف ----- */
app.post('/api/attendance/punch', auth, wrap(async (req, res) => {
  // تسجيل الحضور والانصراف من التطبيق المثبّت فقط (التطبيق بيبعت الهيدر ده)
  if (req.get('x-app-mode') !== '1') return res.status(403).json({ error: 'تسجيل الحضور والانصراف من التطبيق فقط. افتح التطبيق المثبّت على موبايلك.' });
  const { type, lat, lng, descriptor, photo } = req.body || {};
  if (!['in', 'out'].includes(type)) return res.status(400).json({ error: 'نوع غير صالح' });
  const u = req.user, st = await settings();
  // البصمة للموظفين فقط: حساب المدير مش بيسجّل حضور ولا انصراف
  if (u.is_admin) return res.status(403).json({ error: 'حسابات المديرين لا تسجّل حضور وانصراف' });
  // إعدادات موعد العمل المطابق للموظف (نافذة الدخول، الوجه، الموقع...). من غير موعد مطابق: السلوك زي ما كان.
  const pctx = await getPolicyCtx(), sch = scheduleOf(u, pctx);
  const locs = await allowedLocations(u);
  const needFace = !sch || sch.face_on !== false || (sch.face_remote === true && !locs.length);
  const photoBuf = parsePhoto(photo);
  if (!photoBuf) return res.status(400).json({ error: 'لم يتم التقاط الصورة، حاول مرة أخرى' });
  let score = null;
  if (needFace) {
    if (!u.face_descriptor) return res.status(403).json({ error: 'سجّل بصمة الوجه أولاً' });
    if (!validDescriptor(descriptor)) return res.status(400).json({ error: 'لم يتم التقاط الوجه' });
    score = faceDistance(descriptor, JSON.parse(u.face_descriptor));
    if (score > parseFloat(st.face_threshold)) return res.status(403).json({ error: 'الوجه غير مطابق، حاول مرة أخرى في إضاءة أفضل' });
  }
  // الموقع إجباري لو فيه مواقع معرّفة: لازم يكون الموظف داخل نطاق واحد من مواقعه المسموحة (إلا لو موعد العمل بيسمح بالتسجيل من أي مكان)
  let where = null;
  if (locs.length && !(sch && sch.remote_override === true)) {
    if (!isLatLng(lat, lng)) return res.status(400).json({ error: 'فعّل خدمة الموقع (GPS)' });
    const scored = locs.map((l) => ({ l, d: haversine(lat, lng, l.lat, l.lng) })).sort((a, b) => (a.d - a.l.radius_m) - (b.d - b.l.radius_m));
    const best = scored[0];
    if (best.d > best.l.radius_m) return res.status(403).json({ error: `أنت خارج نطاق العمل (على بعد ${Math.round(best.d)} متر من ${best.l.name})` });
    where = best.l.name;
  }
  const okLL = isLatLng(lat, lng), la = okLL ? lat : null, ln = okLL ? lng : null;
  const now = tzParts();
  const rec = await db.get('SELECT * FROM attendance WHERE user_id=? AND date=?', u.id, now.date);
  const iso = new Date().toISOString();
  const ok12 = (t) => { const [h, m] = String(t).split(':').map(Number); return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'ص' : 'م'}`; };
  let penBefore = null, penText = null; // إشعار الجزاء الفوري
  const dayShift = toMin(u.shift_end) > toMin(u.shift_start); // قيود الأوقات بتتطبق على الورديات داخل نفس اليوم
  if (type === 'in') {
    if (rec && rec.check_in) return res.status(409).json({ error: 'تم تسجيل الحضور اليوم بالفعل' });
    if (sch && dayShift) {
      if (sch.earliest_in && now.minutes < toMin(sch.earliest_in)) return res.status(403).json({ error: `تسجيل الحضور بيبدأ من الساعة ${ok12(sch.earliest_in)}` });
      if (sch.final_in && now.minutes > toMin(sch.final_in)) return res.status(403).json({ error: `انتهى وقت تسجيل الحضور لهذا اليوم (آخر وقت ${ok12(sch.final_in)})` });
    }
    const start = toMin(u.shift_start), grace = graceOf(u, st, pctx);
    // نطاق الحضور المتوقع: الوصول بين البداية و«إلى» مش تأخير
    const winEnd = sch && sch.ci_to && toMin(sch.ci_to) > start ? toMin(sch.ci_to) : start;
    const late = now.minutes > winEnd + grace ? now.minutes - start : 0;
    if (late > 0) { penBefore = await monthLate(u, st, now.date); penText = `تم تسجيل حضورك متأخراً ${late} دقيقة — تم خصم ${late} دقيقة من المرتب`; }
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
    if (!rec || !rec.check_in) return res.status(409).json({ error: 'سجّل الحضور أولاً' });
    if (rec.check_out) return res.status(409).json({ error: 'تم تسجيل الانصراف اليوم بالفعل' });
    // نهاية الوردية الفعلية: لو «حساب الخروج من وقت الدخول الفعلي» مفعّل بتتزحزح بقدر الدخول داخل نطاق الحضور
    let endMin = toMin(u.shift_end);
    if (sch && dayShift && sch.calc_out_from_in === true && sch.ci_to && toMin(sch.ci_to) > toMin(u.shift_start)) {
      const inMin = tzParts(new Date(rec.check_in)).minutes, s0 = toMin(u.shift_start);
      endMin += Math.min(Math.max(inMin, s0), toMin(sch.ci_to)) - s0;
    }
    if (sch && dayShift) {
      if (sch.earliest_out && now.minutes < toMin(sch.earliest_out)) return res.status(403).json({ error: `الانصراف بيبدأ من الساعة ${ok12(sch.earliest_out)}` });
      if (sch.allow_early_out === false && now.minutes < endMin) return res.status(403).json({ error: 'الانصراف قبل نهاية الوردية غير مسموح' });
    }
    const early = Math.max(0, endMin - now.minutes);
    if (early > 0) { penBefore = await monthLate(u, st, now.date); penText = `تم تسجيل انصرافك قبل الموعد بـ ${early} دقيقة — تم خصم ${early} دقيقة من المرتب`; }
    const up = await db.run('UPDATE attendance SET check_out=?,out_lat=?,out_lng=?,out_face=?,early_minutes=?,out_loc=? WHERE id=? AND check_out IS NULL', iso, la, ln, score, early, where, rec.id);
    if (!up.rowCount) return res.status(409).json({ error: 'تم تسجيل الانصراف اليوم بالفعل' });
    await syncAutoOvertime(endMin === toMin(u.shift_end) ? u : { ...u, shift_end: `${Math.floor(endMin / 60) % 24}:${String(endMin % 60).padStart(2, '0')}` }, now.date, now.minutes, st); // الدقايق بعد نهاية الشفت بتتحسب إضافي
  }
  if (penText && penBefore !== null) { // الجزاء بيتحسب فوراً: نبعت للموظف إشعار بقيمة الخصم
    try {
      const after = await monthLate(u, st, now.date), amt = after === null ? 0 : after - penBefore;
      if (amt > 0.0001) await notify(u.id, penText, 'penalty'); // بالدقايق بس (من غير المبلغ)
    } catch (e) { console.error('penalty notify failed:', e.message); }
  }
  const saved = await db.get('SELECT * FROM attendance WHERE user_id=? AND date=?', u.id, now.date);
  try { // الصورة دليل إضافي، فلو فشل حفظها ما نفشّلش التسجيل نفسه
    await db.run('INSERT INTO attendance_photos(attendance_id,kind,photo) VALUES(?,?,?) ON CONFLICT(attendance_id,kind) DO UPDATE SET photo=EXCLUDED.photo, created_at=EXCLUDED.created_at', saved.id, type, photoBuf);
  } catch (e) { console.error('photo save failed:', e.message); }
  try { // أول صورة بصمة بتبقى صورة البروفايل لحد ما الموظف يغيّرها
    await db.run('INSERT INTO user_avatars(user_id,photo,auto) VALUES(?,?,1) ON CONFLICT(user_id) DO NOTHING', u.id, photoBuf);
  } catch (e) { console.error('avatar save failed:', e.message); }
  res.json({ ok: true, record: saved });
}));

// صورة الحضور/الانصراف: للموظف نفسها أو لمن عنده صلاحية عرض الحضور للجميع
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
