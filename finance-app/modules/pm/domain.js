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
  const TEMPLATES = {
    concept: [
      { name: '1. Форэскиз (10 %)', items: [I('Исходные данные и ТЗ от заказчика', 'ПМ', 1, 'Получены участок, ТЗ, пожелания заказчика'), I('Анализ участка и градрегламента', 'ГАП', 1, 'Ограничения участка, плотность, этажность'), I('Форэскиз: посадка и объёмы', 'ГАП', 2), I('Презентация форэскиза заказчику', 'ПМ', 1, 'Форэскиз согласован заказчиком')] },
      { name: '2. Концепция (20 %)', items: [I('Концепция генплана', 'ГП', 2), I('Планировочные решения и ТЭП', 'ГАП', 3, 'ТЭП согласованы с отделом продаж заказчика'), I('Фасадные решения', 'ГАП', 2), I('Визуализации', 'Визуализатор', 2), I('Альбом концепции', 'ГАП', 1, 'Альбом собран и проверен ПМ')] },
      { name: '3. Согласование и передача в ЭП', items: [I('Презентация концепции заказчику', 'ПМ', 1), I('Корректировки по замечаниям', 'ГАП', 2), I('Концепция утверждена заказчиком', 'ПМ', 1, 'Подписанный альбом / письмо заказчика'), I('Передача в ЭП (КП и договор на ЭП — 70 %)', 'ПМ', 1, 'Создан ЭП, назначен ПМ')] },
    ],
    ep: [
      { name: '1. ИРД', items: [I('Гос. акт на участок', 'Заказчик', 1), I('АПЗ', 'Заказчик', 3, 'АПЗ получено (14 рабочих дней)'), I('Топосъёмка со штампом, координаты участка', 'Заказчик', 2), I('Выкопировка ПДП', 'Заказчик', 1)] },
      { name: '2. Анализ участка и ЗНП', items: [I('Красные линии', 'ГАП', 1), I('Водоохранная зона', 'ГАП', 1), I('Тектонические разломы', 'ГАП', 1), I('Существующие сети и отступы от сетей (СЗЗ)', 'ГП', 1), I('Анализ соседних зданий на СЗЗ', 'ГАП', 1), I('Склон', 'ГП', 1, '', true), I('ЗНП для ЭП', 'ПМ', 1, 'Задание на проектирование подписано заказчиком')] },
      { name: '3. Посадка', items: [I('Посадка', 'ГАП', 2), I('Задание на геологию', 'ГИП', 1), I('ТП, котельная, КПП', 'ГП', 1), I('Площадка ТБО', 'ГП', 1), I('Согласование посадки и ГП с заказчиком, корректировки', 'ПМ', 1, 'Посадка и ГП согласованы заказчиком')] },
      { name: '4. Планы', items: [I('Концепт-презентация', 'ГАП', 1), I('Планы', 'ГАП', 3), I('Расчёт инсоляции', 'ГАП', 1), I('Согласование коммерческих помещений с отделом продаж', 'ПМ', 1), I('Согласование квартирографии и площадей с отделом продаж', 'ПМ', 1, 'Квартирография согласована ОП'), I('Корректировки по комментариям', 'ГАП', 1), I('Расчёт нагрузок', 'ГИП', 1)] },
      { name: '5. Фасады', items: [I('Фасады', 'ГАП', 3), I('Проверка инсоляции', 'ГАП', 1), I('Согласование фасадов с заказчиком, корректировки', 'ПМ', 1), I('Согласование материалов и RAL', 'ПМ', 1, 'Материалы и RAL согласованы заказчиком')] },
      { name: '6. Рендеры и согласование ЭП', items: [I('Рендеры', 'Визуализатор', 2), I('Дополнительные рендеры для отдела продаж', 'Визуализатор', 1, '', true), I('ЭП согласован с заказчиком', 'ПМ', 1, 'Подписанный альбом ЭП / письмо заказчика')] },
      { name: '7. Градсовет', items: [I('Презентационные материалы для градсовета', 'ГАП', 1), I('Уточнение сейсмики у КазНИИСА', 'ГИП', 2), I('Градсовет', 'ПМ', 3), I('ЭП согласован с городом', 'ПМ', 1, 'Протокол / заключение градсовета')] },
      { name: '8. Передача в РП', items: [I('Совещание передачи в РП: ГИП, ГАП, ГП, ГКП, главспецы ОВ/ВК/ЭЛ, АПТ', 'ПМ', 1, 'Протокол передачи, назначен ГИП РП')] },
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
  TEMPLATES.ep = [CONCEPT_STAGE].concat(TEMPLATES.ep.map((s, i) => Object.assign({}, s, { name: s.name.replace(/^\d+\.\s*/, `${i + 2}. `) })));
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
  const canOpen = u => !!u && PM_ROLES.includes(u.role);
  const isLeader = u => !!u && LEADERS.includes(u.role);
  const isManager = (u, p) => !!u && !!p && (isLeader(u) || p.gipId === u.id || p.pmId === u.id);
  const canCreate = u => !!u && (isLeader(u) || u.role === 'pm' || u.role === 'gip');
  const canEditItem = (u, p, it) => isManager(u, p) || (!!u && u.role === 'lead' && !!u.section && itemSection(it) === u.section) || (!!u && !!it && !!it.assigneeId && it.assigneeId === u.id);
  const canBudget = (u, p) => isLeader(u) || (!!u && !!u.seeBudget && !!p && (p.gipId === u.id || p.pmId === u.id));
  const itemSection = it => (it && (it.section || ROLE_SECTION[it.role])) || '';

  // ---- даты ----
  const iso = d => d.toISOString().slice(0, 10);
  const addDays = (a, n) => iso(new Date(new Date(a + 'T00:00:00Z').getTime() + Math.round(n) * 864e5));
  const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Almaty' }); // дата по Алматы
  const days = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
  const ym = d => String(d || '').slice(0, 7);
  const addMonths = (m, n) => { const [y, mo] = String(m).split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
  const monthsDiff = (a, b) => { const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number); return (by - ay) * 12 + (bm - am); };
  const mname = m => { const p = String(m || '').split('-'); return p[1] ? `${MONTHS_RU[Number(p[1]) - 1]} ${p[0]}` : String(m || ''); };
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
    const push = (si, stageName, x) => out.push({ pid, stage: si, stageName, title: x.t, role: x.role, section: ROLE_SECTION[x.role] || '', weeks: x.w, crit: x.crit, optional: x.opt, done: false, na: false, due: '', assigneeId: '', contractor: '', note: '', order: order++ });
    (TEMPLATES[track] || []).forEach((s, si) => s.items.forEach(x => push(si + 1, s.name, x)));
    if (track === 'an') {
      const base = (TEMPLATES.an || []).length; const s0 = opts.start && ym(opts.start);
      let months = Number(opts.months) || 0; if (!months && s0 && opts.due && ym(opts.due) >= s0) months = monthsDiff(s0, ym(opts.due)) + 1; months = Math.min(36, Math.max(1, months || 6));
      for (let k = 0; k < months; k++) { const nm = `${base + k + 1}. Месяц ${k + 1}${s0 ? ' — ' + mname(addMonths(s0, k)) : ''}`; AN_MONTHLY.forEach(x => push(base + k + 1, nm, x)); }
    }
    return out;
  }
  // план: этапы последовательно, пункты этапа параллельно; длительность этапа = самый длинный пункт.
  // fitTo — растянуть/сжать до даты по договору.
  function plan(items, start, fitTo) {
    const stages = [...new Set(items.map(i => i.stage))].sort((a, b) => a - b);
    const len = st => Math.max(0.2, ...items.filter(i => i.stage === st && !i.na).map(i => Number(i.weeks) || 1));
    const total = stages.reduce((s, st) => s + len(st), 0) * 7;
    const k = fitTo && start && fitTo > start ? days(start, fitTo) / total : 1;
    let cur = 0; const out = {};
    for (const st of stages) { for (const it of items.filter(i => i.stage === st)) out[it.id] = addDays(start, (cur + (Number(it.weeks) || 1) * 7) * k); cur += len(st) * 7; }
    return { due: out, end: addDays(start, total * k), weeks: Math.round(total * k / 7) };
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
    const openBl = blockers.filter(b => b.status !== 'closed');
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
  const ZONES = { blue: 'профицит', green: 'по плану', yellow: 'готовить план изменений', red: 'применять план изменений', black: 'пересогласовать срок или объём' };
  const ZONE_RANK = { blue: 0, green: 1, yellow: 2, red: 3, black: 4 };
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
    const start = p.start || String(p.createdAt || '').slice(0, 10) || t; const ch = chain(mine);
    let mode, planDays, bufferDays;
    if (p.due && p.due > start) { mode = 'contract'; const T = days(start, p.due); bufferDays = Math.max(1, Math.round(T * 0.3)); planDays = T - bufferDays; }
    else { mode = 'chain'; planDays = Math.max(1, ch.opt); bufferDays = Math.max(1, ch.buffer); }
    const planEnd = addDays(start, planDays), promised = addDays(start, planDays + bufferDays);
    const elapsed = Math.max(0, days(start, t)); const timeProgress = elapsed / planDays;
    const closed = mine.filter(i => i.done && i.doneAt); const since = addDays(t, -28);
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
    const returns = mine.reduce((s, i) => s + (Number(i.returns) || 0), 0);
    return { mode, start, planDays, bufferDays, planEnd, promised, elapsed, total: Math.round(total * 10) / 10, doneW: Math.round(doneW * 10) / 10, remain: Math.round(remain * 10) / 10, progress: Math.round(progress * 1000) / 1000, timeProgress: Math.round(timeProgress * 1000) / 1000, avgV: Math.round(avgV * 1000) / 1000, curV: Math.round(curV * 1000) / 1000, addV: Math.round(addV * 1000) / 1000, addedW: Math.round(addedW * 10) / 10, forecast, consumption, basis, zone: z, zoneLabel: ZONES[z], chain: ch, returns };
  }
  // Проход: контракт без НДС в месяц длительности (по договору или по цепи); руководителю/ГИПу с доступом к бюджету
  function throughput(p, h) {
    const contract = Number(p.budget && p.budget.contract) || 0; if (!contract) return null;
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
  // снимок показателей для ретроспективы
  const retroSnapshot = (h, blockers) => ({ progress: h.progress, zone: h.zone, consumption: h.consumption, curV: h.curV, avgV: h.avgV, addedW: h.addedW, remain: h.remain, forecast: h.forecast, returns: h.returns, blockers: (blockers || []).filter(b => b.status !== 'closed').length });

  return { TRACKS, TRACK_SHORT, TRACK_ORDER, VISIBLE_TRACKS, HIDDEN_TRACKS, normalizeTrack, shownTrack, CONCEPT_STAGE, NEXT_TRACK, LEAD_FIELD, STATUS, ACTIVE, RISK, SECTIONS, ROLE_SECTION, ITEM_ROLES, HOLDERS, BLOCKER_STATUS, BUDGET_SECTIONS, EXECUTORS, FOLDER_SECTIONS, folderName, TEMPLATES, AN_MONTHLY, stageNames, stageNamesOf, templateCount, stageIndex, PM_ROLES, canOpen, isLeader, isManager, canCreate, canEditItem, canBudget, itemSection, itemsFromTemplate, plan, progress, summary, dashboard, budgetCalc, blockerAge, ganttMonths, ganttLoad, inMonth, miroEmbed, addDays, days, ym, addMonths, monthsDiff, mname, today, KZ_FIXED, KZ_KURBAN, holidaysOf, isWorkDay, nextWorkDay, addWorkDays, workDaysBetween, TERM_UNITS, termEnd, contractLabel,
    W, WMAX, chain, ZONES, ZONE_RANK, zone, health, throughput, priority, CHARTER_FIELDS, charterPhrase, charterComplete, retroSnapshot };
});
