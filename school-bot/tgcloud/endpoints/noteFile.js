// POST /api/noteFile {id, cls} — содержимое фото записи (base64) для превью в Mini App.
// Только фото и не больше PREVIEW_MB: остальное приложение просит прислать в чат.

import { EndpointError, api } from 'sdk';
import { canSee, groupsOf } from '../lib/homework.js';
import { store } from '../lib/notes.js';
import { toBase64 } from '../lib/files.js';

const PREVIEW_MB = 5;

export default async function (input, ctx) {
  const user = ctx.initData?.user;
  if (!user) throw new EndpointError('открой приложение из чата с ботом', { code: 'NO_USER' });
  const note = await store.get(input?.id);
  if (!note?.fileId || note.fileKind !== 'photo' || !canSee(note, groupsOf(input?.cls), user.id)) {
    throw new EndpointError('фото не найдено', { code: 'NOT_FOUND' });
  }
  const bytes = await api.getFileContent(note.fileId);
  if (bytes.length > PREVIEW_MB * 1024 * 1024) throw new EndpointError('фото слишком большое для превью', { code: 'TOO_BIG' });
  return { type: 'image/jpeg', data: toBase64(bytes) };
}
