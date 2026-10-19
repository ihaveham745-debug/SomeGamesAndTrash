// lib/bot — что ответить на сообщение или нажатие кнопки. Без 'sdk', чтобы проверять тестами.
//
// Ответ — { text, reply_markup }: текст в parse_mode HTML и клавиатура к нему.
//
// Класс чата (lib/prefs.js в боте, объект в тестах):
//   prefs.get(chatId) → 'a-se' … 'b-gum' | null;  prefs.set(chatId, cls).
// Задания и заметки (lib/notes.js в боте, массив в тестах):
//   store.range(groups, from, to, viewer) — записи групп с due в этих датах ('ГГГГ-ММ-ДД' включительно);
//   store.upcoming(groups, from, viewer)  — задания групп с due >= from и все их заметки (due = null);
//   store.add(note)                       — сохранить запись (note.cls — группа урока);
//   store.get(id)                         — одна запись (для кнопки «прислать файл»).
// Группы варианта — его класс и профиль (homework.groupsOf).
// viewer — чьи личные записи (private) добавить: id пользователя в личке, null в группе —
// там сообщение видят все, и личное показывать нельзя.

import {
  DAY_SHORT, SCHOOL_DAYS, addDays, dayMonth, ddmm, escapeHtml, formatBells, formatDay, formatWeek, hhmm,
  isClass, isoDate, mondayOf, parseDate, roomText, schoolDay, stepDay, today, weekday,
} from './schedule.js';
import { CLASSES, MINI_APP_URL, PROFILES, TITLE, UTC_OFFSET_HOURS, classLabel, groupLabel } from './school.js';
import {
  REMIND_MODES, canSee, cleanText, fileFromMessage, fileLabel, findSubject, groupOf, groupsOf, lessonOn, nextLessonDate,
  validateNote,
} from './homework.js';

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
  today: 'сегодня',
  tomorrow: 'завтра',
  week: 'неделя',
  bells: 'звонки',
  dz: 'задания',
  class: 'класс',
};

