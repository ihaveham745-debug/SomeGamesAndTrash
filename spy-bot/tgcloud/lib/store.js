// lib/store — игры в базе. Одна игра на чат; изменения — с проверкой версии,
// чтобы два одновременных нажатия («играю» от двоих) не затёрли друг друга.

import { db } from 'sdk';
import { and, eq, sql } from 'sdk/db';
import { games } from '../schema.js';

export function getGame(chatId) {
  return db.select().from(games).where(eq(games.chatId, chatId)).get();
}

/** Новая игра в чате (старая, если была, заменяется). */
export async function putGame(chatId, msgId, state) {
  await db.insert(games).values({ chatId, msgId, state, version: 0 })
    .onConflictDoUpdate({ target: games.chatId, set: { msgId, state, version: sql`${games.version} + 1`, updated: sql`(unixepoch())` } }).run();
}

/** Сохранить, только если никто не успел поменять игру раньше. true — сохранили. */
export async function saveGame(chatId, version, state) {
  const res = await db.update(games).set({ state, version: version + 1, updated: sql`(unixepoch())` })
    .where(and(eq(games.chatId, chatId), eq(games.version, version))).run();
  return res.rowsAffected > 0;
}
