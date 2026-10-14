// lib/bot — что ответить на сообщение или нажатие кнопки. Без 'sdk', чтобы проверять тестами.
//
// Ответ — { text, reply_markup }: текст в parse_mode HTML и клавиатура к нему.

import {
  DAY_SHORT, addDays, ddmm, formatDay, formatParity, formatWeek,
  isSemesterWeek, isoDate, mondayOf, parseDate, today, weekNumber, weekday,
} from './schedule.js';

// Тексты кнопок не меняй: по ним узнаём нажатия, а у людей уже стоит эта клавиатура.
export const BUTTONS = {
  today: '📅 Сегодня',
  tomorrow: '➡️ Завтра',
  week: '🗓 Неделя',
  parity: '🔢 Чётность',
};

export const KEYBOARD = {
  keyboard: [
    [{ text: BUTTONS.today }, { text: BUTTONS.tomorrow }],
    [{ text: BUTTONS.week }, { text: BUTTONS.parity }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: 'Какие пары показать?',
};

export const COMMANDS = [
  { command: 'today', description: '📅 Пары на сегодня' },
  { command: 'tomorrow', description: '➡️ Пары на завтра' },
  { command: 'week', description: '🗓 Расписание на неделю' },
  { command: 'parity', description: '🔢 Чётная или нечётная неделя' },
  { command: 'help', description: '💬 Что умеет бот' },
];

// Профиль бота: DESCRIPTION видно в пустом чате до /start, SHORT_DESCRIPTION — в профиле.
export const DESCRIPTION = [
  '📚 Расписание группы Б-ЭО-26',
  '',
  '• пары на сегодня и завтра — со временем, аудиторией и преподавателем',
  '• расписание на всю неделю',
  '• чётная сейчас неделя или нечётная',
].join('\n');

export const SHORT_DESCRIPTION = '📅 Пары группы Б-ЭО-26: сегодня, завтра, на неделю и чётность недели';

// Mini App (папка webapp/). Адрес выдаёт платформа — его печатает `npm run deploy`.
export const MINI_APP_URL = 'https://app8605454352.tgcloud.ai/';

// Кнопка слева от поля ввода в личке с ботом — открывает Mini App.
export const MENU_BUTTON = { type: 'web_app', text: 'Расписание', web_app: { url: MINI_APP_URL } };

const HELP_TEXT = [
  '👋 <b>Привет! Я бот расписания группы Б-ЭО-26</b>',
  '',
  'Подскажу, какие сегодня пары, где они проходят и какая сейчас неделя.',
  '',
  '📅 /today — пары на сегодня',
  '➡️ /tomorrow — на завтра',
  '🗓 /week — вся неделя',
  '🔢 /parity — чётная или нечётная',
  '',
  'Стрелки ◀️ ▶️ под расписанием листают дни и недели прямо в сообщении.',
  'А кнопка <b>«Расписание»</b> слева от поля ввода открывает приложение — там всё то же, но удобнее.',
  '',
  '<i>Время — якутское.</i>',
].join('\n');

// --- Кнопки под сообщением ---
// callback_data: 'd:ГГГГ-ММ-ДД' — день, 'w:ГГГГ-ММ-ДД' — неделя с этим днём.
// Вместо даты может стоять 'today' — день нажатия, а не отправки: кнопка «Сегодня»
// в позавчерашнем сообщении должна открыть сегодня.

const TODAY = 'today';

function button(text, kind, date) {
  return { text, callback_data: `${kind}:${date === TODAY ? TODAY : isoDate(date)}` };
}

function shortDate(date) {
  return `${DAY_SHORT[weekday(date) - 1]} ${ddmm(date)}`;
}

function dayKeyboard(date, nowMs) {
  // Воскресенье пропускаем: из понедельника назад — в субботу, из субботы вперёд — в понедельник.
  const prev = addDays(date, weekday(date) === 1 ? -2 : -1);
  const next = addDays(date, weekday(date) === 6 ? 2 : 1);
  const isToday = date.getTime() === today(nowMs).getTime();
  return {
    inline_keyboard: [
      [button(`◀️ ${shortDate(prev)}`, 'd', prev), button(`${shortDate(next)} ▶️`, 'd', next)],
      [button(isToday ? '🔄 Обновить' : '📅 Сегодня', 'd', TODAY), button('🗓 Вся неделя', 'w', date)],
    ],
  };
}

function weekKeyboard(date, nowMs) {
  const monday = mondayOf(date);
  const now = today(nowMs);
  const isCurrent = monday.getTime() === mondayOf(now).getTime();
  const label = (d) => (isSemesterWeek(d) ? `${weekNumber(d)}-я нед.` : '');
  const prev = addDays(monday, -7);
  const next = addDays(monday, 7);

  const days = DAY_SHORT.slice(0, 6).map((name, i) => {
    const day = addDays(monday, i);
    return button(day.getTime() === now.getTime() ? `•${name}•` : name, 'd', day);
  });
  return {
    inline_keyboard: [
      days,
      [
        button(`◀️ ${label(prev)}`.trim(), 'w', prev),
        button(isCurrent ? '🔄 Обновить' : '🗓 Эта неделя', 'w', TODAY),
        button(`${label(next)} ▶️`.trim(), 'w', next),
      ],
    ],
  };
}

function dayView(date, nowMs) {
  return { text: formatDay(date, nowMs), reply_markup: dayKeyboard(date, nowMs) };
}

function weekView(date, nowMs) {
  return { text: formatWeek(date, nowMs), reply_markup: weekKeyboard(date, nowMs) };
}

function parityView(nowMs) {
  return {
    text: formatParity(today(nowMs)),
    reply_markup: { inline_keyboard: [[button('🗓 Расписание на неделю', 'w', TODAY)]] },
  };
}

const help = () => ({ text: HELP_TEXT, reply_markup: KEYBOARD });

const ACTIONS = {
  start: help,
  help,
  today: (now) => dayView(today(now), now),
  tomorrow: (now) => dayView(addDays(today(now), 1), now),
  week: (now) => weekView(today(now), now),
  parity: (now) => parityView(now),
};

const COMMAND = /^\/([a-z_]+)(?:@(\w+))?(?:\s|$)/i;

/** Какое действие просят: '/today', '/today@bot_name' или текст кнопки. */
export function actionFor(text) {
  if (!text) return null;
  for (const [action, label] of Object.entries(BUTTONS)) {
    if (text.trim() === label) return action;
  }
  const command = COMMAND.exec(text.trim())?.[1].toLowerCase();
  return command && command in ACTIONS ? command : null;
}

/** Какому боту адресована команда: '/today@Some_bot' → 'some_bot'; без упоминания — null. */
export function commandMention(text) {
  return COMMAND.exec(text?.trim() ?? '')?.[2]?.toLowerCase() ?? null;
}

/**
 * Ответ на сообщение или null, если отвечать не нужно
 * (в группах бот молчит на посторонние сообщения).
 */
export function replyTo(message, nowMs = Date.now()) {
  const action = actionFor(message.text);
  if (action) return ACTIONS[action](nowMs);
  if (message.chat?.type === 'private') {
    return { text: 'Не понял 🤔 Жми кнопки внизу или /help', reply_markup: KEYBOARD };
  }
  return null;
}

/** Что показать по нажатию кнопки под сообщением; null — непонятная кнопка. */
export function viewFor(data, nowMs = Date.now()) {
  const match = /^([dw]):(today|\d{4}-\d{2}-\d{2})$/.exec(data ?? '');
  if (!match) return null;
  const date = match[2] === TODAY ? today(nowMs) : parseDate(match[2]);
  if (match[2] !== TODAY && isoDate(date) !== match[2]) return null; // 2026-02-31 и подобное
  return match[1] === 'd' ? dayView(date, nowMs) : weekView(date, nowMs);
}
