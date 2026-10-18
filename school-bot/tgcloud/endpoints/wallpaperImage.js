// POST /api/wallpaperImage — своё фото-обои этого человека (base64). Чужие получить нельзя:
// берём только обои того, кто спрашивает.

import { EndpointError, api } from 'sdk';
import { toBase64 } from '../lib/files.js';
import { getWallpaper } from '../lib/wallpapers.js';

export default async function (input, ctx) {
  const id = ctx.initData?.user?.id;
  if (!id) throw new EndpointError('открой приложение из чата с ботом', { code: 'NO_USER' });
  const wall = await getWallpaper(id);
  if (wall.kind !== 'photo' || !wall.fileId) throw new EndpointError('своих обоев нет', { code: 'NOT_FOUND' });
  const bytes = await api.getFileContent(wall.fileId);
  return { fileId: wall.fileId, type: 'image/jpeg', data: toBase64(bytes) };
}