export const KEYBOARD = {
  keyboard: [
    [{ text: BUTTONS.today }, { text: BUTTONS.tomorrow }],
    [{ text: BUTTONS.week }, { text: BUTTONS.bells }],
    [{ text: BUTTONS.dz }, { text: BUTTONS.class }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: 'какие уроки показать?',
};

export const COMMANDS = [
  { command: 'today', description: 'уроки на сегодня' },
  { command: 'tomorrow', description: 'уроки на завтра' },
  { command: 'week', description: 'расписание на неделю' },
  { command: 'bells', description: 'расписание звонков' },
  { command: 'dz', description: 'домашние задания (или /dz мат: текст)' },
  { command: 'note', description: 'заметка к предмету: /note хим: текст' },
  { command: 'my', description: 'личное дз, видно только тебе: /my мат: текст' },
  { command: 'class', description: 'выбрать класс и профиль' },
  { command: 'help', description: 'что умеет бот' },
];

// Профиль бота: DESCRIPTION видно в пустом чате до /start, SHORT_DESCRIPTION — в профиле.
export const DESCRIPTION = [
  `расписание уроков ${TITLE}`,
  '',
  'нажми «старт», а потом синюю кнопку «расписание» слева внизу — там твои уроки.',
  '',
  '• 10а и 10б, профили сэ, тех, ен, гум — выбери свои',
  '• уроки на сегодня и завтра — со временем и кабинетом',
  '• расписание на неделю, звонки и домашние задания',
].join('\n');

export const SHORT_DESCRIPTION = `уроки 10а и 10б: сегодня, завтра, неделя, звонки и дз`;

export { MINI_APP_URL };

// Кнопка слева от поля ввода в личке с ботом — открывает Mini App.
export const MENU_BUTTON = { type: 'web_app', text: 'расписание', web_app: { url: MINI_APP_URL } };

const HELP_TEXT = [
  `<b>привет! я бот расписания ${TITLE}</b>`,
  '',
  'подскажу, какие сегодня уроки, во сколько и в каком кабинете.',
  '',
  '/today — уроки на сегодня',
  '/tomorrow — на завтра',
  '/week — вся неделя',
  '/bells — звонки',
  '/dz — домашние задания и заметки класса',
  '/class — сменить класс',
  '',
  'записать дз к ближайшему уроку: <code>/dz мат: №5–10</code>',
  'заметка к предмету: <code>/note хим: формулы на стр. 12</code>',
  'личное дз (видно только тебе): <code>/my мат: решить ещё №7</code>',
  'фото или файл к дз — пришли его с подписью <code>/dz мат: текст</code>',
  'напоминание о дз — кнопки «напомнить» под записью или колокольчик в приложении',
  '',
  'стрелки ‹ › под расписанием листают дни и недели прямо в сообщении.',
  'а кнопка <b>«расписание»</b> слева от поля ввода открывает приложение.',
  '',
  '<i>время — якутское.</i>',
].join('\n');

// Первое сообщение (/start): главное — показать синюю кнопку «Расписание» (MENU_BUTTON),
// иначе не найдут. Под сообщением — такая же кнопка, открывающая приложение.
const WELCOME_TEXT = [
  '<b>привет!</b>',
  '',
  'нажми синюю кнопку <b>«расписание»</b> слева внизу, рядом с полем для сообщения, —',
  'там все твои уроки. или кнопку под этим сообщением.',
  '',
  'в первый раз выбери свой класс (10а или 10б) и профиль — дальше приложение запомнит.',
  '',
  '<i>можно и прямо в чате: /today — уроки на сегодня, /help — все команды.</i>',
].join('\n');

const WELCOME_GROUP_TEXT = [
  `<b>привет! я бот расписания ${TITLE}</b>`,
  '',
  'удобнее всего — в личке со мной: открой мой профиль, нажми «старт», а потом синюю кнопку <b>«расписание»</b> слева внизу.',
  '',
  'а здесь: /class — выбрать класс, /today — уроки на сегодня, /help — все команды.',
].join('\n');

/** Кнопки web_app работают только в личке, в группе Telegram их не примет. */
function welcome(message) {
  if (message.chat?.type !== 'private') return { text: WELCOME_GROUP_TEXT };
  return {
    text: WELCOME_TEXT,
    reply_markup: { inline_keyboard: [[{ text: 'открыть расписание', web_app: { url: MINI_APP_URL } }]] },
  };
}

// --- Кнопки под сообщением ---
// callback_data: 'c:<вариант>' — выбрать класс и профиль ('c:a-gum');
// 'd:<вариант>:ГГГГ-ММ-ДД' — день, 'w:<вариант>:ГГГГ-ММ-ДД' — неделя.
// Вместо даты может стоять 'today' — день нажатия, а не отправки.

const TODAY = 'today';

function button(text, kind, cls, date) {
  return { text, callback_data: `${kind}:${cls}:${date === TODAY ? TODAY : isoDate(date)}` };
}

function shortDate(date) {
  return `${DAY_SHORT[weekday(date) - 1]} ${ddmm(date)}`;
}

/** Кнопки выбора: строка 10а и строка 10б, в каждой — 4 профиля. */
export function classKeyboard(current = null) {
  const rows = {};
  for (const [id, c] of Object.entries(CLASSES)) {
    (rows[c.gradeKey] ??= []).push({ text: `${id === current ? '• ' : ''}${c.grade} ${c.short}`, callback_data: `c:${id}` });
  }
  return { inline_keyboard: Object.values(rows) };
}

const PROFILE_HELP = Object.values(PROFILES).map((p) => `<b>${p.short}</b> — ${p.name}`).join('\n');

function classPicker(cls, intro = '<b>выбери свой класс и профиль</b>') {
  const now = cls ? `\n\nсейчас: <b>${escapeHtml(classLabel(cls))}</b>` : '';
  return { text: `${intro}\n\n${PROFILE_HELP}${now}`, reply_markup: classKeyboard(cls) };
}

// Кнопки «прислать файл» — 'f:<id записи>': бот отправит файл в этот чат.
const MAX_FILE_BUTTONS = 8;

function fileButtons(notes) {
  return notes.filter((n) => n.fileId).slice(0, MAX_FILE_BUTTONS).map((n) => [{
    text: `${n.fileKind === 'photo' ? 'фото' : 'файл'} — ${n.subject}${n.due ? ` ${ddmm(parseDate(n.due))}` : ''}`.slice(0, 60),
    callback_data: `f:${n.id}`,
  }]);
}

function dayKeyboard(cls, date, nowMs, notes = []) {
  const prev = stepDay(date, false);
  const next = stepDay(date, true);
  const isToday = date.getTime() === today(nowMs).getTime();
  return {
    inline_keyboard: [
      ...fileButtons(notes),
      [button(`‹ ${shortDate(prev)}`, 'd', cls, prev), button(`${shortDate(next)} ›`, 'd', cls, next)],
      [button(isToday ? 'обновить' : 'сегодня', 'd', cls, TODAY), button('вся неделя', 'w', cls, date)],
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
        button('‹', 'w', cls, addDays(monday, -7)),
        button(isCurrent ? 'обновить' : 'эта неделя', 'w', cls, TODAY),
        button('›', 'w', cls, addDays(monday, 7)),
      ],
    ],
  };
}

/** В личке id чата — это id пользователя; у групп id отрицательные. */
const viewerOf = (chatId) => (Number.isInteger(chatId) && chatId > 0 ? chatId : null);

async function dayView(cls, date, nowMs, store, viewer) {
  const notes = await store.range(groupsOf(cls), isoDate(date), isoDate(date), viewer);
  return { text: formatDay(cls, date, nowMs, notes), reply_markup: dayKeyboard(cls, date, nowMs, notes) };
}

async function weekView(cls, date, nowMs, store, viewer) {
  const monday = mondayOf(date);
  const notes = await store.range(groupsOf(cls), isoDate(monday), isoDate(addDays(monday, 6)), viewer);
  return { text: formatWeek(cls, date, nowMs, notes), reply_markup: weekKeyboard(cls, date, nowMs) };
}

// --- Домашние задания и заметки ---

const USAGE = {
  hw: 'записать дз: <code>/dz предмет: что задали</code>\nнапример: <code>/dz мат: №5–10, стр. 42</code>',
  note: 'заметка: <code>/note предмет: текст</code>\nнапример: <code>/note хим: формулы на стр. 12</code>',
  my: 'личное дз (видно только тебе): <code>/my предмет: текст</code>\nнапример: <code>/my мат: решить ещё №7</code>',
};

function authorName(user) {
  if (!user) return null;
  return [user.first_name, user.last_name && `${user.last_name[0]}.`].filter(Boolean).join(' ') || user.username || null;
}

function noteLine(n) {
  const body = [n.text && escapeHtml(n.text), n.fileId && `<i>[${escapeHtml(fileLabel(n))}]</i>`].filter(Boolean).join(' ');
  if (n.private) return `${body} <i>— только ты</i>`;
  const author = n.authorName ? ` <i>— ${escapeHtml(n.authorName)}</i>` : '';
  return `${body}${author}`;
}

/** Кто увидит запись: 'только ты', 'весь 10а', 'вся группа гум (из 10а и 10б)'. */
function audience(group, isPrivate) {
  if (isPrivate) return 'видишь только ты.';
  if (group === 'a' || group === 'b') return `видит весь ${groupLabel(group)}.`;
  return `видит вся группа «${groupLabel(group)}» — из 10а и 10б.`;
}

/** Список: задания с сегодняшнего дня по датам, потом заметки по предметам. */
async function homeworkList(cls, nowMs, store, viewer) {
  const all = await store.upcoming(groupsOf(cls), isoDate(today(nowMs)), viewer);
  const tasks = all.filter((n) => n.due).sort((a, b) => a.due.localeCompare(b.due) || a.id - b.id);
  const notes = all.filter((n) => !n.due).sort((a, b) => a.subject.localeCompare(b.subject, 'ru') || a.id - b.id);

  const parts = [`<b>домашние задания</b> · ${escapeHtml(classLabel(cls))}`];
  if (tasks.length === 0) parts.push('<i>пока ничего не задано</i>');
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
    parts.push('\n<b>заметки</b>');
    for (const n of notes) parts.push(`• <b>${escapeHtml(n.subject)}</b>: ${noteLine(n)}`);
  }
  // Telegram не принимает сообщения длиннее 4096 символов: обрезаем по целым строкам.
  const tail = ['', USAGE.hw];
  const kept = [];
  let length = tail.join('\n').length + 80;
  for (const line of parts) {
    if (length + line.length + 1 > 4000) {
      kept.push('…', '<i>всё целиком — в приложении «расписание».</i>');
      break;
    }
    kept.push(line);
    length += line.length + 1;
  }
  const files = fileButtons([...tasks, ...notes]);
  return { text: [...kept, ...tail].join('\n'), ...(files.length && { reply_markup: { inline_keyboard: files } }) };
}

