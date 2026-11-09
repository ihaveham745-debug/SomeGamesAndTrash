// lib/api — действия Mini App (эндпоинты endpoints/*.js вызывают apiCall). Без 'sdk' — проверяется тестами.
// Те же записи и уведомления другу, что у бота (lib/app.js), только без сообщений владельцу в чат:
// он и так видит всё в приложении.
//
// Ответ почти всех действий — state(): всё, что нужно приложению, чтобы перерисоваться.
// Долг и проценты приложение считает само тем же lib/loans.js — по записям ops.

import { askPaid, cleanName, friendLink, loanTerms, nameKey, nudgeFriend, owed, record, userName, userTerms } from './app.js';
import { MAX_APR, MAX_GRACE_DAYS } from './loans.js';
import { createRequest, decideRequest, inviteLink } from './requests.js';
import { MAX_AMOUNT, untilToUnix } from './money.js';

export class ApiError extends Error {}

const OP_FIELDS = ({ id, kind, amount, note, at, due, rate, apr }) => ({ id, kind, amount, note, at, due, rate, apr });

/**
 * Всё для приложения: мои условия, мои друзья с записями, мои долги другим,
 * заявки ко мне (requests) и мои заявки (myRequests), ссылка для заявок.
 */
export async function state(userId, deps) {
  const [me, list, all, links, incoming, outgoing] = await Promise.all([
    deps.store.getUser(userId), deps.store.friendsOf(userId), deps.store.opsOfOwner(userId), deps.store.linkedTo(userId),
    deps.store.pendingTo(userId), deps.store.pendingFrom(userId),
  ]);
  const nameOf = async (id) => (await deps.store.getUser(id))?.name ?? 'кто-то';
  const mine = [];
  for (const f of links) {
    const owner = await deps.store.getUser(f.ownerId);
    mine.push({
      friendId: f.id, ownerId: f.ownerId, ownerName: owner?.name ?? 'кто-то', ownerTerms: userTerms(owner),
      ops: (await deps.store.opsOf(f.id)).map(OP_FIELDS),
    });
  }
  const requests = [];
  for (const r of incoming) {
    const friend = list.find((f) => f.linkedUserId === r.userId);
    requests.push({ id: r.id, name: await nameOf(r.userId), friendId: friend?.id ?? null, amount: r.amount, note: r.note, terms: r.terms, created: r.created });
  }
  const myRequests = [];
  for (const r of outgoing) myRequests.push({ id: r.id, ownerId: r.ownerId, ownerName: await nameOf(r.ownerId), amount: r.amount, note: r.note });
  return {
    now: deps.now(),
    terms: userTerms(me),
    inviteLink: await inviteLink(userId, deps),
    friends: list.map((f) => ({
      id: f.id, name: f.name, linked: Boolean(f.linkedUserId), link: friendLink(deps, f),
      ops: all.filter((o) => o.friendId === f.id).map(OP_FIELDS),
    })),
    mine,
    requests,
    myRequests,
  };
}

function amountOf(value) {
  const amount = Math.round(Number(value));
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) throw new ApiError('Неверная сумма');
  return amount;
}

async function ownFriend(userId, friendId, deps) {
  const friend = await deps.store.friend(Number(friendId));
  if (!friend || friend.ownerId !== userId) throw new ApiError('Такого друга в тетрадке нет');
  return friend;
}

const cleanNote = (note) => String(note ?? '').trim().replace(/\s+/g, ' ').slice(0, 100);

/** Условия займа из приложения: { days } | { until: 'ДД.ММ' } | { free: true } | ничего — общие. */
function termsInput(t) {
  if (!t || typeof t !== 'object') return null;
  if (t.free) return { free: true };
  if (t.until && /^\d{1,2}\.\d{1,2}$/.test(t.until)) return { until: t.until };
  const days = Number(t.days);
  if (Number.isInteger(days) && days >= 0 && days <= MAX_GRACE_DAYS) return { days };
  return null;
}

