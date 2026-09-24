/* Модуль «Знания» — чистая логика (Node: require, браузер: window.MostKb). Права, разбор тестов и программ, оценка, прогресс. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.MostKb = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SECTIONS = ['Регламенты', 'Гайды', 'Стандарты Revit ADSK', 'Нормы', 'Документы для подписи'];
  const LEADERS = ['owner', 'partner'];
  const canOpen = u => !!u;
  const canPublish = u => !!u && ['owner', 'partner', 'secretary'].includes(u.role); // новости, статьи, документы
  const canTeach = u => !!u && ['owner', 'partner', 'lead'].includes(u.role);        // тесты и программы
  const isLeader = u => !!u && LEADERS.includes(u.role);
  // кто видит/ведёт обучение новичка: сам новичок, наставник, руководители, руководитель раздела новичка
  const canSeeEnroll = (u, e, trainee) => !!u && (e.userId === u.id || e.mentorId === u.id || isLeader(u) || (u.role === 'lead' && !!u.section && !!trainee && trainee.section === u.section));
  const canManageEnroll = (u, e, trainee) => !!u && (e.mentorId === u.id || isLeader(u) || (u.role === 'lead' && !!u.section && !!trainee && trainee.section === u.section));

  // FNV-1a — стабильные id шагов программы (не зависят от порядка строк)
  function hash(s) { let h = 0x811c9dc5; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }

  // ---- тест: текстовый формат редактора ----
  // ? Вопрос            (строки после «?» без +/- продолжают текст вопроса)
  // + правильный ответ  (несколько «+» → вопрос с несколькими ответами)
  // - неправильный ответ
  function parseTest(src) {
    const qs = []; let q = null; const errors = [];
    String(src || '').split(/\r?\n/).forEach((raw, i) => {
      const line = raw.trim(); if (!line) return;
      const m = line.match(/^([?+\-*])\s*(.*)$/);
      if (m && m[1] === '?') { q = { id: '', text: m[2], options: [], correct: [] }; qs.push(q); return; }
      if (m && q && m[2]) { if (m[1] === '+' || m[1] === '*') q.correct.push(q.options.length); q.options.push(m[2]); return; }
      if (q && !q.options.length) { q.text += '\n' + line; return; }
      errors.push(`Строка ${i + 1}: начните с «?» (вопрос), «+» (верный) или «-» (неверный)`);
    });
    qs.forEach((x, i) => {
      x.id = 'q' + hash(x.text); x.multi = x.correct.length > 1;
      if (x.options.length < 2) errors.push(`Вопрос ${i + 1}: нужно минимум 2 варианта`);
      if (!x.correct.length) errors.push(`Вопрос ${i + 1}: отметьте верный вариант «+»`);
    });
    const seen = new Set(); qs.forEach(x => { while (seen.has(x.id)) x.id += 'x'; seen.add(x.id); });
    if (!qs.length) errors.push('Нет ни одного вопроса');
    return { questions: qs, errors };
  }
  const testToText = t => (t.questions || []).map(q => ['? ' + q.text, ...q.options.map((o, i) => (q.correct.includes(i) ? '+ ' : '- ') + o)].join('\n')).join('\n\n');
  // что уходит в браузер до завершения попытки: без правильных ответов
  const publicTest = t => Object.assign({}, t, { questions: (t.questions || []).map(q => ({ id: q.id, text: q.text, options: q.options, multi: q.multi })) });
  // answers: { [qid]: [индексы] } → балл в % (вопрос засчитывается при точном совпадении набора)
  function grade(test, answers) {
    const qs = test.questions || []; const detail = {};
    let right = 0;
    for (const q of qs) {
      const a = [...new Set((answers && answers[q.id]) || [])].map(Number).filter(n => Number.isInteger(n)).sort();
      const c = [...q.correct].sort(); const ok = a.length === c.length && a.every((v, i) => v === c[i]);
      if (ok) right++; detail[q.id] = { ok, chosen: a, correct: c };
    }
    const score = qs.length ? Math.round(right / qs.length * 100) : 0;
    return { score, right, total: qs.length, passed: score >= (Number(test.passScore) || 0), detail };
  }
  const attemptsLeft = (test, n) => Number(test.maxAttempts) > 0 ? Math.max(0, Number(test.maxAttempts) - n) : Infinity;

  // ---- программа обучения: текстовый формат ----
  // # Неделя 1. Знакомство
  // - Прочитать регламент РП | статья: Регламент проектирования
  // - Сдать тест по РП | тест: Регламент РП
  // - Подписать NDA | подпись: Соглашение о неразглашении
  // - Задание наставника: разобрать проект
  const REF_KIND = { 'статья': 'article', 'article': 'article', 'тест': 'test', 'test': 'test', 'подпись': 'sign', 'sign': 'sign' };
  function parseCourse(src) {
    const weeks = []; let w = null; const errors = [];
    String(src || '').split(/\r?\n/).forEach((raw, i) => {
      const line = raw.trim(); if (!line) return;
      if (line.startsWith('#')) { w = { title: line.replace(/^#+\s*/, ''), steps: [] }; weeks.push(w); return; }
      const m = line.match(/^[-*•]\s*(.+)$/); if (!m) return errors.push(`Строка ${i + 1}: шаг начинается с «-», неделя — с «#»`);
      if (!w) { w = { title: 'Неделя 1', steps: [] }; weeks.push(w); }
      const [title, ref] = m[1].split('|').map(s => s.trim());
      const st = { id: '', title, kind: 'task', ref: '' };
      if (ref) { const r = ref.match(/^([^:]+):\s*(.+)$/); const k = r && REF_KIND[r[1].trim().toLowerCase()]; if (k) { st.kind = k; st.ref = r[2].trim(); } else errors.push(`Строка ${i + 1}: после «|» ожидается «статья: …», «тест: …» или «подпись: …»`); }
      w.steps.push(st);
    });
    const seen = new Set(); weeks.forEach((wk, wi) => wk.steps.forEach(s => { s.id = 's' + hash(s.title + '|' + s.kind + '|' + s.ref); while (seen.has(s.id)) s.id += 'x'; seen.add(s.id); }));
    if (!weeks.some(x => x.steps.length)) errors.push('Нет ни одного шага');
    return { weeks, errors };
  }
  const RU_KIND = { article: 'статья', test: 'тест', sign: 'подпись' };
  const courseToText = c => (c.weeks || []).map(w => ['# ' + w.title, ...w.steps.map(s => '- ' + s.title + (s.kind !== 'task' ? ` | ${RU_KIND[s.kind]}: ${s.ref}` : ''))].join('\n')).join('\n\n');
  // ссылку шага (название или id) → объект; сравнение без регистра, по началу названия
  function resolveRef(list, ref) {
    const r = String(ref || '').trim().toLowerCase(); if (!r) return null;
    return list.find(x => x.id === ref) || list.find(x => String(x.title || '').toLowerCase() === r) || list.find(x => String(x.title || '').toLowerCase().startsWith(r)) || null;
  }
  // статус шага для новичка: отмечен вручную, прочитана статья, сдан тест, подписан документ
  function stepState(step, ctx) {
    const { enroll, reads, attempts, articles, tests, userId } = ctx;
    const manual = enroll.done && enroll.done[step.id];
    if (manual) return { done: true, at: manual.at, by: manual.by, how: 'отмечено' };
    if (step.kind === 'article' || step.kind === 'sign') {
      const a = resolveRef(articles, step.ref); if (!a) return { done: false, missing: true };
      const kind = step.kind === 'sign' ? 'sign' : null;
      const r = reads.find(x => x.userId === userId && x.refId === a.id && (kind ? x.kind === 'sign' : ['article', 'sign'].includes(x.kind)));
      return r ? { done: true, at: r.at, how: kind ? 'ознакомлен' : 'прочитано', refId: a.id } : { done: false, refId: a.id };
    }
    if (step.kind === 'test') {
      const t = resolveRef(tests, step.ref); if (!t) return { done: false, missing: true };
      const best = attempts.filter(x => x.userId === userId && x.testId === t.id).sort((a, b) => b.score - a.score)[0];
      return best && best.passed ? { done: true, at: best.at, how: `тест ${best.score}%`, refId: t.id } : { done: false, refId: t.id, score: best ? best.score : null };
    }
    return { done: false };
  }
  function progress(course, ctx) {
    const steps = (course.weeks || []).flatMap(w => w.steps); if (!steps.length) return { pct: 0, done: 0, total: 0, states: {} };
    const states = {}; let done = 0;
    for (const s of steps) { states[s.id] = stepState(s, ctx); if (states[s.id].done) done++; }
    return { pct: Math.round(done / steps.length * 100), done, total: steps.length, states };
  }

  // ---- поиск по статьям ----
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
  function search(articles, q) {
    const words = norm(q).split(/\s+/).filter(Boolean); if (!words.length) return articles.map(a => ({ a, rank: 0 }));
    return articles.map(a => {
      const t = norm(a.title), tags = norm((a.tags || []).join(' ')), body = norm(a.text);
      let rank = 0; for (const w of words) { if (t.includes(w)) rank += 10; else if (tags.includes(w)) rank += 5; else if (body.includes(w)) rank += 1; else return null; }
      return { a, rank };
    }).filter(Boolean).sort((x, y) => y.rank - x.rank);
  }
  function snippet(text, q, n = 160) {
    const s = String(text || '').replace(/\s+/g, ' '); const w = norm(q).split(/\s+/).filter(Boolean)[0];
    const i = w ? norm(s).indexOf(w) : -1; const from = Math.max(0, i - 50);
    return (from ? '…' : '') + s.slice(from, from + n) + (s.length > from + n ? '…' : '');
  }

  return { SECTIONS, canOpen, canPublish, canTeach, isLeader, canSeeEnroll, canManageEnroll, hash, parseTest, testToText, publicTest, grade, attemptsLeft, parseCourse, courseToText, resolveRef, stepState, progress, search, snippet };
});
