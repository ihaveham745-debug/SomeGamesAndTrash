// POST /api/deleteConsult {id} — удалить свою консультацию (и напоминание о ней).

import { EndpointError } from 'sdk';
import { deleteConsult } from '../lib/consultStore.js';

export default async function (input, ctx) {
  const id = ctx.initData?.user?.id;
  if (!id) throw new EndpointError('открой приложение из чата с ботом', { code: 'NO_USER' });
  if (!Number.isInteger(input?.id)) throw new EndpointError('неверный id', { code: 'INVALID' });
  if (!(await deleteConsult(id, input.id))) throw new EndpointError('консультация не найдена', { code: 'NOT_FOUND' });
  return { deleted: input.id };
}
