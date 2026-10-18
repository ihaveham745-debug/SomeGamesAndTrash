// lib/school — расписание 10-х классов (I смена, 2026–2027).
// Источник: фото «Расписание уроков I смена» и «Расписание звонков» (октябрь 2026).
//
// Как устроена таблица: 10а и 10б — классы, сэ / тех / ен / гум — профильные группы,
// в которых смешаны ученики обоих классов. Белые ячейки — урок всего класса,
// серые — урок профильной группы (у каждой — свой). Поэтому ученик выбирает и класс,
// и профиль: например, у «10а · гум» общие уроки — из колонки 10а, профильные — из колонки гум.
// «(Б)» в таблице — базовый уровень: здесь это type: 'база'.

export const TITLE = '10-х классов';

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

export const GRADES = { a: '10а', b: '10б' };

export const PROFILES = {
  se: { name: 'социально-экономический', short: 'сэ' },
  tech: { name: 'технологический', short: 'тех' },
  en: { name: 'естественно-научный', short: 'ен' },
  gum: { name: 'гуманитарный', short: 'гум' },
};

/** Варианты выбора: 'a-se' … 'b-gum' — класс и профиль. Порядок — порядок кнопок. */
export const CLASSES = Object.fromEntries(Object.entries(GRADES).flatMap(([g, grade]) =>
  Object.entries(PROFILES).map(([p, prof]) => [`${g}-${p}`, { grade, gradeKey: g, profileKey: p, profile: prof.name, short: prof.short }])));

/** '10а · гум' */
export const classLabel = (id) => `${CLASSES[id].grade} · ${CLASSES[id].short}`;

/** Название группы урока: 'a' → '10а', 'gum' → 'гум'. */
export const groupLabel = (group) => GRADES[group] ?? PROFILES[group]?.short ?? group;

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

/** Урок: предмет, кабинет, необязательно 'база'. group — чей урок: 'a'/'b' (класс) или профиль. */
const L = (group, subject, room, type) => ({ group, subject, room, ...(type && { type }) });

// Строка таблицы — урок n. Части:
//   A(…) / B(…)          — белая ячейка: урок всего 10а / 10б;
//   P('se tech', …)       — серая ячейка на несколько профилей (общая группа);
//   S([сэ], [тех], [ен], [гум]) — серые ячейки, у каждого профиля своё (null — урока нет).
const A = (...lesson) => ({ a: L('a', ...lesson) });
const B = (...lesson) => ({ b: L('b', ...lesson) });
const P = (profiles, ...lesson) => Object.fromEntries(profiles.split(' ').map((p) => [p, L(p, ...lesson)]));
const S = (...cells) => Object.fromEntries(
  Object.keys(PROFILES).map((p, i) => [p, cells[i]]).filter(([, c]) => c).map(([p, c]) => [p, L(p, ...c)]),
);
const row = (n, ...parts) => ({ n, ...Object.assign({}, ...parts) });

export const ROWS = {
  1: [
    row(1, S([SOC, '113'], [EN, '207'], [EN, '114'], [SOC, '113'])),
    row(2, S([SOC, '113'], [EN, '207'], [CHEM, '210'], [SOC, '113'])),
    row(3, S([EN, '207'], [INF, '208'], [BIO, '212'], [EN, '206'])),
    row(4, S([EN, '207'], [INF, '208'], [BIO, '212'], [EN, '206'])),
    row(5, A(TALKS, '210'), B(TALKS, '212')),
    row(6, P('se tech', MATH, '115'), P('en gum', MATH, '212')),
    row(7, P('se tech', MATH, '115'), P('en gum', MATH, '212')),
  ],
  2: [
    row(1, P('se tech', MATH, '115'), S(null, null, [EN, '111'], [CHEM, '210', 'база'])),
    row(2, S([INF, '208'], [PHYS, '213'], [EN, '111'], [BIO, '212', 'база'])),
    row(3, S([INF, '208'], [PHYS, '213'], [BIO, '212'], [EN, '111'])),
    row(4, A(PE, GYM), B(LIT, '211')),
    row(5, A(PE, GYM), B(LIT, '211')),
    row(6, A(LIT, '211'), B(PE, GYM)),
    row(7, A(LIT, '211'), B(PE, GYM)),
  ],
  3: [
    row(1, A(RU, '206'), B(HIST, '113')),
    row(2, A(RU, '206'), B(HIST, '113')),
    row(3, S(['Общественная география', '211'], [PHYS, '213'], ['Решение уравнений', '115'], [EN, '114'])),
    row(4, S([EN, '207'], [PHYS, '213']), P('en gum', MATH, '210')),
    row(5, P('se tech', MATH, '115'), P('en gum', MATH, '210')),
    row(6, A(HIST, '114'), B(RU, '211')),
    row(7, A(HIST, '114'), B(RU, '211')),
  ],
  4: [
    row(1, A(HORIZONS, '210'), B(HORIZONS, '212')),
    row(2, P('se tech', BIO, '212', 'база'), S(null, null, ['Биохимия', '210'], ['Введение в литературоведение', '213'])),
    row(3, P('se tech', MATH, '115'), S(null, null, [CHEM, '210'], ['Стилистика', '213'])),
    row(4, P('se tech', MATH, '115'), S(null, null, [CHEM, '210'], [EN, '110'])),
    row(5, P('se tech', PROB, '115'), P('en gum', OBZR, 'НШ')),
    row(6, A(GEO, '211'), B(LIT, '213')),
    row(7, A(LIT, '114'), B(GEO, '211')),
  ],
  5: [
    row(1, S([SOC, '114'], [INF, '208'], ['Биофизика', '212'], [SOC, '114'])),
    row(2, S([SOC, '114'], [INF, '208'], [INF, '208'], [SOC, '114'])),
    row(3, P('se tech', CHEM, '210', 'база'), P('en gum', PHYS, '213', 'база')),
    row(4, P('se tech', OBZR, 'НШ'), P('en gum', PHYS, '213', 'база')),
    // 5–6: обществознание — общая группа тех + ен
    row(5, S([PHYS, '213', 'база'], null, null, [INF, '208']), P('tech en', SOC, '113')),
    row(6, S([PHYS, '213', 'база'], null, null, ['Деловой английский', '114']), P('tech en', SOC, '113')),
    row(7, S(null, [PHYS, '213']), P('en gum', PROB, '112')),
  ],
};

/**
 * TIMETABLE[вариант][день] — уроки: { n, group, subject, room, type? }.
 * Урок строки — белая ячейка своего класса, а если её нет — серая своего профиля.
 * День: 1 = понедельник … 7 = воскресенье.
 */
export const TIMETABLE = Object.fromEntries(Object.entries(CLASSES).map(([id, c]) => [
  id,
  Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((day) => [
    day,
    (ROWS[day] ?? []).map((r) => {
      const lesson = r[c.gradeKey] ?? r[c.profileKey];
      return lesson && { n: r.n, ...lesson };
    }).filter(Boolean),
  ])),
]));
