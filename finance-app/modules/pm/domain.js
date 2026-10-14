/* Управление проектами (концепция, ЭП, РП, авторский надзор): шаблоны этапов из регламентов MOST, права, план сроков, сводки.
   Источники: \\MostServer\Материалы для проектирования\Регламенты — «Регламент проектирования и разработки для Рабочего проекта.docx» (роли, сроки, критерии),
   «Дорожная карта проекта\Эскизный проект (ЭП)_06-10-2025.xmind» (путь ЭП), лист «Шаблон этапов» реестра MOST_Планирование_проектов.xlsx (79 пунктов РП),
   шаблон КП «Концепция» (форэскиз 10 % → концепция 20 % → ЭП 70 %). Сроки ЭП, концепции и АН — допущение, правятся в проекте.
   Недели у пунктов РП — из регламента (диапазон «1–2 недели» → 2). */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.MostPM = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const TRACKS = { concept: 'Концепция', ep: 'Эскизный проект', rp: 'Рабочий проект', an: 'Авторский надзор' };
  const TRACK_SHORT = { concept: 'Концепция', ep: 'ЭП', rp: 'РП', an: 'АН' };
  const TRACK_ORDER = ['concept', 'ep', 'rp', 'an'];
  const NEXT_TRACK = { concept: 'ep', ep: 'rp' };            // куда передаётся проект
  const LEAD_FIELD = { concept: 'pmId', ep: 'pmId', rp: 'gipId', an: 'gipId' }; // кто ведёт стадию
  const STATUS = ['В работе', 'Ждём заказчика', 'Ждём госорган', 'На паузе', 'Готово', 'Отменён'];
  const ACTIVE = s => !['Готово', 'Отменён'].includes(s || 'В работе');
  const RISK = ['Низкий', 'Средний', 'Высокий'];
  // роль в пункте → раздел руководителя, который его ведёт
  const SECTIONS = ['АР', 'КЖ', 'ГП', 'ОВ', 'ВК', 'ЭЛ', 'СС', 'ГСВ', 'ТХ', 'Смета', 'Визуализация'];
  const ROLE_SECTION = { 'ГАП': 'АР', 'ГКП': 'КЖ', 'ГП': 'ГП', 'ОВ': 'ОВ', 'ВК': 'ВК', 'ЭЛ': 'ЭЛ', 'СС': 'СС', 'ГСВ': 'ГСВ', 'ТХ': 'ТХ', 'Сметчик': 'Смета', 'Визуализатор': 'Визуализация' };
  const ITEM_ROLES = ['ПМ', 'ГИП', 'ГАП', 'ГКП', 'ГП', 'ОВ', 'ВК', 'ЭЛ', 'СС', 'ГСВ', 'ТХ', 'Сметчик', 'Визуализатор', 'Заказчик'];
  const HOLDERS = ['Заказчик', 'Госорган / Экспертиза', 'Смежник', 'Внутри студии'];
  const BLOCKER_STATUS = { open: 'Открыт', closed: 'Закрыт' };
  // разделы бюджета (как в MOST_Проекты РП_Бюджет.xlsx) и типы исполнителя
  const BUDGET_SECTIONS = ['АР', 'Расчёты КЖ', 'КЖ', 'ОВ', 'ВК', 'ЭЛ', 'СС/АПС', 'МОПБ', 'ГП', 'АПТ', 'ПОС', 'ОВОС', 'ТХ', 'Смета', 'Офис', 'Форс мажор'];
  const EXECUTORS = ['Внутренние', 'Субподряд', 'Аллокация', 'Резерв'];
  // стандарт папки проекта на сервере: S:\№-год-название\<разделы>
  const FOLDER_SECTIONS = ['00-ИРД', '01-Задания', '02-AR', '03-GP', '04-KJ', '05-OV', '06-VK', '07-EL', '08-SS', '09-APT', '10-POS', '11-OVOS', '12-SMETA', '13-TH'];
  const folderName = p => { const no = p && p.no ? String(p.no).replace(/\D/g, '').padStart(3, '0') : '№'; const year = String((p && (p.start || p.createdAt)) || '').slice(0, 4) || String(new Date().getFullYear()); const name = String((p && p.name) || '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim(); return `${no}-${year}-${name}`; };

  // пункт: [название, роль, недель, критерий приёмки, необязательный]
  const I = (t, role, w, crit, opt) => ({ t, role, w, crit: crit || '', opt: !!opt });
  // пункт дорожной карты: код (A1…), название, роль, недель, блокеры (коды пунктов, которые должны быть закрыты), критерий
  const R = (code, t, role, w, deps, crit) => ({ t, role, w, crit: crit || '', opt: false, code, deps: deps || [] });
  const TEMPLATE_VERSION = { ep: '2026-09-25 дорожная карта Hayat (A–H) + концепция', rp: '2026-09-24 реестр, 79 пунктов', concept: '2026-09-24', an: '2026-09-24' };
  const TEMPLATES = {
    concept: [
      { name: '1. Форэскиз (10 %)', items: [I('Исходные данные и ТЗ от заказчика', 'ПМ', 1, 'Получены участок, ТЗ, пожелания заказчика'), I('Анализ участка и градрегламента', 'ГАП', 1, 'Ограничения участка, плотность, этажность'), I('Форэскиз: посадка и объёмы', 'ГАП', 2), I('Презентация форэскиза заказчику', 'ПМ', 1, 'Форэскиз согласован заказчиком')] },
      { name: '2. Концепция (20 %)', items: [I('Концепция генплана', 'ГП', 2), I('Планировочные решения и ТЭП', 'ГАП', 3, 'ТЭП согласованы с отделом продаж заказчика'), I('Фасадные решения', 'ГАП', 2), I('Визуализации', 'Визуализатор', 2), I('Альбом концепции', 'ГАП', 1, 'Альбом собран и проверен ПМ')] },
      { name: '3. Согласование и передача в ЭП', items: [I('Презентация концепции заказчику', 'ПМ', 1), I('Корректировки по замечаниям', 'ГАП', 2), I('Концепция утверждена заказчиком', 'ПМ', 1, 'Подписанный альбом / письмо заказчика'), I('Передача в ЭП (КП и договор на ЭП — 70 %)', 'ПМ', 1, 'Создан ЭП, назначен ПМ')] },
    ],
    // ЭП — дорожная карта бюро (Google Sheet «Hayat дорожная карта», 25.09.2026): этапы A–H, коды задач и блокеры (зависимости) как в таблице.
    // Роли — по смыслу (ГАП / ГП / ПМ / Заказчик / Визуализатор), недели оценки — допущение (1–3), критерии — короткие. Первый этап «Концепция» добавляется ниже (CONCEPT_STAGE).
    ep: [
      { name: 'A — Сбор информации', items: [
        R('A1', 'Подписание договора', 'ПМ', 1, [], 'Договор на ЭП подписан обеими сторонами'),
        R('A2', 'Оплата за разработку ЭП', 'Заказчик', 1, [], 'Аванс по договору получен'),
        R('A3', 'Получить ТЗ по анкете', 'ПМ', 1, [], 'Анкета-ТЗ заполнена и подписана заказчиком'),
        R('A4', 'Получить ИРД', 'Заказчик', 2, [], 'ИРД по перечню договора получены')] },
      { name: 'B — Посадка', items: [
        R('B1', 'Анализ участка', 'ГАП', 1, ['A1', 'A2'], 'Ограничения участка, красные линии, сети, регламенты'),
        R('B2', 'Посадка (со всеми индикативами)', 'ГАП', 2, ['B1']),
        R('B3', 'Просчитать ТЭПы', 'ГАП', 1, ['B2'], 'ТЭП по посадке'),
        R('B4', 'Согласование посадки', 'ПМ', 1, ['B3'], 'Посадка согласована заказчиком')] },
      { name: 'C — Схемы блоков и планировок', items: [
        R('C1', 'Схема блоков и ЛЛУ', 'ГАП', 1, ['B2']),
        R('C2', 'Схема квартир', 'ГАП', 1, ['C1']),
        R('C3', 'Просчет квартирографии (ТЭПов)', 'ГАП', 1, ['C2'], 'Квартирография согласована с отделом продаж'),
        R('C4', '3Д схемы и определение нулей', 'ГАП', 1, ['B2']),
        R('C5', 'Согласование схемы блоков и квартирографии', 'ПМ', 1, ['C1', 'C2', 'C3'], 'Схемы блоков и квартирография согласованы заказчиком'),
        R('C6', 'Разрезы по участку (для анализа)', 'ГАП', 1, ['C5'])] },
      { name: 'D — Планировки', items: [
        R('D5', 'Планировки типовых эт, 1ых эт, паркингов и подвалов', 'ГАП', 3, ['C5']),
        R('D6', 'Согласование планировок типовых эт, 1ых эт, паркингов и подвалов', 'ПМ', 1, ['D5'], 'Планировки согласованы заказчиком')] },
      { name: 'E — Концепт фасада (один угол фасада)', items: [
        R('E1', 'Сбор мудборда с референсами', 'ГАП', 1, ['C5']),
        R('E2', 'Визуализация одного ракурса в разн. вар. (ИИ)', 'Визуализатор', 1, ['E1', 'C4']),
        R('E3', 'Согласование направления фасада (одного ракурса)', 'ПМ', 1, ['E2'], 'Направление фасада выбрано заказчиком'),
        R('E4', 'Финальное моделирование выбранного варианта (одного ракурса)', 'ГАП', 2, ['E3']),
        R('E5', 'Схема ночной декоративной подсветки', 'ГАП', 1, ['E3']),
        R('E6', 'Согласование варианта фасада', 'ПМ', 1, ['E4'], 'Вариант фасада согласован заказчиком')] },
      { name: 'F — Финальный фасад (на весь комплекс)', items: [
        R('F1', 'Финальное моделирование фасада комплекса', 'ГАП', 2, ['E6']),
        R('F2', 'Развертки ключевых фасадов и фасады с ведомостью материалов наружной отделки', 'ГАП', 2, ['E6']),
        R('F3', 'Визуализация фасада комплекса (ИИ)', 'Визуализатор', 1, ['F1', 'E6']),
        R('F4', 'Согласование фасада комплекса', 'ПМ', 1, ['F1', 'F2', 'F3'], 'Фасад комплекса согласован заказчиком')] },
      { name: 'G — ГП и благоустройство', items: [
        R('G1', 'Оформление ГП', 'ГП', 2, ['C5']),
        R('G2', 'Ситуационный план и выкопировка ПДП', 'ГП', 1, []),
        R('G3', 'ГП с функциональным зонированием и основными ТЭП', 'ГП', 1, []),
        R('G4', 'Схема транспортных и пешеходных связей, включая межквартальные связи и главную пешеходную ось', 'ГП', 1, []),
        R('G5', 'Планы инженерных сетей', 'ГП', 1, []),
        R('G6', 'Согласование ГП с благоустройством', 'ПМ', 1, ['G2'], 'ГП и благоустройство согласованы заказчиком')] },
      { name: 'H — Завершение проекта', items: [
        R('H1', 'Сбор альбома', 'ГАП', 1, ['F4', 'G6', 'D6'], 'Альбом ЭП собран и проверен ПМ'),
        R('H2', 'Согласование ЭП с заказчиком', 'ПМ', 1, ['H1'], 'Подписанный альбом / письмо заказчика'),
        R('H3', 'Согласование ЭП с городом', 'ПМ', 3, ['H2'], 'ЭП согласован уполномоченным органом')] },
    ],
    // 79 пунктов — как в листе «Шаблон этапов» реестра; роль, недели и критерий — из регламента РП
    rp: [
      { name: '1. ИРД (ТУ, геология)', items: [
        I('Расчёт нагрузок для ТУ', 'ГИП', 1, 'Расчёт передан заказчику для получения ТУ'),
        I('ТУ — технические условия', 'Заказчик', 3, 'ТУ получены (14 рабочих дней, контроль ГИП)'),
        I('Задание на проектирование РП (ЗнП)', 'ГИП', 1, 'ЗнП подписано заказчиком'),
        I('Геология: балльность, штампы, отчёт, разрезы; согласование с КазНИИСА', 'Заказчик', 4, 'Геологический отчёт получен (по регламенту 1 месяц)'),
        I('Топосъёмка с регистрацией (сети, красные линии, СЗЗ, разломы, водоохранная зона, ЛЭП, деревья, координаты)', 'ГИП', 2, 'Топосъёмка зарегистрирована'),
        I('СТУ (при необходимости): КЖ, основание, пожарная безопасность', 'ГИП', 2, 'Все нужные СТУ учтены', true)] },
      { name: '2. ГПР / График чертежей', items: [
        I('ГПР — график производства работ', 'ГИП', 1, 'ГПР выдан заказчику'),
        I('График выдачи чертежей (согласование сроков внутри компании со всеми главспецами)', 'ГИП', 1, 'Сроки подтверждены всеми главспецами')] },
      { name: '3. Этап 1. Схема КЖ', items: [
        I('ГП1. Рельеф и посадка', 'ГП', 1, 'План организации рельефа с отметками нулей, координаты осей зданий'),
        I('Предварительная схема КЖ', 'ГКП', 1, 'Планы типовых этажей со схемой конструктива (ГАП + ГКП)'),
        I('КЖ1. Расчёт схемы КЖ', 'ГКП', 2, 'Расчётные схемы с учётом сейсмики, геологии, СТУ'),
        I('АР1. Планировочное задание смежникам', 'ГАП', 2, 'Планы всех этажей, по которым могут работать инженеры'),
        I('Согласование с заказчиком конструктивной схемы и планов', 'ГИП', 2, 'Подписанные заказчиком планы с конструктивной схемой, прошедшей расчёт'),
        I('ТЭП бетона и арматуры (площадь бетона, кг/м³, кг арматуры и м³ бетона на 1 м² продаваемой)', 'ГКП', 1, 'Пояснительная записка с показателями подписана заказчиком («Карточка основных проектных решений»)'),
        I('Планировочные решения', 'ГАП', 1, 'Планировки подписаны заказчиком'),
        I('Котельная или ЦТС', 'ГИП', 1, 'Решение по источнику тепла отражено в ЗнП и подписано заказчиком'),
        I('Согласование опалубочных чертежей между АР и КЖ', 'ГАП', 2, 'Опалубка подписана ГАП и ГКП'),
        I('ТП — расположение трансформаторной подстанции', 'ГАП', 1, 'ТП на генплане согласована заказчиком'),
        I('КПП — расположение', 'ГАП', 1, 'КПП на генплане согласовано заказчиком')] },
      { name: '4. Этап 2. Финальные планы', items: [
        I('КЖ2. Котлован', 'ГКП', 2, 'Чертежи котлована выданы с основанием по геологии / отчёту КазНИИСА'),
        I('КЖ2. Фундамент', 'ГКП', 2, 'Чертежи фундамента с выпусками'),
        I('ВК1. Планы', 'ВК', 2, 'Планы с разводкой; при переносе техпомещений — задание ГАП'),
        I('ОВ1. Планы', 'ОВ', 2, 'Планы с разводкой; при переносе техпомещений — задание ГАП'),
        I('ЭЛ1. Планы', 'ЭЛ', 2, 'Планы с разводкой; при переносе техпомещений — задание ГАП'),
        I('СС1. Планы', 'СС', 2, 'Планы с разводкой; при переносе техпомещений — задание ГАП'),
        I('ГСВ1. Планы', 'ГСВ', 2, 'Планы с разводкой; при переносе техпомещений — задание ГАП'),
        I('ТХ (при необходимости)', 'ТХ', 2, 'Задания от ТХ для АР по нормативам', true),
        I('АР2. Чертежи АР без спецификаций (готовая модель)', 'ГАП', 2, 'Модель Revit оформлена по листам'),
        I('Контрольная проверка опалубки', 'ГАП', 0.4, 'Наложение опалубки на планы АР: проёмы, шахты, лестницы (2 рабочих дня, ГАП + ГКП)'),
        I('Выдача планировочных решений отделу продаж', 'ГАП', 2, 'Планы с площадями на продажу подписаны отделом продаж')] },
      { name: '5. Этап 3. Проект', items: [
        I('Согласование с заказчиком', 'ГИП', 1, 'Подпись заказчика'),
        I('Инженерия: согласование схем разводки ОВ/ВК/ЭЛ/СС (планы), оборудование и материалы', 'ГИП', 1, 'Планы разводки и трасс подписаны заказчиком'),
        I('Повторное согласование материалов', 'ГАП', 1, 'Материалы согласованы заказчиком по ЗнП'),
        I('АР: материалы, узлы', 'ГАП', 1, 'Узлы и материалы согласованы заказчиком'),
        I('КЖ3. Армирование', 'ГКП', 2, 'Чертежи выше нуля: армирование плит, стен'),
        I('АР3. Полная комплектация чертежей АР', 'ГАП', 2, 'Комплект АР выдан в срок по графику'),
        I('ВК2. Схемы', 'ВК', 2, 'Аксонометрические схемы на оформленных листах'),
        I('ОВ2. Схемы', 'ОВ', 2, 'Аксонометрические схемы на оформленных листах'),
        I('ЭЛ2. Схемы, планы', 'ЭЛ', 2, 'Принципиальные и однолинейные схемы для спецификации'),
        I('СС2. Схемы', 'СС', 2, 'Принципиальные схемы для спецификации'),
        I('ГП2. Полный проект', 'ГП', 2, 'Чертёж ГП оформлен для сметы')] },
      { name: '6. Этап 4. Отверстия', items: [
        I('Выдача заданий от инженеров (ОВ/ВК/ЭЛ/СС)', 'ГИП', 1, 'Задания от всех инженерных разделов получены'),
        I('Сбор всех заданий в один файл', 'ГАП', 0.4, 'Единый файл заданий, проверено наличие всех отверстий на планах'),
        I('Согласование единого задания смежниками', 'ГИП', 1, 'Отверстия согласованы при наложении с инженерами'),
        I('Выдача задания конструкторам', 'ГИП', 1, 'Задание отработано с инженерами и подписано на файлах'),
        I('Проверка отверстий в КЖ (АР, инженеры, ГИП)', 'ГИП', 1, 'Отверстия в КЖ соответствуют заданию'),
        I('ПОС (начало работы)', 'ГИП', 1),
        I('ОВОС (начало работы)', 'ГИП', 1)] },
      { name: '7. Этап 5. Комплектация (экспертиза)', items: [
        I('Согласование с заказчиком', 'ГИП', 1, 'Полный пакет рабочей документации согласован заказчиком'),
        I('Акт приёмки-передачи, подписанный заказчиком', 'ГИП', 1, 'Подписанный акт'),
        I('АР4. Комплект: подпорные стены, крыльца, козырьки, приямки, навесы, входные группы', 'ГАП', 1, 'Полный комплект для сметы и экспертизы'),
        I('КЖ4. Подпорные стены, КМ, крыльца, навесы, приямки', 'ГКП', 1, 'Полный комплект для сметы и экспертизы'),
        I('ВК3. Полный комплект чертежей и спецификаций', 'ВК', 1, 'Комплект для сметы и экспертизы'),
        I('ОВ3. Полный комплект чертежей и спецификаций', 'ОВ', 1, 'Комплект для сметы и экспертизы'),
        I('ЭЛ3. Полный комплект чертежей и спецификаций', 'ЭЛ', 1, 'Комплект для сметы и экспертизы'),
        I('СС3. Полный комплект чертежей и спецификаций', 'СС', 1, 'Комплект для сметы и экспертизы'),
        I('ГСВ3. Полный комплект чертежей и спецификаций', 'ГСВ', 1, 'Комплект для сметы и экспертизы'),
        I('Письмо от заказчика в экспертизу (полный комплект)', 'Заказчик', 1, 'Официальные письма с подписями получены'),
        I('Согласование БАБИ (при необходимости)', 'Заказчик', 1, '', true),
        I('Письмо о согласовании РП', 'Заказчик', 1),
        I('Письмо о финансировании', 'Заказчик', 1),
        I('Информация о заказчике', 'Заказчик', 1),
        I('Письмо о вывозе грунта', 'Заказчик', 1),
        I('Письмо о вывозе мусора и ТБО', 'Заказчик', 1),
        I('Письмо о начале СМР', 'Заказчик', 1),
        I('Протокол дозиметрии', 'Заказчик', 1),
        I('Протокол радона и гамма-фона', 'Заказчик', 1),
        I('Письмо об отсутствии скотомогильников и сибиреязвенных очагов', 'Заказчик', 1),
        I('Письмо от аэропорта (согласование)', 'Заказчик', 1, '', true),
        I('Лесопатология', 'Заказчик', 1, '', true),
        I('ПИР', 'ГИП', 1, 'Расчёт ПИР для экспертизы'),
        I('Общая пояснительная записка (ОПЗ)', 'ГИП', 1, 'ОПЗ собрана по запискам разделов'),
        I('Паспорт проекта', 'ГАП', 1, 'Паспорт проекта выдан для экспертизы'),
        I('Энергетический паспорт', 'ОВ', 1, 'Энергетический паспорт выдан'),
        I('Расчёт инсоляции (оформление)', 'ГАП', 1, 'Расчёт по посадке и планировкам оформлен'),
        I('Смета', 'Сметчик', 6, 'Полный комплект альбома для экспертизы (4–6 недель)')] },
      { name: '8. Этап 6. Экспертиза', items: [
        I('Прохождение экспертизы: комплектация (1–2 нед.), ответы на замечания (2–3 нед.)', 'ГИП', 5, 'Положительное заключение экспертизы')] },
      { name: '9. Этап 7. На стройку / Выдача', items: [
        I('Чертежи на стройку (после экспертизы, электронно и на бумаге)', 'ГИП', 2, 'Чертежи выданы заказчику'),
        I('Выдача окончательного проекта заказчику', 'Заказчик', 1, 'Акт приёма-передачи подписан')] },
    ],
    // авторский надзор: этап запуска + этап на каждый месяц (см. AN_MONTHLY, itemsFromTemplate)
    an: [
      { name: '1. Запуск АН', items: [I('Договор и график авторского надзора', 'ГИП', 1, 'Договор АН подписан, график выездов согласован с заказчиком'), I('Журнал авторского надзора открыт', 'ГИП', 1, 'Журнал АН зарегистрирован на объекте'), I('Состав группы АН по разделам', 'ГИП', 1, 'Назначены ответственные АР, КЖ, инженерия')] },
    ],
  };
  // Решение директора 24.09.2026: концепция — не отдельная стадия, а первый этап ЭП (форэскиз → концепция → согласование → договор на ЭП).
  // Трек concept остаётся в данных для старых карточек (они сворачиваются в ЭП при «передаче»); АН в интерфейсе скрыт («панель планирования сейчас не нужна»), данные и API сохранены.
  const CONCEPT_STAGE = { name: '1. Концепция (форэскиз → концепция → согласование)', items: TEMPLATES.concept.flatMap(s => s.items).map(x => /^Передача в ЭП/.test(x.t) ? Object.assign({}, x, { t: 'КП и договор на ЭП (70 %)', crit: 'Договор на ЭП подписан, назначен ПМ' }) : x) };
  TEMPLATES.ep = [CONCEPT_STAGE].concat(TEMPLATES.ep.map((s, i) => Object.assign({}, s, { name: `${i + 2}. ${s.name.replace(/^\d+\.\s*/, '')}` })));
  const VISIBLE_TRACKS = ['ep', 'rp'];                     // что предлагаем создавать и показываем в меню
  const HIDDEN_TRACKS = ['concept', 'an'];
  const normalizeTrack = t => t === 'concept' ? 'ep' : (TRACKS[t] ? t : 'rp'); // «Концепция» при создании/импорте — это ЭП
  const shownTrack = t => t !== 'an';                       // что попадает в сводку, реестры и «мои задачи» (старые концепции — среди ЭП)
  const AN_MONTHLY = [I('Выезды на объект по графику', 'ГИП', 4, 'Отметки о выездах в журнале АН'), I('Записи в журнале АН', 'ГИП', 4), I('Ответы на запросы подрядчика', 'ГАП', 4, 'Все запросы закрыты письменно'), I('Приёмка скрытых работ (КЖ)', 'ГКП', 4, 'Акты скрытых работ подписаны'), I('Ежемесячный акт АН', 'ГИП', 4, 'Акт АН за месяц подписан заказчиком')];
  const MONTHS_RU = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const stageNames = track => (TEMPLATES[track] || []).map(s => s.name);
  // названия этапов конкретного проекта (у АН этапы — месяцы), по порядку
  const stageNamesOf = (items, track) => { const m = new Map(); for (const i of items || []) if (!m.has(i.stage)) m.set(i.stage, i.stageName); const out = [...m.entries()].sort((a, b) => a[0] - b[0]).map(x => x[1]); return out.length ? out : stageNames(track); };
  const templateCount = track => (TEMPLATES[track] || []).reduce((s, st) => s + st.items.length, 0);
  // номер этапа по названию из реестра («3. Этап 1. Схема КЖ» или «3»); 0 — не найден
  function stageIndex(track, name) {
    const names = stageNames(track); const s = String(name == null ? '' : name).trim(); if (!s) return 0;
    let i = names.indexOf(s);
    if (i < 0) { const m = s.match(/^(\d+)\s*\.?/); if (m && Number(m[1]) >= 1 && Number(m[1]) <= names.length) i = Number(m[1]) - 1; }
    if (i < 0) i = names.findIndex(n => n.toLowerCase().includes(s.toLowerCase()));
    return i >= 0 ? i + 1 : 0;
  }

  // ---- права ----
  const LEADERS = ['owner', 'partner'];
  const PM_ROLES = ['owner', 'partner', 'accountant', 'secretary', 'pm', 'gip', 'lead'];
  // настройки модуля (db.settings.pm). staffOwnProjects — рядовые сотрудники (staff) видят проекты, где они исполнители пунктов или участники (members); по умолчанию выключено
  const SETTINGS_DEFAULT = { staffOwnProjects: false, defaultEpPmId: '', defaultRpGipId: '', chatForMembers: false, chatFilesToFolder: true, chatFolderName: '00-Входящие WhatsApp', overloadLimit: 8, silentDays: 5 }; // chatForMembers — переписку (WhatsApp) читают и участники проекта; chatFilesToFolder / chatFolderName — копировать принятые файлы в подпапку папки проекта; // ПМ по умолчанию для ЭП, ГИП по умолчанию для РП
  const pmSettings = db => Object.assign({}, SETTINGS_DEFAULT, (db && db.settings && db.settings.pm) || {});
  const isStaff = u => !!u && u.role === 'staff';
  const canOpen = (u, s) => !!u && (PM_ROLES.includes(u.role) || (isStaff(u) && !!(s && s.staffOwnProjects)));
  const memberIds = p => { const m = p && p.members; return Array.isArray(m) ? m.map(String) : m && typeof m === 'object' ? Object.values(m).flat().map(String) : []; };
  // проект виден сотруднику: он участник проекта или исполнитель хотя бы одного пункта
  const staffSees = (u, p, items) => !!u && !!p && (memberIds(p).includes(u.id) || (items || []).some(i => i.pid === p.id && i.assigneeId === u.id));
  const STAFF_ITEM_FIELDS = ['done', 'kstatus', 'doneNote', 'note']; // что сотрудник может менять в своём пункте (срок и исполнителя — нет); kstatus — колонка канбана
  // разделы интерфейса по стадиям: «ЭП» и «РП» — два UI-модуля одного pm. По умолчанию ПМ видит ЭП, ГИП — РП, руководители и руководители разделов — оба;
  // плюс стадии проектов, где пользователь ГИП/ПМ/участник (например, ПМ передал ЭП в РП и остался ГИПом); staff — стадии своих проектов
  const trackPath = t => t === 'rp' ? 'rp' : 'ep';
  const defaultTracks = u => !u ? [] : u.role === 'pm' ? ['ep'] : u.role === 'gip' ? ['rp'] : isStaff(u) ? [] : ['ep', 'rp'];
  function userTracks(u, projects, items) {
    if (!u) return []; const set = new Set(defaultTracks(u));
    for (const p of projects || []) { if (!ACTIVE(p.status) && p.status !== 'Готово') continue; const mine = isStaff(u) ? staffSees(u, p, items) : (p.gipId === u.id || p.pmId === u.id || memberIds(p).includes(u.id)); if (mine) set.add(trackPath(p.track)); }
    return ['ep', 'rp'].filter(t => set.has(t));
  }
  const isLeader = u => !!u && LEADERS.includes(u.role);
  // любой ГИП правит все РП (решение директора 01.10.2026); бюджет — отдельно, canBudget
  const isManager = (u, p) => !!u && !!p && (isLeader(u) || p.gipId === u.id || p.pmId === u.id || (u.role === 'gip' && p.track === 'rp'));
  const canCreate = u => !!u && (isLeader(u) || u.role === 'pm' || u.role === 'gip');
  const canEditItem = (u, p, it) => isManager(u, p) || (!!u && u.role === 'lead' && !!u.section && itemSection(it) === u.section) || (!!u && !!it && !!it.assigneeId && it.assigneeId === u.id);
  const canBudget = (u, p) => isLeader(u) || (!!u && !!u.seeBudget && !!p && (p.gipId === u.id || p.pmId === u.id));
  const itemSection = it => (it && (it.section || ROLE_SECTION[it.role])) || '';
  // ---- переносы сроков и проверка пунктов (14.10.2026) ----
  // перенос: { id, at, by, assigneeId, from, to, days, reason, status: pending|approved|rejected|direct|cancelled, decidedAt, decidedBy, comment }
  const SHIFT_STATUS = { pending: 'ждёт решения', approved: 'утверждён', rejected: 'отклонён', direct: 'перенос без запроса', cancelled: 'отменён' };
  const shiftPending = it => (it && Array.isArray(it.shifts) && it.shifts.find(s => s.status === 'pending')) || null;
  // запросить перенос: исполнитель пункта, ГИП/ПМ, руководитель раздела (все, кто правит пункт), кроме владельца и партнёра — они меняют срок сами
  const canShiftRequest = (u, p, it) => !!u && !!p && !!it && !isLeader(u) && !it.done && !it.na && canEditItem(u, p, it);
  // решить: руководитель проекта (isManager), но не сам автор; если автор сам ведёт проект (ГИП/ПМ) — только владелец или партнёр
  const canShiftDecide = (u, p, s, author) => !!u && !!p && !!s && s.status === 'pending' && isManager(u, p) && s.by !== u.id && (!(author && isManager(author, p)) || isLeader(u));
  // принять / вернуть пункт на проверке — руководитель проекта
  const canReview = (u, p, it) => !!it && !it.done && !it.na && itemKanban(it) === 'review' && isManager(u, p);
  // сколько раз переносили срок (утверждённые и без запроса) и на сколько дней суммарно
  function shiftStats(it) { const l = ((it && it.shifts) || []).filter(s => s.status === 'approved' || s.status === 'direct'); return { n: l.length, days: l.reduce((a, s) => a + (Number(s.days) || 0), 0), direct: l.filter(s => s.status === 'direct').length, requested: ((it && it.shifts) || []).filter(s => s.status !== 'direct').length }; }

  // ---- даты ----
  const iso = d => d.toISOString().slice(0, 10);
  const addDays = (a, n) => iso(new Date(new Date(a + 'T00:00:00Z').getTime() + Math.round(n) * 864e5));
  const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Almaty' }); // дата по Алматы
  const days = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
  const ym = d => String(d || '').slice(0, 7);
  const addMonths = (m, n) => { const [y, mo] = String(m).split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
  const monthsDiff = (a, b) => { const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number); return (by - ay) * 12 + (bm - am); };
  const mname = m => { const p = String(m || '').split('-'); return p[1] ? `${MONTHS_RU[Number(p[1]) - 1]} ${p[0]}` : String(m || ''); };
  // ---- запись .xlsx без библиотек: zip без сжатия (store) + минимальный OOXML; строки — inline, числа — числом; шапка жирная и закреплена ----
  const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const utf8 = s => new TextEncoder().encode(String(s));
  function zipStore(files) { // files: [{ name, data: Uint8Array }] → Uint8Array (zip, method 0 = store, имена в UTF-8)
    const parts = [], cd = []; let off = 0; const u16 = v => [v & 255, (v >>> 8) & 255], u32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1; // фиксированная дата в заголовках zip — от неё ничего не зависит
    for (const f of files) {
      const name = utf8(f.name), data = f.data, crc = crc32(data);
      const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(dosDate), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...name]);
      parts.push(local, data);
      cd.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(dosDate), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off), ...name]));
      off += local.length + data.length;
    }
    const cdLen = cd.reduce((a, x) => a + x.length, 0);
    const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdLen), ...u32(off), ...u16(0)]);
    const all = [...parts, ...cd, end]; const out = new Uint8Array(all.reduce((a, x) => a + x.length, 0)); let q = 0; for (const x of all) { out.set(x, q); q += x.length; }
    return out;
  }
  const xmlEsc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  const colName = n => { let out = ''; n++; while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); } return out; };
  // sheets: [{ name, rows: [[…]], widths?: […] }]; первая строка — шапка. Число → число, остальное → текст
  function xlsx(sheets) {
    const sheetXml = sh => {
      const rows = sh.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => { if (v == null || v === '') return ''; const ref = `${colName(ci)}${ri + 1}`; const st = ri === 0 ? ' s="1"' : ''; return typeof v === 'number' && isFinite(v) ? `<c r="${ref}"${st}><v>${v}</v></c>` : `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`; }).join('')}</row>`).join('');
      const cols = sh.widths ? `<cols>${sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${rows}</sheetData></worksheet>`;
    };
    const sname = (nm, i) => xmlEsc(String(nm || `Лист${i + 1}`).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31));
    const files = [
      { name: '[Content_Types].xml', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`) },
      { name: '_rels/.rels', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
      { name: 'xl/workbook.xml', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sh, i) => `<sheet name="${sname(sh.name, i)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`) },
      { name: 'xl/_rels/workbook.xml.rels', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
      { name: 'xl/styles.xml', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`) },
    ].concat(sheets.map((sh, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: utf8(sheetXml(sh)) })));
    return zipStore(files);
  }
  // выгрузка реестра проектов (состав как в «MOST_Планирование_проектов» + зона Пульса и блокеры): листы «Реестр» и «Блокеры». nameOf — id → имя
  function registryExport(rows, blockers, nameOf) {
    nameOf = nameOf || (x => x || ''); const d8 = d => d ? String(d).slice(0, 10).split('-').reverse().join('.') : '';
    const head = ['№', 'Объект', 'Стадия', 'Заказчик', 'ГИП / ПМ', 'Статус', 'Текущий этап', '% выполнения', 'Пунктов сделано', 'Пунктов всего', 'Просрочено пунктов', 'Дата старта', 'Срок по договору', 'Прогноз', 'Договор №', 'Дата договора', 'Зона Пульса', 'Расход буфера, %', 'Блокеров открытых', 'Самый старый блокер, дн.', 'Риск', 'Комментарий'];
    const body = rows.slice().sort((a, b) => TRACK_ORDER.indexOf(a.track) - TRACK_ORDER.indexOf(b.track) || String(a.name).localeCompare(String(b.name), 'ru')).map(r => { const h = r.health || {}, pr = r.progress || {}; return [r.no || '', r.name || '', TRACK_SHORT[r.track] || r.track || '', r.client || '', nameOf(r.leadId || r.gipId || r.pmId) || '', r.status || '', pr.stageName || '', Number(pr.pct) || 0, Number(pr.done) || 0, Number(pr.total) || 0, Number(r.overdueN) || 0, d8(r.start), d8(r.due), d8(r.forecast), r.contractNo || '', d8(r.contractDate), h.zone ? ZONE_NAME_RU[h.zone] || h.zone : '', h.consumption == null ? '' : Math.round(h.consumption * 100), Number(r.blockersN) || 0, Number(r.blockerMaxDays) || 0, r.risk || '', r.comment || '']; });
    const byId = new Map(rows.map(r => [r.id, r]));
    const bh = ['Объект', 'Стадия', 'Что ждём', 'Держатель', 'Ответственный у нас', 'С даты', 'Дней', 'Ожидаем к', 'Последний контакт', 'Статус', 'Комментарий'];
    const bl = (blockers || []).filter(b => b.status !== 'closed').sort((a, b) => (b.days || 0) - (a.days || 0)).map(b => { const pr = byId.get(b.pid) || {}; return [b.project || pr.name || '', TRACK_SHORT[b.track || pr.track] || '', b.what || '', b.holder || '', nameOf(b.ownerId) || b.ownerName || '', d8(b.since), Number(b.days) || 0, d8(b.expected), d8(b.lastContact), 'открыт', b.comment || '']; });
    return [{ name: 'Реестр', rows: [head, ...body], widths: [6, 30, 8, 22, 18, 14, 28, 9, 9, 9, 9, 11, 12, 11, 14, 11, 12, 9, 9, 9, 10, 40] }, { name: 'Блокеры', rows: [bh, ...bl], widths: [30, 8, 40, 14, 18, 11, 7, 11, 12, 9, 30] }];
  }

  // ---- импорт из ClickUp (CSV-выгрузка: Export → CSV) ----
  // CSV: разделитель «,», «;» или табуляция (определяется по первой строке), кавычки по RFC 4180, BOM и CRLF допускаются
  function parseCsv(text) {
    text = String(text || '').replace(/^\uFEFF/, '');
    const first = text.split(/\r?\n/, 1)[0] || '';
    const count = ch => { let n = 0, q = false; for (const c of first) { if (c === '"') q = !q; else if (!q && c === ch) n++; } return n; };
    const delimiter = [',', ';', '\t'].map(d => [d, count(d)]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === delimiter) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); if (row.some(x => x !== '')) rows.push(row); }
    const header = (rows.shift() || []).map(h => String(h).trim());
    return { delimiter, header, rows };
  }
  // поля выгрузки ClickUp → наши: [ключ, подпись, регулярка для автосопоставления заголовка]; колонки «… Text» (дата словами) пропускаются
  const CLICKUP_FIELDS = [
    ['name', 'Название задачи (Task Name)', /^(task ?name|name|назван)/i],
    ['id', 'ID задачи (Task ID)', /^(task ?id|id)$/i],
    ['parent', 'Родительская задача (Parent ID / Parent Task)', /parent|родител/i],
    ['status', 'Статус (Status)', /^status$|^статус/i],
    ['assignees', 'Исполнители (Assignees)', /assignee|исполнител/i],
    ['start', 'Дата начала (Start Date)', /^start ?date$|^дата начала|^старт/i],
    ['due', 'Срок (Due Date)', /^due ?date$|^срок|^дедлайн/i],
    ['list', 'Список (List Name)', /^list( ?name)?$|^список/i],
    ['tags', 'Теги (Tags)', /^tags?$|^теги/i],
    ['priority', 'Приоритет (Priority)', /^priority$|^приоритет/i],
    ['content', 'Описание (Task Content)', /content|description|описан/i],
    ['stage', 'Этап ЭП (кастомное поле)', /^(этап|stage|phase)/i],
    ['client', 'Заказчик (кастомное поле)', /заказчик|client|customer/i],
    ['address', 'Адрес (кастомное поле)', /адрес|address/i],
    ['area', 'Площадь, м² (кастомное поле)', /площад|area/i],
    ['contractNo', 'Договор № (кастомное поле)', /договор|contract/i],
  ];
  const clickupAutoMap = header => { const map = {}; const used = new Set(); for (const [k, , re] of CLICKUP_FIELDS) { const i = header.findIndex((h, idx) => !used.has(idx) && re.test(String(h).trim()) && !/ text$/i.test(h)); if (i >= 0) { map[k] = i; used.add(i); } } return map; };
  const MONTHS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  // дата из чего угодно: epoch мс/с (ClickUp), ISO, дд.мм.гггг, мм/дд/гггг, «September 24th 2026», «24 сентября 2026»
  function parseAnyDate(v) {
    const s = String(v == null ? '' : v).trim(); if (!s) return '';
    let m;
    if (/^\d{13}$/.test(s)) return iso(new Date(Number(s)));
    if (/^\d{10}$/.test(s)) return iso(new Date(Number(s) * 1000));
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
    if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) { const a = Number(m[1]), b = Number(m[2]); const [mo, d] = a > 12 ? [b, a] : [a, b]; return `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
    const lo = s.toLowerCase();
    let en = lo.match(/([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/); if (en) { const mi = MONTHS_EN.indexOf(en[1].slice(0, 3)); if (mi >= 0) return `${en[3]}-${String(mi + 1).padStart(2, '0')}-${en[2].padStart(2, '0')}`; }
    en = lo.match(/(\d{1,2})\s+([a-z]{3,})\.?\s+(\d{4})/); if (en) { const mi = MONTHS_EN.indexOf(en[2].slice(0, 3)); if (mi >= 0) return `${en[3]}-${String(mi + 1).padStart(2, '0')}-${en[1].padStart(2, '0')}`; }
    const ru = lo.match(/(\d{1,2})\s+([а-яё]+)\s+(\d{4})/); if (ru) { const mi = MONTHS_RU.findIndex(x => ru[2].slice(0, 3) === x.slice(0, 3) || (x === 'май' && ru[2].startsWith('ма'))); if (mi >= 0) return `${ru[3]}-${String(mi + 1).padStart(2, '0')}-${ru[1].padStart(2, '0')}`; }
    const t = Date.parse(s); return isNaN(t) ? '' : iso(new Date(t));
  }
  const splitList = v => String(v == null ? '' : v).replace(/^\s*\[|\]\s*$/g, '').split(/[,;]/).map(x => x.trim()).filter(Boolean);
  const CLICKUP_DONE = /complete|closed|done|finish|готов|выполнен|заверш|сдан/i;
  const clickupStatus = s => { s = String(s || ''); if (CLICKUP_DONE.test(s)) return 'Готово'; if (/hold|pause|пауз|стоп|отлож/i.test(s)) return 'На паузе'; if (/wait|ожид|жд[её]м|client|заказчик/i.test(s)) return 'Ждём заказчика'; if (/госорган|экспертиз/i.test(s)) return 'Ждём госорган'; return 'В работе'; };
  // нормализация названий для сопоставления пунктов шаблона и людей
  const normTitle = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\([^)]*\)/g, ' ').replace(/[^a-zа-я0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const tokensOf = s => normTitle(s).split(' ').filter(x => x.length > 1);
  // пункт шаблона по названию задачи: точное совпадение → общий префикс (≥ 5 знаков) → все слова задачи есть в пункте (≥ 2 слов)
  function findItemByTitle(items, title) {
    const t = normTitle(title); if (!t) return null; const pool = (items || []).filter(i => !i.custom);
    const cm = String(title || '').trim().match(/^([A-Za-zА-Яа-я]\d{1,2})[\s.:—-]/); if (cm) { const code = normCode(cm[1]); const byCode = pool.find(i => i.code && normCode(i.code) === code); if (byCode) return byCode; }
    let hit = pool.find(i => normTitle(i.title) === t); if (hit) return hit;
    if (t.length >= 5) { hit = pool.find(i => { const n = normTitle(i.title); return n.length >= 5 && (n.startsWith(t) || t.startsWith(n)); }); if (hit) return hit; }
    const tk = tokensOf(title); if (tk.length >= 2) hit = pool.find(i => { const n = new Set(tokensOf(i.title)); return tk.every(x => n.has(x)); });
    return hit || null;
  }
  // сотрудник по имени из ClickUp: те же слова (порядок любой) → слова одного имени входят в другое (например, «Иванов И.» ↔ «Иван Иванов»)
  function matchUser(users, name) {
    const a = tokensOf(name); if (!a.length) return null; const B = u => new Set(tokensOf(u && u.name));
    let hit = (users || []).find(u => { const b = B(u); return b.size === a.length && a.every(x => b.has(x)); }); if (hit) return hit;
    hit = (users || []).find(u => { const b = B(u); return b.size > 0 && (a.every(x => b.has(x)) || [...b].every(x => a.includes(x))); });
    return hit || null;
  }
  // строки CSV → проекты ЭП с задачами. map: {поле: индекс колонки}; opts.source: 'parent' (задачи верхнего уровня — проекты, подзадачи — пункты) | 'list' (проект = список)
  function clickupToProjects(csv, map, opts) {
    opts = opts || {}; map = map || {}; const col = (r, k) => map[k] == null || map[k] < 0 ? '' : String(r[map[k]] == null ? '' : r[map[k]]).trim();
    const rows = csv.rows.map((r, i) => ({ i, id: col(r, 'id') || `row${i}`, parent: col(r, 'parent'), name: col(r, 'name'), status: col(r, 'status'), assignees: splitList(col(r, 'assignees')), start: parseAnyDate(col(r, 'start')), due: parseAnyDate(col(r, 'due')), list: col(r, 'list'), tags: splitList(col(r, 'tags')), priority: col(r, 'priority'), content: col(r, 'content'), client: col(r, 'client'), address: col(r, 'address'), area: col(r, 'area'), contractNo: col(r, 'contractNo'), stage: col(r, 'stage') })).filter(r => r.name);
    const byId = new Map(rows.map(r => [r.id, r]));
    const rootOf = r => { let x = r, guard = 0; while (x.parent && byId.has(x.parent) && guard++ < 50) x = byId.get(x.parent); return x; };
    const projects = new Map(); const order = [];
    const projOf = (key, base) => { if (!projects.has(key)) { projects.set(key, Object.assign({ track: opts.track || 'ep', name: key, cuId: '', status: '', start: '', due: '', assignees: [], client: '', address: '', area: '', contractNo: '', list: '', tags: [], priority: '', note: '', tasks: [] }, base || {})); order.push(key); } return projects.get(key); };
    const task = r => ({ title: r.name, cuId: r.id, status: r.status, done: CLICKUP_DONE.test(r.status), start: r.start, due: r.due, assignees: r.assignees, tags: r.tags, priority: r.priority, stage: r.stage, note: r.content });
    if (opts.source === 'list') {
      for (const r of rows) { const p = projOf(r.list || 'Без списка', { list: r.list }); if (!p.client && r.client) Object.assign(p, { client: r.client, address: r.address, area: r.area, contractNo: r.contractNo }); p.tasks.push(task(r)); }
    } else {
      for (const r of rows) if (!r.parent || !byId.has(r.parent)) projOf(r.name, { name: r.name, cuId: r.id, status: r.status, start: r.start, due: r.due, assignees: r.assignees, client: r.client, address: r.address, area: r.area, contractNo: r.contractNo, list: r.list, tags: r.tags, priority: r.priority, note: r.content });
      for (const r of rows) if (r.parent && byId.has(r.parent)) projOf(rootOf(r).name).tasks.push(task(r));
    }
    for (const p of projects.values()) {
      const allDone = p.tasks.length > 0 && p.tasks.every(t => t.done);
      p.pmStatus = p.status ? clickupStatus(p.status) : (allDone ? 'Готово' : 'В работе');
      if (!p.start) p.start = p.tasks.map(t => t.start).filter(Boolean).sort()[0] || '';
      if (!p.due) p.due = p.tasks.map(t => t.due).filter(Boolean).sort().pop() || '';
    }
    return order.map(k => projects.get(k));
  }

  // ---- рабочий календарь РК (для сроков «N рабочих дней» по договорам) ----
  const KZ_FIXED = ['01-01', '01-02', '01-07', '03-08', '03-21', '03-22', '03-23', '05-01', '05-07', '05-09', '07-06', '08-30', '10-25', '12-16'];
  const KZ_KURBAN = { 2022: '07-09', 2023: '06-28', 2024: '06-16', 2025: '06-06', 2026: '05-27', 2027: '05-16', 2028: '05-05' };
  const holidayCache = {};
  const holidaysOf = year => {
    if (holidayCache[year]) return holidayCache[year];
    const base = KZ_FIXED.concat(KZ_KURBAN[year] ? [KZ_KURBAN[year]] : []).map(md => `${year}-${md}`);
    const set = new Set(base);
    for (const d of base) { // выпал на выходной — переносится на следующий рабочий день
      const wd = new Date(d + 'T00:00:00Z').getUTCDay();
      if (wd === 0 || wd === 6) { let n = addDays(d, wd === 6 ? 2 : 1); while (set.has(n) || [0, 6].includes(new Date(n + 'T00:00:00Z').getUTCDay())) n = addDays(n, 1); set.add(n); }
    }
    return (holidayCache[year] = set);
  };
  const isWorkDay = d => { const wd = new Date(d + 'T00:00:00Z').getUTCDay(); return wd !== 0 && wd !== 6 && !holidaysOf(Number(d.slice(0, 4))).has(d); };
  const nextWorkDay = d => { let x = d; while (!isWorkDay(x)) x = addDays(x, 1); return x; };
  // n-й рабочий день, считая стартовый рабочий день первым (срок «120 рабочих дней» → последний день срока)
  const addWorkDays = (start, n) => { let d = nextWorkDay(start), k = 1; const N = Math.max(1, Math.round(n)); while (k < N) { d = addDays(d, 1); if (isWorkDay(d)) k++; } return d; };
  const workDaysBetween = (a, b) => { let d = a, k = 0; while (d <= b) { if (isWorkDay(d)) k++; d = addDays(d, 1); } return k; };
  const TERM_UNITS = ['рабочих', 'календарных', 'месяцев'];
  // конец срока по договору: старт (первый день отсчёта) + срок в единицах договора
  const termEnd = (start, n, unit) => { if (!start || !(Number(n) > 0)) return ''; const N = Number(n); if (unit === 'календарных') return addDays(start, N); if (unit === 'месяцев') { const [y, m, d] = start.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + Math.round(N), Math.min(d, 28))); return iso(t); } return addWorkDays(start, N); };
  const contractLabel = p => p && (p.contractNo || p.contractDate || p.contractTerm) ? [p.contractNo ? `Договор № ${p.contractNo}` : 'Договор', p.contractDate ? `от ${p.contractDate.split('-').reverse().join('.')}` : '', p.contractTerm ? `· срок ${p.contractTerm} ${p.contractTermUnit || 'рабочих'} дн.` : ''].filter(Boolean).join(' ') : '';

  // пункты проекта из шаблона. opts: { start, due, months } — для АН (этап на каждый месяц; по умолчанию 6 месяцев или до даты по договору)
  function itemsFromTemplate(track, pid, opts) {
    opts = opts || {}; const out = []; let order = 0;
    const push = (si, stageName, x) => out.push({ pid, stage: si, stageName, title: x.t, role: x.role, section: ROLE_SECTION[x.role] || '', weeks: x.w, crit: x.crit, optional: x.opt, code: x.code || '', deps: (x.deps || []).slice(), done: false, na: false, due: '', assigneeId: '', contractor: '', note: '', order: order++ });
    (TEMPLATES[track] || []).forEach((s, si) => s.items.forEach(x => push(si + 1, s.name, x)));
    if (track === 'an') {
      const base = (TEMPLATES.an || []).length; const s0 = opts.start && ym(opts.start);
      let months = Number(opts.months) || 0; if (!months && s0 && opts.due && ym(opts.due) >= s0) months = monthsDiff(s0, ym(opts.due)) + 1; months = Math.min(36, Math.max(1, months || 6));
      for (let k = 0; k < months; k++) { const nm = `${base + k + 1}. Месяц ${k + 1}${s0 ? ' — ' + mname(addMonths(s0, k)) : ''}`; AN_MONTHLY.forEach(x => push(base + k + 1, nm, x)); }
    }
    return out;
  }
  // коды: кириллические А В С Е Н К М О Р Т Х → латиница (в таблице встречается «С5»)
  const normCode = c => String(c || '').trim().toUpperCase().replace(/[АВСЕНКМОРТХ]/g, ch => 'ABCEHKMOPTX'['АВСЕНКМОРТХ'.indexOf(ch)]);
  const finished = i => !!i && (i.done || i.na);
  // пункты-блокеры (по кодам deps) внутри одного проекта
  const depItems = (items, it) => (it && it.deps || []).map(c => items.find(i => i.pid === it.pid && normCode(i.code) === normCode(c))).filter(Boolean);
  // коды блокеров, которые ещё не закрыты — «ждёт: B3»
  const waitingFor = (items, it) => finished(it) ? [] : depItems(items, it).filter(d => !finished(d)).map(d => d.code);
  // план: пункт с блокерами начинается, когда закрыты все блокеры (раннее начало = конец блокеров); без блокеров — с начала своего этапа;
  // этапы идут друг за другом (следующий начинается, когда закончился самый долгий пункт предыдущего). fitTo — растянуть/сжать под дату по договору.
  function plan(items, start, fitTo) {
    const stages = [...new Set(items.map(i => i.stage))].sort((a, b) => a - b);
    const byCode = new Map(items.filter(i => i.code).map(i => [normCode(i.code), i]));
    const dur = it => it.na ? 0 : Math.max(1.4, (Number(it.weeks) || 1) * 7);
    const schedule = k => {
      const startOf = {}, endOf = {}; let prevEnd = 0;
      for (const st of stages) {
        let pending = items.filter(i => i.stage === st), stageEnd = prevEnd, guard = 0;
        while (pending.length && guard++ < 50) {
          const later = [];
          for (const it of pending) {
            const deps = (it.deps || []).map(c => byCode.get(normCode(c))).filter(d => d && d.id !== it.id);
            if (deps.some(d => !finished(d) && endOf[d.id] === undefined)) { later.push(it); continue; } // блокер ещё не рассчитан (тот же этап)
            const s0 = deps.length ? Math.max(prevEnd * 0, ...deps.map(d => finished(d) ? 0 : endOf[d.id])) : prevEnd;
            const e = s0 + dur(it) * k; startOf[it.id] = s0; endOf[it.id] = e; stageEnd = Math.max(stageEnd, e);
          }
          if (later.length === pending.length) { for (const it of later) { const e = prevEnd + dur(it) * k; startOf[it.id] = prevEnd; endOf[it.id] = e; stageEnd = Math.max(stageEnd, e); } break; } // цикл или блокер из следующего этапа — от начала этапа
          pending = later;
        }
        prevEnd = stageEnd;
      }
      return { startOf, endOf, total: prevEnd };
    };
    const base = schedule(1);
    const k = fitTo && start && fitTo > start && base.total > 0 ? days(start, fitTo) / base.total : 1;
    const sch = k === 1 ? base : schedule(k);
    const out = {}, starts = {}; for (const it of items) { out[it.id] = addDays(start, sch.endOf[it.id] || 0); starts[it.id] = addDays(start, sch.startOf[it.id] || 0); }
    return { due: out, start: starts, end: addDays(start, sch.total), weeks: Math.round(sch.total / 7) };
  }
  function progress(items) {
    const act = items.filter(i => !i.na); const done = act.filter(i => i.done).length;
    const st = [...new Set(act.map(i => i.stage))].sort((a, b) => a - b);
    const cur = st.find(s => act.some(i => i.stage === s && !i.done));
    const curItem = act.find(i => i.stage === cur);
    return { total: act.length, done, pct: act.length ? Math.round(done / act.length * 100) : 0, stage: cur || (st.length ? st[st.length - 1] : 0), stageName: curItem ? curItem.stageName : (act.length ? 'Готово' : '—') };
  }
  const blockerAge = (b, t) => days(b.since || String(b.createdAt || '').slice(0, 10) || t, t || today());
  // строка реестра
  function summary(p, items, blockers, t) {
    t = t || today(); const mine = items.filter(i => i.pid === p.id); const pr = progress(mine);
    const open = mine.filter(i => !i.done && !i.na);
    const overdue = open.filter(i => i.due && i.due < t);
    const bl = blockers.filter(b => b.pid === p.id && b.status !== 'closed');
    const next = open.filter(i => i.due).sort((a, b) => a.due.localeCompare(b.due))[0] || null;
    const deadline = p.forecast || p.due || '';
    return Object.assign({}, p, { progress: pr, overdueN: overdue.length, blockersN: bl.length, blockerMaxDays: bl.reduce((m, b) => Math.max(m, blockerAge(b, t)), 0), next, leadId: p[LEAD_FIELD[p.track]] || p.gipId || p.pmId || '', late: !!(p.due && p.due < t && ACTIVE(p.status)), hot: !!(deadline && deadline >= t && days(t, deadline) <= 14 && ACTIVE(p.status)), health: health(p, mine, t) });
  }
  function dashboard(projects, items, blockers, t) {
    t = t || today(); const rows = projects.map(p => summary(p, items, blockers, t)); const active = rows.filter(r => ACTIVE(r.status));
    const byTrack = {};
    for (const tr of TRACK_ORDER) {
      const l = active.filter(r => r.track === tr);
      const names = tr === 'an' ? ['1. Запуск АН', 'Ведение (помесячно)'] : stageNames(tr);
      byTrack[tr] = { n: l.length, all: rows.filter(r => r.track === tr).length, late: l.filter(r => r.late).length, funnel: names.map((name, i) => ({ name, n: tr === 'an' ? l.filter(r => i === 0 ? r.progress.stage <= 1 : r.progress.stage > 1).length : l.filter(r => r.progress.stage === i + 1).length })) };
    }
    const load = {}; for (const r of active) for (const k of ['gipId', 'pmId']) if (r[k]) { const x = load[r[k]] || (load[r[k]] = { concept: 0, ep: 0, rp: 0, an: 0, overdue: 0, late: 0 }); x[r.track] = (x[r.track] || 0) + 1; x.overdue += r.overdueN; if (r.late) x.late++; }
    const byStatus = {}; for (const r of active) byStatus[r.status || 'В работе'] = (byStatus[r.status || 'В работе'] || 0) + 1;
    const pids = new Set(projects.map(p => p.id)); const openBl = blockers.filter(b => b.status !== 'closed' && pids.has(b.pid)); // только блокеры переданных проектов (сводка раздела ЭП не считает блокеры РП)
    return { rows, active: active.length, byStatus, byTrack, late: active.filter(r => r.late).length, hot: active.filter(r => r.hot).length, overdueItems: active.reduce((s, r) => s + r.overdueN, 0), blockers: openBl.length, blockersOld: openBl.filter(b => blockerAge(b, t) > 14).length, load };
  }
  // Гант по месяцам: список месяцев от самого раннего старта до самого позднего срока (в пределах back/fwd месяцев от сегодня)
  function ganttMonths(rows, t, back, fwd) {
    t = t || today(); back = back == null ? 6 : back; fwd = fwd == null ? 18 : fwd;
    const cur = ym(t); let from = addMonths(cur, -1), to = addMonths(cur, 6);
    for (const r of rows) { const s = ym(r.start), e = ym(r.forecast || r.due); if (s && s < from) from = s; if (e && e > to) to = e; }
    if (monthsDiff(from, cur) > back) from = addMonths(cur, -back); if (monthsDiff(cur, to) > fwd) to = addMonths(cur, fwd);
    const out = []; for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
    return out;
  }
  const inMonth = (r, m) => { const s = ym(r.start), e = ym(r.forecast || r.due) || s; return !!s && s <= m && m <= e; };
  const ganttLoad = (rows, months) => months.map(m => rows.filter(r => inMonth(r, m)).length);
  // ссылка на доску Миро → адрес для встраивания
  const miroEmbed = url => { const m = String(url || '').match(/miro\.com\/app\/(?:board|live-embed)\/([A-Za-z0-9_=\-]+)/); return m ? `https://miro.com/app/live-embed/${m[1]}/` : ''; };
  // бюджет: план по разделам из карточки, факт — расходы по проекту из операций (деньги в модуле не вводятся, только план разделов)
  function budgetCalc(b) {
    b = b || {}; const num = v => Number(v) || 0; const secs = (b.sections || []).map(s => ({ name: s.name, sum: num(s.sum), executor: s.executor || '' }));
    const contract = num(b.contract), cost = secs.reduce((s, x) => s + x.sum, 0), marginTarget = b.marginTarget == null || b.marginTarget === '' ? 0.3 : num(b.marginTarget), target = contract * (1 - marginTarget);
    const gross = contract - cost, gip = contract * (b.gipShare == null ? 0 : num(b.gipShare)) || num(b.gipSum);
    return { contract, contractVat: num(b.contractVat), area: num(b.area), months: num(b.months), marginTarget, sections: secs.map(s => Object.assign(s, { pct: cost ? s.sum / cost : 0 })), cost, target, over: target - cost, gross, grossPct: contract ? gross / contract : null, gip, net: gross - gip, netPct: contract ? (gross - gip) / contract : null, perM2: num(b.area) ? contract / num(b.area) : null, objectType: b.objectType || '', note: b.note || '' };
  }

  // ---- Метод Пульса (pulsemanagement.org): две оценки, буфер расписания, температурный график, скорости, прогнозы, устав ----
  // оптимистичная оценка пункта (недель, вероятность 50 %) и пессимистичная (90 %); по умолчанию пессимистичная = ×2 (диапазоны «1–2 недели» регламента)
  const W = it => Number(it.weeks) || 1;
  const WMAX = it => Math.max(W(it), Number(it.weeksMax) || W(it) * 2);
  const stageLen = (items, st, f) => Math.max(0.2, ...items.filter(i => i.stage === st && !i.na).map(f));
  // цепь: этапы последовательно, длина этапа — самый долгий пункт. Буфер ≥ 50 % оптимистичной длины или разница пессимистичной и оптимистичной
  function chain(items) {
    const act = items.filter(i => !i.na); const stages = [...new Set(act.map(i => i.stage))].sort((a, b) => a - b);
    const opt = stages.reduce((s, st) => s + stageLen(act, st, W), 0) * 7, pess = stages.reduce((s, st) => s + stageLen(act, st, WMAX), 0) * 7;
    return { opt: Math.round(opt), pess: Math.round(pess), buffer: Math.round(Math.max(opt * 0.5, pess - opt)) };
  }
  const ZONES = { blue: 'профицит', green: 'по плану', yellow: 'готовить план изменений', red: 'применять план изменений', black: 'пересогласовать срок или объём' , none: 'нет сроков — задайте старт и дату по договору, затем «Разложить сроки»' };
  const ZONE_NAME_RU = { blue: 'синяя', green: 'зелёная', yellow: 'жёлтая', red: 'красная', black: 'чёрная', none: 'нет сроков' };
  const ZONE_RANK = { none: -1, blue: 0, green: 1, yellow: 2, red: 3, black: 4 };
  // диагональный буфер: x — доля выполненного объёма, y — доля съеденного буфера
  function zone(x, y) {
    if (y > 1) return 'black'; if (y < -0.3) return 'blue';
    const lo = 0.1 + 0.5 * x, hi = 0.4 + 0.6 * x; return y <= lo ? 'green' : y <= hi ? 'yellow' : 'red';
  }
  // состояние проекта: объём в неделях оценки, буфер, скорости (недель оценки в календарный день), три прогноза, зона
  function health(p, items, t) {
    t = t || today(); const mine = items.filter(i => i.pid === p.id && !i.na);
    const total = mine.reduce((s, i) => s + W(i), 0), doneW = mine.filter(i => i.done).reduce((s, i) => s + W(i), 0), remain = Math.max(0, total - doneW);
    const progress = total ? doneW / total : 0;
    const returns = mine.reduce((s, i) => s + (Number(i.returns) || 0), 0);
    // без старта или срока по договору зона не считается: «нет сроков» (серый чип), расход буфера и прогнозы пустые; такие проекты не попадают в красные/чёрные
    if (!p.start || !p.due) return { mode: 'none', start: p.start || '', planDays: 0, bufferDays: 0, planEnd: '', promised: '', elapsed: 0, total: Math.round(total * 10) / 10, doneW: Math.round(doneW * 10) / 10, remain: Math.round(remain * 10) / 10, progress: Math.round(progress * 1000) / 1000, timeProgress: 0, avgV: 0, curV: 0, addV: 0, addedW: 0, forecast: { optimistic: '', realistic: '', pessimistic: '' }, consumption: null, basis: 'сроки не заданы', zone: 'none', zoneLabel: ZONES.none, chain: chain(mine), returns };
    const start = p.start; const ch = chain(mine);
    let mode, planDays, bufferDays;
    if (p.due && p.due > start) { mode = 'contract'; const T = days(start, p.due); bufferDays = Math.max(1, Math.round(T * 0.3)); planDays = T - bufferDays; }
    else { mode = 'chain'; planDays = Math.max(1, ch.opt); bufferDays = Math.max(1, ch.buffer); }
    const planEnd = addDays(start, planDays), promised = addDays(start, planDays + bufferDays);
    const elapsed = Math.max(0, days(start, t)); const timeProgress = elapsed / planDays;
    const closed = mine.filter(i => i.done && i.doneAt && !['import', 'clickup'].includes(i.doneBy)); const since = addDays(t, -28); // отметки, поставленные импортом (реестр, ClickUp), скорость не измеряют
    const avgV = elapsed > 0 ? doneW / elapsed : 0; // средняя: весь выполненный объём (в т. ч. отмеченный по реестру) с начала проекта
    const curV = closed.filter(i => i.doneAt > since).reduce((s, i) => s + W(i), 0) / 28;
    const added = mine.filter(i => i.custom && i.createdAt && String(i.createdAt).slice(0, 10) > addDays(start, 1));
    const addedW = added.reduce((s, i) => s + W(i), 0), addV = elapsed > 0 ? addedW / elapsed : 0;
    const fc = v => remain <= 0 ? '' : v > 0 ? addDays(t, Math.min(3650, remain / v)) : '';
    const forecast = { optimistic: fc(avgV), realistic: fc(curV), pessimistic: fc(avgV - addV) };
    let consumption, basis;
    if (remain <= 0 && total) { const last = closed.map(i => i.doneAt).sort().pop() || t; consumption = days(planEnd, last) / bufferDays; basis = 'факт завершения'; }
    else if (forecast.realistic) { consumption = days(planEnd, forecast.realistic) / bufferDays; basis = 'прогноз по текущей скорости'; }
    else { consumption = (timeProgress - progress) * planDays / bufferDays; basis = 'прошедшее время против выполненного объёма'; }
    consumption = total ? Math.round(consumption * 100) / 100 : 0;
    const z = ACTIVE(p.status) || remain > 0 ? zone(progress, consumption) : (consumption > 1 ? 'black' : 'green');
    return { mode, start, planDays, bufferDays, planEnd, promised, elapsed, total: Math.round(total * 10) / 10, doneW: Math.round(doneW * 10) / 10, remain: Math.round(remain * 10) / 10, progress: Math.round(progress * 1000) / 1000, timeProgress: Math.round(timeProgress * 1000) / 1000, avgV: Math.round(avgV * 1000) / 1000, curV: Math.round(curV * 1000) / 1000, addV: Math.round(addV * 1000) / 1000, addedW: Math.round(addedW * 10) / 10, forecast, consumption, basis, zone: z, zoneLabel: ZONES[z], chain: ch, returns };
  }
  // Проход: контракт без НДС в месяц длительности (по договору или по цепи); руководителю/ГИПу с доступом к бюджету
  function throughput(p, h) {
    const contract = Number(p.budget && p.budget.contract) || 0; if (!contract || !h || h.mode === 'none') return null;
    const dur = p.due && p.start && p.due > p.start ? days(p.start, p.due) : h.planDays + h.bufferDays; const months = Math.max(0.5, dur / 30.4);
    return { contract, months: Math.round(months * 10) / 10, perMonth: Math.round(contract / months), perDay: Math.round(contract / dur) };
  }
  // приоритет портфеля: чёрные и красные с большим прогрессом первыми, затем жёлтые, затем по Проходу
  function priority(rows) {
    return rows.slice().sort((a, b) => { const ha = a.health || {}, hb = b.health || {}; return (ZONE_RANK[hb.zone] || 0) - (ZONE_RANK[ha.zone] || 0) || (hb.progress || 0) - (ha.progress || 0) || ((b.throughput || {}).perMonth || 0) - ((a.throughput || {}).perMonth || 0) || String(a.forecast || a.due || '9').localeCompare(String(b.forecast || b.due || '9')); }).map((r, i) => Object.assign(r, { rank: i + 1 }));
  }
  // устав проекта (манифест): одна цель, критерии завершения и успеха
  const CHARTER_FIELDS = [['what', 'Что делаем (результат, без глаголов)'], ['why', 'Зачем (обоснование, ценность для заказчика и бюро)'], ['doneCriterion', 'Критерий завершения (как узнаем, что проект завершён; зависит только от нас)'], ['successCriterion', 'Критерий успеха (как узнаем, что проект успешен; может зависеть от внешних факторов)'], ['requirements', 'Требования к результату (характеристики, а не действия)'], ['environment', 'Факторы среды (что влияет снаружи и внутри команды)'], ['threats', 'Угрозы (что может убить проект)'], ['time', 'Время (сроки по договору, контрольные точки)'], ['budget', 'Бюджет (деньги и материальные ресурсы, которые есть сейчас)'], ['people', 'Люди (кто работает, кто может помочь)']];
  const charterPhrase = c => c && c.what ? `Мы делаем «${c.what}» для того, чтобы «${c.why || '…'}», до тех пор пока не случится «${c.doneCriterion || '…'}», и узнаем, что проект успешен, когда «${c.successCriterion || '…'}».` : '';
  const charterComplete = c => !!c && ['what', 'why', 'doneCriterion', 'successCriterion'].every(k => String(c[k] || '').trim());
  // статус из дорожной карты (ГОТОВО / В РАБОТЕ / У ГАПа / У ЗАКАЗЧИКА / НЕ НАЧАТО) → отметка «сделано» и подпись статуса
  function roadmapStatus(v) {
    const s = String(v == null ? '' : v).trim(); if (!s) return { done: undefined, label: undefined };
    if (/готов|done|complete|закрыт|выполнен/i.test(s)) return { done: true, label: 'ГОТОВО' };
    if (/не\s*начат|not\s*started|to\s*do/i.test(s)) return { done: false, label: 'НЕ НАЧАТО' };
    if (/у\s*гап/i.test(s)) return { done: false, label: 'У ГАПа' };
    if (/у\s*заказчик|client|customer/i.test(s)) return { done: false, label: 'У ЗАКАЗЧИКА' };
    if (/в\s*работе|in\s*progress|progress/i.test(s)) return { done: false, label: 'В РАБОТЕ' };
    return { done: false, label: s.toUpperCase().slice(0, 40) };
  }
  // ---- канбан ----
  // проекты: колонки — статусы проекта (STATUS); «Отменён» свёрнут по умолчанию
  const KANBAN_PROJECT_HIDDEN = ['Отменён'];
  // пункты: колонки статуса пункта. Новое поле kstatus (todo | doing | review), совместимое со старым done: «Готово» = done.
  // Если kstatus не задан — по подписи дорожной карты rmStatus (НЕ НАЧАТО → к выполнению, В РАБОТЕ → в работе, У ГАПа / У ЗАКАЗЧИКА → на проверке), иначе «к выполнению».
  const KANBAN = [['todo', 'К выполнению'], ['doing', 'В работе'], ['review', 'На проверке'], ['done', 'Готово']];
  const KANBAN_KEYS = KANBAN.map(k => k[0]);
  const KANBAN_OPEN = ['todo', 'doing', 'review'];
  function rmKanban(label) {
    const s = String(label || '').toUpperCase(); if (!s) return '';
    if (/ГОТОВО/.test(s)) return 'done'; if (/НЕ\s*НАЧАТО/.test(s)) return 'todo'; if (/У\s*ГАП|У\s*ЗАКАЗЧИК/.test(s)) return 'review'; if (/В\s*РАБОТЕ/.test(s)) return 'doing'; return '';
  }
  function itemKanban(it) {
    if (!it) return 'todo'; if (it.done) return 'done';
    if (KANBAN_OPEN.includes(it.kstatus)) return it.kstatus;
    const rm = rmKanban(it.rmStatus); return rm && rm !== 'done' ? rm : 'todo';
  }
  const truthy = v => v === true || v === 1 || v === '1' || v === 'true';
  // согласовать правку пункта: kstatus ↔ done. На входе — уже отфильтрованный по правам patch; на выходе — patch с done (boolean) и kstatus.
  // kstatus 'done' → done: true (то же, что отметка «сделано»); открытая колонка у сделанного пункта → done: false (возврат);
  // только done: true → kstatus 'done'; done: false у сделанного → kstatus 'doing' (вернули в работу). Неизвестный kstatus отбрасывается.
  function kanbanPatch(it, patch) {
    const out = Object.assign({}, patch); it = it || {};
    if ('kstatus' in out && !KANBAN_KEYS.includes(out.kstatus)) delete out.kstatus;
    if ('kstatus' in out) {
      if (out.kstatus === 'done') out.done = true;
      else if ('done' in out && truthy(out.done)) out.kstatus = 'done'; // явная отметка «сделано» сильнее колонки
      else if (it.done || 'done' in out) out.done = false;
    } else if ('done' in out) {
      const d = truthy(out.done); out.done = d;
      if (d) out.kstatus = 'done'; else if (it.done || it.kstatus === 'done') out.kstatus = 'doing';
    }
    return out;
  }
  const canMoveProject = (u, p) => isManager(u, p); // смена статуса перетаскиванием — те же права, что правка карточки

  // снимок показателей для ретроспективы
  const retroSnapshot = (h, blockers) => ({ progress: h.progress, zone: h.zone, consumption: h.consumption, curV: h.curV, avgV: h.avgV, addedW: h.addedW, remain: h.remain, forecast: h.forecast, returns: h.returns, blockers: (blockers || []).filter(b => b.status !== 'closed').length });

  // ---- Журнал проекта (pmLog): ручные записи + автоматические события, собранные на лету из того, что уже хранится ----
  const LOG_TYPES = [['meeting', 'Встреча'], ['decision', 'Решение'], ['client', 'Письмо / звонок заказчику'], ['remark', 'Замечание экспертизы / заказчика'], ['issue', 'Выдача'], ['photo', 'Фото / стройка'], ['note', 'Заметка']];
  const LOG_TYPE_KEYS = LOG_TYPES.map(x => x[0]);
  const logTypeLabel = k => (LOG_TYPES.find(x => x[0] === k) || [k, 'Заметка'])[1];
  const LOG_MAX_TEXT = 4000, LOG_MAX_FILE = 20 * 1024 * 1024, LOG_MAX_FILES = 10, LOG_MAX_BATCH = 500, LOG_MIN_DATE = '2000-01-01';
  const LOG_FILE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' };
  const LOG_KEY_RE = /^[a-z0-9]+-[a-z0-9]+\.(png|jpg|webp|gif|pdf)$/;
  // содержимое файла совпадает с типом (bytes — Buffer или Uint8Array)
  function logFileSig(ext, bytes) {
    const b = bytes || []; const s = (i, n) => String.fromCharCode.apply(null, Array.prototype.slice.call(b, i, i + n));
    if (ext === 'png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
    if (ext === 'jpg') return b[0] === 0xff && b[1] === 0xd8;
    if (ext === 'gif') return s(0, 4) === 'GIF8';
    if (ext === 'webp') return s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP';
    if (ext === 'pdf') return s(0, 5) === '%PDF-';
    return false;
  }
  // кто добавляет записи: ГИП/ПМ проекта и руководители, участники проекта, сотрудник в «своём» проекте, все, кто может править хотя бы один пункт проекта
  const canLogAdd = (u, p, items) => !!u && !!p && (isManager(u, p) || memberIds(p).includes(u.id) || (isStaff(u) && staffSees(u, p, items)) || (items || []).some(i => i.pid === p.id && canEditItem(u, p, i)));
  // править и удалять запись — автор или ГИП/ПМ проекта и руководители
  const canLogEdit = (u, p, rec) => !!u && !!rec && (isManager(u, p) || rec.by === u.id);
  // дата записи: ДД.ММ.ГГГГ, ДД.ММ.ГГ, ГГГГ-ММ-ДД → ГГГГ-ММ-ДД; '' — если не дата или несуществующий день
  function logDate(v) {
    const s = String(v == null ? '' : v).trim(); let m, y, mo, d;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, mo, d] = [m[1], m[2], m[3]];
    else if ((m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/))) [d, mo, y] = [m[1], m[2], m[3].length === 2 ? '20' + m[3] : m[3]];
    else return '';
    const out = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`; const dt = new Date(out + 'T00:00:00Z');
    return !isNaN(dt) && dt.toISOString().slice(0, 10) === out ? out : '';
  }
  // проверка и очистка записи: → { rec } или { error }
  function cleanLog(body, t) {
    body = body || {}; t = t || today();
    const date = body.date ? logDate(body.date) : t; if (!date) return { error: 'Дата: ДД.ММ.ГГГГ' };
    if (date > t) return { error: 'Дата в будущем — журнал о том, что уже произошло' }; if (date < LOG_MIN_DATE) return { error: 'Слишком ранняя дата' };
    const text = String(body.text || '').trim().slice(0, LOG_MAX_TEXT); if (!text) return { error: 'Напишите, что произошло' };
    const type = LOG_TYPE_KEYS.includes(body.type) ? body.type : 'note';
    return { rec: { date, type, text, participants: String(body.participants || '').trim().slice(0, 500) } };
  }
  // тип по началу текста: «Встреча: …», «Решение — …», «Письмо заказчику: …» → [тип, текст без метки] (первое слово метки из 1–3 слов)
  const LOG_TYPE_WORDS = { meeting: ['встреча', 'совещание', 'планерка'], decision: ['решение', 'решили'], client: ['письмо', 'звонок', 'созвон', 'созвонились'], remark: ['замечание', 'замечания'], issue: ['выдача', 'выдали', 'передали'], photo: ['фото', 'стройка', 'площадка'], note: ['заметка'] };
  function logTypeFromText(text, def) {
    const s = String(text || ''); const m = s.match(/^\s*([А-Яа-яЁё /]+?)\s*[:—–-]\s+(.*)$/s);
    if (m) { const w = normTitle(m[1]).split(' '); const hit = w.length <= 3 && Object.keys(LOG_TYPE_WORDS).find(k => LOG_TYPE_WORDS[k].includes(w[0])); if (hit) return [hit, m[2].trim()]; }
    return [def || 'note', s.trim()];
  }
  // импорт пачкой: строки «ДД.ММ.ГГГГ — текст» (разделитель — тире, двоеточие или пробел); строка без даты продолжает предыдущую запись.
  // В начале текста можно указать тип: «12.03.2026 — Встреча: …». → { rows: [{ date, type, text, line }], errors: [{ line, text, reason }] }
  function parseLogBatch(text, opts) {
    opts = opts || {}; const t = opts.today || today(); const def = LOG_TYPE_KEYS.includes(opts.type) ? opts.type : 'note';
    const rows = [], errors = []; let cur = null;
    String(text || '').replace(/\r/g, '').split('\n').forEach((raw, i) => {
      const line = raw.trim(); if (!line) { cur = null; return; }
      const m = line.match(/^(\d{1,2}[./]\d{1,2}[./](?:\d{4}|\d{2})|\d{4}-\d{1,2}-\d{1,2})\s*(?:[—–:-]\s*|\s+)(.*)$/);
      if (!m) { if (cur) { cur.text = (cur.text + '\n' + line).slice(0, LOG_MAX_TEXT); return; } errors.push({ line: i + 1, text: line, reason: 'нет даты в начале строки' }); return; }
      const date = logDate(m[1]); const [type, body] = logTypeFromText(m[2], def);
      if (!date) { errors.push({ line: i + 1, text: line, reason: 'нет такой даты' }); cur = null; return; }
      if (date > t) { errors.push({ line: i + 1, text: line, reason: 'дата в будущем' }); cur = null; return; }
      if (date < LOG_MIN_DATE) { errors.push({ line: i + 1, text: line, reason: 'слишком ранняя дата' }); cur = null; return; }
      if (!body) { errors.push({ line: i + 1, text: line, reason: 'нет текста' }); cur = null; return; }
      cur = { date, type, text: body.slice(0, LOG_MAX_TEXT), line: i + 1 }; rows.push(cur);
    });
    if (rows.length > LOG_MAX_BATCH) { errors.push({ line: rows[LOG_MAX_BATCH].line, text: '', reason: `больше ${LOG_MAX_BATCH} записей за раз — разбейте на части` }); rows.length = LOG_MAX_BATCH; }
    return { rows, errors };
  }
  // ISO-время → дата по Алматы
  const almatyDate = at => { const d = new Date(at); return isNaN(d) ? '' : d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Almaty' }); };
  const PROJ_HIST_FIELDS = ['status', 'start', 'due', 'forecast', 'name', 'pmId', 'gipId'];
  const PROJ_HIST_LABEL = { status: 'Статус', start: 'Старт', due: 'Дата по договору', forecast: 'Прогноз', name: 'Название' };
  // история карточки проекта (статус, сроки, название): последние 50 изменений — кто, когда, что
  function projectHistory(p, patch, userId, note) {
    const h = Array.isArray(p.history) ? p.history.slice() : []; const at = new Date().toISOString();
    for (const k of PROJ_HIST_FIELDS) if (k in patch && String(patch[k] == null ? '' : patch[k]) !== String(p[k] == null ? '' : p[k])) h.push(Object.assign({ at, by: userId || '', field: k, from: p[k] == null ? '' : p[k], to: patch[k] == null ? '' : patch[k] }, note ? { note } : {}));
    return h.slice(-50);
  }
  const fmtD = v => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : (v ? String(v) : '—'); };
  // лента проекта: записи журнала + события из карточки, пунктов (it.history), блокеров и ретро. Новые сверху.
  // Массовые отметки (импорт, дорожная карта) одного дня и автора сворачиваются в одно событие.
  function projectFeed(p, items, blockers, logs, opts) {
    opts = opts || {}; const ev = []; const add = e => { if (e.date) ev.push(Object.assign({ kind: 'auto', at: '', by: '', text: '' }, e)); };
    for (const r of logs || []) if (r.pid === p.id) ev.push(Object.assign({}, r, { kind: 'log', at: r.createdAt || '' }));
    if (p.createdAt) add({ type: 'created', date: almatyDate(p.createdAt), at: p.createdAt, by: p.createdBy || '', text: `Проект заведён в системе${p.imported && p.imported.source ? ` (импорт: ${p.imported.source})` : ''}` });
    for (const e of p.history || []) add({ type: e.field === 'status' ? 'status' : 'dates', date: almatyDate(e.at), at: e.at, by: e.by, text: `${PROJ_HIST_LABEL[e.field] || e.field}: ${['start', 'due', 'forecast'].includes(e.field) ? `${fmtD(e.from)} → ${fmtD(e.to)}` : `${e.from || '—'} → ${e.to || '—'}`}${e.note ? ` (${e.note})` : ''}` });
    if (p.handedAt) add({ type: 'status', date: p.handedAt, text: `Передан на следующую стадию${p.rpId ? ' (РП)' : p.epId ? ' (ЭП)' : ''}` });
    if (p.collapsedAt) add({ type: 'status', date: p.collapsedAt, text: 'Концепция свёрнута в ЭП (этап 1)' });
    if (p.rebuiltAt) add({ type: 'dates', date: almatyDate(p.rebuiltAt), at: p.rebuiltAt, by: p.rebuiltBy || '', text: 'Пункты пересобраны по текущему шаблону' });
    const bulk = new Map();
    for (const it of items || []) {
      if (it.pid !== p.id) continue; let doneSeen = false;
      for (const e of it.history || []) {
        if (e.field === 'created') { add({ type: 'item', date: almatyDate(e.at), at: e.at, by: e.by, text: `Добавлен пункт: ${it.title}`, ref: it.id }); continue; }
        if (e.field !== 'done') continue; const on = e.to === true || e.to === 'true'; if (on) doneSeen = true;
        const x = { type: on ? 'done' : 'undone', date: almatyDate(e.at), at: e.at, by: e.by, text: `${on ? 'Сделано' : 'Возвращён в работу'}: ${it.title}${e.note ? ` (${e.note})` : ''}`, ref: it.id, title: it.title, note: e.note || '' };
        if (e.note) { const k = [x.type, x.date, x.by, e.note].join('|'); if (!bulk.has(k)) bulk.set(k, []); bulk.get(k).push(x); } else add(x);
      }
      for (const e of it.history || []) if (e.field === 'review' && e.to === 'returned') add({ type: 'review', date: almatyDate(e.at), at: e.at, by: e.by, text: `Возвращено с замечанием: ${it.title}${e.note ? ` — ${e.note}` : ''}`, ref: it.id });
      for (const x of it.shifts || []) {
        const span = `${fmtD(x.from)} → ${fmtD(x.to)}`;
        if (x.status === 'direct') { add({ type: 'shift', date: almatyDate(x.at), at: x.at, by: x.by, text: `Срок перенесён без запроса: ${it.title} — ${span}`, ref: it.id }); continue; }
        add({ type: 'shift', date: almatyDate(x.at), at: x.at, by: x.by, text: `Запрошен перенос срока: ${it.title} — ${span}${x.reason ? `. Причина: ${x.reason}` : ''}`, ref: it.id });
        if (x.decidedAt && x.status !== 'pending') add({ type: 'shift', date: almatyDate(x.decidedAt), at: x.decidedAt, by: x.decidedBy || '', text: `Перенос ${x.status === 'approved' ? 'утверждён' : x.status === 'rejected' ? 'отклонён' : 'отменён'}: ${it.title} — ${span}${x.comment ? `. ${x.comment}` : ''}`, ref: it.id });
      }
      if (it.done && !doneSeen && it.doneAt && /^\d{4}-\d{2}-\d{2}$/.test(it.doneAt)) add({ type: 'done', date: it.doneAt, by: it.doneBy && !['import', 'clickup'].includes(it.doneBy) ? it.doneBy : '', text: `Сделано: ${it.title}${it.doneNote ? ` (${it.doneNote})` : ''}`, ref: it.id });
    }
    for (const list of bulk.values()) {
      if (list.length < 6) { list.forEach(add); continue; }
      const x = list[0]; add({ type: x.type, date: x.date, at: x.at, by: x.by, text: `${x.type === 'done' ? 'Отмечено сделанными' : 'Возвращено в работу'}: ${list.length} пунктов (${x.note})`, titles: list.map(y => y.title) });
    }
    for (const b of blockers || []) {
      if (b.pid !== p.id) continue;
      add({ type: 'blocker', date: b.since || almatyDate(b.createdAt), at: b.createdAt || '', by: b.createdBy || '', text: `Блокер: ${b.what}${b.holder ? ` — ждём: ${b.holder}` : ''}`, ref: b.id });
      if (b.status === 'closed' && b.closedAt) add({ type: 'blocker-closed', date: b.closedAt, by: b.closedBy || '', text: `Блокер снят: ${b.what}`, ref: b.id });
    }
    for (const e of opts.extra || []) add(e); // готовые события извне (переписка WhatsApp — одной строкой на день и группу)
    for (const r of p.retros || []) { const s = r.snapshot || {}; add({ type: 'retro', date: r.date, by: r.by || '', text: `Ретроспектива${s.progress != null ? `: выполнено ${Math.round(s.progress * 100)} %` : ''}${r.interpret ? ` — ${String(r.interpret).slice(0, 200)}` : ''}`, ref: r.id }); }
    return ev.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.at || '').localeCompare(String(a.at || '')) || (a.kind === 'log' ? -1 : 0) - (b.kind === 'log' ? -1 : 0));
  }
  const AUTO_LABEL = { created: 'Проект', status: 'Статус', dates: 'Сроки', item: 'Пункт', done: 'Сделано', undone: 'Возврат', blocker: 'Блокер', 'blocker-closed': 'Блокер снят', retro: 'Ретро', chat: 'WhatsApp', shift: 'Перенос', review: 'Проверка' };
  const feedLabel = e => e.kind === 'log' ? logTypeLabel(e.type) : (AUTO_LABEL[e.type] || 'Событие');
  // фильтр ленты: mode 'log' — только записи; q — слова через пробел (все должны встретиться в тексте, типе, участниках, авторе)
  function filterFeed(events, o) {
    o = o || {}; const words = String(o.q || '').toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean); const nameOf = o.nameOf || (() => '');
    return (events || []).filter(e => (o.mode !== 'log' || e.kind === 'log') && (!words.length || (s => words.every(w => s.includes(w)))([e.text, e.participants, feedLabel(e), nameOf(e.by), fmtD(e.date), (e.files || []).map(f => f.name).join(' ')].join(' ').toLowerCase().replace(/ё/g, 'е'))));
  }
  // лента в CSV для Excel (разделитель «;», BOM добавляет вызывающий)
  function feedCsv(events, nameOf) {
    nameOf = nameOf || (() => ''); const q = v => { const s = String(v == null ? '' : v); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = [['Дата', 'Источник', 'Тип', 'Запись', 'Участники', 'Автор', 'Вложения']];
    for (const e of events || []) rows.push([fmtD(e.date), e.kind === 'log' ? 'запись' : 'событие', feedLabel(e), e.text + (e.titles ? ': ' + e.titles.join('; ') : ''), e.participants || '', nameOf(e.by) || '', (e.files || []).map(f => f.name || f.key).join(', ')]);
    return rows.map(r => r.map(q).join(';')).join('\r\n');
  }

  // ---- Переписка (WhatsApp): группы pmChats и сообщения pmChatMessages. Сообщения присылает служба-мост (POST /api/pm/chats/ingest), ERP только хранит и показывает ----
  const CHAT_KINDS = ['text', 'image', 'doc', 'audio', 'video', 'system'];
  const CHAT_MAX_BATCH = 200, CHAT_MAX_BYTES = 25 * 1024 * 1024, CHAT_MAX_FILE = 20 * 1024 * 1024, CHAT_MAX_TEXT = 10000, CHAT_PAGE = 100;
  const CHAT_BRIDGE_STATES = { connected: 'подключён', qr: 'ждёт QR-код', disconnected: 'отключён' };
  const CHAT_FOLDER_DEFAULT = '00-Входящие WhatsApp'; // подпапка в папке проекта, куда копируются принятые файлы
  // что принимаем: картинки, PDF, офисные документы, аудио (видео и прочее — нет: сообщение сохраняется без файла)
  const CHAT_FILE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/msword': 'doc', 'application/vnd.ms-excel': 'xls', 'application/vnd.ms-powerpoint': 'ppt',
    'audio/ogg': 'ogg', 'audio/opus': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/amr': 'amr' };
  const CHAT_EXT_MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    doc: 'application/msword', xls: 'application/vnd.ms-excel', ppt: 'application/vnd.ms-powerpoint', ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', amr: 'audio/amr' };
  const CHAT_KEY_RE = /^[a-z0-9]+-[a-z0-9]+\.(png|jpg|webp|gif|pdf|docx|xlsx|pptx|doc|xls|ppt|ogg|mp3|m4a|aac|wav|amr)$/;
  const CHAT_INLINE = ['png', 'jpg', 'webp', 'gif', 'pdf', 'ogg', 'mp3', 'm4a', 'aac', 'wav', 'amr']; // офисные документы отдаются только на скачивание
  // расширение по типу («audio/ogg; codecs=opus» → ogg); если тип неизвестен или общий — по расширению имени; '' — не принимаем
  function chatFileExt(type, name) {
    const base = String(type || '').split(';')[0].trim().toLowerCase(); if (CHAT_FILE_TYPES[base]) return CHAT_FILE_TYPES[base];
    if (base && base !== 'application/octet-stream' && base !== 'binary/octet-stream') return '';
    let e = (String(name || '').toLowerCase().match(/\.([a-z0-9]{2,5})$/) || [])[1] || ''; if (e === 'jpeg') e = 'jpg'; if (e === 'opus' || e === 'oga') e = 'ogg';
    return CHAT_EXT_MIME[e] ? e : '';
  }
  // сигнатура содержимого: картинки и PDF — как в журнале; docx/xlsx/pptx — zip, doc/xls/ppt — OLE2, аудио — заголовок контейнера
  function chatFileSig(ext, bytes) {
    const b = bytes || []; const s = (i, n) => String.fromCharCode.apply(null, Array.prototype.slice.call(b, i, i + n));
    if (['png', 'jpg', 'gif', 'webp', 'pdf'].includes(ext)) return logFileSig(ext, b);
    if (['docx', 'xlsx', 'pptx'].includes(ext)) return b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
    if (['doc', 'xls', 'ppt'].includes(ext)) return b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
    if (ext === 'ogg') return s(0, 4) === 'OggS';
    if (ext === 'mp3') return s(0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
    if (ext === 'm4a') return s(4, 4) === 'ftyp';
    if (ext === 'aac') return (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) || s(4, 4) === 'ftyp';
    if (ext === 'wav') return s(0, 4) === 'RIFF' && s(8, 4) === 'WAVE';
    if (ext === 'amr') return s(0, 5) === '#!AMR';
    return false;
  }
  const chatIsImage = f => /^image\//.test(String((f && f.type) || ''));
  // имя файла для папки проекта: только последний сегмент пути, без запрещённых в Windows символов и управляющих, без точек и пробелов по краям,
  // служебные имена (CON, NUL, COM1…) — с подчёркиванием, длина ≤ 120, пустое → «файл»; расширение — строго ext (из списка принимаемых)
  const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  function chatSafeName(name, ext) {
    let s = String(name == null ? '' : name).replace(/\\/g, '/').split('/').pop().replace(/[\u0000-\u001f\u007f<>:"|?*]/g, ' ').replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '');
    ext = String(ext || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const m = s.match(/^(.*)\.([A-Za-z0-9]{1,5})$/); let stem = s;
    if (m) { let e = m[2].toLowerCase(); if (e === 'jpeg') e = 'jpg'; if (e === 'opus' || e === 'oga') e = 'ogg'; if (!ext || e === ext) stem = m[1]; }
    stem = stem.replace(/^[. ]+|[. ]+$/g, ''); if (!stem) stem = 'файл'; if (WIN_RESERVED.test(stem)) stem = '_' + stem;
    const max = 120 - (ext ? ext.length + 1 : 0); if (stem.length > max) stem = stem.slice(0, max).replace(/[. ]+$/g, '') || 'файл';
    return ext ? `${stem}.${ext}` : stem;
  }
  // имя подпапки: один сегмент, те же правила; пустое или некорректное → по умолчанию
  function chatFolderName(v) {
    const raw = String(v == null ? '' : v).trim(); if (!raw || /[\\/]/.test(raw) || raw.includes('..')) return CHAT_FOLDER_DEFAULT;
    const s = raw.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, ' ').replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '').slice(0, 80).replace(/[. ]+$/g, '');
    return !s || WIN_RESERVED.test(s) ? CHAT_FOLDER_DEFAULT : s;
  }
  // следующее свободное имя: «план.pdf» → «план (2).pdf» → «план (3).pdf»
  const chatNumbered = (name, n) => { if (n < 2) return name; const i = name.lastIndexOf('.'); return i > 0 ? `${name.slice(0, i)} (${n})${name.slice(i)}` : `${name} (${n})`; };
  // читают переписку: владелец и партнёр, ПМ и ГИП проекта (и любой ГИП для РП — isManager); остальные участники проекта
  // (members или исполнитель пункта) — только при включённой настройке chatForMembers
  const canChatRead = (u, p, settings, items) => !!u && !!p && (isManager(u, p) || (!!(settings && settings.chatForMembers) && staffSees(u, p, items)));
  // привязать группу к проекту: владелец и партнёр — к любому, ПМ/ГИП — к своему
  const canChatBind = (u, p) => isManager(u, p);
  const CHAT_STOP = new Set(['most', 'мост', 'рп', 'эп', 'ап', 'проект', 'проекты', 'проектирование', 'группа', 'чат', 'рабочая', 'рабочий', 'общий', 'общая', 'жк', 'бц', 'тоо', 'whatsapp', 'architects', 'project', 'очередь', 'объект', 'бизнес', 'центр', 'жилой', 'комплекс', 'эскиз', 'эскизный', 'концепция', 'концепт', 'рабочка']);
  const chatTokens = s => normTitle(s).split(' ').filter(x => x && (x.length > 1 || /\d/.test(x)));
  const chatTokEq = (a, b) => { if (a === b) return true; if (a.length < 5 || b.length < 5) return false; const n = Math.max(4, Math.min(a.length, b.length) - 2); return a.slice(0, n) === b.slice(0, n); };
  // подсказка проекта по названию группы: общие слова названий (нормализация normTitle, служебные слова не считаются, окончания прощаются),
  // «РП» / «ЭП» в названии группы — предпочесть эту стадию, при равенстве — активный проект. → { pid, name, track, score } или null
  function chatSuggest(name, projects) {
    const all = chatTokens(name); const gt = all.filter(x => !CHAT_STOP.has(x)); if (!gt.length) return null;
    const hint = all.includes('рп') ? 'rp' : (all.includes('эп') || all.some(x => /^(эскиз|концеп)/.test(x))) ? 'ep' : '';
    let best = null;
    for (const p of projects || []) {
      if (!p || !shownTrack(p.track)) continue; const pt = [...new Set(chatTokens(p.name).filter(x => !CHAT_STOP.has(x)))]; if (!pt.length) continue;
      const common = pt.filter(x => gt.some(y => chatTokEq(x, y))).length; const gHit = gt.filter(y => pt.some(x => chatTokEq(x, y))).length; if (!common || (common / pt.length < 0.5 && gHit < gt.length)) continue; // половина слов проекта или все слова группы
      const score = common / pt.length * 0.7 + Math.min(1, common / gt.length) * 0.3 + (hint && trackPath(p.track) === hint ? 0.15 : 0) + (ACTIVE(p.status) ? 0.05 : 0);
      if (!best || score > best.score) best = { pid: p.id, name: p.name, track: p.track, score: Math.round(score * 100) / 100 };
    }
    return best;
  }
  // сообщение от моста → { msg } или { error }. ts — ISO или число (секунды / миллисекунды эпохи); будущее дальше суток — ошибка
  function cleanChatMessage(m, nowMs) {
    m = m || {}; const extId = String(m.extId == null ? '' : m.extId).trim().slice(0, 200); if (!extId) return { error: 'нет extId' };
    const d = typeof m.ts === 'number' || /^\d{9,13}$/.test(String(m.ts || '')) ? new Date(Number(m.ts) < 1e12 ? Number(m.ts) * 1000 : Number(m.ts)) : new Date(String(m.ts || ''));
    if (isNaN(d)) return { error: 'нет времени ts' }; if (d.getTime() > (nowMs || Date.now()) + 864e5) return { error: 'время ts в будущем' }; if (d.getTime() < Date.parse('2009-01-01')) return { error: 'слишком раннее время ts' };
    const str = (v, n) => String(v == null ? '' : v).split(String.fromCharCode(0)).join('').slice(0, n); const ed = m.editedAt ? new Date(m.editedAt) : null;
    return { msg: { extId, ts: d.toISOString(), author: str(m.author, 120).trim(), phone: str(m.phone, 40).trim(), text: str(m.text, CHAT_MAX_TEXT), quoted: str(m.quoted, 300).trim(), kind: CHAT_KINDS.includes(m.kind) ? m.kind : 'text', editedAt: ed && !isNaN(ed) ? ed.toISOString() : '', deleted: m.deleted === true || m.deleted === 'true' || m.deleted === 1 } };
  }
  const plural = (n, forms) => { const a = Math.abs(n) % 100, b = a % 10; return forms[a > 10 && a < 20 ? 2 : b === 1 ? 0 : b >= 2 && b <= 4 ? 1 : 2]; };
  // события «Журнала»: одна строка на день (по Алматы) и группу — «WhatsApp «Группа»: N сообщений, M файлов (в папке проекта: K)»; собираются на лету, удалённые сообщения не считаются
  function chatDayEvents(msgs, chats, pid) {
    const names = new Map((chats || []).map(c => [c.id, c.name || ''])); const by = new Map();
    for (const m of msgs || []) { if (m.pid !== pid || m.deleted) continue; const date = almatyDate(m.ts); if (!date) continue; const k = m.chatId + '|' + date;
      const g = by.get(k) || { chatId: m.chatId, date, n: 0, files: 0, saved: 0, at: '' }; g.n++; g.files += (m.files || []).length; g.saved += (m.files || []).filter(f => f.savedTo).length; if (m.ts > g.at) g.at = m.ts; by.set(k, g); }
    return [...by.values()].map(g => ({ kind: 'auto', type: 'chat', date: g.date, at: g.at, by: '', chatId: g.chatId, chatDate: g.date, n: g.n, nFiles: g.files, nSaved: g.saved,
      text: `WhatsApp${names.get(g.chatId) ? ` «${names.get(g.chatId)}»` : ''}: ${g.n} ${plural(g.n, ['сообщение', 'сообщения', 'сообщений'])}, ${g.files} ${plural(g.files, ['файл', 'файла', 'файлов'])}${g.saved ? ` (в папке проекта: ${g.saved})` : ''}` }));
  }
  // фильтр ленты переписки: q — все слова в тексте, авторе, цитате или именах файлов; files — только сообщения с файлами; chatId — одна группа
  function chatFilter(msgs, o) {
    o = o || {}; const words = String(o.q || '').toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean);
    return (msgs || []).filter(m => (!o.chatId || m.chatId === o.chatId) && (!o.files || (!m.deleted && (m.files || []).length > 0)) && (!words.length || (!m.deleted && (s => words.every(w => s.includes(w)))([m.text, m.author, m.quoted, (m.files || []).map(f => f.name).join(' ')].join(' ').toLowerCase().replace(/ё/g, 'е')))));
  }
  const chatTime = ts => { const d = new Date(ts); return isNaN(d) ? '' : d.toLocaleTimeString('ru-RU', { timeZone: 'Asia/Almaty', hour: '2-digit', minute: '2-digit' }); };

  return { TRACKS, TRACK_SHORT, TRACK_ORDER, VISIBLE_TRACKS, HIDDEN_TRACKS, normalizeTrack, shownTrack, CONCEPT_STAGE, NEXT_TRACK, LEAD_FIELD, STATUS, ACTIVE, RISK, SECTIONS, ROLE_SECTION, ITEM_ROLES, HOLDERS, BLOCKER_STATUS, BUDGET_SECTIONS, EXECUTORS, FOLDER_SECTIONS, folderName, TEMPLATES, TEMPLATE_VERSION, AN_MONTHLY, stageNames, stageNamesOf, templateCount, stageIndex, normCode, depItems, waitingFor, roadmapStatus, PM_ROLES, SETTINGS_DEFAULT, pmSettings, isStaff, memberIds, staffSees, STAFF_ITEM_FIELDS, trackPath, defaultTracks, userTracks, canOpen, isLeader, isManager, canCreate, canEditItem, canBudget, itemSection, SHIFT_STATUS, shiftPending, canShiftRequest, canShiftDecide, canReview, shiftStats, itemsFromTemplate, plan, progress, summary, dashboard, budgetCalc, blockerAge, ganttMonths, ganttLoad, inMonth, miroEmbed, addDays, days, ym, addMonths, monthsDiff, mname, today, KZ_FIXED, KZ_KURBAN, holidaysOf, isWorkDay, nextWorkDay, addWorkDays, workDaysBetween, TERM_UNITS, termEnd, contractLabel,
    parseCsv, CLICKUP_FIELDS, clickupAutoMap, parseAnyDate, splitList, CLICKUP_DONE, clickupStatus, normTitle, findItemByTitle, matchUser, clickupToProjects, crc32, zipStore, xlsx, registryExport, ZONE_NAME_RU,
    W, WMAX, chain, ZONES, ZONE_RANK, zone, health, throughput, priority, CHARTER_FIELDS, charterPhrase, charterComplete, retroSnapshot,
    KANBAN, KANBAN_KEYS, KANBAN_OPEN, KANBAN_PROJECT_HIDDEN, rmKanban, itemKanban, kanbanPatch, canMoveProject,
    LOG_TYPES, LOG_TYPE_KEYS, logTypeLabel, LOG_MAX_TEXT, LOG_MAX_FILE, LOG_MAX_FILES, LOG_MAX_BATCH, LOG_FILE_TYPES, LOG_KEY_RE, logFileSig, canLogAdd, canLogEdit, logDate, cleanLog, logTypeFromText, parseLogBatch, almatyDate, PROJ_HIST_FIELDS, projectHistory, projectFeed, feedLabel, filterFeed, feedCsv,
    CHAT_KINDS, CHAT_MAX_BATCH, CHAT_MAX_BYTES, CHAT_MAX_FILE, CHAT_MAX_TEXT, CHAT_PAGE, CHAT_FOLDER_DEFAULT, CHAT_FILE_TYPES, CHAT_EXT_MIME, CHAT_KEY_RE, CHAT_INLINE, CHAT_BRIDGE_STATES, chatFileExt, chatFileSig, chatIsImage, chatSafeName, chatFolderName, chatNumbered, canChatRead, canChatBind, chatTokens, chatSuggest, cleanChatMessage, chatDayEvents, chatFilter, chatTime, plural };
});
