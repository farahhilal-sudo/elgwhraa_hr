'use strict';
/* pages/tiers.js — صفحة «شرائح خصم التأخير» */

/* --- شرائح خصم التأخير --- */
async function tiersUI(view, embedded) {
  const [{ tiers }, st] = await Promise.all([api('/late-tiers'), api('/settings')]);
  let rows = tiers.map((t) => ({ ...t }));
  const grace = parseInt(st.grace_minutes, 10) || 0;
  const startAt = `${9 + Math.floor(grace / 60)}:${String(grace % 60).padStart(2, '0')}`;
  const isOpen = (v) => v === '' || v === null || v === undefined;
  const sync = () => {
    view.querySelectorAll('tr[data-i]').forEach((tr) => {
      const r = rows[Number(tr.dataset.i)];
      tr.querySelectorAll('[data-f]').forEach((el) => { r[el.dataset.f] = el.value; });
    });
  };
  const calc = () => {
    sync();
    const sal = Number($('#tsal').value), min = Number($('#tmin').value);
    if (!(sal > 0) || !(min > 0)) { $('#tres').textContent = ''; return; }
    if (!rows.length) { $('#tres').textContent = 'مفيش شرائح محفوظة: الخصم بالدقيقة (دقائق التأخير ÷ 60 × أجر الساعة)'; return; }
    const t = rows.find((x) => min >= Number(x.from_minutes) && (isOpen(x.to_minutes) || min <= Number(x.to_minutes)));
    $('#tres').textContent = t ? `الخصم: ${money(t.kind === 'fixed' ? Number(t.value) : Number(t.value) * (sal / 30))} جنيه` : 'لا يوجد خصم (التأخير ده خارج الشرائح)';
  };
  const draw = () => {
    const lastT = rows[rows.length - 1];
    view.innerHTML = `${embedded ? '' : financeTabs('tiers') + '<div class="page-head"><h2>شرائح خصم التأخير</h2></div>'}
      <div class="card" style="margin-bottom:12px"><p>التأخير بيتحسب بالدقايق من <b>بداية وردية الموظف</b>، وبيبدأ بعد فترة السماح (حالياً <b>${grace} دقايق</b>؛ يعني لو الوردية 9:00 الخصم بيبدأ بعد ${startAt}). فترة السماح تتغير من صفحة الإعدادات.</p>
      <p class="muted small" style="margin-top:6px">حددي لكل شريحة تأخير (من – إلى بالدقيقة) الخصم اللي يتطبق على اليوم ده: إما <b>جزء من أجر اليوم</b> (مثلاً 0.25 = ربع يوم، وأجر اليوم = الأساسي ÷ 30) أو <b>مبلغ ثابت</b> بالجنيه. سيبي خانة «إلى» فاضية للشريحة الأخيرة (وما فوق). لو مفيش شرائح محفوظة، النظام بيخصم بالدقيقة (دقائق التأخير ÷ 60 × أجر الساعة).</p></div>
      <div class="tablewrap"><table style="min-width:620px"><tr><th>من (دقيقة)</th><th>إلى (دقيقة)</th><th>نوع الخصم</th><th>القيمة</th><th></th></tr>
      ${rows.map((r, i) => `<tr data-i="${i}">
        <td><input type="number" min="1" data-f="from_minutes" value="${esc(r.from_minutes)}" style="width:90px"></td>
        <td><input type="number" min="1" data-f="to_minutes" value="${esc(r.to_minutes ?? '')}" placeholder="وما فوق" style="width:110px"></td>
        <td><select data-f="kind"><option value="day_fraction" ${r.kind === 'day_fraction' ? 'selected' : ''}>جزء من أجر اليوم</option><option value="fixed" ${r.kind === 'fixed' ? 'selected' : ''}>مبلغ ثابت (جنيه)</option></select></td>
        <td><input type="number" step="0.01" min="0.01" data-f="value" value="${esc(r.value ?? '')}" style="width:100px"></td>
        <td><button class="btn alt sm" data-rm="${i}">حذف</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">مفيش شرائح. الخصم حالياً بالدقيقة.</td></tr>'}</table></div>
      ${lastT && !isOpen(lastT.to_minutes) ? `<p class="neg small" style="margin-top:8px">تنبيه: أي تأخير أكبر من ${esc(lastT.to_minutes)} دقيقة مش هيتخصم، لأن آخر شريحة ليها حد أعلى. سيبي خانة «إلى» فاضية في آخر شريحة لو عايزاها تشمل أي تأخير أكبر.</p>` : ''}
      <div class="row" style="margin-top:12px"><button class="btn alt" id="tadd">+ إضافة شريحة</button><button class="btn" id="tsave">حفظ الشرائح</button></div>
      <div class="card" style="margin-top:14px"><h3 style="margin-bottom:8px">جرّبي حساب خصم</h3><div class="row"><input type="number" id="tsal" placeholder="المرتب الأساسي" style="width:170px"><input type="number" id="tmin" placeholder="دقايق التأخير" style="width:150px"><b id="tres"></b></div></div>`;
    if (!embedded) bindTabs(view, (t) => go(t));
    view.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { sync(); rows.splice(Number(b.dataset.rm), 1); draw(); }));
    $('#tadd').onclick = () => {
      sync();
      const last = rows[rows.length - 1];
      const from = !last ? grace + 1 : (isOpen(last.to_minutes) ? '' : Number(last.to_minutes) + 1);
      rows.push({ from_minutes: from, to_minutes: '', kind: 'day_fraction', value: '' });
      draw();
    };
    $('#tsave').onclick = (e) => run(e.target, async () => {
      sync();
      const r = await api('/late-tiers', 'PUT', { tiers: rows.map((x) => ({ from_minutes: x.from_minutes, to_minutes: x.to_minutes, kind: x.kind, value: x.value })) });
      rows = r.tiers.map((t) => ({ ...t }));
      draw(); toast('تم حفظ الشرائح');
    });
    ['#tsal', '#tmin'].forEach((id) => ($(id).oninput = calc));
    view.querySelectorAll('[data-f]').forEach((el) => (el.oninput = calc));
  };
  draw();
}
PAGES.tiers = (view) => tiersUI(view, false);
