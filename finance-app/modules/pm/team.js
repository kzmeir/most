'use strict';
// «Квартал руководителя», «Офис проекта», переносы сроков с утверждением, проверка пунктов (принять / вернуть), напоминания (14.10.2026).
// Расчёты — чистые функции (quarterRow, office, decisions), их проверяют tests/team_test.js на фикстурах; handle — маршруты /api/pm/*, права — по domain.js.
const PM = require('./domain');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n || 1000);
const almaty = at => PM.almatyDate(at);

// данные одного здания «Квартала»: этажность — число этапов, ширина — объём (недели оценки), готовность, огонь, машины у шлагбаума, флажок, цвет фасада
function quarterRow(p, items, blockers, t, user) {
  const s = PM.summary(p, items, blockers, t); const mine = items.filter(i => i.pid === p.id && !i.na); const h = s.health || {};
  const stages = [...new Set(mine.map(i => i.stage))].sort((a, b) => a - b);
  const doneStages = stages.filter(st => mine.filter(i => i.stage === st).every(i => i.done)).length;
  const reviewN = mine.filter(i => !i.done && PM.itemKanban(i) === 'review').length;
  const shiftsN = mine.filter(i => PM.shiftPending(i)).length;
  return { id: p.id, name: p.name, no: p.no || '', client: p.client || '', track: p.track, status: p.status, leadId: s.leadId, pmId: p.pmId || '', gipId: p.gipId || '', start: p.start || '', due: p.due || '', forecast: p.forecast || '',
    late: s.late, hot: s.hot, pct: s.progress.pct, stage: s.progress.stage, stageName: s.progress.stageName, stages: stages.length, doneStages, items: s.progress.total, done: s.progress.done,
    volume: h.total || 0, overdueN: s.overdueN, reviewN, blockersN: s.blockersN, blockerMaxDays: s.blockerMaxDays, shiftsN, zone: h.zone || 'none', consumption: h.consumption, canEdit: PM.isManager(user, p) };
}

