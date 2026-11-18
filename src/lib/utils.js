'use strict';
// دوال نقية (من غير قاعدة بيانات) عشان تتختبر لوحدها: node --test

const YEAR_MIN = 1970, YEAR_MAX = 2200;

// تاريخ حقيقي بصيغة YYYY-MM-DD (بيرفض 2026-13-45 و 2026-02-30)
function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (y < YEAR_MIN || y > YEAR_MAX) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
// شهر بصيغة YYYY-MM (من 01 إلى 12)
function isMonth(s) {
  if (typeof s !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  return y >= YEAR_MIN && y <= YEAR_MAX;
}
// وقت HH:MM صحيح (0-23 / 0-59)
function isHHMM(s) {
  if (typeof s !== 'string' || !/^\d{1,2}:\d{2}$/.test(s)) return false;
  const [h, m] = s.split(':').map(Number);
  return h <= 23 && m <= 59;
}
const toMin = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
// طول الوردية بالدقائق، ويدعم الوردية الليلية (النهاية بعد منتصف الليل)
function shiftMinutes(start, end) {
  let d = toMin(end) - toMin(start);
  if (!(d > 0)) d += 1440;
  return d;
}
// إحداثيات حقيقية: أرقام محدودة (مش NaN ولا Infinity) داخل المدى
function isLatLng(lat, lng) {
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function* eachDay(from, to) {
  const d = new Date(from + 'T00:00:00Z'), end = new Date(to + 'T00:00:00Z');
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) yield d.toISOString().slice(0, 10);
}
const daysBetween = (from, to) => Math.round((new Date(to + 'T00:00:00Z') - new Date(from + 'T00:00:00Z')) / 86400000) + 1;
const monthRange = (m) => {
  const [y, mo] = m.split('-').map(Number);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return [`${m}-01`, `${m}-${String(last).padStart(2, '0')}`];
};

// فرق التوقيت (بالمللي ثانية) لمنطقة زمنية عند لحظة معيّنة، بيراعي التوقيت الصيفي
function tzOffsetMs(utcMs, tz) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(utcMs)).reduce((a, x) => ((a[x.type] = x.value), a), {});
  const h = p.hour === '24' ? 0 : Number(p.hour);
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), h, Number(p.minute), Number(p.second)) - Math.floor(utcMs / 1000) * 1000;
}
// تاريخ + ساعة بتوقيت منطقة معيّنة ← لحظة UTC (Date). بدل ما نثبّت +03:00 اللي بيغلط شتاءً
function zonedToUtc(date, hhmm, tz) {
  const [y, m, d] = date.split('-').map(Number), [h, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi, 0);
  let t = guess - tzOffsetMs(guess, tz);
  const off2 = tzOffsetMs(t, tz);
  if (guess - off2 !== t) t = guess - off2;
  return new Date(t);
}
// ساعات بين حضور وانصراف (ISO strings)
const hoursBetween = (a, b) => (a && b ? Math.max(0, (new Date(b) - new Date(a)) / 3600000) : 0);

module.exports = { isDate, isMonth, isHHMM, toMin, shiftMinutes, isLatLng, haversine, eachDay, daysBetween, monthRange, tzOffsetMs, zonedToUtc, hoursBetween };
