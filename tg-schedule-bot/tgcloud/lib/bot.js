// lib/bot — что ответить на сообщение. Без 'sdk', чтобы проверять тестами.

import { addDays, formatDay, formatParity, formatWeek, today } from './schedule.js';

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
};

export const COMMANDS = [
  { command: 'today', description: 'Пары на сегодня' },
  { command: 'tomorrow', description: 'Пары на завтра' },
  { command: 'week', description: 'Расписание на эту неделю' },
  { command: 'parity', description: 'Чётная или нечётная неделя' },
  { command: 'help', description: 'Что умеет бот' },
];

const HELP_TEXT = [
  'Привет! Я подскажу, какие сегодня пары у <b>Б-ЭО-26</b> и какая сейчас неделя.',
  '',
  '/today — пары на сегодня',
  '/tomorrow — пары на завтра',
  '/week — расписание на текущую неделю',
  '/parity — чётная или нечётная неделя',
  '',
  'Или жми кнопки внизу 👇',
].join('\n');

const ACTIONS = {
  start: () => HELP_TEXT,
  help: () => HELP_TEXT,
  today: (now) => formatDay(today(now), 'Сегодня'),
  tomorrow: (now) => formatDay(addDays(today(now), 1), 'Завтра'),
  week: (now) => formatWeek(today(now)),
  parity: (now) => formatParity(today(now)),
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
 * Текст ответа или null, если отвечать не нужно
 * (в группах бот молчит на посторонние сообщения).
 */
export function replyTo(message, nowMs = Date.now()) {
  const action = actionFor(message.text);
  if (action) return ACTIONS[action](nowMs);
  if (message.chat?.type === 'private') return 'Не понял 🤔 Жми кнопки внизу или /help';
  return null;
}
