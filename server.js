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
// ===== تجميع ملفات الواجهة =====
// index.html بيحمّل ~90 ملف (css + js): كل ملف طلب منفصل. هنا بنجمّعهم عند التشغيل في ملف css واحد وملف js واحد (بنفس الترتيب بالظبط)
// ونقدّمهم مضغوطين بإسم فيه الهاش (cache لسنة)، وبنعدّل index.html و sw.js اللي بيتقدّموا من الذاكرة بس — الملفات الأصلية في public/ زي ما هي.
const BUNDLES = {};
const rawSrc = (f) => fs.readFileSync(path.join(__dirname, 'public', f), 'utf8');
const minCss = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '\n').replace(/[ \t]{2,}/g, ' ');
function buildBundles() {
  let html = rawSrc('/index.html');
  const cssFiles = [...html.matchAll(/<link rel="stylesheet" href="(\/css\/[^"]+)">/g)].map((m) => m[1]);
  const jsFiles = [...html.matchAll(/<script src="(\/js\/[^"]+)"><\/script>/g)].map((m) => m[1]);
  if (!cssFiles.length || !jsFiles.length) return null;
  const css = cssFiles.map((f) => minCss(rawSrc(f))).join('\n');
  const js = jsFiles.map((f) => rawSrc(f)).join('\n;\n');
  const h = (t) => crypto.createHash('sha1').update(t).digest('hex').slice(0, 10);
  const cssUrl = `/assets/app.${h(css)}.css`, jsUrl = `/assets/app.${h(js)}.js`;
  BUNDLES[cssUrl] = css; BUNDLES[jsUrl] = js;
  let first = true;
  html = html.replace(/\s*<link rel="stylesheet" href="\/css\/[^"]+">/g, () => { if (!first) return ''; first = false; return `\n  <link rel="stylesheet" href="${cssUrl}">`; });
  html = html.replace(/\s*<script src="\/js\/[^"]+"><\/script>/g, '').replace('</body>', `  <script src="${jsUrl}"></script>\n</body>`);
  html = html.replace('<link rel="manifest"', `<link rel="preload" href="${jsUrl}" as="script">\n  <link rel="manifest"`);
  const swSrc = rawSrc('/sw.js').replace(/const SHELL = \[[\s\S]*?\n\];/, `const SHELL = ['/', '/icon.svg', '/logo.png', '/icon-192.png', '/manifest.json', '${cssUrl}', '${jsUrl}'];`);
  return { html, swSrc, cssFiles, jsFiles };
}
let bundled = null;
try { bundled = buildBundles(); } catch (e) { console.error('bundle build skipped:', e.message); }
// الضغط بيتعمل أول مرة الملف يتطلب (مش عند التشغيل) — عشان السيرفر يفتح فوراً حتى على استضافة بطيئة، وبعدها بيتخزّن في الذاكرة
const pack = (raw, br = 9) => {
  const e = { raw, etag: '"' + crypto.createHash('sha1').update(raw).digest('hex').slice(0, 20) + '"' };
  let b = null, g = null;
  Object.defineProperty(e, 'br', { get: () => b || (b = zlib.brotliCompressSync(Buffer.from(raw), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: br } })) });
  Object.defineProperty(e, 'gz', { get: () => g || (g = zlib.gzipSync(raw, { level: 9 })) });
  return e;
};
if (bundled) {
  for (const [u, t] of Object.entries(BUNDLES)) staticCache.set(u, pack(t, 9));
  staticCache.set('/index.html', pack(bundled.html, 9));
  staticCache.set('/sw.js', pack(bundled.swSrc, 9));
}
for (const f of ['/index.html', '/manifest.json', ...walkStatic('js', '.js'), ...walkStatic('css', '.css')]) {
  if (bundled && f === '/index.html') continue;
  try {
    staticCache.set(f, pack(fs.readFileSync(path.join(__dirname, 'public', f))));
  } catch (e) { console.error('static precompress skipped:', f, e.message); }
}
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const key = req.path === '/' ? '/index.html' : req.path, e = staticCache.get(key);
  if (!e) return next();
  res.setHeader('ETag', e.etag); res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Cache-Control', key.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.setHeader('Content-Type', STATIC_MIME[path.extname(key)]);
  if (req.headers['if-none-match'] === e.etag) return res.status(304).end();
  const ae = String(req.headers['accept-encoding'] || '');
  if (/\bbr\b/.test(ae)) { res.setHeader('Content-Encoding', 'br'); return res.end(e.br); }
  if (/\bgzip\b/.test(ae)) { res.setHeader('Content-Encoding', 'gzip'); return res.end(e.gz); }
  res.end(e.raw);
});
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));

// للاستضافات اللي بتفحص الصحة أو أدوات "إبقاء السيرفر صاحي" — مبتلمسش قاعدة البيانات
app.get('/healthz', (req, res) => res.type('text').send('ok'));

// أي طلب /api بيستنى لحد ما قاعدة البيانات تجهز (أول تشغيل)
app.use('/api', (req, res, next) => {
  ready.then(() => next(), () => res.status(503).json({ error: 'قاعدة البيانات غير متاحة حالياً، حاول بعد لحظات' }));
});

// ===== مجموعات الـ API (بنفس ترتيب التسجيل الأصلي) =====
require('./routes/auth')(app);
require('./routes/attendance-self')(app);
require('./routes/requests')(app);
require('./routes/notifications')(app);
require('./routes/dashboard')(app);
require('./routes/employees')(app);
require('./routes/attendance-admin')(app);
require('./routes/avatars')(app);
require('./routes/attendance-tabs')(app);
require('./routes/payroll')(app);
require('./routes/loans')(app);
require('./routes/locations')(app);
require('./routes/late-tiers')(app);
require('./routes/reports')(app);
require('./routes/config')(app);
require('./routes/settings')(app);
require('./routes/employee-app')(app);
require('./routes/tasks')(app);
require('./routes/hr-docs')(app);
require('./routes/assets')(app);


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
  // كل 10 دقايق: المهام المتأخرة بتتحوّل لطلب جزاء للمدير
  const sweep = () => require('./src/tasks').sweepOverdueTasks().catch((e) => console.error('sweepOverdueTasks:', e));
  ready.then(sweep); setInterval(sweep, 10 * 60 * 1000).unref();
  // كل 10 دقايق: تذكيرات الحضور/الانصراف والانصراف التلقائي حسب مواعيد العمل
  const sweepAtt = () => require('./src/attendance-jobs').sweepAttendance().catch((e) => console.error('sweepAttendance:', e));
  ready.then(sweepAtt); setInterval(sweepAtt, 10 * 60 * 1000).unref();
  const server = app.listen(PORT, () => console.log(`الخادم يعمل على المنفذ ${PORT}`));
  // إيقاف نظيف عند إعادة تشغيل الاستضافة: نكمّل الطلبات الجارية ونقفل الاتصال بالقاعدة
  const stop = () => { server.close(() => pool.end().finally(() => process.exit(0))); setTimeout(() => process.exit(0), 8000).unref(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}