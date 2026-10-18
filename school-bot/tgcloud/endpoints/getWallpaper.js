// POST /api/getWallpaper — какие обои у этого человека: { kind, fileId }.

import { getWallpaper, DEFAULT_WALLPAPER } from '../lib/wallpapers.js';

export default async function (input, ctx) {
  const id = ctx.initData?.user?.id;
  return id ? getWallpaper(id) : DEFAULT_WALLPAPER;
}
