'use strict';
/* src/payroll-engine.js — محرك المرتبات: شرائح التأخير وسياسات الجزاءات والإضافي والعطلات وحساب الشهر (computeMonth) */
const { eachDay, hoursBetween, isDate, monthRange, shiftMinutes } = require('../lib/utils');
const { db, pool } = require('./db');
const { parseCfg, truthy } = require('./shared');
const { tzParts } = require('./bootstrap');
const { LEAVE_TYPES } = require('./constants');
const { round2 } = require('./helpers');


/* ---------- شرائح خصم التأخير ---------- */
async function getTiers() {
  return (await db.all('SELECT * FROM late_tiers ORDER BY from_minutes')).map((t) => ({
    id: t.id, from_minutes: t.from_minutes, to_minutes: t.to_minutes === null ? null : t.to_minutes, kind: t.kind, value: t.value,
  }));
}
// خصم يوم تأخير واحد حسب الشريحة المناسبة (لو مفيش شريحة مطابقة: صفر)
function tierDeduction(tiers, lateMin, dailyRate) {
  const t = tiers.find((x) => lateMin >= x.from_minutes && (x.to_minutes === null || lateMin <= x.to_minutes));
  if (!t) return 0;
  return t.kind === 'fixed' ? t.value : t.value * dailyRate;
}

/* ---------- سياسات الحضور (جزاءات + وقت إضافي) المربوطة بمواعيد العمل ---------- */
// السياسة بتتحدد من موعد العمل اللي بدايته ونهايته = وردية الموظف. لو مفيش سياسة مربوطة: بنرجع للإعدادات العامة زي ما كان.
let _pctx = { at: 0, v: null };
const invalidatePolicyCtx = () => { _pctx = { at: 0, v: null }; };
async function getPolicyCtx() {
  if (_pctx.v && Date.now() - _pctx.at < 5000) return _pctx.v;
  const rows = (await db.all("SELECT * FROM config_items WHERE kind IN ('schedule','penalty_policy','overtime_policy','holiday','compensation_rule','leave_profile')")).map(parseCfg);
  const live = (k) => Object.fromEntries(rows.filter((r) => r.kind === k && r.active && !r.archived).map((r) => [String(r.id), r]));
  const list = (k) => rows.filter((r) => r.kind === k && r.active && !r.archived);
  const v = {
    schedules: rows.filter((r) => r.kind === 'schedule' && r.active), pen: live('penalty_policy'), ot: live('overtime_policy'),
    holidays: list('holiday'), comp: list('compensation_rule'), profiles: live('leave_profile'),
  };
  _pctx = { at: Date.now(), v };
  return v;
}
const hhmm = (t) => { const [h, m] = String(t || '').split(':'); return `${Number(h)}:${String(Number(m) || 0).padStart(2, '0')}`; };
function policiesFor(user, pctx) {
  const same = pctx.schedules.filter((s) => hhmm(s.start) === hhmm(user.shift_start) && hhmm(s.end) === hhmm(user.shift_end));
  const pick = (idKey, pool) => { for (const s of same) { const p = s[idKey] && pool[String(s[idKey])]; if (p) return p; } return null; };
  return { pen: pick('penalty_id', pctx.pen), ot: pick('overtime_id', pctx.ot) };
}
const graceOf = (user, st, pctx) => {
  const p = policiesFor(user, pctx).pen;
  return p && Number.isFinite(Number(p.grace)) ? Number(p.grace) : parseInt(st.grace_minutes || 0, 10);
};
// خصم يوم تأخير واحد حسب شرائح السياسة:
// "minutes" = (الدقائق داخل نطاق الشريحة ÷ 60 × أجر الساعة × المعامل) ، "fixed" / "day_fraction" = خصم ثابت للشريحة اللي التأخير وقع فيها
function policyLate(p, late, dailyRate, hourlyRate) {
  let total = 0;
  for (const t of [...(p.tiers || [])].sort((a, b) => a.from - b.from)) {
    const to = t.to === null || t.to === undefined ? Infinity : t.to;
    if (late < t.from) break;
    if (t.kind === 'minutes') total += ((Math.min(late, to) - t.from + 1) / 60) * hourlyRate * t.value;
    else if (late <= to) total += t.kind === 'fixed' ? t.value : t.value * dailyRate;
  }
  return total;
}
// ساعات الوقت الإضافي المحتسبة لطلب واحد حسب السياسة (بعد حد البداية، ثم الحد اليومي، ثم التقريب)
function policyOvertime(o, hours) {
  if (!o) return hours;
  if (!o.calc_on) return 0;
  let h = Math.max(0, hours - (Number(o.after_min) || 0) / 60);
  if (Number(o.cap_hours) > 0) h = Math.min(h, Number(o.cap_hours));
  const unit = (Number(o.round_unit) || 15) / 60;
  if (o.rounding === 'up') h = Math.ceil(h / unit - 1e-9) * unit;
  else if (o.rounding === 'down') h = Math.floor(h / unit + 1e-9) * unit;
  return h;
}

