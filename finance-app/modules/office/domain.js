/* Модуль «Документы и канцелярия» — чистая логика (Node: require, браузер: window.MostOffice).
   Права, автонумерация, статусы и сроки писем, шаблоны печатных форм. Бухгалтерские документы — в 1С, здесь их нет. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.MostOffice = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- роли ----------
  const LEADERS = ['owner', 'partner'];
  const isLeader = u => !!u && LEADERS.includes(u.role);
  const isClerk = u => !!u && (isLeader(u) || u.role === 'secretary');          // канцелярия: создаёт и правит всё, удаляет только руководитель
  const isReader = u => !!u && (isClerk(u) || u.role === 'accountant');          // видит все письма, накладные, приказы
  const isProjectRole = u => !!u && (u.role === 'gip' || u.role === 'pm');      // ГИП/ПМ — письма и накладные своих проектов
  const canDelete = u => isLeader(u);
  const canTemplates = u => isLeader(u);                                          // шаблоны и реквизиты компаний правят руководители
  const canOpen = u => !!u;                                                       // модуль видят все: свои письма и ознакомление с приказами

  // ---------- компании и нумерация ----------
  const COMPANY_CODES = { 'MOST Project': 'MP', 'MOST Architects': 'MA', 'ИП MOST Design': 'MD', 'ИП PANA Design': 'PD' };
  function companyCode(name) {
    if (COMPANY_CODES[name]) return COMPANY_CODES[name];
    const latin = String(name || '').replace(/^(ТОО|ИП)\s+/i, '').match(/[A-Za-z]+/g);
    return latin ? latin.map(w => w[0]).join('').toUpperCase().slice(0, 3) : 'XX';
  }
  const PREFIX = { in: 'ВХ', out: 'ИСХ', issue: 'НК', order: 'ПР' };
  const yearOf = d => String(d || '').slice(0, 4) || String(new Date().getFullYear());
  // следующий номер: ‹префикс›-‹код компании›-‹год›-‹001› — сквозной по виду документа, компании и году
  function nextNumber(list, kind, company, date) {
    const y = yearOf(date);
    const seq = 1 + list.filter(x => x.kind === kind && x.company === company && yearOf(x.date) === y).reduce((m, x) => Math.max(m, Number(x.seq) || 0), 0);
    return { seq, no: `${PREFIX[kind]}-${companyCode(company)}-${y}-${String(seq).padStart(3, '0')}` };
  }

  // ---------- письма ----------
  const LETTER_STATUS = {
    in: [['new', 'Новое'], ['work', 'В работе'], ['answered', 'Ответ отправлен'], ['closed', 'Закрыто']],
    out: [['draft', 'Черновик'], ['sent', 'Отправлено'], ['closed', 'Закрыто']],
  };
  const OPEN_IN = ['new', 'work'];
  const statusLabel = (dir, s) => ((LETTER_STATUS[dir] || []).find(x => x[0] === s) || [s, s])[1];
  const isWaiting = l => l.dir === 'in' && OPEN_IN.includes(l.status);          // ждёт ответа
  const isOverdue = (l, today) => isWaiting(l) && !!l.due && l.due < today;      // просрочено
  const daysLeft = (l, today) => l.due ? Math.round((Date.parse(l.due) - Date.parse(today)) / 864e5) : null;

  // ---------- выдача документации (накладные) ----------
  const ISSUE_METHOD = [['paper', 'Бумага'], ['electronic', 'Электронно'], ['both', 'Бумага и электронно']];
  // строки комплекта: «Марка | Наименование | Листов | Изм. | Экз.» — по строке на комплект
  function parseItems(text) {
    return String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
      const [mark, title, sheets, rev, copies] = l.split('|').map(s => (s || '').trim());
      return { mark: mark || '', title: title || '', sheets: sheets || '', rev: rev || '', copies: copies || '' };
    });
  }
  const itemsToText = items => (items || []).map(i => [i.mark, i.title, i.sheets, i.rev, i.copies].join(' | ')).join('\n');

  // ---------- приказы ----------
  const ORDER_TYPES = [['appoint', 'О назначении ГИП / ПМ'], ['vacation', 'Об отпуске'], ['bonus', 'О премировании'], ['other', 'Прочее']];
  const orderTypeLabel = t => (ORDER_TYPES.find(x => x[0] === t) || [t, 'Прочее'])[1];

  // ---------- файлы ----------
  const MAX_FILE = 20 * 1024 * 1024;
  const FILE_TYPES = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', jpg: 'image/jpeg', png: 'image/png' };
  const KEY_RE = /^[a-z0-9]+-[a-z0-9]+\.(pdf|docx|xlsx|jpg|png)$/;
  function extOf(name) { const e = String(name || '').toLowerCase().split('.').pop(); return e === 'jpeg' ? 'jpg' : e; }
  // сигнатура содержимого должна совпадать с расширением (docx/xlsx — zip-архивы)
  function signatureOk(ext, buf) {
    if (!buf || buf.length < 4) return false;
    if (ext === 'pdf') return buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;            // %PDF
    if (ext === 'png') return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    if (ext === 'jpg') return buf[0] === 0xff && buf[1] === 0xd8;
    if (ext === 'docx' || ext === 'xlsx') return buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04; // PK
    return false;
  }

  // ---------- шаблоны ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // {{поле}} — текст (экранируется), {{{поле}}} — готовый HTML (таблицы, абзацы, собранные сервером)
  function render(tpl, data) {
    return String(tpl || '').replace(/\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{\s*([\w.]+)\s*\}\}/g, (m, raw, txt) => {
      const key = raw || txt; const v = key.split('.').reduce((o, k) => (o == null ? o : o[k]), data);
      return raw ? String(v == null ? '' : v) : esc(v);
    });
  }
  const paragraphs = text => String(text || '').split(/\r?\n\s*\r?\n|\r?\n/).map(p => p.trim()).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('');
  const fdate = d => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : String(d || ''); };
  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const dateLong = d => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `«${m[3]}» ${MONTHS_GEN[Number(m[2]) - 1]} ${m[1]} г.` : ''; };

  // реквизиты компании для бланка (правит руководитель в «Шаблонах»); печать и подпись в систему не загружаем — только место «М.П.»
  const COMPANY_FIELDS = [['fullName', 'Полное наименование'], ['city', 'Город'], ['address', 'Адрес'], ['phone', 'Телефон'], ['email', 'E-mail'], ['site', 'Сайт'], ['bin', 'БИН'], ['directorTitle', 'Должность руководителя'], ['director', 'Руководитель (Фамилия И.О.)']];
  const companyDefaults = name => ({ company: name, fullName: /^ИП\s/.test(name) ? name : `ТОО «${name}»`, city: 'г. Алматы', address: '', phone: '', email: '', site: 'most-a.com', bin: '', directorTitle: /^ИП\s/.test(name) ? 'Индивидуальный предприниматель' : 'Директор', director: '' });

  const PRINT_CSS = `@page{size:A4;margin:18mm 16mm 18mm 22mm}body{font-family:"Neue Haas Grotesk Text","Helvetica Neue",Arial,sans-serif;font-size:11pt;color:#111;line-height:1.45;margin:0}
.bl-head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #ff4d23;padding-bottom:8px;margin-bottom:18px}.bl-logo{display:flex;align-items:center;gap:10px}.bl-logo svg{height:34px}.bl-name{font-weight:700;font-size:13pt}.bl-req{font-size:8.5pt;color:#555;text-align:right;line-height:1.35}
.bl-meta{display:flex;justify-content:space-between;gap:24px;margin:10px 0 22px}.bl-to{max-width:55%;text-align:left}.bl-subj{font-weight:700;margin:0 0 12px}.bl-body p{margin:0 0 8px;text-align:justify}
.bl-sign{display:flex;justify-content:space-between;margin-top:36px}.bl-mp{color:#888;font-size:9pt;margin-top:6px}table.bl{width:100%;border-collapse:collapse;margin:10px 0;font-size:10pt}table.bl th,table.bl td{border:1px solid #999;padding:4px 6px;vertical-align:top}table.bl th{background:#f1f1f1}
h1.bl-title{font-size:14pt;text-align:center;margin:10px 0 4px}.bl-center{text-align:center}.bl-small{font-size:9pt;color:#555}.bl-lines{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:30px}.bl-line{border-top:1px solid #333;padding-top:3px;font-size:9pt;color:#555}
@media screen{body{background:#eee}.bl-page{background:#fff;max-width:180mm;margin:12px auto;padding:16mm 16mm 16mm 20mm;box-shadow:0 1px 6px rgba(0,0,0,.15)}.bl-print{position:fixed;top:10px;right:10px}}@media print{.bl-print{display:none}}`;
  const LOGO = '<svg viewBox="0 30 143 128" aria-hidden="true"><path fill="#ff4d23" d="M0 30H60L103 70L74 99L40 67.5ZM40 67.5V158H0V102.5ZM103 69L142 30V158H103Z"/></svg>';
  const HEAD = `<div class="bl-head"><div class="bl-logo">${LOGO}<div class="bl-name">{{c.fullName}}</div></div><div class="bl-req">{{c.city}}{{{c.addressLine}}}{{{c.contactLine}}}{{{c.binLine}}}</div></div>`;

  const DEFAULT_TEMPLATES = {
    letter: { title: 'Письмо на бланке', html: `${HEAD}
<div class="bl-meta"><div>Исх. № {{no}}<br>от {{dateLong}}{{{replyLine}}}</div><div class="bl-to">{{correspondent}}</div></div>
<p class="bl-subj">{{subject}}</p>
<div class="bl-body">{{{body}}}</div>
<div class="bl-sign"><div>{{c.directorTitle}}<br>{{c.fullName}}<div class="bl-mp">М.П.</div></div><div>__________ {{c.director}}</div></div>
<p class="bl-small" style="margin-top:28px">Исп.: {{responsible}}</p>` },
    issue: { title: 'Накладная на выдачу документации', html: `${HEAD}
<h1 class="bl-title">Накладная № {{no}}</h1><p class="bl-center">на передачу проектной документации от {{dateLong}}</p>
<p>Объект: <b>{{project}}</b>{{{stageLine}}}<br>Передаёт: {{c.fullName}}<br>Получатель: {{recipient}}<br>Способ передачи: {{method}}</p>
{{{itemsTable}}}
{{{noteLine}}}
<div class="bl-lines"><div><b>Передал</b><br>{{c.fullName}}<br><br><div class="bl-line">должность, Ф.И.О., подпись</div><div class="bl-mp">М.П.</div></div><div><b>Принял</b><br>{{recipient}}<br><br><div class="bl-line">должность, Ф.И.О., подпись, дата</div><div class="bl-mp">М.П.</div></div></div>` },
    order: { title: 'Приказ', html: `${HEAD}
<h1 class="bl-title">ПРИКАЗ № {{no}}</h1><p class="bl-center">{{c.city}}, {{dateLong}}</p>
<p class="bl-subj bl-center">{{title}}</p>
<div class="bl-body">{{{body}}}</div>
<div class="bl-sign"><div>{{c.directorTitle}}<br>{{c.fullName}}<div class="bl-mp">М.П.</div></div><div>__________ {{c.director}}</div></div>
<h3 style="margin-top:28px;font-size:11pt">С приказом ознакомлены:</h3>{{{acksTable}}}` },
  };
  // стандартный текст приказа по типу (редактируется в карточке приказа)
  const ORDER_BODY = {
    appoint: 'В связи с началом работ по проекту «{{project}}»\n\nПРИКАЗЫВАЮ:\n1. Назначить {{person}} {{role}} проекта «{{project}}» с {{from}}.\n2. Контроль за исполнением приказа оставляю за собой.',
    vacation: 'ПРИКАЗЫВАЮ:\n1. Предоставить {{person}} ежегодный оплачиваемый трудовой отпуск с {{from}} по {{to}}.\n2. Основание: заявление работника.',
    bonus: 'За {{reason}}\n\nПРИКАЗЫВАЮ:\n1. Премировать {{person}}.\n2. Бухгалтерии произвести начисление в установленном порядке.',
    other: 'ПРИКАЗЫВАЮ:\n1. …',
  };

  // данные компании для бланка → строки шапки (пустые поля не печатаем)
  function companyView(c) {
    const x = Object.assign({}, c);
    x.addressLine = c.address ? `<br>${esc(c.address)}` : '';
    x.contactLine = [c.phone, c.email, c.site].filter(Boolean).length ? `<br>${[c.phone, c.email, c.site].filter(Boolean).map(esc).join(' · ')}` : '';
    x.binLine = c.bin ? `<br>БИН ${esc(c.bin)}` : '';
    return x;
  }
  const page = (title, inner) => `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body><button class="bl-print" onclick="window.print()">Печать / PDF</button><div class="bl-page">${inner}</div></body></html>`;

  return { LEADERS, isLeader, isClerk, isReader, isProjectRole, canDelete, canTemplates, canOpen, COMPANY_CODES, companyCode, PREFIX, yearOf, nextNumber,
    LETTER_STATUS, OPEN_IN, statusLabel, isWaiting, isOverdue, daysLeft, ISSUE_METHOD, parseItems, itemsToText, ORDER_TYPES, orderTypeLabel,
    MAX_FILE, FILE_TYPES, KEY_RE, extOf, signatureOk, esc, render, paragraphs, fdate, dateLong, COMPANY_FIELDS, companyDefaults, DEFAULT_TEMPLATES, ORDER_BODY, companyView, page };
});
