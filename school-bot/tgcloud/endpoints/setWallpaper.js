// POST /api/setWallpaper {kind, file?} — сменить свои обои.
// kind 'photo' — своё фото: file = { name, type, data: base64 } (приложение уже уменьшило его);
// без file — вернуться к уже загруженному своему фото.

import { BotApiError, EndpointError } from 'sdk';
import { MAX_FILE_MB } from '../lib/homework.js';
import { uploadFile } from '../lib/files.js';
import { WALLPAPER_KINDS, getWallpaper, setWallpaper } from '../lib/wallpapers.js';

export default async function (input, ctx) {
  const user = ctx.initData?.user;
  if (!user) throw new EndpointError('открой приложение из чата с ботом', { code: 'NO_USER' });
  const kind = input?.kind;
  if (!WALLPAPER_KINDS.includes(kind)) throw new EndpointError('нет таких обоев', { code: 'INVALID' });
  if (kind !== 'photo') return setWallpaper(user.id, kind);
  if (!input.file) {
    const { fileId } = await getWallpaper(user.id);
    if (!fileId) throw new EndpointError('сначала выбери фото из галереи', { code: 'NO_PHOTO' });
    return setWallpaper(user.id, 'photo');
  }

  if (!/^image\//.test(String(input.file?.type ?? ''))) throw new EndpointError('нужна картинка', { code: 'INVALID' });
  try {
    const { fileId, fileKind } = await uploadFile(user.id, input.file);
    if (fileKind !== 'photo') throw new EndpointError('нужна картинка', { code: 'INVALID' });
    return setWallpaper(user.id, 'photo', fileId);
  } catch (err) {
    if (err.message === 'TOO_BIG') throw new EndpointError(`картинка больше ${MAX_FILE_MB} мб`, { code: 'TOO_BIG' });
    if (err instanceof BotApiError) {
      console.warn('wallpaper upload failed', err.description);
      throw new EndpointError('не получилось загрузить. напиши боту /start и попробуй ещё раз', { code: 'UPLOAD' });
    }
    throw err;
  }
}
