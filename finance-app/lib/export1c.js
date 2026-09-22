'use strict';
// CSV для обмена с 1С/Excel: UTF-8 с BOM, разделитель ';'.
function esc(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCSV(rows, columns) {
  // columns: [{key, title}]
  const lines = [columns.map(c => esc(c.title)).join(';')];
  for (const r of rows) lines.push(columns.map(c => esc(r[c.key])).join(';'));
  return '﻿' + lines.join('\r\n');
}
// простой парсер CSV: авто-разделитель ; или , ; кавычки; BOM
function parseCSV(text) {
  text = String(text || '').replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/)[0] || '';
  const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim());
  return rows.slice(1).filter(r => r.some(x => x.trim() !== '')).map(r => {
    const o = {}; header.forEach((h, i) => o[h] = (r[i] || '').trim()); return o;
  });
}
const INVOICE_COLS = [
  { key: 'invoiceDate', title: 'Дата' }, { key: 'company', title: 'Компания' }, { key: 'contractor', title: 'Контрагент' },
  { key: 'amount', title: 'Сумма' }, { key: 'purpose', title: 'Назначение' }, { key: 'project', title: 'Проект' }, { key: 'status', title: 'Статус' },
];
const DOC_COLS = [
  { key: 'createdAt', title: 'Создан' }, { key: 'type', title: 'Тип' }, { key: 'client', title: 'Клиент' }, { key: 'project', title: 'Проект' },
  { key: 'amount', title: 'Сумма' }, { key: 'description', title: 'Описание' }, { key: 'status', title: 'Статус' }, { key: 'doneAt', title: 'Выполнен' },
];
module.exports = { toCSV, parseCSV, INVOICE_COLS, DOC_COLS };
