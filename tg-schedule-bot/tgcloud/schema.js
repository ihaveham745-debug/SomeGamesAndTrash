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

// Кто пользуется ботом — для /stats. id — Telegram id пользователя.
// Время — unix-секунды; hits — сообщения и нажатия в боте, appOpens — открытия Mini App.
export const users = table('users', {
  id: integer('id').primaryKey(),
  name: text('name'),
  username: text('username'),
  firstSeen: integer('first_seen').notNull(),
  lastSeen: integer('last_seen').notNull(),
  hits: integer('hits').notNull().default(0),
  appOpens: integer('app_opens').notNull().default(0),
}, (t) => ({
  lastSeenIdx: index('idx_users_last_seen').on(t.lastSeen),
}));
