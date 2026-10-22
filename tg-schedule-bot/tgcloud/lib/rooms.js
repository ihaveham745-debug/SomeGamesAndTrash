// lib/rooms — замены аудиторий в базе. Интерфейс roomStore, который ждёт lib/bot.js:
//   roomStore.all()                          — все замены (их мало);
//   roomStore.set({ slot, date, room, authorId, authorName }) — поставить замену;
//   roomStore.clear(slot, date)              — вернуть как было (true — было что убирать).

import { db } from 'sdk';
import { and, asc, eq } from 'sdk/db';
import { rooms } from '../schema.js';

const FIELDS = { slot: rooms.slot, date: rooms.date, room: rooms.room, authorName: rooms.authorName };

export const roomStore = {
  all: async () => {
    try {
      return await db.select(FIELDS).from(rooms).orderBy(asc(rooms.id)).all();
    } catch (err) {
      console.error('rooms query failed', err); // без замен расписание всё равно показываем
      return [];
    }
  },
  set: async ({ slot, date, room, authorId, authorName }) => {
    await db.insert(rooms).values({ slot, date, room, authorId, authorName })
      .onConflictDoUpdate({ target: [rooms.slot, rooms.date], set: { room, authorId, authorName } }).run();
  },
  clear: async (slot, date) => {
    const res = await db.delete(rooms).where(and(eq(rooms.slot, slot), eq(rooms.date, date))).run();
    return res.rowsAffected > 0;
  },
};
