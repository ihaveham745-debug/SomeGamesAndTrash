// schema — таблицы базы данных (именованные экспорты).

import { index, integer, sql, table, text, uniqueIndex } from 'sdk/db';

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

// Замены аудиторий — общие для всей группы.
// slot — какая пара ('3|2|odd|Физика (подгр. А)', см. lib/schedule.js), date — на какой день
// ('ГГГГ-ММ-ДД') или '' — «всегда» (каждую неделю, пока не вернут как было).
export const rooms = table('rooms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slot: text('slot').notNull(),
  date: text('date').notNull().default(''),
  room: text('room').notNull(),
  authorId: integer('author_id').notNull(),
  authorName: text('author_name'),
  created: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  slotDateIdx: uniqueIndex('idx_rooms_slot_date').on(t.slot, t.date),
}));