// «Офис проекта»: кто что ведёт, открытые / просроченные / на проверке, «кто молчит», пустые разделы и этапы, перегрузка по всем проектам, кто чаще переносит
// opts: { t, days (молчание, дней), limit (порог перегрузки), users, logs, projects (все проекты — для перегрузки) }
function office(p, items, opts) {
  const t = opts.t || PM.today(); const N = Math.max(1, Number(opts.days) || 5); const limit = Math.max(1, Number(opts.limit) || 8);
  const users = opts.users || []; const logs = (opts.logs || []).filter(r => r.pid === p.id);
  const all = items; const mine = all.filter(i => i.pid === p.id && !i.na);
  const activeP = new Set((opts.projects || []).filter(q => PM.ACTIVE(q.status) && PM.shownTrack(q.track)).map(q => q.id)); activeP.add(p.id);
  const uName = id => (users.find(u => u.id === id) || {}).name || '';
  const isOpen = i => !i.done && !i.na; const isOver = i => isOpen(i) && i.due && i.due < t; const isRev = i => isOpen(i) && PM.itemKanban(i) === 'review';
  const cur = PM.progress(mine).stage;
  // последняя активность человека в проекте: правки пунктов (история), переносы, записи журнала
  const lastOf = uid => { let m = '';
    for (const i of mine) { for (const e of i.history || []) if (e.by === uid && e.at > m) m = e.at; for (const s of i.shifts || []) { if (s.by === uid && s.at > m) m = s.at; if (s.decidedBy === uid && (s.decidedAt || '') > m) m = s.decidedAt; } }
    for (const r of logs) if (r.by === uid && (r.createdAt || '') > m) m = r.createdAt;
    return m ? almaty(m) : ''; };
  const ids = new Set(); for (const i of mine) if (i.assigneeId) ids.add(i.assigneeId);
  for (const k of ['pmId', 'gipId']) if (p[k]) ids.add(p[k]); for (const id of PM.memberIds(p)) if (users.some(u => u.id === id)) ids.add(id);
  const people = [...ids].map(uid => {
    const its = mine.filter(i => i.assigneeId === uid); const u = users.find(x => x.id === uid) || {};
    const sections = [...new Set(its.map(i => PM.itemSection(i) || i.role).filter(Boolean))];
    const roles = [p.pmId === uid ? 'ПМ проекта' : '', p.gipId === uid ? 'ГИП проекта' : '', PM.memberIds(p).includes(uid) && !its.length ? 'участник' : ''].filter(Boolean);
    const last = lastOf(uid); const quiet = last ? PM.days(last, t) : null; const open = its.filter(isOpen).length;
    const allOpen = all.filter(i => i.assigneeId === uid && isOpen(i) && activeP.has(i.pid)).length;
    let shiftN = 0, shiftDays = 0, requested = 0;
    for (const i of mine) for (const s of i.shifts || []) { const who = s.assigneeId || i.assigneeId || s.by; if ((s.status === 'approved' || s.status === 'direct') && who === uid) { shiftN++; shiftDays += Number(s.days) || 0; } if (s.by === uid && s.status !== 'direct') requested++; }
    return { id: uid, name: u.name || uName(uid) || '—', role: u.role || '', roles, sections, open, overdue: its.filter(isOver).length, review: its.filter(isRev).length, done: its.filter(i => i.done).length,
      last, quietDays: quiet, silent: open > 0 && (quiet === null || quiet >= N), allOpen, overload: allOpen > limit, shiftN, shiftDays, requested };
  });
  // подрядчики — без входа в систему: только что ведут и сколько открыто
  const contractors = [...new Set(mine.filter(i => i.contractor && !i.assigneeId).map(i => i.contractor))].map(name => { const its = mine.filter(i => i.contractor === name && !i.assigneeId);
    return { name, sections: [...new Set(its.map(i => PM.itemSection(i) || i.role).filter(Boolean))], open: its.filter(isOpen).length, overdue: its.filter(isOver).length, review: its.filter(isRev).length, done: its.filter(i => i.done).length }; });
  // «пустые» разделы и этапы: среди открытых пунктов текущего этапа и тех, чей срок прошёл или наступает в 14 дней
  const soon = PM.addDays(t, 14); const act = mine.filter(i => isOpen(i) && (i.stage === cur || (i.due && i.due <= soon)));
  const lastMove = list => { let m = ''; for (const i of list) { for (const e of i.history || []) if (e.at > m) m = e.at; for (const s of i.shifts || []) if (s.at > m) m = s.at; } return m ? almaty(m) : ''; };
  // движение — любая правка пунктов этого раздела / этапа (в т. ч. уже сделанных), не только открытых
  const check = (kind, name, list, scope) => { const noOwner = list.every(i => !i.assigneeId && !i.contractor); const lm = lastMove(scope || list); const stale = lm ? PM.days(lm, t) : null; const reasons = [];
    if (noOwner) reasons.push('нет исполнителя'); if (stale === null || stale >= N) reasons.push(stale === null ? 'движения не было' : `нет движения ${stale} дн.`);
    return reasons.length ? { kind, name, open: list.length, overdue: list.filter(isOver).length, noOwner, last: lm, staleDays: stale, reasons } : null; };
  const empty = [];
  const bySec = new Map(); for (const i of act) { const k = PM.itemSection(i) || i.role || '—'; if (!bySec.has(k)) bySec.set(k, []); bySec.get(k).push(i); }
  for (const [k, list] of bySec) { const x = check('section', k, list, mine.filter(i => (PM.itemSection(i) || i.role || '—') === k)); if (x) empty.push(x); }
  const stIt = act.filter(i => i.stage === cur); if (stIt.length) { const x = check('stage', stIt[0].stageName || `Этап ${cur}`, stIt, mine.filter(i => i.stage === cur)); if (x) empty.unshift(x); }
  people.sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.name.localeCompare(b.name, 'ru'));
  const shifters = people.filter(x => x.shiftN || x.requested).slice().sort((a, b) => b.shiftN - a.shiftN || b.shiftDays - a.shiftDays || b.requested - a.requested);
  const unassigned = mine.filter(i => isOpen(i) && !i.assigneeId && !i.contractor).length;
  return { days: N, limit, today: t, stage: cur, people, contractors, silent: people.filter(x => x.silent), overloaded: people.filter(x => x.overload), empty, shifters, unassigned,
    totals: { open: mine.filter(isOpen).length, overdue: mine.filter(isOver).length, review: mine.filter(isRev).length, pending: mine.filter(i => PM.shiftPending(i)).length } };
}