/**
 * /dz, /note и /my: без текста — список (или подсказка), с «предмет: текст» — новая запись.
 * kind: 'hw' — ДЗ для всех, 'my' — личное ДЗ, 'note' — заметка к предмету.
 */
async function homeworkCommand(kind, cls, args, message, nowMs, store) {
  const viewer = viewerOf(message.chat?.id);
  if (kind === 'my' && !viewer) return { text: 'личные записи — только в личке со мной.' };
  if (!args) return kind === 'hw' ? homeworkList(cls, nowMs, store, viewer) : { text: USAGE[kind] };

  const sep = args.indexOf(':');
  if (sep < 0) return { text: `не хватает двоеточия после предмета.\n\n${USAGE[kind]}` };
  const query = args.slice(0, sep).trim();
  const found = findSubject(cls, query);
  if (!found.subject) {
    const list = found.candidates.map((s) => `• ${escapeHtml(s)}`).join('\n');
    return { text: `не понял, какой предмет: «${escapeHtml(query)}». есть такие:\n${list}\n\n${USAGE[kind]}` };
  }

  const text = cleanText(args.slice(sep + 1));
  const file = fileFromMessage(message);
  let due = null;
  if (kind !== 'note') {
    const date = nextLessonDate(cls, found.subject, nowMs);
    if (!date) return { text: `ближайших уроков по предмету «${escapeHtml(found.subject)}» в расписании нет.` };
    due = isoDate(date);
  }
  const error = validateNote({ cls, subject: found.subject, due, text, fileId: file?.fileId });
  if (error) return { text: `${error === 'пустой текст' ? 'а что задали? текст после двоеточия пустой.' : escapeHtml(error)}\n\n${USAGE[kind]}` };

  const group = groupOf(cls, found.subject);
  const isPrivate = kind === 'my';
  let saved;
  try {
    saved = await store.add({
      cls: group, subject: found.subject, due, text, private: isPrivate,
      authorId: message.from?.id ?? 0, authorName: authorName(message.from), ...file,
    });
  } catch (err) {
    console.error('store.add failed', err);
    return { text: 'не получилось сохранить, попробуй ещё раз чуть позже.' };
  }
  const who = file ? `${audience(group, isPrivate)}\n${fileLabel(file)} прикреплено.` : audience(group, isPrivate);
  if (kind === 'note') return { text: `заметка по предмету <b>${escapeHtml(found.subject)}</b> сохранена.\n${who}\nвсе записи — /dz` };
  const date = parseDate(due);
  return {
    text: `записал ${isPrivate ? 'личное ' : ''}дз по предмету <b>${escapeHtml(found.subject)}</b> к уроку ${DAY_SHORT[weekday(date) - 1]}, ${dayMonth(date)}.\n${who}\nвсе задания — /dz`,
    reply_markup: {
      inline_keyboard: [
        [button(`${shortDate(date)}`, 'd', cls, date)],
        // напоминания — только в личке: бот пишет человеку сам
        ...(viewer && saved?.id ? [remindButtons(saved.id)] : []),
      ],
    },
  };
}

