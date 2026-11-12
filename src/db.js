'use strict';
/* src/db.js — الاتصال بقاعدة البيانات PostgreSQL: pool و db (get/all/run/insert) و tx */
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('لازم تحددي متغير البيئة DATABASE_URL (رابط قاعدة بيانات PostgreSQL). راجعي README.');
  process.exit(1);
}

/* ---------------- الاتصال بقاعدة البيانات (PostgreSQL) ---------------- */
const isLocal = /@(localhost|127\.0\.0\.1)(:|\/|$)/.test(DATABASE_URL);
const pool = new Pool({
  connectionString: DATABASE_URL,
  // Neon/Supabase بيحطوا sslmode في الرابط نفسه؛ لو مش موجود وده مش localhost نفعّل SSL
  ssl: isLocal || /sslmode=/.test(DATABASE_URL) ? undefined : true,
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 20000, // أول اتصال بعد خمول ممكن ياخد ثواني
  keepAlive: true,
});
// الاتصالات الخاملة ممكن تتقفل من طرف الاستضافة؛ من غير السطر ده التطبيق كله ممكن يقع
pool.on('error', (e) => console.error('pg idle client error:', e.message));

// "?" في الـ SQL بتتحول تلقائياً لـ $1,$2,...
const toPg = (sql) => { let i = 0; return sql.replace(/\?/g, () => '$' + (++i)); };
const db = {
  async all(sql, ...p) { return (await pool.query(toPg(sql), p)).rows; },
  async get(sql, ...p) { return (await pool.query(toPg(sql), p)).rows[0]; },
  async run(sql, ...p) { return pool.query(toPg(sql), p); },
  async insert(sql, ...p) { return (await pool.query(toPg(sql + ' RETURNING id'), p)).rows[0].id; },
};
// عدة أوامر كوحدة واحدة: يا تتنفذ كلها يا ولا واحد
async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn({ run: (sql, ...p) => c.query(toPg(sql), p) });
    await c.query('COMMIT');
    return r;
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch { /* تجاهل */ }
    throw e;
  } finally { c.release(); }
}
const NOW = "to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')";

module.exports = { NOW, db, pool, tx };
