/* Минимальный читатель .xlsx без зависимостей (zip → sharedStrings → листы).
   Node: MostXlsx.parse(buffer) — распаковка через zlib. Браузер: через DecompressionStream('deflate-raw').
   Результат: { sheets: [{ name, rows: [[ячейки...]] }] } — числа как number, даты как 'ГГГГ-ММ-ДД', остальное строки. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.MostXlsx = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const td = new TextDecoder('utf-8');
  const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
  const u16 = (b, i) => b[i] | (b[i + 1] << 8);

  async function inflateRaw(data) {
    if (typeof module !== 'undefined' && module.exports) { const zlib = require('zlib'); return new Uint8Array(zlib.inflateRawSync(Buffer.from(data))); }
    if (typeof DecompressionStream === 'undefined') throw new Error('Браузер не поддерживает распаковку xlsx (нужен Chrome 80+, Safari 16.4+, Firefox 113+)');
    const ds = new DecompressionStream('deflate-raw');
    const w = ds.writable.getWriter(); w.write(data); w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }

  // zip: читаем центральный каталог
  async function unzip(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 70000); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Это не zip/xlsx файл');
    const count = u16(b, eocd + 10), cdOff = u32(b, eocd + 16);
    const files = {}; let p = cdOff;
    for (let n = 0; n < count; n++) {
      if (u32(b, p) !== 0x02014b50) break;
      const method = u16(b, p + 10), csize = u32(b, p + 20), usize = u32(b, p + 24), nlen = u16(b, p + 28), elen = u16(b, p + 30), clen = u16(b, p + 32), lho = u32(b, p + 42);
      const name = td.decode(b.subarray(p + 46, p + 46 + nlen));
      files[name] = { method, csize, usize, lho }; p += 46 + nlen + elen + clen;
    }
    const read = async name => {
      const f = files[name]; if (!f) return null;
      const h = f.lho; const nlen = u16(b, h + 26), elen = u16(b, h + 28); const start = h + 30 + nlen + elen;
      const raw = b.subarray(start, start + f.csize);
      if (f.method === 0) return raw;
      if (f.method === 8) return inflateRaw(raw);
      throw new Error('Неподдерживаемый метод сжатия ' + f.method);
    };
    return { names: Object.keys(files), read, text: async name => { const d = await read(name); return d ? td.decode(d) : null; } };
  }

  const unesc = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const colIndex = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
  const serialToDate = v => { const ms = Math.round((v - 25569) * 86400000); const d = new Date(ms); return isNaN(d) ? '' : d.toISOString().slice(0, 10); };
  const DATE_FMT = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 36, 45, 46, 47, 50, 57, 58]);

  async function parse(bytes) {
    const z = await unzip(bytes);
    // shared strings
    const sst = []; const ss = await z.text('xl/sharedStrings.xml');
    if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) sst.push(unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')));
    // styles: какие cellXfs — даты
    const dateXf = new Set(); const st = await z.text('xl/styles.xml');
    if (st) {
      const custom = new Set();
      for (const m of st.matchAll(/<numFmt\s[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) { const code = m[2].replace(/\[[^\]]*\]/g, '').replace(/&quot;[^&]*&quot;/g, ''); if (/[dmyдмг]/i.test(code) && !/[#0]/.test(code)) custom.add(Number(m[1])); }
      const xfs = st.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/); let i = 0;
      if (xfs) for (const m of xfs[1].matchAll(/<xf\s[^>]*?(?:\/>|>)/g)) { const id = m[0].match(/numFmtId="(\d+)"/); const n = id ? Number(id[1]) : 0; if (DATE_FMT.has(n) || custom.has(n)) dateXf.add(i); i++; }
    }
    // sheets
    const sheets = []; const wb = await z.text('xl/workbook.xml'); const rels = await z.text('xl/_rels/workbook.xml.rels');
    const relMap = {}; if (rels) for (const m of rels.matchAll(/<Relationship\s[^>]*>/g)) { const id = m[0].match(/Id="([^"]+)"/), tg = m[0].match(/Target="([^"]+)"/); if (id && tg) relMap[id[1]] = tg[1].replace(/^\/?(xl\/)?/, 'xl/'); }
    const list = [];
    if (wb) for (const m of wb.matchAll(/<sheet\s[^>]*>/g)) { const nm = m[0].match(/name="([^"]*)"/), rid = m[0].match(/r:id="([^"]+)"/); list.push({ name: nm ? unesc(nm[1]) : 'Лист', path: rid && relMap[rid[1]] ? relMap[rid[1]] : null }); }
    if (!list.length) list.push({ name: 'Лист1', path: 'xl/worksheets/sheet1.xml' });
    for (let k = 0; k < list.length; k++) {
      const s = list[k]; const xml = await z.text(s.path || `xl/worksheets/sheet${k + 1}.xml`); if (!xml) continue;
      const rows = [];
      for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
        const row = [];
        for (const cm of rm[1].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const attrs = cm[1], inner = cm[2] || '';
          const r = attrs.match(/\br="([A-Z]+)\d+"/); const ci = r ? colIndex(r[1]) : row.length;
          const t = (attrs.match(/\bt="(\w+)"/) || [])[1], sIdx = Number((attrs.match(/\bs="(\d+)"/) || [])[1] || -1);
          const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          let val = '';
          if (t === 's') val = sst[Number(v)] ?? '';
          else if (t === 'inlineStr') val = unesc([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''));
          else if (t === 'str' || t === 'e') val = v === undefined ? '' : unesc(v);
          else if (t === 'b') val = v === '1';
          else if (v !== undefined && v !== '') { const n = Number(v); val = isNaN(n) ? unesc(v) : (dateXf.has(sIdx) && n > 20000 && n < 80000 ? serialToDate(n) : n); }
          while (row.length < ci) row.push('');
          row[ci] = val;
        }
        rows.push(row);
      }
      sheets.push({ name: s.name, rows });
    }
    return { sheets };
  }
  return { parse, unzip };
});
