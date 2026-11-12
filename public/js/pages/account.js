'use strict';
/* pages/account.js — صفحة «حسابي»: بياناتي والمرتب وطلباتي وتغيير البيانات */

PAGES.me = async (view) => {
  const u = S.me.user;
  let tab = S.metab || 'general'; S.metab = null;
  const t = S.me.today, today = S.me.today_date;
  const weekend = String(S.me.settings.weekend_days || '').split(',').filter(Boolean).map(Number);
  const dow = new Date(today + 'T00:00:00Z').getUTCDay();
  const chip = t && t.check_in ? (t.late_minutes > 0 ? ['b-warn', `متأخر ${t.late_minutes} د`] : ['b-ok', 'في الموعد']) : weekend.includes(dow) ? ['', 'عطلة'] : ['b-warn', 'لم يسجّل بعد'];
  view.innerHTML = `<div class="card profile"><div class="avatar xl">${esc(initials(u.name))}</div>
      <div class="pinfo"><h2>${esc(u.name)}</h2><div class="muted">${ico('case')} ${esc(u.job_title || (u.is_admin ? 'مدير النظام' : 'موظف'))}</div><div class="muted">${ico('users')} ${esc(u.department || '—')}</div></div>
      <div class="pmid"><div class="row" style="justify-content:center"><span class="badge ${chip[0]}">${chip[1]}</span>${t && t.check_in ? `<b dir="ltr" class="small">${clock12(t.check_in).replace(/:\d\d /, ' ')}${t.check_out ? ' - ' + clock12(t.check_out).replace(/:\d\d /, ' ') : ''}</b>` : ''}</div>
        <span class="muted small" dir="ltr">${shiftLabel(u.shift_start, u.shift_end)}</span></div>
      <div class="pact"><button class="btn" id="newreq">${ico('plus')} طلب جديد</button><button class="sqbtn" id="myinfo" title="بياناتي">${ico('info')}</button></div></div>
    <div class="grid g4 statrow" id="bal"></div>
    <div class="tabs" id="tabs">${[['general', 'عام'], ['calendar', 'تقويم العمل'], ['attendance', 'سجل الحضور'], ['payroll', 'المرتبات'], ['slips', 'مفردات الرواتب']].map(([k, l]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div id="tabbody"></div>`;
  $('#newreq').onclick = () => requestForm(() => PAGES.me(view));
  $('#myinfo').onclick = () => {
    const kv = [['اسم المستخدم', u.username], ['الهاتف', u.phone || '—'], ['تاريخ التعيين', dmy(u.hire_date)], ['الوردية', `${fmt12(u.shift_start)} - ${fmt12(u.shift_end)}`], ['رصيد الإجازة السنوية', u.annual_leave_days + ' يوم'], ['بصمة الوجه', u.face_exempt ? 'غير مطلوبة' : u.face_enrolled ? 'مسجلة' : 'غير مسجلة']];
    modal(`<h3>بياناتي</h3><div class="kv">${kv.map(([k, v]) => `<div><span class="muted">${k}</span><b>${esc(v)}</b></div>`).join('')}</div><div class="actions"><button class="btn" data-close>إغلاق</button></div>`);
  };
  const r = await api('/requests/mine');
  const bl = r.balances;
  $('#bal').innerHTML = [
    ['إجازة سنوية', bl.annual_total - bl.annual_used, 'الأيام', `المتبقي من رصيدك السنوي (${bl.annual_total} يوم)`],
    ['إجازة طارئة', bl.emergency_used, 'الأيام', 'المستخدم هذا العام'],
    ['إجازة مرضية', bl.sick_used, 'الأيام', 'المستخدم هذا العام'],
    ['أذونات', Number(bl.permission_hours_month).toFixed(2), 'ساعات', 'ساعات الأذونات المقبولة هذا الشهر'],
  ].map(([k, v, un, tip]) => `<div class="card sc"><div class="sct"><b>${v}</b><span class="un">${un}</span><span class="tip" title="${esc(tip)}">${ico('info')}</span><span class="grow"></span><span class="sicon">${ico('calendar')}</span></div><div class="scl">${k}</div></div>`).join('');
  const body = $('#tabbody');
  const MONTH_NOW = thisMonth();

  const draw = {
    /* ---- عام: الطلبات ---- */
    general() {
      const first = MONTH_NOW + '-01';
      body.innerHTML = `<h2 class="sect">الطلبات</h2><div class="row filt2">
        <button class="sqbtn blue" id="rreset" title="إعادة تعيين">${ico('filter')}</button>
        <select id="rtype"><option value="">أنواع الطلبات</option>${Object.entries(TYPES()).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <input type="date" id="rfrom" value="${first}"><input type="date" id="rto" value="${monthRange(MONTH_NOW)[1]}"></div><div id="myreq"></div>`;
      const show = () => {
        const from = $('#rfrom').value, to = $('#rto').value, ty = $('#rtype').value;
        const rows = r.requests.filter((x) => (!ty || x.type === ty) && (!from || x.to_date >= from) && (!to || x.from_date <= to));
        $('#myreq').innerHTML = rows.length ? `<div class="tablewrap"><table class="rq"><tr><th>النوع</th><th>المدة المطلوبة</th><th>أُوجد بواسطة</th><th>الحالة</th><th>تعليقات</th><th>ملحوظات</th><th></th></tr>
          ${rows.map((x) => {
            const one = ['overtime', 'permission', 'attendance_edit'].includes(x.type);
            const dur = one ? `<div>اليوم ${dmy(x.from_date)}</div>${x.hours ? `<div class="muted">عدد الساعات: ${x.hours}</div>` : ''}` : `<div>من ${dmy(x.from_date)}</div><div>إلى ${dmy(x.to_date)}</div><div class="muted">عدد الأيام: ${daysBetween(x.from_date, x.to_date)}</div>`;
            return `<tr><td><b>${esc(TYPES()[x.type] || x.type)}</b></td><td class="dur">${dur}</td><td>${esc(u.name)}</td><td><span class="badge ${STATUS_AR[x.status][1]}">${STATUS_AR[x.status][0]}</span></td>
              <td class="cmt">${x.decision_note ? `<span title="${esc(x.decision_note)}">${ico('info')}</span> <span class="small">${esc(x.decision_note)}</span>` : ''}</td><td class="small" style="white-space:normal;min-width:160px">${esc(x.reason || '')}</td>
              <td>${x.status === 'pending' ? `<button class="btn alt sm" data-del="${x.id}">حذف</button>` : ''}</td></tr>`;
          }).join('')}</table></div>` : '<div class="card empty">لا توجد طلبات في هذه الفترة</div>';
        body.querySelectorAll('[data-del]').forEach((bt) => (bt.onclick = () => run(bt, async () => { await api('/requests/' + bt.dataset.del, 'DELETE'); PAGES.me(view); })));
      };
      ['rtype', 'rfrom', 'rto'].forEach((i) => ($('#' + i).onchange = show));
      $('#rreset').onclick = () => { $('#rtype').value = ''; $('#rfrom').value = ''; $('#rto').value = ''; show(); };
      show();
    },
    /* ---- تقويم العمل ---- */
    async calendar() {
      let cm = S.calm || MONTH_NOW;
      body.innerHTML = `<div class="calbar"><div class="row"><button class="sqbtn" id="cnext">${ico('chev', 'rot90')}</button><b class="calttl" id="cttl"></b><button class="sqbtn" id="cprev">${ico('chev', 'rotm90')}</button></div>
        <div class="row"><button class="btn alt" id="cexp">${ico('download')} تصدير</button><button class="btn" id="cot">${ico('plus')} ورديات إضافية</button><button class="btn" id="cshift">${ico('plus')} تغيير الوردية</button></div></div><div id="cal"></div>`;
      $('#cot').onclick = () => requestForm(() => PAGES.me(view), { type: 'overtime' });
      $('#cshift').onclick = () => requestForm(() => PAGES.me(view), { type: 'shift_change' });
      const nav = (n) => { const [y, mo] = cm.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); cm = d.toISOString().slice(0, 7); S.calm = cm; load(); };
      $('#cprev').onclick = () => nav(-1); $('#cnext').onclick = () => nav(1);
      let exportRows = [];
      const load = async () => {
        $('#cttl').textContent = monthName(cm);
        const rows = await api('/attendance/mine?month=' + cm), by = Object.fromEntries(rows.map((x) => [x.date, x]));
        const leave = new Set();
        r.requests.filter((x) => x.status === 'approved' && ['annual_leave', 'sick_leave', 'emergency_leave', 'work_mission'].includes(x.type)).forEach((x) => { for (let d = x.from_date; d <= x.to_date; d = addDays(d, 1)) leave.add(d); });
        const [y, mo] = cm.split('-').map(Number), n = new Date(Date.UTC(y, mo, 0)).getUTCDate(), first = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
        const cells = []; exportRows = [['التاريخ', 'الحالة', 'حضور', 'انصراف', 'المكان']];
        for (let i = first; i > 0; i--) cells.push(`<div class="cd2 faded"><b>${new Date(Date.UTC(y, mo - 1, 1 - i)).getUTCDate()}</b></div>`);
        for (let d = 1; d <= n; d++) {
          const ds = `${cm}-${String(d).padStart(2, '0')}`, w = new Date(ds + 'T00:00:00Z').getUTCDay(), a = by[ds];
          let pill = '', cls = '', st = '';
          if (a && a.check_in) { cls = a.late_minutes > 0 ? 'late' : 'ok'; st = a.late_minutes > 0 ? 'متأخر' : 'في الموعد'; }
          else if (leave.has(ds)) { cls = 'leave'; st = 'إجازة'; }
          else if (weekend.includes(w)) { cls = 'off'; st = 'يوم عطلة'; }
          else if (ds < today && ds >= u.hire_date) { cls = 'abs'; st = 'غائب'; }
          if (st) pill = `<div class="cpill ${cls}"><div class="cst"><span>${st}</span><i></i></div><div class="cs" dir="ltr">${cls === 'off' ? '' : shiftLabel(u.shift_start, u.shift_end)}</div>${a && a.in_loc ? `<div class="cl">${ico('pin', 'pin')}${esc(a.in_loc)}</div>` : ''}</div>`;
          cells.push(`<div class="cd2 ${ds === today ? 'today' : ''}"><b>${d}</b>${pill}</div>`);
          if (st) exportRows.push([ds, st, a?.check_in ? clock12(a.check_in) : '', a?.check_out ? clock12(a.check_out) : '', a?.in_loc || '']);
        }
        const pad = (7 - (cells.length % 7)) % 7;
        for (let i = 1; i <= pad; i++) cells.push(`<div class="cd2 faded"><b>${i}</b></div>`);
        $('#cal').innerHTML = `<div class="card calcard"><div class="calgrid2">${['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'].map((x) => `<div class="ch2">${x}</div>`).join('')}${cells.join('')}</div></div>`;
      };
      $('#cexp').onclick = () => csv(`calendar-${cm}.csv`, exportRows);
      load();
    },
    /* ---- سجل الحضور ---- */
    async attendance() {
      body.innerHTML = `<div class="row filt2" style="margin-top:6px"><button class="btn alt" id="aexp">${ico('download')} تصدير</button><input type="date" id="afrom" value="${MONTH_NOW}-01"><input type="date" id="ato" value="${today}">
        <select id="ast" style="flex:1"><option value="">تحديد خيار</option><option value="ok">في الموعد</option><option value="late">متأخر</option><option value="abs">غائب</option><option value="off">يوم إجازة</option></select></div><div id="myatt"></div>`;
      let list = [];
      const load = async () => {
        let from = $('#afrom').value, to = $('#ato').value;
        if (!from || !to || to < from) return;
        if (to > today) to = today;
        if (daysBetween(from, to) > 93) from = addDays(to, -92);
        const months = []; for (let d = from.slice(0, 7); d <= to.slice(0, 7); d = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5) , 1)).toISOString().slice(0, 7)) months.push(d);
        const by = {}; (await Promise.all(months.map((m) => api('/attendance/mine?month=' + m)))).flat().forEach((x) => { by[x.date] = x; });
        const leave = new Set();
        r.requests.filter((x) => x.status === 'approved' && ['annual_leave', 'sick_leave', 'emergency_leave', 'work_mission'].includes(x.type)).forEach((x) => { for (let d = x.from_date; d <= x.to_date; d = addDays(d, 1)) leave.add(d); });
        list = [];
        for (let d = to; d >= from; d = addDays(d, -1)) {
          const w = new Date(d + 'T00:00:00Z').getUTCDay(), a = by[d];
          let kind = null;
          if (a && a.check_in) kind = a.late_minutes > 0 ? 'late' : 'ok';
          else if (leave.has(d)) kind = 'leave';
          else if (weekend.includes(w)) kind = 'off';
          else if (d < today && d >= u.hire_date) kind = 'abs';
          else if (d === today) kind = 'wait';
          if (kind) list.push({ d, a, kind });
        }
        show();
      };
      const show = () => {
        const f = $('#ast').value, rows = list.filter((x) => !f || (f === 'ok' ? x.kind === 'ok' : f === 'late' ? x.kind === 'late' : f === 'abs' ? x.kind === 'abs' : ['off', 'leave'].includes(x.kind)));
        const dur = (a) => { if (!a.check_in || !a.check_out) return ''; const mins = Math.round((new Date(a.check_out) - new Date(a.check_in)) / 60000); return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`; };
        $('#myatt').innerHTML = rows.map(({ d, a, kind }) => {
          const dt = `<div class="adate" dir="ltr">${dmyDash(d)}</div>`;
          if (kind === 'off') return `<div class="arow off">${dt}<div class="amid">يوم إجازة مجدول</div></div>`;
          if (kind === 'leave') return `<div class="arow off">${dt}<div class="amid">إجازة معتمدة</div></div>`;
          if (kind === 'wait') return `<div class="arow off">${dt}<div class="amid">لم يتم تسجيل الحضور بعد</div></div>`;
          const stb = { ok: ['b-ok', 'في الموعد'], late: ['b-warn', `متأخر ${a ? a.late_minutes : ''} د`], abs: ['b-bad', 'غائب'] }[kind];
          const io = (arrow, iso, loc) => `<div class="aio"><span class="pi ${arrow}">${arrow === 'in' ? '⇥' : '⇤'}</span><div><b dir="ltr">${clock12(iso)}</b><div class="muted small">${esc(loc || '—')}</div></div></div>`;
          return `<div class="arow">${dt}${a && a.check_in ? io('in', a.check_in, a.in_loc) : '<div class="aio muted">—</div>'}${a && a.check_out ? io('out', a.check_out, a.out_loc) : '<div class="aio muted">—</div>'}
            <div class="adur">${a ? `<span class="durchip">${dur(a) ? `<i class="gdot"></i>${dur(a)}` : '—'}</span>` : ''}</div><span class="badge ${stb[0]}">${stb[1]}</span>
            <button class="btn alt sm editreq" data-ed="${d}">${ico('edit')} طلب تعديل</button></div>`;
        }).join('') || '<div class="card empty">لا توجد سجلات</div>';
        body.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => requestForm(() => PAGES.me(view), { type: 'attendance_edit', date: b.dataset.ed })));
      };
      ['afrom', 'ato'].forEach((i) => ($('#' + i).onchange = load)); $('#ast').onchange = show;
      $('#aexp').onclick = () => csv('attendance.csv', [['التاريخ', 'الحالة', 'حضور', 'انصراف', 'مكان الحضور', 'مكان الانصراف'], ...list.map((x) => [x.d, x.kind, clock12(x.a?.check_in), clock12(x.a?.check_out), x.a?.in_loc || '', x.a?.out_loc || ''])]);
      load();
    },
    /* ---- المرتبات (جدول شهري) ---- */
    async payroll() {
      const year = S.payy || MONTH_NOW.slice(0, 4);
      body.innerHTML = '<div class="empty"><span class="spin"></span></div>';
      const h = await api('/payroll/mine/history?year=' + year);
      const rows = h.rows;
      const cols = [
        ['الأساسي', 'tb', (m) => money(m.accrued_basic)], ['البدلات', 'tb', (m) => money(m.accrued_allowances)], ['الإجمالي', 'tb', (m) => money(m.accrued_basic + m.accrued_allowances)],
        ['المكافآت', 'tg', (m) => money(m.bonuses)], ['الوقت الإضافي', 'tg', (m) => money(m.overtime_pay)],
        ['خصم التأخير', 'tp', (m) => money(m.late_deduction)], ['خصم الغياب', 'tp', (m) => money(m.absence_deduction)], ['الجزاءات', 'tp', (m) => money(m.penalties)], ['خصومات أخرى', 'tp', (m) => money(m.manual_deductions)],
        ['مستحق الدفع', 'tn', (m) => money(m.net)], ['قيد الانتظار', 'tn', (m) => money(m.paid ? 0 : m.net)], ['مدفوع', 'tn', (m) => money(m.paid ? m.net : 0)],
      ];
      body.innerHTML = rows.length ? `<div class="tablewrap ptwrap"><table class="ptable"><tr><th class="who">الفترة</th>${cols.map(([hh, c]) => `<th class="${c}">${hh}</th>`).join('')}<th></th></tr>
        ${rows.map((m, i) => `<tr><td class="who"><b>${monthName(m.month)}</b><div class="muted small">${m.paid ? 'مدفوع' : monthRange(m.month)[1] < today ? 'بانتظار الصرف' : 'جارٍ الحساب'}</div></td>${cols.map(([, c, fn]) => `<td class="${c}">${fn(m)}</td>`).join('')}<td><button class="link" data-v="${i}">عرض</button></td></tr>`).join('')}</table></div>
        <p class="muted small">المرتب الجاري بيتحسب يوم بيوم لحد النهارده، وبيتقفل ويتحول لـ «مدفوع» لما المدير يسجّل صرفه بعد نهاية الشهر.</p>` : '<div class="card empty">لا توجد مرتبات في هذه السنة</div>';
      body.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => viewSlip(rows[b.dataset.v])));
    },
    /* ---- مفردات الرواتب (كروت الشهور) ---- */
    async slips() {
      const year = S.payy || MONTH_NOW.slice(0, 4);
      body.innerHTML = '<div class="empty"><span class="spin"></span></div>';
      const h = await api('/payroll/mine/history?year=' + year);
      const rows = h.rows, paid = rows.filter((m) => m.paid);
      const sum = (arr, k) => arr.reduce((x, m) => x + m[k], 0);
      const nowY = Number(MONTH_NOW.slice(0, 4));
      body.innerHTML = `<div class="row" style="justify-content:space-between;margin:6px 0 12px"><div class="chipbtn"><select id="syr">${[nowY - 1, nowY].map((y) => `<option ${String(y) === year ? 'selected' : ''}>${y}</option>`).join('')}</select><span>${year === String(nowY) ? 'الحالي · ' : ''}${year}</span></div><span class="muted small">${monthName(`${year}-01`).split(' ')[0]} - ${monthName(`${year}-12`).split(' ')[0]} ${year}</span></div>
        <div class="grid g4">${[
          [`صافي المدفوع ${year}`, gbp(sum(paid, 'net')).replace(' £', ' £'), `${paid.length} دورة مقفلة`, ''],
          [`الإجمالي ${year}`, gbp(sum(rows, 'gross')), 'قبل الخصومات', ''],
          ['الاستقطاعات', `-${gbp(sum(rows, 'total_deductions'))}`, 'تأخير، غياب، جزاءات، خصومات', ''],
          ['متوسط الصافي', gbp(paid.length ? sum(paid, 'net') / paid.length : 0), 'لكل دورة مقفلة', 'blue'],
        ].map(([k, v, sub, c]) => `<div class="card sumc"><div class="muted small">${k}</div><b class="${c}">${v}</b><div class="muted small">${sub}</div></div>`).join('')}</div>
        <div class="grid g2 slipgrid" style="margin-top:12px">${rows.map((m, i) => `<div class="card slcard"><div class="sltxt"><b>${monthName(m.month)}</b><div class="muted small">${dmy(m.month + '-01').slice(0, 5)} - ${dmy(monthRange(m.month)[1]).slice(0, 5)} · ${m.paid ? 'مدفوع' : monthRange(m.month)[1] < today ? 'بانتظار الصرف' : 'قيد الحساب'}</div></div>
          <i class="sdot ${m.paid ? 'paid' : ''}"></i><div class="slamt"><b>${money(m.net)}</b> <small>£</small></div><div class="row"><button class="sqbtn" data-v="${i}" title="عرض">${ico('search')}</button><button class="sqbtn" data-p="${i}" title="تحميل PDF">${ico('download')}</button></div></div>`).join('') || '<div class="card empty" style="grid-column:1/-1">لا توجد مفردات مرتب في هذه السنة</div>'}</div>`;
      $('#syr').onchange = () => { S.payy = $('#syr').value; draw.slips(); };
      body.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => viewSlip(rows[b.dataset.v])));
      body.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => printSlip(rows[b.dataset.p])));
    },
  };
  const open = (k) => { tab = k; document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === k)); draw[k](); };
  document.querySelectorAll('#tabs button').forEach((b) => (b.onclick = () => open(b.dataset.t)));
  draw[tab]();
};
