'use strict';
// Документ Word (.docx) без зависимостей: ZIP (deflate из zlib) + WordprocessingML. Стиль — как КП MOST:
// Arial 10 pt, текст #333333, заголовки #111111, акцент #FF4D23, линии #DCDCDC, A4, поля 2 см.
// Модель: { title, subtitle, header: { left: [строки], right: [строки] }, blocks: [{h}|{h2}|{p}|{ul:[…]}|{ol:[…]}|{table:{head,rows,widths}}] }
const zlib = require('zlib');

// ---- ZIP ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) { // files: [{ name, data: Buffer|string }]
  const parts = [], central = []; let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'); const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8'); const comp = zlib.deflateRawSync(raw); const crc = crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(0, 10); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(0, 12); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, name, comp); central.push(ch, name); off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}

// ---- WordprocessingML ----
const C = { ink: '111111', body: '333333', grey: '8A8A8A', orange: 'FF4D23', rule: 'DCDCDC' };
const x = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// **жирный** внутри строки → отдельные run'ы
function runs(text, o) {
  o = o || {}; const out = []; const parts = String(text == null ? '' : text).split(/(\*\*[^*]+\*\*)/);
  for (const p of parts) { if (!p) continue; const bold = o.bold || /^\*\*[^*]+\*\*$/.test(p); const t = bold && !o.bold ? p.slice(2, -2) : p;
    const lines = t.split('\n'); lines.forEach((ln, i) => { out.push(`<w:r><w:rPr>${bold ? '<w:b/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}${o.size ? `<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>` : ''}${o.caps ? '<w:caps/>' : ''}</w:rPr>${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${x(ln)}</w:t></w:r>`); }); }
  return out.join('');
}
const para = (text, o) => { o = o || {}; return `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.num ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${o.num}"/></w:numPr>` : ''}<w:spacing w:before="${o.before || 0}" w:after="${o.after == null ? 80 : o.after}"/>${o.align ? `<w:jc w:val="${o.align}"/>` : ''}${o.rule ? `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="${C.orange}"/></w:pBdr>` : ''}</w:pPr>${runs(text, o)}</w:p>`; };
const W = 9638; // ширина текста A4 при полях 2 см, twips
function table(t) {
  const head = t.head || []; const rows = t.rows || []; const n = Math.max(head.length, ...rows.map(r => r.length), 1);
  const widths = (t.widths && t.widths.length === n ? t.widths : null) || (n === 3 && /^№/.test(head[0] || '') ? [600, 3600, 5438] : Array(n).fill(Math.floor(W / n)));
  const cell = (v, w, o) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ''}</w:tcPr>${String(v == null ? '' : v).split(/\n{2,}/).map(pp => para(pp, { after: 40, bold: o.bold, color: o.color, size: 19 })).join('') || para('', {})}</w:tc>`;
  const tr = (r, o) => `<w:tr>${o.head ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${Array.from({ length: n }, (_, i) => cell(r[i], widths[i], o)).join('')}</w:tr>`;
  const bd = `<w:top w:val="single" w:sz="4" w:color="${C.rule}"/><w:left w:val="single" w:sz="4" w:color="${C.rule}"/><w:bottom w:val="single" w:sz="4" w:color="${C.rule}"/><w:right w:val="single" w:sz="4" w:color="${C.rule}"/><w:insideH w:val="single" w:sz="4" w:color="${C.rule}"/><w:insideV w:val="single" w:sz="4" w:color="${C.rule}"/>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblBorders>${bd}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${head.length ? tr(head, { head: true, bold: true, fill: 'F2F2F2', color: C.ink }) : ''}${rows.map(r => tr(r, {})).join('')}</w:tbl>${para('', { after: 60 })}`;
}
// шапка «Утверждаю / Согласовано» — таблица без рамок в две колонки
function sides(h) {
  const l = h.left || [], r = h.right || []; const n = Math.max(l.length, r.length);
  const cell = arr => `<w:tc><w:tcPr><w:tcW w:w="${W / 2}" w:type="dxa"/></w:tcPr>${arr.map(s => para(s, { after: 20, size: 19 })).join('') || para('', {})}</w:tc>`;
  return n ? `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="${W / 2}"/><w:gridCol w:w="${W / 2}"/></w:tblGrid><w:tr>${cell(l)}${cell(r)}</w:tr></w:tbl>${para('', { after: 120 })}` : '';
}
function body(m) {
  const out = [];
  if (m.topRight) out.push(...[].concat(m.topRight).map(s => para(s, { align: 'right', after: 0, size: 18, color: C.grey })));
  if (m.header) out.push(sides(m.header));
  if (m.title) out.push(para(m.title, { style: 'Title', rule: true, after: 120 }));
  if (m.subtitle) out.push(para(m.subtitle, { color: C.grey, after: 200 }));
  for (const b of m.blocks || []) {
    if (b.h) out.push(para(b.h, { style: 'Heading1', before: 200, after: 80 }));
    else if (b.h2) out.push(para(b.h2, { style: 'Heading2', before: 120, after: 60 }));
    else if (b.ul) for (const s of b.ul) out.push(para(s, { num: 1, after: 40 }));
    else if (b.ol) for (const s of b.ol) out.push(para(s, { num: 2, after: 40 }));
    else if (b.table) out.push(table(b.table));
    else if (b.p != null) out.push(para(b.p, {}));
  }
  if (m.footer) out.push(para(m.footer, { color: C.grey, size: 16, before: 240 }));
  return out.join('');
}
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="${C.body}"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="${C.ink}"/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="${C.ink}"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="${C.orange}"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:style>
</w:styles>`;
const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="–"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="260"/></w:pPr></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="400" w:hanging="300"/></w:pPr></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`;
function build(m) {
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body(m)}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1133" w:right="1133" w:bottom="1133" w:left="1133" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return zip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>' },
    { name: 'word/document.xml', data: doc }, { name: 'word/styles.xml', data: STYLES }, { name: 'word/numbering.xml', data: NUMBERING },
  ]);
}
module.exports = { build, zip, crc32 };
