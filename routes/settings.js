'use strict';
/* routes/settings.js — سجل التدقيق والإعدادات العامة */
const { adminOnly, auth, need, wrap } = require('../src/middleware');
const { db } = require('../src/db');
const { putSetting, resetSettingsCache, settings, settingsCache } = require('../src/bootstrap');
const { DEFAULT_SETTINGS } = require('../src/constants');
const { audit } = require('../src/helpers');


module.exports = function register(app) {

/* ----- سجل التدقيق (للمدير فقط) ----- */
app.get('/api/audit', auth, adminOnly, wrap(async (req, res) => {
  res.json(await db.all('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 300'));
}));

/* ----- الإعدادات ----- */
app.get('/api/settings', auth, need('settings.manage'), wrap(async (req, res) => {
  const s = await settings(); delete s.jwt_secret; res.json(s);
}));
app.put('/api/settings', auth, need('settings.manage'), wrap(async (req, res) => {
  const b = req.body || {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (b[k] === undefined) continue;
    const v = String(b[k]).trim();
    if (['work_lat', 'work_lng'].includes(k) && v !== '' && !isFinite(Number(v))) return res.status(400).json({ error: 'إحداثيات غير صحيحة' });
    if (['radius_m', 'grace_minutes', 'late_factor', 'absence_factor', 'overtime_factor'].includes(k) && !(Number(v) >= 0)) return res.status(400).json({ error: 'قيمة رقمية غير صحيحة' });
    if (k === 'signup_enabled' && !['0', '1'].includes(v)) return res.status(400).json({ error: 'قيمة غير صحيحة' });
    if (k === 'face_threshold' && !(Number(v) >= 0.3 && Number(v) <= 0.7)) return res.status(400).json({ error: 'حساسية الوجه بين 0.3 و 0.7' });
    if (k === 'timezone') {
      try { new Intl.DateTimeFormat('en', { timeZone: v }); } catch { return res.status(400).json({ error: 'المنطقة الزمنية غير صحيحة' }); }
    }
    await putSetting(k, v);
  }
  resetSettingsCache(); // نحمّل الإعدادات الجديدة فوراً
  await settings();
  await audit(req, 'settings.update', Object.keys(b).filter((k) => k in DEFAULT_SETTINGS).join(','));
  res.json({ ok: true });
}));
};
