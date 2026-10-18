// POST /api/listNotes {cls} — задания и заметки класса и профильной группы для Mini App.

import { EndpointError } from 'sdk';
import { isClass } from '../lib/schedule.js';
import { groupsOf } from '../lib/homework.js';
import { groupNotes } from '../lib/notes.js';

export default async function (input, ctx) {
  if (!isClass(input?.cls)) throw new EndpointError('Неизвестный класс', { code: 'INVALID' });
  return { notes: await groupNotes(groupsOf(input.cls)), me: ctx.initData.user?.id ?? null };
}