// (ctx) → ответ; ctx = { now, store, message, args, cls }. needsClass — без выбранного класса не работает.
const ACTIONS = {
  start: async ({ message }) => welcome(message),
  help: async () => ({ text: HELP_TEXT, reply_markup: KEYBOARD }),
  class: async ({ cls }) => classPicker(cls),
  bells: async () => ({ text: formatBells() }),
  today: ({ cls, now, store, message }) => dayView(cls, today(now), now, store, viewerOf(message.chat?.id)),
  tomorrow: ({ cls, now, store, message }) => dayView(cls, addDays(today(now), 1), now, store, viewerOf(message.chat?.id)),
  week: ({ cls, now, store, message }) => weekView(cls, schoolDay(today(now)), now, store, viewerOf(message.chat?.id)),
  dz: ({ cls, now, store, message, args }) => homeworkCommand('hw', cls, args, message, now, store),
  note: ({ cls, now, store, message, args }) => homeworkCommand('note', cls, args, message, now, store),
  my: ({ cls, now, store, message, args }) => homeworkCommand('my', cls, args, message, now, store),
};
const NEEDS_CLASS = new Set(['today', 'tomorrow', 'week', 'dz', 'note', 'my']);

const COMMAND = /^\/([a-z_]+)(?:@(\w+))?(?:\s|$)/i;

