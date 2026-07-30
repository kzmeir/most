(function () {
  'use strict';

  const LANGUAGES = ['ru', 'kz', 'en'];
  const params = new URLSearchParams(location.search);
  let saved = '';
  try { saved = localStorage.getItem('most_language') || ''; } catch (_) {}
  const requested = (params.get('lang') || '').toLowerCase();
  const language = LANGUAGES.includes(requested)
    ? requested
    : (LANGUAGES.includes(saved) ? saved : 'ru');

  try { localStorage.setItem('most_language', language); } catch (_) {}
  document.documentElement.lang = language === 'kz' ? 'kk' : language;
  document.documentElement.dataset.language = language;

  const copy = {
    'MOST Architects — архитектурное бюро, Алматы': {
      kz: 'MOST Architects — Алматыдағы сәулет бюросы',
      en: 'MOST Architects — architecture studio, Almaty'
    },
    'Бюро — MOST Architects, Алматы': {
      kz: 'Бюро — MOST Architects, Алматы',
      en: 'Studio — MOST Architects, Almaty'
    },
    'Портфолио — MOST Architects, Алматы': {
      kz: 'Портфолио — MOST Architects, Алматы',
      en: 'Portfolio — MOST Architects, Almaty'
    },
    'Проект не найден — MOST Architects': {
      kz: 'Жоба табылмады — MOST Architects',
      en: 'Project not found — MOST Architects'
    },
    'MOST Architects — архитектурное бюро в Алматы. Проектируем жилые, городские и коммерческие пространства с 2016 года.': {
      kz: 'MOST Architects — Алматыдағы сәулет бюросы. 2016 жылдан бері тұрғын, қалалық және коммерциялық кеңістіктерді жобалаймыз.',
      en: 'MOST Architects is an architecture studio in Almaty. We have designed residential, urban and commercial spaces since 2016.'
    },
    'Архитектура из чистых, честных объёмов. Алматы.': {
      kz: 'Таза әрі шынайы көлемдер сәулеті. Алматы.',
      en: 'Architecture shaped by pure, honest volumes. Almaty.'
    },
    'Портфолио': { kz: 'Портфолио', en: 'Portfolio' },
    'портфолио': { kz: 'портфолио', en: 'portfolio' },
    'Бюро': { kz: 'Бюро', en: 'Studio' },
    'Контакты': { kz: 'Байланыс', en: 'Contacts' },
    'Меню': { kz: 'Мәзір', en: 'Menu' },
    'Главная': { kz: 'Басты бет', en: 'Home' },
    'Навигация': { kz: 'Навигация', en: 'Navigation' },
    'Мост между идеей и реализацией.': {
      kz: 'Идея мен іске асыру арасындағы көпір.',
      en: 'A bridge between idea and realization.'
    },
    'Мост между идеей': {
      kz: 'Идея мен іске асыру',
      en: 'A bridge between idea'
    },
    'и реализацией': {
      kz: 'арасындағы көпір',
      en: 'and realization'
    },
    'Архитектурное бюро в Алматы. Проектируем жилые, городские и коммерческие пространства с 2017 года.': {
      kz: 'Алматыдағы сәулет бюросы. 2017 жылдан бері тұрғын, қалалық және коммерциялық кеңістіктерді жобалаймыз.',
      en: 'An architecture studio in Almaty. We have designed residential, urban and commercial spaces since 2017.'
    },
    'Избранное': { kz: 'Таңдаулы жобалар', en: 'Selected work' },
    'Все проекты': { kz: 'Барлық жобалар', en: 'All projects' },
    'Все проекты →': { kz: 'Барлық жобалар →', en: 'All projects →' },
    'архитектурный процесс': { kz: 'сәулеттік үдеріс', en: 'architectural process' },
    'Архитектурные решения': { kz: 'Сәулеттік шешімдер', en: 'Architectural solutions' },
    'Мы предоставляем полный архитектурный процесс — от концепции и мастер-плана до детальной проектной документации и координации инженерных решений.': {
      kz: 'Тұжырымдама мен мастер-жоспардан бастап егжей-тегжейлі жобалық құжаттама мен инженерлік шешімдерді үйлестіруге дейінгі толық сәулеттік үдерісті ұсынамыз.',
      en: 'We provide the complete architectural process — from concept and master planning to detailed design documentation and coordination of engineering solutions.'
    },
    'бюро': { kz: 'бюро', en: 'studio' },
    'Команда архитекторов, инженеров и проектировщиков под одной задачей.': {
      kz: 'Сәулетшілер, инженерлер мен жобалаушылар командасы бір мақсатқа жұмылған.',
      en: 'A team of architects, engineers and designers working toward one goal.'
    },
    'Работаем полным циклом — от концепции до авторского надзора на площадке — и отвечаем за результат на каждой стадии. Архитектура для нас — это логика, а не декор.': {
      kz: 'Тұжырымдамадан құрылыс алаңындағы авторлық қадағалауға дейін толық циклмен жұмыс істейміз және әр кезеңдегі нәтижеге жауап береміз. Біз үшін сәулет — декор емес, логика.',
      en: 'We work through the full cycle — from concept to on-site architectural supervision — and take responsibility for the result at every stage. For us, architecture is logic, not decoration.'
    },
    'разработанных проектов': { kz: 'әзірленген жоба', en: 'projects developed' },
    'квадратных метров': { kz: 'шаршы метр', en: 'square metres' },
    'М': { kz: 'М', en: 'M' },
    'лет практики': { kz: 'жыл тәжірибе', en: 'years of practice' },
    'сотрудников в штате': { kz: 'штаттағы маман', en: 'team members' },
    'сотрудников': { kz: 'маман', en: 'team members' },
    'заказчики': { kz: 'тапсырыс берушілер', en: 'clients' },
    'Наши заказчики': { kz: 'Біздің тапсырыс берушілер', en: 'Our clients' },
    'Проектируем для ведущих девелоперов и строительных компаний Казахстана.': {
      kz: 'Қазақстанның жетекші девелоперлері мен құрылыс компаниялары үшін жобалаймыз.',
      en: 'We design for Kazakhstan’s leading developers and construction companies.'
    },
    'новый проект': { kz: 'жаңа жоба', en: 'new project' },
    'Утеген Батыра 11В к6/1, офис 2, Алматы': {
      kz: 'Өтеген батыр көшесі, 11В, 6/1 корпус, 2-кеңсе, Алматы',
      en: '11V Utegen Batyr St., bldg. 6/1, office 2, Almaty'
    },
    'Утеген Батыра 11В к6/1,': {
      kz: 'Өтеген батыр көшесі, 11В, 6/1 корпус,',
      en: '11V Utegen Batyr St., bldg. 6/1,'
    },
    'офис 2, Алматы': { kz: '2-кеңсе, Алматы', en: 'office 2, Almaty' },
    'Пн—Пт 9:00—18:00': { kz: 'Дс—Жм 9:00—18:00', en: 'Mon—Fri 9:00—18:00' },
    'Имя': { kz: 'Аты-жөніңіз', en: 'Name' },
    'Как к вам обращаться': { kz: 'Сізге қалай хабарласамыз', en: 'How should we address you?' },
    'Телефон или e-mail': { kz: 'Телефон немесе e-mail', en: 'Phone or email' },
    '+7 ··· или you@mail.com': { kz: '+7 ··· немесе you@mail.com', en: '+7 ··· or you@mail.com' },
    'О проекте': { kz: 'Жоба туралы', en: 'About the project' },
    'Тип объекта, площадь, сроки, ссылки': {
      kz: 'Нысан түрі, ауданы, мерзімі, сілтемелер',
      en: 'Project type, area, timeline, links'
    },
    'Отправить заявку': { kz: 'Өтінім жіберу', en: 'Send enquiry' },
    'Отправляем…': { kz: 'Жіберілуде…', en: 'Sending…' },
    'Спасибо! Заявка отправлена — свяжемся в течение рабочего дня.': {
      kz: 'Рақмет! Өтінім жіберілді — бір жұмыс күні ішінде хабарласамыз.',
      en: 'Thank you! Your enquiry has been sent — we will contact you within one business day.'
    },
    'Не удалось отправить. Напишите на info@most-a.com или позвоните +7 (771) 733 77 00.': {
      kz: 'Жіберу мүмкін болмады. info@most-a.com поштасына жазыңыз немесе +7 (771) 733 77 00 нөміріне қоңырау шалыңыз.',
      en: 'We could not send the enquiry. Email info@most-a.com or call +7 (771) 733 77 00.'
    },
    'Архитектурное бюро в Алматы. Архитектура из чистых, честных объёмов.': {
      kz: 'Алматыдағы сәулет бюросы. Таза әрі шынайы көлемдер сәулеті.',
      en: 'An architecture studio in Almaty. Architecture shaped by pure, honest volumes.'
    },
    '© 2017—2026 MOST Architects · Алматы, Казахстан': {
      kz: '© 2017—2026 MOST Architects · Алматы, Қазақстан',
      en: '© 2017—2026 MOST Architects · Almaty, Kazakhstan'
    },
    'Направления:': { kz: 'Бағыттар:', en: 'Scope:' },
    'Результат:': { kz: 'Нәтиже:', en: 'Outcome:' },
    'Концепт': { kz: 'Тұжырымдама', en: 'Concept' },
    'КОНЦЕПТ': { kz: 'ТҰЖЫРЫМДАМА', en: 'CONCEPT' },
    'Концепт проект': { kz: 'Жоба тұжырымдамасы', en: 'Project concept' },
    'Мы закладываем фундамент проекта: смысл, атмосферу и характер. Не эскиз, а архитектурная логика, определяющая всё последующее.': {
      kz: 'Жобаның іргетасын — мағынасын, атмосферасын және мінезін қалыптастырамыз. Бұл жай эскиз емес, кейінгі барлық шешімді айқындайтын сәулеттік логика.',
      en: 'We establish the project’s foundation: its meaning, atmosphere and character. Not merely a sketch, but an architectural logic that defines everything that follows.'
    },
    'Разработка концепции генерального плана': { kz: 'Бас жоспар тұжырымдамасын әзірлеу', en: 'Master plan concept development' },
    'Разработка предварительных планировочных схем': { kz: 'Алдын ала жоспарлау схемаларын әзірлеу', en: 'Preliminary planning layouts' },
    'Предварительные технико-экономические показатели (ТЭП)': { kz: 'Алдын ала техникалық-экономикалық көрсеткіштер (ТЭК)', en: 'Preliminary technical and economic indicators' },
    'Разработка концепций фасадов с визуализацией': { kz: 'Визуализациямен қасбет тұжырымдамаларын әзірлеу', en: 'Facade concepts with visualisations' },
    'Анализ мировых трендов и аналогов': { kz: 'Әлемдік трендтер мен аналогтарды талдау', en: 'Analysis of global trends and precedents' },
    'Концептуальный альбом с основными фасадными решениями и предварительными просчётами.': {
      kz: 'Негізгі қасбет шешімдері мен алдын ала есептері бар тұжырымдамалық альбом.',
      en: 'A concept book with the principal facade solutions and preliminary calculations.'
    },
    'Эскизный': { kz: 'Эскиз', en: 'Schematic' },
    'ЭСКИЗНЫЙ': { kz: 'ЭСКИЗ', en: 'SCHEMATIC' },
    'Эскизный проект': { kz: 'Эскиздік жоба', en: 'Schematic design' },
    'Мы проектируем не объект, а экосистему: движение, транспорт, природу и сценарии использования.': {
      kz: 'Біз жеке нысанды емес, қозғалыс, көлік, табиғат пен пайдалану сценарийлерін біріктіретін экожүйені жобалаймыз.',
      en: 'We design not an isolated object, but an ecosystem of movement, transport, nature and patterns of use.'
    },
    'Разработка эффективного генерального плана': { kz: 'Тиімді бас жоспар әзірлеу', en: 'Efficient master plan development' },
    'Разработка планировочных решений': { kz: 'Жоспарлау шешімдерін әзірлеу', en: 'Planning solutions' },
    'Разработка фасадных решений': { kz: 'Қасбет шешімдерін әзірлеу', en: 'Facade design' },
    'Эскиз наружного фасадного освещения': { kz: 'Сыртқы қасбет жарығының эскизі', en: 'Exterior facade lighting concept' },
    'Разработка визуализации здания': { kz: 'Ғимарат визуализациясын әзірлеу', en: 'Building visualisation' },
    'Разработка концепта благоустройства дворовых пространств': { kz: 'Аула кеңістіктерін абаттандыру тұжырымдамасын әзірлеу', en: 'Courtyard landscape concept' },
    'Эскизный альбом, согласованный с архитектурой города.': {
      kz: 'Қаланың сәулет органдарымен келісілген эскиздік альбом.',
      en: 'A schematic design book approved by the city’s architectural authorities.'
    },
    'Рабочий': { kz: 'Жұмыс', en: 'Detailed' },
    'РАБОЧИЙ': { kz: 'ЖҰМЫС', en: 'DETAILED' },
    'Рабочий проект': { kz: 'Жұмыс жобасы', en: 'Detailed design' },
    'Мы объединяем эстетику с инженерной точностью. Проект, который можно реализовать, не теряя его идеи.': {
      kz: 'Эстетиканы инженерлік дәлдікпен біріктіреміз. Идеясын жоғалтпай жүзеге асыруға болатын жоба жасаймыз.',
      en: 'We combine aesthetics with engineering precision, creating a project that can be built without losing its core idea.'
    },
    'Полная рабочая документация: ГП, АР, ВК, ОВ, ЭЛ, СС, АПС, АПТ, ПОС, ОВОС, ТХ, МОПБ': {
      kz: 'Толық жұмыс құжаттамасы: БЖ, СШ, СК, ЖЖ, ЭЛ, БЖ, ӨДА, АӨС, ҚҰЖ, ҚОӘБ, ТХ, ӨҚШ',
      en: 'Complete detailed documentation: master plan, architecture, water and drainage, HVAC, electrical, low-current systems, fire alarm, fire suppression, construction planning, environmental assessment and technology'
    },
    'Технические чертежи и спецификации с инженерной точностью': {
      kz: 'Инженерлік дәлдікпен орындалған техникалық сызбалар мен спецификациялар',
      en: 'Technically precise drawings and specifications'
    },
    'Координация BIM': { kz: 'BIM үйлестіру', en: 'BIM coordination' },
    'Комплект детализированных чертежей, схем, узлов и спецификаций материалов, готовый к строительству.': {
      kz: 'Құрылысқа дайын егжей-тегжейлі сызбалар, схемалар, түйіндер және материалдар спецификацияларының толық жиынтығы.',
      en: 'A construction-ready set of detailed drawings, diagrams, junctions and material specifications.'
    },
    'Мастерплан': { kz: 'Мастер-жоспар', en: 'Master plan' },
    'МАСТЕРПЛАН': { kz: 'МАСТЕР-ЖОСПАР', en: 'MASTER PLAN' },
    'Мы прорабатываем проект до узлов и спецификаций. Исключаем ошибки на стадии строительства.': {
      kz: 'Жобаны түйіндер мен спецификацияларға дейін пысықтаймыз. Құрылыс кезеңіндегі қателерді алдын ала жоямыз.',
      en: 'We develop the project down to junctions and specifications, eliminating errors before construction.'
    },
    'Пространственное зонирование': { kz: 'Кеңістіктік аймақтарға бөлу', en: 'Spatial zoning' },
    'Концепция градостроительного планирования': { kz: 'Қала құрылысы жоспарының тұжырымдамасы', en: 'Urban planning concept' },
    'Технико-экономические показатели (ТЭП)': { kz: 'Техникалық-экономикалық көрсеткіштер (ТЭК)', en: 'Technical and economic indicators' },
    'Анализ потоков': { kz: 'Ағындарды талдау', en: 'Movement analysis' },
    'Дизайн общественных пространств': { kz: 'Қоғамдық кеңістіктер дизайны', en: 'Public space design' },
    'Экологическая стратегия': { kz: 'Экологиялық стратегия', en: 'Environmental strategy' },
    'Целостная среда, где всё взаимосвязано и функционирует гармонично.': {
      kz: 'Барлық элементі өзара байланысып, үйлесімді жұмыс істейтін тұтас орта.',
      en: 'A coherent environment where every element is connected and functions in harmony.'
    },
    'О бюро': { kz: 'Бюро туралы', en: 'About the studio' },
    'MOST Architects — архитектурное бюро в Алматы. С 2017 года проектируем жильё, гостиничные комплексы, общественные объекты и мастер-планы — от первой концепции до авторского надзора на площадке.': {
      kz: 'MOST Architects — Алматыдағы сәулет бюросы. 2017 жылдан бері тұрғын үй, қонақүй кешендері, қоғамдық нысандар мен мастер-жоспарларды алғашқы тұжырымдамадан құрылыс алаңындағы авторлық қадағалауға дейін жобалаймыз.',
      en: 'MOST Architects is an architecture studio in Almaty. Since 2017, we have designed housing, hotel complexes, public buildings and master plans — from the first concept through on-site architectural supervision.'
    },
    'Алматы · Казахстан · с 2017': { kz: 'Алматы · Қазақстан · 2017 жылдан бері', en: 'Almaty · Kazakhstan · since 2017' },
    'команда': { kz: 'команда', en: 'team' },
    'Команда MOST Architects': { kz: 'MOST Architects командасы', en: 'MOST Architects team' },
    'Команда MOST Architects · Алматы': { kz: 'MOST Architects командасы · Алматы', en: 'MOST Architects team · Almaty' },
    'Основатели MOST Architects — Ильяс Иманкулов и Меиржан Иманбеков': {
      kz: 'MOST Architects негізін қалаушылар — Ильяс Иманкулов пен Меиржан Иманбеков',
      en: 'Founders of MOST Architects — Ilyas Imankulov and Meirzhan Imanbekov'
    },
    'основатели': { kz: 'негізін қалаушылар', en: 'founders' },
    'Иманкулов Ильяс': { kz: 'Ильяс Иманкулов', en: 'Ilyas Imankulov' },
    'Иманбеков Меиржан': { kz: 'Меиржан Иманбеков', en: 'Meirzhan Imanbekov' },
    'Директор': { kz: 'Директор', en: 'Director' },
    'Технический директор': { kz: 'Техникалық директор', en: 'Technical Director' },
    'Выпускник КазГАСА, 2013. В архитектуре с 2010 года — более 16 лет практики.': {
      kz: 'ҚазБСҚА түлегі, 2013. Сәулет саласында 2010 жылдан бері — 16 жылдан астам тәжірибе.',
      en: 'KazGASA graduate, 2013. Working in architecture since 2010, with more than 16 years of practice.'
    },
    'философия': { kz: 'философия', en: 'philosophy' },
    'Архитектура из чистых, честных объёмов. Каждая форма работает на структуру, а не на украшение.': {
      kz: 'Таза әрі шынайы көлемдер сәулеті. Әр пішін әшекей үшін емес, құрылым үшін жұмыс істейді.',
      en: 'Architecture shaped by pure, honest volumes. Every form serves the structure rather than decoration.'
    },
    'Мы проектируем среду, а не отдельные здания: связи между людьми, дворами и улицей важнее эффектного фасада. Масштаб, свет и материал — наши главные инструменты.': {
      kz: 'Біз жеке ғимараттарды емес, ортаны жобалаймыз: адамдар, аулалар мен көше арасындағы байланыс әсерлі қасбеттен маңыздырақ. Масштаб, жарық және материал — біздің негізгі құралдарымыз.',
      en: 'We design environments, not isolated buildings: the connections between people, courtyards and streets matter more than a spectacular facade. Scale, light and material are our primary tools.'
    },
    'От жилого квартала до концепции города мы держим единый принцип — ясность. Решение должно читаться, а не объясняться. Это делает проекты долговечными и узнаваемыми.': {
      kz: 'Тұрғын кварталдан қала тұжырымдамасына дейін бір қағиданы ұстанамыз — айқындық. Шешім түсіндіруді қажет етпей, бірден оқылуы тиіс. Бұл жобаларды ұзақ ғұмырлы әрі танымал етеді.',
      en: 'From a residential quarter to the concept of an entire city, we follow one principle: clarity. A solution should be legible without explanation. This makes projects enduring and recognisable.'
    },
    'подход': { kz: 'тәсіл', en: 'approach' },
    'Контекст места': { kz: 'Орын контексті', en: 'Context of place' },
    'Начинаем с города и ландшафта. Здание должно усиливать среду, а не спорить с ней.': {
      kz: 'Қала мен ландшафттан бастаймыз. Ғимарат ортамен таласпай, оны күшейтуі тиіс.',
      en: 'We begin with the city and landscape. A building should strengthen its setting, not compete with it.'
    },
    'Честность материала': { kz: 'Материалдың шынайылығы', en: 'Honesty of material' },
    'Объёмы, свет и фактура важнее декора. Качество материала формирует долговечный образ.': {
      kz: 'Көлем, жарық және фактура декордан маңыздырақ. Материал сапасы ұзақ ғұмырлы бейне қалыптастырады.',
      en: 'Volume, light and texture matter more than decoration. Material quality creates an enduring identity.'
    },
    'Сценарии жизни': { kz: 'Өмір сценарийлері', en: 'Patterns of life' },
    'Проектируем то, как люди будут пользоваться пространством — дворами, первыми этажами, маршрутами.': {
      kz: 'Адамдардың кеңістікті — аулаларды, бірінші қабаттарды және бағыттарды — қалай пайдаланатынын жобалаймыз.',
      en: 'We design how people will use the space — its courtyards, ground floors and routes.'
    },
    'Технологичность': { kz: 'Технологиялылық', en: 'Technology' },
    'BIM и точная документация с ранней стадии — меньше потерь на площадке, предсказуемый результат.': {
      kz: 'BIM және ерте кезеңнен басталған дәл құжаттама құрылыс алаңындағы шығынды азайтып, нәтижені болжамды етеді.',
      en: 'BIM and precise documentation from an early stage reduce on-site losses and make outcomes predictable.'
    },
    'Контроль на стройке': { kz: 'Құрылысты бақылау', en: 'Construction oversight' },
    'Авторский надзор до сдачи. То, что нарисовано, должно быть построено без компромиссов.': {
      kz: 'Нысан тапсырылғанға дейін авторлық қадағалау. Сызбадағы шешімдер ымырасыз жүзеге асуы тиіс.',
      en: 'Architectural supervision through completion. What is drawn must be built without compromise.'
    },
    'Долговечность': { kz: 'Ұзақ ғұмырлылық', en: 'Longevity' },
    'Решения, которые не устаревают за один цикл моды. Ясность стареет медленнее, чем тренд.': {
      kz: 'Бір сән циклінде ескірмейтін шешімдер. Айқындық трендке қарағанда баяу ескіреді.',
      en: 'Solutions that outlast a single fashion cycle. Clarity ages more slowly than trends.'
    },
    'Обсудим вашу': { kz: 'Міндетіңізді', en: 'Let’s discuss' },
    'задачу': { kz: 'талқылайық', en: 'your project' },
    'Обсудим вашу задачу': { kz: 'Міндетіңізді талқылайық', en: 'Let’s discuss your project' },
    'Проекты бюро': { kz: 'Бюро жобалары', en: 'Studio projects' },
    'Жилые кварталы, мастер-планы, общественные и коммерческие объекты — от первой концепции до авторского надзора на площадке.': {
      kz: 'Тұрғын кварталдар, мастер-жоспарлар, қоғамдық және коммерциялық нысандар — алғашқы тұжырымдамадан құрылыс алаңындағы авторлық қадағалауға дейін.',
      en: 'Residential quarters, master plans, public and commercial buildings — from the first concept through on-site architectural supervision.'
    },
    'проектов · Алматы и Казахстан': { kz: 'жоба · Алматы және Қазақстан', en: 'projects · Almaty and Kazakhstan' },
    'Все': { kz: 'Барлығы', en: 'All' },
    'Жилые комплексы': { kz: 'Тұрғын үй кешендері', en: 'Residential' },
    'Коттеджные городки': { kz: 'Коттедж қалашықтары', en: 'Low-rise communities' },
    'Гостиницы': { kz: 'Қонақүйлер', en: 'Hotels' },
    'Мастер-планы': { kz: 'Мастер-жоспарлар', en: 'Master plans' },
    'Общественные': { kz: 'Қоғамдық нысандар', en: 'Public buildings' },
    'Архив': { kz: 'Мұрағат', en: 'Archive' },
    'Нет проектов в этой категории.': { kz: 'Бұл санатта жобалар жоқ.', en: 'There are no projects in this category.' },
    'Смотреть →': { kz: 'Көру →', en: 'View →' },
    'Проект не найден': { kz: 'Жоба табылмады', en: 'Project not found' },
    'Возможно, ссылка устарела или проект ещё не опубликован.': {
      kz: 'Сілтеме ескірген немесе жоба әлі жарияланбаған болуы мүмкін.',
      en: 'The link may be outdated or the project may not have been published yet.'
    },
    'Год': { kz: 'Жыл', en: 'Year' },
    'Статус': { kz: 'Мәртебе', en: 'Status' },
    'Тип': { kz: 'Түрі', en: 'Type' },
    'Локация': { kz: 'Орналасуы', en: 'Location' },
    'Площадь участка': { kz: 'Учаске ауданы', en: 'Site area' },
    'Этажность': { kz: 'Қабат саны', en: 'Storeys' },
    'Общая площадь': { kz: 'Жалпы ауданы', en: 'Gross floor area' },
    'Общий вид': { kz: 'Жалпы көрініс', en: 'Overview' },
    'Двор': { kz: 'Аула', en: 'Courtyard' },
    'Фасад': { kz: 'Қасбет', en: 'Facade' },
    'Вечерний вид': { kz: 'Кешкі көрініс', en: 'Evening view' },
    'Коммерция': { kz: 'Коммерциялық кеңістік', en: 'Retail' },
    'Панорама': { kz: 'Панорама', en: 'Panorama' },
    'Ландшафт': { kz: 'Ландшафт', en: 'Landscape' },
    'Интерьер': { kz: 'Интерьер', en: 'Interior' },
    'Предыдущий': { kz: 'Алдыңғы', en: 'Previous' },
    'Следующий': { kz: 'Келесі', en: 'Next' },
    'Заинтересовал проект?': { kz: 'Жоба қызықтырды ма?', en: 'Interested in this project?' },
    'Обсудить проект': { kz: 'Жобаны талқылау', en: 'Discuss a project' },
    'Смотреть все проекты': { kz: 'Барлық жобаларды көру', en: 'View all projects' },
    'Хлебные крошки': { kz: 'Навигациялық тізбек', en: 'Breadcrumbs' },
    'Закрыть': { kz: 'Жабу', en: 'Close' },
    'Назад': { kz: 'Артқа', en: 'Previous' },
    'Вперёд': { kz: 'Алға', en: 'Next' },
    'Жилой комплекс': { kz: 'Тұрғын үй кешені', en: 'Residential complex' },
    'Гостиница': { kz: 'Қонақүй', en: 'Hotel' },
    'Апартаменты и гостиницы': { kz: 'Апартаменттер мен қонақүйлер', en: 'Apartments and hotels' },
    'Городок': { kz: 'Қалашық', en: 'Town development' },
    'Коттеджный городок': { kz: 'Коттедж қалашығы', en: 'Low-rise community' },
    'Клубный дом': { kz: 'Клубтық үй', en: 'Boutique residence' },
    'Офис': { kz: 'Кеңсе', en: 'Office' },
    'Физкультурно-оздоровительный комплекс': { kz: 'Дене шынықтыру-сауықтыру кешені', en: 'Sports and wellness complex' },
    'Спортивный объект': { kz: 'Спорт нысаны', en: 'Sports facility' },
    'Реализован': { kz: 'Іске асырылған', en: 'Completed' },
    'Мастер-план': { kz: 'Мастер-жоспар', en: 'Master plan' },
    'Концепция': { kz: 'Тұжырымдама', en: 'Concept' },
    'Алматы': { kz: 'Алматы', en: 'Almaty' },
    'Алматинская область': { kz: 'Алматы облысы', en: 'Almaty Region' },
    'Бишкек': { kz: 'Бішкек', en: 'Bishkek' },
    'Жезказган': { kz: 'Жезқазған', en: 'Zhezkazgan' },
    'Казахстан': { kz: 'Қазақстан', en: 'Kazakhstan' },
    'Туркестан': { kz: 'Түркістан', en: 'Turkistan' }
  };

  const projectDescriptions = {
    meliora: {
      kz: [
        'Meliora — қала құрылымына қонақүй кешені кіріктірілген тұрғын квартал. Айқын көше торы, көліксіз жартылай жабық аулалар және адамға сай қабаттылық тыныш әрі жайлы орта қалыптастырады.',
        'Кафе, қызмет көрсету және сауда орындары бар белсенді бірінші қабаттар көшеге ашылады, ал ішкі аулалар көгалдандыру мен тыныш демалысқа арналған. Қонақүй блогы кварталдың тұтастығын бұзбай, оның қоғамдық өмірін жандандырады.'
      ],
      en: [
        'Meliora is a residential quarter with a hotel complex embedded in the urban fabric. A clear street grid, semi-enclosed car-free courtyards and a human scale create a calm, lived-in environment.',
        'Active ground floors with cafés, services and retail open onto the street, while internal courtyards are dedicated to planting and quiet use. The hotel block strengthens public life without disrupting the continuity of the quarter.'
      ]
    },
    vignette: {
      kz: [
        'Meliora кварталының құрамындағы Vignette Collection халықаралық желісінің қонақүйі. Аркалы стилобаты мен панорамалы жоғарғы қабаты бар көлем квартал бұрышын бекітіп, оның салтанатты қасбетін қалыптастырады.',
        'Нөмірлер қоры қаламен байланысқан мейрамханалар, террасалар және бірінші қабаттағы қоғамдық кеңістіктермен толықтырылған.'
      ],
      en: [
        'A Vignette Collection international hotel within the Meliora quarter. Its volume, with an arched plinth and panoramic top floor, anchors the corner and forms the quarter’s principal facade.',
        'Guest rooms are complemented by restaurants, terraces and public ground-floor spaces that open toward the city.'
      ]
    },
    radisson: {
      kz: [
        'Қаланың тарихи орталығына жақын орналасқан халықаралық брендтің қонақүй кешені. Сәулет қоршаған ортаның контексті мен ауқымын құрметтейді.',
        'Қонақүй нөмірлері мен апартаменттер қоғамдық кеңістіктермен, мейрамханалармен және көріністі террасалармен толықтырылған.'
      ],
      en: [
        'An international-brand hotel complex near the city’s historic core. Its architecture respects the context and scale of the surroundings.',
        'Guest rooms and apartments are complemented by public spaces, restaurants and panoramic terraces.'
      ]
    },
    biography: {
      kz: [
        'Тұрғын үй мен коммерциялық қызметтер біртұтас қалалық сценарийге біріктірілген көпфункциялы кешен.',
        'Ұстамды қасбеттер мен сапалы материалдар танымал әрі ұзақ ғұмырлы бейне қалыптастырады.'
      ],
      en: [
        'A mixed-use complex that brings housing and commerce together within a single urban scenario.',
        'Restrained facades and high-quality materials create a recognisable, enduring identity.'
      ]
    },
    naukograd: {
      kz: [
        'Тығыз орталығы мен жасыл қаңқасы бар ғылым қаласының тұжырымдамасы. Зерттеу, өмір сүру және білім алмасуға арналған орта.',
        'Жаяу жүргіншілер желісі мен кешкі жарық сценарийлері қаланың өзіндік сипатын қалыптастырады.'
      ],
      en: [
        'A science-city concept with a dense core and a green framework. An environment for research, living and the exchange of knowledge.',
        'A pedestrian network and evening lighting scenarios define the character of the city.'
      ]
    },
    enesai: {
      kz: [
        'Құрылыс, табиғат және жаяу жүргіншілер байланысы теңгерілген мастер-жоспар тұжырымдамасы.',
        'Кварталдардың модульдік құрылымы аумақты тұтастығын жоғалтпай кезең-кезеңімен дамытуға мүмкіндік береді.'
      ],
      en: [
        'A master plan concept balancing development, nature and pedestrian connections.',
        'The modular structure of the quarters allows the area to grow in stages without losing its coherence.'
      ]
    },
    hayatpark: {
      kz: [
        'Композицияның негізіне парк алынған тұрғын үй кешені. Құрылыс жасыл қоғамдық кеңістікке қарай ашылады.',
        'Әртүрлі биіктіктегі көлемдер ырғақ пен адамға сай ауқым қалыптастырады.'
      ],
      en: [
        'A residential complex organised around a park. The buildings open toward a green public space.',
        'Volumes of varying heights create rhythm and a human scale.'
      ]
    },
    hayatcity: {
      kz: [
        'Өзіндік аулалар мен қоғамдық кеңістіктер жүйесі бар көп кварталды тұрғын үй кешені.',
        'Сәулет таза көлемдер мен материалдардың сабырлы палитрасына негізделген.'
      ],
      en: [
        'A multi-quarter residential complex with its own system of courtyards and public spaces.',
        'The architecture is based on pure volumes and a calm palette of materials.'
      ]
    },
    everest: {
      kz: [
        'Композицияның негізгі осі ретінде бульвары және белсенді бірінші қабаттары бар тұрғын үй кешені.',
        'Қасбет ырғағы мен абаттандыру жанданған қалалық көше қалыптастырады.'
      ],
      en: [
        'A residential complex with a boulevard as its main compositional axis and active ground floors.',
        'The rhythm of the facades and the landscape design create a lively urban street.'
      ]
    },
    monterosa: {
      kz: [
        'Аулалардың жекелігі мен орта сапасына басымдық берілген ықшам тұрғын үй кешені.',
        'Сәулеті ұстамды, бөлшектер мен материалдарға ерекше назар аударылған.'
      ],
      en: [
        'An intimate residential complex focused on courtyard privacy and the quality of its environment.',
        'The architecture is restrained, with careful attention to details and materials.'
      ]
    },
    exclusive: {
      kz: [
        'Ойластырылған абаттандыруы және қасбеттерінің айқын логикасы бар тұрғын үй кешені.',
        'Жоспарлау құрылымы аула кеңістіктерін жарық пен жасыл желекке ашады.'
      ],
      en: [
        'A residential complex with considered landscape design and a clear facade logic.',
        'The planning structure opens the courtyards to light and greenery.'
      ]
    },
    aulet: {
      kz: [
        'Адамға сай ауқымы мен жайлы аулалары бар тұрғын орта.',
        'Қарапайым көлемдер мен материалдардың жылы палитрасы тыныш бейне қалыптастырады.'
      ],
      en: [
        'A residential environment with a human scale and comfortable courtyards.',
        'Simple volumes and a warm material palette create a calm identity.'
      ]
    },
    magnitalatau: {
      kz: [
        'Тұрғын үй, коммерция және белсенді бірінші қабаттар біріктірілген көпфункциялы квартал.',
        'Көліксіз аулалар мен абаттандыру сценарийлері жайлы орта қалыптастырады.'
      ],
      en: [
        'A mixed-use quarter combining housing, commerce and active ground floors.',
        'Car-free courtyards and varied landscape scenarios create a comfortable environment.'
      ]
    },
    jezkazgan: {
      kz: [
        'Өзіндік қоғамдық ортасы бар өңірлік қалаға арналған тұрғын үй кешені.',
        'Сәулет климатты ескеріп, қорғалған аула кеңістіктерін қалыптастырады.'
      ],
      en: [
        'A residential complex for a regional city, with its own public environment.',
        'The architecture responds to the climate and creates sheltered courtyards.'
      ]
    },
    nova23: {
      kz: [
        'Лаконикалық сәулеті және ойластырылған аулалары бар тұрғын үй кешені.',
        'Қасбет шешімдері ырғақ пен сапалы материалдарға негізделген.'
      ],
      en: [
        'A residential complex with concise architecture and carefully planned courtyards.',
        'The facade design is based on rhythm and high-quality materials.'
      ]
    },
    novavillage: {
      kz: [
        'Адамға сай ауқымы мен жасыл көшелері бар аз қабатты елді мекен.',
        'Үйлер мен абаттандыру тұтас әрі тыныш ортаға біріктірілген.'
      ],
      en: [
        'A low-rise community with a human scale and green streets.',
        'The houses and landscape design come together as a coherent, calm environment.'
      ]
    },
    novapark: {
      kz: [
        'Жеке аулалары және қасбеттерінің әртүрлі әрленімі бар таунхаустар кварталы.',
        'Ағаш пен кірпіш құрылысқа жылы, үйге тән сипат береді.'
      ],
      en: [
        'A townhouse quarter with private courtyards and varied facade finishes.',
        'Timber and brick give the development a warm, domestic character.'
      ]
    },
    terrenkur: {
      kz: [
        'Террасалы құрылымы мен дамыған абаттандыруы бар тұрғын үй кешені.',
        'Спорттық және балаларға арналған сценарийлер ауланың жасыл қаңқасына кіріктірілген.'
      ],
      en: [
        'A residential complex with a terraced structure and extensive landscape design.',
        'Sports and children’s activities are integrated into the courtyard’s green framework.'
      ]
    },
    familyclub: {
      kz: [
        'Отбасылық өмір сценарийлеріне бағытталған тұрғын үй кешені.',
        'Аулалар мен қоғамдық кеңістіктер қауіпсіз орта төңірегіне біріктірілген.'
      ],
      en: [
        'A residential complex designed around patterns of family life.',
        'Courtyards and public spaces are organised to create a safe environment.'
      ]
    },
    familycomfort: {
      kz: [
        'Жайлылық пен аула ортасының сапасына басымдық берілген тұрғын үй кешені.',
        'Бөлшектер мен ұзақ ғұмырлылыққа назар аударылған ұстамды сәулет.'
      ],
      en: [
        'A residential complex focused on comfort and the quality of the courtyard environment.',
        'Restrained architecture with attention to detail and longevity.'
      ]
    },
    highgarden: {
      kz: [
        'Көгалдандырылған аулалары және көлемдерінің айқын композициясы бар тұрғын үй кешені.',
        'Сәулет таза геометрия мен сабырлы палитраға негізделген.'
      ],
      en: [
        'A residential complex with planted courtyards and a clear composition of volumes.',
        'The architecture is based on pure geometry and a calm palette.'
      ]
    },
    altyncity: {
      kz: [
        'Тұтас қалалық құрылымы және белсенді бірінші қабаттары бар тұрғын квартал.',
        'Абаттандыру мен қасбеттер ауданның танымал бейнесін қалыптастырады.'
      ],
      en: [
        'A residential quarter with a coherent urban structure and active ground floors.',
        'The landscape design and facades create a recognisable identity for the district.'
      ]
    },
    alatauvillage: {
      kz: [
        'Табиғат пен көріністерге басымдық берілген тау бөктеріндегі тұрғын орта.',
        'Аз қабатты құрылыс тыныш әрі жасыл ортаға біріктірілген.'
      ],
      en: [
        'A residential environment at the foot of the mountains, focused on nature and views.',
        'The low-rise development forms a calm, green setting.'
      ]
    },
    besagash: {
      kz: [
        'Жеке аулалары мен жасыл көшелері бар қала сыртындағы тұрғын үй кешені.',
        'Сәулеті ұстамды, жарық пен материалдарға ерекше назар аударылған.'
      ],
      en: [
        'A suburban residential complex with private courtyards and green streets.',
        'The architecture is restrained, with careful attention to light and materials.'
      ]
    },
    tausamal: {
      kz: [
        'Қаланың тау бөктеріндегі бөлігінде орналасқан, ландшафтқа ашылған тұрғын үй кешені.',
        'Көлемдер мен абаттандыру учаскенің көріністері мен бедеріне бағынады.'
      ],
      en: [
        'A residential complex in the foothills, opening toward the landscape.',
        'The volumes and landscape design respond to the site’s views and topography.'
      ]
    },
    turar: {
      kz: [
        'Айқын жоспарлау құрылымы және жайлы аулалары бар тұрғын үй кешені.',
        'Қасбеттер сабырлы ырғақ пен сапалы материалдарға негізделген.'
      ],
      en: [
        'A residential complex with a clear planning structure and comfortable courtyards.',
        'The facades are defined by a calm rhythm and high-quality materials.'
      ]
    },
    ubileyny: {
      kz: [
        'Өзіндік қоғамдық ортасы мен абаттандыруы бар тұрғын үй кешені.',
        'Сәулет таза көлемдер мен ұзақ қызмет ететін материалдарға сүйенеді.'
      ],
      en: [
        'A residential complex with its own public environment and landscape design.',
        'The architecture draws on pure volumes and durable materials.'
      ]
    },
    arkoncity: {
      kz: [
        'Коммерция, паркинг және абаттандырылған ауласы бар биік тұрғын үй кешені.',
        'Көлемдер композициясы мәнерлі қалалық силуэт қалыптастырады.'
      ],
      en: [
        'A high-rise residential complex with retail, parking and landscaped courtyards.',
        'The composition of volumes creates an expressive urban skyline.'
      ]
    },
    abaisaina: {
      kz: [
        'Қалалық магистральдар қиылысында орналасқан, белсенді бірінші қабаты бар тұрғын үй кешені.',
        'Сәулеті ұстамды, ауқым мен материалдарға назар аударылған.'
      ],
      en: [
        'A residential complex at the intersection of major urban roads, with an active ground floor.',
        'The architecture is restrained, with an emphasis on scale and materials.'
      ]
    },
    abainauryzbaya: {
      kz: [
        'Тығыз қалалық құрылымда орналасқан, жеке ауласы бар тұрғын үй кешені.',
        'Қасбет шешімдері таза геометрия мен ырғаққа негізделген.'
      ],
      en: [
        'A residential complex within a dense urban fabric, with its own courtyard.',
        'The facade design is based on pure geometry and rhythm.'
      ]
    },
    mountaindrive: {
      kz: [
        'Мәнерлі қасбет пластикасы және көріністі кеңістіктері бар кеңсе ғимараты.',
        'Сәулет функционалдық пен танымал бейнені үйлестіреді.'
      ],
      en: [
        'An office building with an expressive facade and spaces oriented toward the views.',
        'The architecture combines functionality with a distinctive identity.'
      ]
    },
    munartau: {
      kz: [
        'Көлемдері ландшафт пен көріністерге ашылған тау бөктеріндегі тұрғын үй кешені.',
        'Құрылыс композициясы мен абаттандыру бедерге және табиғи ортаға бағынады.'
      ],
      en: [
        'A residential complex at the foot of the mountains, with volumes opening toward the landscape and views.',
        'The composition and landscape design respond to the terrain and natural surroundings.'
      ]
    },
    fok: {
      kz: [
        'Бассейні, ойын және жаттығу залдары бар көпфункциялы дене шынықтыру-сауықтыру кешені.',
        'Үлкен аралықтар мен табиғи жарық ашық әрі жарық спорттық орта қалыптастырады.'
      ],
      en: [
        'A multifunctional sports and wellness complex with a swimming pool, games hall and training facilities.',
        'Large spans and natural light create an open, bright sporting environment.'
      ]
    },
    judo: {
      kz: [
        'Үлкен аралықтары және айқын қоғамдық құрылымы бар спорт орталығы.',
        'Сәулет спорт нысанының динамикасы мен ауқымын айқындайды.'
      ],
      en: [
        'A sports centre with large spans and a clear public organisation.',
        'The architecture expresses the dynamism and scale of the sporting venue.'
      ]
    }
  };

  const dictionary = new Map();
  Object.entries(copy).forEach(([source, translations]) => {
    if (translations[language]) dictionary.set(source, translations[language]);
  });

  if (language !== 'ru' && Array.isArray(window.PROJECTS)) {
    window.PROJECTS.forEach(project => {
      const translations = projectDescriptions[project.slug] && projectDescriptions[project.slug][language];
      if (!translations) return;
      (project.desc || []).forEach((source, index) => {
        if (translations[index]) dictionary.set(source, translations[index]);
      });
    });
  }

  const replacementPairs = [...dictionary.entries()].sort((a, b) => b[0].length - a[0].length);

  function translate(value) {
    if (language === 'ru' || typeof value !== 'string' || !value) return value;
    if (dictionary.has(value)) return dictionary.get(value);

    let translated = value;
    replacementPairs.forEach(([source, target]) => {
      if (translated.includes(source)) translated = translated.split(source).join(target);
    });

    if (language === 'en') {
      translated = translated
        .replace(/(\d),(\d)/g, '$1.$2')
        .replace(/(\d(?:[.\d ]*\d)?)\s*га(?=$|[\s·,.)])/g, '$1 ha');
    }
    return translated;
  }

  function translateTextNode(node) {
    const value = node.nodeValue;
    if (!value || !value.trim()) return;
    const leading = value.match(/^\s*/)[0];
    const trailing = value.match(/\s*$/)[0];
    const core = value.slice(leading.length, value.length - trailing.length);
    const translated = translate(core);
    if (translated !== core) node.nodeValue = leading + translated + trailing;
  }

  function isSkipped(element) {
    return ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(element.tagName);
  }

  function translateAttributes(element) {
    ['placeholder', 'aria-label', 'alt', 'title'].forEach(attribute => {
      if (!element.hasAttribute(attribute)) return;
      const value = element.getAttribute(attribute);
      const translated = translate(value);
      if (translated !== value) element.setAttribute(attribute, translated);
    });
    if (element.tagName === 'META' && element.hasAttribute('content')) {
      const value = element.getAttribute('content');
      const translated = translate(value);
      if (translated !== value) element.setAttribute('content', translated);
    }
  }

  function withLanguage(rawHref) {
    if (!rawHref || language === 'ru') return rawHref;
    if (/^(?:https?:|mailto:|tel:|javascript:|data:)/i.test(rawHref) || rawHref.startsWith('#')) return rawHref;
    try {
      const url = new URL(rawHref, location.href);
      if (url.origin !== location.origin) return rawHref;
      url.searchParams.set('lang', language);
      return url.pathname.split('/').pop() + url.search + url.hash;
    } catch (_) {
      return rawHref;
    }
  }

  function localizeLink(link) {
    if (link.dataset.language) return;
    const href = link.getAttribute('href');
    const localized = withLanguage(href);
    if (localized && localized !== href) link.setAttribute('href', localized);
  }

  function translateTree(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      translateTextNode(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE || isSkipped(root)) return;

    translateAttributes(root);
    if (root.tagName === 'A') localizeLink(root);
    [...root.childNodes].forEach(translateTree);
  }

  function languageUrl(nextLanguage) {
    const url = new URL(location.href);
    url.searchParams.set('lang', nextLanguage);
    return url.pathname.split('/').pop() + url.search + url.hash;
  }

  function switcherMarkup() {
    return LANGUAGES.map(code => {
      const current = code === language;
      return `<a href="${languageUrl(code)}" data-language="${code}"${current ? ' class="active" aria-current="page"' : ''}>${code.toUpperCase()}</a>`;
    }).join('<span aria-hidden="true"> · </span>');
  }

  function renderSwitchers() {
    document.querySelectorAll('.lang, .m-lang').forEach(element => {
      element.setAttribute('aria-label', language === 'kz' ? 'Тілді таңдау' : language === 'en' ? 'Choose language' : 'Выбор языка');
      element.innerHTML = switcherMarkup();
    });
    document.querySelectorAll('.foot-bottom small:last-child').forEach(element => {
      element.classList.add('foot-lang');
      element.setAttribute('aria-label', language === 'kz' ? 'Тілді таңдау' : language === 'en' ? 'Choose language' : 'Выбор языка');
      element.innerHTML = switcherMarkup();
    });
  }

  function addAlternateLinks() {
    LANGUAGES.forEach(code => {
      const alternate = document.createElement('link');
      alternate.rel = 'alternate';
      alternate.hreflang = code === 'kz' ? 'kk' : code;
      alternate.href = new URL(languageUrl(code), location.href).href;
      document.head.appendChild(alternate);
    });
    const fallback = document.createElement('link');
    fallback.rel = 'alternate';
    fallback.hreflang = 'x-default';
    fallback.href = new URL(languageUrl('ru'), location.href).href;
    document.head.appendChild(fallback);
  }

  const style = document.createElement('style');
  style.textContent = `
    .lang a,.m-lang a,.foot-lang a{color:inherit;text-decoration:none;transition:color .2s ease}
    .lang a:hover,.m-lang a:hover,.foot-lang a:hover,
    .lang a.active,.m-lang a.active,.foot-lang a.active{color:#fff}
    .lang a,.m-lang a{display:inline-block;padding:8px 2px}
    .foot-lang a{display:inline-block;padding:4px 1px}
  `;
  document.head.appendChild(style);

  window.MOST_I18N = {
    language,
    translate,
    href: withLanguage
  };

  renderSwitchers();
  translateTree(document.documentElement);
  addAlternateLinks();

  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.type === 'characterData') {
        translateTextNode(mutation.target);
        return;
      }
      if (mutation.type === 'attributes') {
        translateAttributes(mutation.target);
        return;
      }
      mutation.addedNodes.forEach(translateTree);
    });
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['placeholder', 'aria-label', 'alt', 'title', 'content']
  });
})();
