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
  s.addText("презентация для акимата г. Алматы\nавгуст 2026", {
    x: W - 1.07 - 4, y: 3.85, w: 4, h: 0.6, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 8.5, color: INK, lineSpacing: 11, align: "right", valign: "top",
  });

  const stages = [["concept", true], ["masterplan", false], ["project", false], ["detail plan", false]];
  const pw = 1.32, pg = 0.26;
  const totalW = stages.length * pw + (stages.length - 1) * pg;
  let px = (W - totalW) / 2;
  stages.forEach(([t, act]) => { pill(s, px, 6.42, pw, t, act); px += pw + pg; });

  s.addNotes("Титул. Стадия — concept. Объект: гостиничный комплекс, ул. Бухтарминская, участок 1,4 га.");
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
   ВИЗУАЛИЗАЦИИ — по одной на слайд
   ========================================================= */
[
  // кадр, подпись, цвет подписей слева, цвет ярлыка справа, цвет номера — по замеру контраста
  ["facade.jpg",      "Главный фасад",        INK,   INK,   WHITE],
  ["lobby.jpg",       "Лобби",                WHITE, WHITE, WHITE],
  ["lobby_grand.jpg", "Лобби-лаунж",          WHITE, INK,   WHITE],
  ["restaurant.jpg",  "Ресторан",             WHITE, INK,   WHITE],
  ["conference.jpg",  "Конференц-зал",        WHITE, WHITE, WHITE],
  ["boardroom.jpg",   "Переговорная",         WHITE, INK,   WHITE],
  ["coworking.jpg",   "Коворкинг",            WHITE, WHITE, WHITE],
  ["gym.jpg",         "Фитнес",               WHITE, ORANGE, WHITE],
  ["room.jpg",        "Номер",                WHITE, WHITE, WHITE],
  ["terrace.jpg",     "Общественная терраса", WHITE, WHITE, WHITE],
  ["night.jpg",       "Вечерний вид",         WHITE, ORANGE, WHITE],
].forEach(([img, lab, lc, rc, pc]) => {
  const s = pres.addSlide();
  plate(s, A(img));
  labels(s, { left: lab, right: "Визуализация", color: lc, rightColor: rc });
  logo(s);
  pageNo(s, pc);
  s.addNotes(lab + ". Один кадр — одна мысль, комментировать коротко.");
});

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
    [0.345, 0.630, 3],
  ];
  pts.forEach(([fx, fy, n]) => marker(s, px + fx * pW, py + fy * pH, n));

  const tx = 8.85, tw = W - 8.85 - 0.62;
  const legend = [
    ["Наземные гостевые места", "Ряд вдоль западной кромки, со стороны улицы. Гостевой транспорт не заезжает во двор."],
    ["Юго-западный узел", "Въезд с внутриквартального проезда, зона высадки и рампа в подземный паркинг под корпусом."],
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
