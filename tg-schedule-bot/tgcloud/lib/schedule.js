// lib/schedule — даты, чётность недели и тексты ответов.
// Без импортов из 'sdk', поэтому модуль можно тестировать обычным Node.
//
// Дата везде — объект Date на полночь UTC нужного календарного дня
// (так не мешают часовые пояса: считаем только дни).

import { BELLS, SEMESTER_END, SEMESTER_START, TIMETABLE, UTC_OFFSET_HOURS } from './timetable.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_NAMES = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Сегодняшняя дата по местному времени университета. */
export function today(nowMs = Date.now()) {
  const local = new Date(nowMs + UTC_OFFSET_HOURS * 60 * 60 * 1000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

export function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

/** 1 = понедельник … 7 = воскресенье. */
export function weekday(date) {
  return ((date.getUTCDay() + 6) % 7) + 1;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function ddmm(date) {
  return `${String(date.getUTCDate()).padStart(2, '0')}.${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function mondayOf(date) {
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

function parityWord(date) {
  return isOddWeek(date) ? 'нечётная' : 'чётная';
}

function inSemester(date) {
  const iso = isoDate(date);
  return iso >= SEMESTER_START && iso <= SEMESTER_END;
}

export function pairsFor(date) {
  if (!inSemester(date)) return [];
  const parity = isOddWeek(date) ? 'odd' : 'even';
  const iso = isoDate(date);
  return (TIMETABLE[weekday(date)] ?? [])
    .filter((p) => !p.week || p.week === parity)
    .filter((p) => !p.until || iso <= p.until)
    .sort((a, b) => a.n - b.n);
}

// --- Тексты (parse_mode: HTML) ---

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function outOfSemester(date) {
  if (isoDate(date) < SEMESTER_START) {
    return `Семестр ещё не начался: занятия с ${ddmm(parseDate(SEMESTER_START))}.`;
  }
  return 'Семестр закончился — расписание пора обновить 🙂';
}

function weekLine(date) {
  return `${weekNumber(date)}-я неделя, ${parityWord(date)}`;
}

function pairBlock(p) {
  const head = `<b>${p.n} пара</b>` + (BELLS[p.n] ? ` · ${BELLS[p.n]}` : '');
  const subject = escapeHtml(p.subject) + (p.type ? ` <i>(${escapeHtml(p.type)})</i>` : '');
  const details = [p.room && `📍 ${escapeHtml(p.room)}`, p.teacher && `👤 ${escapeHtml(p.teacher)}`].filter(Boolean);
  return [head, subject, ...(details.length ? [details.join(' · ')] : [])].join('\n');
}

export function formatDay(date, title) {
  const header = `<b>${title}, ${DAY_NAMES[weekday(date) - 1]} ${ddmm(date)}</b>`;
  if (!inSemester(date)) return `${header}\n${outOfSemester(date)}`;

  const pairs = pairsFor(date);
  const parts = [`${header}\n${weekLine(date)}`];
  if (pairs.length === 0) parts.push('Пар нет 🎉');
  for (const p of pairs) parts.push(pairBlock(p));
  return parts.join('\n\n');
}

export function formatWeek(date) {
  if (!inSemester(date)) return outOfSemester(date);

  const monday = mondayOf(date);
  const parts = [`<b>${weekLine(date)}</b> (${ddmm(monday)}–${ddmm(addDays(monday, 6))})`];
  for (let i = 0; i < 7; i++) {
    const day = addDays(monday, i);
    const pairs = pairsFor(day);
    if (pairs.length === 0 && i === 6) continue; // пустое воскресенье не показываем
    const name = DAY_NAMES[i][0].toUpperCase() + DAY_NAMES[i].slice(1);
    const mark = day.getTime() === date.getTime() ? ' 👈 сегодня' : '';
    const lines = [`<b>${name}, ${ddmm(day)}</b>${mark}`];
    if (pairs.length === 0) lines.push('пар нет');
    for (const p of pairs) {
      let line = `${p.n}. ${BELLS[p.n] ? BELLS[p.n].split('–')[0] + ' ' : ''}${escapeHtml(p.subject)}`;
      if (p.type) line += ` <i>(${escapeHtml(p.type)})</i>`;
      if (p.room) line += ` · 📍 ${escapeHtml(p.room)}`;
      lines.push(line);
    }
    parts.push(lines.join('\n'));
  }
  return parts.join('\n\n');
}

export function formatParity(date) {
  if (!inSemester(date)) return outOfSemester(date);
  return `Сейчас <b>${weekNumber(date)}-я неделя</b> — <b>${parityWord(date)}</b>.`;
}
