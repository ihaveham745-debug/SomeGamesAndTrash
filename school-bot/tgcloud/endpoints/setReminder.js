// POST /api/setReminder {id, cls, at} — включить себе напоминание о дз на момент at
// (unix-секунды: любой день, время 9:00 / 15:00 / 18:00 / 0:00 по Якутску) или выключить (at: null).
// Бот пришлёт напоминание в личку.

import { EndpointError } from 'sdk';
import { canSee, groupsOf } from '../lib/homework.js';
import { isClass } from '../lib/schedule.js';
import { store } from '../lib/notes.js';
import { setReminder } from '../lib/reminders.js';

const ERRORS = {
  BAD_TIME: 'напомнить можно в 9:00, 15:00, 18:00 или 0:00',
  PAST: 'это время уже прошло — выбери другое',
  TOO_FAR: 'слишком далеко — не дальше чем через год',
};

export default async function (input, ctx) {
  const user = ctx.initData?.user;
  if (!user) throw new EndpointError('открой приложение из чата с ботом', { code: 'NO_USER' });
  if (!isClass(input?.cls)) throw new EndpointError('неизвестный класс', { code: 'INVALID' });
  const note = await store.get(input?.id);
  if (!note || !canSee(note, groupsOf(input.cls), user.id)) throw new EndpointError('дз не найдено', { code: 'NOT_FOUND' });
  try {
    return await setReminder(user.id, input.cls, note, input.at ?? null);
  } catch (err) {
    if (ERRORS[err.message]) throw new EndpointError(ERRORS[err.message], { code: err.message });
    throw err;
  }
}
