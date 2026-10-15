// POST /api/listNotes — все задания и заметки группы для Mini App.

import { allNotes } from '../lib/notes.js';
import { track } from '../lib/stats.js';

// Mini App зовёт listNotes при каждом открытии — заодно считаем открытия для /stats.
export default async function (input, ctx) {
  await track(ctx.initData.user, 'app');
  return { notes: await allNotes(), me: ctx.initData.user?.id ?? null };
}
