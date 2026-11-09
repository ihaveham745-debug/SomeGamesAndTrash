// lib/store — база. Интерфейс, который ждёт lib/app.js (в тестах его заменяет объект в памяти).

import { db } from 'sdk';
import { and, asc, desc, eq } from 'sdk/db';
import { friends, ops, requests, users } from '../schema.js';

export const store = {
  getUser: (userId) => db.select().from(users).where(eq(users.userId, userId)).get(),
  async putUser({ userId, name, username }) {
    await db.insert(users).values({ userId, name, username })
      .onConflictDoUpdate({ target: users.userId, set: { name, username } }).run();
  },
  async setTerms(userId, { graceDays, apr }) {
    await db.update(users).set({ graceDays, apr }).where(eq(users.userId, userId)).run();
  },
  userByInvite: (token) => db.select().from(users).where(eq(users.inviteToken, token)).get(),
  async setInvite(userId, token) {
    await db.update(users).set({ inviteToken: token }).where(eq(users.userId, userId)).run();
  },
  async setPending(userId, pending) {
    await db.update(users).set({ pending }).where(eq(users.userId, userId)).run();
  },

  friend: (id) => db.select().from(friends).where(eq(friends.id, id)).get(),
  friendByName: (ownerId, nameKey) => db.select().from(friends).where(and(eq(friends.ownerId, ownerId), eq(friends.nameKey, nameKey))).get(),
  friendByToken: (token) => db.select().from(friends).where(eq(friends.token, token)).get(),
  friendsOf: (ownerId) => db.select().from(friends).where(eq(friends.ownerId, ownerId)).orderBy(asc(friends.id)).all(),
  /** Где этот человек — подключённый друг (его долги у разных людей). */
  linkedTo: (userId) => db.select().from(friends).where(eq(friends.linkedUserId, userId)).all(),
  async addFriend({ ownerId, name, nameKey, token }) {
    await db.insert(friends).values({ ownerId, name, nameKey, token }).onConflictDoNothing().run();
    return store.friendByName(ownerId, nameKey);
  },
  async linkFriend(id, userId) {
    await db.update(friends).set({ linkedUserId: userId }).where(eq(friends.id, id)).run();
  },
  async removeFriend(id) {
    await db.delete(ops).where(eq(ops.friendId, id)).run();
    await db.delete(friends).where(eq(friends.id, id)).run();
  },

  opsOf: (friendId) => db.select().from(ops).where(eq(ops.friendId, friendId)).orderBy(asc(ops.id)).all(),
  opsOfOwner: (ownerId) => db.select().from(ops).where(eq(ops.ownerId, ownerId)).all(),
  async addOp({ ownerId, friendId, kind, amount, note, at, due = null, apr = null }) {
    await db.insert(ops).values({ ownerId, friendId, kind, amount, note, at, due, apr }).run();
  },
  /** Убрать последнюю запись друга → она или null. */
  async undoOp(friendId) {
    const last = await db.select().from(ops).where(eq(ops.friendId, friendId)).orderBy(desc(ops.id)).get();
    if (last) await db.delete(ops).where(eq(ops.id, last.id)).run();
    return last ?? null;
  },

  request: (id) => db.select().from(requests).where(eq(requests.id, id)).get(),
  async addRequest(r) {
    const [row] = await db.insert(requests).values(r).returning({ id: requests.id });
    return row.id;
  },
  async setRequestMsg(id, ownerMsgId) {
    await db.update(requests).set({ ownerMsgId }).where(eq(requests.id, id)).run();
  },
  /** Ответить на заявку, только если она ещё ждёт. true — ответили (двое не ответят дважды). */
  async closeRequest(id, status) {
    const res = await db.update(requests).set({ status })
      .where(and(eq(requests.id, id), eq(requests.status, 'pending'))).run();
    return res.rowsAffected > 0;
  },
  /** Ждущие ответа заявки: ко мне (ownerId) или мои (userId). */
  pendingTo: (ownerId) => db.select().from(requests).where(and(eq(requests.ownerId, ownerId), eq(requests.status, 'pending'))).orderBy(asc(requests.id)).all(),
  pendingFrom: (userId) => db.select().from(requests).where(and(eq(requests.userId, userId), eq(requests.status, 'pending'))).orderBy(asc(requests.id)).all(),
};
