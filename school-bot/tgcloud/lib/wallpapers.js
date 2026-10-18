// lib/wallpapers — обои в приложении: у каждого свои, меняет только сам себе.

import { db } from 'sdk';
import { eq, sql } from 'sdk/db';
import { wallpapers } from '../schema.js';

export const WALLPAPER_KINDS = ['cats', 'glass', 'photo'];
export const DEFAULT_WALLPAPER = { kind: 'cats', fileId: null };

export async function getWallpaper(userId) {
  const row = await db.select({ kind: wallpapers.kind, fileId: wallpapers.fileId })
    .from(wallpapers).where(eq(wallpapers.userId, userId)).get();
  return row ?? DEFAULT_WALLPAPER;
}

/** fileId не передан — своё фото не трогаем: можно уйти на котиков и потом вернуться к нему. */
export async function setWallpaper(userId, kind, fileId) {
  const set = { kind, updated: sql`(unixepoch())`, ...(fileId !== undefined && { fileId }) };
  await db.insert(wallpapers).values({ userId, kind, fileId: fileId ?? null })
    .onConflictDoUpdate({ target: wallpapers.userId, set }).run();
  return getWallpaper(userId);
}
