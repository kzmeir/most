const pptxgen = require("pptxgenjs");
const path = require("path");

const A = (f) => path.join(__dirname, "assets", f);

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
    fontFace: F, fontSize: 9.5, color: ORANGE, charSpacing: 0.6, align: "right", valign: "middle",
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

function plate(slide, img) {
  slide.addImage({ path: img, x: 0, y: 0, w: W, h: H, sizing: { type: "cover", w: W, h: H } });
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

/* =========================================================
   01 · ОБЛОЖКА
   ========================================================= */
{
  const s = pres.addSlide();
  plate(s, A("facade.jpg"));
  s.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: W, h: H, fill: { color: "0A0A0A", transparency: 52 }, line: { color: "0A0A0A", width: 0 },
  });
  s.addText("ГОСТИНИЧНЫЙ КОМПЛЕКС", {
    x: 0.9, y: 4.62, w: 11, h: 0.78, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 42, bold: true, color: WHITE, charSpacing: 1.5, valign: "middle",
  });
  s.addText("г. Алматы, ул. Бухтарминская", {
    x: 0.9, y: 5.46, w: 11, h: 0.34, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 15, color: "E8E4DC", valign: "middle",
  });
  s.addText("Презентация для акимата г. Алматы  ·  август 2026", {
    x: 0.9, y: 6.62, w: 8, h: 0.3, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 10, color: "C8C4BC", valign: "middle",
  });
  s.addImage({ path: A("logo_most.png"), x: 12.42, y: 0.5, w: 0.69, h: 0.77 });
  s.addNotes("Обложка. Ничего не зачитывать — назвать объект и передать слово по существу.");
}

