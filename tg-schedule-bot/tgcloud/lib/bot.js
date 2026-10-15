// lib/bot — что ответить на сообщение или нажатие кнопки. Без 'sdk', чтобы проверять тестами.
//
// Ответ — { text, reply_markup }: текст в parse_mode HTML и клавиатура к нему.
//
// Задания и заметки бот берёт из store (в боте — база, lib/notes.js; в тестах — массив):
//   store.range(from, to) — записи с due в этих датах ('ГГГГ-ММ-ДД' включительно);
//   store.upcoming(from)  — задания с due >= from и все заметки (due = null);
//   store.add(note)       — сохранить запись;
//   store.stats()         — { users: [...], tasks, notes } для /stats (lib/stats.js).

import {
  DAY_SHORT, addDays, dayMonth, ddmm, escapeHtml, formatDay, formatParity, formatWeek, hhmm,
  isSemesterWeek, isoDate, minutesNow, mondayOf, parseDate, plural, today, weekNumber, weekday,
} from './schedule.js';
import { GROUP, MINI_APP_URL } from './timetable.js';
import { cleanText, findSubject, nextPairDate, validateNote } from './homework.js';

export const NO_STORE = {
  range: async () => [],
  upcoming: async () => [],
  add: async () => {
    throw new Error('store is not available');
  },
  stats: async () => null,
};

// Тексты кнопок не меняй: по ним узнаём нажатия, а у людей уже стоит эта клавиатура.
export const BUTTONS = {
  today: '📅 Сегодня',
  tomorrow: '➡️ Завтра',
  week: '🗓 Неделя',
  parity: '🔢 Чётность',
  dz: '📝 Задания',
};