// флаги пункта для интерфейса: запрошенный перенос, история переносов, кто может запросить / решить / принять
function itemFlags(user, p, it, users) {
  const s = PM.shiftPending(it); const author = s ? (users || []).find(u => u.id === s.by) : null;
  return { shift: s, shiftStats: PM.shiftStats(it), canShift: PM.canShiftRequest(user, p, it) && !s, canShiftDecide: !!s && PM.canShiftDecide(user, p, s, author), canShiftCancel: !!s && s.by === (user && user.id), canReview: PM.canReview(user, p, it) };
}

// что ждёт решения пользователя (раздел ЭП или РП): запросы переносов и пункты на проверке; плюс мои запросы
function decisions(user, db, track, visibleP) {
  const out = { shifts: [], review: [], mine: [] }; const P = new Map(db.pmProjects.map(p => [p.id, p]));
  for (const it of db.pmItems) {
    const p = P.get(it.pid); if (!p || !PM.ACTIVE(p.status) || !PM.shownTrack(p.track) || (track && PM.trackPath(p.track) !== PM.trackPath(track)) || (visibleP && !visibleP(p))) continue;
    const s = PM.shiftPending(it); const row = () => Object.assign({}, it, { project: p.name, track: p.track, kcol: PM.itemKanban(it) }, itemFlags(user, p, it, db.users));
    if (s && PM.canShiftDecide(user, p, s, db.users.find(u => u.id === s.by))) out.shifts.push(row());
    else if (s && s.by === user.id) out.mine.push(row());
    if (PM.canReview(user, p, it)) out.review.push(row());
  }
  const byAt = (a, b) => String((a.shift || {}).at || a.updatedAt || '').localeCompare(String((b.shift || {}).at || b.updatedAt || ''));
  out.shifts.sort(byAt); out.review.sort(byAt); out.mine.sort(byAt); return out;
}

