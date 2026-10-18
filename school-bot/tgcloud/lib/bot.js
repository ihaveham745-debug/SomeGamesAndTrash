// lib/bot — что ответить на сообщение или нажатие кнопки. Без 'sdk', чтобы проверять тестами.
//
// Ответ — { text, reply_markup }: текст в parse_mode HTML и клавиатура к нему.
//
// Класс чата (lib/prefs.js в боте, объект в тестах):
//   prefs.get(chatId) → 'se' | 'tech' | 'en' | 'gum' | null;  prefs.set(chatId, cls).
// Задания и заметки (lib/notes.js в боте, массив в тестах):
//   store.range(cls, from, to) — записи класса с due в этих датах ('ГГГГ-ММ-ДД' включительно);
//   store.upcoming(cls, from)  — задания класса с due >= from и все его заметки (due = null);
//   store.add(note)            — сохранить запись.

import {
  DAY_SHORT, SCHOOL_DAYS, addDays, dayMonth, ddmm, escapeHtml, formatBells, formatDay, formatWeek,
  isClass, isoDate, mondayOf, parseDate, schoolDay, stepDay, today, weekday,
} from './schedule.js';
import { CLASSES, MINI_APP_URL, TITLE, classLabel } from './school.js';
import { cleanText, findSubject, nextLessonDate, validateNote } from './homework.js';

export const NO_STORE = {
  range: async () => [],
  upcoming: async () => [],
  add: async () => {
    throw new Error('store is not available');
  },
};

export function memoryPrefs() {
  const map = new Map();
  return { get: async (id) => map.get(id) ?? null, set: async (id, cls) => void map.set(id, cls) };
}

// Тексты кнопок не меняй: по ним узнаём нажатия, а у людей уже стоит эта клавиатура.
export const BUTTONS = {
  today: '📅 Сегодня',
  tomorrow: '➡️ Завтра',
  week: '🗓 Неделя',
  bells: '🔔 Звонки',
  dz: '📝 Задания',
  class: '🏫 Класс',
};