/* =========================================================
   02 · МЕСТО
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Место", sub: "Существующая ситуация", right: "Ситуационная схема" });

  s.addImage({ path: A("plan_render.jpg"), x: 0.55, y: 1.05, w: 7.4, h: 5.55 });
  caption(s, 0.55, 6.72, 7.4, "Синим — граница участка, красным — границы смежных землепользований.");

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
    "Главная мысль: город ничего не теряет. Территория пустая, никого не сносим и не расселяем.\\n" +
    "АЗС: подтвердить тип станции и установленный размер СЗЗ до градсовета."
  );
}

/* =========================================================
   03 · БЫЛО → СТАНЕТ
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Территория", sub: "Было и станет", right: "Трансформация" });

  const pw = 5.75, py = 1.35, ph = 4.3;

  // БЫЛО — поле под аэрофото
  s.addShape(pres.ShapeType.rect, {
    x: 0.55, y: py, w: pw, h: ph,
    fill: { color: "F4F3F1" }, line: { color: ORANGE, width: 1, dashType: "dash" },
  });
  s.addText("аэрофото существующего состояния\nвставить снимок пустого участка", {
    x: 0.55, y: py, w: pw, h: ph, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 11, italic: true, color: ORANGE, align: "center", valign: "middle", lineSpacing: 16,
  });
  subTitle(s, 0.55, py - 0.34, pw, "Было", GREY);

  // стрелка
  s.addShape(pres.ShapeType.rightArrow, {
    x: 6.44, y: py + ph / 2 - 0.16, w: 0.44, h: 0.32,
    fill: { color: ORANGE }, line: { color: ORANGE, width: 0 },
  });

  // СТАНЕТ
  s.addImage({ path: A("facade.jpg"), x: 7.02, y: py, w: pw, h: ph, sizing: { type: "cover", w: pw, h: ph } });
  subTitle(s, 7.02, py - 0.34, pw, "Станет", ORANGE);

  s.addText("Пустырь в деловом поясе города становится гостиничным комплексом на 280–300 номеров с общественным первым этажом.", {
    x: 0.55, y: 6.1, w: 12.23, h: 0.5, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 13, color: INK, lineSpacing: 19, valign: "top",
  });

  logo(s);
  pageNo(s);
  s.addNotes(
    "Слайд на три секунды. Слева — что есть, справа — что будет. Не комментировать подробно.\\n" +
    "ВСТАВИТЬ аэрофото пустого участка в левое поле."
  );
}

/* =========================================================
   04 · ИДЕЯ: АЛАТАУ
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Идея", sub: "Силуэт Заилийского Алатау", right: "Концепция" });

  s.addImage({ path: A("genesis.jpg"), x: 4.55, y: 1.0, w: 8.2, h: 5.47 });

  blockTitle(s, CX, 1.6, 3.6, "Форма от силуэта гор", 15);
  body(s, CX, 2.15, 3.6, 2.4,
    "Панорама хребта, которая открывается с участка, — исходная линия проекта. Ломаная гряда в три шага сглаживается до горизонтальных лент перекрытий.",
    { size: 12, lead: 18 });

  logo(s);
  pageNo(s);
  s.addNotes("Форма не произвольная — она выведена из силуэта, который виден с участка. Отсюда и отказ от высотности.");
}

/* =========================================================
   05 · ПОЧЕМУ 5 ЭТАЖЕЙ
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Масштаб", sub: "Почему пять этажей", right: "Схема" });

  blockTitle(s, CX, 1.35, CW, "Не конкурируем с панорамой", 15);
  body(s, CX, 1.92, CW, 1.7,
    "Участок в 1,4 га позволял поставить башню. Вместо этого объём распластан по горизонтали и держится ниже линии гор.",
    { size: 12, lead: 18 });
  rule(s, CX, 3.75, CW);
  dashes(s, CX, 3.97, CW, 2.2, [
    "Пять этажей — в габаритах окружающей застройки.",
    "Виды соседних участков на хребет не перекрываются.",
    "Силуэт продолжает ландшафт, а не спорит с ним.",
  ], { size: 11 });

  /* --- диаграмма --- */
  const GY = 5.75;
  // гряда: перекрывающиеся треугольники одного цвета сливаются в силуэт
  [[5.5, 3.78], [6.4, 3.30], [7.4, 3.90], [8.4, 3.12], [9.4, 3.66],
   [10.5, 3.24], [11.6, 3.84], [12.6, 3.46]].forEach(([cx, top]) => {
    s.addShape(pres.ShapeType.triangle, {
      x: cx - 1.15, y: top, w: 2.3, h: GY - top,
      fill: { color: SOFT }, line: { color: SOFT, width: 0 },
    });
  });
  rule(s, 5.35, GY, 7.75, INK);

  // условная вертикальная доминанта — рвёт линию гор
  s.addShape(pres.ShapeType.rect, {
    x: 6.05, y: 2.35, w: 0.8, h: GY - 2.35,
    fill: { color: WHITE }, line: { color: GREY, width: 1, dashType: "dash" },
  });
  s.addText("×", {
    x: 6.05, y: 3.75, w: 0.8, h: 0.6, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 26, bold: true, color: GREY, align: "center", valign: "middle",
  });
  s.addText("условная\nвертикальная\nдоминанта", {
    x: 5.6, y: GY + 0.14, w: 1.7, h: 0.75, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 8.5, color: GREY, align: "center", valign: "top", lineSpacing: 11,
  });

  // наш объём — пять лент перекрытий
  const bcx = 10.6;
  [3.4, 3.15, 2.9, 2.6, 2.2].forEach((bw, i) => {
    const y = GY - (i + 1) * 0.32;
    s.addShape(pres.ShapeType.roundRect, {
      x: bcx - bw / 2, y, w: bw, h: 0.29, rectRadius: 0.05,
      fill: { color: ORANGE }, line: { color: ORANGE, width: 0 },
    });
  });
  s.addText("наш объём · 5 этажей", {
    x: bcx - 1.6, y: GY + 0.14, w: 3.2, h: 0.3, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 8.5, bold: true, color: ORANGE, align: "center", valign: "top",
  });

  logo(s);
  pageNo(s);
  s.addNotes(
    "Ключевой аргумент для градсовета: высотность не взята сознательно.\\n" +
    "Слева на схеме — что было бы при вертикальной доминанте: она рвёт линию гор. Справа — наш вариант."
  );
}

