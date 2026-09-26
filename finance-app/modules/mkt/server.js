'use strict';
// Модуль «Маркетинг»: /api/mkt/*. Сайт «Финансы». Контракт модулей — docs/ARCHITECTURE.md, описание — modules/mkt/README.md.
// Посты контент-плана (mktPosts), согласия заказчиков по проектам (mktConsents), итоги месяца (mktMetrics).
// Картинки — на диске в DATA_DIR/mkt-files/, в посте только ключи (как у модуля board). pmProjects и crmLeads только читаем.
const fs = require('fs');
const path = require('path');
const M = require('./domain');

const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const filesDir = ctx => path.join(ctx.store.DATA_DIR, 'mkt-files');
const newKey = ext => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
// картинка из base64: проверка типа, размера и сигнатуры; → { key, name, type, size } или строка ошибки
function readImage(f) {
  const type = String((f && f.type) || ''); const ext = M.IMAGE_TYPES[type]; if (!ext) return `${f && f.name ? f.name + ': ' : ''}разрешены PNG, JPG, WebP, GIF`;
  const b64 = String(f.data || '').replace(/^data:[^,]*,/, ''); if (!b64) return 'Пустой файл'; if (b64.length * 3 / 4 > M.MAX_IMAGE + 4) return `${f.name || 'Файл'}: больше ${M.MAX_IMAGE / 1048576} МБ`;
  const data = Buffer.from(b64, 'base64'); if (!data.length || data.length > M.MAX_IMAGE) return `${f.name || 'Файл'}: пустой или больше ${M.MAX_IMAGE / 1048576} МБ`;
  const sig = (ext === 'png' && data.readUInt32BE(0) === 0x89504e47) || (ext === 'jpg' && data.readUInt16BE(0) === 0xffd8) || (ext === 'gif' && data.subarray(0, 4).toString() === 'GIF8') || (ext === 'webp' && data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP');
  if (!sig) return `${f.name || 'Файл'}: содержимое не совпадает с типом`;
  return { ext, data, name: String(f.name || '').slice(0, 200), type, size: data.length };
}
function writeImage(ctx, img) { const dir = filesDir(ctx); fs.mkdirSync(dir, { recursive: true }); const key = newKey(img.ext); fs.writeFileSync(path.join(dir, key), img.data); return { key, name: img.name, type: img.type, size: img.size }; }
const dropFile = (ctx, key) => { if (M.KEY_RE.test(String(key || ''))) { try { fs.unlinkSync(path.join(filesDir(ctx), key)); } catch { } } };

// сводка для меню и панели директора: ctx.modules.mkt.summary(ctx)
function summary(ctx) {
  const posts = ctx.db.mktPosts || []; const t = ctx.today(); const last = M.lastPublished(posts);
  const n = s => posts.filter(p => p.status === s).length;
  return { review: n('review'), rework: n('rework'), approved: n('approved'), late: posts.filter(p => p.status === 'approved' && p.date && p.date < t).length,
    week: posts.filter(p => p.date && M.weekStart(p.date) === M.weekStart(t) && !['rejected'].includes(p.status)).length, lastPublished: last, pauseDays: last ? M.days(last, t) : null };
}

function handle(ctx) {
  const { parts, method, user, db, store, ok, err } = ctx; const body = ctx.body || {}; const qs = ctx.qs || {};
  const [, a, b, c, d] = parts;
  if (!user) return err(401, 'Не авторизован');
  if (!M.canOpen(user)) return err(403, 'Нет доступа к маркетингу');
  const t = ctx.today(); const now = () => new Date().toISOString();
  const leader = M.isLeader(user), editor = M.canEdit(user);
  const projects = db.pmProjects || []; const consents = db.mktConsents;
  const un = id => (ctx.userName ? ctx.userName(id) : '') || '';
  const findP = id => db.mktPosts.find(p => p.id === id);
  const saveAudit = (action, col, id, extra) => { store.save(); store.audit(user.id, action, col, id, extra); };
  const hist = (p, action, note) => { (p.history = p.history || []).push({ at: now(), by: user.id, action, note: note || '' }); };
  const pmBrief = id => { const p = id && projects.find(x => x.id === id); return p ? { id: p.id, name: p.name, client: p.client || '', track: p.track } : null; };
  const postOut = (p, full) => {
    const cs = p.pmProjectId ? M.consentOf(p.pmProjectId, consents) : null;
    const o = Object.assign({}, p, { images: (p.images || []).map(i => Object.assign({}, i, { url: `/api/mkt/files/${i.key}` })), project: pmBrief(p.pmProjectId),
      consent: cs ? { status: cs.status, label: M.CONSENT[cs.status], what: cs.what || [] } : null, block: M.readyReason(p, consents, projects), lint: M.lint([p.textKz, p.text].filter(Boolean).join('\n')), createdByName: un(p.createdBy) });
    if (full) o.history = (p.history || []).map(h => Object.assign({}, h, { byName: un(h.by) })); else delete o.history;
    return o;
  };
  const sortPosts = arr => arr.sort((x, y) => String(x.date || '9').localeCompare(String(y.date || '9')) || String(x.createdAt).localeCompare(String(y.createdAt)));
  // новый пост из полей (создание и импорт)
  const makePost = (f, status, note) => {
    const p = Object.assign({ date: t, channels: ['instagram'], rubric: 'Другое', title: '', text: '', textKz: '', textEn: '', pmProjectId: '' }, f, { id: store.id(), images: [], status, comment: '', publishedUrl: '', createdAt: now(), createdBy: user.id, history: [] });
    if (!p.date) p.date = t; if (!p.channels.length) p.channels = ['instagram'];
    hist(p, 'create', note); if (status === 'review') hist(p, 'submit', ''); return p;
  };

  // ---- счётчики в меню и сводка ----
  if (a === 'badges' && method === 'GET') { const s = summary(ctx); return ok({ mktreview: leader ? s.review : 0, mktplan: s.rework + s.late }); }
  if (a === 'summary' && method === 'GET') return ok(summary(ctx));
  if (a === 'meta' && method === 'GET') {
    return ok({ channels: M.CHANNELS, rubrics: M.RUBRICS, hints: M.RUBRIC_HINT, rules: M.RULES, statuses: M.STATUSES, consent: M.CONSENT, what: M.CONSENT_WHAT, today: t,
      rights: { leader, editor, approve: M.canApprove(user), import: M.canImport(user), consents: M.canConsents(user) },
      pmProjects: projects.map(p => ({ id: p.id, name: p.name, client: p.client || '', track: p.track, status: p.status, consent: M.consentOf(p.id, consents).status })) });
  }

  // ---- файлы (картинки постов) ----
  if (a === 'files' && b && method === 'GET') {
    if (!M.KEY_RE.test(b)) return err(404, 'Файл не найден'); const file = path.join(filesDir(ctx), b); if (!fs.existsSync(file)) return err(404, 'Файл не найден');
    return ctx.send(200, fs.readFileSync(file), { 'Content-Type': MIME[b.split('.').pop()], 'Content-Disposition': `inline; filename="${b}"`, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
  }

  // ---- посты ----
  if (a === 'review' && method === 'GET') return ok(sortPosts(db.mktPosts.filter(p => p.status === 'review')).map(p => postOut(p, true)));
  if (a === 'posts') {
    if (!b && method === 'GET') {
      let list = db.mktPosts.slice();
      if (qs.status) list = list.filter(p => p.status === qs.status); if (qs.rubric) list = list.filter(p => p.rubric === qs.rubric);
      if (qs.from) list = list.filter(p => (p.date || '') >= qs.from); if (qs.to) list = list.filter(p => (p.date || '') <= qs.to);
      return ok(sortPosts(list).map(p => postOut(p)));
    }
    if (!b && method === 'POST') {
      if (!editor) return err(403, 'Нет прав');
      const f = M.cleanPost(body); if (f.pmProjectId && !pmBrief(f.pmProjectId)) return err(400, 'Проект не найден');
      if (!f.title && !f.text && !f.textKz && !f.textEn) return err(400, 'Укажите заголовок или текст');
      const p = makePost(f, 'draft'); db.mktPosts.push(p); saveAudit('create', 'mktPosts', p.id); return ok(postOut(p, true));
    }
    const p = b && findP(b); if (b && !p) return err(404, 'Пост не найден');
    if (p && !c && method === 'GET') return ok(postOut(p, true));
    if (p && !c && method === 'PUT') {
      if (!editor) return err(403, 'Нет прав');
      if (!M.EDITABLE.includes(p.status)) return err(409, p.status === 'approved' ? 'Утверждённый пост не меняется — сначала «Правка»' : `Пост «${M.STATUSES[p.status]}» не меняется`);
      const f = M.cleanPost(body); if (f.pmProjectId && !pmBrief(f.pmProjectId)) return err(400, 'Проект не найден');
      if (Array.isArray(body.images)) { // порядок слайдов и удаление: список ключей из уже загруженных
        const cur = new Map((p.images || []).map(i => [i.key, i])); const keys = [...new Set(body.images.map(String))].filter(k => cur.has(k));
        for (const i of p.images || []) if (!keys.includes(i.key)) dropFile(ctx, i.key);
        f.images = keys.map(k => cur.get(k));
      }
      Object.assign(p, f, { updatedAt: now(), updatedBy: user.id }); hist(p, 'edit', ''); saveAudit('update', 'mktPosts', p.id); return ok(postOut(p, true));
    }
    if (p && !c && method === 'DELETE') {
      if (!(leader || (editor && ['draft', 'rework', 'rejected'].includes(p.status)))) return err(403, 'Удалить можно черновик, пост на правке или отклонённый; остальные — только руководитель');
      for (const i of p.images || []) dropFile(ctx, i.key);
      db.mktPosts.splice(db.mktPosts.indexOf(p), 1); saveAudit('delete', 'mktPosts', p.id); return ok({ ok: true });
    }
    // картинка в конец карусели
    if (p && c === 'images' && !d && method === 'POST') {
      if (!editor) return err(403, 'Нет прав'); if (!M.EDITABLE.includes(p.status)) return err(409, 'Пост уже утверждён — картинки не меняются');
      if ((p.images || []).length >= M.MAX_IMAGES) return err(400, `Не больше ${M.MAX_IMAGES} картинок`);
      const img = readImage(body); if (typeof img === 'string') return err(400, img);
      const x = writeImage(ctx, img); (p.images = p.images || []).push(x); p.updatedAt = now(); p.updatedBy = user.id;
      saveAudit('image', 'mktPosts', p.id, { key: x.key, size: x.size }); return ok(postOut(p, true));
    }
    // смена статуса: submit, approve, rework, reject, publish, reopen
    if (p && c && !d && method === 'POST' && Object.hasOwn(M.ACTIONS, c)) {
      const bad = M.checkAction(user, p, c, body, consents, projects); if (bad) return err(bad[0], bad[1]);
      const A = M.ACTIONS[c]; const note = String(body.comment || '').trim().slice(0, 2000);
      if (c === 'publish') { p.publishedUrl = String(body.url || '').trim().slice(0, 500); p.publishedAt = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : t; p.publishedBy = user.id; }
      if (c === 'approve') { p.approvedAt = now(); p.approvedBy = user.id; }
      if (['rework', 'reject', 'approve'].includes(c)) p.comment = note; // при повторной отправке замечание директора остаётся видно
      p.status = A.to; p.updatedAt = now(); p.updatedBy = user.id; hist(p, c, c === 'publish' ? p.publishedUrl : note);
      saveAudit(c, 'mktPosts', p.id, { status: p.status }); return ok(postOut(p, true));
    }
  }
  // импорт черновиков (ИИ раз в неделю): посты сразу «На утверждении»; всё или ничего
  if (a === 'import' && !b && method === 'POST') {
    if (!M.canImport(user)) return err(403, 'Импорт — только владелец и партнёр');
    const list = Array.isArray(body.posts) ? body.posts : []; if (!list.length) return err(400, 'Нет постов (posts: [...])'); if (list.length > 50) return err(400, 'Не больше 50 постов за раз');
    const errs = []; const ready = list.map((x, i) => {
      const f = M.cleanPost(x || {}); const n = `Пост ${i + 1}`;
      if (!f.title && !f.text && !f.textKz && !f.textEn) errs.push(`${n}: нет заголовка и текста`);
      if (x && x.date && !f.date) errs.push(`${n}: дата не в формате ГГГГ-ММ-ДД`);
      if (f.pmProjectId && !pmBrief(f.pmProjectId)) errs.push(`${n}: проект ${f.pmProjectId} не найден`);
      const imgs = Array.isArray(x && x.images) ? x.images : []; if (imgs.length > M.MAX_IMAGES) errs.push(`${n}: больше ${M.MAX_IMAGES} картинок`);
      const read = imgs.slice(0, M.MAX_IMAGES).map(readImage); read.forEach(r => { if (typeof r === 'string') errs.push(`${n}: ${r}`); });
      return { f, read };
    });
    if (errs.length) return err(400, errs.slice(0, 10).join('; '));
    const made = ready.map(({ f, read }) => { const p = makePost(f, 'review', 'импорт'); p.source = 'import'; p.images = read.map(r => writeImage(ctx, r)); db.mktPosts.push(p); return p; });
    saveAudit('import', 'mktPosts', made.map(p => p.id).join(','), { n: made.length }); return ok({ created: made.length, ids: made.map(p => p.id) });
  }

  // ---- согласия заказчиков ----
  if (a === 'consents') {
    if (!b && method === 'GET') {
      const cnt = id => db.mktPosts.filter(p => p.pmProjectId === id).length;
      return ok(projects.map(p => { const cs = M.consentOf(p.id, consents); return { project: pmBrief(p.id), pmStatus: p.status || '', status: cs.status, what: cs.what || [], date: cs.date || '', note: cs.note || '', byName: un(cs.by), at: cs.at || '', posts: cnt(p.id) }; })
        .sort((x, y) => String(x.project.name).localeCompare(String(y.project.name), 'ru')));
    }
    if (b && method === 'PUT') {
      if (!M.canConsents(user)) return err(403, 'Нет прав');
      if (!pmBrief(b)) return err(404, 'Проект не найден');
      if (!M.CONSENT[body.status]) return err(400, 'Статус: yes / no / unknown');
      const what = (Array.isArray(body.what) ? body.what : String(body.what || '').split(',')).map(String).filter(k => M.CONSENT_WHAT[k]);
      let cs = consents.find(x => x.pmProjectId === b); if (!cs) { cs = { id: store.id(), pmProjectId: b }; consents.push(cs); }
      Object.assign(cs, { status: body.status, what: [...new Set(what)], date: /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : t, note: String(body.note || '').slice(0, 1000), by: user.id, at: now() });
      saveAudit('consent', 'mktConsents', cs.id, { pmProjectId: b, status: cs.status }); return ok(cs);
    }
  }

  // ---- итоги месяца ----
  if (a === 'metrics') {
    if (!b && method === 'GET') { // последние 12 месяцев: ручные цифры + автоматические
      const months = []; let m = t.slice(0, 7); for (let i = 0; i < 12; i++) { months.push(m); const [y, mm] = m.split('-').map(Number); m = mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}`; }
      return ok(months.map(mon => ({ month: mon, manual: db.mktMetrics.find(x => x.month === mon) || null, published: M.publishedByRubric(db.mktPosts, mon), leads: M.leadsBySource(db.crmLeads || [], mon) })));
    }
    if (!/^\d{4}-\d{2}$/.test(b || '')) return err(400, 'Месяц: ГГГГ-ММ');
    if (method === 'GET') return ok({ month: b, manual: db.mktMetrics.find(x => x.month === b) || null, published: M.publishedByRubric(db.mktPosts, b), leads: M.leadsBySource(db.crmLeads || [], b) });
    if (method === 'PUT') {
      if (!editor) return err(403, 'Нет прав');
      let x = db.mktMetrics.find(y => y.month === b); if (!x) { x = { id: store.id(), month: b }; db.mktMetrics.push(x); }
      Object.assign(x, M.cleanMetrics(body), { updatedAt: now(), updatedBy: user.id }); saveAudit('update', 'mktMetrics', x.id, { month: b }); return ok(x);
    }
  }
  return err(404, 'Нет такого раздела маркетинга');
}

module.exports = { id: 'mkt', api: 'mkt', site: 'fin', collections: ['mktPosts', 'mktConsents', 'mktMetrics'], handle, summary, domain: M };
