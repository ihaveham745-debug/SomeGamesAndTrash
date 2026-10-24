// POST /api/addConsult {title, weekday, start, end} — своя консультация (видна только тебе).

import { EndpointError } from 'sdk';
import { myConsult, validateConsult } from '../lib/consults.js';
import { addConsult, myConsults } from '../lib/consultStore.js';

const MAX_PER_USER = 30;

export default async function (input, ctx) {
  const id = ctx.initData?.user?.id;
  if (!id) throw new EndpointError('открой приложение из чата с ботом', { code: 'NO_USER' });
  const consult = { title: input?.title, weekday: input?.weekday, start: input?.start, end: input?.end };
  const error = validateConsult(consult);
  if (error) throw new EndpointError(error, { code: 'INVALID' });
  if ((await myConsults(id)).length >= MAX_PER_USER) throw new EndpointError(`не больше ${MAX_PER_USER} своих консультаций`, { code: 'LIMIT' });
  return { consult: myConsult(await addConsult(id, consult)) };
}