export const KEYBOARD = {
  keyboard: [
    [{ text: BUTTONS.today }, { text: BUTTONS.tomorrow }],
    [{ text: BUTTONS.week }, { text: BUTTONS.parity }],
    [{ text: BUTTONS.dz }],
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
  { command: 'dz', description: '📝 Домашние задания (или /dz мат: текст)' },
  { command: 'note', description: '🗒 Заметка к предмету: /note хим: текст' },
  { command: 'stats', description: '📊 Кто пользуется ботом' },
  { command: 'help', description: '💬 Что умеет бот' },
];

// Профиль бота: DESCRIPTION видно в пустом чате до /start, SHORT_DESCRIPTION — в профиле.
export const DESCRIPTION = [
  `📚 Расписание группы ${GROUP}`,
  '',
  '• пары на сегодня и завтра — со временем, аудиторией и преподавателем',
  '• расписание на всю неделю',
  '• чётная сейчас неделя или нечётная',
].join('\n');

export const SHORT_DESCRIPTION = `📅 Пары группы ${GROUP}: сегодня, завтра, на неделю и чётность недели`;

// Адрес Mini App (папка webapp/) — в файле группы, lib/groups/*.js.
export { MINI_APP_URL };

// Кнопка слева от поля ввода в личке с ботом — открывает Mini App.
export const MENU_BUTTON = { type: 'web_app', text: 'Расписание', web_app: { url: MINI_APP_URL } };

const HELP_TEXT = [
  `👋 <b>Привет! Я бот расписания группы ${GROUP}</b>`,
  '',
  'Подскажу, какие сегодня пары, где они проходят и какая сейчас неделя.',
  '',
  '📅 /today — пары на сегодня',
  '➡️ /tomorrow — на завтра',
  '🗓 /week — вся неделя',
  '🔢 /parity — чётная или нечётная',
  '📝 /dz — домашние задания и заметки группы',
  '',
  'Записать ДЗ к ближайшей паре: <code>/dz мат: №5–10</code>',
  'Заметка к предмету: <code>/note хим: формулы на стр. 12</code>',
  '',
  '📊 /stats — сколько человек пользуется ботом',
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

async function dayView(date, nowMs, store) {
  const notes = await store.range(isoDate(date), isoDate(date));
  return { text: formatDay(date, nowMs, notes), reply_markup: dayKeyboard(date, nowMs) };
}

async function weekView(date, nowMs, store) {
  const monday = mondayOf(date);
  const notes = await store.range(isoDate(monday), isoDate(addDays(monday, 6)));
  return { text: formatWeek(date, nowMs, notes), reply_markup: weekKeyboard(date, nowMs) };
}

// --- Домашние задания и заметки ---

const USAGE = {
  hw: 'Записать ДЗ: <code>/dz предмет: что задали</code>\nНапример: <code>/dz мат: №5–10, стр. 42</code>',
  note: 'Заметка: <code>/note предмет: текст</code>\nНапример: <code>/note хим: формулы на стр. 12</code>',
};

/** Как подписать человека: «Аня П.», иначе @username. */
export function authorName(user) {
  if (!user) return null;
  return [user.first_name, user.last_name && `${user.last_name[0]}.`].filter(Boolean).join(' ') || user.username || null;
}

function noteLine(n) {
  const author = n.authorName ? ` <i>— ${escapeHtml(n.authorName)}</i>` : '';
  return `${escapeHtml(n.text)}${author}`;
}

/** Список: задания с сегодняшнего дня по датам, потом заметки по предметам. */
async function homeworkList(nowMs, store) {
  const all = await store.upcoming(isoDate(today(nowMs)));
  const tasks = all.filter((n) => n.due).sort((a, b) => a.due.localeCompare(b.due) || a.id - b.id);
  const notes = all.filter((n) => !n.due).sort((a, b) => a.subject.localeCompare(b.subject, 'ru') || a.id - b.id);

  const parts = ['📝 <b>Домашние задания</b>'];
  if (tasks.length === 0) parts.push('<i>Пока ничего не задано 🎉</i>');
  let lastDue = null;
  for (const n of tasks) {
    if (n.due !== lastDue) {
      const d = parseDate(n.due);
      parts.push(`\n<b>${DAY_SHORT[weekday(d) - 1]}, ${dayMonth(d)}</b>`);
      lastDue = n.due;
    }
    parts.push(`• <b>${escapeHtml(n.subject)}</b>: ${noteLine(n)}`);
  }
  if (notes.length) {
    parts.push('\n🗒 <b>Заметки</b>');
    for (const n of notes) parts.push(`• <b>${escapeHtml(n.subject)}</b>: ${noteLine(n)}`);
  }
  // Telegram не принимает сообщения длиннее 4096 символов: обрезаем по целым строкам,
  // чтобы не разорвать HTML-тег.
  const tail = ['', USAGE.hw];
  const kept = [];
  let length = tail.join('\n').length + 80;
  for (const line of parts) {
    if (length + line.length + 1 > 4000) {
      kept.push('…', '<i>Всё целиком — в приложении «Расписание».</i>');
      break;
    }
    kept.push(line);
    length += line.length + 1;
  }
  return { text: [...kept, ...tail].join('\n') };
}

/** /dz и /note: без текста — список (или подсказка), с «предмет: текст» — новая запись. */
async function homeworkCommand(kind, args, message, nowMs, store) {
  if (!args) return kind === 'hw' ? homeworkList(nowMs, store) : { text: USAGE.note };

  const sep = args.indexOf(':');
  if (sep < 0) return { text: `🤔 Не хватает двоеточия после предмета.\n\n${USAGE[kind]}` };
  const query = args.slice(0, sep).trim();
  const found = findSubject(query);
  if (!found.subject) {
    const list = found.candidates.map((s) => `• ${escapeHtml(s)}`).join('\n');
    return { text: `🤔 Не понял, какой предмет: «${escapeHtml(query)}». Есть такие:\n${list}\n\n${USAGE[kind]}` };
  }

  const text = cleanText(args.slice(sep + 1));
  let due = null;
  if (kind === 'hw') {
    const date = nextPairDate(found.subject, nowMs);
    if (!date) return { text: `🤔 Ближайших пар по предмету «${escapeHtml(found.subject)}» в расписании нет.` };
    due = isoDate(date);
  }
  const error = validateNote({ subject: found.subject, due, text });
  if (error) return { text: `🤔 ${error === 'Пустой текст' ? 'А что задали? Текст после двоеточия пустой.' : escapeHtml(error)}\n\n${USAGE[kind]}` };

  try {
    await store.add({ subject: found.subject, due, text, authorId: message.from?.id ?? 0, authorName: authorName(message.from) });
  } catch (err) {
    console.error('store.add failed', err);
    return { text: '😕 Не получилось сохранить, попробуй ещё раз чуть позже.' };
  }
  if (kind === 'note') return { text: `✅ Заметка по предмету <b>${escapeHtml(found.subject)}</b> сохранена.\nВсе записи — /dz` };
  const date = parseDate(due);
  return {
    text: `✅ Записал ДЗ по предмету <b>${escapeHtml(found.subject)}</b> к паре ${DAY_SHORT[weekday(date) - 1]}, ${dayMonth(date)}.\nВсе задания — /dz`,
    reply_markup: { inline_keyboard: [[button(`📅 ${shortDate(date)}`, 'd', date)]] },
  };
}

// --- Статистика ---

const STATS_LIST_LIMIT = 30;

/** «сегодня 10:15», «вчера 18:40», «3 дня назад», «12 окт.» */
function seenAgo(seenMs, nowMs) {
  const day = today(seenMs);
  const days = Math.round((today(nowMs) - day) / 86400000);
  const time = hhmm(minutesNow(seenMs));
  if (days <= 0) return `сегодня ${time}`;
  if (days === 1) return `вчера ${time}`;
  if (days < 7) return `${days} ${plural(days, 'день', 'дня', 'дней')} назад`;
  return dayMonth(day);
}

async function statsView(nowMs, store) {
  let data;
  try {
    data = await store.stats();
  } catch (err) {
    console.error('store.stats failed', err);
  }
  if (!data) return { text: '😕 Статистика сейчас недоступна, попробуй чуть позже.' };

  const users = data.users;
  const todayMs = today(nowMs).getTime();
  const weekAgo = nowMs / 1000 - 7 * 86400;
  const count = (pred) => users.filter(pred).length;
  const activeToday = count((u) => today(u.lastSeen * 1000).getTime() === todayMs);
  const activeWeek = count((u) => u.lastSeen >= weekAgo);
  const newWeek = count((u) => u.firstSeen >= weekAgo);
  const appUsers = count((u) => u.appOpens > 0);
  const n = users.length;

  const lines = [
    `📊 <b>Статистика бота ${GROUP}</b>`,
    '',
    `👥 Всего: <b>${n}</b> ${plural(n, 'человек', 'человека', 'человек')}`,
    `🟢 Сегодня: <b>${activeToday}</b> · за неделю: <b>${activeWeek}</b>`,
    `🆕 Новых за неделю: <b>${newWeek}</b>`,
    `📱 Открывали приложение: <b>${appUsers}</b>`,
    `📝 Заданий записано: <b>${data.tasks}</b> · 🗒 заметок: <b>${data.notes}</b>`,
  ];
  if (n) {
    lines.push('', '<b>Кто заходил</b>');
    for (const u of users.slice(0, STATS_LIST_LIMIT)) {
      const name = escapeHtml(u.name || (u.username ? `@${u.username}` : 'Без имени'));
      const app = u.appOpens > 0 ? ' 📱' : '';
      lines.push(`• ${name}${app} — ${seenAgo(u.lastSeen * 1000, nowMs)}`);
    }
    if (n > STATS_LIST_LIMIT) lines.push(`…и ещё ${n - STATS_LIST_LIMIT}`);
  }
  return { text: lines.join('\n') };
}

function parityView(nowMs) {
  return {
    text: formatParity(today(nowMs)),
    reply_markup: { inline_keyboard: [[button('🗓 Расписание на неделю', 'w', TODAY)]] },
  };
}

const help = async () => ({ text: HELP_TEXT, reply_markup: KEYBOARD });

// (now, store, message, args) → ответ
const ACTIONS = {
  start: help,
  help,
  today: (now, store) => dayView(today(now), now, store),
  tomorrow: (now, store) => dayView(addDays(today(now), 1), now, store),
  week: (now, store) => weekView(today(now), now, store),
  parity: async (now) => parityView(now),
  dz: (now, store, message, args) => homeworkCommand('hw', args, message, now, store),
  note: (now, store, message, args) => homeworkCommand('note', args, message, now, store),
  stats: (now, store) => statsView(now, store),
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

/** Текст после команды: '/dz@bot мат: №5' → 'мат: №5'. */
function commandArgs(text) {
  const trimmed = text?.trim() ?? '';
  return COMMAND.test(trimmed) ? trimmed.replace(COMMAND, '').trim() : '';
}

/**
 * Ответ на сообщение или null, если отвечать не нужно
 * (в группах бот молчит на посторонние сообщения).
 */
export async function replyTo(message, nowMs = Date.now(), store = NO_STORE) {
  const action = actionFor(message.text);
  if (action) return ACTIONS[action](nowMs, store, message, commandArgs(message.text));
  if (message.chat?.type === 'private') {
    return { text: 'Не понял 🤔 Жми кнопки внизу или /help', reply_markup: KEYBOARD };
  }
  return null;
}

/** Что показать по нажатию кнопки под сообщением; null — непонятная кнопка. */
export async function viewFor(data, nowMs = Date.now(), store = NO_STORE) {
  const match = /^([dw]):(today|\d{4}-\d{2}-\d{2})$/.exec(data ?? '');
  if (!match) return null;
  const date = match[2] === TODAY ? today(nowMs) : parseDate(match[2]);
  if (match[2] !== TODAY && isoDate(date) !== match[2]) return null; // 2026-02-31 и подобное
  return match[1] === 'd' ? dayView(date, nowMs, store) : weekView(date, nowMs, store);
}
