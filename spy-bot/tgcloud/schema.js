// schema — таблицы базы данных (именованные экспорты).

import { integer, sql, table, text } from 'sdk/db';

// Игры: одна на чат. state — всё состояние игры (см. lib/game.js) в JSON;
// msgId — сообщение игры с кнопками; version — защита от одновременных нажатий.
export const games = table('games', {
  chatId: integer('chat_id').primaryKey(),
  msgId: integer('msg_id'),
  state: text('state', { mode: 'json' }).notNull(),
  version: integer('version').notNull().default(0),
  updated: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});
