'use strict';
/* src/loans.js — جدول أقساط القروض: القرض بيتصرف في تاريخ الموافقة، والقسط بيتحصل آخر يوم من الشهر من المرتب */
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const lastDayOf = (month) => { const [y, m] = month.split('-').map(Number); return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };
const addMonth = (month, n) => { const [y, m] = month.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };

// الأقساط: متساوية، وآخر قسط بياخد الباقي. القسط الأول في آخر يوم من شهر الصرف.
function loanSchedule(loan, today) {
  const n = Math.max(1, Number(loan.installments) || 1), each = round2(loan.amount / n);
  return Array.from({ length: n }, (_, i) => {
    const month = addMonth(loan.start_month, i), amount = i === n - 1 ? round2(loan.amount - each * (n - 1)) : each, due = lastDayOf(month);
    return { n: i + 1, month, due, amount, collected: loan.status === 'active' && due <= today };
  });
}
function loanState(loan, today) {
  const sch = loanSchedule(loan, today), paid = round2(sch.filter((x) => x.collected).reduce((t, x) => t + x.amount, 0));
  const remaining = loan.status === 'cancelled' ? 0 : round2(loan.amount - paid);
  const status = loan.status === 'cancelled' ? 'cancelled' : remaining <= 0 ? 'done' : 'active';
  return { schedule: sch, paid, remaining, state: status };
}
module.exports = { loanSchedule, loanState, lastDayOf, addMonth, round2 };
