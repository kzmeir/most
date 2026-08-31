const pptxgen = require("pptxgenjs");
const path = require("path");
const fs = require("fs");

const A = (f) => path.join(__dirname, "assets", f);

// размеры JPEG/PNG прямо из заголовка файла
function imgSize(file) {
  const b = fs.readFileSync(file);
  if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i += 1; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
      return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error("не читается размер изображения: " + file);
}

// вписать картинку в рамку по центру, сохранив соотношение сторон
function fitImage(slide, img, bx, by, bw, bh) {
  const { w: iw, h: ih } = imgSize(img);
  const k = Math.min(bw / iw, bh / ih);
  const w = iw * k, h = ih * k;
  const x = bx + (bw - w) / 2, y = by + (bh - h) / 2;
  slide.addImage({ path: img, x, y, w, h });
  return { x, y, w, h };   // фактическая рамка — чтобы подпись села вплотную
}

/* ================= фирменный стиль MOST ================= */
const ORANGE = "FF4D23";
const INK = "111111";
const TXT = "333333";
const GREY = "8A8A8A";
const RULE = "DCDCDC";
const SOFT = "E8E8E4";
const WHITE = "FFFFFF";
const F = "Arial";

const W = 13.333, H = 7.5;
const EDGE = 0.24;
const CX = 0.55, CW = 4.15;
const IX = 5.15, IW = 7.6;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "MOST Architects";
pres.company = "MOST Architects";
pres.title = "Гостиничный комплекс — г. Алматы, ул. Бухтарминская";

let page = 1;

/* ---------------- элементы ---------------- */
function logo(slide) {
  slide.addImage({ path: A("logo_most.png"), x: 12.42, y: 6.48, w: 0.69, h: 0.77 });
}

function labels(slide, o) {
  const c = o.color || INK;
  if (o.left) slide.addText(o.left.toUpperCase(), {
    x: EDGE, y: 0.18, w: 7, h: 0.24, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 9.5, bold: true, color: c, charSpacing: 0.6, valign: "middle",
  });
  if (o.sub) slide.addText(o.sub, {
    x: EDGE, y: 0.41, w: 7, h: 0.22, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 9, color: c, valign: "middle",
  });
  if (o.right) slide.addText(o.right.toUpperCase(), {
    x: W - EDGE - 7, y: 0.18, w: 7, h: 0.24, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 9.5, color: o.rightColor || ORANGE, charSpacing: 0.6,
    align: "right", valign: "middle",
  });
}

function pageNo(slide, color) {
  page += 1;
  slide.addText(String(page).padStart(2, "0"), {
    x: EDGE, y: 7.06, w: 1, h: 0.22, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 8, color: color || GREY, valign: "middle",
  });
}

function blockTitle(slide, x, y, w, text, size) {
  slide.addText(text.toUpperCase(), {
    x, y, w, h: 0.28, isTextBox: true, margin: 0,
    fontFace: F, fontSize: size || 13, bold: true, color: ORANGE, charSpacing: 0.3, valign: "middle",
  });
}

function subTitle(slide, x, y, w, text, color) {
  slide.addText(text.toUpperCase(), {
    x, y, w, h: 0.22, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 8.5, color: color || ORANGE, charSpacing: 0.3, valign: "middle",
  });
}

function dashes(slide, x, y, w, h, items, opts) {
  const o = opts || {};
  const runs = [];
  items.forEach((tx, i) => {
    runs.push({ text: "– ", options: { fontFace: F, fontSize: o.size || 11, color: ORANGE } });
    runs.push({ text: tx, options: {
      fontFace: F, fontSize: o.size || 11, color: o.color || TXT, breakLine: i < items.length - 1 } });
  });
  slide.addText(runs, {
    x, y, w, h, isTextBox: true, margin: 0, valign: "top",
    lineSpacing: o.lead || 16, paraSpaceAfter: o.gap === undefined ? 10 : o.gap,
  });
}

function body(slide, x, y, w, h, text, opts) {
  const o = opts || {};
  slide.addText(text, {
    x, y, w, h, isTextBox: true, margin: 0,
    fontFace: F, fontSize: o.size || 11.5, color: o.color || TXT,
    lineSpacing: o.lead || 16, valign: "top",
  });
}

