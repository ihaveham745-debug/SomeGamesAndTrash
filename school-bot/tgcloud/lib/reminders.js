// lib/reminders — напоминания о дз: включить/выключить и разослать те, чьё время пришло.
//
// Своего «будильника» у платформы нет, поэтому sendDueReminders() вызывается:
//   • при каждом обращении к боту (сообщение, кнопка, открытие приложения) — «попутно»;
//   • снаружи по расписанию: GitHub Actions раз в 10 минут запускает endpoints/remindTick
//     (.github/workflows/school-reminders.yml).

import { api, db, BotApiError } from 'sdk';
import { and, asc, eq, inArray, lte } from 'sdk/db';
import { reminders } from '../schema.js';
import { canSee, groupsOf, reminderError, unixToLocal } from './homework.js';
import { reminderMessage } from './bot.js';
import { store } from './notes.js';

const STALE_SECONDS = 6 * 3600; // проспали дольше 6 часов — уже не напоминаем
const BATCH = 25;

/**
 * Включить напоминание на момент at (unix-секунды; любой день, время — одно из REMIND_TIMES)
 * или выключить (at = null). Возвращает { at } или { at: null }. Ошибки: 'BAD_TIME' | 'PAST' | 'TOO_FAR'.
 */
export async function setReminder(userId, cls, note, at, nowMs = Date.now()) {
  if (at === null || at === undefined) {
    await db.delete(reminders).where(and(eq(reminders.userId, userId), eq(reminders.noteId, note.id))).run();
    return { at: null };
  }
  const error = reminderError(at, nowMs);
  if (error) throw new Error(error);
  const mode = unixToLocal(at)[1]; // '18:00' — для истории, отправка идёт по at
  await db.insert(reminders).values({ userId, noteId: note.id, cls, mode, at, sent: false })
    .onConflictDoUpdate({ target: [reminders.userId, reminders.noteId], set: { cls, mode, at, sent: false } }).run();
  return { at };
}

/** Включённые и ещё не отправленные напоминания человека: [{ noteId, at }]. */
export function remindersOf(userId) {
  return db.select({ noteId: reminders.noteId, at: reminders.at })
    .from(reminders).where(and(eq(reminders.userId, userId), eq(reminders.sent, false))).all();
}

/** Разослать напоминания, чьё время пришло. Возвращает, сколько отправлено. */
export async function sendDueReminders(nowMs = Date.now()) {
  const now = Math.floor(nowMs / 1000);
  const due = await db.select().from(reminders)
    .where(and(eq(reminders.sent, false), lte(reminders.at, now))).orderBy(asc(reminders.at)).limit(BATCH).all();
  if (!due.length) return 0;
  // Сначала помечаем отправленными: если два вызова пришли одновременно, второй ничего не найдёт.
  const ids = due.map((r) => r.id);
  await db.update(reminders).set({ sent: true }).where(and(inArray(reminders.id, ids), eq(reminders.sent, false))).run();

  let sent = 0;
  for (const r of due) {
    if (now - r.at > STALE_SECONDS) continue;
    const note = await store.get(r.noteId);
    if (!note || !canSee(note, groupsOf(r.cls), r.userId)) continue; // запись удалили или она больше не видна
    const { text, reply_markup } = reminderMessage(r.cls, note, nowMs);
    try {
      await api.sendMessage({ chat_id: r.userId, text, parse_mode: 'HTML', reply_markup });
      sent += 1;
    } catch (err) {
      if (!(err instanceof BotApiError)) throw err;
      console.warn('reminder not delivered', r.userId, err.description); // например, бот заблокирован
    }
  }
  return sent;
}

/** Попутная проверка: ошибки не должны ломать основной ответ бота. */
export async function tickReminders() {
  try {
    await sendDueReminders();
  } catch (err) {
    console.error('reminders tick failed', err);
  }
}
