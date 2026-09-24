'use strict';
// Модуль «Знания»: /api/kb/*. Поток D. Контракт модулей — docs/ARCHITECTURE.md, задачи — modules/kb/README.md.
// Новости, база знаний, документы на ознакомление, тесты, программы обучения новичков.
const K = require('./domain');
const SEED = require('./seed');

const SIGN_SECTION = 'Документы для подписи';
const isSign = a => !!a && (a.sign === true || a.section === SIGN_SECTION);
const str = (v, n = 200000) => String(v == null ? '' : v).slice(0, n);
const tagsOf = v => (Array.isArray(v) ? v : String(v || '').split(',')).map(s => String(s).trim()).filter(Boolean).slice(0, 30);
// ссылки: [{title, url}] или текст «Название | путь» построчно
const linksOf = v => (Array.isArray(v) ? v : String(v || '').split(/\r?\n/).map(l => { const [a, b] = l.split('|').map(s => s.trim()); return b ? { title: a, url: b } : { title: a, url: a }; }))
  .filter(l => l && l.url).map(l => ({ title: str(l.title || l.url, 300), url: str(l.url, 1000) })).slice(0, 50);

function handle(ctx) {
  const { parts, method, body, user, db, store, ok, err, userName } = ctx;
  if (!user) return err(401, 'Не авторизован');
  const [, a, b, c, d] = parts;
  const now = () => new Date().toISOString();
  const t = ctx.today();
  const people = () => db.users.filter(u => u.active !== false);
  const readOf = (kind, refId, uid = user.id) => db.kbReads.find(r => r.userId === uid && r.kind === kind && r.refId === refId);
  const markRead = (kind, refId) => { if (readOf(kind, refId)) return false; db.kbReads.push({ id: store.id(), userId: user.id, kind, refId, at: now() }); return true; };
  const save = (action, col, id, extra) => { store.save(); store.audit(user.id, action, col, id, extra); };
  const trainee = e => ({ section: e.section || ((db.users.find(u => u.id === e.userId) || {}).section) || '' });
  const pctx = e => ({ enroll: e, reads: db.kbReads, attempts: db.kbAttempts, articles: db.kbArticles, tests: db.kbTests, userId: e.userId });

  // ---------- сводка для меню ----------
  if (a === 'summary' && method === 'GET') {
    const unreadNews = db.kbNews.filter(n => !readOf('news', n.id)).length;
    const toSign = db.kbArticles.filter(x => isSign(x) && !readOf('sign', x.id)).length;
    const myEnrolls = db.kbEnroll.filter(e => e.userId === user.id && e.status !== 'done').length;
    return ok({ unreadNews, toSign, myEnrolls, canPublish: K.canPublish(user), canTeach: K.canTeach(user), isLeader: K.isLeader(user), sections: K.SECTIONS });
  }

  // ---------- новости ----------
  if (a === 'news') {
    if (!b && method === 'GET') {
      const all = K.canPublish(user); const nUsers = people().length;
      const list = db.kbNews.slice().sort((x, y) => (y.pinned ? 1 : 0) - (x.pinned ? 1 : 0) || String(y.date).localeCompare(String(x.date)) || String(y.createdAt).localeCompare(String(x.createdAt)))
        .map(n => { const rs = db.kbReads.filter(r => r.kind === 'news' && r.refId === n.id); const mine = rs.find(r => r.userId === user.id);
          return Object.assign({}, n, { author: userName(n.authorId), read: !!mine, readAt: mine ? mine.at : '', readers: all ? rs.map(r => ({ name: userName(r.userId), at: r.at })) : undefined, readersN: rs.length, usersN: nUsers }); });
      return ok(list);
    }
    if (!b && method === 'POST') {
      if (!K.canPublish(user)) return err(403, 'Публикуют руководители и секретарь');
      if (!str(body.title).trim()) return err(400, 'Нужен заголовок');
      const n = { id: store.id(), title: str(body.title, 300).trim(), text: str(body.text), pinned: body.pinned === true || body.pinned === 'true', date: body.date || t, authorId: user.id, createdAt: now() };
      db.kbNews.push(n); db.kbReads.push({ id: store.id(), userId: user.id, kind: 'news', refId: n.id, at: now() }); save('create', 'kbNews', n.id); return ok(n);
    }
    const n = b && db.kbNews.find(x => x.id === b); if (!n) return err(404, 'Новость не найдена');
    if (c === 'read' && method === 'POST') { if (markRead('news', n.id)) save('read', 'kbNews', n.id); return ok({ ok: true }); }
    if (!K.canPublish(user)) return err(403, 'Менять новости могут руководители и секретарь');
    if (!c && method === 'PUT') {
      if ('title' in body && !str(body.title).trim()) return err(400, 'Нужен заголовок');
      Object.assign(n, ctx.pick(body, ['title', 'text', 'date']), 'pinned' in body ? { pinned: body.pinned === true || body.pinned === 'true' } : {}, { updatedAt: now(), updatedBy: user.id });
      save('update', 'kbNews', n.id); return ok(n);
    }
    if (!c && method === 'DELETE') { db.kbNews = db.kbNews.filter(x => x.id !== n.id); db.kbReads = db.kbReads.filter(r => !(r.kind === 'news' && r.refId === n.id)); save('delete', 'kbNews', n.id); return ok({ ok: true }); }
  }

  // ---------- база знаний ----------
  const artFields = x => ({ section: str(x.section, 100).trim() || 'Регламенты', title: str(x.title, 300).trim(), text: str(x.text), tags: tagsOf(x.tags), links: linksOf(x.links), sign: x.section === SIGN_SECTION || x.sign === true || x.sign === 'true' });
  if (a === 'articles') {
    if (!b && method === 'GET') {
      let list = db.kbArticles; if (ctx.qs.section) list = list.filter(x => x.section === ctx.qs.section);
      const q = ctx.qs.q || '';
      const counts = {}; for (const x of db.kbArticles) counts[x.section] = (counts[x.section] || 0) + 1;
      return ok({ counts, items: K.search(list, q).map(({ a: x, rank }) => ({ id: x.id, section: x.section, title: x.title, tags: x.tags || [], sign: isSign(x), links: (x.links || []).length, updatedAt: x.updatedAt || x.createdAt, rank, snippet: K.snippet(x.text, q), read: !!(readOf('article', x.id) || readOf('sign', x.id)), signed: isSign(x) ? !!readOf('sign', x.id) : undefined })).sort((p, r) => r.rank - p.rank || p.section.localeCompare(r.section) || p.title.localeCompare(r.title, 'ru')) });
    }
    if (!b && method === 'POST') {
      if (!K.canPublish(user)) return err(403, 'Статьи пишут руководители и секретарь');
      const f = artFields(body); if (!f.title) return err(400, 'Нужен заголовок');
      const x = Object.assign(f, { id: store.id(), authorId: user.id, createdAt: now() }); db.kbArticles.push(x); save('create', 'kbArticles', x.id); return ok(x);
    }
    const x = b && db.kbArticles.find(z => z.id === b); if (!x) return err(404, 'Статья не найдена');
    if (!c && method === 'GET') {
      const out = Object.assign({}, x, { sign: isSign(x), author: userName(x.authorId), read: readOf('article', x.id) || null, signed: readOf('sign', x.id) || null, canEdit: K.canPublish(user), tests: db.kbTests.filter(z => z.articleId === x.id).map(z => ({ id: z.id, title: z.title })) });
      if (isSign(x) && (K.canPublish(user) || K.canTeach(user))) out.signers = db.kbReads.filter(r => r.kind === 'sign' && r.refId === x.id).map(r => ({ userId: r.userId, name: userName(r.userId), at: r.at }));
      return ok(out);
    }
    if (c === 'read' && method === 'POST') { if (markRead('article', x.id)) save('read', 'kbArticles', x.id); return ok({ ok: true }); }
    if (c === 'sign' && method === 'POST') { if (!isSign(x)) return err(400, 'Этот документ не требует ознакомления'); if (markRead('sign', x.id)) save('sign', 'kbArticles', x.id); return ok(readOf('sign', x.id)); }
    if (!K.canPublish(user)) return err(403, 'Менять статьи могут руководители и секретарь');
    if (!c && method === 'PUT') { const f = artFields(Object.assign({}, x, body)); if (!f.title) return err(400, 'Нужен заголовок'); Object.assign(x, f, { updatedAt: now(), updatedBy: user.id }); save('update', 'kbArticles', x.id); return ok(x); }
    if (!c && method === 'DELETE') { db.kbArticles = db.kbArticles.filter(z => z.id !== x.id); db.kbReads = db.kbReads.filter(r => !(['article', 'sign'].includes(r.kind) && r.refId === x.id)); save('delete', 'kbArticles', x.id); return ok({ ok: true }); }
  }
  // импорт из tools/import_kb.py: сопоставление по source (путь файла), иначе по разделу+заголовку
  if (a === 'import' && method === 'POST') {
    if (!K.canPublish(user)) return err(403, 'Импорт — руководители и секретарь');
    const list = Array.isArray(body.articles) ? body.articles : []; if (!list.length) return err(400, 'Нет статей для импорта');
    let added = 0, updated = 0;
    for (const raw of list.slice(0, 2000)) {
      const f = artFields(raw); if (!f.title) continue; const source = str(raw.source, 1000);
      const ex = db.kbArticles.find(z => (source && z.source === source) || (!source && z.section === f.section && z.title === f.title));
      if (ex) { Object.assign(ex, f, { source: source || ex.source, updatedAt: now(), updatedBy: user.id }); updated++; }
      else { db.kbArticles.push(Object.assign(f, { id: store.id(), source, authorId: user.id, createdAt: now(), imported: true })); added++; }
    }
    save('import', 'kbArticles', '', { added, updated }); return ok({ added, updated });
  }

  // ---------- документы на ознакомление: мои и сводная ----------
  if (a === 'signs' && method === 'GET') {
    const docs = db.kbArticles.filter(isSign).sort((p, r) => p.title.localeCompare(r.title, 'ru'));
    const out = { mine: docs.map(x => ({ id: x.id, title: x.title, signed: readOf('sign', x.id) || null })) };
    if (K.isLeader(user) || user.role === 'secretary' || user.role === 'lead') {
      const us = people().filter(u => user.role !== 'lead' || u.section === user.section || db.kbEnroll.some(e => e.userId === u.id && trainee(e).section === user.section));
      out.matrix = { docs: docs.map(x => ({ id: x.id, title: x.title })), rows: us.map(u => ({ id: u.id, name: u.name || u.login, marks: Object.fromEntries(docs.map(x => { const r = readOf('sign', x.id, u.id); return [x.id, r ? r.at : '']; })) })) };
    }
    return ok(out);
  }

  // ---------- тесты ----------
  const myAttempts = (tid, uid = user.id) => db.kbAttempts.filter(x => x.testId === tid && x.userId === uid);
  const leftOut = v => v === Infinity ? null : v;
  const testFields = x => { const p = K.parseTest(x.text); return { errors: p.errors, f: { title: str(x.title, 300).trim(), description: str(x.description, 5000), passScore: Math.max(0, Math.min(100, x.passScore === '' || x.passScore == null ? 80 : Number(x.passScore) || 0)), maxAttempts: Math.max(0, Math.floor(Number(x.maxAttempts) || 0)), articleId: str(x.articleId, 100), questions: p.questions } }; };
  if (a === 'tests') {
    if (!b && method === 'GET') {
      return ok(db.kbTests.slice().sort((p, r) => p.title.localeCompare(r.title, 'ru')).map(x => { const at = myAttempts(x.id); const best = at.slice().sort((p, r) => r.score - p.score)[0];
        return { id: x.id, title: x.title, description: x.description, passScore: x.passScore, maxAttempts: x.maxAttempts, n: (x.questions || []).length, attempts: at.length, left: leftOut(K.attemptsLeft(x, at.length)), best: best ? best.score : null, passed: at.some(z => z.passed), takers: K.canTeach(user) ? new Set(db.kbAttempts.filter(z => z.testId === x.id).map(z => z.userId)).size : undefined }; }));
    }
    if (!b && method === 'POST') {
      if (!K.canTeach(user)) return err(403, 'Тесты составляют руководители и руководители разделов');
      const { f, errors } = testFields(body); if (!f.title) return err(400, 'Нужно название'); if (errors.length) return err(400, errors.join('; '));
      const x = Object.assign(f, { id: store.id(), authorId: user.id, createdAt: now() }); db.kbTests.push(x); save('create', 'kbTests', x.id); return ok(x);
    }
    const x = b && db.kbTests.find(z => z.id === b); if (!x) return err(404, 'Тест не найден');
    if (!c && method === 'GET') {
      if (ctx.qs.edit) { if (!K.canTeach(user)) return err(403, 'Нет прав на редактирование'); return ok(Object.assign({}, x, { text: K.testToText(x) })); }
      const n = myAttempts(x.id).length;
      return ok(Object.assign(K.publicTest(x), { attempts: n, left: leftOut(K.attemptsLeft(x, n)), article: x.articleId ? (db.kbArticles.find(z => z.id === x.articleId) || {}).title || '' : '' }));
    }
    if (c === 'attempt' && method === 'POST') {
      const n = myAttempts(x.id).length; if (K.attemptsLeft(x, n) <= 0) return err(403, 'Попытки закончились — обратитесь к руководителю');
      const answers = {}; const src = body.answers && typeof body.answers === 'object' ? body.answers : {};
      for (const q of x.questions || []) answers[q.id] = (Array.isArray(src[q.id]) ? src[q.id] : [src[q.id]]).map(Number).filter(v => Number.isInteger(v) && v >= 0 && v < q.options.length);
      const g = K.grade(x, answers);
      const at = { id: store.id(), userId: user.id, testId: x.id, answers, score: g.score, right: g.right, total: g.total, passed: g.passed, at: now(), no: n + 1 };
      db.kbAttempts.push(at); save('attempt', 'kbAttempts', at.id, { testId: x.id, score: g.score });
      if (g.passed) ctx.emit('kb.test.passed', { userId: user.id, testId: x.id, score: g.score });
      return ok(Object.assign({}, at, { detail: g.detail, questions: x.questions, left: leftOut(K.attemptsLeft(x, n + 1)) }));
    }
    if (!K.canTeach(user)) return err(403, 'Менять тесты могут руководители и руководители разделов');
    if (!c && method === 'PUT') {
      const { f, errors } = testFields(Object.assign({ text: K.testToText(x) }, x, body)); if (!f.title) return err(400, 'Нужно название'); if (errors.length) return err(400, errors.join('; '));
      Object.assign(x, f, { updatedAt: now(), updatedBy: user.id }); save('update', 'kbTests', x.id); return ok(x);
    }
    if (!c && method === 'DELETE') { db.kbTests = db.kbTests.filter(z => z.id !== x.id); save('delete', 'kbTests', x.id); return ok({ ok: true }); } // попытки остаются в истории
  }
  if (a === 'attempts' && method === 'GET') {
    const tname = id => (db.kbTests.find(z => z.id === id) || {}).title || '(тест удалён)';
    const secOf = uid => (db.users.find(u => u.id === uid) || {}).section;
    const visible = z => z.userId === user.id || K.isLeader(user) || (user.role === 'lead' && !!user.section && (secOf(z.userId) === user.section || db.kbEnroll.some(e => e.userId === z.userId && trainee(e).section === user.section)));
    if (!b) {
      let list = db.kbAttempts.filter(visible); if (ctx.qs.testId) list = list.filter(z => z.testId === ctx.qs.testId); if (ctx.qs.userId) list = list.filter(z => z.userId === ctx.qs.userId); if (ctx.qs.mine) list = list.filter(z => z.userId === user.id);
      return ok(list.slice().sort((p, r) => String(r.at).localeCompare(String(p.at))).slice(0, 500).map(z => ({ id: z.id, userId: z.userId, name: userName(z.userId), testId: z.testId, test: tname(z.testId), score: z.score, right: z.right, total: z.total, passed: z.passed, at: z.at, no: z.no })));
    }
    const z = db.kbAttempts.find(y => y.id === b); if (!z || !visible(z)) return err(404, 'Попытка не найдена');
    const x = db.kbTests.find(y => y.id === z.testId);
    return ok(Object.assign({}, z, { name: userName(z.userId), test: tname(z.testId), questions: x ? x.questions : [], detail: x ? K.grade(x, z.answers).detail : {} }));
  }

  // ---------- программы обучения ----------
  const courseFields = x => { const p = K.parseCourse(x.text); return { errors: p.errors, f: { title: str(x.title, 300).trim(), audience: str(x.audience, 300), description: str(x.description, 5000), weeks: p.weeks } }; };
  if (a === 'courses') {
    if (!b && method === 'GET') return ok(db.kbCourses.map(x => ({ id: x.id, title: x.title, audience: x.audience, description: x.description, weeks: (x.weeks || []).length, steps: (x.weeks || []).reduce((s, w) => s + w.steps.length, 0), enrolled: db.kbEnroll.filter(e => e.courseId === x.id).length })));
    if (!b && method === 'POST') {
      if (!K.canTeach(user)) return err(403, 'Программы составляют руководители и руководители разделов');
      const { f, errors } = courseFields(body); if (!f.title) return err(400, 'Нужно название'); if (errors.length) return err(400, errors.join('; '));
      const x = Object.assign(f, { id: store.id(), authorId: user.id, createdAt: now() }); db.kbCourses.push(x); save('create', 'kbCourses', x.id); return ok(x);
    }
    const x = b && db.kbCourses.find(z => z.id === b); if (!x) return err(404, 'Программа не найдена');
    if (!c && method === 'GET') return ok(Object.assign({}, x, { text: K.courseToText(x), missing: (x.weeks || []).flatMap(w => w.steps).filter(s => s.kind !== 'task' && !K.resolveRef(s.kind === 'test' ? db.kbTests : db.kbArticles, s.ref)).map(s => s.ref) }));
    if (!K.canTeach(user)) return err(403, 'Менять программы могут руководители и руководители разделов');
    if (!c && method === 'PUT') { const { f, errors } = courseFields(Object.assign({ text: K.courseToText(x) }, x, body)); if (!f.title) return err(400, 'Нужно название'); if (errors.length) return err(400, errors.join('; ')); Object.assign(x, f, { updatedAt: now(), updatedBy: user.id }); save('update', 'kbCourses', x.id); return ok(x); }
    if (!c && method === 'DELETE') { if (db.kbEnroll.some(e => e.courseId === x.id)) return err(400, 'По программе учатся — сначала удалите назначения'); db.kbCourses = db.kbCourses.filter(z => z.id !== x.id); save('delete', 'kbCourses', x.id); return ok({ ok: true }); }
  }
  // назначения: новичок ↔ программа ↔ наставник
  if (a === 'enrolls') {
    const out = e => { const co = db.kbCourses.find(z => z.id === e.courseId) || { weeks: [] }; const pr = K.progress(co, pctx(e));
      return Object.assign({}, e, { name: userName(e.userId), mentor: userName(e.mentorId), course: co.title || '(программа удалена)', section: trainee(e).section, pct: pr.pct, doneN: pr.done, total: pr.total, canManage: K.canManageEnroll(user, e, trainee(e)) }); };
    if (!b && method === 'GET') return ok(db.kbEnroll.filter(e => K.canSeeEnroll(user, e, trainee(e))).map(out).sort((p, r) => (p.status === 'done') - (r.status === 'done') || String(r.start).localeCompare(String(p.start))));
    if (!b && method === 'POST') {
      if (!K.canTeach(user)) return err(403, 'Назначают обучение руководители и руководители разделов');
      const co = db.kbCourses.find(z => z.id === body.courseId); const u = db.users.find(z => z.id === body.userId);
      if (!co || !u) return err(400, 'Выберите программу и сотрудника');
      const section = str(body.section || u.section || (user.role === 'lead' ? user.section : ''), 50); if (user.role === 'lead' && section !== user.section) return err(403, 'Руководитель раздела назначает обучение только в своём разделе');
      if (db.kbEnroll.some(e => e.courseId === co.id && e.userId === u.id && e.status !== 'done')) return err(400, 'Эта программа уже назначена сотруднику');
      const e = { id: store.id(), courseId: co.id, userId: u.id, mentorId: str(body.mentorId, 100) || user.id, section, start: body.start || t, status: 'active', done: {}, createdAt: now(), createdBy: user.id };
      db.kbEnroll.push(e); save('create', 'kbEnroll', e.id); return ok(out(e));
    }
    const e = b && db.kbEnroll.find(z => z.id === b); if (!e || !K.canSeeEnroll(user, e, trainee(e))) return err(404, 'Назначение не найдено');
    if (!c && method === 'GET') {
      const co = db.kbCourses.find(z => z.id === e.courseId) || { weeks: [] }; const pr = K.progress(co, pctx(e));
      const refTitle = s => { const r = K.resolveRef(s.kind === 'test' ? db.kbTests : db.kbArticles, s.ref); return r ? r.title : ''; };
      return ok(Object.assign(out(e), { weeks: (co.weeks || []).map((w, i) => ({ title: w.title, n: i + 1, steps: w.steps.map(s => Object.assign({}, s, pr.states[s.id], { refTitle: refTitle(s), byName: pr.states[s.id].by ? userName(pr.states[s.id].by) : '' })) })), mine: e.userId === user.id }));
    }
    if (c === 'steps' && d && method === 'PUT') {
      if (e.userId !== user.id && !K.canManageEnroll(user, e, trainee(e))) return err(403, 'Отмечать шаги могут новичок, наставник и руководители');
      const co = db.kbCourses.find(z => z.id === e.courseId); if (!co || !(co.weeks || []).some(w => w.steps.some(s => s.id === d))) return err(404, 'Шаг не найден');
      e.done = e.done || {};
      if (body.done) e.done[d] = { at: now(), by: user.id }; else delete e.done[d];
      const pr = K.progress(co, pctx(e)); if (pr.total && pr.done === pr.total && e.status !== 'done') { e.status = 'done'; e.finishedAt = t; } else if (pr.done < pr.total && e.status === 'done') { e.status = 'active'; e.finishedAt = ''; }
      save('step', 'kbEnroll', e.id, { step: d, done: !!body.done }); return ok(out(e));
    }
    if (!K.canManageEnroll(user, e, trainee(e))) return err(403, 'Менять назначение могут наставник и руководители');
    if (!c && method === 'PUT') { Object.assign(e, ctx.pick(body, ['mentorId', 'start', 'status', 'note'])); if ('section' in body && K.isLeader(user)) e.section = str(body.section, 50); save('update', 'kbEnroll', e.id); return ok(out(e)); }
    if (!c && method === 'DELETE') { db.kbEnroll = db.kbEnroll.filter(z => z.id !== e.id); save('delete', 'kbEnroll', e.id); return ok({ ok: true }); }
  }

  // ---------- стартовое наполнение (идемпотентно: существующее с тем же названием не трогает) ----------
  if (a === 'seed' && method === 'POST') {
    if (!K.isLeader(user)) return err(403, 'Стартовое наполнение загружает руководитель');
    const r = { articles: 0, tests: 0, courses: 0, news: 0 };
    for (const x of SEED.articles) if (!db.kbArticles.some(z => z.title === x.title)) { db.kbArticles.push(Object.assign(artFields(x), { id: store.id(), authorId: user.id, createdAt: now(), seed: true })); r.articles++; }
    for (const x of SEED.tests) if (!db.kbTests.some(z => z.title === x.title)) { const { f } = testFields(x); const art = K.resolveRef(db.kbArticles, x.article || ''); db.kbTests.push(Object.assign(f, { id: store.id(), articleId: art ? art.id : '', authorId: user.id, createdAt: now(), seed: true })); r.tests++; }
    for (const x of SEED.courses) if (!db.kbCourses.some(z => z.title === x.title)) { const { f } = courseFields(x); db.kbCourses.push(Object.assign(f, { id: store.id(), authorId: user.id, createdAt: now(), seed: true })); r.courses++; }
    for (const x of SEED.news) if (!db.kbNews.some(z => z.title === x.title)) { db.kbNews.push({ id: store.id(), title: x.title, text: x.text, pinned: !!x.pinned, date: t, authorId: user.id, createdAt: now() }); r.news++; }
    save('seed', 'kbArticles', '', r); return ok(r);
  }
  return err(404, 'Нет такого действия');
}

// для других модулей (hr, pm): ctx.modules.kb.progressOf(ctx, userId) → [{course, status, pct}]
function progressOf(ctx, userId) {
  const db = ctx.db;
  return db.kbEnroll.filter(e => e.userId === userId).map(e => { const co = db.kbCourses.find(z => z.id === e.courseId) || { weeks: [] }; return { enrollId: e.id, course: co.title, status: e.status, pct: K.progress(co, { enroll: e, reads: db.kbReads, attempts: db.kbAttempts, articles: db.kbArticles, tests: db.kbTests, userId }).pct }; });
}

module.exports = { id: 'kb', api: 'kb', collections: ['kbNews', 'kbArticles', 'kbCourses', 'kbTests', 'kbAttempts', 'kbReads', 'kbEnroll'], handle, progressOf, domain: K };
