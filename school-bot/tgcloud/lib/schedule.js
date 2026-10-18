// lib/schedule — даты, уроки класса и тексты ответов.
// Без импортов из 'sdk', поэтому модуль можно тестировать обычным Node,
// а Mini App (webapp/) подключает его прямо в браузере.
//
// Дата везде — объект Date на полночь UTC нужного календарного дня
// (так не мешают часовые пояса: считаем только дни).
// cls — id класса из lib/school.js: 'se', 'tech', 'en', 'gum'.

import { BELLS, CLASSES, TIMETABLE, UTC_OFFSET_HOURS, YEAR_END, YEAR_START, classLabel } from './school.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const DAY_NAMES = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
export const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const SCHOOL_DAYS = 5; // пн–пт
const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const KEYCAPS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

export const isClass = (cls) => typeof cls === 'string' && Object.hasOwn(CLASSES, cls);

export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function local(nowMs) {
  return new Date(nowMs + UTC_OFFSET_HOURS * 60 * 60 * 1000);
}

/** Сегодняшняя дата по местному времени. */
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

/** Учебный день, с которого открывать расписание: в субботу и воскресенье — понедельник. */
export function schoolDay(date) {
  const wd = weekday(date);
  return wd > SCHOOL_DAYS ? addDays(date, 8 - wd) : date;
}

/** Следующий / предыдущий учебный день (выходные пропускаем). */
export function stepDay(date, forward) {
  let d = addDays(date, forward ? 1 : -1);
  while (weekday(d) > SCHOOL_DAYS) d = addDays(d, forward ? 1 : -1);
  return d;
}

export function inYear(date) {
  const iso = isoDate(date);
  return iso >= YEAR_START && iso <= YEAR_END;
}

/** Есть ли в неделе с этой датой хоть один учебный день года. */
export function isYearWeek(date) {
  const monday = mondayOf(date);
  return isoDate(addDays(monday, 6)) >= YEAR_START && isoDate(monday) <= YEAR_END;
}

export function lessonsFor(cls, date) {
  if (!isClass(cls) || !inYear(date)) return [];
  return [...(TIMETABLE[cls][weekday(date)] ?? [])].sort((a, b) => a.n - b.n);
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

/** plural(3, 'урок', 'урока', 'уроков') → 'урока'. */
export function plural(n, one, few, many) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

export const lessonsWord = (n) => `${n} ${plural(n, 'урок', 'урока', 'уроков')}`;

export function duration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h && `${h} ч`, m && `${m} мин`].filter(Boolean).join(' ');
}

/** '14 октября' */
export function dayMonth(date) {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** '12–16 октября' или '28 сентября – 2 октября' */
export function dateRange(from, to) {
  if (from.getUTCMonth() === to.getUTCMonth()) return `${from.getUTCDate()}–${dayMonth(to)}`;
  return `${dayMonth(from)} – ${dayMonth(to)}`;
}

/** Время урока в минутах от полуночи: { start, end } или null, если звонков для него нет. */
export function bell(n) {
  const match = /^(\d\d):(\d\d)–(\d\d):(\d\d)$/.exec(BELLS[n] ?? '');
  if (!match) return null;
  const [h1, m1, h2, m2] = match.slice(1).map(Number);
  return { start: h1 * 60 + m1, end: h2 * 60 + m2 };
}

/** Кабинет для текста: '213' → 'каб. 213', 'спортзал' — как есть. */
export function roomText(room) {
  return /^\d/.test(room) ? `каб. ${room}` : room;
}

// --- Тексты (parse_mode: HTML) ---

export function outOfYear(date) {
  if (isoDate(date) < YEAR_START) {
    return `🏖 Учебный год ещё не начался — уроки с ${dayMonth(parseDate(YEAR_START))}.`;
  }
  return '🎓 Учебный год закончился — расписание пора обновить.';
}

function relativeDay(date, nowMs) {
  const diff = Math.round((date.getTime() - today(nowMs).getTime()) / DAY_MS);
  return { [-1]: 'Вчера', 0: 'Сегодня', 1: 'Завтра' }[diff];
}

/**
 * Что происходит в minutes (минуты от полуночи) среди уроков дня:
 * { kind: 'now', lesson, start, end } — идёт урок;
 * { kind: 'next', lesson, start, end, first } — перемена или уроки ещё не начались;
 * { kind: 'done' } — уроки закончились; null — у уроков нет звонков.
 */
export function dayStatus(lessons, minutes) {
  const slots = lessons.map((lesson) => ({ lesson, ...bell(lesson.n) })).filter((s) => s.start !== undefined);
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
    return `🟢 Идёт ${status.lesson.n}-й урок, до ${hhmm(status.end)} — ещё ${duration(status.end - minutes)}`;
  }
  if (status.kind === 'next') {
    const which = status.first ? 'Первый урок' : 'Следующий урок';
    return `⏳ ${which} в ${hhmm(status.start)} — через ${duration(status.start - minutes)}`;
  }
  return '✅ На сегодня уроки закончились';
}