function figure(slide, x, y, w, value, unit, label, opts) {
  const o = opts || {};
  slide.addText([
    { text: value, options: { fontFace: F, fontSize: o.size || 26, bold: true, color: o.color || INK } },
    { text: unit ? " " + unit : "", options: { fontFace: F, fontSize: 11, bold: true, color: ORANGE } },
  ], { x, y, w, h: 0.44, isTextBox: true, margin: 0, valign: "middle" });
  slide.addText(label.toUpperCase(), {
    x, y: y + 0.46, w, h: o.lh || 0.42, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 8, color: o.lc || GREY, charSpacing: 0.3, lineSpacing: 11, valign: "top",
  });
}

function rule(slide, x, y, w, color) {
  slide.addShape(pres.ShapeType.rect, {
    x, y, w, h: 0.008, fill: { color: color || RULE }, line: { color: color || RULE, width: 0 },
  });
}

function pill(slide, x, y, w, text, active) {
  slide.addShape(pres.ShapeType.roundRect, {
    x, y, w, h: 0.34, rectRadius: 0.06,
    fill: { color: WHITE }, line: { color: active ? ORANGE : "444444", width: 0.75 },
  });
  slide.addText(text, {
    x, y, w, h: 0.34, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 9.5, color: active ? ORANGE : INK, align: "center", valign: "middle",
  });
}

// полноэкранный кадр: заполняем лист, сохраняя пропорции.
// sizing:"cover" в pptxgenjs выдаёт пустой srcRect и растягивает картинку,
// поэтому масштабируем сами и выпускаем лишнее за край — оно обрезается листом.
function plate(slide, img) {
  const { w: iw, h: ih } = imgSize(img);
  const k = Math.max(W / iw, H / ih);
  const w = iw * k, h = ih * k;
  slide.addImage({ path: img, x: (W - w) / 2, y: (H - h) / 2, w, h });
}

// маркер-кружок с номером
function marker(slide, x, y, n) {
  slide.addShape(pres.ShapeType.ellipse, {
    x: x - 0.16, y: y - 0.16, w: 0.32, h: 0.32,
    fill: { color: ORANGE }, line: { color: WHITE, width: 1.5 },
  });
  slide.addText(String(n), {
    x: x - 0.16, y: y - 0.16, w: 0.32, h: 0.32, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 10, bold: true, color: WHITE, align: "center", valign: "middle",
  });
}

function caption(slide, x, y, w, text) {
  slide.addText(text, {
    x, y, w, h: 0.24, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 8, color: GREY, valign: "middle",
  });
}


