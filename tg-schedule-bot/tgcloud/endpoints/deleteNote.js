// POST /api/deleteNote — удалить свою запись. Чужие удалить нельзя.

import { EndpointError } from 'sdk';
import { deleteOwnNote } from '../lib/notes.js';

export default async function (input, ctx) {
  const user = ctx.initData.user;
  if (!user) throw new EndpointError('Открой приложение из чата с ботом', { code: 'NO_USER' });
  if (!Number.isInteger(input.id)) throw new EndpointError('Неверный id', { code: 'INVALID' });
  if (!(await deleteOwnNote(input.id, user.id))) {
    throw new EndpointError('Запись не найдена или её добавил кто-то другой', { code: 'NOT_FOUND' });
  }
  return { deleted: input.id };
}
