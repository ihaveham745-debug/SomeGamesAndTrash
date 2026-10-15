// schema — таблицы базы данных (именованные экспорты).

import { index, integer, sql, table, text } from 'sdk/db';

// Домашние задания и заметки группы — общие для всех.
// due — дата пары 'ГГГГ-ММ-ДД', к которой задано; у заметки к предмету due пустой.
export const notes = table('notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  subject: text('subject').notNull(),
  due: text('due'),
  text: text('text').notNull(),
  authorId: integer('author_id').notNull(),
  authorName: text('author_name'),
  created: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  dueIdx: index('idx_notes_due').on(t.due),
}));
