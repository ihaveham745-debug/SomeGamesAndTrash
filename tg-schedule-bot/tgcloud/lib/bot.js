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
  '<i>Время — якутское.</i>',
].join('\n');

// --- Кнопки под сообщением (callback_data: 'd:ГГГГ-ММ-ДД' — день, 'w:ГГГГ-ММ-ДД' — неделя) ---

function button(text, date, kind) {
  return { text, callback_data: `${kind}:${isoDate(date)}` };
}

function shortDate(date) {
  return `${DAY_SHORT[weekday(date) - 1]} ${ddmm(date)}`;
}

function dayKeyboard(date, nowMs) {
  // Воскресенье пропускаем: из понедельника назад — в субботу, из субботы вперёд — в понедельник.
  const prev = addDays(date, weekday(date) === 1 ? -2 : -1);
  const next = addDays(date, weekday(date) === 6 ? 2 : 1);
  const now = today(nowMs);
  const isToday = date.getTime() === now.getTime();
  return {
    inline_keyboard: [
      [button(`◀️ ${shortDate(prev)}`, prev, 'd'), button(`${shortDate(next)} ▶️`, next, 'd')],
      [button(isToday ? '🔄 Обновить' : '📅 Сегодня', now, 'd'), button('🗓 Вся неделя', date, 'w')],
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
    return button(day.getTime() === now.getTime() ? `•${name}•` : name, day, 'd');
  });
  return {
    inline_keyboard: [
      days,
      [
        button(`◀️ ${label(prev)}`.trim(), prev, 'w'),
        button(isCurrent ? '🔄 Обновить' : '🗓 Эта неделя', now, 'w'),
        button(`${label(next)} ▶️`.trim(), next, 'w'),
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
  const now = today(nowMs);
  return {
    text: formatParity(now),
    reply_markup: { inline_keyboard: [[button('🗓 Расписание на неделю', now, 'w')]] },
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

/** Какое действие просят: '/today', '/today@bot_name' или текст кнопки. */
export function actionFor(text) {
  if (!text) return null;
  for (const [action, label] of Object.entries(BUTTONS)) {
    if (text.trim() === label) return action;
  }
  const match = /^\/([a-z_]+)(@\w+)?(\s|$)/i.exec(text.trim());
  const command = match?.[1].toLowerCase();
  return command && command in ACTIONS ? command : null;
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
  const match = /^([dw]):(\d{4}-\d{2}-\d{2})$/.exec(data ?? '');
  if (!match) return null;
  const date = parseDate(match[2]);
  if (isoDate(date) !== match[2]) return null; // 2026-02-31 и подобное
  return match[1] === 'd' ? dayView(date, nowMs) : weekView(date, nowMs);
}
