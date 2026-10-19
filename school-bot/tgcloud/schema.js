// schema — таблицы базы данных (именованные экспорты).

import { boolean, index, integer, sql, table, text, uniqueIndex } from 'sdk/db';

// Домашние задания и заметки. cls — группа урока: 'a' / 'b' (весь 10а / 10б) или профиль
// ('se', 'tech', 'en', 'gum') — запись видят все из этой группы.
// private — личная запись: её видит только автор.
// due — дата урока 'ГГГГ-ММ-ДД', к которому задано; у заметки к предмету due пустой.
export const notes = table('notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cls: text('cls').notNull(),
  subject: text('subject').notNull(),
  due: text('due'),
  text: text('text').notNull(),
  authorId: integer('author_id').notNull(),
  authorName: text('author_name'),
  private: boolean('private').notNull().default(false),
  // прикреплённый файл: лежит в Telegram, здесь — file_id; fileKind — 'photo' или 'document'
  fileId: text('file_id'),
  fileKind: text('file_kind'),
  fileName: text('file_name'),
  created: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  clsDueIdx: index('idx_notes_cls_due').on(t.cls, t.due),
}));

// Выбранный класс и профиль ('a-gum' …): для чата (личка — id пользователя, он же для Mini App; группа — id группы).
export const chats = table('chats', {
  chatId: integer('chat_id').primaryKey(),
  cls: text('cls').notNull(),
  updated: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Обои в приложении — у каждого свои. kind: 'cats' | 'glass' | 'photo';
// у своего фото файл лежит в Telegram, здесь — file_id.
export const wallpapers = table('wallpapers', {
  userId: integer('user_id').primaryKey(),
  kind: text('kind').notNull(),
  fileId: text('file_id'),
  updated: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Напоминания о дз: каждый включает себе сам. at — когда прислать (unix-секунды);
// cls — класс и профиль того, кто включил (по нему считали время урока).
export const reminders = table('reminders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  noteId: integer('note_id').notNull(),
  cls: text('cls').notNull(),
  mode: text('mode').notNull(),
  at: integer('at').notNull(),
  sent: boolean('sent').notNull().default(false),
}, (t) => ({
  userNoteIdx: uniqueIndex('idx_reminders_user_note').on(t.userId, t.noteId),
  dueIdx: index('idx_reminders_due').on(t.sent, t.at),
}));
