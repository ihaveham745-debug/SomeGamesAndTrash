// lib/homework — домашние задания и заметки: предметы класса, ближайший урок, тексты.
// Без 'sdk': работает и в боте, и в Mini App, и в тестах. База — в lib/notes.js.
//
// Запись (note): { id, cls, subject, due, text, authorId, authorName }.
// due — дата урока 'ГГГГ-ММ-ДД', к которому задано; у заметки к предмету due = null.
// Записи у каждого класса (профиля) свои.

import { TIMETABLE } from './school.js';
import { addDays, bell, isClass, lessonsFor, minutesNow, today } from './schedule.js';

export const MAX_NOTE_LENGTH = 1000;

/** Предметы класса по алфавиту. */
export function subjectsOf(cls) {
  if (!isClass(cls)) return [];
  return [...new Set(Object.values(TIMETABLE[cls]).flat().map((p) => p.subject))].sort((a, b) => a.localeCompare(b, 'ru'));
}

const SHORT_WORDS = new Set(['в', 'и', 'с', 'к', 'о', 'на', 'по']);

// Как предметы называют в чате.
const ALIASES = {
  физра: 'Физкультура',
  физ: 'Физика',
  англ: 'Английский язык',
  английский: 'Английский язык',
  инглиш: 'Английский язык',
  инф: 'Информатика',
  информ: 'Информатика',
  информатика: 'Информатика',
  рус: 'Русский язык',
  русский: 'Русский язык',
  русич: 'Русский язык',
  лит: 'Литература',
  литра: 'Литература',
  матеша: 'Математика',
  матан: 'Математика',
  мат: 'Математика',
  алгебра: 'Математика',
  геометрия: 'Математика',
  общага: 'Обществознание',
  общество: 'Обществознание',
  общ: 'Обществознание',
  био: 'Биология',
  хим: 'Химия',
  гео: 'География',
  гера: 'География',
  тервер: 'Вероятность и статистика',
  вис: 'Вероятность и статистика',
  обж: 'ОБЗР',
  делангл: 'Деловой английский',
};

function norm(text) {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/[.\-–—]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Предмет класса по запросу: 'мат' → Математика, 'вис' → Вероятность и статистика,
 * 'введ лит' → Введение в литературоведение. Возвращает { subject } или { candidates }.
 */
export function findSubject(cls, query) {
  const subjects = subjectsOf(cls);
  const q = norm(query ?? '');
  if (!q) return { candidates: subjects };
  const alias = ALIASES[q.replace(/\s+/g, '')];
  const exact = subjects.find((s) => norm(s) === q) ?? (subjects.includes(alias) ? alias : null);
  if (exact) return { subject: exact };

  const qWords = q.split(' ');
  const byWords = subjects.filter((s) => {
    const words = norm(s).split(' ');
    return qWords.every((w) => words.some((x) => x.startsWith(w)));
  });
  const byInitials = subjects.filter((s) => {
    const initials = norm(s).split(' ').filter((w) => !SHORT_WORDS.has(w)).map((w) => w[0]).join('');
    const compact = q.replace(/\s+/g, '');
    return compact.length >= 2 && initials.length >= 2 && initials.startsWith(compact);
  });
  const hits = [...new Set([...byWords, ...byInitials])];
  if (hits.length === 1) return { subject: hits[0] };
  return { candidates: hits.length ? hits : subjects };
}

/**
 * Дата ближайшего урока предмета: сегодня, если он ещё не начался, иначе следующий.
 * null — в ближайшие horizonDays дней такого урока нет.
 */
export function nextLessonDate(cls, subject, nowMs = Date.now(), horizonDays = 120) {
  const start = today(nowMs);
  const minutes = minutesNow(nowMs);
  for (let i = 0; i <= horizonDays; i++) {
    const day = addDays(start, i);
    const has = lessonsFor(cls, day).some((p) => p.subject === subject && (i > 0 || (bell(p.n)?.start ?? 0) > minutes));
    if (has) return day;
  }
  return null;
}

/** Задания к уроку: тот же предмет и та же дата. */
export function homeworkFor(notes, iso, subject) {
  return notes.filter((n) => n.due === iso && n.subject === subject);
}

/** Текст записи: без пробелов по краям, не больше двух пустых строк подряд. '' — пусто. */
export function cleanText(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Ошибка в записи или null, если всё хорошо. */
export function validateNote({ cls, subject, due, text }) {
  if (!isClass(cls)) return 'Сначала выбери класс';
  if (!subjectsOf(cls).includes(subject)) return 'Нет такого предмета в расписании';
  if (due !== null && due !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return 'Неверная дата';
  const clean = cleanText(text);
  if (!clean) return 'Пустой текст';
  if (clean.length > MAX_NOTE_LENGTH) return `Слишком длинно: больше ${MAX_NOTE_LENGTH} символов`;
  return null;
}
