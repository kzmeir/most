/* Модуль «Маркетинг» — чистая логика (Node: require, браузер: window.MostMKT). Без доступа к базе.
   Посты и статусы, права, правило согласий заказчиков, проверка текста по голосу бренда, итоги месяца. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.MostMKT = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const num = v => { const n = Number(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
  const almaty = iso => { if (!iso) return ''; if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Almaty' }); }; // метка времени → дата по Алматы
  const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); return isNaN(t) ? '' : new Date(t.getTime() + n * 864e5).toISOString().slice(0, 10); };
  const days = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
  const weekStart = d => { const t = new Date(d + 'T00:00:00Z'); if (isNaN(t)) return ''; return addDays(d, -((t.getUTCDay() + 6) % 7)); }; // понедельник
  const fdate = d => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : ''; };

  // ---- справочники ----
  const CHANNELS = { instagram: 'Instagram (каз/рус)', instagram_en: 'Instagram EN', threads: 'Threads', telegram: 'Telegram', linkedin: 'LinkedIn' };
  // языки текста по каналам: казахстанские каналы — казахский и русский (закон о рекламе), зарубежные — английский
  const LANG_NEED = { instagram: ['kz', 'ru'], threads: ['kz', 'ru'], telegram: ['kz', 'ru'], instagram_en: ['en'], linkedin: ['en'] };
  const LANG_NAME = { kz: 'казахском', ru: 'русском', en: 'английском' };
  const textIn = (p, l) => String((l === 'kz' ? p.textKz : l === 'en' ? p.textEn : p.text) || '').trim();
  const RUBRICS = ['The Lab', 'Архитектура как улика', 'Most in detail', 'Backstage', 'Diaries', 'Culture', 'Другое'];
  const RUBRIC_HINT = { // из статьи «Голос бренда и правила постов» (kb)
    'The Lab': 'Архив идей: нереализованная концепция как «архивное дело» — задача, идея, почему не построили. 1 пост в неделю.',
    'Архитектура как улика': '«Почему форма такая»: одна деталь проекта и её причина, карусель со схемами. 1 пост в неделю.',
    'Most in detail': 'Детали, фактуры, свет на стройке и в построенном. 1 Reels в неделю.',
    'Backstage': 'Процесс, встречи, материалы, команда. 2–3 сторис в неделю.',
    'Diaries': 'Архитекторы о своих решениях.',
    'Culture': 'Культура бюро.',
    'Другое': '',
  };
  const RULES = ['Первая строка — факт или вопрос, не лозунг', 'Одна идея на пост', 'В посте о проекте — цифра или чертёж', 'Отметить заказчика', 'Подпись говорит, что решено', 'Без клише и самохвальства; ставки не называем'];
  const STATUSES = { draft: 'Черновик', review: 'На утверждении', approved: 'Утверждён', published: 'Опубликован', rework: 'На правке', rejected: 'Отклонён' };
  const EDITABLE = ['draft', 'rework', 'review'];
  const CONSENT = { yes: 'Можно публиковать', no: 'Нельзя (NDA)', unknown: 'Не спрашивали' };
  const CONSENT_WHAT = { renders: 'Рендеры', drawings: 'Чертежи', photos: 'Фото стройки' };
  const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
  const MAX_IMAGE = 10 * 1024 * 1024, MAX_IMAGES = 20; // Instagram — до 20 слайдов в карусели
  const KEY_RE = /^[a-z0-9]+-[a-z0-9]+\.(png|jpg|webp|gif)$/;

  // ---- права ----
  const isLeader = u => !!u && ['owner', 'partner'].includes(u.role);
  const canOpen = u => !!u && (isLeader(u) || u.role === 'secretary'); // помощнику по маркетингу — роль «секретарь»
  const canEdit = canOpen;
  const canApprove = isLeader;
  const canImport = isLeader;
  const canConsents = canOpen;

  // ---- поля поста ----
  function cleanPost(f) {
    const o = {};
    if ('date' in f) o.date = /^\d{4}-\d{2}-\d{2}$/.test(String(f.date || '')) ? String(f.date) : '';
    if ('channels' in f) { const a = Array.isArray(f.channels) ? f.channels : String(f.channels || '').split(/[,\s]+/); o.channels = [...new Set(a.map(x => String(x).trim().toLowerCase()).filter(x => CHANNELS[x]))]; }
    if ('rubric' in f) o.rubric = RUBRICS.includes(f.rubric) ? f.rubric : 'Другое';
    if ('title' in f) o.title = String(f.title || '').trim().slice(0, 200);
    for (const k of ['text', 'textKz', 'textEn']) if (k in f) o[k] = String(f[k] || '').replace(/\r\n/g, '\n').slice(0, 5000);
    if ('pmProjectId' in f) o.pmProjectId = String(f.pmProjectId || '').trim();
    return o;
  }
  // согласие по проекту: запись или «не спрашивали»
  const consentOf = (pmProjectId, consents) => (consents || []).find(c => c.pmProjectId === pmProjectId) || { pmProjectId, status: 'unknown', what: [] };
  // можно ли утверждать / публиковать пост; '' — можно, иначе текст причины
  function blockReason(post, consents, projects) {
    if (!post.pmProjectId) return ''; // о команде, процессе — без проекта
    const c = consentOf(post.pmProjectId, consents); if (c.status === 'yes') return '';
    const p = (projects || []).find(x => x.id === post.pmProjectId); const name = p ? `«${p.name}»` : 'поста';
    if (c.status === 'no') return `Проект ${name} под NDA — публиковать нельзя`;
    return `Нет согласия заказчика проекта ${name}: отметьте «можно публиковать» в разделе «Согласия заказчиков»`;
  }
  // все ли нужные языки заполнены для выбранных каналов; '' — да, иначе причина
  function langReason(post) {
    const need = [...new Set((post.channels || []).flatMap(c => LANG_NEED[c] || []))]; const miss = need.filter(l => !textIn(post, l)); if (!miss.length) return '';
    const kzru = miss.filter(l => l !== 'en'); const parts = [];
    if (kzru.length) parts.push(`нет текста на ${kzru.map(l => LANG_NAME[l]).join(' и ')} — по закону о рекламе посты в казахстанских каналах публикуются на казахском и русском`);
    if (miss.includes('en')) parts.push('нет текста на английском для Instagram EN / LinkedIn');
    return 'Не готов к публикации: ' + parts.join('; ');
  }
  const readyReason = (post, consents, projects) => blockReason(post, consents, projects) || langReason(post);
  // переходы статусов: действие → { из каких статусов, в какой, кто }
  const ACTIONS = {
    submit: { from: ['draft', 'rework'], to: 'review', who: 'edit', label: 'на утверждение' },
    approve: { from: ['review'], to: 'approved', who: 'approve', label: 'утверждён', consent: true },
    rework: { from: ['review', 'approved'], to: 'rework', who: 'approve', label: 'на правку', comment: true },
    reject: { from: ['review'], to: 'rejected', who: 'approve', label: 'отклонён' },
    publish: { from: ['approved'], to: 'published', who: 'edit', label: 'опубликован', consent: true },
    reopen: { from: ['rejected'], to: 'draft', who: 'edit', label: 'в черновик' },
  };
  // проверка действия: '' — можно, иначе [код, сообщение]
  function checkAction(u, post, action, body, consents, projects) {
    const A = Object.hasOwn(ACTIONS, action) && ACTIONS[action]; if (!A) return [404, 'Нет такого действия'];
    if (A.who === 'approve' ? !canApprove(u) : !canEdit(u)) return [403, A.who === 'approve' ? 'Утверждают только владелец и партнёр' : 'Нет прав'];
    if (!A.from.includes(post.status)) return [409, `Пост «${STATUSES[post.status] || post.status}» — действие недоступно`];
    if (A.comment && !String((body && body.comment) || '').trim()) return [400, 'Напишите, что поправить'];
    if (A.consent) { const r = readyReason(post, consents, projects); if (r) return [409, r]; }
    if (action === 'submit' && !['ru', 'kz', 'en'].some(l => textIn(post, l)) && !(post.images || []).length) return [400, 'Пустой пост: добавьте текст или картинки'];
    return '';
  }
  // подсказки по голосу бренда (не запрет); \w и \b с кириллицей не работают — только [а-яё]
  function lint(text) {
    const s = String(text || ''); const out = [];
    const bad = s.match(/уникальн[а-яё]*|инновацион[а-яё]*|(?<![а-яё])лучш(?:ий|ая|ее|ие|их|ую|его|ей)(?![а-яё])/gi); if (bad) out.push('Клише: ' + [...new Set(bad.map(x => x.toLowerCase()))].join(', '));
    if (/!!|[А-ЯЁ]{6,}/.test(s)) out.push('Капслок или «!!»');
    if (/₸\s*\/\s*м|тенге за м|ставк[аиу] проектир|гонорар/i.test(s)) out.push('Ставки и гонорары не называем');
    if (/не\s+[^.,!?\n]{1,40},\s+а\s+/i.test(s)) out.push('Шаблон «не X, а Y» — пишите прямо');
    return out;
  }
  // ---- итоги месяца ----
  const monthOf = d => String(d || '').slice(0, 7);
  function publishedByRubric(posts, month) {
    const by = {}; let total = 0;
    for (const p of posts || []) if (p.status === 'published' && monthOf(p.publishedAt || p.date) === month) { by[p.rubric || 'Другое'] = (by[p.rubric || 'Другое'] || 0) + 1; total++; }
    return { total, byRubric: RUBRICS.filter(r => by[r]).map(r => ({ rubric: r, n: by[r] })) };
  }
  function leadsBySource(leads, month) {
    const by = {}; let total = 0;
    for (const l of leads || []) if (monthOf(almaty(l.createdAt)) === month) { const s = String(l.source || '').trim() || 'Не указан'; by[s] = (by[s] || 0) + 1; total++; }
    return { total, bySource: Object.entries(by).sort((a, b) => b[1] - a[1]).map(([source, n]) => ({ source, n })) };
  }
  function cleanMetrics(f) {
    const o = { channels: {} };
    for (const k of Object.keys(CHANNELS)) { const c = (f.channels || {})[k] || {}; o.channels[k] = { followers: Math.max(0, Math.round(num(c.followers))), reach: Math.max(0, Math.round(num(c.reach))) }; }
    o.vacancyResponses = Math.max(0, Math.round(num(f.vacancyResponses))); o.note = String(f.note || '').slice(0, 2000);
    return o;
  }
  // пауза в публикациях: дней с последней публикации
  const lastPublished = posts => (posts || []).filter(p => p.status === 'published').map(p => p.publishedAt || p.date).filter(Boolean).sort().pop() || '';

  return { num, almaty, addDays, days, weekStart, fdate, CHANNELS, RUBRICS, RUBRIC_HINT, RULES, STATUSES, EDITABLE, CONSENT, CONSENT_WHAT, IMAGE_TYPES, MAX_IMAGE, MAX_IMAGES, KEY_RE,
    isLeader, canOpen, canEdit, canApprove, canImport, canConsents, cleanPost, consentOf, blockReason, langReason, readyReason, LANG_NEED, textIn, ACTIONS, checkAction, lint, monthOf, publishedByRubric, leadsBySource, cleanMetrics, lastPublished };
});
