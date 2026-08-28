const pptxgen = require("pptxgenjs");
const path = require("path");

const A = (f) => path.join(__dirname, "assets", f);

/* ================= фирменный стиль MOST =================
   Взят из презентации BI/DCT Dream City и most-site:
   белый лист, оранжевый FF4D23, Helvetica/Arial,
   мелкие прописные подписи по углам, логотип M справа внизу.
   ========================================================= */
const ORANGE = "FF4D23";
const INK = "111111";
const TXT = "333333";
const GREY = "8A8A8A";
const RULE = "DCDCDC";
const WHITE = "FFFFFF";
const F = "Arial";

const W = 13.333, H = 7.5;
const EDGE = 0.24;                 // поле угловых подписей
const CX = 0.55;                   // левая текстовая колонка
const CW = 4.15;
const IX = 5.15;                   // правая колонка (изображение)
const IW = 7.6;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "MOST Architects";
pres.company = "MOST Architects";
pres.title = "Гостиничный комплекс — г. Алматы, ул. Бухтарминская";

let page = 1;

/* ---------------- элементы фирменного стиля ---------------- */

function logo(slide) {
  slide.addImage({ path: A("logo_most.png"), x: 12.42, y: 6.48, w: 0.69, h: 0.77 });
}

// Подписи по углам: слева — раздел, справа оранжевым — тип материала
function labels(slide, o) {
  const c = o.color || INK;
  if (o.left) {
    slide.addText(o.left.toUpperCase(), {
      x: EDGE, y: 0.18, w: 7, h: 0.24, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 9.5, bold: true, color: c, charSpacing: 0.6, valign: "middle",
    });
  }
  if (o.sub) {
    slide.addText(o.sub, {
      x: EDGE, y: 0.41, w: 7, h: 0.22, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 9, color: o.subColor || c, valign: "middle",
    });
  }
  if (o.right) {
    slide.addText(o.right.toUpperCase(), {
      x: W - EDGE - 7, y: 0.18, w: 7, h: 0.24, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 9.5, color: ORANGE, charSpacing: 0.6,
      align: "right", valign: "middle",
    });
  }
  if (o.right2) {
    slide.addText(o.right2, {
      x: W - EDGE - 7, y: 0.41, w: 7, h: 0.22, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 9, color: c, align: "right", valign: "middle",
    });
  }
}

function pageNo(slide, color) {
  page += 1;
  slide.addText(String(page).padStart(2, "0"), {
    x: EDGE, y: 7.06, w: 1, h: 0.22, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 8, color: color || GREY, valign: "middle",
  });
}

// Заголовок текстового блока — оранжевый, прописными
function blockTitle(slide, x, y, w, text, size) {
  slide.addText(text.toUpperCase(), {
    x, y, w, h: 0.28, isTextBox: true, margin: 0,
    fontFace: F, fontSize: size || 13, bold: true, color: ORANGE,
    charSpacing: 0.3, valign: "middle",
  });
}

function subTitle(slide, x, y, w, text) {
  slide.addText(text.toUpperCase(), {
    x, y, w, h: 0.22, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 8.5, color: ORANGE, charSpacing: 0.3, valign: "middle",
  });
}

// Абзацы с оранжевым тире — основной приём набора в референсе
function dashes(slide, x, y, w, h, items, opts) {
  const o = opts || {};
  const runs = [];
  items.forEach((t, i) => {
    runs.push({ text: "– ", options: { fontFace: F, fontSize: o.size || 10.5, color: ORANGE } });
    runs.push({
      text: t,
      options: {
        fontFace: F, fontSize: o.size || 10.5, color: o.color || TXT,
        breakLine: i < items.length - 1,
      },
    });
  });
  slide.addText(runs, {
    x, y, w, h, isTextBox: true, margin: 0, valign: "top",
    lineSpacing: o.lead || 15, paraSpaceAfter: o.gap === undefined ? 9 : o.gap,
  });
}

function body(slide, x, y, w, h, text, opts) {
  const o = opts || {};
  slide.addText(text, {
    x, y, w, h, isTextBox: true, margin: 0,
    fontFace: F, fontSize: o.size || 10.5, color: o.color || TXT,
    lineSpacing: o.lead || 15, valign: "top",
  });
}

