// lib/requests — заявки «дай в долг»: друг сам просит, владелец тетрадки одобряет или отказывает.
// Без 'sdk' — проверяется тестами. Пользуются и бот (lib/app.js), и Mini App (lib/api.js).
//
// Как друг попадает к владельцу: по ссылке для заявок t.me/<бот>?start=r_<inviteToken> (или, если он уже
// подключён к тетрадке владельца, — кнопкой «попросить ещё»). Одобрили — займ записывается по условиям
// владельца (или тем, что попросил друг: «на 14 дней», «до 25.11»), а друг подключается к тетрадке.

import { cleanName, esc, loanTerms, nameKey, owed, record, termsText, userName, userTerms, userTermsText } from './app.js';
import { money, parseAmount, parseEntry } from './money.js';

export const inviteUrl = (deps, token) => `https://t.me/${deps.botUsername}?start=r_${token}`;

/** Ссылка для заявок владельца (токен создаём при первом запросе). */
export async function inviteLink(ownerId, deps) {
  const me = await deps.store.getUser(ownerId);
  let token = me?.inviteToken;
  if (!token) {
    token = deps.token();
    await deps.store.setInvite(ownerId, token);
  }
  return inviteUrl(deps, token);
}

/** '500' / '500 такси' / '1000 на 14 дней' → { amount, note, terms } или null. */
export function parseAsk(text) {
  const direct = parseAmount(text);
  if (direct !== null) return { amount: direct, note: '', terms: null };
  const e = parseEntry(`x ${text}`);
  if (!e || e.kind !== 'lend' || !e.amount) return null;
  return { amount: e.amount, note: e.note, terms: e.terms ?? null };
}

/** Текст «что просят» для владельца и друга. */
function askText(r, owner, now) {
  const t = loanTerms(owner, r.terms, now);
  return `<b>${money(r.amount)}</b>${r.note ? ` (${esc(r.note)})` : ''}\n⏳ ${termsText(t.due, t.apr)}`;
}

/** Условия владельца для друга перед заявкой. */
export async function askPrompt(owner, deps) {
  return [
    `🙋 Это тетрадка долгов ${esc(owner.name)}.`,
    'Сколько хочешь взять в долг? Напиши сумму — можно с пометкой и сроком:',
    '<code>500</code> · <code>500 такси</code> · <code>1000 на 14 дней</code>',
    '',
    `Условия: ${userTermsText(userTerms(owner))}.`,
    `${esc(owner.name)} получит заявку и одобрит или откажет — я напишу.`,
  ].join('\n');
}

/**
 * Друг (user — Telegram-пользователь) просит у ownerId. ask — { amount, note, terms }.
 * → { id } или { error }.
 */
export async function createRequest(ownerId, user, ask, deps) {
  if (ownerId === user.id) return { error: 'Это твоя тетрадка — у себя занимать не нужно 🙂' };
  const owner = await deps.store.getUser(ownerId);
  if (!owner) return { error: 'Тетрадка не найдена' };
  if ((await deps.store.pendingFrom(user.id)).some((r) => r.ownerId === ownerId)) {
    return { error: `Заявка ${owner.name} уже ждёт ответа — дождись его.` };
  }
  const r = { ownerId, userId: user.id, amount: ask.amount, note: ask.note || null, terms: ask.terms ?? null, status: 'pending', created: deps.now() };
  const id = await deps.store.addRequest(r);

  // сколько он уже должен этому владельцу (если подключён)
  const friend = (await deps.store.friendsOf(ownerId)).find((f) => f.linkedUserId === user.id);
  const debt = friend ? (await owed(deps, friend.id)).total : 0;
  const who = `${esc(userName(user))}${user.username ? ` (@${esc(user.username)})` : ''}`;
  const sent = await deps.tg.send(ownerId, [
    `🙋 <b>Заявка</b>: ${who} просит в долг ${askText(r, owner, deps.now())}`,
    debt > 0 ? `Уже должен(а): ${money(debt)}` : '',
  ].filter(Boolean).join('\n'), {
    inline_keyboard: [[{ text: '✅ Одобрить', callback_data: `rqok:${id}` }, { text: '❌ Отказать', callback_data: `rqno:${id}` }]],
  });
  if (sent?.message_id) await deps.store.setRequestMsg(id, sent.message_id);
  return { id };
}

/** Друг в тетрадке владельца для этого Telegram-пользователя: подключённый — или новый (имя без повторов). */
async function friendFor(ownerId, userId, deps) {
  const list = await deps.store.friendsOf(ownerId);
  const linked = list.find((f) => f.linkedUserId === userId);
  if (linked) return linked;
  const u = await deps.store.getUser(userId);
  const base = cleanName(u?.name ?? 'Друг').slice(0, 30);
  let name = base;
  for (let i = 2; list.some((f) => f.nameKey === nameKey(name)); i++) name = `${base} ${i}`;
  const friend = await deps.store.addFriend({ ownerId, name, nameKey: nameKey(name), token: deps.token() });
  await deps.store.linkFriend(friend.id, userId);
  return { ...friend, linkedUserId: userId };
}

/**
 * Владелец (owner — Telegram-пользователь) отвечает на заявку.
 * → { text } — что написать владельцу (заявку уже закрыли/чужая — тоже текст), approved — одобрена ли.
 */
export async function decideRequest(requestId, owner, approve, deps) {
  const r = await deps.store.request(requestId);
  if (!r || r.ownerId !== owner.id) return { text: 'Такой заявки нет', done: false };
  if (r.status !== 'pending' || !(await deps.store.closeRequest(r.id, approve ? 'approved' : 'declined'))) {
    return { text: 'На эту заявку уже ответили', done: false };
  }
  const ownerRow = await deps.store.getUser(owner.id);
  const asker = await deps.store.getUser(r.userId);
  const what = askText(r, ownerRow, deps.now());
  let text;
  if (approve) {
    const friend = await friendFor(owner.id, r.userId, deps);
    await deps.tg.send(r.userId, `✅ ${esc(userName(owner))} одобрил(а) заявку: ${what}`);
    await record(owner.id, owner, friend, 'lend', r.amount, r.note ?? '', deps, loanTerms(ownerRow, r.terms, deps.now()), true);
    text = `✅ Одобрено: ${esc(friend.name)} — ${what}\nЗаписал в тетрадку.`;
  } else {
    await deps.tg.send(r.userId, `❌ ${esc(userName(owner))} не одобрил(а) заявку на ${money(r.amount)}.`);
    text = `❌ Отказано: ${esc(asker?.name ?? 'друг')} — ${money(r.amount)}.`;
  }
  if (r.ownerMsgId) await deps.tg.edit(owner.id, r.ownerMsgId, text);
  return { text, done: true, approved: approve };
}
