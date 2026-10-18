// lib/school — расписание 10-х классов (I смена, 2026–2027).
// Источник: фото «Расписание уроков I смена» и «Расписание звонков» (октябрь 2026).
//
// В 10а и 10б уроки делятся по профилям: у 10а — сэ и тех, у 10б — ен и гум.
// Каждый в боте выбирает свой профиль и видит только свои уроки.
// «(Б)» в таблице — базовый уровень: здесь это type: 'база'.

export const TITLE = '10-е классы';

// Бот: id его приложения в Telegram Serverless и адрес Mini App.
export const APP_ID = 'app8734400455';
export const MINI_APP_URL = 'https://app8734400455.tgcloud.ai/';

// Учебный год. Каникулы не учитываются.
export const YEAR_START = '2026-09-01';
export const YEAR_END = '2027-05-31';

// Якутск: UTC+9, без перехода на летнее время.
export const UTC_OFFSET_HOURS = 9;

// I смена.
export const BELLS = {
  1: '08:00–08:40',
  2: '08:50–09:30',
  3: '09:40–10:20',
  4: '10:35–11:15',
  5: '11:25–12:05',
  6: '12:15–12:55',
  7: '13:05–13:45',
};

// Порядок здесь — порядок кнопок выбора.
export const CLASSES = {
  se: { grade: '10а', profile: 'социально-экономический', short: 'сэ' },
  tech: { grade: '10а', profile: 'технологический', short: 'тех' },
  en: { grade: '10б', profile: 'естественно-научный', short: 'ен' },
  gum: { grade: '10б', profile: 'гуманитарный', short: 'гум' },
};

/** '10а · сэ' */
export const classLabel = (id) => `${CLASSES[id].grade} · ${CLASSES[id].short}`;

// --- Предметы ---
const RU = 'Русский язык';
const LIT = 'Литература';
const EN = 'Английский язык';
const MATH = 'Математика';
const PROB = 'Вероятность и статистика';
const INF = 'Информатика';
const PHYS = 'Физика';
const CHEM = 'Химия';
const BIO = 'Биология';
const HIST = 'История';
const SOC = 'Обществознание';
const GEO = 'География';
const PE = 'Физкультура';
const OBZR = 'ОБЗР';
const TALKS = 'Разговоры о важном';
const HORIZONS = 'Россия — мои горизонты';

const GYM = 'спортзал';

/** Урок: [предмет, кабинет] или [предмет, кабинет, 'база']. */
const L = (subject, room, type) => ({ subject, room, ...(type && { type }) });

// Строка таблицы: урок n у сэ, тех, ен, гум (null — урока нет).
// a(…) — один урок на весь 10а, b(…) — на весь 10б.
const a = (...lesson) => ({ se: L(...lesson), tech: L(...lesson) });
const b = (...lesson) => ({ en: L(...lesson), gum: L(...lesson) });
const row = (n, ...parts) => ({ n, ...Object.assign({}, ...parts) });
const split = (...cells) => Object.fromEntries(
  ['se', 'tech', 'en', 'gum'].map((id, i) => [id, cells[i]]).filter(([, c]) => c).map(([id, c]) => [id, L(...c)]),
);

const DAYS = {
  1: [
    row(1, split([SOC, '113'], [EN, '207'], [EN, '114'], [SOC, '113'])),
    row(2, split([SOC, '113'], [EN, '207'], [CHEM, '210'], [SOC, '113'])),
    row(3, split([EN, '207'], [INF, '208'], [BIO, '212'], [EN, '206'])),
    row(4, split([EN, '207'], [INF, '208'], [BIO, '212'], [EN, '206'])),
    row(5, a(TALKS, '210'), b(TALKS, '212')),
    row(6, a(MATH, '115'), b(MATH, '212')),
    row(7, a(MATH, '115'), b(MATH, '212')),
  ],
  2: [
    row(1, a(MATH, '115'), split(null, null, [EN, '111'], [CHEM, '210', 'база'])),
    row(2, split([INF, '208'], [PHYS, '213'], [EN, '111'], [BIO, '212', 'база'])),
    row(3, split([INF, '208'], [PHYS, '213'], [BIO, '212'], [EN, '111'])),
    row(4, a(PE, GYM), b(LIT, '211')),
    row(5, a(PE, GYM), b(LIT, '211')),
    row(6, a(LIT, '211'), b(PE, GYM)),
    row(7, a(LIT, '211'), b(PE, GYM)),
  ],
  3: [
    row(1, a(RU, '206'), b(HIST, '113')),
    row(2, a(RU, '206'), b(HIST, '113')),
    row(3, split(['Общественная география', '211'], [PHYS, '213'], ['Решение уравнений', '115'], [EN, '114'])),
    row(4, split([EN, '207'], [PHYS, '213']), b(MATH, '210')),
    row(5, a(MATH, '115'), b(MATH, '210')),
    row(6, a(HIST, '114'), b(RU, '211')),
    row(7, a(HIST, '114'), b(RU, '211')),
  ],
  4: [
    row(1, a(HORIZONS, '210'), b(HORIZONS, '212')),
    row(2, a(BIO, '212', 'база'), split(null, null, ['Биохимия', '210'], ['Введение в литературоведение', '213'])),
    row(3, a(MATH, '115'), split(null, null, [CHEM, '210'], ['Стилистика', '213'])),
    row(4, a(MATH, '115'), split(null, null, [CHEM, '210'], [EN, '110'])),
    row(5, a(PROB, '115'), b(OBZR, 'НШ')),
    row(6, a(GEO, '211'), b(LIT, '213')),
    row(7, a(LIT, '114'), b(GEO, '211')),
  ],
  5: [
    row(1, split([SOC, '114'], [INF, '208'], ['Биофизика', '212'], [SOC, '114'])),
    row(2, split([SOC, '114'], [INF, '208'], [INF, '208'], [SOC, '114'])),
    row(3, a(CHEM, '210', 'база'), b(PHYS, '213', 'база')),
    row(4, a(OBZR, 'НШ'), b(PHYS, '213', 'база')),
    // 5–6: обществознание у тех и ен — общий урок в 113
    row(5, split([PHYS, '213', 'база'], [SOC, '113'], [SOC, '113'], [INF, '208'])),
    row(6, split([PHYS, '213', 'база'], [SOC, '113'], [SOC, '113'], ['Деловой английский', '114'])),
    row(7, split(null, [PHYS, '213']), b(PROB, '112')),
  ],
};

/** TIMETABLE[класс][день] — уроки: { n, subject, room, type? }. День: 1 = понедельник … 7 = воскресенье. */
export const TIMETABLE = Object.fromEntries(Object.keys(CLASSES).map((id) => [
  id,
  Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((day) => [
    day,
    (DAYS[day] ?? []).filter((r) => r[id]).map((r) => ({ n: r.n, ...r[id] })),
  ])),
]));
