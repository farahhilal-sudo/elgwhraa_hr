'use strict';
// اختبار تسجيل الانصراف نيابةً عن الموظف (زر «تسجيل الانصراف» في كروت الموظفين) بقاعدة وهمية
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const ST = { rec: null, users: {}, runs: [], audits: [], ot: [] };
const fakeDb = {
  get: async (sql, ...a) => (/FROM users/.test(sql) ? ST.users[a[0]] || null : /FROM attendance WHERE user_id/.test(sql) ? ST.rec : null),
  all: async () => [], run: async (sql, ...a) => { ST.runs.push([sql, a]); return { rowCount: 1 }; },
};
const stub = (rel, exports) => { const f = require.resolve(path.join('..', rel)); require.cache[f] = { id: f, filename: f, loaded: true, exports }; };
stub('src/db.js', { db: fakeDb, NOW: 'now()' });
stub('src/middleware.js', { auth: (q, s, n) => n(), need: () => (q, s, n) => n(), wrap: (f) => f });
stub('src/bootstrap.js', { settings: async () => ({ overtime_minute_rate: '2' }), tzParts: () => ({ date: '2026-11-10', minutes: 17 * 60 + 12 }) });
stub('src/helpers.js', { audit: async (...a) => ST.audits.push(a.slice(1)), toId: (v) => { const n = parseInt(v, 10); return n > 0 ? n : null; } });
stub('src/payroll-engine.js', { getPolicyCtx: async () => ({}), graceOf: () => 0, syncAutoOvertime: async (u, d, m) => ST.ot.push([u.id, d, m]) });
const routes = {};
require('../routes/attendance-admin')({ get: (p, ...h) => (routes['GET ' + p] = h.at(-1)), post: (p, ...h) => (routes['POST ' + p] = h.at(-1)), put: (p, ...h) => (routes['PUT ' + p] = h.at(-1)), delete: (p, ...h) => (routes['DELETE ' + p] = h.at(-1)) });
const call = async (body) => { let code = 200, out; const res = { status(c) { code = c; return this; }, json(o) { out = o; return this; } }; await routes['POST /api/attendance/checkout']({ user: { id: 1, name: 'المدير' }, body }, res); return { code, out }; };
const reset = () => Object.assign(ST, { rec: null, users: { 5: { id: 5, name: 'موظفة', is_admin: 0, shift_end: '17:00' } }, runs: [], audits: [], ot: [] });

test('checkout: مرفوض لو الموظف مش موجود / مدير / ما سجلش حضور / انصرف قبل كده', async () => {
  reset();
  assert.equal((await call({ user_id: 99 })).code, 404);
  ST.users[9] = { id: 9, name: 'مدير', is_admin: 1 }; assert.equal((await call({ user_id: 9 })).code, 404);   // المدير مش موظف
  assert.equal((await call({ user_id: 5 })).code, 400);                                                          // مفيش حضور اليوم
  ST.rec = { id: 3, check_in: 'x', check_out: 'y' }; assert.equal((await call({ user_id: 5 })).code, 409);      // اتسجّل انصراف
});
test('checkout: بيحفظ الانصراف بالوقت الحالي ويحسب الإضافي التلقائي ويسجّل في التدقيق', async () => {
  reset(); ST.rec = { id: 3, check_in: 'x', check_out: null, note: '' };
  const r = await call({ user_id: 5 });
  assert.deepEqual(r.out, { ok: true });
  assert.ok(/UPDATE attendance SET check_out/.test(ST.runs[0][0]) && /check_out IS NULL/.test(ST.runs[0][0]));
  assert.equal(ST.runs[0][1][1], 0);                                   // بعد نهاية الشفت: مفيش انصراف مبكر
  assert.deepEqual(ST.ot[0], [5, '2026-11-10', 17 * 60 + 12]);          // 12 دقيقة إضافي بتتحسب
  assert.equal(ST.audits[0][0], 'attendance.manual_checkout');
});