function lessonCard(p, isNow, homework = []) {
  const head = [KEYCAPS[p.n] ?? `${p.n}.`, BELLS[p.n] && `<b>${BELLS[p.n]}</b>`, isNow && '← сейчас']
    .filter(Boolean)
    .join(' ');
  const title = `<b>${escapeHtml(p.subject)}</b>` + (p.type ? ` · <i>${escapeHtml(p.type)}</i>` : '');
  const hw = homework.map((n) => (n.private
    ? `🔒 ${escapeHtml(n.text)}`
    : `📝 ${escapeHtml(n.text)}${n.authorName ? ` <i>— ${escapeHtml(n.authorName)}</i>` : ''}`));
  return `<blockquote>${[head, title, ...(p.room ? [`📍 ${escapeHtml(roomText(p.room))}`] : []), ...hw].join('\n')}</blockquote>`;
}

/** «Окно» между уроками: номера уроков, которых нет, → время. */
function gapLine(fromN, toN) {
  const from = bell(fromN);
  const to = bell(toN);
  const time = from && to ? ` ${hhmm(from.start)}–${hhmm(to.end)}` : '';
  return `<i>☕ окно${time}</i>`;
}

/** notes — записи класса из базы; у уроков показываются задания к этой дате. */
export function formatDay(cls, date, nowMs = Date.now(), notes = []) {
  const label = relativeDay(date, nowMs);
  const name = `${DAY_NAMES[weekday(date) - 1]}, ${dayMonth(date)}`;
  const header = `📅 <b>${label ? `${label} · ${name}` : capitalize(name)}</b> · ${escapeHtml(classLabel(cls))}`;
  if (!inYear(date)) return `${header}\n\n${outOfYear(date)}`;

  const lessons = lessonsFor(cls, date);
  if (lessons.length === 0) return `${header}\n\nУроков нет — отдыхаем 🎉`;

  const first = bell(lessons[0].n);
  const last = bell(lessons[lessons.length - 1].n);
  const span = first && last ? ` с ${hhmm(first.start)} до ${hhmm(last.end)}` : '';
  const intro = [header, `<i>${lessonsWord(lessons.length)}${span}</i>`];

  const minutes = minutesNow(nowMs);
  const status = label === 'Сегодня' ? dayStatus(lessons, minutes) : null;
  const line = nowLine(status, minutes);
  if (line) intro.push('', line);

  const body = [];
  lessons.forEach((p, i) => {
    const prev = lessons[i - 1];
    if (prev && p.n - prev.n > 1) body.push(gapLine(prev.n + 1, p.n - 1));
    const hw = notes.filter((n) => n.due === isoDate(date) && n.subject === p.subject);
    body.push(lessonCard(p, status?.kind === 'now' && status.lesson === p, hw));
  });

  return `${intro.join('\n')}\n\n${body.join('\n')}`;
}

export function formatWeek(cls, date, nowMs = Date.now(), notes = []) {
  const monday = mondayOf(date);
  const friday = addDays(monday, SCHOOL_DAYS - 1);
  const header = `🗓 <b>${dateRange(monday, friday)}</b> · ${escapeHtml(classLabel(cls))}`;
  if (!isYearWeek(monday)) return `${header}\n\n${outOfYear(monday)}`;

  const todayMs = today(nowMs).getTime();
  const parts = [header];
  for (let i = 0; i < SCHOOL_DAYS; i++) {
    const day = addDays(monday, i);
    const lessons = lessonsFor(cls, day);
    const mark = day.getTime() === todayMs ? ' 👈 сегодня' : '';
    const head = `<b>${capitalize(DAY_NAMES[i])}, ${dayMonth(day)}</b>${mark}`;
    if (lessons.length === 0) {
      parts.push(`${head}\n<i>уроков нет</i>`);
      continue;
    }
    const lines = lessons.map((p) => {
      const time = bell(p.n);
      let line = `${time ? `<b>${hhmm(time.start)}</b>` : `${p.n}.`} ${escapeHtml(p.subject)}`;
      if (p.type) line += ` <i>${escapeHtml(p.type)}</i>`;
      if (p.room) line += ` · ${escapeHtml(p.room)}`;
      if (notes.some((n) => n.due === isoDate(day) && n.subject === p.subject)) line += ' 📝';
      return line;
    });
    parts.push(`${head}\n<blockquote>${lines.join('\n')}</blockquote>`);
  }
  return parts.join('\n\n');
}

/** Звонки: '1. 08:00–08:40' … */
export function formatBells() {
  return ['🔔 <b>Звонки</b> · I смена', '', ...Object.entries(BELLS).map(([n, t]) => `${KEYCAPS[n] ?? `${n}.`} ${t}`)].join('\n');
}
