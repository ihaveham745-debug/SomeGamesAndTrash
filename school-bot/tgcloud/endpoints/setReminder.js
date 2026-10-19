// POST /api/setReminder {id, cls, mode} — включить себе напоминание о дз
// (mode: 'evening' | 'morning' | 'before') или выключить (mode: null). Бот пришлёт его в личку.

import { EndpointError } from 'sdk';
import { canSee, groupsOf } from '../lib/homework.js';
import { isClass } from '../lib/schedule.js';
import { store } from '../lib/notes.js';
import { setReminder } from '../lib/reminders.js';

export default async function (input, ctx) {
  const user = ctx.initData?.user;
  if (!user) throw new EndpointError('открой приложение из чата с ботом', { code: 'NO_USER' });
  if (!isClass(input?.cls)) throw new EndpointError('неизвестный класс', { code: 'INVALID' });
  const note = await store.get(input?.id);
  if (!note?.due || !canSee(note, groupsOf(input.cls), user.id)) throw new EndpointError('дз не найдено', { code: 'NOT_FOUND' });
  try {
    return await setReminder(user.id, input.cls, note, input.mode ?? null);
  } catch (err) {
    if (err.message === 'PAST') throw new EndpointError('это время уже прошло — выбери другое', { code: 'PAST' });
    if (err.message === 'NO_LESSON') throw new EndpointError('не нашёл этот урок в расписании', { code: 'NO_LESSON' });
    if (err.message === 'BAD_MODE') throw new EndpointError('нет такого напоминания', { code: 'INVALID' });
    throw err;
  }
}
