// lib/notes — задания и заметки в базе. Интерфейс store, который ждёт lib/bot.js.

import { db } from 'sdk';
import { and, asc, eq, gte, inArray, isNull, lte, or } from 'sdk/db';
import { notes } from '../schema.js';

const FIELDS = {
  id: notes.id,
  cls: notes.cls,
  subject: notes.subject,
  due: notes.due,
  text: notes.text,
  authorId: notes.authorId,
  authorName: notes.authorName,
  private: notes.private,
  fileId: notes.fileId,
  fileKind: notes.fileKind,
  fileName: notes.fileName,
};

/** Общие записи и личные записи viewer (null — только общие). */
const visibleTo = (viewer) => (viewer
  ? or(eq(notes.private, false), eq(notes.authorId, viewer))
  : eq(notes.private, false));

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
  range: (groups, from, to, viewer = null) => safe(
    db.select(FIELDS).from(notes)
      .where(and(inArray(notes.cls, groups), visibleTo(viewer), gte(notes.due, from), lte(notes.due, to))).orderBy(asc(notes.id)).all(),
  ),
  upcoming: (groups, from, viewer = null) => safe(
    db.select(FIELDS).from(notes)
      .where(and(inArray(notes.cls, groups), visibleTo(viewer), or(gte(notes.due, from), isNull(notes.due)))).orderBy(asc(notes.id)).all(),
  ),
  add: async ({ cls, subject, due, text, authorId, authorName, private: isPrivate = false, fileId = null, fileKind = null, fileName = null }) => {
    const [row] = await db.insert(notes)
      .values({ cls, subject, due, text, authorId, authorName, private: isPrivate, fileId, fileKind, fileName })
      .returning(FIELDS);
    return row;
  },
  get: async (id) => (Number.isInteger(id) ? safeOne(db.select(FIELDS).from(notes).where(eq(notes.id, id)).get()) : null),
};

async function safeOne(query) {
  try {
    return await query;
  } catch (err) {
    console.error('notes query failed', err);
    return null;
  }
}

/** Все записи групп, которые видит viewer (для Mini App: их немного, приложение само раскладывает по дням). */
export function groupNotes(groups, viewer) {
  return db.select(FIELDS).from(notes).where(and(inArray(notes.cls, groups), visibleTo(viewer))).orderBy(asc(notes.id)).limit(2000).all();
}

/** Удалить свою запись. true — удалили, false — нет такой или она чужая. */
export async function deleteOwnNote(id, authorId) {
  const res = await db.delete(notes).where(and(eq(notes.id, id), eq(notes.authorId, authorId))).run();
  return res.rowsAffected > 0;
}
