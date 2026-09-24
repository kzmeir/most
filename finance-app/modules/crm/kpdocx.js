'use strict';
// КП в Word без зависимостей: ZIP (zlib) + WordprocessingML. Оформление повторяет генераторы КП директора (docx-js):
// Arial, текст #333333, заголовки разделов оранжевые с чёрной линией, таблицы с нижними линиями, логотип в шапке. Печать и подпись не вставляются — «М.П.».
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const KP = require('./kp');

// ---- ZIP ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) {
  const parts = [], central = []; let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'); const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8'); const comp = zlib.deflateRawSync(raw); const crc = crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, name, comp); central.push(ch, name); off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}

// ---- разметка ----
const C = { ink: '111111', body: '333333', grey: '8A8A8A', orange: 'FF4D23', rule: 'DCDCDC' };
const W = 9639;
const x = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r = (text, o) => { o = o || {}; return `<w:r><w:rPr>${o.bold ? '<w:b/>' : ''}${o.italic ? '<w:i/>' : ''}<w:color w:val="${o.color || C.body}"/><w:sz w:val="${o.size || 20}"/><w:szCs w:val="${o.size || 20}"/>${o.spacing ? `<w:spacing w:val="${o.spacing}"/>` : ''}</w:rPr><w:t xml:space="preserve">${x(text)}</w:t></w:r>`; };
const p = (runs, o) => { o = o || {}; return `<w:p><w:pPr>${o.keepNext ? '<w:keepNext/>' : ''}${o.keepLines ? '<w:keepLines/>' : ''}${o.border ? `<w:pBdr><w:bottom w:val="single" w:sz="${o.border.sz}" w:space="${o.border.space || 6}" w:color="${o.border.color}"/></w:pBdr>` : ''}<w:spacing w:before="${o.before || 0}" w:after="${o.after == null ? 0 : o.after}" w:line="${o.line || 250}" w:lineRule="auto"/>${o.indent ? `<w:ind w:left="${o.indent}" w:hanging="${o.indent}"/>` : ''}${o.align ? `<w:jc w:val="${o.align}"/>` : ''}</w:pPr>${runs}</w:p>`; };
const H = t => p(r(t, { bold: true, color: C.orange, size: 19, spacing: 6 }), { keepNext: true, border: { sz: 6, color: C.ink, space: 6 }, before: 200, after: 90 });
const sub = t => p(r(t, { bold: true, color: C.ink, size: 20 }), { keepNext: true, before: 110, after: 60 });
const bullet = (t, keep) => p(r('— ' + t, { size: 20 }), { keepNext: keep, after: 24, indent: 240 });
const note = t => t ? p(r(t, { italic: true, color: C.grey, size: 18 }), { before: 50, after: 40, line: 240 }) : '';
const gap = a => p('', { after: a });
// таблица с нижними линиями ячеек (как в шаблоне): rows — [[{ t, bold, right, color, size }]], head — строка-шапка
function table(widths, rows, o) {
  o = o || {}; const none = '<w:top w:val="nil"/><w:left w:val="nil"/><w:right w:val="nil"/>';
  const cell = (c, w, rule, sz, keep) => { c = typeof c === 'object' && c !== null ? c : { t: c };
    return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:tcBorders>${none}<w:bottom w:val="single" w:sz="${sz}" w:color="${rule}"/></w:tcBorders><w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar></w:tcPr>${p(r(c.t, { bold: c.bold, color: c.color || (c.bold ? C.ink : C.body), size: c.size || 19, spacing: c.spacing }), { keepNext: !!keep, keepLines: true, line: 240, align: c.right ? 'right' : '' })}</w:tc>`; };
  const tr = (row, hdr, total) => `<w:tr><w:trPr><w:cantSplit/>${hdr ? '<w:tblHeader/>' : ''}</w:trPr>${row.map((c, i) => cell(hdr ? Object.assign({ bold: true, color: C.orange, size: 15, spacing: 4 }, typeof c === 'object' ? c : { t: c }) : total ? Object.assign({ bold: true, color: C.ink }, typeof c === 'object' ? c : { t: c }) : c, widths[i], hdr || total ? C.ink : C.rule, hdr || total ? 8 : 4, hdr || o.keep)).join('')}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${o.head ? tr(o.head, true) : ''}${rows.map((row, i) => tr(row, false, o.total && i === rows.length - 1)).join('')}</w:tbl>`;
}
// логотип в строке (46×51 pt → EMU)
const logoRun = (cx, cy) => `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="logo"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

const fmt = n => Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const fmtA = n => { const v = Math.round((Number(n) || 0) * 100) / 100; const [i, d] = v.toFixed(2).split('.'); return fmt(+i) + (d !== '00' ? ',' + d : ''); };
const tg = n => fmt(n) + ' ₸';
const kk = n => String(n).replace('.', ',');

// документ: p — параметры (kp.kpParams), c — расчёт (kp.kpCalc), meta — { no, date, version }
function build(p0, c, meta) {
  const co = KP.COMPANIES[p0.company] || { name: p0.company, signer: '' }; const ct = KP.CONTACTS; const vp = kk(p0.vatRate) + ' %';
  const out = [];
  out.push(p(logoRun(438150, 485775) + r('    ' + co.name, { bold: true, color: C.ink, size: 17, spacing: 8 }), { after: 60 }));
  out.push(p(r(`${ct.address}   ·   ${ct.phone}   ·   ${ct.site}`, { color: C.grey, size: 16 }), { border: { sz: 8, color: C.ink, space: 8 }, align: 'right' }));
  out.push(gap(200));
  out.push(p(r('КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ', { bold: true, color: C.ink, size: 26, spacing: 8 }), { after: 80 }));
  out.push(p(r(`${p0.subject}${p0.object ? ': ' + p0.object : ''}`, { size: 21 }), { keepLines: true, after: 220, line: 260 }));
  const info = [['Объект', p0.object], ['Заказчик', p0.client], ['Адрес', p0.address], ['Стадия', p0.stage], ['Номер и дата', `${meta.no}${meta.version > 1 ? ` (ред. ${meta.version})` : ''} от ${KP.longDate(meta.date)}`]].filter(([, v]) => v);
  out.push(table([3000, 6639], info.map(([a, b]) => [{ t: a, color: C.grey, size: 18 }, { t: b, bold: true, color: C.ink, size: 20 }])));
  // 1. База расчёта
  out.push(H('1. БАЗА РАСЧЁТА СТОИМОСТИ'));
  const multi = c.rows.length > 1 || c.rows.some(x2 => x2.k !== 1);
  out.push(table([6639, 3000], [...c.rows.map(a => [{ t: a.name + (a.k !== 1 ? ` (коэф. ${kk(a.k)})` : ''), color: C.ink }, { t: fmtA(a.area) + ' м²', bold: true, right: true }]), ...(multi ? [[{ t: 'Итого расчётная площадь' }, { t: fmtA(c.area) + ' м²', right: true }]] : [])], { total: multi }));
  // 2. Стоимость
  out.push(H('2. СТОИМОСТЬ РАБОТ'));
  out.push(sub('2.1. Расчёт стоимости'));
  const w2 = [3739, 1500, 2100, 2300];
  out.push(table(w2, c.rows.map(a => [{ t: a.name, color: C.ink }, { t: fmtA(a.area), right: true }, { t: fmt(a.rate), right: true }, { t: tg(a.cost), bold: true, right: true }]), { head: ['Вид работ', { t: 'Площадь, м²', right: true }, { t: `Ставка ${c.vatTag}, ₸/м²`, right: true }, { t: `Стоимость ${c.vatTag}`, right: true }] }));
  out.push(gap(60));
  out.push(table([6639, 3000], [[{ t: 'Стоимость работ без НДС', color: C.ink }, { t: tg(c.net), bold: true, right: true }], [{ t: 'НДС ' + vp, color: C.ink }, { t: tg(c.vat), bold: true, right: true }], [{ t: 'Итого к оплате с НДС' }, { t: tg(c.gross), right: true }]], { total: true }));
  out.push(note(p0.vatIncluded ? `Ставка за 1 м² и стоимость приведены с учётом НДС ${vp}.` : `Ставка за 1 м² и стоимость приведены без НДС; НДС ${vp} начисляется сверху.`));
  out.push(sub('2.2. Этапы и порядок оплаты'));
  const w3 = [3339, 900, 1800, 1700, 1900];
  out.push(table(w3, [...c.stages.map(s => [{ t: s.name, color: C.ink }, { t: kk(s.share) + ' %', right: true }, { t: tg(s.net), right: true }, { t: tg(s.vat), right: true }, { t: tg(s.gross), bold: true, right: true }]), [{ t: 'Итого' }, { t: kk(c.shares) + ' %', right: true }, { t: tg(c.net), right: true }, { t: tg(c.vat), right: true }, { t: tg(c.gross), right: true }]], { head: ['Этап', { t: 'Доля', right: true }, { t: 'Без НДС', right: true }, { t: 'НДС ' + vp, right: true }, { t: 'С НДС', right: true }], total: true }));
  if (p0.excluded.length) { out.push(sub('Не входит в стоимость')); out.push(table([6639, 3000], p0.excluded.map(([a, b]) => [{ t: a, color: C.ink }, { t: b, right: true }]), { head: ['Наименование', { t: 'Условие', right: true }] })); }
  // 3. Состав работ
  let n = 3; out.push(H(`${n++}. СОСТАВ РАБОТ`));
  for (const [t, items] of p0.scope) { if (t) out.push(sub(t)); items.forEach((it, i) => out.push(bullet(it, i < items.length - 1))); }
  // 4. Сроки
  const terms = p0.terms.length ? p0.terms : p0.stages.filter(s => s.term).map(s => ({ name: s.name, term: s.term }));
  if (terms.length) { out.push(H(`${n++}. СРОКИ ВЫПОЛНЕНИЯ`)); out.push(table([6639, 3000], terms.map(t => [{ t: t.name, color: C.ink, size: 20 }, { t: t.term, bold: true, right: true, size: 20 }]))); out.push(note(p0.termsNote)); }
  // 5. Условия
  out.push(H(`${n++}. УСЛОВИЯ`)); p0.conditions.forEach((t, i) => out.push(bullet(t, i < p0.conditions.length - 1)));
  // подпись — без печати и подписи, место «М.П.»
  out.push(gap(100));
  out.push(p(r(co.name, { bold: true, color: C.ink, size: 21 }), { keepNext: true, after: 40 }));
  for (const t of [ct.address, ct.phone, ct.site]) out.push(p(r(t, { size: 18 }), { keepNext: true, after: 20 }));
  out.push(gap(360));
  out.push(p(r('Директор', { color: C.ink }) + r('            _________________          ', { color: C.grey }) + r(co.signer || '________________', { color: C.ink }), { keepNext: true, keepLines: true, after: 200 }));
  out.push(p(r('М.П.', { color: C.grey, size: 18 }), { after: 0 }));
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${out.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1133" w:right="1133" w:bottom="1133" w:left="1133" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="${C.body}"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="250" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${x(`Коммерческое предложение ${meta.no} — ${p0.object || ''}`)}</dc:title><dc:creator>${x(co.name)}</dc:creator></cp:coreProperties>`;
  const logo = fs.readFileSync(path.join(__dirname, 'assets', 'logo.png'));
  return zip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
    { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/></Relationships>' },
    { name: 'word/document.xml', data: doc }, { name: 'word/styles.xml', data: styles }, { name: 'word/media/logo.png', data: logo }, { name: 'docProps/core.xml', data: core },
  ]);
}
module.exports = { build, zip, crc32 };