/** Какое действие просят: '/today', '/today@bot_name' или текст кнопки. */
export function actionFor(text) {
  if (!text) return null;
  // У кого-то ещё старая клавиатура — «📅 Сегодня»: сравниваем без эмодзи и регистра.
  const plain = text.replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '').trim().toLowerCase();
  for (const [action, label] of Object.entries(BUTTONS)) {
    if (plain === label) return action;
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
  // У фото и файлов текст — в подписи (caption): «/dz мат: решить №5» под фото.
  const text = message.text ?? message.caption;
  const action = actionFor(text);
  const file = fileFromMessage(message);
  if (file && !['dz', 'my', 'note'].includes(action)) {
    if (message.chat?.type !== 'private') return null;
    return { text: FILE_HINT };
  }
  if (!action) {
    if (message.chat?.type === 'private') return { text: 'не понял, жми кнопки внизу или /help', reply_markup: KEYBOARD };
    return null;
  }
  const saved = await prefs.get(message.chat?.id);
  const cls = isClass(saved) ? saved : null;
  if (!cls && NEEDS_CLASS.has(action)) return classPicker(null, 'сначала выбери свой класс и профиль:');
  const args = commandArgs(text);
  if (file && !args) return { text: FILE_HINT };
  return ACTIONS[action]({ now: nowMs, store, message, args, cls });
}

// --- Напоминания ---
// Кнопки 'r:<id записи>:<mode>' — включить напоминание; 'r:<id>:off' — выключить.

function remindButtons(noteId) {
  return [
    { text: 'напомнить вечером', callback_data: `r:${noteId}:evening` },
    { text: 'утром', callback_data: `r:${noteId}:morning` },
    { text: 'перед уроком', callback_data: `r:${noteId}:before` },
  ];
}

/** '21.10 в 19:00' — когда придёт напоминание (время местное). */
function whenText(at) {
  const local = new Date((at + UTC_OFFSET_HOURS * 3600) * 1000);
  const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  return `${ddmm(day)} в ${hhmm(local.getUTCHours() * 60 + local.getUTCMinutes())}`;
}

/** Текст напоминания: что задано, к какому уроку, во сколько и где. */
export function reminderMessage(cls, note, mode, nowMs = Date.now()) {
  const due = parseDate(note.due);
  const diff = Math.round((due.getTime() - today(nowMs).getTime()) / 86400000);
  const whenDay = { 0: 'сегодня', 1: 'завтра' }[diff] ?? `${DAY_SHORT[weekday(due) - 1]}, ${dayMonth(due)}`;
  const lesson = lessonOn(cls, note.due, note.subject);
  const where = lesson
    ? `${lesson.n} урок${lesson.start !== null ? `, ${hhmm(lesson.start)}` : ''}${lesson.room ? `, ${roomText(lesson.room)}` : ''}`
    : '';
  const lines = [
    `<b>напоминание о дз</b> — ${whenDay}`,
    '',
    `<b>${escapeHtml(note.subject)}</b>${where ? ` · ${escapeHtml(where)}` : ''}`,
    noteLine(note),
  ];
  const keyboard = [];
  if (note.fileId) keyboard.push([{ text: `${note.fileKind === 'photo' ? 'фото' : 'файл'} к дз`, callback_data: `f:${note.id}` }]);
  keyboard.push([{ text: 'открыть расписание', web_app: { url: MINI_APP_URL } }]);
  return { text: lines.join('\n'), reply_markup: { inline_keyboard: keyboard } };
}

