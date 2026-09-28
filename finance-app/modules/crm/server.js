'use strict';
// Модуль «Коммерция»: /api/crm/*. Поток C. Контракт модулей — docs/ARCHITECTURE.md, задачи — modules/crm/README.md.
// Лиды и воронка (crmLeads), график платежей по договору (crmPayments), шаблоны документов (crmTemplates).
// КП и договоры ядра (db.proposals, db.contracts) только читаем и отдаём отсюда по правам модуля — на сайте ERP финансовых API нет.
// Файлы готовых КП (внешние редакции) — на диске DATA_DIR/crm-files/<id лида>/, в базе только ключи (как board/office).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const C = require('./domain');
const KP = require('./kp');
const KPDOCX = require('./kpdocx');

const KP_FILE_TYPES = {
  pdf: { type: 'application/pdf', sig: b => b.slice(0, 5).toString('latin1') === '%PDF-' },
  docx: { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sig: b => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4 },
};
const KP_MAX_FILE = 20 * 1024 * 1024, KP_MAX_FILES = 4;
const KP_KEY_RE = /^[a-z0-9]+-[a-z0-9]+\.(pdf|docx)$/;
const kpDir = (ctx, leadId) => path.join(ctx.store.DATA_DIR, 'crm-files', String(leadId).replace(/[^\w-]/g, ''));
// файлы из запроса [{ name, data: base64 }] → проверенные буферы (ничего не пишет на диск)
function kpFilesIn(list) {
  if (!Array.isArray(list) || !list.length) return { error: 'Приложите готовое КП: PDF и/или DOCX' };
  if (list.length > KP_MAX_FILES) return { error: `Не больше ${KP_MAX_FILES} файлов` };
  const out = [];
  for (const f of list) {
    const name = String((f && f.name) || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 200); const ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1];
    const t = ext && KP_FILE_TYPES[ext.toLowerCase()]; if (!t) return { error: `Можно только PDF и DOCX: ${name || 'файл без имени'}` };
    const b64 = String((f && f.data) || '').replace(/^data:[^,]*,/, ''); if (b64.length * 3 / 4 > KP_MAX_FILE + 4) return { error: `Файл больше 20 МБ: ${name}` };
    const data = Buffer.from(b64, 'base64'); if (!data.length) return { error: `Пустой файл: ${name}` };
    if (!t.sig(data)) return { error: `Содержимое файла не совпадает с расширением: ${name}` };
    out.push({ name, kind: ext.toLowerCase(), type: t.type, data, sha: crypto.createHash('sha256').update(data).digest('hex') });
  }
  return { files: out };
}

const LEAD_FIELDS = ['client', 'bin', 'contact', 'phone', 'object', 'address', 'objectType', 'track', 'area', 'rate', 'sum', 'vatIncluded', 'source', 'respId', 'nextDate', 'nextStep', 'note', 'proposalId', 'contractId', 'company', 'contractNo', 'contractDate', 'reason', 'reasonNote'];
const PAY_FIELDS = ['name', 'share', 'sum', 'stage', 'due', 'status', 'actDate', 'paidDate', 'note'];

