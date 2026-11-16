'use strict';
/* pages/account-slip.js — حسابي: كشف المرتب (عرض وطباعة) ودوال التاريخ الخاصة بيه */

/* --- حسابي --- */
const gbp = (n) => `${money(n)} £`;
const shiftLabel = (a, b) => {
  const f = (hhmm, sep) => { const [h, m] = hhmm.split(':').map(Number); return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''}${sep}${h >= 12 ? 'pm' : 'am'}`; };
  return `(${f(a, ' ')}-${f(b, '.')})`;
};
const monthName = (m) => `${MONTHS_AR[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
const daysBetween = (a, b) => { let n = 0; for (let d = a; d <= b; d = addDays(d, 1)) n++; return n; };

/* كشف المرتب (مفردات المرتب): نفس الـ HTML للعرض والطباعة */
function slipHtml(m) {
  const mo = m.month, last = monthRange(mo)[1];
  const L = (k, v, cls = '') => `<div class="sl ${cls}"><span>${k}</span><b>${v}</b></div>`;
  const earned = m.accrued_basic + m.accrued_allowances;
  return `<div class="slipcard"><div class="slhead"><div><div class="muted small">${esc(S.me.settings.company_name)}</div><h3>${esc(m.name)}</h3><div class="muted small">${esc([m.job_title, m.department].filter(Boolean).join(' · '))}</div></div>
      <div class="slper"><div class="muted small">فترة الصرف</div><b dir="ltr">${dmy(mo + '-01')} - ${dmy(last)}</b><div class="muted small">${m.paid ? 'مدفوع ' + dmy(String(m.paid_at).slice(0, 10)) : 'قيد الحساب (لم يُصرف بعد)'}</div></div></div>
    <div class="slsec">المستحقات</div>
    ${L(`المرتب الأساسي المستحق <small class="muted">(${m.accrued_days} يوم من 30 · أجر اليوم ${money(m.daily_rate)})</small>`, gbp(m.accrued_basic))}${L('البدلات المستحقة', gbp(m.accrued_allowances))}${L('إجمالي المرتب', gbp(earned), 'tot')}
    ${L('المكافآت', gbp(m.bonuses))}${L(`وقت إضافي <small class="muted">(${m.overtime_hours} س)</small>`, gbp(m.overtime_pay))}${m.compensation_pay ? L('تعويض العمل في العطلات', gbp(m.compensation_pay)) : ''}
    <div class="slsec">الاستقطاعات</div>
    ${L(`خصم التأخير <small class="muted">(${m.late_days} يوم${m.early_minutes ? ' + انصراف مبكر ' + m.early_minutes + ' د' : ''})</small>`, `(${gbp(m.late_deduction)})`, 'neg')}${L(`خصم الغياب <small class="muted">(${m.absent_days} يوم)</small>`, `(${gbp(m.absence_deduction)})`, 'neg')}
    ${L('الجزاءات', `(${gbp(m.penalties)})`, 'neg')}${L('خصومات أخرى', `(${gbp(m.manual_deductions)})`, 'neg')}${L('إجمالي الخصومات', gbp(m.total_deductions), 'tot')}
    <div class="slnet"><span>صافي المرتب</span><b>${gbp(m.net)}</b></div>
    <div class="muted small" style="margin-top:10px">أيام العمل ${m.work_days} · حضور ${m.present_days} · غياب ${m.absent_days} · إجازات ${m.leave_days} · تأخير ${m.late_days} يوم (${m.late_minutes} د)</div>
    ${m.adjustments && m.adjustments.length ? `<div class="slsec">البنود الإضافية</div>${m.adjustments.map((a) => { const t = ADJ[a.kind] || ADJ.deduction; return L(`${t[0]}: ${esc(a.reason || '—')}`, gbp(a.amount), t[1]); }).join('')}` : ''}</div>`;
}
function printSlip(m) {
  const w = window.open('', '_blank');
  if (!w) return toast('اسمحي بالنوافذ المنبثقة عشان تتحمل النسخة PDF', true);
  const css = [...document.styleSheets].map((ss) => { try { return [...ss.cssRules].map((r) => r.cssText).join('\n'); } catch { return ''; } }).join('\n');
  w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>مفردات المرتب - ${esc(m.name)} - ${m.month}</title><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet"><style>${css} body{background:#fff;padding:24px} .slipcard{border:0!important;max-width:760px;margin:auto}</style></head><body>${slipHtml(m)}</body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 700);
}
function viewSlip(m, extra = '') {
  const o = modal(`<div class="slbar"><div><h3>مفردات المرتب – ${esc(m.name)}</h3><div class="muted small">${esc([m.job_title, m.department].filter(Boolean).join(' · '))} · ${monthName(m.month)} · £</div></div>
    <div class="row"><button class="btn" id="slpdf">${ico('download')} تحميل PDF</button><button class="iconbtn" data-close aria-label="إغلاق">✕</button></div></div>${slipHtml(m)}${extra}`);
  o.classList.add('wide');
  $('#slpdf', o).onclick = () => printSlip(m);
  return o;
}
