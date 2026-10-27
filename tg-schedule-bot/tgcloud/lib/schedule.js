// lib/schedule — даты, чётность недели и тексты ответов.
// Без импортов из 'sdk', поэтому модуль можно тестировать обычным Node,
// а Mini App (webapp/) подключает его прямо в браузере.
//
// Дата везде — объект Date на полночь UTC нужного календарного дня
// (так не мешают часовые пояса: считаем только дни).

import { BELLS, SEMESTER_END, SEMESTER_START, TIMETABLE, UTC_OFFSET_HOURS } from './timetable.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const DAY_NAMES = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
export const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const KEYCAPS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
const SHORT_TYPES = { лекция: 'лек.', практика: 'пр.' };

export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function local(nowMs) {
  return new Date(nowMs + UTC_OFFSET_HOURS * 60 * 60 * 1000);
}

/** Сегодняшняя дата по местному времени университета. */
export function today(nowMs = Date.now()) {
  const now = local(nowMs);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Сколько минут прошло с местной полуночи. */
export function minutesNow(nowMs = Date.now()) {
  const now = local(nowMs);
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

export function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

/** 1 = понедельник … 7 = воскресенье. */
export function weekday(date) {
  return ((date.getUTCDay() + 6) % 7) + 1;
}

export function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function ddmm(date) {
  return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}`;
}

export function mondayOf(date) {
  return addDays(date, 1 - weekday(date));
}

/** Номер учебной недели: неделя с SEMESTER_START — первая. До начала семестра — 0 и меньше. */
export function weekNumber(date) {
  const firstMonday = mondayOf(parseDate(SEMESTER_START));
  return Math.floor((date.getTime() - firstMonday.getTime()) / (7 * DAY_MS)) + 1;
}

export function isOddWeek(date) {
  return Math.abs(weekNumber(date)) % 2 === 1;
}

export function parityWord(date) {
  return isOddWeek(date) ? 'нечётная' : 'чётная';
}

export function inSemester(date) {
  const iso = isoDate(date);
  return iso >= SEMESTER_START && iso <= SEMESTER_END;
}

/** Есть ли в неделе с этой датой хоть один день семестра. */
export function isSemesterWeek(date) {
  const monday = mondayOf(date);
  return isoDate(addDays(monday, 6)) >= SEMESTER_START && isoDate(monday) <= SEMESTER_END;
}

/** 'Физика (подгр. А)' → 'Физика' */
export function baseSubject(subject) {
  return subject.replace(/\s*\(подгр\.[^)]*\)$/, '');
}

// --- Замена аудитории и отмена пары ---
// Аудиторию пары можно поменять: на один день (date = 'ГГГГ-ММ-ДД') или «всегда» (date = '').
// Замена с пустой аудиторией (room = CANCELLED) — пару отменили: её нет в pairsFor, но она есть
// в pairsWithCancelled с cancelled: true — чтобы показать «пары не будет».
// Замена rooms: { slot, date, room, authorName }. slot — какая это пара в расписании:
// '3|2|odd|Физика (подгр. А)' — день недели, номер, неделя ('' — каждая), предмет.

export const pairSlot = (wd, p) => `${wd}|${p.n}|${p.week ?? ''}|${p.subject}`;

/** Пара расписания по slot или null. */
export function pairBySlot(slot) {
  const wd = Number(String(slot).split('|')[0]);
  return (TIMETABLE[wd] ?? []).find((p) => pairSlot(wd, p) === slot) ?? null;
}

/** Замена для пары в этот день: на этот день важнее, чем «всегда». */
export function roomOverride(rooms, slot, iso) {
  return rooms.find((r) => r.slot === slot && r.date === iso) ?? rooms.find((r) => r.slot === slot && r.date === '') ?? null;
}

/** Аудитория-метка «пары не будет». Отменить можно только на один день. */
export const CANCELLED = '';

/**
 * Пары дня (без отменённых). rooms — замены аудиторий из базы: у пары с заменой room — новая аудитория,
 * roomWas — какая была по расписанию, roomBy — кто поменял, roomDay — замена только на этот день.
 * slot у каждой пары — чтобы приложение могло её поменять.
 */
export function pairsFor(date, rooms = []) {
  return pairsWithCancelled(date, rooms).filter((p) => !p.cancelled);
}

/** Пары дня вместе с отменёнными (у них cancelled: true, cancelBy — кто отменил). */
export function pairsWithCancelled(date, rooms = []) {
  if (!inSemester(date)) return [];
  const parity = isOddWeek(date) ? 'odd' : 'even';
  const iso = isoDate(date);
  const wd = weekday(date);
  return (TIMETABLE[wd] ?? [])
    .filter((p) => !p.week || p.week === parity)
    .filter((p) => !p.until || iso <= p.until)
    .sort((a, b) => a.n - b.n)
    .map((p) => {
      const slot = pairSlot(wd, p);
      const o = roomOverride(rooms, slot, iso);
      if (o?.room === CANCELLED) return { ...p, slot, cancelled: true, cancelBy: o.authorName ?? null };
      if (!o || o.room === p.room) return { ...p, slot };
      return { ...p, slot, room: o.room, roomWas: p.room, roomBy: o.authorName ?? null, roomDay: o.date !== '' };
    });
}

// --- Мелочи для текста ---

function pad(n) {
  return String(n).padStart(2, '0');
}

export function hhmm(minutes) {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

function capitalize(text) {
  return text[0].toUpperCase() + text.slice(1);
}

export function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** plural(3, 'пара', 'пары', 'пар') → 'пары'. */
export function plural(n, one, few, many) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

export function duration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h && `${h} ч`, m && `${m} мин`].filter(Boolean).join(' ');
}

/** '14 октября' */
export function dayMonth(date) {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** '12–18 октября' или '28 сентября – 4 октября' */
export function dateRange(from, to) {
  if (from.getUTCMonth() === to.getUTCMonth()) return `${from.getUTCDate()}–${dayMonth(to)}`;
  return `${dayMonth(from)} – ${dayMonth(to)}`;
}

/** Время пары в минутах от полуночи: { start, end } или null, если звонков для неё нет. */
export function bell(n) {
  const match = /^(\d\d):(\d\d)–(\d\d):(\d\d)$/.exec(BELLS[n] ?? '');
  if (!match) return null;
  const [h1, m1, h2, m2] = match.slice(1).map(Number);
  return { start: h1 * 60 + m1, end: h2 * 60 + m2 };
}

function placeIcon(room) {
  return /онлайн/i.test(room) ? '💻' : '📍';
}

export function shortType(type) {
  return type.split(', ').map((t) => SHORT_TYPES[t] ?? t).join(', ');
}

// --- Тексты (parse_mode: HTML) ---

export function outOfSemester(date) {
  if (isoDate(date) < SEMESTER_START) {
    return `🏖 Семестр ещё не начался — занятия с ${dayMonth(parseDate(SEMESTER_START))}.`;
  }
  return '🎓 Семестр закончился — расписание пора обновить.';
}

function weekLine(date) {
  return `${weekNumber(date)}-я неделя, ${parityWord(date)}`;
}

function relativeDay(date, nowMs) {
  const diff = Math.round((date.getTime() - today(nowMs).getTime()) / DAY_MS);
  return { [-1]: 'Вчера', 0: 'Сегодня', 1: 'Завтра' }[diff];
}

/**
 * Что происходит в minutes (минуты от полуночи) среди пар дня:
 * { kind: 'now', pair, start, end } — идёт пара;
 * { kind: 'next', pair, start, end, first } — перерыв или пары ещё не начались;
 * { kind: 'done' } — пары закончились; null — у пар нет времени звонков.
 */
export function dayStatus(pairs, minutes) {
  const slots = pairs.map((pair) => ({ pair, ...bell(pair.n) })).filter((s) => s.start !== undefined);
  if (slots.length === 0) return null;

  const current = slots.find((s) => minutes >= s.start && minutes < s.end);
  if (current) return { kind: 'now', ...current };
  const next = slots.find((s) => minutes < s.start);
  if (next) return { kind: 'next', ...next, first: next === slots[0] };
  return { kind: 'done' };
}

function nowLine(status, minutes) {
  if (!status) return null;
  if (status.kind === 'now') {
    return `🟢 Идёт ${status.pair.n}-я пара, до ${hhmm(status.end)} — ещё ${duration(status.end - minutes)}`;
  }
  if (status.kind === 'next') {
    const which = status.first ? 'Первая пара' : 'Следующая пара';
    return `⏳ ${which} в ${hhmm(status.start)} — через ${duration(status.start - minutes)}`;
  }
  return '✅ На сегодня пары закончились';
}

function pairCard(p, isNow, homework = []) {
  const head = [KEYCAPS[p.n] ?? `${p.n}.`, BELLS[p.n] && `<b>${BELLS[p.n]}</b>`, isNow && '← сейчас']
    .filter(Boolean)
    .join(' ');
  const title = `<b>${escapeHtml(p.subject)}</b>` + (p.type ? ` · <i>${escapeHtml(p.type)}</i>` : '');
  const details = [
    p.room && `${placeIcon(p.room)} ${escapeHtml(p.room)}${p.roomWas ? ` <i>(вместо ${escapeHtml(p.roomWas)})</i>` : ''}`,
    p.teacher && `👤 ${escapeHtml(p.teacher)}`,
  ].filter(Boolean);
  const hw = homework.map((n) => `📝 ${escapeHtml(n.text)}${n.authorName ? ` <i>— ${escapeHtml(n.authorName)}</i>` : ''}`);
  return `<blockquote>${[head, title, ...(details.length ? [details.join('   ')] : []), ...hw].join('\n')}</blockquote>`;
}

/** «Окно» между парами: номера пар, которых нет, → время. */
function gapLine(fromN, toN) {
  const from = bell(fromN);
  const to = bell(toN);
  const time = from && to ? ` ${hhmm(from.start)}–${hhmm(to.end)}` : '';
  return `<i>☕ окно${time}</i>`;
}

/** notes — записи из базы; у пар показываются задания к этой дате. */
export function formatDay(date, nowMs = Date.now(), notes = [], rooms = []) {
  const label = relativeDay(date, nowMs);
  const name = `${DAY_NAMES[weekday(date) - 1]}, ${dayMonth(date)}`;
  const header = `📅 <b>${label ? `${label} · ${name}` : capitalize(name)}</b>`;
  if (!inSemester(date)) return `${header}\n\n${outOfSemester(date)}`;

  const pairs = pairsFor(date, rooms);
  const cancelled = pairsWithCancelled(date, rooms).filter((p) => p.cancelled).map(cancelledLine);
  const cancelledBlock = cancelled.length ? `\n\n${cancelled.join('\n')}` : '';
  if (pairs.length === 0) return `${header}\n<i>${weekLine(date)}</i>\n\nПар нет — отдыхаем 🎉${cancelledBlock}`;

  const first = bell(pairs[0].n);
  const last = bell(pairs[pairs.length - 1].n);
  const span = first && last ? ` с ${hhmm(first.start)} до ${hhmm(last.end)}` : '';
  const intro = [header, `<i>${weekLine(date)} · ${pairs.length} ${plural(pairs.length, 'пара', 'пары', 'пар')}${span}</i>`];

  const minutes = minutesNow(nowMs);
  const status = label === 'Сегодня' ? dayStatus(pairs, minutes) : null;
  const line = nowLine(status, minutes);
  if (line) intro.push('', line);

  const body = [];
  pairs.forEach((p, i) => {
    const prev = pairs[i - 1];
    if (prev && p.n - prev.n > 1) body.push(gapLine(prev.n + 1, p.n - 1));
    const hw = notes.filter((n) => n.due === isoDate(date) && n.subject === baseSubject(p.subject));
    body.push(pairCard(p, status?.kind === 'now' && status.pair === p, hw));
  });

  return `${intro.join('\n')}\n\n${body.join('\n')}${cancelledBlock}`;
}

/** «❌ 5 пара · Русский язык — пары не будет» */
function cancelledLine(p) {
  return `❌ <s>${p.n} пара · ${escapeHtml(p.subject)}</s> — <b>пары не будет</b>${p.cancelBy ? ` <i>(${escapeHtml(p.cancelBy)})</i>` : ''}`;
}

export function formatWeek(date, nowMs = Date.now(), notes = [], rooms = []) {
  const monday = mondayOf(date);
  const sunday = addDays(monday, 6);
  if (!isSemesterWeek(monday)) {
    return `🗓 <b>${dateRange(monday, sunday)}</b>\n\n${outOfSemester(monday)}`;
  }

  const todayMs = today(nowMs).getTime();
  const parts = [`🗓 <b>${weekLine(monday)}</b>\n<i>${dateRange(monday, sunday)}</i>`];
  for (let i = 0; i < 7; i++) {
    const day = addDays(monday, i);
    const pairs = pairsWithCancelled(day, rooms);
    if (pairs.length === 0 && i === 6) continue; // пустое воскресенье не показываем

    const mark = day.getTime() === todayMs ? ' 👈 сегодня' : '';
    const head = `<b>${capitalize(DAY_NAMES[i])}, ${dayMonth(day)}</b>${mark}`;
    if (pairs.length === 0) {
      parts.push(`${head}\n<i>пар нет</i>`);
      continue;
    }
    const lines = pairs.map((p) => {
      const time = bell(p.n);
      if (p.cancelled) return `<s>${time ? hhmm(time.start) : `${p.n}.`} ${escapeHtml(p.subject)}</s> ❌ пары не будет`;
      let line = `${time ? `<b>${hhmm(time.start)}</b>` : `${p.n}.`} ${escapeHtml(p.subject)}`;
      if (p.type) line += ` <i>${escapeHtml(shortType(p.type))}</i>`;
      if (p.room) line += ` · ${placeIcon(p.room)} ${escapeHtml(p.room)}${p.roomWas ? '*' : ''}`;
      if (notes.some((n) => n.due === isoDate(day) && n.subject === baseSubject(p.subject))) line += ' 📝';
      return line;
    });
    parts.push(`${head}\n<blockquote>${lines.join('\n')}</blockquote>`);
  }
  return parts.join('\n\n');
}

export function formatParity(date) {
  if (!inSemester(date)) return outOfSemester(date);

  const monday = mondayOf(date);
  const lines = [
    `🔢 Сейчас <b>${weekNumber(date)}-я неделя — ${parityWord(date)}</b>`,
    `<i>${dateRange(monday, addDays(monday, 6))}</i>`,
  ];
  const next = addDays(monday, 7);
  if (inSemester(next)) {
    lines.push('', `Следующая (${dateRange(next, addDays(next, 6))}) — ${weekNumber(next)}-я, ${parityWord(next)}.`);
  }
  return lines.join('\n');
}

export const MAX_ROOM_LENGTH = 30;

/**
 * Проверка замены аудитории: { slot, date, room } → текст ошибки или null.
 * date — '' («всегда») или день, в который эта пара есть в расписании; room — null = вернуть как было,
 * CANCELLED — пары не будет.
 */
export function validateRoomChange({ slot, date, room }) {
  const pair = pairBySlot(slot);
  if (!pair) return 'Нет такой пары в расписании';
  if (date !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || isoDate(parseDate(date)) !== date) return 'Неверная дата';
    if (!pairsFor(parseDate(date)).some((p) => p.slot === slot)) return 'В этот день такой пары нет';
  }
  if (room === CANCELLED && date === '') return 'Отменить пару можно только на один день';
  if (room !== null && room !== undefined && room !== CANCELLED) {
    const clean = String(room).trim();
    if (!clean) return 'Напиши аудиторию';
    if (clean.length > MAX_ROOM_LENGTH) return `Слишком длинно: больше ${MAX_ROOM_LENGTH} символов`;
  }
  return null;
}
