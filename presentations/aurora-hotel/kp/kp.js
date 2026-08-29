const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, ShadingType, AlignmentType, BorderStyle, HeadingLevel,
  ImageRun, LevelFormat, convertMillimetersToTwip,
  PositionalTab, PositionalTabAlignment, PositionalTabLeader, PositionalTabRelativeTo,
  HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, TextWrappingType,
} = require("docx");

const ORANGE = "FF4D23";
const INK = "111111";
const TXT = "333333";
const GREY = "8A8A8A";
const RULE = "DCDCDC";
const F = "Arial";

const M = convertMillimetersToTwip(20);        // поля 20 мм
const PAGE_W = convertMillimetersToTwip(210);
const W = PAGE_W - 2 * M;                       // рабочая ширина

/* ---------- значения ---------- */
const AREA = 24803.71;
const RATE_TOTAL = 2000;
const SUM_F = 4276501.72, SUM_C = 17106006.90, SUM_E = 21382508.62;
const NET = 42765017.24, VAT = 6842402.76, GROSS = 49607420.00;
const money = (n) => {
  const [i, f] = n.toFixed(2).split(".");
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + "," + f + " ₸";
};

/* ---------- элементы ---------- */
const t = (text, o = {}) => new TextRun({
  text, font: F, size: o.size || 20, bold: !!o.bold, italics: !!o.italics,
  color: o.color || TXT, characterSpacing: o.cs,
});

const p = (runs, o = {}) => new Paragraph({
  children: Array.isArray(runs) ? runs : [runs],
  alignment: o.align, spacing: { before: o.before || 0, after: o.after === undefined ? 100 : o.after, line: o.line || 260 },
  border: o.border, indent: o.indent,
});

const gap = (h) => new Paragraph({ children: [], spacing: { after: h } });

const h1 = (text) => new Paragraph({
  children: [t(text.toUpperCase(), { size: 26, bold: true, color: INK, cs: 8 })],
  spacing: { before: 0, after: 80 },
});

const h2 = (text) => new Paragraph({
  children: [t(text.toUpperCase(), { size: 19, bold: true, color: ORANGE, cs: 6 })],
  spacing: { before: 240, after: 120 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: INK, space: 6 } },
});

const li = (text, o = {}) => new Paragraph({
  children: [t("— ", { color: ORANGE }), t(text, { color: o.color || TXT })],
  spacing: { after: 55, line: 245 },
  indent: { left: 200, hanging: 200 },
});

const cell = (runs, o = {}) => new TableCell({
  width: { size: o.w, type: WidthType.DXA },
  shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined,
  margins: { top: 90, bottom: 90, left: 120, right: 120 },
  borders: {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.SINGLE, size: o.strong ? 8 : 4, color: o.strong ? INK : RULE },
  },
  children: [new Paragraph({
    children: Array.isArray(runs) ? runs : [runs],
    alignment: o.align, spacing: { after: 0, line: 240 },
  })],
});

const table = (widths, rows) => new Table({
  columnWidths: widths,
  width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
  rows,
});

/* ---------- шапка ---------- */
const logo = fs.readFileSync(path.join(__dirname, "assets", "logo_flat.png"));
const planImg = fs.readFileSync(path.join(__dirname, "assets", "kp_plan.jpg"));
const sealImg = fs.readFileSync(path.join(__dirname, "assets", "seal.png"));
const signImg = fs.readFileSync(path.join(__dirname, "assets", "sign.png"));
const IN = 914400;
const floatImg = (data, w, h, x, y) => new ImageRun({
  data, type: "png", transformation: { width: w, height: h },
  floating: {
    horizontalPosition: { relative: HorizontalPositionRelativeFrom.COLUMN, offset: Math.round(x * IN) },
    verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: Math.round(y * IN) },
    wrap: { type: TextWrappingType.NONE },
    behindDocument: false,
  },
});

const header = [
  new Paragraph({
    children: [
      new ImageRun({ data: logo, type: "png", transformation: { width: 46, height: 51 } }),
      t("    ТОО «MOST Architects»", { size: 17, bold: true, color: INK, cs: 8 }),
    ],
    spacing: { after: 60 },
  }),
  new Paragraph({
    children: [t("г. Алматы, ул. Утеген батыра 11в к6/1   ·   +7 771 733 77 00   ·   most-a.com", { size: 16, color: GREY })],
    alignment: AlignmentType.RIGHT,
    spacing: { after: 0 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: INK, space: 8 } },
  }),
];

