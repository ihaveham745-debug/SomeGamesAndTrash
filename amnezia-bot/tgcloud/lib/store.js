// lib/store — база: настройки, семья, ключи. Интерфейс, который ждёт lib/app.js
// (в тестах его заменяет простой объект в памяти).

import { db } from 'sdk';
import { and, asc, eq } from 'sdk/db';
import { members, settings, vpnKeys } from '../schema.js';

export const store = {
  async getSetting(key) {
    return (await db.select().from(settings).where(eq(settings.key, key)).get())?.value ?? null;
  },
  async setSetting(key, value) {
    await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
  },
  /** Записать, только если ещё нет. true — записали. */
  async claimSetting(key, value) {
    const res = await db.insert(settings).values({ key, value }).onConflictDoNothing().run();
    return res.rowsAffected > 0;
  },

  getMember: (userId) => db.select().from(members).where(eq(members.userId, userId)).get(),
  members: () => db.select().from(members).orderBy(asc(members.created)).all(),
  async putMember({ userId, name, username, status }) {
    await db.insert(members).values({ userId, name, username, status })
      .onConflictDoUpdate({ target: members.userId, set: { name, username, status } }).run();
  },
  async removeMember(userId) {
    await db.delete(members).where(eq(members.userId, userId)).run();
  },

  keys: (userId) => db.select().from(vpnKeys).where(eq(vpnKeys.userId, userId)).all(),
  allKeys: () => db.select().from(vpnKeys).all(),
  /** Новый ключ устройства. false — у устройства ключ уже есть (два нажатия сразу). */
  async addKey({ userId, device, clientId, clientName }) {
    const res = await db.insert(vpnKeys).values({ userId, device, clientId, clientName }).onConflictDoNothing().run();
    return res.rowsAffected > 0;
  },
  /** Заменить ключ, только если он всё ещё oldClientId. false — его уже поменяли. */
  async replaceKey({ userId, device, oldClientId, clientId, clientName }) {
    const res = await db.update(vpnKeys).set({ clientId, clientName })
      .where(and(eq(vpnKeys.userId, userId), eq(vpnKeys.device, device), eq(vpnKeys.clientId, oldClientId))).run();
    return res.rowsAffected > 0;
  },
  async removeKey(userId, device) {
    await db.delete(vpnKeys).where(and(eq(vpnKeys.userId, userId), eq(vpnKeys.device, device))).run();
  },
};
