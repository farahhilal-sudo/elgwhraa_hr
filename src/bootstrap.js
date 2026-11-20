'use strict';
/* src/bootstrap.js — الإعدادات (settings) وتجهيز القاعدة والإدارة الأولى (init/ready) والمنطقة الزمنية (tzParts) وسر الـ JWT */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db, pool } = require('./db');
const { SCHEMA } = require('./schema');
const { DEFAULT_SETTINGS } = require('./constants');


// الإعدادات بتتخزن في الذاكرة 30 ثانية عشان نقلل الرحلات لقاعدة البيانات
let settingsCache = null, settingsAt = 0, currentTz = 'Africa/Cairo';
async function settings() {
  if (settingsCache && Date.now() - settingsAt < 30000) return { ...settingsCache };
  const out = {};
  for (const r of await db.all('SELECT key,value FROM settings')) out[r.key] = r.value;
  settingsCache = out; settingsAt = Date.now();
  currentTz = out.timezone || currentTz;
  return { ...out };
}
const putSetting = (k, v) => db.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, v);

let jwtSecret;
async function init() {
  await pool.query(SCHEMA);
  // قواعد البيانات القديمة: نسمح بنوع "جزاء" في البنود الإضافية
  await pool.query('ALTER TABLE adjustments DROP CONSTRAINT IF EXISTS adjustments_kind_check');
  await pool.query("ALTER TABLE adjustments ADD CONSTRAINT adjustments_kind_check CHECK (kind IN ('deduction','bonus','penalty'))");
  // حسابات التسجيل الذاتي: pending=1 يعني بانتظار موافقة المدير (ومش بيقدر يدخل)
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS pending INTEGER NOT NULL DEFAULT 0');
  await pool.query("ALTER TABLE adjustments ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT ''");
  await pool.query('ALTER TABLE penalty_flags ADD COLUMN IF NOT EXISTS ov_value DOUBLE PRECISION');
  await pool.query('ALTER TABLE penalty_flags ADD COLUMN IF NOT EXISTS ov_unit TEXT');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT');
  // مواقع الحضور المسموحة لكل موظف (قائمة ids). لو فاضية، الموظف يقدر يسجل من أي موقع معرّف.
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS location_ids TEXT NOT NULL DEFAULT '[]'");
  await pool.query('ALTER TABLE work_locations ADD COLUMN IF NOT EXISTS active INTEGER NOT NULL DEFAULT 1');
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS nationality TEXT DEFAULT ''");
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_id INTEGER');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS leave_profile_id INTEGER');
  await pool.query('ALTER TABLE requests ADD COLUMN IF NOT EXISTS auto INTEGER NOT NULL DEFAULT 0');
  await pool.query('ALTER TABLE requests ADD COLUMN IF NOT EXISTS amount DOUBLE PRECISION NOT NULL DEFAULT 0');
  await pool.query('ALTER TABLE requests ADD COLUMN IF NOT EXISTS created_by INTEGER');
  await pool.query("ALTER TABLE requests ADD COLUMN IF NOT EXISTS meta TEXT NOT NULL DEFAULT '{}'");
  // بيانات الملف الشخصي: كود الموظف وتاريخ الميلاد والنوع والحالة الاجتماعية والهوية الوطنية
  for (const c of ['employee_code', 'birth_date', 'gender', 'marital_status', 'national_id']) await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${c} TEXT DEFAULT ''`);
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_code ON users(employee_code) WHERE employee_code <> ''");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_prefs TEXT NOT NULL DEFAULT '{}'");
  await pool.query("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS cat TEXT NOT NULL DEFAULT ''");
  await pool.query('CREATE TABLE IF NOT EXISTS breaks (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, date TEXT NOT NULL, start_at TEXT NOT NULL, end_at TEXT)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_breaks_user_date ON breaks(user_id, date)');
  await pool.query('ALTER TABLE attendance ADD COLUMN IF NOT EXISTS in_loc TEXT');
  await pool.query('ALTER TABLE attendance ADD COLUMN IF NOT EXISTS out_loc TEXT');
  await pool.query('ALTER TABLE attendance ADD COLUMN IF NOT EXISTS edited_by INTEGER');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TEXT'); // تاريخ إيقاف الموظف (سجله القديم بيفضل محفوظ)
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await db.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING', k, v);
  }
  // مرة واحدة: الإضافي التلقائي يتحول لطلب بيستنى موافقة المدير (بدل الاعتماد الفوري)
  if (!(await db.get("SELECT 1 FROM settings WHERE key='ot_manual_v1'"))) {
    await db.run("UPDATE settings SET value='0' WHERE key='overtime_auto_approve'");
    await db.run("INSERT INTO settings(key,value) VALUES('ot_manual_v1','1') ON CONFLICT(key) DO NOTHING");
  }
  let st = await settings();
  // ترحيل موقع العمل القديم (في الإعدادات) لأول موقع في جدول المواقع، مرة واحدة فقط
  if (st.work_lat !== '' && st.work_lng !== '' && isFinite(Number(st.work_lat)) && isFinite(Number(st.work_lng))) {
    if (!(await db.get('SELECT 1 FROM work_locations'))) {
      await db.run('INSERT INTO work_locations(name,lat,lng,radius_m) VALUES(?,?,?,?)', 'الإدارة', Number(st.work_lat), Number(st.work_lng), parseInt(st.radius_m, 10) || 150);
    }
    await putSetting('work_lat', ''); await putSetting('work_lng', '');
    settingsCache = null; st = await settings();
  }
  jwtSecret = process.env.JWT_SECRET || st.jwt_secret;
  if (!jwtSecret) {
    jwtSecret = crypto.randomBytes(32).toString('hex');
    await putSetting('jwt_secret', jwtSecret);
  }
  // أول مدير للنظام
  if (!(await db.get('SELECT 1 FROM users WHERE is_admin=1'))) {
    const pw = process.env.ADMIN_PASSWORD || 'admin123';
    await db.run('INSERT INTO users(name,username,password_hash,is_admin,must_change,job_title,department) VALUES(?,?,?,?,?,?,?) ON CONFLICT(username) DO NOTHING',
      'eng mohamed hegazy', 'admin', bcrypt.hashSync(pw, 10), 1, process.env.ADMIN_PASSWORD ? 0 : 1, 'مالك', 'شركة الجوهرة استيل');
    console.log('تم إنشاء حساب المدير: admin');
  }
  // لمرة واحدة: حساب المدير يتحوّل لحساب المالك (eng mohamed hegazy / مالك / شركة الجوهرة استيل). المالك مش موظف: مفيش بصمة ولا رصيد إجازات.
  if (!(await db.get("SELECT 1 FROM settings WHERE key='owner_v1'"))) {
    await db.run("UPDATE users SET name='eng mohamed hegazy', job_title='مالك', department='شركة الجوهرة استيل' WHERE id=(SELECT MIN(id) FROM users WHERE is_admin=1)");
    await db.run("INSERT INTO settings(key,value) VALUES('owner_v1','1') ON CONFLICT(key) DO NOTHING");
  }
  // لمرة واحدة: دقيقة الإضافي = ضعف دقيقة الموظف من المرتب الأساسي (المعامل 2 بدل قيمة ثابتة للدقيقة)
  if (!(await db.get("SELECT 1 FROM settings WHERE key='ot_basic_v1'"))) {
    for (const [k, v] of [['overtime_minute_rate', '0'], ['overtime_factor', '2'], ['ot_basic_v1', '1']]) await db.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, v);
  }
  // طوارئ: لو المدير نسي كلمة المرور ومفيش مدير تاني، حطي RESET_ADMIN_PASSWORD وأعيدي التشغيل (وبعدها شيليه)
  await db.run("UPDATE settings SET value='GWHRAA HR' WHERE key='company_name' AND value='شركتي'"); // الاسم الافتراضي الجديد
  if (process.env.RESET_ADMIN_PASSWORD) {
    await db.run('UPDATE users SET password_hash=?, must_change=1, active=1, pending=0 WHERE username=? AND is_admin=1', bcrypt.hashSync(process.env.RESET_ADMIN_PASSWORD, 10), process.env.RESET_ADMIN_USERNAME || 'admin');
    console.log('تمت إعادة تعيين كلمة مرور المدير (RESET_ADMIN_PASSWORD). شيلي المتغير بعد الدخول.');
  }
}
const ready = init();

/* ---------------- أدوات ---------------- */
function tzParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: currentTz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date).reduce((a, p) => ((a[p.type] = p.value), a), {});
  const hh = parts.hour === '24' ? '00' : parts.hour;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: parseInt(hh, 10) * 60 + parseInt(parts.minute, 10),
  };
}
const getJwtSecret = () => jwtSecret; // بيستخدمه الـ auth والـ login وتغيير كلمة المرور (المتغيّر نفسه جوه الوحدة دي)
const resetSettingsCache = () => { settingsCache = null; }; // لمّا الإعدادات تتغيّر نحمّلها فوراً

module.exports = { getJwtSecret, putSetting, ready, resetSettingsCache, settings, tzParts };
