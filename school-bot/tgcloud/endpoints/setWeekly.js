// POST /api/setWeekly {key, weekday, time} — напоминать о консультации каждую неделю:
// в выбранный день недели в 9:00 / 15:00 / 18:00 / 0:00 или 'before60' — за час до начала.
// time: null — выключить. Напоминание приходит в личку только этому человеку.

import { EndpointError } from 'sdk';
import { setWeekly } from '../lib/consultStore.js';

export default async function (input, ctx) {
  const id = ctx.initData?.user?.id;
  if (!id) throw new EndpointError('открой приложение из чата с ботом', { code: 'NO_USER' });
  const key = String(input?.key ?? '');
  try {
    return { weekly: await setWeekly(id, key, input?.weekday ?? null, input?.time ?? null) };
  } catch (err) {
    if (err.message === 'NOT_FOUND') throw new EndpointError('консультация не найдена', { code: 'NOT_FOUND' });
    if (err.message === 'BAD_TIME') throw new EndpointError('выбери день и время', { code: 'INVALID' });
    throw err;
  }
}
