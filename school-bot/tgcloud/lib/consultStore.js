// lib/consultStore — свои консультации и еженедельные напоминания в базе.

import { db } from 'sdk';
import { and, asc, eq } from 'sdk/db';
import { consults, weekly } from '../schema.js';
import { consultByKey, nextWeekly, weeklySlot } from './consults.js';

const CONSULT_FIELDS = { id: consults.id, title: consults.title, weekday: consults.weekday, start: consults.start, end: consults.end };
const WEEKLY_FIELDS = { key: weekly.key, time: weekly.time, weekday: weekly.weekday, minutes: weekly.minutes, at: weekly.at };

/** Свои консультации человека (строки базы). */
export function myConsults(userId) {
  return db.select(CONSULT_FIELDS).from(consults).where(eq(consults.userId, userId)).orderBy(asc(consults.weekday), asc(consults.start)).all();
}

export async function addConsult(userId, { title, weekday, start, end }) {
  const [row] = await db.insert(consults).values({ userId, title: title.trim(), weekday, start, end }).returning(CONSULT_FIELDS);
  return row;
}

/** Удалить свою консультацию (и напоминание о ней). true — удалили. */
export async function deleteConsult(userId, id) {
  const res = await db.delete(consults).where(and(eq(consults.id, id), eq(consults.userId, userId))).run();
  await db.delete(weekly).where(and(eq(weekly.userId, userId), eq(weekly.key, `my:${id}`))).run();
  return res.rowsAffected > 0;
}

/** Еженедельные напоминания человека. */
export function weeklyOf(userId) {
  return db.select(WEEKLY_FIELDS).from(weekly).where(eq(weekly.userId, userId)).all();
}

/** Включить (time) или выключить (time = null) еженедельное напоминание о консультации key. */
export async function setWeekly(userId, key, weekday, time, nowMs = Date.now()) {
  if (!time) {
    await db.delete(weekly).where(and(eq(weekly.userId, userId), eq(weekly.key, key))).run();
    return null;
  }
  const consult = consultByKey(key, key.startsWith('my:') ? await myConsults(userId) : []);
  if (!consult) throw new Error('NOT_FOUND');
  const slot = weeklySlot(consult, weekday, time);
  if (!slot) throw new Error('BAD_TIME');
  const at = nextWeekly(slot, nowMs);
  const values = { time, weekday: slot.weekday, minutes: slot.minutes, at };
  await db.insert(weekly).values({ userId, key, ...values })
    .onConflictDoUpdate({ target: [weekly.userId, weekly.key], set: values }).run();
  return { key, ...values };
}