/* один кадр на слайд */
const plates = (list) => list.forEach(([img, lab, lc, rc, pc, note]) => {
  const s = pres.addSlide();
  plate(s, A(img));
  labels(s, { left: lab, right: "Визуализация", color: lc, rightColor: rc });
  logo(s);
  pageNo(s, pc);
  s.addNotes(note || lab + ". Один кадр — одна мысль, комментировать коротко.");
});
/* =========================================================
   01 · ТИТУЛ
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };

  pill(s, 1.07, 0.72, 1.68, "architectural bureau", false);
  s.addImage({ path: A("logo_most.png"), x: 6.31, y: 3.35, w: 0.71, h: 0.79 });

  s.addText("most\narchitects\nkazakhstan/almaty", {
    x: 1.07, y: 3.85, w: 3, h: 0.6, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 8.5, color: INK, lineSpacing: 11, valign: "top",
  });
  s.addText("гостиничный комплекс с бизнес-центром\nг. алматы, ул. бухтарминская\nавгуст 2026", {
    x: W - 1.07 - 4, y: 3.85, w: 4, h: 0.75, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 8.5, color: INK, lineSpacing: 11, align: "right", valign: "top",
  });

  const stages = [["concept", true], ["masterplan", false], ["project", false], ["detail plan", false]];
  const pw = 1.32, pg = 0.26;
  const totalW = stages.length * pw + (stages.length - 1) * pg;
  let px = (W - totalW) / 2;
  stages.forEach(([t, act]) => { pill(s, px, 6.42, pw, t, act); px += pw + pg; });

  s.addNotes(
    "Титул. Стадия — concept. Объект: гостиничный комплекс с бизнес-центром, ул. Бухтарминская, участок 1,4 га.\n" +
    "Адресат на титуле не указан — дека универсальна.\n" +
    "Логика показа: два листа контекста — где участок и как село, — затем образ и весь визуальный ряд, " +
    "и только после него схемы, материалы и цифры."
  );
}

/* =========================================================
   02 · МЕСТО
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Место", sub: "Участок и окружение", right: "Ситуационная схема" });

  const ctx = fitImage(s, A("context.jpg"), 0.55, 1.02, 7.4, 5.6);
  caption(s, ctx.x, ctx.y + ctx.h + 0.14, ctx.w, "Оранжевым — проектируемый участок в структуре городской застройки.");

  const tx = 8.35, tw = W - 8.35 - 0.62;
  body(s, tx, 1.08, tw, 1.3,
    "Свободный участок 1,4 га на ул. Бухтарминской. Деловое и производственное окружение, жилая застройка не примыкает.",
    { size: 13, lead: 19 });

  rule(s, tx, 2.6, tw);
  dashes(s, tx, 2.82, tw, 2.3, [
    "Снос и расселение не требуются.",
    "Участок обслуживается существующими проездами по всему периметру.",
    "К северу — действующая АЗС, зона 50 м на генплане.",
  ], { size: 11 });

  rule(s, tx, 5.15, tw);
  figure(s, tx, 5.35, tw, "1,4", "га", "Свободная территория в структуре города");

  logo(s);
  pageNo(s);
  s.addNotes(
    "Второй лист: коротко отвечаем «где», чтобы дальше этот вопрос не всплывал посреди визуального ряда.\n" +
    "Главная мысль: город ничего не теряет. Территория пустая, никого не сносим и не расселяем.\n" +
    "По снимку видно окружение: промышленный пояс и железнодорожная магистраль с северо-востока, " +
    "зелёные склоны и частный сектор с запада. Жилая застройка к участку не примыкает.\n" +
    "Если спросят про шум от железной дороги — расчёт шума вынесен в приложение как задача стадии ЭП, " +
    "самому эту тему не поднимать.\n" +
    "АЗС: подтвердить тип станции и установленный размер СЗЗ до градсовета."
  );
}

/* =========================================================
   03 · ГЕНПЛАН · ПОСАДКА
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Генеральный план", sub: "Посадка на участок", right: "Генплан" });

  fitImage(s, A("genplan.jpg"), 0.55, 1.02, 6.95, 5.95);

  const tx = 7.85, tw = W - 7.85 - 0.62;
  dashes(s, tx, 1.12, tw, 4.6, [
    "Гостиничный корпус вытянут вдоль участка и раскрыт во внутренний двор; бизнес-центр замыкает композицию с юго-востока.",
    "Кольцевой проезд замкнут вокруг застройки: подъезд ко всем входам и разворот пожарной техники.",
    "Наземные стоянки вынесены на периметр и во внутренний двор, вне пятна застройки.",
    "Рядовая посадка деревьев по всему периметру формирует буфер между застройкой и границами.",
  ], { size: 11 });

  logo(s);
  pageNo(s);
  s.addNotes(
    "Чертёж генплана: два корпуса, кольцевой проезд, стоянки по периметру, рядовая посадка деревьев.\n" +
    "Выносные размеры на чертеже словами не подтверждать — если спросят конкретные отступы, " +
    "сказать, что уточняются, и не называть цифру.\n" +
    "Отступы от границ на слайд намеренно не вынесены — цифры на чертеже уточняются. " +
    "Если спросят конкретные значения, ссылаться на чертёж генплана, своих цифр не называть."
  );
}

/* =========================================================
   04 · ИДЕЯ: АЛАТАУ
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Идея", sub: "Форма выведена из силуэта Заилийского Алатау", right: "Концепция" });

  fitImage(s, A("genesis.jpg"), 0.55, 0.92, 12.23, 6.05);

  logo(s);
  pageNo(s);
  s.addNotes(
    "Переход от контекста к образу: дальше идут только кадры. Задаёт тон всему визуальному ряду.\n" +
    "Слайд намеренно без текста — картинка говорит сама, объяснение проговаривается устно.\n" +
    "Панорама хребта, которая открывается с участка, — исходная линия проекта: ломаная гряда в три шага " +
    "сглаживается до горизонтальных лент перекрытий. Отсюда и отказ от высотности."
  );
}

/* =========================================================
   05–18 · ВИЗУАЛИЗАЦИИ
   ========================================================= */
