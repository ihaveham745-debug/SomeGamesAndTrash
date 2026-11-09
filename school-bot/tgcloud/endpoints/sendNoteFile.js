// POST /api/sendNoteFile {id, cls} — бот присылает файл записи человеку в личку.

import { BotApiError, EndpointError } from 'sdk';
import { canSee, groupsOf } from '../lib/homework.js';
import { store } from '../lib/notes.js';
import { sendNoteFile } from '../lib/files.js';

export default async function (input, ctx) {
  const user = ctx.initData?.user;
  if (!user) throw new EndpointError('открой приложение из чата с ботом', { code: 'NO_USER' });
  const note = await store.get(input?.id);
  if (!note?.fileId || !canSee(note, groupsOf(input?.cls), user.id)) {
    throw new EndpointError('файл не найден', { code: 'NOT_FOUND' });
  }
  try {
    await sendNoteFile(user.id, note);
  } catch (err) {
    if (!(err instanceof BotApiError)) throw err;
    console.warn('sendNoteFile failed', err.description);
    throw new EndpointError('не получилось отправить. напиши боту /start и попробуй ещё раз', { code: 'SEND' });
  }
  return { sent: true };
}
