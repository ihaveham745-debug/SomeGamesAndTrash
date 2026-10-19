// POST /api/listNotes {cls} — задания и заметки класса и профильной группы для Mini App,
// плюс напоминания, которые включил этот человек: reminders = [{ noteId, mode, at }].

import { EndpointError } from 'sdk';
import { isClass } from '../lib/schedule.js';
import { groupsOf } from '../lib/homework.js';
import { groupNotes } from '../lib/notes.js';
import { remindersOf, tickReminders } from '../lib/reminders.js';

export default async function (input, ctx) {
  if (!isClass(input?.cls)) throw new EndpointError('неизвестный класс', { code: 'INVALID' });
  const me = ctx.initData?.user?.id ?? null;
  const [notes, reminders] = await Promise.all([
    groupNotes(groupsOf(input.cls), me),
    me ? remindersOf(me) : [],
  ]);
  await tickReminders(); // открыли приложение — заодно разослать напоминания, чьё время пришло
  return { notes, me, reminders };
}
