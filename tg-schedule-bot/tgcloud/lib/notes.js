// lib/notes — задания и заметки в базе. Интерфейс store, который ждёт lib/bot.js.

import { db } from 'sdk';
import { and, asc, eq, gte, isNull, lte, or } from 'sdk/db';
import { notes } from '../schema.js';

const FIELDS = {
  id: notes.id,
  subject: notes.subject,
  due: notes.due,
  text: notes.text,
  authorId: notes.authorId,
  authorName: notes.authorName,
};

// Если база недоступна, расписание всё равно показываем — просто без заданий.
async function safe(query) {
  try {
    return await query;
  } catch (err) {
    console.error('notes query failed', err);
    return [];
  }
}

export const store = {
  range: (from, to) => safe(
    db.select(FIELDS).from(notes).where(and(gte(notes.due, from), lte(notes.due, to))).orderBy(asc(notes.id)).all(),
  ),
  upcoming: (from) => safe(
    db.select(FIELDS).from(notes).where(or(gte(notes.due, from), isNull(notes.due))).orderBy(asc(notes.id)).all(),
  ),
  add: async ({ subject, due, text, authorId, authorName }) => {
    const [row] = await db.insert(notes).values({ subject, due, text, authorId, authorName }).returning(FIELDS);
    return row;
  },
};

/** Все записи (для Mini App: их немного, приложение само раскладывает по дням). */
export function allNotes() {
  return db.select(FIELDS).from(notes).orderBy(asc(notes.id)).limit(2000).all();
}

/** Удалить свою запись. true — удалили, false — нет такой или она чужая. */
export async function deleteOwnNote(id, authorId) {
  const res = await db.delete(notes).where(and(eq(notes.id, id), eq(notes.authorId, authorId))).run();
  return res.rowsAffected > 0;
}