// маршруты: GET quarter, GET decisions, GET projects/:id/office, POST projects/:id/remind, POST items/:id/shift, POST items/:id/shift/:sid, POST items/:id/review.
// h — помощники server.js: { logHistory, visibleP, staff, S, t }. Возвращает true, если маршрут наш и ответ отправлен.
function handle(ctx, h) {
  let hit = false; const ok = x => { hit = true; return ctx.ok(x); }; const err = (st, m) => { hit = true; return ctx.err(st, m); };
  route(ctx, h, ok, err); return hit;
}
function route(ctx, h, ok, err) {
  const { parts, method, body, user, db, store } = ctx; const [, a, b, c, d] = parts; const t = h.t; const now = () => new Date().toISOString();
  const findP = id => db.pmProjects.find(p => p.id === id); const leadRole = PM.isLeader(user) || ['pm', 'gip'].includes(user.role);
  const logs = () => (db.pmLog = db.pmLog || []);
  if (a === 'quarter' && method === 'GET') {
    if (!leadRole) return err(403, '«Квартал» — для руководителей, ПМ и ГИП');
    const tr = ctx.qs && ctx.qs.track; const rows = db.pmProjects.filter(p => PM.ACTIVE(p.status) && PM.shownTrack(p.track) && (!tr || PM.trackPath(p.track) === PM.trackPath(tr)) && h.visibleP(p)).map(p => quarterRow(p, db.pmItems, db.pmBlockers, t, user));
    return ok({ rows, today: t, settings: { silentDays: h.S.silentDays, overloadLimit: h.S.overloadLimit } });
  }
  if (a === 'decisions' && method === 'GET') { if (h.staff) return ok({ shifts: [], review: [], mine: decisions(user, db, ctx.qs && ctx.qs.track, h.visibleP).mine }); return ok(decisions(user, db, ctx.qs && ctx.qs.track, h.visibleP)); }
  if (a === 'projects' && b && (c === 'office' || c === 'remind')) {
    const p = findP(b); if (!p) return err(404, 'Проект не найден');
    if (!PM.isManager(user, p)) return err(403, c === 'office' ? '«Офис проекта» видят руководители, ГИП и ПМ проекта' : 'Напоминать может руководитель, ГИП или ПМ проекта');
    const off = office(p, db.pmItems, { t, days: h.S.silentDays, limit: h.S.overloadLimit, users: db.users, logs: logs(), projects: db.pmProjects });
    if (c === 'office' && method === 'GET') return ok(Object.assign(off, { project: { id: p.id, name: p.name, track: p.track, no: p.no || '', pmId: p.pmId || '', gipId: p.gipId || '', due: p.due || '', status: p.status }, canSettings: PM.isLeader(user) }));
    if (c === 'remind' && method === 'POST') {
      const mine = db.pmItems.filter(i => i.pid === p.id && !i.done && !i.na);
      const want = Array.isArray(body.userIds) && body.userIds.length ? new Set(body.userIds.map(String)) : null;
      const targets = off.people.filter(x => (!want || want.has(x.id)) && (x.overdue > 0 || x.silent));
      if (!targets.length) return err(400, 'Напоминать некому: просроченных пунктов и «молчащих» исполнителей нет');
      const lines = targets.map(x => { const over = mine.filter(i => i.assigneeId === x.id && i.due && i.due < t); return `${x.name} — ${[over.length ? `просрочено ${over.length}: ${over.slice(0, 3).map(i => (i.code ? i.code + ' ' : '') + i.title).join('; ')}${over.length > 3 ? '…' : ''}` : '', x.silent ? (x.quietDays === null ? 'движения по пунктам не было' : `нет движения ${x.quietDays} дн.`) : ''].filter(Boolean).join(', ')}`; });
      const note = str(body.text, 1000); const text = `Напоминание исполнителям: ${lines.join('; ')}${note ? `. ${note}` : ''}`.slice(0, PM.LOG_MAX_TEXT || 10000);
      const rec = { id: store.id(), pid: p.id, date: t, type: 'note', text, participants: targets.map(x => x.name).join(', '), files: [], by: user.id, createdAt: now(), source: 'remind' }; logs().push(rec);
      store.save(); store.audit(user.id, 'remind', 'pmProjects', p.id, { users: targets.map(x => x.id) });
      const its = mine.filter(i => targets.some(x => x.id === i.assigneeId) && i.due && i.due < t).map(i => ({ id: i.id, title: i.title, due: i.due, assigneeId: i.assigneeId }));
      ctx.emit('pm.remind', { project: { id: p.id, name: p.name, track: p.track }, userIds: targets.map(x => x.id), items: its, by: user.id, text, logId: rec.id }); // модуль уведомлений подхватит позже
      return ok({ ok: true, log: rec, users: targets.map(x => ({ id: x.id, name: x.name })) });
    }
    return err(404, 'Нет такого действия');
  }
  if (a === 'items' && b && (c === 'shift' || c === 'review') && method === 'POST') {
    const it = db.pmItems.find(i => i.id === b); if (!it) return err(404, 'Пункт не найден'); const p = findP(it.pid); if (!p) return err(404, 'Проект не найден');
    if (!h.visibleP(p)) return err(403, 'Проект вам не назначен');
    const out = () => Object.assign({}, it, { kcol: PM.itemKanban(it), canEdit: PM.canEditItem(user, p, it) }, itemFlags(user, p, it, db.users));
    const hist = (field, to, note, from) => { it.history = (Array.isArray(it.history) ? it.history : []).concat([Object.assign({ at: now(), by: user.id, field, from: from == null ? '' : from, to }, note ? { note } : {})]).slice(-20); };
    if (c === 'shift' && !d) { // запросить перенос: { due, reason }
      if (PM.isLeader(user)) return err(400, 'Владелец и партнёр меняют срок сами — «✎ Изменить» → «Срок»');
      if (!PM.canShiftRequest(user, p, it)) return err(403, it.done || it.na ? 'Пункт закрыт — переносить нечего' : 'Запросить перенос может исполнитель пункта, ГИП или ПМ проекта');
      if (PM.shiftPending(it)) return err(409, 'Перенос уже запрошен — дождитесь решения');
      const due = str(body.due, 10); const reason = str(body.reason, 1000);
      if (!DATE_RE.test(due)) return err(400, 'Укажите новую дату срока');
      if (!reason) return err(400, 'Причина переноса обязательна');
      if (due === (it.due || '')) return err(400, 'Новая дата совпадает с текущим сроком');
      if (due < t) return err(400, 'Новая дата уже прошла');
      const s = { id: store.id(), at: now(), by: user.id, assigneeId: it.assigneeId || '', from: it.due || '', to: due, days: it.due ? PM.days(it.due, due) : 0, reason, status: 'pending' };
      it.shifts = (Array.isArray(it.shifts) ? it.shifts : []).concat([s]).slice(-30); hist('shift', 'pending', `запрошен перенос на ${due}: ${reason}`, it.due || '');
      store.save(); store.audit(user.id, 'shift-request', 'pmItems', it.id, { to: due });
      ctx.emit('pm.shift.requested', { item: it, project: p, shift: s });
      return ok(out());
    }
    if (c === 'shift' && d) { // решение: { action: approve|reject|cancel, comment }
      const s = (it.shifts || []).find(x => x.id === d); if (!s) return err(404, 'Запрос не найден'); if (s.status !== 'pending') return err(409, 'По запросу уже есть решение');
      const action = body.action; const comment = str(body.comment, 1000);
      if (action === 'cancel') { if (s.by !== user.id) return err(403, 'Отменить может автор запроса'); Object.assign(s, { status: 'cancelled', decidedAt: now(), decidedBy: user.id, comment }); hist('shift', 'cancelled', 'запрос отменён автором'); }
      else if (action === 'approve' || action === 'reject') {
        if (!PM.canShiftDecide(user, p, s, db.users.find(u => u.id === s.by))) return err(403, s.by === user.id ? 'Свой запрос утверждает другой руководитель' : 'Решение по переносу принимает руководитель проекта (запрос ГИП/ПМ — владелец или партнёр)');
        if (action === 'reject' && !comment) return err(400, 'Напишите, почему отклоняете');
        Object.assign(s, { status: action === 'approve' ? 'approved' : 'rejected', decidedAt: now(), decidedBy: user.id, comment });
        if (action === 'approve') { s.from = it.due || s.from; s.days = s.from ? PM.days(s.from, s.to) : 0; h.logHistory(it, { due: s.to }, user.id, `перенос по запросу: ${s.reason}`); it.due = s.to; }
        else hist('shift', 'rejected', `перенос на ${s.to} отклонён${comment ? ': ' + comment : ''}`);
      } else return err(400, 'Действие: approve, reject или cancel');
      Object.assign(it, { updatedAt: now(), updatedBy: user.id }); store.save(); store.audit(user.id, 'shift-' + action, 'pmItems', it.id, { shift: s.id, to: s.to });
      if (action !== 'cancel') ctx.emit('pm.shift.decided', { item: it, project: p, shift: s });
      return ok(out());
    }
    if (c === 'review' && !d) { // { action: accept|return, comment }
      if (!PM.isManager(user, p)) return err(403, 'Принимает и возвращает руководитель, ГИП или ПМ проекта');
      if (!PM.canReview(user, p, it)) return err(409, 'Пункт не на проверке');
      const comment = str(body.comment, 1000);
      if (body.action === 'accept') {
        h.logHistory(it, { done: true, kstatus: 'done' }, user.id, comment ? `принято: ${comment}` : 'принято на проверке');
        Object.assign(it, { done: true, kstatus: 'done', doneAt: t, doneBy: user.id, reviewedAt: now(), reviewedBy: user.id, updatedAt: now(), updatedBy: user.id }); if (comment) it.doneNote = it.doneNote ? it.doneNote : comment;
        store.save(); store.audit(user.id, 'review-accept', 'pmItems', it.id);
        ctx.emit('pm.item.done', { item: it, project: p }); ctx.emit('pm.item.reviewed', { item: it, project: p, action: 'accept', comment, by: user.id });
        return ok(out());
      }
      if (body.action === 'return') {
        if (!comment) return err(400, 'Замечание обязательно — что исправить');
        h.logHistory(it, { kstatus: 'doing' }, user.id, 'возврат с проверки'); hist('review', 'returned', comment);
        Object.assign(it, { kstatus: 'doing', returns: (Number(it.returns) || 0) + 1, lastRemark: comment, reviewedAt: now(), reviewedBy: user.id, updatedAt: now(), updatedBy: user.id });
        store.save(); store.audit(user.id, 'review-return', 'pmItems', it.id, { comment });
        ctx.emit('pm.item.reviewed', { item: it, project: p, action: 'return', comment, by: user.id });
        return ok(out());
      }
      return err(400, 'Действие: accept или return');
    }
  }
}

module.exports = { quarterRow, office, itemFlags, decisions, handle };