/* =========================================================
   06 · ГЕНПЛАН
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Генеральный план", sub: "Посадка на участок", right: "Генплан" });

  s.addImage({ path: A("genplan_site.jpg"), x: 0.55, y: 1.2, w: 6.62, h: 5.7 });

  const tx = 7.55, tw = W - 7.55 - 0.62;
  subTitle(s, tx, 1.15, tw, "Отступы от границ участка");
  const offs = [["6,00", "запад"], ["3,00", "северо-восток"], ["17,49", "восток"], ["6,00", "юг"]];
  const ow = tw / 4;
  offs.forEach(([v, l], i) => {
    s.addText([
      { text: v, options: { fontFace: F, fontSize: 17, bold: true, color: INK } },
      { text: " м", options: { fontFace: F, fontSize: 9, bold: true, color: ORANGE } },
    ], { x: tx + i * ow, y: 1.45, w: ow, h: 0.34, isTextBox: true, margin: 0, valign: "middle" });
    s.addText(l.toUpperCase(), {
      x: tx + i * ow, y: 1.81, w: ow, h: 0.34, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 7.5, color: GREY, charSpacing: 0.2, lineSpacing: 10, valign: "top",
    });
  });

  rule(s, tx, 2.35, tw);
  dashes(s, tx, 2.57, tw, 3.4, [
    "Два корпуса поставлены вдоль длинных сторон участка и раскрыты во двор.",
    "Кольцевой проезд замкнут вокруг обоих корпусов: подъезд ко всем входам и разворот пожарной техники.",
    "Рядовая посадка деревьев по всему периметру формирует буфер между застройкой и границами.",
    "Внутренний двор между корпусами защищён от улицы.",
  ], { size: 11 });

  logo(s);
  pageNo(s);
  s.addNotes("Конкретика посадки. Отступы вынесены на чертёж генплана, не пересчитывались.");
}

/* =========================================================
   07 · ФУНКЦИОНАЛЬНАЯ СХЕМА
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Функция", sub: "Распределение по этажам", right: "Схема" });

  blockTitle(s, CX, 1.45, CW, "Один этаж — городу", 15);
  body(s, CX, 2.0, CW, 1.2,
    "Первый этаж отдан общественным функциям. Этажи со 2-го по 5-й — номерной фонд.",
    { size: 12, lead: 18 });

  figure(s, CX, 3.5, CW, "4 446,9", "м²", "Общественные функции · 1 этаж", { size: 27, lc: ORANGE });
  figure(s, CX, 4.75, CW, "12 693,32", "м²", "Номерной фонд · этажи 2–5", { size: 27 });

  /* --- диаграмма --- */
  const bcx = 9.1, GY = 6.15, bh = 0.62, gp = 0.08;
  const bands = [
    [5.3, ORANGE, "PUBLIC"],
    [4.95, "2B2B2B", ""],
    [4.6, "2B2B2B", ""],
    [4.2, "2B2B2B", ""],
    [3.7, "2B2B2B", ""],
  ];
  bands.forEach(([bw, col, lab], i) => {
    const y = GY - (i + 1) * bh - i * gp;
    s.addShape(pres.ShapeType.roundRect, {
      x: bcx - bw / 2, y, w: bw, h: bh, rectRadius: 0.12,
      fill: { color: col }, line: { color: col, width: 0 },
    });
    if (lab) s.addText(lab, {
      x: bcx - bw / 2, y, w: bw, h: bh, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 12, bold: true, color: WHITE, charSpacing: 2, align: "center", valign: "middle",
    });
  });
  s.addText("HOTEL ROOMS", {
    x: bcx - 2.4, y: GY - 3 * bh - 2 * gp, w: 4.8, h: bh, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 12, bold: true, color: WHITE, charSpacing: 2, align: "center", valign: "middle",
  });
  rule(s, 6.3, GY + 0.02, 5.6, INK);

  logo(s);
  pageNo(s);
  s.addNotes(
    "Самая простая схема в презентации и одна из самых важных: видно, что первый этаж работает на город.\\n" +
    "Обе площади — из ТЭП генплана, не расчётные."
  );
}