export const KEYBOARD = {
  keyboard: [
    [{ text: BUTTONS.today }, { text: BUTTONS.tomorrow }],
    [{ text: BUTTONS.week }, { text: BUTTONS.bells }],
    [{ text: BUTTONS.dz }, { text: BUTTONS.class }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: 'Какие уроки показать?',
};

export const COMMANDS = [
  { command: 'today', description: '📅 Уроки на сегодня' },
  { command: 'tomorrow', description: '➡️ Уроки на завтра' },
  { command: 'week', description: '🗓 Расписание на неделю' },
  { command: 'bells', description: '🔔 Расписание звонков' },
  { command: 'dz', description: '📝 Домашние задания (или /dz мат: текст)' },
  { command: 'note', description: '🗒 Заметка к предмету: /note хим: текст' },
  { command: 'class', description: '🏫 Выбрать класс и профиль' },
  { command: 'help', description: '💬 Что умеет бот' },
];

// Профиль бота: DESCRIPTION видно в пустом чате до /start, SHORT_DESCRIPTION — в профиле.
export const DESCRIPTION = [
  `📚 Расписание уроков: ${TITLE}`,
  '',
  `• ${Object.keys(CLASSES).map(classLabel).join(', ')} — выбери свой профиль`,
  '• уроки на сегодня и завтра — со временем и кабинетом',
  '• расписание на неделю и звонки',
  '• домашние задания класса',
].join('\n');

export const SHORT_DESCRIPTION = `📅 Уроки 10а и 10б: сегодня, завтра, неделя, звонки и ДЗ`;

export { MINI_APP_URL };

// Кнопка слева от поля ввода в личке с ботом — открывает Mini App.
export const MENU_BUTTON = { type: 'web_app', text: 'Расписание', web_app: { url: MINI_APP_URL } };

const HELP_TEXT = [
  `👋 <b>Привет! Я бот расписания ${TITLE}</b>`,
  '',
  'Подскажу, какие сегодня уроки, во сколько и в каком кабинете.',
  '',
  '📅 /today — уроки на сегодня',
  '➡️ /tomorrow — на завтра',
  '🗓 /week — вся неделя',
  '🔔 /bells — звонки',
  '📝 /dz — домашние задания и заметки класса',
  '🏫 /class — сменить класс',
  '',
  'Записать ДЗ к ближайшему уроку: <code>/dz мат: №5–10</code>',
  'Заметка к предмету: <code>/note хим: формулы на стр. 12</code>',
  '',
  'Стрелки ◀️ ▶️ под расписанием листают дни и недели прямо в сообщении.',
  'А кнопка <b>«Расписание»</b> слева от поля ввода открывает приложение.',
  '',
  '<i>Время — якутское.</i>',
].join('\n');

// --- Кнопки под сообщением ---
// callback_data: 'c:<класс>' — выбрать класс; 'd:<класс>:ГГГГ-ММ-ДД' — день, 'w:<класс>:ГГГГ-ММ-ДД' — неделя.
// Вместо даты может стоять 'today' — день нажатия, а не отправки.

const TODAY = 'today';

function button(text, kind, cls, date) {
  return { text, callback_data: `${kind}:${cls}:${date === TODAY ? TODAY : isoDate(date)}` };
}

function shortDate(date) {
  return `${DAY_SHORT[weekday(date) - 1]} ${ddmm(date)}`;
}

/** Кнопки выбора класса: по строке на класс. */
export function classKeyboard(current = null) {
  return {
    inline_keyboard: Object.entries(CLASSES).map(([id, c]) => [{
      text: `${id === current ? '✅ ' : ''}${c.grade} · ${c.profile}`,
      callback_data: `c:${id}`,
    }]),
  };
}

function classPicker(cls, intro = '🏫 <b>Выбери свой класс и профиль</b>') {
  const now = cls ? `\n\nСейчас: <b>${escapeHtml(classLabel(cls))}</b>` : '';
  return { text: `${intro}${now}`, reply_markup: classKeyboard(cls) };
}

function dayKeyboard(cls, date, nowMs) {
  const prev = stepDay(date, false);
  const next = stepDay(date, true);
  const isToday = date.getTime() === today(nowMs).getTime();
  return {
    inline_keyboard: [
      [button(`◀️ ${shortDate(prev)}`, 'd', cls, prev), button(`${shortDate(next)} ▶️`, 'd', cls, next)],
      [button(isToday ? '🔄 Обновить' : '📅 Сегодня', 'd', cls, TODAY), button('🗓 Вся неделя', 'w', cls, date)],
    ],
  };
}

function weekKeyboard(cls, date, nowMs) {
  const monday = mondayOf(date);
  const now = today(nowMs);
  const isCurrent = monday.getTime() === mondayOf(now).getTime();

  const days = DAY_SHORT.slice(0, SCHOOL_DAYS).map((name, i) => {
    const day = addDays(monday, i);
    return button(day.getTime() === now.getTime() ? `•${name}•` : name, 'd', cls, day);
  });
  return {
    inline_keyboard: [
      days,
      [
        button('◀️', 'w', cls, addDays(monday, -7)),
        button(isCurrent ? '🔄 Обновить' : '🗓 Эта неделя', 'w', cls, TODAY),
        button('▶️', 'w', cls, addDays(monday, 7)),
      ],
    ],
  };
}

async function dayView(cls, date, nowMs, store) {
  const notes = await store.range(cls, isoDate(date), isoDate(date));
  return { text: formatDay(cls, date, nowMs, notes), reply_markup: dayKeyboard(cls, date, nowMs) };
}

async function weekView(cls, date, nowMs, store) {
  const monday = mondayOf(date);
  const notes = await store.range(cls, isoDate(monday), isoDate(addDays(monday, 6)));
  return { text: formatWeek(cls, date, nowMs, notes), reply_markup: weekKeyboard(cls, date, nowMs) };
}

// --- Домашние задания и заметки ---

const USAGE = {
  hw: 'Записать ДЗ: <code>/dz предмет: что задали</code>\nНапример: <code>/dz мат: №5–10, стр. 42</code>',
  note: 'Заметка: <code>/note предмет: текст</code>\nНапример: <code>/note хим: формулы на стр. 12</code>',
};

function authorName(user) {
  if (!user) return null;
  return [user.first_name, user.last_name && `${user.last_name[0]}.`].filter(Boolean).join(' ') || user.username || null;
}

function noteLine(n) {
  const author = n.authorName ? ` <i>— ${escapeHtml(n.authorName)}</i>` : '';
  return `${escapeHtml(n.text)}${author}`;
}

/** Список: задания с сегодняшнего дня по датам, потом заметки по предметам. */
async function homeworkList(cls, nowMs, store) {
  const all = await store.upcoming(cls, isoDate(today(nowMs)));
  const tasks = all.filter((n) => n.due).sort((a, b) => a.due.localeCompare(b.due) || a.id - b.id);
  const notes = all.filter((n) => !n.due).sort((a, b) => a.subject.localeCompare(b.subject, 'ru') || a.id - b.id);

  const parts = [`📝 <b>Домашние задания</b> · ${escapeHtml(classLabel(cls))}`];
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
  // Telegram не принимает сообщения длиннее 4096 символов: обрезаем по целым строкам.
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
async function homeworkCommand(kind, cls, args, message, nowMs, store) {
  if (!args) return kind === 'hw' ? homeworkList(cls, nowMs, store) : { text: USAGE.note };

  const sep = args.indexOf(':');
  if (sep < 0) return { text: `🤔 Не хватает двоеточия после предмета.\n\n${USAGE[kind]}` };
  const query = args.slice(0, sep).trim();
  const found = findSubject(cls, query);
  if (!found.subject) {
    const list = found.candidates.map((s) => `• ${escapeHtml(s)}`).join('\n');
    return { text: `🤔 Не понял, какой предмет: «${escapeHtml(query)}». Есть такие:\n${list}\n\n${USAGE[kind]}` };
  }

  const text = cleanText(args.slice(sep + 1));
  let due = null;
  if (kind === 'hw') {
    const date = nextLessonDate(cls, found.subject, nowMs);
    if (!date) return { text: `🤔 Ближайших уроков по предмету «${escapeHtml(found.subject)}» в расписании нет.` };
    due = isoDate(date);
  }
  const error = validateNote({ cls, subject: found.subject, due, text });
  if (error) return { text: `🤔 ${error === 'Пустой текст' ? 'А что задали? Текст после двоеточия пустой.' : escapeHtml(error)}\n\n${USAGE[kind]}` };

  try {
    await store.add({ cls, subject: found.subject, due, text, authorId: message.from?.id ?? 0, authorName: authorName(message.from) });
  } catch (err) {
    console.error('store.add failed', err);
    return { text: '😕 Не получилось сохранить, попробуй ещё раз чуть позже.' };
  }
  const who = escapeHtml(classLabel(cls));
  if (kind === 'note') return { text: `✅ Заметка по предмету <b>${escapeHtml(found.subject)}</b> (${who}) сохранена.\nВсе записи — /dz` };
  const date = parseDate(due);
  return {
    text: `✅ Записал ДЗ по предмету <b>${escapeHtml(found.subject)}</b> (${who}) к уроку ${DAY_SHORT[weekday(date) - 1]}, ${dayMonth(date)}.\nВсе задания — /dz`,
    reply_markup: { inline_keyboard: [[button(`📅 ${shortDate(date)}`, 'd', cls, date)]] },
  };
}

// (ctx) → ответ; ctx = { now, store, message, args, cls }. needsClass — без выбранного класса не работает.
const ACTIONS = {
  start: async () => ({ text: HELP_TEXT, reply_markup: KEYBOARD }),
  help: async () => ({ text: HELP_TEXT, reply_markup: KEYBOARD }),
  class: async ({ cls }) => classPicker(cls),
  bells: async () => ({ text: formatBells() }),
  today: ({ cls, now, store }) => dayView(cls, today(now), now, store),
  tomorrow: ({ cls, now, store }) => dayView(cls, addDays(today(now), 1), now, store),
  week: ({ cls, now, store }) => weekView(cls, schoolDay(today(now)), now, store),
  dz: ({ cls, now, store, message, args }) => homeworkCommand('hw', cls, args, message, now, store),
  note: ({ cls, now, store, message, args }) => homeworkCommand('note', cls, args, message, now, store),
};
const NEEDS_CLASS = new Set(['today', 'tomorrow', 'week', 'dz', 'note']);

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
export async function replyTo(message, nowMs = Date.now(), store = NO_STORE, prefs = memoryPrefs()) {
  const action = actionFor(message.text);
  if (!action) {
    if (message.chat?.type === 'private') return { text: 'Не понял 🤔 Жми кнопки внизу или /help', reply_markup: KEYBOARD };
    return null;
  }
  const saved = await prefs.get(message.chat?.id);
  const cls = isClass(saved) ? saved : null;
  if (!cls && (NEEDS_CLASS.has(action) || action === 'start')) {
    const intro = action === 'start'
      ? `👋 <b>Привет! Я бот расписания ${TITLE}</b>\n\nСначала выбери свой класс и профиль — покажу твои уроки.`
      : '🏫 Сначала выбери свой класс и профиль:';
    return classPicker(null, intro);
  }
  return ACTIONS[action]({ now: nowMs, store, message, args: commandArgs(message.text), cls });
}

/**
 * Что показать по нажатию кнопки под сообщением; null — непонятная кнопка.
 * { view, chosen } — chosen: выбран класс (тогда к ответу стоит прислать клавиатуру).
 */
export async function viewFor(data, chatId, nowMs = Date.now(), store = NO_STORE, prefs = memoryPrefs()) {
  const pick = /^c:([a-z]+)$/.exec(data ?? '');
  if (pick) {
    if (!isClass(pick[1])) return null;
    await prefs.set(chatId, pick[1]);
    const view = await dayView(pick[1], schoolDay(today(nowMs)), nowMs, store);
    return { view, chosen: pick[1] };
  }
  const match = /^([dw]):([a-z]+):(today|\d{4}-\d{2}-\d{2})$/.exec(data ?? '');
  if (!match || !isClass(match[2])) return null;
  const date = match[3] === TODAY ? today(nowMs) : parseDate(match[3]);
  if (match[3] !== TODAY && isoDate(date) !== match[3]) return null; // 2026-02-31 и подобное
  const cls = match[2];
  return { view: match[1] === 'd' ? await dayView(cls, date, nowMs, store) : await weekView(cls, date, nowMs, store) };
}

/** Сообщение после выбора класса — с обычной клавиатурой внизу. */
export function chosenText(cls) {
  return `✅ Класс: <b>${escapeHtml(classLabel(cls))}</b> (${escapeHtml(CLASSES[cls].profile)}).\nСменить — /class. Что умею — /help`;
}
