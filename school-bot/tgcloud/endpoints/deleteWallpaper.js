// POST /api/deleteWallpaper — удалить своё фото-обои (только свои: берём того, кто спрашивает).

import { EndpointError } from 'sdk';
import { deletePhoto } from '../lib/wallpapers.js';

export default async function (input, ctx) {
  const id = ctx.initData?.user?.id;
  if (!id) throw new EndpointError('открой приложение из чата с ботом', { code: 'NO_USER' });
  return deletePhoto(id);
}
