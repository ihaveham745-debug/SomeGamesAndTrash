// POST /api/listNotes — все задания и заметки группы для Mini App, плюс замены аудиторий.

import { allNotes } from '../lib/notes.js';
import { roomStore } from '../lib/rooms.js';

export default async function (input, ctx) {
  const [notes, rooms] = await Promise.all([allNotes(), roomStore.all()]);
  return { notes, rooms, me: ctx.initData?.user?.id ?? null };
}
