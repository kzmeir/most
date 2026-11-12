/* Разбор банковской выписки (Kaspi Business, PDF) по координатам текста.
   Вход: страницы [{height, items:[{x0,x1,top,text}]}] — из pdf.js (браузер) или pdfplumber (тесты).
   Выход: {meta:{iban, client, from, to, opening, closing}, ops:[{date, opNo, debit, credit, counterparty, purpose, knp}]}. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.MostStatement = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const DATE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
  const AMOUNT = /^[\d][\d\s ]*([,.]\d{2})?$/;
  const money = s => { s = String(s).replace(/[\s ]/g, ''); const m = s.match(/^(\d+)(?:[,.](\d{2}))?$/); return m ? Number(m[1]) + (m[2] ? Number(m[2]) / 100 : 0) : 0; };
  const iso = d => { const m = d.match(DATE); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };

  // строки по вертикали (допуск 2.5pt), слова слева направо
  function lines(page) {
    const rows = [];
    for (const it of [...page.items].sort((a, b) => a.top - b.top || a.x0 - b.x0)) {
      const r = rows[rows.length - 1];
      if (r && Math.abs(r.top - it.top) <= 2.5) r.items.push(it); else rows.push({ top: it.top, items: [it] });
    }
    for (const r of rows) r.items.sort((a, b) => a.x0 - b.x0);
    return rows;
  }
  const textOf = r => r.items.map(i => i.text).join(' ');

  // границы колонок по заголовку таблицы (Дебет / Кредит / Наименование / ИИК / БИК / КНП / Назначение)
  function columns(pages) {
    const c = { debit: null, credit: null, cp: null, iik: null, bik: null, knp: null, purpose: null, date: null };
    for (const p of pages) for (const it of p.items) {
      const t = it.text.toLowerCase();
      if (!c.debit && t === 'дебет') c.debit = it; if (!c.credit && t === 'кредит') c.credit = it;
      if (!c.cp && t === 'наименование' && it.x0 > 250) c.cp = it; if (!c.iik && t === 'иик') c.iik = it;
      if (!c.bik && t === 'бик') c.bik = it; if (!c.knp && t === 'кнп') c.knp = it;
      if (!c.purpose && t === 'назначение' && it.x0 > 500) c.purpose = it;
      if (!c.date && t === 'дата' && it.x0 > 60 && it.x0 < 200) c.date = it;
    }
    const mid = (a, b) => (a.x0 + a.x1) / 2 * 0 + ((a.x0 + a.x1) / 2 + (b.x0 + b.x1) / 2) / 2;
    return {
      amtFrom: c.debit ? c.debit.x0 - 25 : 175, amtTo: c.credit ? c.credit.x1 + 25 : 310,
      creditMid: c.debit && c.credit ? mid(c.debit, c.credit) : 233,
      cpFrom: c.cp ? c.cp.x0 - 25 : 300, iikFrom: c.iik ? c.iik.x0 - 12 : 450, knpFrom: c.knp ? c.knp.x0 - 10 : 612, purposeFrom: c.knp ? c.knp.x1 + 18 : (c.purpose ? c.purpose.x0 - 30 : 655),
      numTo: c.date ? c.date.x0 - 5 : 90,
    };
  }

  function parse(pages) {
    const col = columns(pages);
    const meta = { iban: '', client: '', from: '', to: '', opening: null, closing: null };
    const ops = []; let cur = null, lastDate = '', lastNo = '';
    for (const page of pages) {
      for (const row of lines(page)) {
        const text = textOf(row);
        // шапка
        let m;
        if ((m = text.match(/Лицевой счет:\s*(KZ\w+)/i))) { meta.iban = m[1]; continue; }
        if ((m = text.match(/Наименование клиента:\s*(.+)$/i))) { meta.client = m[1].trim(); continue; }
        if ((m = text.match(/Период:\s*(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})/))) { meta.from = iso(m[1]); meta.to = iso(m[2]); continue; }
        if ((m = text.match(/Входящий остаток\s*([\d\s ]+(?:[,.]\d{2})?)/))) { meta.opening = money(m[1]); continue; }
        if ((m = text.match(/Исходящий остаток\s*([\d\s ]+(?:[,.]\d{2})?)/))) { meta.closing = money(m[1]); continue; }
        // строки таблицы (шапку с нумерацией колонок 1..9 пропускаем)
        if (row.items.length >= 5 && row.items.every(i => /^\d$/.test(i.text.trim()))) continue;
        if (/итого|оборот/i.test(text)) { cur = null; continue; }
        let date = '', no = '', amtItems = [], cp = [], purpose = [], knp = '';
        for (const it of row.items) {
          const t = it.text.trim(); if (!t) continue;
          if (DATE.test(t) && it.x0 < col.amtFrom) { date = iso(t); continue; }
          if (it.x0 < col.numTo && /^\d+$/.test(t)) { no = t; continue; }
          if (it.x0 >= col.amtFrom && it.x1 <= col.amtTo + 5 && AMOUNT.test(t)) { amtItems.push(it); continue; }
          if (it.x0 >= col.purposeFrom) { purpose.push(t); continue; }
          if (it.x0 >= col.knpFrom && it.x0 < col.purposeFrom) { if (/^\d{3}$/.test(t)) knp = t; continue; }
          if (it.x0 >= col.iikFrom) continue; // ИИК / БИК
          if (it.x0 >= col.cpFrom) { cp.push(t); continue; }
        }
        if (date) lastDate = date; if (no) lastNo = no;
        let amount = 0, credit = false;
        if (amtItems.length) {
          amount = money(amtItems.map(i => i.text).join(''));
          const center = (Math.min(...amtItems.map(i => i.x0)) + Math.max(...amtItems.map(i => i.x1))) / 2;
          credit = center >= col.creditMid;
        }
        if (amount > 0 && amount <= 5e9) {
          cur = { date: lastDate, opNo: lastNo, debit: credit ? 0 : amount, credit: credit ? amount : 0, counterparty: cp.join(' '), purpose: purpose.join(' '), knp };
          ops.push(cur); continue;
        }
        if (cur && (cp.length || purpose.length) && !date) { if (cp.length) cur.counterparty = (cur.counterparty + ' ' + cp.join(' ')).trim(); if (purpose.length) cur.purpose = (cur.purpose + ' ' + purpose.join(' ')).trim(); if (knp && !cur.knp) cur.knp = knp; }
      }
    }
    for (const o of ops) {
      o.counterparty = cleanCounterparty(o.counterparty); o.purpose = o.purpose.replace(/\s+/g, ' ').trim();
      if (!o.date) o.date = meta.to || '';
    }
    return { meta, ops: ops.filter(o => o.counterparty || o.purpose) };
  }
  // «ТОО "ПрофТорг" БИН/ИИН 140340012297» → «ТОО "ПрофТорг"»
  function cleanCounterparty(s) {
    s = String(s || '').replace(/\s+/g, ' ');
    s = s.split(/\s*(?:БИН\/ИИН|БИН|ИИН)(?=\s|$)/i)[0];
    return s.replace(/\s+\d{12}$/, '').trim();
  }
  // подбор счёта по выписке: IBAN в справочнике или по названию клиента
  function guessAccount(meta, accounts) {
    const byIban = accounts.find(a => a.iban && meta.iban && a.iban.toUpperCase() === meta.iban.toUpperCase());
    if (byIban) return byIban.id;
    const client = (meta.client || '').toUpperCase();
    const company = client.includes('ARCHITECTS') ? 'MOST Architects' : client.includes('PROJECT') ? 'MOST Project' : '';
    const a = accounts.filter(x => x.active !== false && x.company === company).sort((x, y) => (/kaspi/i.test(y.name || '') ? 1 : 0) - (/kaspi/i.test(x.name || '') ? 1 : 0))[0];
    return a ? a.id : (accounts[0] ? accounts[0].id : 'nal');
  }
  // ключ для поиска дубликатов среди существующих операций
  const dupKey = o => [o.account, o.date, Math.round(Number(o.debit) || 0), Math.round(Number(o.credit) || 0), String(o.opNo || '')].join('|');
  const dupKeyLoose = o => [o.account, o.date, Math.round(Number(o.debit) || 0), Math.round(Number(o.credit) || 0), String(o.counterparty || '').toLowerCase().replace(/[^a-zа-я0-9]/g, '').slice(0, 12)].join('|');
  // строгий ключ (с номером документа) или «мягкий» — но каждая существующая операция может закрыть только один дубликат
  function dedupe(newOps, existing) {
    const keys = new Set(), loose = new Map();
    for (const o of existing) { keys.add(dupKey(o)); const k = dupKeyLoose(o); loose.set(k, (loose.get(k) || 0) + 1); }
    const fresh = [], dup = [];
    for (const o of newOps) {
      const lk = dupKeyLoose(o);
      if (o.opNo && keys.has(dupKey(o))) { dup.push(o); loose.set(lk, (loose.get(lk) || 1) - 1); continue; }
      if ((loose.get(lk) || 0) > 0) { dup.push(o); loose.set(lk, loose.get(lk) - 1); continue; }
      fresh.push(o);
    }
    return { fresh, dup };
  }

  // pdf.js: текстовые элементы → items
  async function fromPdfJs(pdfjsLib, data) {
    const doc = await pdfjsLib.getDocument({ data }).promise; const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i); const vp = page.getViewport({ scale: 1 }); const tc = await page.getTextContent();
      const items = [];
      for (const it of tc.items) { if (!it.str || !it.str.trim()) continue; const t = it.transform; const [x, y] = vp.convertToViewportPoint(t[4], t[5]); const h = it.height || Math.hypot(t[2], t[3]) || 8; items.push({ x0: x, x1: x + (it.width || 0), top: y - h, text: it.str }); }
      pages.push({ height: vp.height, items });
    }
    return pages;
  }
  // выписка из Excel/CSV (Kaspi, Halyk и др.): колонки по заголовку — дата, дебет/кредит или сумма, контрагент, назначение, № документа
  const H = { date: /^дата(?!\s*валют)/i, debit: /дебет|расход|списан|debit/i, credit: /кредит|приход|поступ|зачисл|credit/i, amount: /^сумма|amount/i, cp: /контрагент|наименование|получател|плательщик|корреспондент|бенефициар|отправител/i, purpose: /назнач|детали|описание|основание|purpose/i, opNo: /№\s*док|номер\s*док|документ|референс|№\s*опер|номер\s*опер|reference|^№$/i, knp: /кнп/i, iban: /иик|iban|счет контрагента|счёт контрагента/i };
  const toIsoDate = v => { if (v == null || v === '') return ''; if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10); const s = String(v).trim(); let m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`; m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : ''; };
  const cellNum = v => { if (typeof v === 'number') return v; const s = String(v == null ? '' : v).replace(/[\s ]/g, '').replace(',', '.').replace(/[^\d.\-]/g, ''); const n = Number(s); return isNaN(n) ? 0 : n; };
  function fromRows(rows) {
    rows = (rows || []).map(r => Array.isArray(r) ? r : Object.values(r)).filter(r => r.some(c => c !== '' && c != null));
    let map = null, hdr = -1;
    for (let i = 0; i < Math.min(rows.length, 30) && !map; i++) {
      const m = {}; rows[i].forEach((c, j) => { if (typeof c !== 'string') return; const s = c.trim(); for (const [k, re] of Object.entries(H)) if (re.test(s) && m[k] === undefined) { m[k] = j; break; } });
      if (m.date !== undefined && (m.amount !== undefined || m.debit !== undefined || m.credit !== undefined) && (m.cp !== undefined || m.purpose !== undefined)) { map = m; hdr = i; }
    }
    if (!map) return { meta: {}, ops: [], mapping: null };
    const ops = []; const meta = { iban: '', client: '', from: '', to: '', opening: null, closing: null };
    for (const r of rows.slice(hdr + 1)) {
      const date = toIsoDate(r[map.date]); if (!date) continue;
      let debit = 0, credit = 0;
      if (map.debit !== undefined || map.credit !== undefined) { debit = Math.abs(cellNum(map.debit !== undefined ? r[map.debit] : 0)); credit = Math.abs(cellNum(map.credit !== undefined ? r[map.credit] : 0)); }
      else { const a = cellNum(r[map.amount]); if (a < 0) debit = -a; else credit = a; }
      if (!debit && !credit) continue;
      const text = r.map(String).join(' '); if (/итого|оборот|остаток/i.test(text) && !(map.cp !== undefined && String(r[map.cp] || '').trim())) continue;
      ops.push({ date, opNo: map.opNo !== undefined ? String(r[map.opNo] ?? '').replace(/\.0$/, '').trim() : '', debit, credit, counterparty: cleanCounterparty(map.cp !== undefined ? String(r[map.cp] ?? '') : ''), purpose: String(map.purpose !== undefined ? (r[map.purpose] ?? '') : '').replace(/\s+/g, ' ').trim(), knp: map.knp !== undefined ? String(r[map.knp] ?? '').trim() : '' });
    }
    if (ops.length) { meta.from = ops.reduce((m, o) => !m || o.date < m ? o.date : m, ''); meta.to = ops.reduce((m, o) => o.date > m ? o.date : m, ''); }
    return { meta, ops: ops.filter(o => o.counterparty || o.purpose), mapping: map };
  }
  return { parse, lines, columns, cleanCounterparty, guessAccount, dedupe, fromPdfJs, fromRows };
});
