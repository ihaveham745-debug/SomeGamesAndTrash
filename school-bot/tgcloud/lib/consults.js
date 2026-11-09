// lib/consults — консультации: каждую неделю в свой день и время.
// Без 'sdk': работает и в боте, и в Mini App, и в тестах. База — в lib/consultStore.js.
//
// Общие (для всех) — только профмат «90+» и «80+», они заданы здесь.
// Свои консультации добавляет каждый сам — их видит только он.
// Консультация: { key, title, weekday (1 = пн … 7 = вс), start: 'ЧЧ:ММ', end: 'ЧЧ:ММ', shared }.
// key: у общих — 'prof90' / 'prof80', у своих — 'my:<id>'.

import { UTC_OFFSET_HOURS } from './school.js';

export const SHARED_CONSULTS = [
  { key: 'prof90', title: 'подготовка профмат «90+»', weekday: 1, start: '17:00', end: '18:30', shared: true },
  { key: 'prof80', title: 'профмат «80+»', weekday: 2, start: '17:00', end: '18:30', shared: true },
];

export const WEEKDAY_NAMES = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
export const EVERY_WEEKDAY = ['по понедельникам', 'по вторникам', 'по средам', 'по четвергам', 'по пятницам', 'по субботам', 'по воскресеньям'];

// Когда напоминать: в любой день недели в одно из этих времён или за час до начала.
export const WEEKLY_TIMES = ['09:00', '15:00', '18:00', '00:00'];
export const BEFORE_START = 'before60';
export const MAX_CONSULT_TITLE = 80;

const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const toMinutes = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
export const fromMinutes = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Своя консультация из базы → общий вид. */
export const myConsult = (row) => ({ key: `my:${row.id}`, id: row.id, title: row.title, weekday: row.weekday, start: row.start, end: row.end, shared: false });

/** Консультация по key среди общих и своих. */
export function consultByKey(key, mine = []) {
  return SHARED_CONSULTS.find((c) => c.key === key) ?? mine.map(myConsult).find((c) => c.key === key) ?? null;
}

/** Консультации этого дня недели: общие и свои, по времени. */
export function consultsOn(weekday, mine = []) {
  return [...SHARED_CONSULTS, ...mine.map(myConsult)]
    .filter((c) => c.weekday === weekday)
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Ошибка в своей консультации или null. */
export function validateConsult({ title, weekday, start, end }) {
  const clean = String(title ?? '').trim();
  if (!clean) return 'напиши, что за консультация';
  if (clean.length > MAX_CONSULT_TITLE) return `слишком длинно: больше ${MAX_CONSULT_TITLE} символов`;
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return 'выбери день недели';
  if (!HM.test(start ?? '') || !HM.test(end ?? '')) return 'время — в виде 17:00';
  if (toMinutes(end) <= toMinutes(start)) return 'конец должен быть позже начала';
  return null;
}

/**
 * Еженедельное напоминание: в какой день недели и во сколько оно приходит.
 * time — одно из WEEKLY_TIMES или BEFORE_START (за час до начала, в день консультации).
 * → { weekday, minutes } или null.
 */
export function weeklySlot(consult, weekday, time) {
  if (time === BEFORE_START) {
    const m = toMinutes(consult.start) - 60;
    // консультация в 0:30 — напомним накануне в 23:30
    return m >= 0 ? { weekday: consult.weekday, minutes: m } : { weekday: ((consult.weekday + 5) % 7) + 1, minutes: m + 24 * 60 };
  }
  if (!WEEKLY_TIMES.includes(time) || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) return null;
  return { weekday, minutes: toMinutes(time) };
}

/** Ближайший момент (unix-секунды) после nowMs, когда наступает этот день недели и время (по Якутску). */
export function nextWeekly(slot, nowMs = Date.now()) {
  const local = new Date(nowMs + UTC_OFFSET_HOURS * 3600 * 1000);
  const todayWd = ((local.getUTCDay() + 6) % 7) + 1;
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - UTC_OFFSET_HOURS * 3600 * 1000;
  let days = (slot.weekday - todayWd + 7) % 7;
  let at = midnight + days * 86400000 + slot.minutes * 60000;
  if (at <= nowMs) at += 7 * 86400000;
  return Math.floor(at / 1000);
}

/** 'по понедельникам в 09:00' / 'за час до начала'. */
export function weeklyText(consult, slot, time) {
  if (time === BEFORE_START) return `за час до начала (${fromMinutes(slot.minutes)})`;
  return `${EVERY_WEEKDAY[slot.weekday - 1]} в ${fromMinutes(slot.minutes)}`;
}