plates([
  ["facade.jpg",      "Главный фасад",        INK,   INK,   WHITE],
  ["lobby.jpg",       "Лобби",                WHITE, WHITE, WHITE],
  ["lobby_grand.jpg", "Лобби-лаунж",          WHITE, INK,   WHITE],
  ["restaurant.jpg",  "Ресторан",             WHITE, INK,   WHITE],
  ["conference.jpg",  "Конференц-зал",        WHITE, WHITE, WHITE],
  ["boardroom.jpg",   "Переговорная",         INK,   INK,   WHITE],
  ["coworking.jpg",   "Коворкинг",            WHITE, WHITE, WHITE],
  ["gym.jpg",         "Фитнес",               WHITE, WHITE, WHITE],
  ["room.jpg",        "Номер",                WHITE, INK,   WHITE],
  ["terrace.jpg",     "Общественная терраса", WHITE, WHITE, WHITE],
  ["bc.jpg",          "Бизнес-центр",         INK,   INK,   WHITE,
    "Бизнес-центр — новая функция в составе комплекса, для акимата это постоянные рабочие места вне сезона.\n" +
    "Этажность на рендере и на генплане совпадает: пять этажей.\n" +
    "Голубым на генплане показана только выступающая часть бизнес-центра — 866 м² пятна. " +
    "Остальные примерно 2 000 м² он занимает на верхних этажах гостиничного корпуса, " +
    "поэтому 4 895,11 м² по ТЭП сходятся. Если спросят, где остальной объём, — ответ такой."],
  ["bc_lobby.jpg",    "Лобби бизнес-центра",  WHITE, INK,   WHITE],
  ["bc_office.jpg",   "Офисный этаж",         WHITE, INK,   WHITE],
  ["night.jpg",       "Вечерний вид",         WHITE, ORANGE, WHITE],
]);
/* =========================================================
   19 · ФУНКЦИОНАЛЬНОЕ ЗОНИРОВАНИЕ
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Зонирование", sub: "Распределение функций по этажам", right: "Схема" });

  fitImage(s, A("zoning.jpg"), 0.55, 0.92, 12.23, 6.05);

  logo(s);
  pageNo(s);
  s.addNotes(
    "Одна картинка вместо объяснений: первый этаж — общественная функция на город, " +
    "выше — номера и офисы.\n" +
    "Зелёный: лобби, рестораны, конференц-залы, спа и фитнес, технические помещения — 4 483,04 м².\n" +
    "ВНИМАНИЕ: схема отрисована по прежней программе. По текущей второй этаж отеля занимает " +
    "конференц-блок, номера остались на 3–5 этажах, бизнес-центр вырос. Схему надо перерисовать " +
    "до показа, иначе она противоречит слайду показателей.\n" +
    "Жёлтый: номерной фонд — 4 616,00 м², 150 номеров на этажах 3–5.\n" +
    "Бордовый: бизнес-центр, этажи 2–5 — 4 895,11 м².\n" +
    "Главный тезис для акимата: весь первый этаж работает на город, а не только на постояльцев.\n" +
    "На схеме бизнес-центр показан отдельным стаканом. Часть его площадей — около 2 000 м² — " +
    "фактически лежит на верхних этажах гостиничного корпуса; на схеме это не выделено."
  );
}

/* =========================================================
   20 · МАТЕРИАЛЫ ФАСАДОВ
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: "FCFBFC" };
  fitImage(s, A("materials.jpg"), (W - 11.25) / 2, 0, 11.25, 7.5);
  logo(s);
  pageNo(s);
  s.addNotes(
    "Уровень архитектуры одним листом. Не зачитывать состав — назвать две-три позиции.\n" +
    "Стоит рядом с зонированием: там разбор по функциям, здесь — по материалам."
  );
}

/* =========================================================
   21 · КЛЮЧЕВЫЕ ПОКАЗАТЕЛИ
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Показатели", sub: "Ключевые параметры проекта", right: "ТЭП" });

  const gw = 12.23 / 4;
  figure(s, CX, 1.45, gw - 0.3, "1,4", "га", "Площадь участка", { size: 34, lh: 0.5 });
  figure(s, CX + gw, 1.45, gw - 0.3, "5", "этажей", "Этажность комплекса", { size: 34, lh: 0.5 });
  figure(s, CX + 2 * gw, 1.45, gw - 0.3, "150", "", "Номера категории 4 звезды", { size: 34, lh: 0.5 });
  figure(s, CX + 3 * gw, 1.45, gw - 0.3, "22 415", "м²", "Общая надземная площадь", { size: 34, lh: 0.5 });

  rule(s, CX, 2.92, 12.23, INK);

  const rows = [
    ["Площадь застройки", "4 981,16 м²", "35,6 % участка", false],
    ["Площадь 1-го этажа — общественные функции", "4 483,04 м²", "20,0 % надземной площади", false],
    ["Конференц-блок, нетто (этаж 2)", "1 916,32 м²", "зал на 600–700 мест с фойе", false],
    ["Номерной фонд, нетто (этажи 3–5)", "4 616,00 м²", "150 номеров, средний модуль 30,8 м²", false],
    ["Бизнес-центр, нетто (этажи 2–5)", "6 028,08 м²", "26,9 % надземной площади", false],
    ["Коридоры, узлы и техпомещения (расчётно)", "5 371,76 м²", "коэффициент этажа 0,70", false],
    ["Надземная часть, всего", "22 415,20 м²", "коэф. использования территории 1,60", true],
    ["Машино-места", "102 м/м", "по чертежу генплана", false],
  ];
  let y = 2.98;
  rows.forEach(([k, v, n, strong]) => {
    s.addText(k, {
      x: CX, y, w: 5.8, h: 0.3, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 11.5, bold: strong, color: strong ? INK : TXT, valign: "middle",
    });
    s.addText(v, {
      x: CX + 5.9, y, w: 2.5, h: 0.3, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 12, bold: true, color: INK, align: "right", valign: "middle",
    });
    s.addText(n, {
      x: CX + 8.7, y, w: 4.1, h: 0.3, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 10, color: GREY, valign: "middle",
    });
    rule(s, CX, y + 0.33, 12.23, strong ? INK : RULE);
    y += 0.455;
  });

  caption(s, CX, 6.60, 12.23, "Строка с пометкой «расчётно» получена расчётом бюро: в ТЭП генплана указана только полезная площадь.");

  logo(s);
  pageNo(s);
  s.addNotes(
    "Цифры идут после всего визуального ряда: сначала показали объект, теперь считаем.\n" +
    "Готовность к вопросу: 22 415,20 = 5 этажей × 4 483,04. Полезная площадь 17 043,44 не включает " +
    "коридоры, узлы и техпомещения — разница 5 371,76 м². Показывать надо общую.\n" +
    "150 номеров: 140 стандартных по 27,4 м² на этажах 3–4 и на пятом 8 люксов по 60 м² плюс два " +
    "президентских по 150 м². Доля номеров повышенной категории 6,7 % — практика 4 звезды 6–12 %.\n" +
    "Ёмкость снижена сознательно, обоснование на следующем слайде — не оправдываться, а вести."
  );
}

/* =========================================================
   22 · ЁМКОСТЬ · ОБОСНОВАНИЕ
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Ёмкость", sub: "Обоснование номерного фонда", right: "Анализ рынка" });

  const gw = 12.23 / 4;
  figure(s, CX, 1.32, gw - 0.3, "150", "", "Номеров в проекте", { size: 29, lh: 0.7, color: ORANGE });
  figure(s, CX + gw, 1.32, gw - 0.3, "190 – 230", "", "Сложившаяся ёмкость брендового отеля 4 звезды в Алматы", { size: 29, lh: 0.7 });
  figure(s, CX + 2 * gw, 1.32, gw - 0.3, "150 – 300", "", "Номеров в год — скорость поглощения рынком", { size: 29, lh: 0.7 });
  figure(s, CX + 3 * gw, 1.32, gw - 0.3, "+ 79", "%", "Рост туристического потока Алматы за 2016–2024 годы", { size: 29, lh: 0.7 });

  rule(s, CX, 3.1, 12.23, INK);

  const colW = (12.23 - 0.95) / 2;
  const x1 = CX, x2 = CX + colW + 0.95;

  blockTitle(s, x1, 3.35, colW, "Сопоставимые отели Алматы", 12);
  rule(s, x1, 3.73, colW);
  let y = 3.95;
  [["Novotel Almaty City Center", "4 звезды", "190"],
   ["Holiday Inn Almaty", "4 звезды", "229"],
   ["Rixos Almaty", "5 звёзд", "237"]].forEach(([n, c, v]) => {
    s.addText(n, { x: x1, y, w: colW - 2.4, h: 0.28, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 11.5, color: TXT, valign: "middle" });
    s.addText(c, { x: x1 + colW - 2.4, y, w: 1.4, h: 0.28, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 10, color: GREY, valign: "middle" });
    s.addText(v, { x: x1 + colW - 1.0, y, w: 1.0, h: 0.28, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 13, bold: true, color: INK, align: "right", valign: "middle" });
    rule(s, x1, y + 0.34, colW);
    y += 0.48;
  });
  body(s, x1, y + 0.14, colW, 1.1,
    "Проект заходит ниже сложившейся ёмкости рынка: 150 номеров это 1,23 % номерного фонда Алматы и менее года ёмкости поглощения. Запас взят сознательно.",
    { size: 11, lead: 16 });

  blockTitle(s, x2, 3.35, colW, "Что говорит рынок", 12);
  rule(s, x2, 3.73, colW);
  dashes(s, x2, 3.95, colW, 2.9, [
    "Туристический поток Алматы вырос с 1,72 до 3,08 млн человек за 2016–2024 годы — в среднем 7,5 % в год.",
    "Загрузка гостиниц поднялась с 54,9 % до 69,5 % — рекорд рынка. Признаков системного перегрева нет.",
    "Рынок вышел из восстановительной фазы и перешёл в стадию органического роста спроса.",
  ], { size: 11 });

  logo(s);
  pageNo(s);
  s.addNotes(
    "Слайд отвечает на вопрос, который задают первым: почему так мало номеров.\n" +
    "Ответ: ёмкость выбрана ниже рыночной нормы сознательно. Брендовый отель 4 звезды в Алматы — " +
    "это 190–230 номеров, рынок поглощает 150–300 номеров в год. Проект берёт 150 — менее года " +
    "ёмкости поглощения и 1,23 % фонда города.\n" +
    "Готовность к вопросу о риске загрузки: 69,5 % в 2024 — рекорд, среднее за девять лет 54 %. " +
    "Если спросят про устойчивость этого уровня — не спорить, а переходить на следующий слайд: " +
    "от суточной загрузки зависит лишь 27 % площадей.\n" +
    "Если спросят про риск загрузки — переходить к следующему слайду, там ответ по структуре выручки."
  );
}

/* =========================================================
   23 · СТРУКТУРА ВЫРУЧКИ
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Устойчивость", sub: "Три источника выручки", right: "Экономика" });

  body(s, CX, 1.25, 8.2, 0.9,
    "Комплекс не зависит от одной суточной загрузки: две трети полезной площади работают по договорам аренды и заявкам на мероприятия.",
    { size: 14, lead: 21, color: INK });

  const items = [
    ["Бизнес-центр", "6 028,08 м²", "35,4 %", "Договоры аренды, годовой горизонт", "высокая"],
    ["Конференц-блок", "1 916,32 м²", "11,2 %", "Событийная сдача, собственные и сторонние мероприятия", "средняя"],
    ["Номерной фонд", "4 616,00 м²", "27,1 %", "Суточная загрузка, сезонная", "низкая"],
    ["Первый этаж", "4 483,04 м²", "26,3 %", "Обслуживает все три функции и работает на город", "—"],
  ];
  let y = 2.5;
  items.forEach(([n, a, sh, d, p], i) => {
    s.addShape(pres.ShapeType.rect, { x: CX, y, w: 0.05, h: 0.72,
      fill: { color: i === 3 ? RULE : ORANGE }, line: { color: i === 3 ? RULE : ORANGE, width: 0 } });
    s.addText(n, { x: CX + 0.3, y, w: 2.6, h: 0.3, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 13, bold: true, color: INK, valign: "middle" });
    s.addText(d, { x: CX + 0.3, y: 0.3 + y, w: 5.6, h: 0.42, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 10.5, color: TXT, lineSpacing: 13, valign: "top" });
    s.addText(a, { x: CX + 6.1, y, w: 2.0, h: 0.3, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 13, bold: true, color: INK, align: "right", valign: "middle" });
    s.addText(sh + " полезной", { x: CX + 6.1, y: 0.3 + y, w: 2.0, h: 0.28, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 9.5, color: GREY, align: "right", valign: "top" });
    s.addText("предсказуемость", { x: CX + 8.6, y, w: 3.6, h: 0.3, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 8.5, color: GREY, charSpacing: 0.3, valign: "middle" });
    s.addText(p.toUpperCase(), { x: CX + 8.6, y: 0.28 + y, w: 3.6, h: 0.3, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 12, bold: true, color: i === 3 ? GREY : ORANGE, charSpacing: 0.5, valign: "middle" });
    rule(s, CX, y + 0.82, 12.23);
    y += 1.02;
  });

  s.addText([
    { text: "47 %", options: { fontFace: F, fontSize: 22, bold: true, color: ORANGE } },
  ], { x: CX, y: 6.7, w: 1.2, h: 0.4, isTextBox: true, margin: 0, valign: "middle" });
  s.addText("полезной площади работает по договорам аренды и заявкам на мероприятия. От суточной загрузки зависит 27 %.", {
    x: CX + 1.25, y: 6.7, w: 10.9, h: 0.4, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 11, color: TXT, valign: "middle" });

  logo(s);
  pageNo(s);
  s.addNotes(
    "Прямой ответ на страх незаполняемости. Сокращение номерного фонда не выбрасывает площадь — " +
    "она уходит в бизнес-центр, а он сдаётся по договору, а не по суточной загрузке.\n" +
    "Конференц-блок тоже сдаётся сторонним заказчикам и при этом сам генерирует спрос на номера: " +
    "делегаты закрывают будние ночи, которых у отеля вне центра города иначе нет.\n" +
    "Занятость: гостиница 90–105, конференц-центр 16–24, офисы 502–603 — всего 608–732 постоянных места."
  );
}

/* =========================================================
   24 · СООТВЕТСТВИЕ НОРМАМ
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Приложение", sub: "Соответствие нормам", right: "Нормы" });

  const colW = (12.23 - 0.95) / 2;
  const x1 = CX, x2 = CX + colW + 0.95;

  blockTitle(s, x1, 1.3, colW, "Подтверждено генпланом", 12);
  rule(s, x1, 1.68, colW, INK);
  dashes(s, x1, 1.92, colW, 4.4, [
    "Этажность 5 этажей по гостиничному корпусу и бизнес-центру, без превышения отметок соседней застройки.",
    "Замкнутый кольцевой пожарный проезд вокруг пятна застройки.",
    "Плотность застройки 35,6 %, коэффициент использования территории 1,60.",
    "Рядовая посадка деревьев по всему периметру участка.",
  ], { size: 10.5, lead: 14, gap: 9 });

  blockTitle(s, x2, 1.3, colW, "Уточняется на стадии ЭП и ПСД", 12);
  rule(s, x2, 1.68, colW, INK);
  dashes(s, x2, 1.92, colW, 4.4, [
    "Отступы от границ участка уточняются по чертежу генерального плана.",
    "Санитарно-защитная зона действующей АЗС: подтвердить тип станции и установленный размер СЗЗ. На генплане прочерчена зона 50 м.",
    "Расчёт машино-мест по нормативу раздельно для гостиницы и бизнес-центра; на генплане предусмотрено 102 наземных места.",
    "Состав технических и хозяйственных помещений первого этажа уточняется на стадии эскизного проекта.",
    "Баланс территории раздельно: озеленение, покрытия, проезды, площадки.",
    "Технические условия на воду, канализацию, тепло и электроснабжение; расчёты инсоляции и шума.",
  ], { size: 10.5, lead: 14, gap: 9 });

  logo(s);
  pageNo(s);
  s.addNotes(
    "Технический слайд, вынесен в приложение, чтобы не тормозить историю.\n" +
    "Показывать по запросу или оставить в раздатке."
  );
}

/* =========================================================
   25 · КОНТАКТЫ
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  pill(s, 1.07, 0.72, 1.68, "architectural bureau", false);
  s.addImage({ path: A("qr_most.png"), x: 6.29, y: 3.24, w: 0.75, h: 0.75 });
  s.addText("most\narchitects\nkazakhstan/almaty", {
    x: 1.07, y: 3.85, w: 3, h: 0.6, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 8.5, color: INK, lineSpacing: 11, valign: "top",
  });
  s.addText("most-a.com\ne-mail: info@most-a.com\n+7 (771) 733 77 00", {
    x: W - 1.07 - 4, y: 3.85, w: 4, h: 0.7, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 8.5, color: INK, lineSpacing: 11, align: "right", valign: "top",
  });
  pill(s, (W - 1.32) / 2, 6.42, 1.32, "concept", true);
  s.addNotes(
    "Три запроса к акимату проговариваются здесь: одобрить архитектурно-градостроительную концепцию, " +
    "выдать АПЗ для перехода к эскизному проекту, определить технические условия на подключение к сетям."
  );
}

pres.writeFile({ fileName: path.join(__dirname, "MOST_Bukhtarminskaya.pptx") })
  .then((f) => console.log("Готово:", f));
