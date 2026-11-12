/* server.js — نقطة التشغيل: إعداد Express والملفات الثابتة وتركيب مجموعات الـ API من routes/ (الأكواد في src/ و routes/) */
const express = require('express');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');
const { ready, settings } = require('./src/bootstrap');
const { db, pool } = require('./src/db');
const { computeMonth } = require('./src/payroll-engine');
const { cleanupPhotos } = require('./src/helpers');


const PORT = process.env.PORT || 3000;

/* ---------------- Express ---------------- */
const app = express();
app.set('trust proxy', 1); // وراء بروكسي الاستضافة، عشان IP الحقيقي يتحسب صح
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '200kb' }));
// ملفات الواجهة (index.html و manifest و كل ملفات public/js و public/css) بتتضغط مرة واحدة عند التشغيل (Brotli/Gzip) وبتتبعت بـ ETag: التحميل أسرع بكتير
const STATIC_MIME = { '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const staticCache = new Map();
const walkStatic = (dir, ext) => {
  const base = path.join(__dirname, 'public', dir), out = [];
  const rec = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) (e.isDirectory() ? rec(path.join(d, e.name), rel + '/' + e.name) : e.name.endsWith(ext) && out.push(rel + '/' + e.name)); };
  try { rec(base, '/' + dir); } catch (e) { console.error('static scan skipped:', dir, e.message); }
  return out.sort();
};
for (const f of ['/index.html', '/manifest.json', ...walkStatic('js', '.js'), ...walkStatic('css', '.css')]) {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'public', f));
    staticCache.set(f, {
      raw, etag: '"' + crypto.createHash('sha1').update(raw).digest('hex').slice(0, 20) + '"',
      br: zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } }), gz: zlib.gzipSync(raw, { level: 9 }),
    });
  } catch (e) { console.error('static precompress skipped:', f, e.message); }
}
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const key = req.path === '/' ? '/index.html' : req.path, e = staticCache.get(key);
  if (!e) return next();
  res.setHeader('ETag', e.etag); res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Content-Type', STATIC_MIME[path.extname(key)]);
  if (req.headers['if-none-match'] === e.etag) return res.status(304).end();
  const ae = String(req.headers['accept-encoding'] || '');
  if (/\bbr\b/.test(ae)) { res.setHeader('Content-Encoding', 'br'); return res.end(e.br); }
  if (/\bgzip\b/.test(ae)) { res.setHeader('Content-Encoding', 'gzip'); return res.end(e.gz); }
  res.end(e.raw);
});
app.use(express.static(path.join(__dirname, 'public')));

// للاستضافات اللي بتفحص الصحة أو أدوات "إبقاء السيرفر صاحي" — مبتلمسش قاعدة البيانات
app.get('/healthz', (req, res) => res.type('text').send('ok'));

// أي طلب /api بيستنى لحد ما قاعدة البيانات تجهز (أول تشغيل)
app.use('/api', (req, res, next) => {
  ready.then(() => next(), () => res.status(503).json({ error: 'قاعدة البيانات غير متاحة حالياً، حاولي بعد لحظات' }));
});

// ===== مجموعات الـ API (بنفس ترتيب التسجيل الأصلي) =====
require('./routes/auth')(app);
require('./routes/attendance-self')(app);
require('./routes/requests')(app);
require('./routes/notifications')(app);
require('./routes/dashboard')(app);
require('./routes/employees')(app);
require('./routes/attendance-admin')(app);
require('./routes/payroll')(app);
require('./routes/locations')(app);
require('./routes/late-tiers')(app);
require('./routes/reports')(app);
require('./routes/config')(app);
require('./routes/settings')(app);


app.use('/api', (req, res) => res.status(404).json({ error: 'المسار غير موجود' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
// معالج أخطاء عام: JSON غير صالح أو طلب كبير بيرجع رسالة نظيفة بدل صفحة خطأ فيها تفاصيل
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'الطلب كبير جداً' });
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) return res.status(400).json({ error: 'بيانات غير صالحة' });
  console.error(err);
  res.status(500).json({ error: 'خطأ في الخادم' });
});

module.exports = { app, db, pool, computeMonth, settings, ready };
if (require.main === module) {
  ready.catch((e) => { console.error('فشل تجهيز قاعدة البيانات:', e); process.exit(1); });
  process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));
  ready.then(cleanupPhotos); setInterval(cleanupPhotos, 24 * 3600 * 1000).unref();
  const server = app.listen(PORT, () => console.log(`الخادم يعمل على المنفذ ${PORT}`));
  // إيقاف نظيف عند إعادة تشغيل الاستضافة: نكمّل الطلبات الجارية ونقفل الاتصال بالقاعدة
  const stop = () => { server.close(() => pool.end().finally(() => process.exit(0))); setTimeout(() => process.exit(0), 8000).unref(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}