function cleanLead(f) {
  const o = Object.assign({}, f);
  for (const k of ['area', 'rate', 'sum']) if (k in o) o[k] = C.num(o[k]);
  if ('vatIncluded' in o) o.vatIncluded = o.vatIncluded === true || o.vatIncluded === 'true' || o.vatIncluded === '1';
  if ('track' in o) o.track = C.normTrack(o.track); // concept → ep
  for (const k of LEAD_FIELDS) if (k in o && typeof o[k] === 'string') o[k] = o[k].trim();
  return o;
}
const settingsOf = ctx => ctx.D.settingsOf ? ctx.D.settingsOf(ctx.db.settings) : (ctx.db.settings || {});
const vatOf = ctx => { const v = settingsOf(ctx).vatRate; return v == null ? 0.16 : v; };
const termOf = ctx => { const t = settingsOf(ctx).paymentTermDays; return t == null ? 10 : C.num(t); };
// для расчёта платежа: пункты проекта pm, дата подписания, срок оплаты
function payResolver(ctx) {
  const leads = new Map((ctx.db.crmLeads || []).map(l => [l.id, l])); const items = new Map(); const term = termOf(ctx); const t = ctx.today();
  const itemsOf = pid => { if (!pid) return []; if (!items.has(pid)) items.set(pid, (ctx.db.pmItems || []).filter(i => i.pid === pid)); return items.get(pid); };
  const codes = new Map(); const codesOf = pid => { if (!codes.has(pid)) codes.set(pid, C.stageCodes(itemsOf(pid))); return codes.get(pid); };
  return p => { const l = leads.get(p.leadId) || {}; const pid = p.pmProjectId || l.pmProjectId; return { items: itemsOf(pid), codes: pid ? codesOf(pid) : {}, signDate: l.contractDate || '', term, today: t, client: l.client || '', object: l.object || '' }; };
}
// ожидаемые поступления по графикам платежей (для прогноза денег в ядре). Сигнатуру не менять.
// from/to — ISO-даты; просроченные неоплаченные переносятся на from (late: true), opts.late === false — не включать.
// Платежи со статусом «Акт выставлен» помечены invoiced: true — если ядро уже считает акт из db.docs, их надо пропустить.
function expectedPayments(ctx, from, to, opts) {
  return C.expected(ctx.db.crmPayments || [], payResolver(ctx), from || ctx.today(), to || '', opts);
}
// номер и дата из названия договора ядра («Договор 79-24-РП от 01.04.2025»)
function contractMeta(c) {
  const s = `${c.title || ''} ${c.name || ''}`; const no = (s.match(/(\d{1,4}-\d{2}(?:-[А-ЯЁA-Zа-яёa-z]+)?)/) || [])[1] || '';
  const d = s.match(/от\s+(\d{2})\.(\d{2})\.(\d{4})/) || []; return { no, date: d[3] ? `${d[3]}-${d[2]}-${d[1]}` : '' };
}
// строки графика по сделке: доли → суммы от суммы договора, привязка к проекту pm
function makeSchedule(ctx, l, rows, byUserId, append) {
  const total = C.leadCalc(l, vatOf(ctx)).sum; const base = append ? ctx.db.crmPayments.filter(p => p.leadId === l.id).reduce((m, p) => Math.max(m, C.num(p.n)), 0) : 0;
  const pm = ctx.modules.pm && ctx.modules.pm.domain; const pp = l.pmProjectId && (ctx.db.pmProjects || []).find(p => p.id === l.pmProjectId);
  const its = pp ? (ctx.db.pmItems || []).filter(i => i.pid === pp.id) : []; const names = pm && pp ? pm.stageNamesOf(its, pp.track) : [];
  const made = C.schedule(total, rows, { names, codes: C.stageCodes(its, names) }).map((r, i) => Object.assign(r, { id: ctx.store.id(), n: base + i + 1, leadId: l.id, contractId: l.contractId || '', pmProjectId: l.pmProjectId || '', vatIncluded: !!l.vatIncluded, due: rows[i].due || '', status: 'Ожидается', actDate: '', paidDate: '', note: '', createdAt: new Date().toISOString(), createdBy: byUserId || '' }));
  ctx.db.crmPayments.push(...made); return made;
}
// этап проекта закрыт в pm → у платежей по этому этапу отметка readyAt («пора выставлять акт»; сам признак считается и на лету)
function onItemDone(ctx, data) {
  const it = data && data.item, p = data && data.project; if (!it || !p) return;
  const st = C.stageState((ctx.db.pmItems || []).filter(i => i.pid === p.id), it.stage); if (!st || !st.done) return;
  const hit = ctx.db.crmPayments.filter(x => x.pmProjectId === p.id && x.stage === it.stage && x.status === 'Ожидается' && !x.readyAt);
  for (const x of hit) x.readyAt = ctx.today();
  if (hit.length) { ctx.store.save(); ctx.store.audit((ctx.user && ctx.user.id) || '', 'ready', 'crmPayments', hit.map(x => x.id).join(','), { pmProjectId: p.id, stage: it.stage }); }
}

