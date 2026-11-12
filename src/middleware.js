'use strict';
/* src/middleware.js — وسطاء الـ API: wrap و auth و need و adminOnly */
const jwt = require('jsonwebtoken');
const { getJwtSecret, jwtSecret } = require('./bootstrap');
const { db } = require('./db');
const { can, pwVersion } = require('./helpers');


const wrap = (fn) => (req, res) => {
  Promise.resolve().then(() => fn(req, res)).catch((e) => {
    console.error(e);
    if (res.headersSent) return;
    if (e && e.code === '23505') return res.status(409).json({ error: 'السجل موجود بالفعل' });
    res.status(500).json({ error: 'خطأ في الخادم' });
  });
};
// المستخدم اللي عليه كلمة مرور مؤقتة ما يقدرش يستخدم غير شاشة تغيير كلمة المرور
const MUST_CHANGE_OK = new Set(['GET /api/me', 'POST /api/me/password']);
async function auth(req, res, next) {
  let id, pv;
  try {
    ({ id, pv } = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), getJwtSecret()));
  } catch { return res.status(401).json({ error: 'سجّلي الدخول من جديد' }); }
  try {
    const u = await db.get('SELECT * FROM users WHERE id=?', id);
    if (!u || !u.active || u.pending) return res.status(401).json({ error: 'الحساب غير متاح' });
    if (pv !== pwVersion(u)) return res.status(401).json({ error: 'سجّلي الدخول من جديد' });
    if (u.must_change && !MUST_CHANGE_OK.has(req.method + ' ' + req.originalUrl.split('?')[0])) return res.status(403).json({ error: 'لازم تغيّري كلمة المرور المؤقتة أولاً' });
    req.user = u;
    next();
  } catch (e) {
    // خطأ في قاعدة البيانات مش معناه إن الجلسة انتهت، فمنرجعش 401 (الواجهة بتعمل تسجيل خروج عليه)
    console.error(e);
    res.status(503).json({ error: 'تعذر الاتصال بقاعدة البيانات، حاولي بعد لحظات' });
  }
}
const need = (perm) => (req, res, next) =>
  can(req.user, perm) ? next() : res.status(403).json({ error: 'ليس لديك صلاحية لهذا الإجراء' });
const adminOnly = (req, res, next) => (req.user.is_admin ? next() : res.status(403).json({ error: 'للمدير فقط' }));

module.exports = { adminOnly, auth, need, wrap };
