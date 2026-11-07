'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const u = require('../lib/utils');

test('isDate يرفض التواريخ الوهمية', () => {
  assert.equal(u.isDate('2026-11-07'), true);
  assert.equal(u.isDate('2024-02-29'), true);
  assert.equal(u.isDate('2026-02-30'), false);
  assert.equal(u.isDate('2026-13-01'), false);
  assert.equal(u.isDate('2026-00-10'), false);
  assert.equal(u.isDate('0001-01-01'), false);
  assert.equal(u.isDate('9999-12-31'), false);
  assert.equal(u.isDate(null), false);
  assert.equal(u.isDate('2026-1-1'), false);
});

test('isMonth و isHHMM', () => {
  assert.equal(u.isMonth('2026-11'), true);
  assert.equal(u.isMonth('2026-13'), false);
  assert.equal(u.isMonth('2026-00'), false);
  assert.equal(u.isHHMM('09:30'), true);
  assert.equal(u.isHHMM('9:05'), true);
  assert.equal(u.isHHMM('24:00'), false);
  assert.equal(u.isHHMM('10:75'), false);
  assert.equal(u.isHHMM('abc'), false);
});

test('isLatLng يمنع Infinity و NaN وخارج المدى (ثغرة تخطي نطاق الموقع)', () => {
  assert.equal(u.isLatLng(30.79, 31.0), true);
  assert.equal(u.isLatLng(Infinity, 31), false);
  assert.equal(u.isLatLng(30, -Infinity), false);
  assert.equal(u.isLatLng(NaN, 31), false);
  assert.equal(u.isLatLng(91, 31), false);
  assert.equal(u.isLatLng(30, 181), false);
  assert.equal(u.isLatLng('30', 31), false);
  // الدليل: JSON ممكن يطلّع Infinity
  const parsed = JSON.parse('{"lat":1e999,"lng":31}');
  assert.equal(parsed.lat, Infinity);
  assert.equal(u.isLatLng(parsed.lat, parsed.lng), false);
  assert.ok(Number.isNaN(u.haversine(parsed.lat, parsed.lng, 30, 31)));
});

test('haversine مسافة معقولة', () => {
  const d = u.haversine(30.0444, 31.2357, 30.0444, 31.2457);
  assert.ok(d > 900 && d < 1100, 'حوالي كيلومتر: ' + d);
  assert.equal(Math.round(u.haversine(30, 31, 30, 31)), 0);
});

test('shiftMinutes يدعم الوردية الليلية', () => {
  assert.equal(u.shiftMinutes('09:00', '17:00'), 480);
  assert.equal(u.shiftMinutes('22:00', '06:00'), 480);
  assert.equal(u.shiftMinutes('08:00', '08:00'), 1440);
});

test('zonedToUtc بيراعي توقيت القاهرة شتاءً (+2) مش +3 ثابتة', () => {
  assert.equal(u.zonedToUtc('2026-01-15', '09:00', 'Africa/Cairo').toISOString(), '2026-01-15T07:00:00.000Z');
  assert.equal(u.zonedToUtc('2026-11-07', '09:00', 'Africa/Cairo').toISOString(), '2026-11-07T07:00:00.000Z');
  assert.equal(u.zonedToUtc('2026-07-15', '09:00', 'Africa/Cairo').toISOString(), '2026-07-15T06:00:00.000Z');
  assert.equal(u.zonedToUtc('2026-07-15', '09:00', 'UTC').toISOString(), '2026-07-15T09:00:00.000Z');
});

test('hoursBetween بيحسب من ISO صح (كان toMin بيرجّع NaN)', () => {
  assert.equal(u.hoursBetween('2026-11-06T07:00:00.000Z', '2026-11-06T15:30:00.000Z'), 8.5);
  assert.equal(u.hoursBetween('2026-11-06T07:00:00.000Z', null), 0);
  // السلوك القديم الغلط:
  assert.ok(Number.isNaN(u.toMin('2026-11-06T07:00:00.000Z')));
});

test('daysBetween و eachDay و monthRange', () => {
  assert.equal(u.daysBetween('2026-11-01', '2026-11-30'), 30);
  assert.deepEqual([...u.eachDay('2026-02-27', '2026-03-02')], ['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
  assert.deepEqual(u.monthRange('2024-02'), ['2024-02-01', '2024-02-29']);
});