// Числовой показатель: крупное число + мелкая подпись прописными
function figure(slide, x, y, w, value, unit, label, opts) {
  const o = opts || {};
  slide.addText(
    [
      { text: value, options: { fontFace: F, fontSize: o.size || 26, bold: true, color: o.color || INK } },
      { text: unit ? " " + unit : "", options: { fontFace: F, fontSize: 11, bold: true, color: ORANGE } },
    ],
    { x, y, w, h: 0.44, isTextBox: true, margin: 0, valign: "middle" }
  );
  slide.addText(label.toUpperCase(), {
    x, y: y + 0.46, w, h: o.lh || 0.42, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 8, color: GREY, charSpacing: 0.3, lineSpacing: 11, valign: "top",
  });
}

function rule(slide, x, y, w, color) {
  slide.addShape(pres.ShapeType.rect, {
    x, y, w, h: 0.008, fill: { color: color || RULE }, line: { color: color || RULE, width: 0 },
  });
}

// Капсула-тег с обводкой — с титульного листа референса
function pill(slide, x, y, w, text, active) {
  const c = active ? ORANGE : INK;
  slide.addShape(pres.ShapeType.roundRect, {
    x, y, w, h: 0.34, rectRadius: 0.06,
    fill: { color: WHITE }, line: { color: active ? ORANGE : "444444", width: 0.75 },
  });
  slide.addText(text, {
    x, y, w, h: 0.34, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 9.5, color: c, align: "center", valign: "middle",
  });
}

// Полосный слайд с визуализацией
function plate(slide, img) {
  slide.addImage({ path: img, x: 0, y: 0, w: W, h: H, sizing: { type: "cover", w: W, h: H } });
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
  stages.forEach(([t, act]) => {
    pill(s, px, 6.42, pw, t, act);
    px += pw + pg;
  });

  s.addNotes(
    "Титул. Стадия — concept (отмечена на нижней шкале).\n" +
    "Объект: гостиничный комплекс 4 звезды, ул. Бухтарминская, участок 1,4 га, " +
    "два корпуса по 5 этажей, общая площадь 17 140,22 м²."
  );
}

