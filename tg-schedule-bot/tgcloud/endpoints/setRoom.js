// POST /api/setRoom {slot, date, room} — поменять аудиторию пары для всей группы.
// date — 'ГГГГ-ММ-ДД' (только этот день) или '' (всегда); room: null — вернуть как в расписании.

import { EndpointError } from 'sdk';
import { validateRoomChange } from '../lib/schedule.js';
import { roomStore } from '../lib/rooms.js';

export default async function (input, ctx) {
  const user = ctx.initData?.user;
  if (!user) throw new EndpointError('Открой приложение из чата с ботом', { code: 'NO_USER' });
  const slot = String(input?.slot ?? '');
  const date = input?.date ?? '';
  const room = input?.room === null || input?.room === undefined ? null : String(input.room).trim();
  const error = validateRoomChange({ slot, date, room });
  if (error) throw new EndpointError(error, { code: 'INVALID' });

  if (room === null) {
    await roomStore.clear(slot, date);
  } else {
    const authorName = [user.first_name, user.last_name && `${user.last_name[0]}.`].filter(Boolean).join(' ') || user.username || null;
    await roomStore.set({ slot, date, room, authorId: user.id, authorName });
  }
  return { rooms: await roomStore.all() };
}