const FILE_HINT = [
  'чтобы прикрепить фото или файл к дз, подпиши его командой:',
  '<code>/dz мат: решить №5</code> — увидят все, кому задано',
  '<code>/my мат: мой конспект</code> — только тебе',
  '',
  'текст после двоеточия можно не писать: <code>/dz мат:</code>',
].join('\n');

/**
 * Что показать по нажатию кнопки под сообщением; null — непонятная кнопка.
 * { view, chosen } — chosen: выбран класс (тогда к ответу стоит прислать клавиатуру).
 * { send: note } — прислать в чат файл записи; { denied } — файл недоступен.
 */
export async function viewFor(data, chatId, nowMs = Date.now(), store = NO_STORE, prefs = memoryPrefs(), remind = null) {
  const remindReq = /^r:(\d+):(evening|morning|before|off)$/.exec(data ?? '');
  if (remindReq) {
    const viewer = viewerOf(chatId);
    const note = await store.get?.(Number(remindReq[1]));
    const cls = await prefs.get(chatId);
    if (!viewer || !remind || !isClass(cls) || !canSee(note, groupsOf(cls), viewer)) return { notice: 'напоминание недоступно' };
    const mode = remindReq[2] === 'off' ? null : remindReq[2];
    try {
      const res = await remind.set(viewer, cls, note, mode, nowMs);
      return { notice: res.mode ? `напомню ${REMIND_MODES[res.mode]}: ${whenText(res.at)}` : 'напоминание выключено' };
    } catch (err) {
      if (err.message === 'PAST') return { notice: 'это время уже прошло — выбери другое' };
      if (err.message === 'NO_LESSON') return { notice: 'не нашёл этот урок в расписании' };
      throw err;
    }
  }
  const fileReq = /^f:(\d+)$/.exec(data ?? '');
  if (fileReq) {
    const note = await store.get?.(Number(fileReq[1]));
    const cls = await prefs.get(chatId);
    if (!note?.fileId || !canSee(note, groupsOf(isClass(cls) ? cls : null), viewerOf(chatId))) return { denied: true };
    return { send: note };
  }
  const pick = /^c:([a-z]+-[a-z]+)$/.exec(data ?? '');
  if (pick) {
    if (!isClass(pick[1])) return null;
    await prefs.set(chatId, pick[1]);
    const view = await dayView(pick[1], schoolDay(today(nowMs)), nowMs, store, viewerOf(chatId));
    return { view, chosen: pick[1] };
  }
  const match = /^([dw]):([a-z]+-[a-z]+):(today|\d{4}-\d{2}-\d{2})$/.exec(data ?? '');
  if (!match || !isClass(match[2])) return null;
  const date = match[3] === TODAY ? today(nowMs) : parseDate(match[3]);
  if (match[3] !== TODAY && isoDate(date) !== match[3]) return null; // 2026-02-31 и подобное
  const cls = match[2];
  const viewer = viewerOf(chatId);
  return { view: match[1] === 'd' ? await dayView(cls, date, nowMs, store, viewer) : await weekView(cls, date, nowMs, store, viewer) };
}

/** Сообщение после выбора класса — с обычной клавиатурой внизу. */
export function chosenText(cls) {
  return `<b>${escapeHtml(classLabel(cls))}</b>: ${escapeHtml(CLASSES[cls].grade)}, ${escapeHtml(CLASSES[cls].profile)} профиль.\nсменить — /class. что умею — /help`;
}
