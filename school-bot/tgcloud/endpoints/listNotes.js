// POST /api/listNotes {cls} — задания и заметки класса для Mini App.

import { EndpointError } from 'sdk';
import { isClass } from '../lib/schedule.js';
import { classNotes } from '../lib/notes.js';

export default async function (input, ctx) {
  if (!isClass(input?.cls)) throw new EndpointError('Неизвестный класс', { code: 'INVALID' });
  return { notes: await classNotes(input.cls), me: ctx.initData.user?.id ?? null };
}
