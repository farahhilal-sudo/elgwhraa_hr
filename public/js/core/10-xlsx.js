'use strict';
/* core/10-xlsx.js — تصدير Excel حقيقي (.xlsx) من غير أي مكتبة: كاتب ZIP (بدون ضغط) + XML.
   الشكل المعتمد لسجل الحضور: عنوان مدموج، رأس أزرق، حدود رفيعة، اتجاه من اليمين لليسار، تجميد، فلتر، Landscape. */
const XL = (() => {
  let _enc = null; const enc = { encode: (t) => (_enc = _enc || new TextEncoder()).encode(t) }; // كسول (عشان بيئة الاختبار)
  let _crc = null; const crcTable = () => _crc || (_crc = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })());
  const crc32 = (b) => { const CRC = crcTable(); let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files) { // files: [[path, string]]
    const now = new Date(), dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff, dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
    const parts = [], central = []; let off = 0;
    for (const [name, text] of files) {
      const nb = enc.encode(name), data = enc.encode(text), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, dt, true); lh.setUint16(12, dd, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nb, data);
      const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, dt, true); ch.setUint16(14, dd, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), nb);
      off += 30 + nb.length + data.length;
    }
    const csz = central.reduce((s, x) => s + x.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csz, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  const x = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const colName = (i) => String.fromCharCode(65 + i);
  const cell = (r, c, v, s) => `<c r="${colName(c)}${r}" s="${s}"${typeof v === 'number' ? '' : ' t="inlineStr"'}>${v === null || v === '' || v === undefined ? '' : typeof v === 'number' ? `<v>${v}</v>` : `<is><t xml:space="preserve">${x(v)}</t></is>`}</c>`;
  /* opts: { title, headers[], rows[][], widths[], sheet } */
  function build(opts) {
    const n = opts.headers.length, last = colName(n - 1), total = opts.rows.length + 2;
    let sd = `<row r="1">${opts.headers.map((_, i) => cell(1, i, i === 0 ? opts.title : '', 1)).join('')}</row>`;
    sd += `<row r="2" ht="37.5" customHeight="1">${opts.headers.map((h, i) => cell(2, i, h, 2)).join('')}</row>`;
    opts.rows.forEach((r, ri) => { sd += `<row r="${ri + 3}">${opts.headers.map((_, i) => cell(ri + 3, i, r[i] === undefined || r[i] === '' ? '-' : r[i], 3)).join('')}</row>`; });
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${last}${total}"/>
<sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane xSplit="1" ySplit="2" topLeftCell="B3" activePane="bottomRight" state="frozen"/><selection pane="topRight"/><selection pane="bottomLeft"/><selection pane="bottomRight" activeCell="B3" sqref="B3"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/><cols>${opts.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${sd}</sheetData>
<autoFilter ref="A2:${last}${total}"/><mergeCells count="1"><mergeCell ref="A1:${last}1"/></mergeCells><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><pageSetup orientation="landscape"/></worksheet>`;
    const sn = x(opts.sheet || 'Sheet1');
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="14"/><color rgb="FF39A4DC"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF39A4DC"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    return zip([
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="${sn}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${sn}'!$A$2:$${last}$${total}</definedName></definedNames></workbook>`],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['xl/styles.xml', styles],
      ['xl/worksheets/sheet1.xml', sheet],
    ]);
  }
  function download(filename, opts) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(build(opts)); a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  return { build, download };
})();

/* ---- سجل الحضور بصيغة Excel (شكل الملف المعتمد) ---- */
const attStamp = () => { const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).reduce((o, x) => ((o[x.type] = x.value), o), {}); return `${p.year}-${p.month}-${p.day}_${p.hour}-${p.minute}-${p.second}`; };
const attDT = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso), p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const t = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: true }).format(d);
  return `${p} ${t}`;
};
// يبني أيام موظف (من الأحدث للأقدم) بنفس منطق تبويب الحضور: kind = ok | late | abs | off | leave | wait
async function attDaysOf(u, from, to, recs, summary) {
  const weekend = String(S.me.settings.weekend_days || '').split(',').filter(Boolean).map(Number), today = todayStr();
  if (to > today) to = today;
  const by = Object.fromEntries(recs.map((r) => [r.date, r])), leave = new Set();
  ((summary && summary.requests) || []).filter((r) => r.status === 'approved' && ['annual_leave', 'sick_leave', 'emergency_leave', 'work_mission'].includes(r.type)).forEach((r) => { for (let d = r.from_date; d <= r.to_date; d = addDays(d, 1)) leave.add(d); });
  const out = [];
  for (let d = to; d >= from; d = addDays(d, -1)) {
    const w = new Date(d + 'T00:00:00Z').getUTCDay(), a = by[d]; let kind = null;
    if (a && a.check_in) kind = a.late_minutes > 0 ? 'late' : 'ok';
    else if (leave.has(d)) kind = 'leave';
    else if (weekend.includes(w)) kind = 'off';
    else if (d < today && d >= (u.hire_date || '0000')) kind = 'abs';
    else if (d === today) kind = 'wait';
    if (kind) out.push({ d, a, kind });
  }
  return out;
}
async function exportAttHistory(users, from, to, onlyKinds) {
  const tiers = ((await api('/late-tiers').catch(() => ({ tiers: [] }))).tiers || []).slice().sort((a, b) => a.from_minutes - b.from_minutes);
  const open = (v) => v === '' || v === null || v === undefined;
  const label = (x) => {
    if (x.kind === 'ok') return 'في الموعد';
    if (x.kind === 'late') { const i = tiers.findIndex((t) => x.a.late_minutes >= t.from_minutes && (open(t.to_minutes) || x.a.late_minutes <= t.to_minutes)); return i >= 0 ? `تأخير شريحة ${i + 1}` : 'متأخر'; }
    return { off: 'عطلة نهاية الأسبوع', leave: 'إجازة', abs: 'غائب', wait: 'لم يسجل الحضور بعد' }[x.kind];
  };
  const rows = [];
  for (const u of users) {
    const [recs, sm] = await Promise.all([api(`/attendance?user_id=${u.id}&from=${from}&to=${to}`), api(`/employees/${u.id}/summary`).catch(() => null)]);
    for (const x of await attDaysOf(u, from, to, recs, sm)) {
      if (onlyKinds && !onlyKinds(x)) continue;
      const a = x.a, by = a && a.edited_by_name;
      rows.push([u.name, x.d, label(x), a ? attDT(a.check_in) : '-', a ? attDT(a.check_out) : '-', by ? (a.edited_by === a.user_id ? 'الموظف' : 'المدير') : '-', by || '-']);
    }
  }
  XL.download(`سجل_الحضور_Attendance_History_${attStamp()}.xlsx`, {
    title: `سجل الحضور (${from} - ${to})`, sheet: 'Sheet1',
    headers: ['اسم الموظف', 'التاريخ', 'الحالة', 'وقت الحضور', 'وقت الانصراف', 'تم التعديل بواسطة', 'اسم من قام بالتعديل'],
    widths: [27, 12, 18.9, 21.5, 21.5, 17.9, 20], rows,
  });
}