// أيام العطلات الرسمية داخل مدى معيّن (Map: تاريخ ← اسم العطلة)، مع دعم التكرار السنوي
function holidayMap(pctx, first, last) {
  const m = new Map();
  const y0 = Number(first.slice(0, 4)), y1 = Number(last.slice(0, 4));
  for (const h of pctx.holidays || []) {
    if (!isDate(h.date)) continue;
    const to = isDate(h.to) && h.to >= h.date ? h.to : h.date;
    const span = [...eachDay(h.date, to)];
    if (span.length > 366) continue;
    const shifts = truthy(h.yearly) ? Array.from({ length: Math.max(1, y1 - y0 + 1) }, (_, i) => y0 + i - Number(h.date.slice(0, 4))) : [0];
    for (const sh of shifts) for (const d of span) { const nd = sh ? `${Number(d.slice(0, 4)) + sh}${d.slice(4)}` : d; if (nd >= first && nd <= last) m.set(nd, h.name); }
  }
  return m;
}
// قاعدة التعويض المناسبة ليوم عمل فيه الموظف في عطلة رسمية أو إجازة أسبوعية (الأخص أولاً ثم "الاثنين")
function compRuleFor(pctx, kinds) {
  const rules = pctx.comp || [];
  for (const k of kinds) { const r = rules.find((x) => x.applies === k); if (r) return r; }
  return rules.find((x) => x.applies === 'both') || null;
}
const profileOf = (user, pctx) => (user.leave_profile_id && pctx.profiles && pctx.profiles[String(user.leave_profile_id)]) || null;

