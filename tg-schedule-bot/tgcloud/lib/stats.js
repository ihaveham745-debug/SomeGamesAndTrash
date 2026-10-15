// lib/stats — кто пользуется ботом: запись визитов и сводка для /stats.

import { db } from 'sdk';
import { desc, sql } from 'sdk/db';
import { users } from '../schema.js';
import { authorName } from './bot.js';

/** Отметить, что человек пользовался ботом (source 'bot') или открыл Mini App ('app'). */
export async function track(user, source = 'bot') {
  if (!user?.id || user.is_bot) return;
  const now = Math.floor(Date.now() / 1000);
  const name = authorName(user);
  const username = user.username ?? null;
  const app = source === 'app' ? 1 : 0;
  try {
    await db.insert(users)
      .values({ id: user.id, name, username, firstSeen: now, lastSeen: now, hits: 1 - app, appOpens: app })
      .onConflictDoUpdate({
        target: users.id,
        set: { name, username, lastSeen: now, hits: sql`${users.hits} + ${1 - app}`, appOpens: sql`${users.appOpens} + ${app}` },
      })
      .run();
  } catch (err) {
    // Статистика — не повод ломать ответ.
    console.error('track failed', err);
  }
}

/** Данные для /stats: все пользователи (свежие сверху) и сколько записано заданий и заметок. */
export async function stats() {
  const [list, counts] = await Promise.all([
    db.select({
      name: users.name,
      username: users.username,
      firstSeen: users.firstSeen,
      lastSeen: users.lastSeen,
      hits: users.hits,
      appOpens: users.appOpens,
    }).from(users).orderBy(desc(users.lastSeen)).all(),
    db.get(sql`SELECT count(due) AS tasks, count(*) - count(due) AS notes FROM notes`),
  ]);
  return { users: list, tasks: counts?.tasks ?? 0, notes: counts?.notes ?? 0 };
}
