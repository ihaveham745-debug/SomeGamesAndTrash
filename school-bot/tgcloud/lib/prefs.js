// lib/prefs — какой класс выбран в чате. Интерфейс prefs, который ждёт lib/bot.js.

import { db } from 'sdk';
import { eq, sql } from 'sdk/db';
import { chats } from '../schema.js';

export const prefs = {
  get: async (chatId) => {
    if (!Number.isInteger(chatId)) return null;
    try {
      const row = await db.select({ cls: chats.cls }).from(chats).where(eq(chats.chatId, chatId)).get();
      return row?.cls ?? null;
    } catch (err) {
      console.error('prefs.get failed', err);
      return null;
    }
  },
  set: async (chatId, cls) => {
    await db.insert(chats).values({ chatId, cls })
      .onConflictDoUpdate({ target: chats.chatId, set: { cls, updated: sql`(unixepoch())` } }).run();
  },
};
