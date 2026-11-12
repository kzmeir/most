'use strict';
// Модуль «Документы и канцелярия»: /api/office/*. Поток I. Контракт — docs/ARCHITECTURE.md, задача — modules/office/README.md.
// Входящие/исходящие письма, выдача документации (накладные), приказы с ознакомлением, шаблоны на бланке MOST.
// Акты, счета, ЭСФ — в 1С, здесь их нет. Вложения писем — на диске DATA_DIR/office-files/<id письма>/, в базе только ключи.
const fs = require('fs');
const path = require('path');
const O = require('./domain');

const str = (v, n = 20000) => String(v == null ? '' : v).slice(0, n);
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const filesDir = (ctx, id) => path.join(ctx.store.DATA_DIR, 'office-files', String(id).replace(/[^\w-]/g, ''));

function handle(ctx) {
  const { parts, method, body, user, db, store, ok, err, userName, qs } = ctx;
  if (!user) return err(401, 'Не авторизован');
  const [, a, b, c, d] = parts;
  const now = () => new Date().toISOString();
  const t = ctx.today();
  const save = (action, col, id, extra) => { store.save(); store.audit(user.id, action, col, id, extra); };
  const companies = () => ((db.settings && db.settings.companies) || Object.keys(O.COMPANY_CODES));
  const PMD = ctx.modules.pm && ctx.modules.pm.domain;
  const proj = pid => (db.pmProjects || []).find(p => p.id === pid) || null;
  const myProject = pid => { const p = proj(pid); return !!p && !!PMD && PMD.isManager(user, p); };
  const projName = pid => (proj(pid) || {}).name || '';

  // ---------- права на письма ----------
  const seeLetter = l => O.isReader(user) || l.responsibleId === user.id || l.createdBy === user.id || (O.isProjectRole(user) && myProject(l.pid));
  const editLetter = l => O.isClerk(user) || (O.isProjectRole(user) && myProject(l.pid));      // любые поля
  const workLetter = l => editLetter(l) || l.responsibleId === user.id;                       // статус, заметка, файлы — исполнитель
  const seeIssue = x => O.isReader(user) || (O.isProjectRole(user) && myProject(x.pid));
  const editIssue = x => O.isClerk(user) || (O.isProjectRole(user) && myProject(x.pid));
  const seeOrder = x => O.isReader(user) || (x.acquaint || []).includes(user.id) || x.createdBy === user.id;

  // ---------- шаблоны и реквизиты ----------
  const companyData = name => Object.assign(O.companyDefaults(name), ((db.offTemplates || []).find(x => x.kind === 'company' && x.company === name) || {}).data || {});
  const templateOf = (kind, company) => { const own = (db.offTemplates || []).filter(x => x.kind === kind); const x = own.find(z => z.company === company) || own.find(z => !z.company); return x ? x.html : O.DEFAULT_TEMPLATES[kind].html; };

  const letterOut = l => Object.assign({}, l, { project: projName(l.pid), responsible: userName(l.responsibleId), statusLabel: O.statusLabel(l.dir, l.status), waiting: O.isWaiting(l), overdue: O.isOverdue(l, t), daysLeft: O.daysLeft(l, t),
    replyToNo: l.replyTo ? ((db.offLetters.find(z => z.id === l.replyTo) || {}).no || '') : '', answers: db.offLetters.filter(z => z.replyTo === l.id && seeLetter(z)).map(z => ({ id: z.id, no: z.no, date: z.date })),
    canEdit: editLetter(l), canWork: workLetter(l), canDelete: O.canDelete(user) });
  const issueOut = x => Object.assign({}, x, { project: projName(x.pid), methodLabel: (O.ISSUE_METHOD.find(m => m[0] === x.method) || ['', ''])[1], canEdit: editIssue(x), canDelete: O.canDelete(user) });
  const orderOut = x => Object.assign({}, x, { typeLabel: O.orderTypeLabel(x.type), people: (x.acquaint || []).map(id => ({ id, name: userName(id), at: (x.acks || {})[id] || '' })), acked: !!(x.acks || {})[user.id], mustAck: (x.acquaint || []).includes(user.id), canEdit: O.isClerk(user), canDelete: O.canDelete(user) });

  // ---------- сводка для меню ----------
  if (a === 'summary' && method === 'GET') {
    const mine = db.offLetters.filter(l => O.isWaiting(l) && (O.isClerk(user) ? true : l.responsibleId === user.id || (O.isProjectRole(user) && myProject(l.pid))));
    return ok({ waiting: mine.length, overdue: mine.filter(l => O.isOverdue(l, t)).length, ordersToAck: db.offOrders.filter(x => (x.acquaint || []).includes(user.id) && !(x.acks || {})[user.id]).length,
      canClerk: O.isClerk(user), canRead: O.isReader(user), canProject: O.isProjectRole(user), canTemplates: O.canTemplates(user), canDelete: O.canDelete(user), companies: companies(),
      projects: (db.pmProjects || []).filter(p => O.isReader(user) || myProject(p.id)).map(p => ({ id: p.id, name: p.name, track: p.track, mine: myProject(p.id) })) });
  }

  // ---------- письма ----------
  const L_FIELDS = ['company', 'date', 'correspondent', 'subject', 'pid', 'responsibleId', 'due', 'theirNo', 'theirDate', 'text', 'note', 'replyTo'];
  function letterFields(src, cur) {
    const f = ctx.pick(src, L_FIELDS);
    for (const k of ['correspondent', 'subject', 'theirNo', 'note']) if (k in f) f[k] = str(f[k], 500).trim();
    if ('text' in f) f.text = str(f.text, 20000);
    for (const k of ['date', 'due', 'theirDate']) if (k in f && f[k] && !isDate(f[k])) return { error: 'Дата в формате ГГГГ-ММ-ДД' };
    if ('company' in f && !companies().includes(f.company)) return { error: 'Выберите компанию MOST' };
    if ('pid' in f && f.pid && !proj(f.pid)) return { error: 'Проект не найден' };
    if ('responsibleId' in f && f.responsibleId && !db.users.some(u => u.id === f.responsibleId)) return { error: 'Ответственный не найден' };
    if ('replyTo' in f && f.replyTo && !db.offLetters.some(z => z.id === f.replyTo && seeLetter(z))) return { error: 'Письмо, на которое отвечаем, не найдено' };
    if ('pid' in f && f.pid && !O.isClerk(user) && !myProject(f.pid)) return { error: 'Проект — только свой', status: 403 };
    return { f };
  }
  if (a === 'letters') {
    if (!b && method === 'GET') {
      let list = db.offLetters.filter(seeLetter);
      if (qs.dir) list = list.filter(l => l.dir === qs.dir);
      if (qs.status) list = list.filter(l => l.status === qs.status);
      if (qs.company) list = list.filter(l => l.company === qs.company);
      if (qs.pid) list = list.filter(l => l.pid === qs.pid);
      if (qs.waiting) list = list.filter(O.isWaiting);
      if (qs.overdue) list = list.filter(l => O.isOverdue(l, t));
      if (qs.mine) list = list.filter(l => l.responsibleId === user.id);
      if (qs.q) { const q = String(qs.q).toLowerCase(); list = list.filter(l => [l.no, l.subject, l.correspondent, l.theirNo, projName(l.pid)].join(' ').toLowerCase().includes(q)); }
      return ok(list.slice().sort((x, y) => String(y.date).localeCompare(String(x.date)) || (y.seq || 0) - (x.seq || 0)).map(letterOut));
    }
    if (!b && method === 'POST') {
      const dir = body.dir === 'out' ? 'out' : body.dir === 'in' ? 'in' : '';
      if (!dir) return err(400, 'Укажите: входящее или исходящее');
      if (!O.isClerk(user) && !(O.isProjectRole(user) && body.pid && myProject(body.pid))) return err(403, 'Регистрирует секретарь, руководитель или ГИП/ПМ — по своему проекту');
      const { f, error, status } = letterFields(Object.assign({ company: companies()[0], date: t }, body)); if (error) return err(status || 400, error);
      if (!f.subject) return err(400, 'Нужна тема письма'); if (!f.correspondent) return err(400, dir === 'in' ? 'Укажите, от кого письмо' : 'Укажите адресата');
      const n = O.nextNumber(db.offLetters, dir, f.company, f.date);
      const l = Object.assign({ id: store.id(), kind: dir, dir, status: dir === 'in' ? 'new' : 'draft', files: [], createdAt: now(), createdBy: user.id }, f, n);
      db.offLetters.push(l);
      // исходящее «в ответ на» закрывает ожидание по входящему
      if (l.replyTo) { const src = db.offLetters.find(z => z.id === l.replyTo); if (src && src.dir === 'in' && O.OPEN_IN.includes(src.status)) Object.assign(src, { status: 'answered', answeredAt: t, answeredBy: l.id }); }
      save('create', 'offLetters', l.id, { no: l.no }); return ok(letterOut(l));
    }
    const l = b && db.offLetters.find(x => x.id === b); if (!l || !seeLetter(l)) return err(404, 'Письмо не найдено');
    if (!c && method === 'GET') return ok(letterOut(l));
    if (!c && method === 'PUT') {
      if (!workLetter(l)) return err(403, 'Менять письмо могут канцелярия, ГИП/ПМ проекта и ответственный');
      const patch = {};
      if (editLetter(l)) { const { f, error, status } = letterFields(body, l); if (error) return err(status || 400, error); if ('company' in f && f.company !== l.company) return err(400, 'Компанию зарегистрированного письма не меняем — зарегистрируйте новое'); Object.assign(patch, f); if ('date' in patch && O.yearOf(patch.date) !== O.yearOf(l.date)) return err(400, 'Год даты менять нельзя — номер привязан к году'); }
      if ('note' in body) patch.note = str(body.note, 2000);
      if ('status' in body) { if (!(O.LETTER_STATUS[l.dir] || []).some(s => s[0] === body.status)) return err(400, 'Неизвестный статус'); patch.status = body.status; if (body.status === 'closed') patch.closedAt = t; }
      Object.assign(l, patch, { updatedAt: now(), updatedBy: user.id }); save('update', 'offLetters', l.id, patch.status ? { status: patch.status } : null); return ok(letterOut(l));
    }
    if (!c && method === 'DELETE') {
      if (!O.canDelete(user)) return err(403, 'Удаляет только руководитель');
      db.offLetters = db.offLetters.filter(x => x.id !== l.id); try { fs.rmSync(filesDir(ctx, l.id), { recursive: true, force: true }); } catch { }
      save('delete', 'offLetters', l.id, { no: l.no }); return ok({ ok: true });
    }
    // вложения: base64 в JSON → диск; PDF, DOCX, XLSX, JPG, PNG до 20 МБ, сигнатура проверяется
    if (c === 'files' && !d && method === 'POST') {
      if (!workLetter(l)) return err(403, 'Прикреплять файлы могут канцелярия, ГИП/ПМ проекта и ответственный');
      const ext = O.extOf(body.name); if (!O.FILE_TYPES[ext]) return err(400, 'Можно PDF, DOCX, XLSX, JPG, PNG');
      const b64 = String(body.data || '').replace(/^data:[^,]*,/, ''); if (!b64) return err(400, 'Пустой файл'); if (b64.length * 3 / 4 > O.MAX_FILE + 4) return err(400, 'Файл больше 20 МБ');
      const data = Buffer.from(b64, 'base64'); if (!data.length) return err(400, 'Пустой файл'); if (data.length > O.MAX_FILE) return err(400, 'Файл больше 20 МБ');
      if (!O.signatureOk(ext, data)) return err(400, 'Содержимое файла не совпадает с расширением');
      const dir = filesDir(ctx, l.id); fs.mkdirSync(dir, { recursive: true });
      const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`; fs.writeFileSync(path.join(dir, key), data);
      const f = { key, name: str(body.name, 200), size: data.length, type: O.FILE_TYPES[ext], at: now(), by: user.id };
      l.files = (l.files || []).concat(f); save('file-add', 'offLetters', l.id, { key }); return ok(letterOut(l));
    }
    if (c === 'files' && d && method === 'GET') {
      const f = (l.files || []).find(x => x.key === d); if (!f || !O.KEY_RE.test(d)) return err(404, 'Файл не найден');
      const file = path.join(filesDir(ctx, l.id), d); if (!fs.existsSync(file)) return err(404, 'Файл не найден');
      return ctx.send(200, fs.readFileSync(file), { 'Content-Type': f.type, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(f.name || d)}`, 'X-Content-Type-Options': 'nosniff' });
    }
    if (c === 'files' && d && method === 'DELETE') {
      if (!editLetter(l)) return err(403, 'Удалять файлы могут канцелярия и ГИП/ПМ проекта');
      if (!(l.files || []).some(x => x.key === d)) return err(404, 'Файл не найден');
      l.files = l.files.filter(x => x.key !== d); try { fs.unlinkSync(path.join(filesDir(ctx, l.id), d)); } catch { }
      save('file-delete', 'offLetters', l.id, { key: d }); return ok(letterOut(l));
    }
  }

  // ---------- выдача документации (накладные) ----------
  const I_FIELDS = ['company', 'date', 'pid', 'stage', 'method', 'recipient', 'note'];
  function issueFields(src) {
    const f = ctx.pick(src, I_FIELDS);
    for (const k of ['stage', 'recipient', 'note']) if (k in f) f[k] = str(f[k], 500).trim();
    if ('date' in f && !isDate(f.date)) return { error: 'Дата в формате ГГГГ-ММ-ДД' };
    if ('company' in f && !companies().includes(f.company)) return { error: 'Выберите компанию MOST' };
    if ('method' in f && !O.ISSUE_METHOD.some(m => m[0] === f.method)) return { error: 'Способ: бумага или электронно' };
    if ('pid' in f && !proj(f.pid)) return { error: 'Выберите проект' };
    if ('items' in src) f.items = Array.isArray(src.items) ? src.items.slice(0, 300).map(i => ({ mark: str(i.mark, 50), title: str(i.title, 300), sheets: str(i.sheets, 20), rev: str(i.rev, 20), copies: str(i.copies, 20) })) : O.parseItems(src.items);
    return { f };
  }
  if (a === 'issues') {
    if (!b && method === 'GET') {
      let list = db.offIssues.filter(seeIssue); if (qs.pid) list = list.filter(x => x.pid === qs.pid);
      return ok(list.slice().sort((x, y) => String(y.date).localeCompare(String(x.date)) || (y.seq || 0) - (x.seq || 0)).map(issueOut));
    }
    if (!b && method === 'POST') {
      if (!O.isClerk(user) && !(O.isProjectRole(user) && myProject(body.pid))) return err(403, 'Оформляет канцелярия или ГИП/ПМ своего проекта');
      const { f, error } = issueFields(Object.assign({ company: companies()[0], date: t, method: 'paper' }, body)); if (error) return err(400, error);
      if (!f.pid) return err(400, 'Выберите проект'); if (!f.recipient) return err(400, 'Кому передаём'); if (!(f.items || []).length) return err(400, 'Добавьте хотя бы один комплект');
      const x = Object.assign({ id: store.id(), kind: 'issue', status: 'issued', createdAt: now(), createdBy: user.id }, f, O.nextNumber(db.offIssues, 'issue', f.company, f.date));
      db.offIssues.push(x); save('create', 'offIssues', x.id, { no: x.no }); return ok(issueOut(x));
    }
    const x = b && db.offIssues.find(z => z.id === b); if (!x || !seeIssue(x)) return err(404, 'Накладная не найдена');
    if (!c && method === 'GET') return ok(issueOut(x));
    if (!editIssue(x)) return err(403, 'Менять накладную могут канцелярия и ГИП/ПМ проекта');
    if (!c && method === 'PUT') {
      const { f, error } = issueFields(body); if (error) return err(400, error);
      if ('company' in f && f.company !== x.company) return err(400, 'Компанию оформленной накладной не меняем'); if (f.pid && f.pid !== x.pid && !O.isClerk(user) && !myProject(f.pid)) return err(403, 'Проект — только свой');
      if ('received' in body) { const r = body.received; if (r && r.at && !isDate(r.at)) return err(400, 'Дата получения в формате ГГГГ-ММ-ДД'); f.received = r && r.at ? { at: r.at, by: str(r.by, 200).trim(), mark: user.id } : null; f.status = r && r.at ? 'received' : 'issued'; }
      Object.assign(x, f, { updatedAt: now(), updatedBy: user.id }); save('update', 'offIssues', x.id); return ok(issueOut(x));
    }
    if (!c && method === 'DELETE') { if (!O.canDelete(user)) return err(403, 'Удаляет только руководитель'); db.offIssues = db.offIssues.filter(z => z.id !== x.id); save('delete', 'offIssues', x.id, { no: x.no }); return ok({ ok: true }); }
  }

  // ---------- приказы ----------
  const R_FIELDS = ['company', 'date', 'type', 'title', 'text', 'acquaint', 'pid'];
  function orderFields(src) {
    const f = ctx.pick(src, R_FIELDS);
    if ('title' in f) f.title = str(f.title, 300).trim(); if ('text' in f) f.text = str(f.text, 20000);
    if ('date' in f && !isDate(f.date)) return { error: 'Дата в формате ГГГГ-ММ-ДД' };
    if ('company' in f && !companies().includes(f.company)) return { error: 'Выберите компанию MOST' };
    if ('type' in f && !O.ORDER_TYPES.some(x => x[0] === f.type)) return { error: 'Неизвестный тип приказа' };
    if ('pid' in f && f.pid && !proj(f.pid)) return { error: 'Проект не найден' };
    if ('acquaint' in f) { const ids = Array.isArray(f.acquaint) ? f.acquaint : String(f.acquaint || '').split(',').map(s => s.trim()).filter(Boolean); if (ids.some(id => !db.users.some(u => u.id === id))) return { error: 'Сотрудник для ознакомления не найден' }; f.acquaint = [...new Set(ids)]; }
    return { f };
  }
  if (a === 'orders') {
    if (!b && method === 'GET') return ok(db.offOrders.filter(seeOrder).sort((x, y) => String(y.date).localeCompare(String(x.date)) || (y.seq || 0) - (x.seq || 0)).map(orderOut));
    if (!b && method === 'POST') {
      if (!O.isClerk(user)) return err(403, 'Приказы оформляют руководители и секретарь');
      const { f, error } = orderFields(Object.assign({ company: companies()[0], date: t, type: 'other', acquaint: [] }, body)); if (error) return err(400, error);
      if (!f.title) return err(400, 'Нужен заголовок приказа');
      const x = Object.assign({ id: store.id(), kind: 'order', acks: {}, createdAt: now(), createdBy: user.id }, f, O.nextNumber(db.offOrders, 'order', f.company, f.date));
      db.offOrders.push(x); save('create', 'offOrders', x.id, { no: x.no }); return ok(orderOut(x));
    }
    const x = b && db.offOrders.find(z => z.id === b); if (!x || !seeOrder(x)) return err(404, 'Приказ не найден');
    if (!c && method === 'GET') return ok(orderOut(x));
    if (c === 'ack' && method === 'POST') {
      if (!(x.acquaint || []).includes(user.id)) return err(403, 'Вас нет в списке ознакомления');
      if (!(x.acks || {})[user.id]) { x.acks = Object.assign({}, x.acks, { [user.id]: now() }); save('ack', 'offOrders', x.id); }
      return ok(orderOut(x));
    }
    if (!O.isClerk(user)) return err(403, 'Менять приказы могут руководители и секретарь');
    if (!c && method === 'PUT') {
      const { f, error } = orderFields(body); if (error) return err(400, error);
      if ('company' in f && f.company !== x.company) return err(400, 'Компанию приказа не меняем'); if ('date' in f && O.yearOf(f.date) !== O.yearOf(x.date)) return err(400, 'Год даты менять нельзя — номер привязан к году');
      if (f.acquaint) x.acks = Object.fromEntries(Object.entries(x.acks || {}).filter(([id]) => f.acquaint.includes(id)));
      Object.assign(x, f, { updatedAt: now(), updatedBy: user.id }); save('update', 'offOrders', x.id); return ok(orderOut(x));
    }
    if (!c && method === 'DELETE') { if (!O.canDelete(user)) return err(403, 'Удаляет только руководитель'); db.offOrders = db.offOrders.filter(z => z.id !== x.id); save('delete', 'offOrders', x.id, { no: x.no }); return ok({ ok: true }); }
  }

  // ---------- шаблоны и реквизиты компаний ----------
  if (a === 'templates') {
    if (!O.isClerk(user)) return err(403, 'Шаблоны видят руководители и секретарь');
    if (!b && method === 'GET') {
      const kinds = Object.keys(O.DEFAULT_TEMPLATES);
      return ok({ canEdit: O.canTemplates(user), fields: O.COMPANY_FIELDS, companies: companies().map(name => ({ name, code: O.companyCode(name), data: companyData(name) })),
        templates: kinds.map(k => ({ kind: k, title: O.DEFAULT_TEMPLATES[k].title, html: templateOf(k, ''), custom: (db.offTemplates || []).some(x => x.kind === k && !x.company), defaultHtml: O.DEFAULT_TEMPLATES[k].html })), orderBodies: O.ORDER_BODY });
    }
    if (!O.canTemplates(user)) return err(403, 'Шаблоны и реквизиты правит руководитель');
    if (b === 'company' && method === 'PUT') {
      if (!companies().includes(body.company)) return err(400, 'Нет такой компании');
      const data = Object.fromEntries(O.COMPANY_FIELDS.map(([k]) => [k, str((body.data || {})[k], 300).trim()]));
      let x = db.offTemplates.find(z => z.kind === 'company' && z.company === body.company);
      if (!x) { x = { id: store.id(), kind: 'company', company: body.company, createdAt: now() }; db.offTemplates.push(x); }
      Object.assign(x, { data, updatedAt: now(), updatedBy: user.id }); save('update', 'offTemplates', x.id, { company: body.company }); return ok(companyData(body.company));
    }
    if (O.DEFAULT_TEMPLATES[b] && method === 'PUT') {
      let x = db.offTemplates.find(z => z.kind === b && !z.company);
      if (body.reset) { db.offTemplates = db.offTemplates.filter(z => z !== x); save('reset', 'offTemplates', b); return ok({ kind: b, html: O.DEFAULT_TEMPLATES[b].html, custom: false }); }
      const html = str(body.html, 100000); if (!html.trim()) return err(400, 'Пустой шаблон');
      if (/<script|\son\w+\s*=|javascript:/i.test(html)) return err(400, 'В шаблоне нельзя скрипты и обработчики событий');
      if (!x) { x = { id: store.id(), kind: b, company: '', createdAt: now() }; db.offTemplates.push(x); }
      Object.assign(x, { html, updatedAt: now(), updatedBy: user.id }); save('update', 'offTemplates', x.id, { kind: b }); return ok({ kind: b, html, custom: true });
    }
  }

  // ---------- печатные формы (HTML для печати / PDF) ----------
  if (a === 'print' && method === 'GET') {
    const html = inner => ctx.send(200, O.page('MOST', inner), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'unsafe-inline'" });
    if (b === 'letter') {
      const l = db.offLetters.find(x => x.id === c); if (!l || !seeLetter(l)) return err(404, 'Письмо не найдено'); if (l.dir !== 'out') return err(400, 'На бланке печатаем исходящие письма');
      const src = l.replyTo ? db.offLetters.find(z => z.id === l.replyTo) : null;
      const data = { c: O.companyView(companyData(l.company)), no: l.no, dateLong: O.dateLong(l.date), correspondent: l.correspondent, subject: l.subject, body: O.paragraphs(l.text), responsible: userName(l.responsibleId),
        replyLine: src ? `<br>на № ${O.esc(src.theirNo || src.no)}${src.theirDate ? ' от ' + O.esc(O.fdate(src.theirDate)) : ''}` : '' };
      return html(O.render(templateOf('letter', l.company), data));
    }
    if (b === 'issue') {
      const x = db.offIssues.find(z => z.id === c); if (!x || !seeIssue(x)) return err(404, 'Накладная не найдена');
      const rows = (x.items || []).map((i, n) => `<tr><td>${n + 1}</td><td>${O.esc(i.mark)}</td><td>${O.esc(i.title)}</td><td>${O.esc(i.sheets)}</td><td>${O.esc(i.rev)}</td><td>${O.esc(i.copies)}</td></tr>`).join('');
      const data = { c: O.companyView(companyData(x.company)), no: x.no, dateLong: O.dateLong(x.date), project: projName(x.pid), recipient: x.recipient, method: (O.ISSUE_METHOD.find(m => m[0] === x.method) || ['', ''])[1],
        stageLine: x.stage ? `<br>Стадия: ${O.esc(x.stage)}` : '', noteLine: x.note ? `<p>Примечание: ${O.esc(x.note)}</p>` : '',
        itemsTable: `<table class="bl"><tr><th>№</th><th>Марка / раздел</th><th>Наименование</th><th>Листов</th><th>Изм.</th><th>Экз.</th></tr>${rows}</table>` };
      return html(O.render(templateOf('issue', x.company), data));
    }
    if (b === 'order') {
      const x = db.offOrders.find(z => z.id === c); if (!x || !seeOrder(x)) return err(404, 'Приказ не найден');
      const rows = (x.acquaint || []).map(id => `<tr><td>${O.esc(userName(id))}</td><td>${(x.acks || {})[id] ? O.esc(new Date(x.acks[id]).toLocaleDateString('ru-RU')) : ''}</td><td></td></tr>`).join('');
      const data = { c: O.companyView(companyData(x.company)), no: x.no, dateLong: O.dateLong(x.date), title: x.title, body: O.paragraphs(x.text),
        acksTable: rows ? `<table class="bl"><tr><th>Ф.И.О.</th><th>Дата ознакомления</th><th>Подпись</th></tr>${rows}</table>` : '<p class="bl-small">Список не задан.</p>' };
      return html(O.render(templateOf('order', x.company), data));
    }
  }
  return err(404, 'Нет такого действия');
}

// для других модулей (pm, проектная карточка): история выдач документации по проекту
function issuesOfProject(ctx, pid) {
  return (ctx.db.offIssues || []).filter(x => x.pid === pid).sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .map(x => ({ id: x.id, no: x.no, date: x.date, stage: x.stage || '', method: x.method, recipient: x.recipient, items: (x.items || []).length, status: x.status, receivedAt: (x.received || {}).at || '' }));
}

module.exports = { id: 'office', api: 'office', collections: ['offLetters', 'offIssues', 'offOrders', 'offTemplates'], handle, issuesOfProject, domain: O };