/* ---------- документ ---------- */
const doc = new Document({
  creator: "MOST Architects",
  title: "Коммерческое предложение — концепция и эскизный проект",
  styles: { default: { document: { run: { font: F, size: 20, color: TXT } } } },
  numbering: { config: [] },
  sections: [{
    properties: { page: { margin: { top: M, bottom: M, left: M, right: M } } },
    children: [
      ...header,
      gap(360),

      h1("Коммерческое предложение"),
      p(t("на разработку форэскиза, концепции и эскизного проекта гостиничного комплекса", { size: 21, color: TXT }), { after: 320 }),

      /* объект */
      table([3000, W - 3000], [
        ["Объект", "Гостиничный комплекс категории 4 звезды"],
        ["Адрес", "г. Алматы, ул. Бухтарминская"],
        ["Земельный участок", "1,4 га (14 000 м²)"],
        ["Стадия", "Форэскиз, концепция и эскизный проект"],
        ["Дата предложения", "август 2026 г."],
      ].map(([k, v], i, a) => new TableRow({
        children: [
          cell([t(k, { color: GREY, size: 18 })], { w: 3000, strong: i === a.length - 1 }),
          cell([t(v, { color: INK, bold: true })], { w: W - 3000, strong: i === a.length - 1 }),
        ],
      }))),

      /* 1 */
      h2("1. База расчёта стоимости"),
      new Paragraph({
        children: [new ImageRun({ data: planImg, type: "jpg", transformation: { width: 470, height: 376 } })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
      }),
      p(t("Посадка комплекса на участок. Площади в таблице приведены по проекту генерального плана.",
        { size: 16, color: GREY, italics: true }), { align: AlignmentType.CENTER, after: 200 }),
      table([W - 3200, 3200], [
        ["Площадь 1-го этажа", "4 446,90 м²", false],
        ["Площадь номеров, нетто (этажи 2–5)", "12 693,32 м²", false],
        ["Коридоры и узлы этажей 2–5 (расчётно, коэф. 0,70)", "5 439,99 м²", false],
        ["Надземная часть, всего", "22 580,21 м²", false],
        ["Подземный этаж 4 941,11 м² с понижающим коэффициентом 0,45", "2 223,50 м²", false],
        ["Расчётная площадь для определения стоимости", "24 803,71 м²", true],
      ].map(([k, v, s]) => new TableRow({
        children: [
          cell([t(k, { color: s ? INK : TXT, bold: s })], { w: W - 3200, strong: s }),
          cell([t(v, { color: INK, bold: true })], { w: 3200, align: AlignmentType.RIGHT, strong: s }),
        ],
      }))),

      /* 2 */
      h2("2. Стоимость работ"),
      table([W - 4400, 1600, 2800], [
        new TableRow({
          children: [
            cell([t("Стадия", { size: 16, bold: true, color: ORANGE, cs: 6 })], { w: W - 4400, strong: true }),
            cell([t("Доля", { size: 16, bold: true, color: ORANGE, cs: 6 })], { w: 1600, align: AlignmentType.RIGHT, strong: true }),
            cell([t("Сумма без НДС", { size: 16, bold: true, color: ORANGE, cs: 6 })], { w: 2800, align: AlignmentType.RIGHT, strong: true }),
          ],
        }),
        ...[
          ["Стадия 1. Форэскиз", "10 %", SUM_F, 0],
          ["Стадия 2. Концепция", "40 %", SUM_C, 0],
          ["Стадия 3. Эскизный проект", "50 %", SUM_E, 0],
          ["Итого без НДС", "100 %", NET, 1],
          ["НДС 16 %", "", VAT, 0],
          ["Итого к оплате с НДС", "", GROSS, 2],
        ].map(([k, d, v, lvl]) => new TableRow({
          children: [
            cell([t(k, { color: INK, bold: lvl > 0 })], { w: W - 4400, strong: lvl === 2 }),
            cell([t(d, { color: TXT })], { w: 1600, align: AlignmentType.RIGHT, strong: lvl === 2 }),
            cell([t(money(v), { color: INK, bold: true })], { w: 2800, align: AlignmentType.RIGHT, strong: lvl === 2 }),
          ],
        })),
      ]),
      gap(140),
      p(t("Стоимость работ с НДС за 1 м\u00b2 расчётной площади: " + RATE_TOTAL + " тенге.",
        { size: 18, color: INK })),

      /* 3 */
      h2("3. Состав работ"),
      p(t("Стадия 1. Форэскиз", { bold: true, color: INK, size: 21 }), { after: 120 }),
      li("Градостроительный анализ участка и окружения, ограничения застройки"),
      li("Посадка комплекса на участок, генеральный план, отступы от границ"),
      li("Объёмно-пространственное решение, этажность, силуэт"),
      li("Предварительные технико-экономические показатели"),
      li("Архитектурное решение фасадов"),
      li("Визуализации — 11 ракурсов (экстерьер, интерьеры общественных зон и номера)"),
      li("Презентационные материалы для предварительного согласования"),
      gap(180),
      p(t("Стадия 2. Концепция", { bold: true, color: INK, size: 21 }), { after: 120 }),
      li("Уточнение генерального плана по итогам предварительного согласования"),
      li("Функциональное зонирование по этажам"),
      li("Планировочное решение первого этажа"),
      li("Фасады и характерные разрезы с высотными отметками"),
      li("Ведомость отделочных материалов"),
      li("Уточнённые технико-экономические показатели, коэффициенты застройки и использования территории"),
      li("Баланс территории: озеленение, покрытия, проезды, площадки"),
      li("Комплект презентационных материалов для градостроительного совета"),
      gap(180),
      p(t("Стадия 3. Эскизный проект", { bold: true, color: INK, size: 21 }), { after: 120 }),
      li("Планировочные решения всех этажей, типы номеров, итоговая ёмкость номерного фонда"),
      li("Планировка подземного этажа, расчёт машино-мест по действующему нормативу"),
      li("Схема транспортного обслуживания, узлы въезда, пожарные проезды"),
      li("Пояснительная записка"),
      li("Комплект документации для получения архитектурно-планировочного задания"),

      /* 4 */
      h2("4. Сроки выполнения"),
      table([W - 3200, 3200], [
        ["Стадия 1. Форэскиз", "1 неделя"],
        ["Стадия 2. Концепция", "1 месяц"],
        ["Стадия 3. Эскизный проект", "2 месяца"],
        ["Всего", "13 недель"],
      ].map(([k, v], i, a) => new TableRow({
        children: [
          cell([t(k, { color: i === a.length - 1 ? INK : TXT, bold: i === a.length - 1 })], { w: W - 3200, strong: i === a.length - 1 }),
          cell([t(v, { color: INK, bold: true })], { w: 3200, align: AlignmentType.RIGHT, strong: i === a.length - 1 }),
        ],
      }))),
      gap(140),
      p(t("Отсчёт срока каждой стадии начинается с даты поступления аванса и передачи заказчиком исходных данных в полном объёме.",
        { size: 17, color: GREY, italics: true })),

      /* 5 */
      h2("5. Порядок оплаты"),
      li("Стадия 1: аванс 50 % при подписании договора, 50 % по передаче материалов стадии"),
      li("Стадия 2: аванс 50 % при старте стадии, 50 % по передаче материалов стадии"),
      li("Стадия 3: аванс 50 % при старте стадии, 50 % по передаче материалов стадии"),
      li("Рабочие файлы и исходники передаются заказчику после полной оплаты соответствующей стадии"),

      /* 6 */
      h2("6. Не входит в настоящее предложение"),
      p(t("Перечисленные работы могут быть выполнены по отдельному договору.", { size: 18, color: GREY }), { after: 140 }),
      li("Рабочая документация и проектно-сметная документация"),
      li("Смежные разделы: конструктивные решения, отопление и вентиляция, водоснабжение и канализация, электроснабжение, слаботочные системы, проект организации строительства"),
      li("Проект санитарно-защитной зоны от смежной автозаправочной станции и расчёт рассеивания. Необходимость определяется после подтверждения типа станции и установленного размера её СЗЗ"),
      li("Инженерно-геологические и геодезические изыскания, топографическая съёмка"),
      li("Авторский надзор за строительством"),
      li("Ведение согласований в государственных органах. Бюро участвует в защите проектных решений, подача и сопровождение — на стороне заказчика"),

      /* 7 */
      h2("7. Условия"),
      li("Исходные данные, предоставляемые заказчиком: топографическая съёмка, правоустанавливающие документы на участок, архитектурно-планировочное задание, технические условия на подключение к инженерным сетям, задание на проектирование"),
      li("Изменение состава работ, площади объекта или градостроительных условий влечёт пересмотр стоимости и сроков"),
      li("Настоящее предложение действительно в течение 10 рабочих дней с даты его направления"),

      /* подписи */
      gap(520),
      p(t("ТОО «MOST Architects»", { bold: true, color: INK, size: 21 }), { after: 40 }),
      p(t("г. Алматы, ул. Утеген батыра 11в к6/1", { size: 18, color: TXT }), { after: 20 }),
      p(t("+7 771 733 77 00", { size: 18, color: TXT }), { after: 20 }),
      p(t("most-a.com", { size: 18, color: TXT }), { after: 560 }),
      new Paragraph({
        children: [
          floatImg(sealImg, 118, 114, 0.58, -0.30),
          floatImg(signImg, 168, 103, 1.30, -0.46),
          t("Директор", { color: INK }),
          t("            ", { color: GREY }),
          t("_________________", { color: GREY }),
          t("          Иманкулов И.Т.", { color: INK }),
        ],
        spacing: { after: 0, line: 260 },
      }),
    ],
  }],
});

Packer.toBuffer(doc).then((b) => {
  const out = path.join(__dirname, "MOST_KP_Bukhtarminskaya_EP.docx");
  fs.writeFileSync(out, b);
  console.log("Готово:", out);
});