/* =========================================================
   02 · АНАЛИЗ — расположение
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Анализ", sub: "Расположение и градостроительный контекст", right: "Ситуационная схема" });

  s.addImage({ path: A("genplan_context.jpg"), x: 0.55, y: 0.95, w: 6.62, h: 6.2 });

  const tx = 7.55, tw = W - 7.55 - 0.62;
  body(s, tx, 0.98, tw, 1.1,
    "Участок расположен вдоль ул. Бухтарминской и имеет форму вытянутого треугольника. " +
    "С северо-востока он выходит на улицу, с запада и юга ограничен внутриквартальными проездами.");

  rule(s, tx, 2.25, tw);
  dashes(s, tx, 2.45, tw, 2.5, [
    "Территория свободна от капитальной застройки — снос и расселение не требуются.",
    "Окружение деловое и производственное: АЗС, склады, коммерческие объекты. Жилая застройка не примыкает вплотную.",
    "Участок обслуживается по всему периметру существующими проездами — новых транзитных связей не требуется.",
    "Прямой выход на ул. Бухтарминскую обеспечивает подъезд гостей и транспорта обслуживания.",
  ]);

  rule(s, tx, 5.15, tw);
  figure(s, tx, 5.35, tw, "1,4", "га", "Площадь земельного участка");

  logo(s);
  pageNo(s);
  s.addNotes(
    "Красным на схеме — границы смежных землепользований, синим — граница участка.\n" +
    "Район города и кадастровый номер — данные заказчика, вписать до показа."
  );
}

/* =========================================================
   03 · ГЕНПЛАН
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Генеральный план", sub: "Посадка комплекса на участок", right: "Генплан" });

  s.addImage({ path: A("genplan_site.jpg"), x: 0.55, y: 1.2, w: 6.62, h: 5.7 });

  const tx = 7.55, tw = W - 7.55 - 0.62;
  body(s, tx, 0.98, tw, 0.95,
    "Два корпуса поставлены вдоль длинных сторон участка и раскрыты во двор. " +
    "По периметру застройки — кольцевой проезд, между проездом и границей полоса озеленения.");

  rule(s, tx, 2.1, tw);
  subTitle(s, tx, 2.24, tw, "Отступы застройки от границ участка");
  const offs = [["6,00", "запад"], ["3,00", "северо-восток"], ["17,49", "восток"], ["6,00", "юг"]];
  const ow = tw / 4;
  offs.forEach(([v, l], i) => {
    s.addText(
      [
        { text: v, options: { fontFace: F, fontSize: 17, bold: true, color: INK } },
        { text: " м", options: { fontFace: F, fontSize: 9, bold: true, color: ORANGE } },
      ],
      { x: tx + i * ow, y: 2.54, w: ow, h: 0.34, isTextBox: true, margin: 0, valign: "middle" }
    );
    s.addText(l.toUpperCase(), {
      x: tx + i * ow, y: 2.9, w: ow, h: 0.34, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 7.5, color: GREY, charSpacing: 0.2, lineSpacing: 10, valign: "top",
    });
  });

  rule(s, tx, 3.4, tw);
  dashes(s, tx, 3.6, tw, 2.5, [
    "Кольцевой проезд замкнут вокруг обоих корпусов: подъезд ко всем входам и разворот пожарной техники.",
    "Единый узел въезда организован в западной части участка, со стороны внутриквартального проезда.",
    "Рядовая посадка деревьев по всему периметру формирует буфер между застройкой и границами участка.",
    "Внутренний двор между корпусами защищён от улицы.",
  ]);

  logo(s);
  pageNo(s);
  s.addNotes(
    "Отступы 6,00 / 3,00 / 17,49 / 6,00 м вынесены на чертёж генплана.\n" +
    "Типовой вопрос — пожарный проезд: контур замкнут вокруг пятна застройки."
  );
}

/* =========================================================
   04 · ТЭП
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Показатели", sub: "Технико-экономические показатели", right: "ТЭП" });

  blockTitle(s, CX, 1.05, CW, "Общие ТЭП");
  body(s, CX, 1.45, CW, 1.5,
    "Показатели приведены по проекту генерального плана. " +
    "Расчётные коэффициенты получены из них арифметически.", { size: 10 });

  rule(s, CX, 2.35, CW);
  dashes(s, CX, 2.55, CW, 2.6, [
    "Застроено 35,3 % участка — 4 941,11 м² из 14 000 м².",
    "Коэффициент использования территории 1,22 — 17 140,22 м² на 14 000 м².",
    "Вне пятна застройки 9 058,89 м², или 64,7 % участка.",
    "Номерной фонд занимает 74,1 % общей площади здания.",
  ], { size: 10, lead: 14 });

  const rows = [
    ["Площадь земельного участка", "1,4 га (14 000 м²)", false],
    ["Площадь застройки", "4 941,11 м²", false],
    ["Площадь 1-го этажа", "4 446,9 м²", false],
    ["Площадь номерного фонда (этажи 2–5)", "12 693,32 м²", false],
    ["Общая площадь здания", "17 140,22 м²", true],
    ["Этажность", "5 этажей, два корпуса", true],
  ];
  const cell = (t, o) => ({
    text: t,
    options: Object.assign(
      { fontFace: F, fontSize: 11, color: TXT, valign: "middle", margin: [10, 0, 10, 0],
        border: [{ type: "none" }, { type: "none" }, { type: "solid", color: RULE, pt: 0.5 }, { type: "none" }] },
      o || {}
    ),
  });

  const tbl = [[
    cell("Показатель", { fontSize: 8.5, bold: true, color: ORANGE, charSpacing: 0.3,
      border: [{ type: "none" }, { type: "none" }, { type: "solid", color: INK, pt: 1 }, { type: "none" }] }),
    cell("Значение", { fontSize: 8.5, bold: true, color: ORANGE, charSpacing: 0.3, align: "right",
      border: [{ type: "none" }, { type: "none" }, { type: "solid", color: INK, pt: 1 }, { type: "none" }] }),
  ]];
  rows.forEach(([k, v, strong]) => {
    tbl.push([
      cell(k, { color: strong ? INK : TXT, bold: !!strong }),
      cell(v, { align: "right", bold: true, color: INK }),
    ]);
  });
  s.addTable(tbl, { x: IX, y: 1.05, w: IW, colW: [4.6, 3.0], rowH: 0.5 });

  s.addText("Источник: общие ТЭП генерального плана", {
    x: IX, y: 4.85, w: IW, h: 0.24, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 8, color: GREY, valign: "middle",
  });

  const fw = IW / 3;
  figure(s, IX, 5.5, fw - 0.2, "35,3", "%", "Коэффициент застройки");
  figure(s, IX + fw, 5.5, fw - 0.2, "1,22", "", "Коэффициент использования территории");
  figure(s, IX + 2 * fw, 5.5, fw - 0.2, "64,7", "%", "Свободно от застройки");

  logo(s);
  pageNo(s);
  s.addNotes(
    "Все значения таблицы — из ТЭП генплана, без пересчёта.\n" +
    "Коэффициенты: 4941,11/14000 = 35,3 %; 17140,22/14000 = 1,22; 14000−4941,11 = 9 058,89 м² = 64,7 %."
  );
}

/* =========================================================
   05–07 · ВИЗУАЛИЗАЦИИ
   ========================================================= */
