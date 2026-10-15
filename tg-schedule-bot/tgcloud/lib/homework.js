// lib/homework — домашние задания и заметки: предметы, поиск ближайшей пары, тексты.
// Без 'sdk': работает и в боте, и в Mini App, и в тестах. База — в lib/notes.js.
//
// Запись (note): { id, subject, due, text, authorId, authorName }.
// due — дата пары 'ГГГГ-ММ-ДД', к которой задано; у заметки к предмету due = null.

import { TIMETABLE } from './timetable.js';
import { addDays, baseSubject, bell, minutesNow, pairsFor, today } from './schedule.js';

export const MAX_NOTE_LENGTH = 1000;

/** Все предметы из расписания (без подгрупп), по алфавиту. */
export const SUBJECTS = [...new Set(Object.values(TIMETABLE).flat().map((p) => baseSubject(p.subject)))]
  .sort((a, b) => a.localeCompare(b, 'ru'));

const SHORT_WORDS = new Set(['в', 'и', 'с', 'к', 'о', 'на', 'по']);

// Как предметы называют в чате.
const ALIASES = {
  физра: 'Физическая культура и спорт',
  физкультура: 'Физическая культура и спорт',
  англ: 'Иностранный язык',
  английский: 'Иностранный язык',
  инглиш: 'Иностранный язык',
  иняз: 'Иностранный язык',
  история: 'История России',
  матан: 'Математика',
  вышмат: 'Высшая математика',
  бжд: 'Безопасность жизнедеятельности',
  обж: 'Безопасность жизнедеятельности',
  рки: 'Русский язык и культура речи',
  вссцт: 'Введение в сквозные цифровые технологии',
};

function norm(text) {
  return text.toLowerCase().replace(/ё/g, 'е').trim();
}

/**
 * Предмет по запросу: 'мат' → Математика, 'орг' → Основы российской государственности (по первым буквам),
 * 'физика' → Физика. Возвращает { subject } или { candidates } — если не нашли или нашли несколько.
 */
export function findSubject(query) {
  const q = norm(query ?? '');
  if (!q) return { candidates: SUBJECTS };
  const exact = SUBJECTS.find((s) => norm(s) === q) ?? (SUBJECTS.includes(ALIASES[q]) ? ALIASES[q] : null);
  if (exact) return { subject: exact };

  const qWords = q.split(/\s+/);
  const byWords = SUBJECTS.filter((s) => {
    const words = norm(s).split(/[\s-]+/);
    return qWords.every((w) => words.some((x) => x.startsWith(w)));
  });
  const byInitials = SUBJECTS.filter((s) => {
    const initials = norm(s).split(/[\s-]+/).filter((w) => !SHORT_WORDS.has(w)).map((w) => w[0]).join('');
    const compact = q.replace(/\s+/g, '');
    return compact.length >= 2 && (initials.startsWith(compact) || (compact.length >= 3 && initials.includes(compact)));
  });
  const hits = [...new Set([...byWords, ...byInitials])];
  if (hits.length === 1) return { subject: hits[0] };
  return { candidates: hits.length ? hits : SUBJECTS };
}

/**
 * Дата ближайшей пары предмета: сегодня, если она ещё не началась, иначе следующая.
 * null — в ближайшие horizonDays дней такой пары нет.
 */
export function nextPairDate(subject, nowMs = Date.now(), horizonDays = 120) {
  const start = today(nowMs);
  const minutes = minutesNow(nowMs);
  for (let i = 0; i <= horizonDays; i++) {
    const day = addDays(start, i);
    const has = pairsFor(day).some((p) => baseSubject(p.subject) === subject && (i > 0 || (bell(p.n)?.start ?? 0) > minutes));
    if (has) return day;
  }
  return null;
}

/** Задания к паре: тот же предмет и та же дата. */
export function homeworkFor(notes, iso, subject) {
  const base = baseSubject(subject);
  return notes.filter((n) => n.due === iso && n.subject === base);
}

/** Текст записи: без пробелов по краям, не больше двух пустых строк подряд. '' — пусто. */
export function cleanText(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Ошибка в записи или null, если всё хорошо. */
export function validateNote({ subject, due, text }) {
  if (!SUBJECTS.includes(subject)) return 'Нет такого предмета в расписании';
  if (due !== null && due !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return 'Неверная дата';
  const clean = cleanText(text);
  if (!clean) return 'Пустой текст';
  if (clean.length > MAX_NOTE_LENGTH) return `Слишком длинно: больше ${MAX_NOTE_LENGTH} символов`;
  return null;
}
