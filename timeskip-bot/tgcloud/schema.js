// schema — таблицы базы данных (именованные экспорты).

import { index, integer, sql, table, text } from 'sdk/db';

// Партии с другом онлайн — шахматы и шашки (kind). code — короткий код для ссылки-приглашения.
// moves — ходы через пробел в UCI ('e2e4 e7e5'); позицию сервер восстанавливает по ним.
// status: 'waiting' — ждём соперника, 'active' — идёт, 'over' — закончена (result, reason).
// *_seen — когда игрок последний раз смотрел партию (unix-секунды): если давно — шлём ему сообщение о ходе.
export const chessGames = table('chess_games', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  kind: text('kind').notNull().default('chess'), // 'chess' | 'checkers'
  whiteId: integer('white_id'),
  whiteName: text('white_name'),
  blackId: integer('black_id'),
  blackName: text('black_name'),
  moves: text('moves').notNull().default(''),
  status: text('status').notNull().default('waiting'),
  result: text('result'),
  reason: text('reason'),
  whiteSeen: integer('white_seen').notNull().default(0),
  blackSeen: integer('black_seen').notNull().default(0),
  created: integer('created_at').notNull().default(sql`(unixepoch())`),
  updated: integer('updated_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  whiteIdx: index('idx_chess_white').on(t.whiteId),
  blackIdx: index('idx_chess_black').on(t.blackId),
}));
