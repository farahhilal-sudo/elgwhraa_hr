'use strict';
// اختبارات الهيكل: بتتأكد إن تقسيم الملفات سليم (من غير ما تحتاج npm install ولا قاعدة بيانات).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const pub = path.join(root, 'public');
const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
const walk = (dir, ext) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), ext) : e.name.endsWith(ext) ? [path.join(dir, e.name)] : []));

test('كل ملفات الواجهة المذكورة في index.html موجودة', () => {
  assert.ok(scripts.length > 20 && styles.length > 10);
  for (const f of [...scripts, ...styles]) assert.ok(fs.existsSync(path.join(pub, f)), 'ملف ناقص: ' + f);
});

test('مفيش ملف js/css يتيم (كله مذكور في index.html)', () => {
  const listed = new Set([...scripts, ...styles].map((f) => path.join(pub, f)));
  for (const f of [...walk(path.join(pub, 'js'), '.js'), ...walk(path.join(pub, 'css'), '.css')]) assert.ok(listed.has(f), 'ملف مش متحمّل في index.html: ' + path.relative(pub, f));
});

test('خدمة التطبيق (sw.js) بتخزّن كل ملفات الواجهة للعمل أوفلاين', () => {
  const sw = fs.readFileSync(path.join(pub, 'sw.js'), 'utf8');
  for (const f of [...scripts, ...styles]) assert.ok(sw.includes(`'${f}'`), 'مش في SHELL: ' + f);
});

test('كل ملفات الواجهة بتتحمّل بالترتيب وبتسجّل صفحات التطبيق', () => {
  const mk = () => { const f = function () {}; const p = new Proxy(f, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : k === 'then' ? undefined : p), set: () => true, apply: () => p, construct: () => p, has: () => true }); return p; };
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, setInterval: () => 0, URLSearchParams, Intl, Date, Math, JSON, Promise, Map, Set, FormData: function () {}, fetch: async () => ({ ok: true, json: async () => ({}) }) });
  ctx.window = ctx; ctx.document = Object.assign(mk(), { documentElement: { classList: { contains: () => false } } });
  ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; ctx.sessionStorage = ctx.localStorage; ctx.navigator = {}; ctx.location = { search: '', hash: '' };
  ctx.addEventListener = () => {}; ctx.matchMedia = () => ({ matches: false, addEventListener() {} }); ctx.Image = mk(); ctx.Blob = mk(); ctx.URL = { createObjectURL: () => '' };
  for (const f of scripts) vm.runInContext(fs.readFileSync(path.join(pub, f), 'utf8'), ctx, { filename: f });
  const pages = vm.runInContext('Object.keys(PAGES)', ctx);
  for (const p of ['home', 'me', 'dashboard', 'employees', 'attendance', 'requests', 'payroll', 'reports', 'permissions', 'adjustments', 'tiers', 'set_company', 'set_attendance', 'set_finance', 'set_misc', 'menu']) assert.ok(pages.includes(p), 'صفحة ناقصة: ' + p);
});

test('ملفات السيرفر سليمة وكل require جوّاها بيلاقي ملفه', () => {
  const files = ['server.js', ...walk(path.join(root, 'src'), '.js').map((f) => path.relative(root, f)), ...walk(path.join(root, 'routes'), '.js').map((f) => path.relative(root, f))];
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    assert.doesNotThrow(() => new vm.Script(`(function (require, module, exports, __dirname) {${src}\n})`, { filename: f }), 'خطأ صياغة في ' + f);
    for (const m of src.matchAll(/require\('(\.[^']+)'\)/g)) {
      const target = path.resolve(path.dirname(path.join(root, f)), m[1]);
      assert.ok(fs.existsSync(target + '.js') || fs.existsSync(path.join(target, 'index.js')), `${f}: require('${m[1]}') مش لاقي الملف`);
    }
  }
});
