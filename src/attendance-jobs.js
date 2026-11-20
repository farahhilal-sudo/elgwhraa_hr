'use strict';
/* src/attendance-jobs.js — مهام الخلفية لمواعيد العمل: تذكير الحضور/الانصراف والانصراف التلقائي */
const { toMin } = require('../lib/utils');
const { tzParts, settings } = require('./bootstrap');
const { db } = require('./db');
const { notify } = require('./helpers');
const { getPolicyCtx, holidayMap, scheduleOf } = require('./payroll-engine');

const WINDOW = 25; // دقيقة: أكبر من فترة التشغيل (10 د) عشان التذكير ما يفوتش، وبيتبعت مرة واحدة في اليوم لكل موظف
const tm12 = (m) => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, '0')} ${Math.floor(m / 60) % 24 < 12 ? 'ص' : 'م'}`;

async function sweepAttendance() {
  const now = tzParts(), st = await settings(), pctx = await getPolicyCtx();
  const weekend = String(st.weekend_days || '').split(',').filter(Boolean).map(Number);
  const off = new Date(now.date + 'T00:00:00Z').getUTCDay();
  const holiday = holidayMap(pctx, now.date, now.date).has(now.date);
  const users = await db.all('SELECT * FROM users WHERE active=1 AND is_admin=0 AND shift_start IS NOT NULL AND shift_end IS NOT NULL');
  const todayAtt = Object.fromEntries((await db.all('SELECT * FROM attendance WHERE date=?', now.date)).map((a) => [a.user_id, a]));
  const leaves = await db.all("SELECT user_id FROM requests WHERE status='approved' AND from_date<=? AND to_date>=? AND type NOT IN ('overtime','permission','attendance_edit','expense','loan')", now.date, now.date);
  const onLeave = new Set(leaves.map((r) => r.user_id));
  const sent = async (uid, key) => {
    const ex = await db.get('SELECT 1 FROM notifications WHERE user_id=? AND text LIKE ?', uid, `%${key}%${now.date}%`);
    return { has: !!ex };
  };
  for (const u of users) {
    const sch = scheduleOf(u, pctx);
    if (!sch) continue;
    const a = todayAtt[u.id];
    const workDay = !weekend.includes(off) && !holiday && !onLeave.has(u.id);
    if (workDay && sch.remind_in === true && sch.remind_in_t && !(a && a.check_in)) {
      const t = toMin(sch.remind_in_t);
      if (now.minutes >= t && now.minutes < t + WINDOW) {
        const s = await sent(u.id, 'تذكير بتسجيل الحضور');
        if (!s.has) await notify(u.id, `تذكير بتسجيل الحضور (موعد عملك ${tm12(toMin(u.shift_start))}) — ${now.date}`, '');
      }
    }
    if (workDay && sch.remind_out === true && sch.remind_out_t && a && a.check_in && !a.check_out) {
      const t = toMin(sch.remind_out_t);
      if (now.minutes >= t && now.minutes < t + WINDOW) {
        const s = await sent(u.id, 'تذكير بتسجيل الانصراف');
        if (!s.has) await notify(u.id, `تذكير بتسجيل الانصراف قبل ما تمشي — ${now.date}`, 'signout_reminder');
      }
    }
  }
  // الانصراف التلقائي: أي حضور من غير انصراف بعد نهاية وردية موعد فيه «تسجيل الانصراف التلقائي»
  const open = await db.all('SELECT a.*, u.shift_start, u.shift_end FROM attendance a JOIN users u ON u.id=a.user_id WHERE a.check_in IS NOT NULL AND a.check_out IS NULL AND u.active=1 AND a.date>=?', new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10));
  for (const a of open) {
    if (!(toMin(a.shift_end) > toMin(a.shift_start))) continue;
    const sch = scheduleOf(a, pctx);
    if (!sch || sch.auto_out !== true) continue;
    const endMin = toMin(a.shift_end);
    if (!(a.date < now.date || now.minutes >= endMin + 60)) continue; // بعد النهاية بساعة، أو يوم فات
    const probe = new Date(`${a.date}T${String(a.shift_end).padStart(5, '0')}:00Z`);
    let off = (tzParts(probe).minutes - endMin) % 1440; if (off > 720) off -= 1440; if (off < -720) off += 1440; // فرق المنطقة الزمنية عن UTC بالدقائق
    const iso = new Date(probe.getTime() - off * 60000).toISOString();
    await db.run("UPDATE attendance SET check_out=?, early_minutes=0, out_loc='انصراف تلقائي' WHERE id=? AND check_out IS NULL", iso, a.id);
  }
}
module.exports = { sweepAttendance };