[
  ["facade.jpg", "Главный фасад", "Въездная группа со стороны ул. Бухтарминской", INK, WHITE,
   "Комплекс со стороны главного входа: круговой подъезд, входной портик, два корпуса по 5 этажей."],
  ["lobby.jpg", "Входная группа", "Лобби и зона приёма", WHITE, WHITE,
   "Вестибюль двойной высоты с раскрытием на панораму хребта."],
  ["room.jpg", "Номерной фонд", "Номер с балконом верхнего яруса", WHITE, INK,
   "Каждый номер раскрыт на панораму города и Заилийского Алатау, с собственным балконом на озеленённой ленте фасада."],
  ["terrace.jpg", "Общественные пространства", "Терраса верхнего яруса", INK, WHITE,
   "Озеленённые террасы на лентах балконов, раскрытие на город и горы."],
].forEach(([img, left, sub, lc, pc, note]) => {
  const s = pres.addSlide();
  plate(s, A(img));
  labels(s, { left, sub, right: "Визуализации", color: lc });
  logo(s);
  pageNo(s, pc);
  s.addNotes(note);
});

/* =========================================================
   08 · АРХИТЕКТУРНОЕ РЕШЕНИЕ
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Архитектура", sub: "Объёмно-пространственное решение", right: "Концепция" });

  blockTitle(s, CX, 1.05, CW, "Горизонталь вместо высоты");
  body(s, CX, 1.45, CW, 2.2,
    "Объём набран горизонтальными лентами перекрытий с плавными скруглениями. " +
    "Пять этажей вместо башни: комплекс не спорит с панорамой гор и не перекрывает виды соседней застройки. " +
    "Ленты балконов и террас озеленены по всей длине — зелень становится частью фасада, а не только партера.");

  rule(s, CX, 2.9, CW);
  dashes(s, CX, 3.1, CW, 2.6, [
    "Сомасштабность: 5 этажей — в габаритах окружающей застройки, без доминанты.",
    "Озеленённые террасы на каждом ярусе балконов по всей длине фасада.",
    "Раскрытие на горы: номера и общественные террасы ориентированы на панораму.",
    "Входная группа выделена высоким портиком с круговым подъездом.",
  ]);

  s.addImage({ path: A("facade.jpg"), x: IX, y: 1.05, w: IW, h: 4.28 });
  figure(s, IX, 5.75, 2.4, "5", "этажей", "Этажность обоих корпусов");
  figure(s, IX + 2.6, 5.75, 4.9, "17 140,22", "м²", "Общая площадь здания");

  logo(s);
  pageNo(s);
  s.addNotes(
    "Главный аргумент для градсовета: сознательный отказ от высотности. " +
    "При 1,4 га можно было поставить башню — вместо этого пять этажей и раскрытие видов."
  );
}

/* =========================================================
   09 · ФУНКЦИОНАЛЬНОЕ ЗОНИРОВАНИЕ
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Функция", sub: "Функциональное зонирование", right: "Первый этаж" });

  blockTitle(s, CX, 1.05, CW, "Первый этаж — общественный");
  body(s, CX, 1.45, CW, 1.2,
    "4 446,9 м² первого этажа — четверть всей площади комплекса — отданы функциям, " +
    "которыми пользуются не только постояльцы.");

  rule(s, CX, 2.75, CW);
  dashes(s, CX, 2.95, CW, 3.0, [
    "Лобби и стойка приёма: круговой подъезд, зона высадки, вестибюль двойной высоты.",
    "Рестораны и кафе — работают на город, а не только на гостей гостиницы.",
    "Конференц-зона для деловых мероприятий и городских событий.",
    "Оздоровительный блок: СПА и фитнес. Состав уточняется на стадии эскизного проекта.",
  ]);

  s.addImage({ path: A("lobby.jpg"), x: IX, y: 1.05, w: IW, h: 4.28 });
  figure(s, IX, 5.75, 3.6, "4 446,9", "м²", "Площадь первого этажа");
  figure(s, IX + 3.8, 5.75, 3.7, "26", "%", "Доля первого этажа в общей площади");

  logo(s);
  pageNo(s);
  s.addNotes(
    "4 446,9 м² — из ТЭП. 4446,9/17140,22 = 25,9 % ≈ 26 %.\n" +
    "Набор общественных функций — предложение бюро; окончательный состав за заказчиком и оператором."
  );
}

/* =========================================================
   10 · НОМЕРНОЙ ФОНД
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Номерной фонд", sub: "Этажи со 2-го по 5-й", right: "Ёмкость" });

  blockTitle(s, CX, 1.05, CW, "Номерной фонд");
  body(s, CX, 1.45, CW, 1.0,
    "Этажи со 2-го по 5-й полностью отданы номерам: 12 693,32 м², или 74,1 % общей площади здания.");

  rule(s, CX, 2.6, CW);
  figure(s, CX, 2.8, CW, "12 693,32", "м²", "Площадь номерного фонда");
  figure(s, CX, 3.9, CW, "≈ 3 173", "м²", "Средняя площадь этажа номерного корпуса");

  rule(s, CX, 5.0, CW);
  subTitle(s, CX, 5.14, CW, "Ёмкость — предварительная оценка");
  s.addText(
    [
      { text: "260 – 300", options: { fontFace: F, fontSize: 26, bold: true, color: ORANGE } },
      { text: "  номеров", options: { fontFace: F, fontSize: 11, bold: true, color: INK } },
    ],
    { x: CX, y: 5.42, w: CW, h: 0.44, isTextBox: true, margin: 0, valign: "middle" }
  );
  body(s, CX, 5.92, CW, 0.9,
    "Расчёт от 12 693,32 м² при полезной площади этажа около 65 % и номере 28–32 м². " +
    "Точная ёмкость определяется планировками на стадии эскизного проекта.",
    { size: 9, lead: 12, color: GREY });

  s.addImage({ path: A("room.jpg"), x: IX, y: 1.05, w: IW, h: 5.07 });
  s.addText("Типовой номер: балкон на озеленённой ленте фасада, раскрытие на город и хребет.", {
    x: IX, y: 6.2, w: IW, h: 0.24, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 8, color: GREY, valign: "middle",
  });

  logo(s);
  pageNo(s);
  s.addNotes(
    "ВАЖНО: 260–300 номеров — оценка бюро, а не утверждённая цифра. Так и формулировать.\n" +
    "База: 12 693,32 м² × 0,65 ≈ 8 250 м² полезной площади; ÷ 28–32 м² на номер. " +
    "12 693,32 / 17 140,22 = 74,1 %; 12 693,32 / 4 этажа = 3 173,3 м²."
  );
}

/* =========================================================
   11 · БЛАГОУСТРОЙСТВО
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Благоустройство", sub: "Озеленение и открытые пространства", right: "Фрагмент генплана" });

  blockTitle(s, CX, 1.05, CW, "Две трети участка открыты");
  body(s, CX, 1.45, CW, 1.0,
    "Вне пятна застройки остаётся 9 058,89 м² — 64,7 % участка. Это площадь под проезды, " +
    "площадки и озеленение.");

  rule(s, CX, 2.6, CW);
  figure(s, CX, 2.8, CW, "9 058,89", "м²", "Территория вне пятна застройки — 64,7 %");

  rule(s, CX, 3.9, CW);
  dashes(s, CX, 4.1, CW, 2.6, [
    "Рядовая посадка деревьев по всему периметру: зелёная полоса отделяет застройку от границ участка и улицы.",
    "Внутренний двор между корпусами — защищённое от улицы пространство отдыха.",
    "Озеленение на террасах продолжает партер вверх по фасаду.",
  ]);

  s.addImage({ path: A("green.jpg"), x: IX, y: 1.05, w: IW, h: 5.07 });
  s.addText("Фрагмент генплана: полоса озеленения между проездом и границей участка.", {
    x: IX, y: 6.2, w: IW, h: 0.24, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 8, color: GREY, valign: "middle",
  });

  logo(s);
  pageNo(s);
  s.addNotes(
    "9 058,89 м² = 14 000 − 4 941,11. Это территория вне пятна застройки, включая проезды.\n" +
    "Отдельную долю озеленения не называть — баланс территории даётся на стадии ЭП."
  );
}

/* =========================================================
   12 · ТРАНСПОРТ
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Транспорт", sub: "Въезды, проезды и хранение автомобилей", right: "Узел въезда" });

  blockTitle(s, CX, 1.05, CW, "Обслуживание участка");
  dashes(s, CX, 1.5, CW, 3.0, [
    "Единый узел въезда в западной части участка, со стороны внутриквартального проезда, а не напрямую с ул. Бухтарминской — уличный поток не разрывается.",
    "Кольцевой проезд вокруг застройки: подъезд ко всем входам, разгрузка и проезд пожарной техники.",
    "Круговой подъезд к главному входу отделён от хозяйственного двора.",
  ]);

  rule(s, CX, 4.6, CW);
  subTitle(s, CX, 4.74, CW, "Машино-места");
  body(s, CX, 5.02, CW, 0.85,
    "Количество и тип парковки определяются расчётом по нормативу к утверждённой ёмкости " +
    "номерного фонда на стадии эскизного проекта.", { size: 10, lead: 14 });
  s.addShape(pres.ShapeType.roundRect, {
    x: CX, y: 5.95, w: 2.7, h: 0.34, rectRadius: 0.06,
    fill: { color: WHITE }, line: { color: ORANGE, width: 0.75 },
  });
  s.addText("вписать: ____ машино-мест", {
    x: CX, y: 5.95, w: 2.7, h: 0.34, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 9, italic: true, color: ORANGE, align: "center", valign: "middle",
  });

  s.addImage({ path: A("entrance.jpg"), x: IX, y: 1.05, w: IW, h: 5.07 });
  s.addText("Фрагмент генплана: узел въезда в западной части участка.", {
    x: IX, y: 6.2, w: IW, h: 0.24, isTextBox: true, margin: 0,
    fontFace: F, fontSize: 8, color: GREY, valign: "middle",
  });

  logo(s);
  pageNo(s);
  s.addNotes(
    "ОСТОРОЖНО: на генплане парковочные места не размечены — видна только рампа въезда с запада. " +
    "Не утверждать наличие подземного паркинга, пока это не подтверждено заказчиком.\n" +
    "Число машино-мест вписать до показа — это первый вопрос акимата."
  );
}

/* =========================================================
   13 · НОРМЫ И РЕГЛАМЕНТЫ
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Регламенты", sub: "Статус проработки", right: "Нормы" });

  const colW = 5.9, gap = 0.95;
  const x1 = CX, x2 = CX + colW + gap;

  blockTitle(s, x1, 1.15, colW, "Подтверждено генпланом", 12);
  rule(s, x1, 1.55, colW, INK);
  dashes(s, x1, 1.78, colW, 4.6, [
    "Отступы от границ участка: 6,00 м с запада и юга, 3,00 м с северо-востока, 17,49 м с востока — вынесены на чертёж.",
    "Этажность: 5 этажей по обоим корпусам, без превышения высотных отметок соседней застройки.",
    "Пожарный проезд: замкнутый кольцевой проезд вокруг пятна застройки.",
    "Плотность застройки: 35,3 % участка, коэффициент использования территории 1,22.",
    "Озеленение: рядовая посадка деревьев по всему периметру участка.",
  ], { gap: 11 });

  blockTitle(s, x2, 1.15, colW, "Уточняется на стадии ЭП и ПСД", 12);
  rule(s, x2, 1.55, colW, INK);
  dashes(s, x2, 1.78, colW, 4.6, [
    "Расчёт машино-мест по нормативу для гостиниц, от утверждённой ёмкости номерного фонда.",
    "Баланс территории раздельно: озеленение, покрытия, проезды, площадки.",
    "Инженерное обеспечение: технические условия на воду, канализацию, тепло и электроснабжение.",
    "Расчёты инсоляции и шума по отношению к смежным землепользованиям.",
    "Планировочные решения этажей и итоговая ёмкость номерного фонда.",
  ], { gap: 11 });

  rule(s, CX, 5.35, 12.23);
  subTitle(s, CX, 5.5, 6, "Показатели, проверяемые градостроительным советом");
  const gw = 12.23 / 4;
  figure(s, CX, 5.85, gw - 0.3, "5", "этажей", "Этажность обоих корпусов", { size: 22 });
  figure(s, CX + gw, 5.85, gw - 0.3, "35,3", "%", "Коэффициент застройки", { size: 22 });
  figure(s, CX + 2 * gw, 5.85, gw - 0.3, "1,22", "", "Коэффициент использования территории", { size: 22 });
  figure(s, CX + 3 * gw, 5.85, gw - 0.3, "64,7", "%", "Свободно от застройки", { size: 22 });

  logo(s);
  pageNo(s);
  s.addNotes(
    "Левая колонка — только то, что читается с генплана, ничего не приписано.\n" +
    "Правая — честный перечень открытых вопросов. Для градсовета это сильнее, " +
    "чем заявление о полном соответствии всем нормам."
  );
}

/* =========================================================
   14 · ЭФФЕКТ ДЛЯ ГОРОДА
   ========================================================= */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  labels(s, { left: "Эффект", sub: "Социально-экономический эффект", right: "Для города" });

  const fw = 4.0;
  figure(s, CX, 1.15, fw - 0.3, "260 – 300", "", "Номеров 4 звезды к фонду Алматы (оценка)", { size: 24, lh: 0.5 });
  figure(s, CX + fw, 1.15, fw - 0.3, "160 – 210", "", "Постоянных рабочих мест в гостинице (оценка)", { size: 24, lh: 0.5 });
  figure(s, CX + 2 * fw, 1.15, fw - 0.3, "17 140", "м²", "Ввод новых площадей в налогооблагаемую базу", { size: 24, lh: 0.5 });

  rule(s, CX, 2.5, 12.23);

  dashes(s, CX, 2.78, 6.1, 3.4, [
    "Загрузка ранее неиспользуемого участка: свободная территория в деловом окружении получает капитальную функцию без сноса и расселения.",
    "Круглогодичный турпоток: деловой сегмент зимой и осенью, горный и событийный туризм летом.",
    "Общественные функции для района: рестораны и конференц-зона первого этажа работают на город, а не только на постояльцев.",
    "4 446,9 м² общественного первого этажа — новая точка притяжения в квартале, доступная не только постояльцам.",
  ], { size: 11, lead: 16, gap: 13 });

  const bx = 7.4, bw = W - 7.4 - 0.62;
  subTitle(s, bx, 2.78, bw, "Показатели, которые вносит заказчик");
  const fields = [
    "Объём инвестиций, млрд ₸",
    "Налоговые поступления в год",
    "Рабочие места на период строительства",
    "Гостиничный оператор",
    "Планируемый срок ввода в эксплуатацию",
  ];
  fields.forEach((t, i) => {
    const y = 3.18 + i * 0.56;
    s.addText(t, {
      x: bx, y, w: bw * 0.62, h: 0.3, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 10, color: TXT, valign: "middle",
    });
    s.addText("____________", {
      x: bx + bw * 0.62, y, w: bw * 0.38, h: 0.3, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 10, color: ORANGE, align: "right", valign: "middle",
    });
    rule(s, bx, y + 0.34, bw);
  });

  s.addText(
    "Ёмкость номерного фонда и численность персонала указаны оценочно и подлежат уточнению " +
    "после утверждения планировочных решений.",
    { x: CX, y: 6.45, w: 12.23, h: 0.4, isTextBox: true, margin: 0,
      fontFace: F, fontSize: 8.5, italic: true, color: GREY, lineSpacing: 11, valign: "top" }
  );

  logo(s);
  pageNo(s);
  s.addNotes(
    "ВНИМАНИЕ: 160–210 рабочих мест — расчёт от отраслевого ориентира 0,6–0,7 сотрудника на номер " +
    "для гостиниц 4 звезды, применённого к оценке 260–300 номеров. Это оценка, не факт.\n" +
    "Четыре поля справа обязательно заполнить данными заказчика до показа."
  );
}

/* =========================================================
   16 · КОНТАКТЫ  (по шаблону последнего листа MOST: QR + контакты)
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
    "Контактный лист. QR ведёт на most-a.com.\n" +
    "Устно на этом слайде — три запроса к акимату: одобрить архитектурно-градостроительную " +
    "концепцию, выдать АПЗ для перехода к эскизному проекту, определить технические условия " +
    "на подключение к инженерным сетям."
  );
}

pres.writeFile({ fileName: path.join(__dirname, "MOST_Bukhtarminskaya_akimat.pptx") })
  .then((f) => console.log("Готово:", f));