/* ---------- حساب شهر لموظف (حضور + غياب + خصومات + مرتب) ---------- */
async function computeMonth(user, month, st, tiers = []) {
  const [first, last] = monthRange(month);
  const today = tzParts().date;
  const upto = last < today ? last : today;
  const weekend = String(st.weekend_days || '').split(',').filter(Boolean).map(Number);
  const [att, reqs, adj, pctx] = await Promise.all([
    db.all('SELECT * FROM attendance WHERE user_id=? AND date BETWEEN ? AND ?', user.id, first, last),
    db.all("SELECT * FROM requests WHERE user_id=? AND status='approved' AND to_date>=? AND from_date<=?", user.id, first, last),
    db.all('SELECT * FROM adjustments WHERE user_id=? AND month=? ORDER BY id', user.id, month),
    getPolicyCtx(),
  ]);
  const { pen, ot } = policiesFor(user, pctx);
  const polGrace = pen && Number.isFinite(Number(pen.grace)) ? Number(pen.grace) : null;
  const attByDate = Object.fromEntries(att.map((a) => [a.date, a]));
  const covered = new Set();
  let overtimeHours = 0, permissionHours = 0;
  for (const r of reqs) {
    if (LEAVE_TYPES.includes(r.type)) for (const d of eachDay(r.from_date, r.to_date)) covered.add(d);
    if (r.type === 'overtime' && r.from_date >= first && r.from_date <= last) overtimeHours += policyOvertime(ot, r.hours || 0);
    if (r.type === 'permission' && r.from_date >= first && r.from_date <= last) permissionHours += r.hours || 0;
  }
  // ملف الإجازة والاستراحة: لو الاستراحة غير مدفوعة بتتشال من ساعات الوردية المدفوعة (بيرتفع أجر الساعة)
  const prof = profileOf(user, pctx);
  const unpaidBreak = prof && prof.break_paid === false ? Math.max(0, Number(prof.break_min) || 0) : 0;
  const shiftHours = Math.max(1, (shiftMinutes(user.shift_start, user.shift_end) - unpaidBreak) / 60);
  const dailyRate = user.base_salary / 30;
  const hourlyRate = dailyRate / shiftHours;
  const hmap = holidayMap(pctx, first, last);
  let presentDays = 0, absentDays = 0, leaveDays = 0, lateMinutes = 0, earlyMinutes = 0, workDays = 0, lateDays = 0, lateTierTotal = 0, partialDays = 0, partialTotal = 0;
  let holidayDays = 0, offDaysWorked = 0, compDays = 0, compPay = 0;
  if (first <= upto) {
    for (const d of eachDay(first, upto)) {
      const dow = new Date(d + 'T00:00:00Z').getUTCDay();
      if (d < user.hire_date) continue;
      const isWeekend = weekend.includes(dow), hol = hmap.get(d);
      // الإجازة الأسبوعية والعطلات الرسمية: مش يوم عمل (مفيش غياب ولا تأخير). ولو اشتغل فيها بتتطبق قاعدة التعويض
      if (isWeekend || hol) {
        if (hol && !isWeekend) holidayDays++;
        const a0 = attByDate[d];
        if (a0 && a0.check_in) {
          const rule = compRuleFor(pctx, [...(hol ? ['holiday'] : []), ...(isWeekend ? ['weekend'] : [])]);
          const hrs = hoursBetween(a0.check_in, a0.check_out); // (كانت بتستخدم toMin على تاريخ ISO فبترجع NaN وقاعدة التعويض ما بتتطبقش أبداً)
          if (rule && hrs >= (Number(rule.min_hours) || 0) && (Number(rule.min_hours) > 0 ? !!a0.check_out : true)) {
            offDaysWorked++;
            if (rule.mode === 'time_off') compDays += Number(rule.days) || 1;
            else compPay += dailyRate * (Number(rule.factor) || 0);
          }
        }
        continue;
      }
      workDays++;
      const a = attByDate[d];
      if (a && a.check_in) {
        presentDays++;
        // مع السياسة: السماحية بتاعتها هي المعتمدة، وسماحية الانصراف المبكر
        const lm = polGrace !== null && a.late_minutes <= polGrace ? 0 : a.late_minutes;
        const em = pen && a.early_minutes <= (Number(pen.early_grace) || 0) ? 0 : a.early_minutes;
        lateMinutes += lm; earlyMinutes += em;
        if (lm > 0) { lateDays++; lateTierTotal += pen ? policyLate(pen, lm, dailyRate, hourlyRate) : tierDeduction(tiers, lm, dailyRate); }
        // انصراف ناقص: يوم فات فيه حضور من غير انصراف
        if (pen && pen.partial_on && !a.check_out && d < today) {
          partialDays++; partialTotal += pen.partial_kind === 'fixed' ? Number(pen.partial_value) || 0 : (Number(pen.partial_value) || 0) * dailyRate;
        }
      }
      else if (covered.has(d)) leaveDays++;
      else if (d < today) absentDays++;
    }
  }
  const lateFactor = parseFloat(st.late_factor || 1);
  // لو فيه شرائح: التأخير بيتخصم حسبها. لو مفيش: بالدقيقة (دقائق التأخير ÷ 60 × أجر الساعة)
  // لو الموظف وردية مربوطة بسياسة جزاءات: السياسة هي اللي بتحكم (شرائحها + تفعيل كل بند). غير كده: الإعدادات العامة زي ما كانت.
  const lateOnly = pen ? (pen.late_on ? lateTierTotal : 0) : (tiers.length ? lateTierTotal : (lateMinutes / 60) * hourlyRate * lateFactor);
  const earlyDeduction = pen ? (pen.early_on ? (earlyMinutes / 60) * hourlyRate * (Number(pen.early_factor) || 0) : 0) : (earlyMinutes / 60) * hourlyRate * lateFactor;
  const lateDeduction = round2(lateOnly + earlyDeduction + partialTotal);
  const absenceDeduction = round2(absentDays * dailyRate * (pen ? Number(pen.absence_factor) || 0 : parseFloat(st.absence_factor || 1)));
  const overtimePay = round2(overtimeHours * hourlyRate * (ot ? Number(ot.factor) || 0 : parseFloat(st.overtime_factor || 1.5)));
  const sumKind = (k) => round2(adj.filter((a) => a.kind === k).reduce((s, a) => s + a.amount, 0));
  const bonuses = sumKind('bonus'), manualDeductions = sumKind('deduction'), penalties = sumKind('penalty');
  // المرتب بيتحسب يوم بيوم: كل يوم بيعدّي (من أول الشهر أو من تاريخ التعيين) بيستحق فيه الموظف أجر يوم = (الأساسي + البدلات) ÷ 30
  // الشهر المنتهي = 30 يوم كاملين، والشهر الجاري = الأيام اللي عدّت لحد النهارده (بما فيها اليوم)
  const startAcc = user.hire_date > first ? user.hire_date : first;
  const elapsed = startAcc <= upto ? [...eachDay(startAcc, upto)].length : 0;
  const accruedDays = last < today && user.hire_date <= first ? 30 : Math.min(30, elapsed);
  const accruedBasic = round2((user.base_salary / 30) * accruedDays), accruedAllowances = round2((user.allowances / 30) * accruedDays);
  const compensationPay = round2(compPay);
  const gross = round2(accruedBasic + accruedAllowances + bonuses + overtimePay + compensationPay);
  const totalDeductions = round2(lateDeduction + absenceDeduction + manualDeductions + penalties);
  return {
    user_id: user.id, name: user.name, job_title: user.job_title, department: user.department, month,
    base_salary: user.base_salary, allowances: user.allowances, accrued_days: accruedDays, accrued_basic: accruedBasic, accrued_allowances: accruedAllowances,
    daily_rate: round2(dailyRate),
    work_days: workDays, present_days: presentDays, absent_days: absentDays, leave_days: leaveDays,
    late_days: lateDays, late_minutes: lateMinutes, early_minutes: earlyMinutes, partial_days: partialDays, overtime_hours: overtimeHours, permission_hours: permissionHours,
    penalty_policy: pen ? pen.name : null, overtime_policy: ot ? ot.name : null, leave_profile: prof ? prof.name : null,
    holiday_days: holidayDays, off_days_worked: offDaysWorked, comp_days: compDays, compensation_pay: compensationPay,
    overtime_pay: overtimePay, bonuses, late_deduction: lateDeduction, absence_deduction: absenceDeduction,
    manual_deductions: manualDeductions, penalties, gross, total_deductions: totalDeductions,
    net: round2(gross - totalDeductions), adjustments: adj,
  };
}

module.exports = { computeMonth, getPolicyCtx, getTiers, graceOf, holidayMap, invalidatePolicyCtx, policiesFor, policyLate, policyOvertime, profileOf, tierDeduction };
