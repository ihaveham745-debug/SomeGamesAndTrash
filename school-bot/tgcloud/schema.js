// schema — таблицы базы данных (именованные экспорты).

import { boolean, index, integer, sql, table, text } from 'sdk/db';

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
