'use strict';
/* src/helpers.js — دوال مساعدة: صلاحيات وإشعارات وسجل التدقيق وصور الحضور وحماية المحاولات */
const crypto = require('crypto');
const { PERMISSIONS } = require('./constants');
const { db } = require('./db');

function faceDistance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}
const validDescriptor = (d) => Array.isArray(d) && d.length === 128 && d.every((x) => typeof x === 'number' && isFinite(x));
const round2 = (n) => Math.round(n * 100) / 100;
// رقم صحيح موجب صالح كـ id، أو null
const toId = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 && n < 2147483647 ? n : null; };
function userPerms(u) {
  if (u.is_admin) return ['*', ...Object.keys(PERMISSIONS)];
  try { return JSON.parse(u.permissions || '[]'); } catch { return []; }
}
const can = (u, p) => u.is_admin || userPerms(u).includes(p);
const parseIds = (t) => { try { const a = JSON.parse(t || '[]'); return Array.isArray(a) ? a.map(Number).filter(Number.isInteger) : []; } catch { return []; } };
// المواقع اللي يقدر الموظف يسجّل منها: المحددة له، ولو مفيش فكل المواقع المعرّفة
async function allowedLocations(u) {
  const all = await db.all('SELECT * FROM work_locations WHERE active=1 ORDER BY id');
  const ids = parseIds(u.location_ids);
  const mine = all.filter((l) => ids.includes(l.id));
  return mine.length ? mine : all;
}
function publicUser(u) {
  return {
    id: u.id, name: u.name, username: u.username, is_admin: !!u.is_admin, must_change: !!u.must_change,
    permissions: userPerms(u).filter((p) => p !== '*'), job_title: u.job_title, department: u.department,
    phone: u.phone, location_ids: parseIds(u.location_ids), shift_start: u.shift_start, shift_end: u.shift_end, hire_date: u.hire_date,
    nationality: u.nationality || '', manager_id: u.manager_id || null, leave_profile_id: u.leave_profile_id || null,
    annual_leave_days: u.annual_leave_days, face_enrolled: !!u.face_descriptor, face_exempt: !!u.is_admin, active: !!u.active, pending: !!u.pending, email: u.email || '',
    employee_code: u.employee_code || '', birth_date: u.birth_date || '', gender: u.gender || '', marital_status: u.marital_status || '',
  };
}
function notify(userId, text) {
  return db.run('INSERT INTO notifications(user_id,text) VALUES(?,?)', userId, text);
}
async function notifyManagers(text, exceptId, perm = 'requests.approve', adminsOnly = false) {
  const rows = await db.all('SELECT * FROM users WHERE active=1');
  await Promise.all(rows.filter((u) => u.id !== exceptId && (adminsOnly ? u.is_admin : can(u, perm))).map((u) => notify(u.id, text)));
}
// سجل تدقيق: مين عمل إيه ومتى (من غير كلمات مرور ولا بيانات حساسة)
async function audit(req, action, target = '', details = '') {
  try {
    await db.run('INSERT INTO audit_logs(user_id,user_name,action,target,details,ip) VALUES(?,?,?,?,?,?)',
      req.user ? req.user.id : null, req.user ? req.user.name : '', action, String(target).slice(0, 120), String(details).slice(0, 500), req.ip || '');
  } catch (e) { console.error('audit failed:', e.message); }
}
// صورة البصمة: JPEG صغيرة جاية من الكاميرا (data URL). بنتأكد إنها فعلاً JPEG وبحجم معقول
function parsePhoto(s) {
  if (typeof s !== 'string' || s.length > 160000) return null;
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(s);
  if (!m) return null;
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 500 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return null;
  return buf;
}
// الصور بتتمسح تلقائياً بعد فترة (خصوصية + توفير مساحة). الافتراضي 60 يوم، وتتغيّر من PHOTO_RETENTION_DAYS
const PHOTO_DAYS = Math.max(7, parseInt(process.env.PHOTO_RETENTION_DAYS, 10) || 60);
async function cleanupPhotos() {
  try {
    const cutoff = new Date(Date.now() - PHOTO_DAYS * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    const r = await db.run('DELETE FROM attendance_photos WHERE created_at < ?', cutoff);
    if (r.rowCount) console.log(`تم حذف ${r.rowCount} صورة أقدم من ${PHOTO_DAYS} يوم`);
  } catch (e) { console.error('photo cleanup failed:', e.message); }
}
// مدير الموارد (غير المدير العام) ما يتحكمش في حساب صلاحياته أعلى من صلاحياته (يمنع تصعيد الصلاحيات بتغيير كلمة مرور حساب أقوى)
function outranks(actor, target) {
  if (actor.is_admin) return true;
  if (target.is_admin) return false;
  const mine = new Set(userPerms(actor));
  return userPerms(target).every((p) => mine.has(p));
}
// بصمة قصيرة من كلمة المرور داخل التوكن: لما كلمة المرور تتغيّر كل التوكنات القديمة تبطل
const pwVersion = (u) => crypto.createHash('sha256').update(String(u.password_hash)).digest('hex').slice(0, 16);
const USERNAME_RE = /^[\p{L}\p{N}._-]{3,30}$/u;
// تحديد معدل الطلبات المفتوحة (تسجيل / نسيت كلمة المرور) لكل IP
const hits = new Map();
const limited = (req, bucket, max, windowMs) => {
  const k = bucket + ':' + (req.ip || '');
  const now = Date.now();
  const h = (hits.get(k) || []).filter((t) => now - t < windowMs);
  if (h.length >= max) { hits.set(k, h); return true; }
  h.push(now); hits.set(k, h);
  if (hits.size > 5000) hits.clear();
  return false;
};

module.exports = { USERNAME_RE, allowedLocations, audit, can, cleanupPhotos, faceDistance, limited, notify, notifyManagers, outranks, parseIds, parsePhoto, publicUser, pwVersion, round2, toId, validDescriptor };