/* =========================================================
   08 · ПЕРВЫЙ ЭТАЖ РАБОТАЕТ НА ГОРОД
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  s.addImage({ path: A("lobby.jpg"), x: 0, y: 0, w: 6.1, h: H, sizing: { type: "cover", w: 6.1, h: H } });

  const tx = 6.8, tw = W - 6.8 - 0.62;
  subTitle(s, tx, 1.0, tw, "Первый этаж");
  s.addText("Открыт не только\nдля постояльцев", {
    x: tx, y: 1.3, w: tw, h: 1.15, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 30, bold: true, color: INK, lineSpacing: 34, valign: "top",
  });
  body(s, tx, 2.72, tw, 0.7,
    "4 446,9 м² — четверть надземной площади комплекса — работают как городская функция.",
    { size: 12, lead: 18 });

  rule(s, tx, 3.62, tw);
  const fns = [
    ["Лобби и приём", "Круговой подъезд, зона высадки, вестибюль двойной высоты"],
    ["Рестораны и кафе", "Открыты с улицы, а не только из гостиницы"],
    ["Конференц-зона", "Площадка для деловых и городских мероприятий"],
    ["Оздоровительный блок", "СПА и фитнес; состав уточняется на стадии ЭП"],
  ];
  let y = 3.84;
  fns.forEach(([tt, dd]) => {
    s.addText(tt, {
      x: tx, y, w: tw, h: 0.26, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 12.5, bold: true, color: ORANGE, valign: "middle",
    });
    s.addText(dd, {
      x: tx, y: y + 0.26, w: tw, h: 0.42, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 10.5, color: TXT, lineSpacing: 14, valign: "top",
    });
    y += 0.78;
  });

  logo(s);
  pageNo(s, WHITE);
  s.addNotes("Тезис не «в отеле есть ресторан», а «первый этаж доступен городу». Это то, что интересует акимат.");
}

/* =========================================================
   09 · HERO
   ========================================================= */
{
  const s = pres.addSlide();
  plate(s, A("facade.jpg"));
  labels(s, { left: "Главный фасад", sub: "Со стороны въездной группы", right: "Визуализация", color: INK });
  logo(s);
  pageNo(s, WHITE);
  s.addNotes("Пауза. Дать слайду постоять — идея уже рассказана, это её доказательство.");
}

