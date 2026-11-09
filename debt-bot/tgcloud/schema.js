// schema — таблицы базы данных (именованные экспорты).

import { integer, sql, table, text, uniqueIndex } from 'sdk/db';

// Люди, которые писали боту. pending — чего бот ждёт от человека следующим сообщением
// ({ kind: 'part' | 'more', friendId }) — например, суммы частичного возврата.
// graceDays, rate — условия новых займов этого человека: дней без процентов и сотые процента в день
// (пусто — DEFAULT_TERMS из lib/loans.js).
export const users = table('users', {
  userId: integer('user_id').primaryKey(),
  name: text('name').notNull(),
  username: text('username'),
  pending: text('pending', { mode: 'json' }),
  graceDays: integer('grace_days'),
  rate: integer('rate'),
  created: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Друзья в тетрадке: у каждого, кто даёт в долг (ownerId), свой список.
// nameKey — имя в нижнем регистре (по нему находим друга в записях «петя 500»).
// linkedUserId — Telegram друга, если он открыл свою ссылку (token): тогда он видит долг и получает напоминания.
export const friends = table('friends', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ownerId: integer('owner_id').notNull(),
  name: text('name').notNull(),
  nameKey: text('name_key').notNull(),
  token: text('token').notNull(),
  linkedUserId: integer('linked_user_id'),
  created: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  ownerNameIdx: uniqueIndex('idx_friends_owner_name').on(t.ownerId, t.nameKey),
  tokenIdx: uniqueIndex('idx_friends_token').on(t.token),
}));

// Записи: kind 'lend' — дал в долг, 'return' — вернули. amount — в копейках. at — unix-секунды.
// У займа ('lend'): due — до какого момента без процентов (unix), rate — сотые процента в день после.
export const ops = table('ops', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ownerId: integer('owner_id').notNull(),
  friendId: integer('friend_id').notNull(),
  kind: text('kind').notNull(),
  amount: integer('amount').notNull(),
  note: text('note'),
  at: integer('at').notNull(),
  due: integer('due'),
  rate: integer('rate'),
});
