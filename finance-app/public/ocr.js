/* Распознавание сканов счетов (OCR) в браузере: tesseract.js с jsdelivr, языки rus+eng — загружаются только когда нужны.
   PDF без текстового слоя: страницы рендерятся через pdf.js в canvas (~200 dpi) и распознаются по одной.
   window.MostOcr.pdf(pdfjs, bytes, { onProgress, timeoutMs }) → текст; window.MostOcr.image(file, opts) → текст.
   Ошибка / нет интернета / таймаут — исключение с понятным текстом; вызывающий код переходит к ручному вводу. */
(function () {
  'use strict';
  const VER = '5.1.1';
  const CDN = `https://cdn.jsdelivr.net/npm/tesseract.js@${VER}/dist/`;
  const CORE = `https://cdn.jsdelivr.net/npm/tesseract.js-core@${VER}`;
  const LANG = 'https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0'; // rus и eng в одном каталоге; кэшируется браузером (IndexedDB)
  const DPI = 200, MAX_PAGES = 5, PAGE_TIMEOUT = 120000, LOAD_TIMEOUT = 90000;

  const withTimeout = (p, ms, msg) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(msg)), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });
  let loading = null;
  function loadLib() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (loading) return loading;
    loading = withTimeout(new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = CDN + 'tesseract.min.js'; s.async = true;
      s.onload = () => window.Tesseract ? res(window.Tesseract) : rej(new Error('модуль распознавания не загрузился'));
      s.onerror = () => rej(new Error('нет доступа к модулю распознавания (нужен интернет)'));
      document.head.appendChild(s);
    }), LOAD_TIMEOUT, 'модуль распознавания не загрузился вовремя').catch(e => { loading = null; throw e; });
    return loading;
  }
  // один воркер на пачку файлов; языковые данные — при первом создании (дальше из кэша)
  async function makeWorker(onProgress) {
    const T = await loadLib();
    onProgress && onProgress({ stage: 'lang', text: 'Загружаю словари распознавания (rus+eng, один раз)…' });
    return withTimeout(T.createWorker('rus+eng', 1, { workerPath: CDN + 'worker.min.js', corePath: CORE, langPath: LANG, logger: () => {} }), LOAD_TIMEOUT, 'словари распознавания не загрузились вовремя');
  }
  const clean = t => String(t || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  async function recognize(worker, source, page, pages, onProgress) {
    onProgress && onProgress({ stage: 'page', page, pages, text: pages > 1 ? `Распознаю страницу ${page} из ${pages}…` : 'Распознаю скан…' });
    const r = await withTimeout(worker.recognize(source), PAGE_TIMEOUT, `страница ${page} распознаётся слишком долго`);
    return clean(r && r.data && r.data.text);
  }
  // PDF-картинка: рендер страниц ~200 dpi
  async function pdf(pdfjs, bytes, opts) {
    opts = opts || {}; const doc = await pdfjs.getDocument({ data: bytes }).promise; const pages = Math.min(doc.numPages, MAX_PAGES);
    const worker = await makeWorker(opts.onProgress); const out = [];
    try {
      for (let i = 1; i <= pages; i++) {
        const pg = await doc.getPage(i); const vp = pg.getViewport({ scale: DPI / 72 });
        const canvas = document.createElement('canvas'); canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
        const cx = canvas.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, canvas.width, canvas.height);
        // intent 'print': без requestAnimationFrame — иначе в фоновой вкладке отрисовка не заканчивается
        await withTimeout(pg.render({ canvasContext: cx, viewport: vp, intent: 'print' }).promise, 60000, `страница ${i} не отрисовалась`);
        out.push(await recognize(worker, canvas, i, pages, opts.onProgress));
        canvas.width = canvas.height = 0; // освободить память
      }
    } finally { try { await worker.terminate(); } catch (e) { /* уже */ } }
    return out.join('\n');
  }
  // фото / картинка: слишком большие уменьшаем до ~3000 px по длинной стороне
  async function image(file, opts) {
    opts = opts || {}; const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('не удалось открыть изображение')); i.src = url; });
      const k = Math.min(1, 3000 / Math.max(img.naturalWidth, img.naturalHeight)); const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * k); canvas.height = Math.round(img.naturalHeight * k); const cx = canvas.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, canvas.width, canvas.height); cx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const worker = await makeWorker(opts.onProgress);
      try { return await recognize(worker, canvas, 1, 1, opts.onProgress); } finally { try { await worker.terminate(); } catch (e) { /* уже */ } }
    } finally { URL.revokeObjectURL(url); }
  }
  window.MostOcr = { pdf, image, loadLib, DPI, MAX_PAGES };
})();