function handle(ctx) {
  const { parts, method, user, db, store, ok, err, pick } = ctx; const body = ctx.body || {}; const qs = ctx.qs || {};
  const [, a, b, c] = parts;
  if (!user) return err(401, 'Не авторизован');
  if (!C.canOpen(user)) return err(403, 'Нет доступа к коммерции');
  const t = ctx.today(); const now = () => new Date().toISOString(); const vat = vatOf(ctx);
  const leader = C.isLeader(user), editor = C.canEditLeads(user);
  const pmProjects = db.pmProjects || [];
  const findL = id => db.crmLeads.find(l => l.id === id); const findPay = id => db.crmPayments.find(p => p.id === id);
  const visible = () => db.crmLeads.filter(l => C.canSeeLead(user, l, pmProjects));
  const pmBrief = id => { const p = id && pmProjects.find(x => x.id === id); return p ? { id: p.id, name: p.name, track: p.track, status: p.status } : null; };
  const paysOf = id => db.crmPayments.filter(p => p.leadId === id).sort((x, y) => C.num(x.n) - C.num(y.n));
  const stageNamesOf = pid => { const p = pmProjects.find(x => x.id === pid); const pm = ctx.modules.pm && ctx.modules.pm.domain; if (!p || !pm) return []; return pm.stageNamesOf((db.pmItems || []).filter(i => i.pid === pid), p.track); };
  const resolve = payResolver(ctx);
  const payOut = p => Object.assign({}, p, C.paymentState(p, resolve(p)));
  const leadOut = l => {
    const o = Object.assign({}, l, { track: C.normTrack(l.track), calc: C.leadCalc(l, vat), overdue: C.leadOverdue(l, t), respName: ctx.userName ? ctx.userName(l.respId) : '', pm: pmBrief(l.pmProjectId), canEdit: editor });
    delete o.history; delete o.kp; o.kpVersions = (l.kpVersions || []).map(kpBrief);
    const kp = l.proposalId && db.proposals.find(x => x.id === l.proposalId); if (kp) o.proposal = { id: kp.id, title: kp.title, sum: kp.sum, status: kp.status };
    const ct = l.contractId && db.contracts.find(x => x.id === l.contractId); if (ct) o.contract = { id: ct.id, name: ct.name || ct.code, title: ct.title || '', sum: ct.sum, company: ct.company || '' };
    if (leader && (l.status === 'Договор' || paysOf(l.id).length)) { const ps = paysOf(l.id).map(payOut); o.pay = { n: ps.length, sum: ps.reduce((s, p) => s + C.num(p.sum), 0), paid: ps.filter(p => p.status === 'Оплачен').reduce((s, p) => s + C.num(p.sum), 0), ready: ps.filter(p => p.ready).length, late: ps.filter(p => p.late).length }; }
    return o;
  };
  const history = (l, status, note) => { (l.history = l.history || []).push({ at: now(), by: user.id, status, note: note || '' }); };
  const saveAudit = (action, col, id, extra) => { store.save(); store.audit(user.id, action, col, id, extra); };
  const kpBrief = x => x ? Object.assign({ v: x.v, no: x.no, date: x.date, at: x.at, byName: ctx.userName ? ctx.userName(x.by) : '', source: x.source || 'erp', area: x.area, rate: x.rate, vatIncluded: x.vatIncluded, cost: x.cost, net: x.net, vat: x.vat, gross: x.gross },
    x.source === 'external' ? { vatPct: x.vatPct, extraNet: x.extraNet || 0, extraGross: x.extraGross || 0, comment: x.comment || '', files: (x.files || []).map(f => ({ key: f.key, name: f.name, kind: f.kind, size: f.size })) } : {}) : null;
  const lastV = vs => (vs || []).reduce((m, x) => Math.max(m, C.num(x.v)), 0);
  const nextNo = () => db.crmLeads.reduce((m, x) => Math.max(m, C.num(x.no)), 0) + 1;

  // ---- счётчики в меню ----
  if (a === 'badges' && method === 'GET') {
    const out = { crmleads: visible().filter(l => C.leadOverdue(l, t)).length };
    if (leader) out.crmpay = db.crmPayments.map(payOut).filter(p => p.ready || p.late).length;
    return ok(out);
  }
  // ---- справочники и списки для форм ----
  if (a === 'meta' && method === 'GET') {
    const out = { statuses: C.STATUSES, tracks: C.TRACKS, sources: C.SOURCES, objectTypes: C.OBJECT_TYPES, reasons: C.REASONS, payStatus: C.PAY_STATUS, payTemplates: C.PAY_TEMPLATES, companies: C.COMPANIES, fields: C.FIELDS,
      erpPort: Number(process.env.ERP_PORT) || (Number(process.env.PORT) || 3000) + 1, // ссылки на карточки проектов (сайт MOST ERP)
      rights: { leader, editor, payments: C.canPayments(user), docs: C.canDocs(user), templates: C.canEditTemplates(user), sign: C.canSign(user) }, vatRate: vat, term: termOf(ctx) };
    if (editor) {
      const used = new Set(db.crmLeads.map(l => l.proposalId).filter(Boolean));
      out.proposals = db.proposals.map(p => ({ id: p.id, no: p.no || '', title: p.title || '', client: p.client || '', sum: p.sum || 0, status: p.status || '', used: used.has(p.id) }));
      out.contracts = db.contracts.filter(x => !x.closed).map(x => ({ id: x.id, name: x.name || x.code || '', title: x.title || '', client: x.clientShort || x.client || '', company: x.company || '', sum: x.sum || 0, deal: db.crmLeads.some(l => l.contractId === x.id) }));
    }
    if (leader) out.pmProjects = pmProjects.map(p => ({ id: p.id, name: p.name, track: p.track, client: p.client || '', status: p.status }));
    return ok(out);
  }

  // ---- лиды ----
  if (a === 'funnel' && method === 'GET') return ok(C.funnel(visible(), { vatRate: vat, from: qs.from || '' }));
  if (a === 'leads') {
    if (!b && method === 'GET') return ok(visible().map(leadOut).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt))));
    if (!b && method === 'POST') {
      if (!editor) return err(403, 'Заводить лиды могут руководители и секретарь');
      const f = cleanLead(pick(body, LEAD_FIELDS)); if (!f.client && !f.object) return err(400, 'Укажите заказчика или объект');
      const status = C.STATUSES.includes(body.status) && body.status !== 'Договор' ? body.status : 'Новый'; if (status === 'Отказ' && !f.reason) f.reason = 'Прочее';
      const l = Object.assign({ track: 'rp', objectType: 'Прочее', source: 'Прочее', vatIncluded: false }, f, { id: store.id(), no: nextNo(), status, createdAt: now(), createdBy: user.id, history: [] });
      if (!l.respId) l.respId = user.id; if (C.KP_STAGE.includes(status) || l.proposalId) l.kpAt = t;
      history(l, status, 'создан'); db.crmLeads.push(l); saveAudit('create', 'crmLeads', l.id); return ok(leadOut(l));
    }
    const l = b && findL(b); if (b && (!l || !C.canSeeLead(user, l, pmProjects))) return err(404, 'Лид не найден');
    if (l && !c && method === 'GET') {
      const out = leadOut(l); out.history = (l.history || []).map(h => Object.assign({}, h, { byName: ctx.userName ? ctx.userName(h.by) : '' }));
      if (C.canDocs(user)) out.payments = paysOf(l.id).map(payOut); // секретарю — для документов по этапам оплаты
      if (leader) out.stageNames = l.pmProjectId ? stageNamesOf(l.pmProjectId) : [];
      return ok(out);
    }
    if (l && !c && method === 'PUT') {
      if (!editor) return err(403, 'Менять лиды могут руководители и секретарь');
      const patch = cleanLead(pick(body, LEAD_FIELDS)); const st = body.status && body.status !== l.status ? body.status : '';
      if (st) {
        if (!C.STATUSES.includes(st)) return err(400, 'Неизвестный статус');
        if (st === 'Договор') return err(400, 'Договор отмечается кнопкой «Договор подписан»');
        if (l.status === 'Договор' && !leader) return err(403, 'Вернуть подписанный договор в работу может только руководитель');
        if (st === 'Отказ' && !(patch.reason || l.reason)) return err(400, 'Укажите причину отказа');
        if (st !== 'Отказ') patch.reason = '';
        patch.status = st; if (C.KP_STAGE.includes(st) && !l.kpAt) patch.kpAt = t; if (st === 'Отказ') patch.closedAt = t;
        history(l, st, body.statusNote || (st === 'Отказ' ? [patch.reason || l.reason, patch.reasonNote].filter(Boolean).join(': ') : ''));
      }
      if ('reason' in patch && patch.reason && !C.REASONS.includes(patch.reason)) patch.reason = 'Прочее';
      if (patch.proposalId && !l.kpAt) patch.kpAt = t;
      Object.assign(l, patch, { updatedAt: now(), updatedBy: user.id }); saveAudit('update', 'crmLeads', l.id, st ? { status: st } : undefined); return ok(leadOut(l));
    }
    if (l && !c && method === 'DELETE') {
      if (!leader) return err(403, 'Удалять лиды может только руководитель');
      db.crmLeads.splice(db.crmLeads.indexOf(l), 1); const ps = paysOf(l.id); for (const p of ps) db.crmPayments.splice(db.crmPayments.indexOf(p), 1);
      try { fs.rmSync(kpDir(ctx, l.id), { recursive: true, force: true }); } catch { } // файлы готовых КП
      saveAudit('delete', 'crmLeads', l.id, { payments: ps.length }); return ok({ ok: true });
    }
    // «Договор подписан»: реквизиты договора, проект в pm (новый или существующий), график платежей, событие crm.contract.signed
    if (l && c === 'sign' && method === 'POST') {
      if (!C.canSign(user)) return err(403, 'Отмечать подписание договора может только руководитель');
      if (l.status === 'Договор') return err(409, 'Договор уже отмечен подписанным');
      const f = cleanLead(pick(body, ['contractNo', 'contractDate', 'company', 'contractId', 'sum', 'area', 'rate', 'vatIncluded', 'track', 'bin', 'address']));
      const ct = f.contractId && db.contracts.find(x => x.id === f.contractId); if (f.contractId && !ct) return err(400, 'Договор в реестре не найден');
      if (ct) { const m = contractMeta(ct); if (!f.contractNo && !l.contractNo) f.contractNo = m.no; if (!f.contractDate && !l.contractDate) f.contractDate = m.date; if (!f.company && !l.company) f.company = ct.company || ''; }
      if (body.pmProjectId && !pmBrief(body.pmProjectId)) return err(400, 'Проект не найден');
      const probe = Object.assign({}, l, f); if (!C.leadCalc(probe, vat).sum) return err(400, 'Укажите сумму договора (или площадь и ставку)');
      Object.assign(l, f); if (!l.contractDate) l.contractDate = t;
      let pmId = body.pmProjectId || '';
      if (!pmId && body.createProject !== false && ctx.modules.pm && ctx.modules.pm.createProject) {
        const fin = ct && ctx.D.contractProject ? ctx.D.contractProject(ct, db.projects) : null;
        const p = ctx.modules.pm.createProject(ctx, { track: C.normTrack(l.track), name: String(body.projectName || l.object || l.client).trim(), client: l.client || '', address: l.address || '', area: l.area || '', projectId: fin ? fin.id : '', start: body.start || l.contractDate, due: body.due || '', fit: !!body.due, pmId: body.pmId || '', gipId: body.gipId || '', comment: `Из коммерции: лид № ${l.no}, договор № ${l.contractNo || '—'} от ${C.fdate(l.contractDate)}` }, user.id);
        pmId = p.id;
      }
      l.pmProjectId = pmId || l.pmProjectId || ''; l.status = 'Договор'; l.signedAt = t; l.signedBy = user.id; if (!l.kpAt) l.kpAt = l.contractDate; l.reason = '';
      history(l, 'Договор', `подписан № ${l.contractNo || '—'} от ${C.fdate(l.contractDate)}`);
      let made = 0;
      if (!paysOf(l.id).length) { const rows = Array.isArray(body.schedule) && body.schedule.length ? body.schedule : C.PAY_TEMPLATES[C.normTrack(l.track)] || C.PAY_TEMPLATES.rp; made = makeSchedule(ctx, l, rows, user.id).length; }
      else for (const p of paysOf(l.id)) if (!p.pmProjectId) p.pmProjectId = l.pmProjectId;
      saveAudit('sign', 'crmLeads', l.id, { pmProjectId: l.pmProjectId, payments: made });
      const contract = { id: l.contractId || '', leadId: l.id, no: l.contractNo || '', date: l.contractDate, sum: C.leadCalc(l, vat).sum, vatIncluded: !!l.vatIncluded, client: l.client || '', object: l.object || '', company: l.company || '', track: l.track };
      ctx.emit('crm.contract.signed', { contract, pmProjectId: l.pmProjectId });
      return ok(Object.assign(leadOut(l), { payments: paysOf(l.id).map(payOut) }));
    }
    // график платежей по сделке: заменить целиком (пока нет выставленных и оплаченных)
    if (l && c === 'schedule' && method === 'POST') {
      if (!C.canPayments(user)) return err(403, 'График платежей ведут руководители');
      const old = paysOf(l.id); if (old.some(p => p.status !== 'Ожидается')) return err(409, 'В графике есть выставленные или оплаченные платежи — меняйте строки по одной');
      const rows = Array.isArray(body.rows) && body.rows.length ? body.rows : C.PAY_TEMPLATES[C.normTrack(body.template || l.track)] || C.PAY_TEMPLATES.rp;
      const sh = rows.reduce((s, r) => s + C.num(r.share), 0); if (Math.abs(sh - 100) > 0.01) return err(400, `Сумма долей ${sh} %, должно быть 100 %`);
      if (!C.leadCalc(l, vat).sum) return err(400, 'У сделки нет суммы договора');
      for (const p of old) db.crmPayments.splice(db.crmPayments.indexOf(p), 1);
      const made = makeSchedule(ctx, l, rows, user.id); saveAudit('schedule', 'crmLeads', l.id, { rows: made.length }); return ok(paysOf(l.id).map(payOut));
    }
    // ---- КП в Word по шаблону MOST: параметры, «Пересчитать», версия (номер и дата — в лид), скачивание ----
    if (l && c === 'kp') {
      const d = parts[4], v = parts[5];
      if (!d && method === 'GET') { const p = KP.kpParams(l); return ok({ params: p, calc: KP.kpCalc(p), companies: Object.keys(KP.COMPANIES), versions: (l.kpVersions || []).map(kpBrief), no: l.kpNo || '' }); }
      if (d === 'calc' && method === 'POST') { if (!editor) return err(403, 'КП готовят руководители и секретарь'); const p = KP.kpParams(l, body.params); return ok({ params: p, calc: KP.kpCalc(p) }); }
      if (!d && method === 'POST') {
        if (!editor) return err(403, 'КП готовят руководители и секретарь');
        if (!body.params || (body.params.vatIncluded !== true && body.params.vatIncluded !== false && body.params.vatIncluded !== 'true' && body.params.vatIncluded !== 'false')) return err(400, 'Укажите явно: ставка с НДС или без НДС');
        const p = KP.kpParams(l, body.params); const calc = KP.kpCalc(p); if (calc.problems.length) return err(400, 'Нельзя сформировать КП: ' + calc.problems.join('; '));
        const vs = l.kpVersions = l.kpVersions || []; const last = vs[vs.length - 1]; const same = last && last.params && JSON.stringify(last.params) === JSON.stringify(p);
        let ver = last;
        if (!same) {
          if (!l.kpNo) l.kpNo = KP.nextKpNo(db.crmLeads, t);
          ver = { v: lastV(vs) + 1, source: 'erp', no: l.kpNo, date: t, at: now(), by: user.id, params: p, area: calc.area, rate: p.rate, vatIncluded: p.vatIncluded, cost: calc.cost, net: calc.net, vat: calc.vat, gross: calc.gross };
          vs.push(ver); l.kp = p; l.kpDate = t; if (!l.kpAt) l.kpAt = t;
          Object.assign(l, { area: calc.area, rate: p.rate, sum: calc.cost, vatIncluded: p.vatIncluded, company: l.company || p.company });
          history(l, l.status, `КП ${l.kpNo} ред. ${ver.v}: ${C.moneyStr(calc.cost)} ₸ ${calc.vatTag}`);
          saveAudit('kp', 'crmLeads', l.id, { v: ver.v, no: l.kpNo, gross: calc.gross });
        }
        return ok(Object.assign(kpBrief(ver), { reused: !!same, lead: leadOut(l) }));
      }
      // готовое КП, подготовленное вне ERP (генераторы директора): файлы PDF/DOCX + итоговые цифры → редакция source: 'external'
      if (d === 'external' && !v && method === 'POST') {
        if (!editor) return err(403, 'Загружать КП могут руководители и секретарь');
        const r = C.kpExternal(body, vat); if (r.error) return err(400, r.error);
        const fl = kpFilesIn(body.files); if (fl.error) return err(400, fl.error);
        const x = r.v; const vs = l.kpVersions = l.kpVersions || [];
        if (!x.no) x.no = l.kpNo || KP.nextKpNo(db.crmLeads, x.date);
        const other = db.crmLeads.find(o => o !== l && (o.kpNo === x.no || (o.kpVersions || []).some(q => q.no === x.no))); if (other) return err(409, `Номер ${x.no} уже у лида № ${other.no} (${other.client || other.object || ''})`);
        // повтор той же публикации (скрипт запущен ещё раз) новую редакцию не создаёт
        const last = vs[vs.length - 1]; const shas = fl.files.map(f => f.sha).sort().join(',');
        if (last && last.source === 'external' && ['no', 'date', 'area', 'rate', 'net', 'vat', 'gross', 'extraNet', 'extraGross', 'comment'].every(k => last[k] === x[k]) && (last.files || []).map(f => f.sha).sort().join(',') === shas) return ok(Object.assign(kpBrief(last), { reused: true, lead: leadOut(l) }));
        const dir = kpDir(ctx, l.id); fs.mkdirSync(dir, { recursive: true });
        const files = fl.files.map(f => { const key = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${f.kind}`; fs.writeFileSync(path.join(dir, key), f.data); return { key, name: f.name, kind: f.kind, type: f.type, size: f.data.length, sha: f.sha }; });
        const ver = Object.assign({ v: lastV(vs) + 1, source: 'external', at: now(), by: user.id, vatIncluded: false, cost: x.net }, x, { files });
        vs.push(ver);
        Object.assign(l, { kpNo: x.no, kpDate: x.date, sum: x.net, vatIncluded: false }, x.area ? { area: x.area, rate: x.rate } : {}); if (!l.kpAt) l.kpAt = x.date;
        if (body.track) l.track = C.normTrack(body.track);
        const note = `КП ${x.no} ред. ${ver.v} (готовый файл): ${C.moneyStr(x.net)} ₸ без НДС, ${C.moneyStr(x.gross)} ₸ с НДС` + (x.extraNet ? `; сопутствующие вне КП ${C.moneyStr(x.extraNet)} ₸ без НДС` : '');
        const toSent = body.markSent !== false && body.markSent !== 'false' && ['Новый', 'Расчёт'].includes(l.status);
        if (toSent) { l.status = 'КП отправлено'; if (!l.kpAt) l.kpAt = x.date; }
        history(l, l.status, note); l.updatedAt = now(); l.updatedBy = user.id;
        saveAudit('kp-external', 'crmLeads', l.id, { v: ver.v, no: x.no, net: x.net, gross: x.gross, files: files.length });
        return ok(Object.assign(kpBrief(ver), { reused: false, lead: leadOut(l) }));
      }
      // файл внешней редакции (PDF/DOCX) — видят все, кому виден лид
      if (d && /^\d+$/.test(d) && v === 'files' && parts[6] && method === 'GET') {
        const ver = (l.kpVersions || []).find(x => x.v === Number(d)); const f = ver && (ver.files || []).find(x => x.key === parts[6]);
        if (!f || !KP_KEY_RE.test(f.key)) return err(404, 'Файл не найден');
        const file = path.join(kpDir(ctx, l.id), f.key); if (!fs.existsSync(file)) return err(404, 'Файл не найден');
        store.audit(user.id, 'kp-file', 'crmLeads', l.id, { v: ver.v, key: f.key });
        return ctx.send(200, fs.readFileSync(file), { 'Content-Type': f.type, 'Content-Disposition': `${f.kind === 'pdf' ? 'inline' : 'attachment'}; filename="kp.${f.kind}"; filename*=UTF-8''${encodeURIComponent(f.name)}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
      }
      // удалить ошибочно загруженную внешнюю редакцию (руководитель); редакции из ERP не удаляются
      if (d && /^\d+$/.test(d) && !v && method === 'DELETE') {
        if (!leader) return err(403, 'Удалять редакции КП может только руководитель');
        const vs = l.kpVersions || []; const ver = vs.find(x => x.v === Number(d)); if (!ver) return err(404, 'Нет такой редакции КП');
        if (ver.source !== 'external') return err(409, 'Редакции, собранные в ERP, не удаляются');
        for (const f of ver.files || []) if (KP_KEY_RE.test(f.key)) { try { fs.unlinkSync(path.join(kpDir(ctx, l.id), f.key)); } catch { } }
        const wasLast = vs[vs.length - 1] === ver; vs.splice(vs.indexOf(ver), 1);
        const nl = vs[vs.length - 1];
        if (wasLast && nl) Object.assign(l, { kpNo: nl.no, kpDate: nl.date, sum: nl.cost, vatIncluded: !!nl.vatIncluded }, nl.area ? { area: nl.area, rate: nl.rate } : {}, nl.params ? { kp: nl.params } : {});
        if (!nl) l.kpNo = '';
        history(l, l.status, `удалена редакция КП ${ver.no} ред. ${ver.v} (готовый файл)`);
        saveAudit('kp-delete', 'crmLeads', l.id, { v: ver.v, no: ver.no }); return ok(leadOut(l));
      }
      if (d && /^\d+$/.test(d) && v === 'docx' && method === 'GET') {
        const ver = (l.kpVersions || []).find(x => x.v === Number(d)); if (!ver) return err(404, 'Нет такой редакции КП');
        if (ver.source === 'external') { const f = (ver.files || []).find(x => x.kind === 'docx'); if (!f) return err(404, 'У этой редакции нет Word — скачайте PDF'); return ctx.send(302, '', { Location: `/api/crm/leads/${encodeURIComponent(l.id)}/kp/${ver.v}/files/${f.key}` }); }
        const buf = KPDOCX.build(ver.params, KP.kpCalc(ver.params), { no: ver.no, date: ver.date, version: ver.v });
        const name = `${ver.no} ${l.client || ''} ${l.object || ''}`.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) + (ver.v > 1 ? ` ред.${ver.v}` : '') + '.docx';
        store.audit(user.id, 'kp-docx', 'crmLeads', l.id, { v: ver.v });
        return ctx.send(200, buf, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': `attachment; filename="kp.docx"; filename*=UTF-8''${encodeURIComponent(name)}`, 'Cache-Control': 'no-store' });
      }
    }
    // привязать сделку к проекту pm (платежи получают этапы проекта)
    if (l && c === 'project' && method === 'PUT') {
      if (!leader) return err(403, 'Только руководитель');
      if (body.pmProjectId && !pmBrief(body.pmProjectId)) return err(400, 'Проект не найден');
      l.pmProjectId = body.pmProjectId || ''; for (const p of paysOf(l.id)) p.pmProjectId = l.pmProjectId;
      saveAudit('link', 'crmLeads', l.id, { pmProjectId: l.pmProjectId }); return ok(leadOut(l));
    }
  }
  // КП из реестра ядра → лиды (те, что ещё не связаны)
  if (a === 'import' && b === 'proposals' && method === 'POST') {
    if (!editor) return err(403, 'Нет доступа');
    const used = new Set(db.crmLeads.map(l => l.proposalId).filter(Boolean)); let n = 0; let no = nextNo() - 1;
    for (const p of db.proposals) {
      if (used.has(p.id)) continue; const f = C.leadFromProposal(p, ctx.D.kpCalc);
      const l = Object.assign({ objectType: 'Прочее', bin: '', respId: user.id }, f, { id: store.id(), no: ++no, createdAt: now(), createdBy: user.id, history: [] });
      if (l.status === 'Отказ') l.reason = 'Прочее';
      if (l.status === 'Договор') l.signedAt = ''; // по КП «Выполнено» — договор был; график и проект не создаём
      history(l, l.status, 'из реестра КП'); db.crmLeads.push(l); n++;
    }
    if (n) saveAudit('import', 'crmLeads', 'proposals', { n }); return ok({ created: n });
  }
  // договор из реестра ядра (подписан раньше, без лида) → сделка со статусом «Договор» и графиком
  if (a === 'import' && b === 'contract' && method === 'POST') {
    if (!C.canPayments(user)) return err(403, 'Нет доступа');
    const ct = db.contracts.find(x => x.id === body.contractId); if (!ct) return err(404, 'Договор не найден');
    if (db.crmLeads.some(l => l.contractId === ct.id)) return err(409, 'По этому договору уже есть сделка');
    const m = contractMeta(ct); const sum = C.num(body.sum) || C.num(ct.remaining) || C.num(ct.sum); if (!sum) return err(400, 'В договоре нет суммы — укажите сумму графика');
    const track = C.normTrack(body.track); const rows = Array.isArray(body.rows) && body.rows.length ? body.rows : C.PAY_TEMPLATES[track];
    const sh = rows.reduce((s, r) => s + C.num(r.share), 0); if (Math.abs(sh - 100) > 0.01) return err(400, `Сумма долей ${sh} %, должно быть 100 %`);
    const l = { id: store.id(), no: nextNo(), client: ct.clientShort || ct.client || '', object: ct.name || ct.code || '', track, objectType: 'Прочее', source: 'Реестр договоров', sum, vatIncluded: !/без ндс/i.test(ct.note || ''), status: 'Договор', contractId: ct.id, contractNo: m.no, contractDate: m.date, company: ct.company || '', pmProjectId: pmBrief(body.pmProjectId) ? body.pmProjectId : '', respId: user.id, kpAt: m.date || t, signedAt: m.date || t, createdAt: now(), createdBy: user.id, history: [] };
    history(l, 'Договор', 'из реестра договоров' + (C.num(ct.paid) && !C.num(body.sum) ? `; уже оплачено ${C.moneyStr(ct.paid)} — график на остаток` : '')); db.crmLeads.push(l);
    makeSchedule(ctx, l, rows, user.id); saveAudit('import', 'crmLeads', l.id, { contractId: ct.id });
    return ok(leadOut(l));
  }

  // ---- график платежей ----
  if (a === 'payments') {
    if (!C.canPayments(user)) return err(403, 'График платежей ведут руководители');
    if (!b && method === 'GET') {
      const deals = db.crmLeads.filter(l => (l.status === 'Договор' && (l.signedAt || paysOf(l.id).length)) || paysOf(l.id).length).map(l => Object.assign(leadOut(l), { payments: paysOf(l.id).map(payOut), stageNames: l.pmProjectId ? stageNamesOf(l.pmProjectId) : [] }));
      return ok({ deals: deals.sort((x, y) => String(y.contractDate || y.createdAt).localeCompare(String(x.contractDate || x.createdAt))), expected: expectedPayments(ctx, t, C.addDays(t, 180)), today: t, term: termOf(ctx) });
    }
    if (!b && method === 'POST') {
      const l = findL(body.leadId); if (!l) return err(400, 'Нет сделки');
      const r = makeSchedule(ctx, l, [{ name: String(body.name || 'Платёж'), share: body.share, stage: body.stage, due: body.due }], user.id, true)[0];
      if (C.num(body.sum)) r.sum = C.num(body.sum); saveAudit('create', 'crmPayments', r.id); return ok(payOut(r));
    }
    const p = b && findPay(b); if (b && !p) return err(404, 'Платёж не найден');
    if (p && method === 'PUT') {
      const patch = pick(body, PAY_FIELDS); for (const k of ['share', 'sum']) if (k in patch) patch[k] = C.num(patch[k]);
      if ('stage' in patch) { patch.stage = patch.stage === '' || patch.stage == null ? '' : C.num(patch.stage); // заново привязан — запоминаем название и код этапа
        const l0 = findL(p.leadId) || {}; const pid = p.pmProjectId || l0.pmProjectId; const its = pid ? (db.pmItems || []).filter(i => i.pid === pid) : []; const names = pid ? stageNamesOf(pid) : []; const codes = C.stageCodes(its, names);
        patch.stageName = patch.stage && names[patch.stage - 1] ? names[patch.stage - 1] : ''; patch.stageCode = Object.keys(codes).find(k => codes[k] === patch.stage) || ''; }
      if ('status' in patch && !C.PAY_STATUS.includes(patch.status)) return err(400, 'Неизвестный статус');
      if (patch.status === 'Акт выставлен' && !p.actDate && !patch.actDate) patch.actDate = t;
      if (patch.status === 'Оплачен' && !p.paidDate && !patch.paidDate) patch.paidDate = t;
      if (patch.status === 'Ожидается') { patch.actDate = ''; patch.paidDate = ''; }
      Object.assign(p, patch, { updatedAt: now(), updatedBy: user.id }); saveAudit('update', 'crmPayments', p.id, patch.status ? { status: patch.status } : undefined); return ok(payOut(p));
    }
    if (p && method === 'DELETE') { if (p.status === 'Оплачен') return err(409, 'Оплаченный платёж не удаляется'); db.crmPayments.splice(db.crmPayments.indexOf(p), 1); saveAudit('delete', 'crmPayments', p.id); return ok({ ok: true }); }
  }
  if (a === 'expected' && method === 'GET') { if (!C.canPayments(user)) return err(403, 'Нет доступа'); return ok(expectedPayments(ctx, qs.from || t, qs.to || C.addDays(t, 90))); }

  // ---- шаблоны документов ----
  if (a === 'templates') {
    if (!C.canDocs(user)) return err(403, 'Нет доступа к документам');
    const all = () => { const custom = new Map(db.crmTemplates.map(x => [x.id, x])); return [...C.DEFAULT_TEMPLATES.map(d => Object.assign({}, d, custom.get(d.id) || {}, { builtin: true, changed: custom.has(d.id) })), ...db.crmTemplates.filter(x => !C.DEFAULT_TEMPLATES.some(d => d.id === x.id)).map(x => Object.assign({}, x, { builtin: false }))]; };
    if (!b && method === 'GET') return ok(all());
    if (!C.canEditTemplates(user)) return err(403, 'Шаблоны меняют руководители');
    const f = pick(body, ['title', 'body', 'kind']); if ('kind' in f && !['print', '1c'].includes(f.kind)) f.kind = 'print';
    if (!b && method === 'POST') { if (!String(f.title || '').trim()) return err(400, 'Название шаблона'); const x = Object.assign({ kind: 'print', body: '' }, f, { id: store.id(), createdAt: now(), createdBy: user.id }); db.crmTemplates.push(x); saveAudit('create', 'crmTemplates', x.id); return ok(x); }
    const isDef = C.DEFAULT_TEMPLATES.some(d => d.id === b); let x = b && db.crmTemplates.find(y => y.id === b);
    if (!b || (!x && !isDef)) return err(404, 'Шаблон не найден');
    if (method === 'PUT') { if (!x) { x = { id: b }; db.crmTemplates.push(x); } Object.assign(x, f, { updatedAt: now(), updatedBy: user.id }); saveAudit('update', 'crmTemplates', b); return ok(all().find(y => y.id === b)); }
    if (method === 'DELETE') { if (x) db.crmTemplates.splice(db.crmTemplates.indexOf(x), 1); saveAudit(isDef ? 'reset' : 'delete', 'crmTemplates', b); return ok({ ok: true }); }
  }
  // заполнить шаблон по сделке (и этапу оплаты): HTML для печати; для АВР/счёта — ещё строка CSV для бухгалтера (1С)
  if (a === 'docs' && b === 'render' && method === 'POST') {
    if (!C.canDocs(user)) return err(403, 'Нет доступа к документам');
    const l = findL(body.leadId); if (!l) return err(400, 'Выберите сделку');
    const custom = db.crmTemplates.find(x => x.id === body.templateId); const def = C.DEFAULT_TEMPLATES.find(x => x.id === body.templateId);
    const tpl = def ? Object.assign({}, def, custom || {}) : custom; if (!tpl) return err(404, 'Шаблон не найден');
    const pays = paysOf(l.id); const pay = body.paymentId ? pays.find(p => p.id === body.paymentId) : null;
    if (tpl.kind === '1c' && !pay) return err(400, 'Для АВР и счёта выберите этап оплаты');
    const data = C.docData(l, pays, pay, vat); const title = `${tpl.title} — ${l.client || l.object || ''}`;
    const out = { title, html: C.docPage(title, C.fill(tpl.body, data)), kind: tpl.kind || 'print' };
    if (tpl.kind === '1c') out.csv = C.csv1c([C.row1c(/сч[её]т/i.test(tpl.title) ? 'Счёт на оплату' : 'АВР', data)]);
    store.audit(user.id, 'render', 'crmTemplates', tpl.id, { leadId: l.id, paymentId: pay ? pay.id : '' });
    return ok(out);
  }
  return err(404, 'Нет такого раздела коммерции');
}

module.exports = { id: 'crm', api: 'crm', site: 'fin', collections: ['crmLeads', 'crmPayments', 'crmTemplates'], handle, expectedPayments, on: { 'pm.item.done': onItemDone }, domain: C };