/** user — Telegram-пользователь из initData. */
export async function apiCall(name, input, user, deps) {
  if (!user?.id) throw new ApiError('Открой приложение из чата с ботом');
  await deps.store.putUser({ userId: user.id, name: userName(user), username: user.username ?? null });
  const me = await deps.store.getUser(user.id);
  const id = user.id;

  switch (name) {
    case 'state':
      break;

    case 'lend': { // { friendId } или { name }, amount (копейки), note, terms
      const amount = amountOf(input.amount);
      let friend;
      if (input.friendId) {
        friend = await ownFriend(id, input.friendId, deps);
      } else {
        const display = cleanName(String(input.name ?? ''));
        if (!display || display.length > 40) throw new ApiError('Напиши имя');
        friend = await deps.store.friendByName(id, nameKey(display))
          ?? await deps.store.addFriend({ ownerId: id, name: display, nameKey: nameKey(display), token: deps.token() });
      }
      const terms = termsInput(input.terms);
      if (terms?.until && !untilToUnix(terms.until, deps.now())) throw new ApiError('Неверная дата');
      await record(id, user, friend, 'lend', amount, cleanNote(input.note), deps, loanTerms(me, terms, deps.now()), true);
      break;
    }

    case 'repay': { // { friendId, amount } — amount не задан: всё вместе с процентами
      const friend = await ownFriend(id, input.friendId, deps);
      const amount = input.amount == null ? (await owed(deps, friend.id)).total : amountOf(input.amount);
      if (amount <= 0) throw new ApiError(`${friend.name} ничего не должен(а)`);
      await record(id, user, friend, 'return', amount, '', deps, null, true);
      break;
    }

    case 'undo': {
      const friend = await ownFriend(id, input.friendId, deps);
      if (!(await deps.store.undoOp(friend.id))) throw new ApiError('Отменять нечего');
      break;
    }

    case 'removeFriend': {
      const friend = await ownFriend(id, input.friendId, deps);
      await deps.store.removeFriend(friend.id);
      break;
    }

    case 'setTerms': {
      const graceDays = Number(input.graceDays);
      const apr = Math.round(Number(input.apr));
      if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > MAX_GRACE_DAYS) throw new ApiError(`Дней без процентов — от 0 до ${MAX_GRACE_DAYS}`);
      if (!Number.isInteger(apr) || apr < 0 || apr > MAX_APR) throw new ApiError('Процент годовых — от 0 до 1000');
      await deps.store.setTerms(id, { graceDays, apr });
      break;
    }

    case 'nudge': {
      const friend = await ownFriend(id, input.friendId, deps);
      if ((await owed(deps, friend.id)).total <= 0) throw new ApiError(`${friend.name} ничего не должен(а)`);
      if (!friend.linkedUserId) return { sent: false, link: friendLink(deps, friend) };
      await nudgeFriend(friend, user, deps);
      return { sent: true };
    }

    case 'paid': { // друг: «я вернул всё»
      const friend = await deps.store.friend(Number(input.friendId));
      if (!friend || friend.linkedUserId !== id) throw new ApiError('Это не твой долг');
      const amount = await askPaid(friend, deps);
      if (!amount) throw new ApiError('Ты уже ничего не должен(а)');
      return { asked: amount };
    }

    case 'decide': { // владелец: { requestId, approve }
      const res = await decideRequest(Number(input.requestId), user, Boolean(input.approve), deps);
      if (!res.done) throw new ApiError(res.text);
      break;
    }

    case 'ask': { // друг просит ещё у владельца, к тетрадке которого подключён: { ownerId, amount, note, terms }
      const ownerId = Number(input.ownerId);
      if (!(await deps.store.linkedTo(id)).some((f) => f.ownerId === ownerId)) throw new ApiError('Попроси у друга ссылку для заявок');
      const res = await createRequest(ownerId, user, { amount: amountOf(input.amount), note: cleanNote(input.note), terms: termsInput(input.terms) }, deps);
      if (res.error) throw new ApiError(res.error);
      break;
    }

    default:
      throw new ApiError('Неизвестное действие');
  }
  return state(id, deps);
}
