// POST /api/listNotes — все задания и заметки группы для Mini App.

import { allNotes } from '../lib/notes.js';

export default async function (input, ctx) {
  return { notes: await allNotes(), me: ctx.initData.user?.id ?? null };
}