/* =========================================================
   10 · ARRIVAL → LOBBY
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Сценарий гостя", sub: "Прибытие и вестибюль", right: "Визуализации" });

  const pw = 5.9, py = 1.35, ph = 3.92;
  s.addImage({ path: A("arrival.jpg"), x: 0.55, y: py, w: pw, h: ph });
  s.addImage({ path: A("lobby.jpg"), x: 6.88, y: py, w: pw, h: ph });
  subTitle(s, 0.55, py - 0.34, pw, "1 · Прибытие");
  subTitle(s, 6.88, py - 0.34, pw, "2 · Лобби");
  caption(s, 0.55, py + ph + 0.14, pw, "Круговой подъезд и входной портик со стороны внутриквартального проезда.");
  caption(s, 6.88, py + ph + 0.14, pw, "Вестибюль двойной высоты с раскрытием на панораму хребта.");

  s.addShape(pres.ShapeType.rightArrow, {
    x: 6.53, y: py + ph / 2 - 0.14, w: 0.3, h: 0.28,
    fill: { color: ORANGE }, line: { color: ORANGE, width: 0 },
  });

  s.addText("Круговой подъезд отделён от хозяйственного двора: потоки гостей и обслуживания не пересекаются.", {
    x: 0.55, y: 6.2, w: 12.23, h: 0.4, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 12.5, color: INK, valign: "middle",
  });

  logo(s);
  pageNo(s);
  s.addNotes("Путь гостя одним движением: подъезд — вход — вестибюль.");
}

/* =========================================================
   11 · RESTAURANT + CONFERENCE
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Общественные функции", sub: "Ресторан и конференц-зона", right: "Визуализации" });

  const pw = 5.9, py = 1.35, ph = 3.92;
  s.addImage({ path: A("restaurant.jpg"), x: 0.55, y: py, w: pw, h: ph });
  s.addImage({ path: A("conference.jpg"), x: 6.88, y: py, w: pw, h: ph });
  subTitle(s, 0.55, py - 0.34, pw, "Ресторан");
  subTitle(s, 6.88, py - 0.34, pw, "Конференц-зал");
  caption(s, 0.55, py + ph + 0.14, pw, "Зал первого этажа с выходом на террасу в сад.");
  caption(s, 6.88, py + ph + 0.14, pw, "Площадка для деловых мероприятий и городских событий.");

  s.addText("Обе функции работают на город и держат загрузку вне туристического сезона.", {
    x: 0.55, y: 6.2, w: 12.23, h: 0.4, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 12.5, color: INK, valign: "middle",
  });

  logo(s);
  pageNo(s);
  s.addNotes("Два кадра — один тезис. Не рассказывать про каждый отдельно.");
}

/* =========================================================
   12 · HOTEL EXPERIENCE
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Гость", sub: "Номер и общественная терраса", right: "Визуализации" });

  s.addImage({ path: A("room.jpg"), x: 0.55, y: 1.35, w: 8.3, h: 5.54 });
  s.addImage({ path: A("terrace.jpg"), x: 9.15, y: 1.35, w: 3.63, h: 2.42 });
  caption(s, 9.15, 3.9, 3.63, "Общественная терраса верхнего яруса.");

  s.addText("Каждый номер раскрыт на город и хребет, с собственным балконом на озеленённой ленте фасада.", {
    x: 9.15, y: 4.5, w: 3.63, h: 1.4, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 11.5, color: TXT, lineSpacing: 17, valign: "top",
  });

  logo(s);
  pageNo(s);
  s.addNotes("Эмоциональная часть: что получает гость. Дальше возвращаемся к делу.");
}

/* =========================================================
   13 · МАТЕРИАЛЫ
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: "FCFBFC" };
  s.addImage({ path: A("materials.jpg"), x: (W - 11.25) / 2, y: 0, w: 11.25, h: 7.5 });
  logo(s);
  pageNo(s);
  s.addNotes("Уровень архитектуры одним листом. Не зачитывать состав — назвать две-три позиции.");
}

/* =========================================================
   14 · БЛАГОУСТРОЙСТВО
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Благоустройство", sub: "Открытая территория", right: "Фрагмент генплана" });

  s.addText([
    { text: "64,7", options: { fontFace: F, fontSize: 76, bold: true, color: ORANGE } },
    { text: " %", options: { fontFace: F, fontSize: 30, bold: true, color: ORANGE } },
  ], { x: CX, y: 1.5, w: CW + 0.6, h: 1.3, isTextBox: true, margin: 0, valign: "middle" });
  s.addText("ТЕРРИТОРИИ ВНЕ ПЯТНА ЗАСТРОЙКИ", {
    x: CX, y: 2.85, w: CW + 0.6, h: 0.3, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 10, bold: true, color: INK, charSpacing: 1, valign: "middle",
  });
  s.addText("9 058,89 м² из 14 000 м²", {
    x: CX, y: 3.16, w: CW + 0.6, h: 0.3, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 11, color: GREY, valign: "middle",
  });

  rule(s, CX, 3.75, CW + 0.6);
  dashes(s, CX, 3.97, CW + 0.6, 2.4, [
    "Рядовая посадка деревьев по всему периметру участка.",
    "Внутренний двор между корпусами — защищённое от улицы пространство.",
    "Озеленение на террасах продолжает партер вверх по фасаду.",
  ], { size: 11 });

  s.addImage({ path: A("plan_green.jpg"), x: 5.9, y: 1.35, w: 6.85, h: 4.64 });
  caption(s, 5.9, 6.12, 6.85, "Зелёная полоса между кольцевым проездом и границей участка.");

  logo(s);
  pageNo(s);
  s.addNotes("9 058,89 = 14 000 − 4 941,11. В эту площадь входят и проезды — отдельную долю озеленения не называть.");
}

/* =========================================================
   15 · ТРАНСПОРТ
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Транспорт", sub: "Схема обслуживания участка", right: "Схема" });

  const px = 0.55, py = 1.15, pW = 7.87, pH = 5.9;   // plan_render 1448×1086
  s.addImage({ path: A("plan_render.jpg"), x: px, y: py, w: pW, h: pH });

  const pts = [
    [0.207, 0.470, 1],
    [0.262, 0.540, 2],
    [0.495, 0.450, 3],
    [0.345, 0.630, 4],
  ];
  pts.forEach(([fx, fy, n]) => marker(s, px + fx * pW, py + fy * pH, n));

  const tx = 8.85, tw = W - 8.85 - 0.62;
  const legend = [
    ["Наземные гостевые места", "Ряд вдоль западной кромки, со стороны улицы. Гостевой транспорт не заезжает во двор."],
    ["Юго-западный узел", "Въезд с внутриквартального проезда, зона высадки и рампа в подземный паркинг под корпусом."],
    ["Северо-восточный въезд", "Второй узел со стороны ул. Бухтарминской. Оба входа вынесены от перекрёстка."],
    ["Кольцевой проезд", "Замкнут вокруг застройки: подъезд ко всем входам, разгрузка и проезд пожарной техники."],
  ];
  let y = 1.15;
  legend.forEach(([tt, dd], i) => {
    s.addShape(pres.ShapeType.ellipse, {
      x: tx, y: y + 0.02, w: 0.3, h: 0.3, fill: { color: ORANGE }, line: { color: ORANGE, width: 0 },
    });
    s.addText(String(i + 1), {
      x: tx, y: y + 0.02, w: 0.3, h: 0.3, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 10, bold: true, color: WHITE, align: "center", valign: "middle",
    });
    s.addText(tt, {
      x: tx + 0.46, y, w: tw - 0.46, h: 0.3, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 12, bold: true, color: INK, valign: "middle",
    });
    s.addText(dd, {
      x: tx + 0.46, y: y + 0.3, w: tw - 0.46, h: 0.8, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 10, color: TXT, lineSpacing: 13, valign: "top",
    });
    y += 1.28;
  });

  s.addShape(pres.ShapeType.roundRect, {
    x: tx, y: 6.42, w: 2.9, h: 0.34, rectRadius: 0.06,
    fill: { color: WHITE }, line: { color: ORANGE, width: 0.75 },
  });
  s.addText("вписать: ____ машино-мест", {
    x: tx, y: 6.42, w: 2.9, h: 0.34, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 9, italic: true, color: ORANGE, align: "center", valign: "middle",
  });

  logo(s);
  pageNo(s);
  s.addNotes(
    "Схема должна читаться за пять секунд: два въезда, паркинг, кольцевой проезд.\\n" +
    "Число машино-мест по чертежу не считается — подтвердить у заказчика и вписать до показа."
  );
}

/* =========================================================
   16 · КЛЮЧЕВЫЕ ПОКАЗАТЕЛИ
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Показатели", sub: "Ключевые параметры проекта", right: "ТЭП" });

  const gw = 12.23 / 4;
  figure(s, CX, 1.45, gw - 0.3, "1,4", "га", "Площадь участка", { size: 34, lh: 0.5 });
  figure(s, CX + gw, 1.45, gw - 0.3, "5", "этажей", "Плюс подземный этаж", { size: 34, lh: 0.5 });
  figure(s, CX + 2 * gw, 1.45, gw - 0.3, "280 – 300", "", "Номеров", { size: 34, lh: 0.5 });
  figure(s, CX + 3 * gw, 1.45, gw - 0.3, "27 521", "м²", "Общая площадь здания", { size: 34, lh: 0.5 });

  rule(s, CX, 3.0, 12.23, INK);

  const rows = [
    ["Площадь застройки", "4 941,11 м²", "35,3 % участка"],
    ["Площадь 1-го этажа — общественные функции", "4 446,9 м²", "19,7 % надземной площади"],
    ["Площадь номеров, нетто (этажи 2–5)", "12 693,32 м²", "56,2 % надземной площади"],
    ["Коридоры и узлы этажей 2–5 (расчётно)", "5 439,99 м²", "коэффициент 0,70"],
    ["Подземный этаж — паркинг (расчётно)", "4 941,11 м²", "по пятну застройки"],
    ["Надземная часть, всего", "22 580,21 м²", "коэф. использования территории 1,61"],
  ];
  let y = 3.25;
  rows.forEach(([k, v, n], i) => {
    const strong = i === rows.length - 1;
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
    rule(s, CX, y + 0.36, 12.23, strong ? INK : RULE);
    y += 0.52;
  });

  caption(s, CX, 6.6, 12.23, "Строки с пометкой «расчётно» получены расчётом бюро: в исходных ТЭП генплана они не выделены.");

  logo(s);
  pageNo(s);
  s.addNotes(
    "ТЭП сознательно стоят здесь, а не в начале: сначала история, потом цифры.\\n" +
    "Готовность к вопросу: 27 521,32 = 22 580,21 надземной + 4 941,11 подземного этажа."
  );
}

/* =========================================================
   17 · ЧТО ПОЛУЧАЕТ АЛМАТЫ
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: INK };
  s.addText("ЧТО ПОЛУЧАЕТ АЛМАТЫ", {
    x: EDGE, y: 0.18, w: 8, h: 0.24, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 9.5, bold: true, color: WHITE, charSpacing: 0.6, valign: "middle",
  });

  const gw = 12.23 / 4;
  const stats = [
    ["280 – 300", "", "Номеров категории 4 звезды"],
    ["170 – 210", "", "Постоянных рабочих мест"],
    ["27 521", "м²", "Новых площадей"],
    ["4 446,9", "м²", "Общественных функций"],
  ];
  stats.forEach(([v, u, l], i) => {
    const x = CX + i * gw;
    s.addText([
      { text: v, options: { fontFace: F, fontSize: 34, bold: true, color: WHITE } },
      { text: u ? " " + u : "", options: { fontFace: F, fontSize: 14, bold: true, color: ORANGE } },
    ], { x, y: 1.5, w: gw - 0.3, h: 0.6, isTextBox: true, margin: 0, valign: "middle" });
    s.addText(l.toUpperCase(), {
      x, y: 2.14, w: gw - 0.3, h: 0.6, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 9, color: "A9A9A5", charSpacing: 0.4, lineSpacing: 12, valign: "top",
    });
  });

  rule(s, CX, 3.15, 12.23, "3A3A38");

  dashes(s, CX, 3.5, 5.9, 2.6, [
    "Пустующий участок в деловом поясе получает капитальную функцию без сноса и расселения.",
    "Ресторан и конференц-зона первого этажа работают на город, а не только на постояльцев.",
    "Круглогодичная загрузка: деловой сегмент зимой, горный и событийный туризм летом.",
  ], { size: 11.5, color: "D8D8D4" });

  s.addText("Проект не перекрывает панораму хребта: пять этажей вместо вертикальной доминанты.", {
    x: 7.0, y: 3.5, w: 5.8, h: 1.2, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 15, color: WHITE, lineSpacing: 22, valign: "top",
  });
  s.addText("Две трети участка — 9 058,89 м² — остаются открытой территорией.", {
    x: 7.0, y: 4.9, w: 5.8, h: 1.0, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 15, color: WHITE, lineSpacing: 22, valign: "top",
  });

  caption(s, CX, 6.5, 12.23, "Ёмкость номерного фонда и численность персонала указаны оценочно и уточняются после утверждения планировочных решений.");

  s.addImage({ path: A("logo_most.png"), x: 12.42, y: 6.48, w: 0.69, h: 0.77 });
  page += 1;
  s.addText(String(page).padStart(2, "0"), {
    x: EDGE, y: 7.06, w: 1, h: 0.22, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 8, color: "6A6A66", valign: "middle",
  });
  s.addNotes(
    "Финальный содержательный слайд. Здесь бить цифрами.\\n" +
    "170–210 рабочих мест — расчёт от 0,6–0,7 сотрудника на номер при 280–300 номерах. Это оценка, не факт."
  );
}

/* =========================================================
   18 · РЕАЛИЗАЦИЯ И ИНВЕСТИЦИИ
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Реализация", sub: "Инвестиции и сроки", right: "Экономика" });

  blockTitle(s, CX, 1.3, 6.0, "Показатели, которые вносит заказчик", 14);
  body(s, CX, 1.8, 6.0, 0.8,
    "Проект на стадии концепции. Экономические параметры подтверждаются инвестором и вносятся до показа.",
    { size: 11.5 });

  const fields = [
    "Объём инвестиций, млрд ₸",
    "Налоговые поступления в год",
    "Рабочие места на период строительства",
    "Гостиничный оператор",
    "Начало строительства",
    "Ввод в эксплуатацию",
  ];
  let y = 3.0;
  fields.forEach((tt) => {
    s.addText(tt, {
      x: CX, y, w: 7.0, h: 0.3, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 12, color: TXT, valign: "middle",
    });
    s.addText("________________________", {
      x: 7.8, y, w: 5.0, h: 0.3, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 12, color: ORANGE, align: "right", valign: "middle",
    });
    rule(s, CX, y + 0.38, 12.23);
    y += 0.58;
  });

  logo(s);
  pageNo(s);
  s.addNotes(
    "Если данных нет — слайд лучше удалить, чем показывать пустым.\\n" +
    "Для акимата эти цифры часто важнее половины архитектурной части."
  );
}

/* =========================================================
   19 · СООТВЕТСТВИЕ НОРМАМ
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
    "Отступы от границ: 6,00 м с запада и юга, 3,00 м с северо-востока, 17,49 м с востока.",
    "Этажность 5 этажей по обоим корпусам, без превышения отметок соседней застройки.",
    "Замкнутый кольцевой пожарный проезд вокруг пятна застройки.",
    "Плотность застройки 35,3 %, коэффициент использования территории 1,61.",
    "Рядовая посадка деревьев по всему периметру участка.",
  ], { size: 10.5, lead: 14, gap: 9 });

  blockTitle(s, x2, 1.3, colW, "Уточняется на стадии ЭП и ПСД", 12);
  rule(s, x2, 1.68, colW, INK);
  dashes(s, x2, 1.92, colW, 4.4, [
    "Санитарно-защитная зона действующей АЗС: подтвердить тип станции и установленный размер СЗЗ. На генплане прочерчена зона 50 м.",
    "Расчёт машино-мест по нормативу для гостиниц от утверждённой ёмкости номерного фонда.",
    "Баланс территории раздельно: озеленение, покрытия, проезды, площадки.",
    "Технические условия на воду, канализацию, тепло и электроснабжение.",
    "Расчёты инсоляции и шума по отношению к смежным землепользованиям.",
  ], { size: 10.5, lead: 14, gap: 9 });

  logo(s);
  pageNo(s);
  s.addNotes(
    "Технический слайд, вынесен в приложение, чтобы не тормозить историю.\\n" +
    "Показывать по запросу или оставить в раздатке."
  );
}

/* =========================================================
   20 · КОНТАКТЫ
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

pres.writeFile({ fileName: path.join(__dirname, "MOST_Bukhtarminskaya_akimat.pptx") })
  .then((f) => console.log("Готово:", f));
