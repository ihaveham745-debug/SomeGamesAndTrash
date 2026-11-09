// lib/app — что бот делает на сообщения и кнопки. Без 'sdk': всё внешнее приходит в deps,
// поэтому логику проверяют тесты (test/bot.test.js).
//
// deps = {
//   store,  — база (lib/store.js);
//   tg: { send(chatId, text, markup), edit(chatId, msgId, text, markup), answer(queryId, text, alert), setup() },
//   botUsername — для ссылок t.me/<бот>?start=…;
//   now() — unix-секунды; token() — случайная строка для ссылки другу.
// }
//
// Тетрадка у каждого своя: кто записывает — тот и дал в долг (owner). Друг в тетрадке — просто имя;
// если друг открыл свою ссылку, он «подключён»: видит свой долг, получает напоминания и может
// нажать «я вернул» — владелец подтверждает.

import { balanceOf, money, parseAmount, parseEntry, shortDate } from './money.js';

export const BUTTONS = {
  list: '💰 Мне должны',
  mine: '🙈 Я должен',
  help: '❓ Как пользоваться',
};

export const COMMANDS = [
  { command: 'list', description: '💰 Кто мне должен' },
  { command: 'mine', description: '🙈 Кому должен я' },
  { command: 'help', description: '❓ Как пользоваться' },
];

export const DESCRIPTION = '💰 Тетрадка долгов: записываешь «Петя 500 пицца» — бот помнит, кто сколько должен, считает возвраты и напоминает друзьям.';
export const SHORT_DESCRIPTION = '💰 Кто сколько мне должен';

const KEYBOARD = {
  keyboard: [[{ text: BUTTONS.list }], [{ text: BUTTONS.mine }, { text: BUTTONS.help }]],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: 'Петя 500 пицца',
};

export const HELP_TEXT = [
  '💰 <b>Как пользоваться</b>',
  '',
  'Дал в долг — просто напиши кому и сколько:',
  '<code>Петя 500</code> · <code>Петя 1500 кино</code> · <code>Маша 2к</code>',
  '',
  'Вернули:',
  '<code>Петя вернул 200</code> или <code>Петя -200</code> — часть',
  '<code>Петя вернул</code> — всё',
  '',
  `«${BUTTONS.list}» — список и итог. Нажми на друга: история, кнопки «вернул», «напомнить», «отменить».`,
  '',
  '🔗 У каждого друга есть ссылка: перешли её — друг увидит свой долг, получит напоминание',
  'и сможет нажать «я вернул» (ты подтвердишь).',
].join('\n');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function userName(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || (user?.username ? `@${user.username}` : 'Кто-то');
}

const nameKey = (name) => name.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
const cleanName = (name) => name.trim().replace(/\s+/g, ' ').replace(/^./, (c) => c.toUpperCase());
const friendLink = (deps, f) => `https://t.me/${deps.botUsername}?start=f_${f.token}`;

// --- Сообщения ---

const COMMAND = /^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i;

export async function handleMessage(message, deps) {
  const chat = message.chat;
  const user = message.from;
  if (chat?.type !== 'private' || !user || user.is_bot) return undefined; // тетрадка личная — только в личке
  const text = (message.text ?? '').trim();
  const m = COMMAND.exec(text);
  const cmd = m?.[1].toLowerCase();
  const args = m?.[2]?.trim() ?? '';
  await deps.store.putUser({ userId: user.id, name: userName(user), username: user.username ?? null });
  const me = await deps.store.getUser(user.id);

  if (cmd === 'start' && args.startsWith('f_')) return linkFriend(chat.id, user, args.slice(2), deps);
  if (cmd === 'start') {
    await deps.store.setPending(user.id, null);
    await deps.tg.setup?.();
    return deps.tg.send(chat.id, `👋 Привет! Я тетрадка долгов.\n\n${HELP_TEXT}`, KEYBOARD);
  }
  if (cmd === 'help' || text === BUTTONS.help) return deps.tg.send(chat.id, HELP_TEXT, KEYBOARD);
  if (cmd === 'list' || text === BUTTONS.list) {
    await deps.store.setPending(user.id, null);
    return deps.tg.send(chat.id, ...await listView(user.id, deps));
  }
  if (cmd === 'mine' || text === BUTTONS.mine) return deps.tg.send(chat.id, ...await mineView(user.id, deps));
  if (cmd) return deps.tg.send(chat.id, HELP_TEXT, KEYBOARD);

  // Бот ждёт сумму (после кнопок «вернул часть» / «дал ещё»)
  const pending = me?.pending ? { ...me.pending } : null;
  if (pending?.friendId) {
    // «300» или «300 такси»
    const parsed = parseAmount(text) !== null ? { amount: parseAmount(text), note: '' } : parseEntry(`x ${text}`);
    const amount = parsed?.kind === 'return' ? null : parsed?.amount ?? null;
    const friend = await deps.store.friend(pending.friendId);
    if (amount !== null && friend?.ownerId === user.id) {
      await deps.store.setPending(user.id, null);
      const kind = pending.kind === 'part' ? 'return' : 'lend';
      return record(chat.id, user, friend, kind, amount, kind === 'lend' ? parsed.note : '', deps);
    }
    if (amount === null && /^[\d\s.,]+$/.test(text)) return deps.tg.send(chat.id, '🤔 Не понял сумму. Напиши числом, например <code>300</code>.');
    await deps.store.setPending(user.id, null); // написали что-то другое — забываем
  }

  const entry = parseEntry(text);
  if (!entry) {
    return deps.tg.send(chat.id, `🤔 Не понял. Напиши, например, <code>Петя 500</code> — дал Пете 500 ₽, или <code>Петя вернул 200</code>.\n\nПодробно — «${BUTTONS.help}».`, KEYBOARD);
  }
  const key = nameKey(entry.name);
  let friend = await deps.store.friendByName(user.id, key);
  if (!friend) {
    if (entry.kind === 'return') return deps.tg.send(chat.id, `🤔 В тетрадке нет «${esc(entry.name)}». Кто тебе должен — «${BUTTONS.list}».`);
    friend = await deps.store.addFriend({ ownerId: user.id, name: cleanName(entry.name), nameKey: key, token: deps.token() });
  }
  let amount = entry.amount;
  if (amount === null) {
    amount = balanceOf(await deps.store.opsOf(friend.id));
    if (amount <= 0) return deps.tg.send(chat.id, `✅ ${esc(friend.name)} тебе ничего не должен(а).`);
  }
  return record(chat.id, user, friend, entry.kind, amount, entry.note, deps);
}

/** Записать выдачу/возврат, ответить владельцу и сообщить подключённому другу. */
async function record(chatId, owner, friend, kind, amount, note, deps) {
  await deps.store.addOp({ ownerId: owner.id, friendId: friend.id, kind, amount, note: note || null, at: deps.now() });
  const balance = balanceOf(await deps.store.opsOf(friend.id));
  const what = kind === 'lend'
    ? `➕ Записал: ${esc(friend.name)} — ${money(amount)}${note ? ` (${esc(note)})` : ''}`
    : `↩️ ${esc(friend.name)} вернул(а) ${money(amount)}`;
  const total = balance > 0 ? `Всего должен(а): <b>${money(balance)}</b>` : balance < 0 ? `Переплата: ${money(-balance)} — теперь ты должен(а) ${esc(friend.name)}` : '🎉 Долг закрыт!';
  await deps.tg.send(chatId, `${what}\n${total}`, {
    inline_keyboard: [[{ text: `📒 ${friend.name}`, callback_data: `f:${friend.id}` }, { text: '↩️ Отменить', callback_data: `undo:${friend.id}` }]],
  });
  if (friend.linkedUserId) {
    const ownerName = esc(userName(owner));
    const msg = kind === 'lend'
      ? `📒 ${ownerName} записал(а): ты взял(а) ${money(amount)}${note ? ` (${esc(note)})` : ''}.`
      : `📒 ${ownerName} отметил(а): ты вернул(а) ${money(amount)}.`;
    await deps.tg.send(friend.linkedUserId, `${msg}\n${balance > 0 ? `Ты должен(а): <b>${money(balance)}</b>` : '🎉 Ты ничего не должен(а).'}`);
  }
  return undefined;
}

// --- Виды ---

/** Список «мне должны» → [text, markup]. */
export async function listView(ownerId, deps) {
  const [list, all] = await Promise.all([deps.store.friendsOf(ownerId), deps.store.opsOfOwner(ownerId)]);
  const rows = list.map((f) => ({ f, balance: balanceOf(all.filter((o) => o.friendId === f.id)) }));
  const owing = rows.filter((r) => r.balance !== 0).sort((a, b) => b.balance - a.balance);
  const closed = rows.filter((r) => r.balance === 0);
  if (rows.length === 0) return [`📒 Тетрадка пустая.\n\nДал в долг — напиши, например, <code>Петя 500</code>.`, KEYBOARD];
  const total = owing.reduce((s, r) => s + Math.max(r.balance, 0), 0);
  const text = [
    owing.length ? `💰 <b>Тебе должны: ${money(total)}</b>` : '🎉 <b>Тебе никто не должен</b>',
    '',
    ...owing.map((r) => (r.balance > 0 ? `• ${esc(r.f.name)} — ${money(r.balance)}` : `• ${esc(r.f.name)} — ты должен(а) ${money(-r.balance)}`)),
    ...(closed.length ? ['', `<i>Вернули всё: ${closed.map((r) => esc(r.f.name)).join(', ')}</i>`] : []),
  ].join('\n');
  const buttons = [...owing, ...closed].map((r) => [{ text: `${r.f.name}${r.balance ? ` · ${money(r.balance)}` : ' ✓'}`, callback_data: `f:${r.f.id}` }]);
  return [text, { inline_keyboard: buttons }];
}

/** Карточка друга → [text, markup]. */
export async function friendView(friend, deps) {
  const list = await deps.store.opsOf(friend.id);
  const balance = balanceOf(list);
  const history = list.slice(-12).map((o) => `${shortDate(o.at)} ${o.kind === 'lend' ? '➕' : '↩️'} ${money(o.amount)}${o.note ? ` · ${esc(o.note)}` : ''}`);
  const text = [
    `📒 <b>${esc(friend.name)}</b>`,
    balance > 0 ? `Должен(а): <b>${money(balance)}</b>` : balance < 0 ? `Переплата: ${money(-balance)}` : '🎉 Ничего не должен(а)',
    friend.linkedUserId ? '🔗 подключён(а) — видит долг и получает напоминания' : '',
    '',
    ...(history.length ? [list.length > 12 ? '<i>последние записи:</i>' : '<i>история:</i>', ...history] : ['<i>записей нет</i>']),
  ].filter((l, i) => l !== '' || i > 2).join('\n');
  const id = friend.id;
  const rows = [];
  if (balance > 0) rows.push([{ text: '✅ Вернул(а) всё', callback_data: `all:${id}` }, { text: '↩️ Вернул(а) часть', callback_data: `part:${id}` }]);
  rows.push([{ text: '➕ Дал(а) ещё', callback_data: `more:${id}` }, { text: '🔔 Напомнить', callback_data: `nudge:${id}` }]);
  rows.push([{ text: '🔗 Ссылка для друга', callback_data: `link:${id}` }, { text: '↩️ Отменить последнее', callback_data: `undo:${id}` }]);
  rows.push([{ text: '⬅️ Все', callback_data: 'home' }, { text: '🗑 Удалить', callback_data: `del:${id}` }]);
  return [text, { inline_keyboard: rows }];
}

/** «Я должен» — долги, где я подключённый друг → [text, markup]. */
export async function mineView(userId, deps) {
  const links = await deps.store.linkedTo(userId);
  const rows = [];
  for (const f of links) {
    const balance = balanceOf(await deps.store.opsOf(f.id));
    if (balance <= 0) continue;
    const owner = await deps.store.getUser(f.ownerId);
    rows.push({ f, balance, ownerName: owner?.name ?? 'кто-то' });
  }
  if (rows.length === 0) return ['🙈 Ты никому не должен(а) — по крайней мере, в этом боте.', KEYBOARD];
  const text = ['🙈 <b>Ты должен(а)</b>', '', ...rows.map((r) => `• ${esc(r.ownerName)} — ${money(r.balance)}`)].join('\n');
  return [text, { inline_keyboard: rows.map((r) => [{ text: `💸 Я вернул(а) ${r.ownerName} ${money(r.balance)}`, callback_data: `paid:${r.f.id}` }]) }];
}

// --- Друг открыл ссылку ---

async function linkFriend(chatId, user, token, deps) {
  const friend = await deps.store.friendByToken(token);
  if (!friend) return deps.tg.send(chatId, '🤔 Ссылка устарела. Попроси новую.', KEYBOARD);
  if (friend.ownerId === user.id) return deps.tg.send(chatId, '🙂 Это ссылка для друга — перешли её ему.', KEYBOARD);
  if (friend.linkedUserId && friend.linkedUserId !== user.id) return deps.tg.send(chatId, '🤔 По этой ссылке уже подключился другой человек.', KEYBOARD);
  const isNew = !friend.linkedUserId;
  await deps.store.linkFriend(friend.id, user.id);
  const owner = await deps.store.getUser(friend.ownerId);
  const balance = balanceOf(await deps.store.opsOf(friend.id));
  if (isNew) {
    await deps.tg.send(friend.ownerId, `🔗 ${esc(friend.name)} подключился(ась) — теперь видит свой долг и получает напоминания.`);
  }
  await deps.tg.send(chatId, `👋 Привет! Это тетрадка долгов ${esc(owner?.name ?? '')}.`, KEYBOARD);
  if (balance <= 0) return deps.tg.send(chatId, `🎉 Ты ничего не должен(а) ${esc(owner?.name ?? '')}.`);
  return deps.tg.send(chatId, ...await mineView(user.id, deps));
}

// --- Кнопки ---

export async function handleCallback(query, deps) {
  const user = query.from;
  const chatId = query.message?.chat?.id;
  const msgId = query.message?.message_id;
  const [action, arg = '', extra = ''] = String(query.data ?? '').split(':');
  const answer = (text = '', alert = false) => deps.tg.answer(query.id, text, alert);
  const edit = (text, markup) => deps.tg.edit(chatId, msgId, text, markup);

  if (action === 'home') {
    await answer();
    return edit(...await listView(user.id, deps));
  }
  const friend = await deps.store.friend(Number(arg));
  if (!friend) {
    await answer('Этой записи уже нет', true);
    return undefined;
  }

  // Кнопки подключённого друга и ответ владельца на «я вернул»
  if (action === 'paid') return paidAction(friend, user, answer, edit, deps);
  if (action === 'ok' || action === 'nope') {
    if (friend.ownerId !== user.id) return answer('Это не твоя тетрадка', true);
    const amount = Number(extra);
    if (action === 'nope') {
      await answer();
      await edit(`❌ Не подтверждено: ${esc(friend.name)} — ${money(amount)}.`);
      if (friend.linkedUserId) await deps.tg.send(friend.linkedUserId, `❌ ${esc(userName(user))} не подтвердил(а) возврат ${money(amount)}. Напиши ему/ей лично.`);
      return undefined;
    }
    await answer('Записал');
    await edit(`✅ Подтверждено: ${esc(friend.name)} вернул(а) ${money(amount)}.`);
    return record(chatId, user, friend, 'return', amount, '', deps);
  }

  if (friend.ownerId !== user.id) return answer('Это не твоя тетрадка', true);
  const id = friend.id;

  if (action === 'f') {
    await deps.store.setPending(user.id, null);
    await answer();
    return edit(...await friendView(friend, deps));
  }
  if (action === 'all') {
    const balance = balanceOf(await deps.store.opsOf(id));
    if (balance <= 0) return answer('Долга уже нет');
    await answer('Записал');
    await record(chatId, user, friend, 'return', balance, '', deps);
    return edit(...await friendView(friend, deps));
  }
  if (action === 'part' || action === 'more') {
    await deps.store.setPending(user.id, { kind: action, friendId: id });
    await answer();
    return deps.tg.send(chatId, action === 'part'
      ? `↩️ Сколько вернул(а) ${esc(friend.name)}? Напиши сумму, например <code>300</code>.`
      : `➕ Сколько ещё дал(а) ${esc(friend.name)}? Напиши сумму — можно с пометкой: <code>300 такси</code>.`);
  }
  if (action === 'undo') {
    const last = await deps.store.undoOp(id);
    if (!last) return answer('Отменять нечего', true);
    await answer(`Отменил: ${last.kind === 'lend' ? '➕' : '↩️'} ${money(last.amount)}`);
    if (friend.linkedUserId) {
      await deps.tg.send(friend.linkedUserId, `📒 ${esc(userName(user))} отменил(а) запись ${last.kind === 'lend' ? '➕' : '↩️'} ${money(last.amount)}. Ты должен(а): <b>${money(Math.max(balanceOf(await deps.store.opsOf(id)), 0))}</b>`);
    }
    return edit(...await friendView(friend, deps));
  }
  if (action === 'link') {
    await answer();
    return deps.tg.send(chatId, `🔗 Ссылка для ${esc(friend.name)} — перешли её:\n${friendLink(deps, friend)}\n\nОткрыв её, ${esc(friend.name)} увидит свой долг, будет получать напоминания и сможет нажать «я вернул».`);
  }
  if (action === 'nudge') {
    const balance = balanceOf(await deps.store.opsOf(id));
    if (balance <= 0) return answer(`${friend.name} ничего не должен(а)`, true);
    if (!friend.linkedUserId) {
      await answer();
      return deps.tg.send(chatId, `🔔 ${esc(friend.name)} ещё не подключён(а) к боту — напомнить сам я не могу. Перешли ему/ей ссылку, и дальше напоминания будут приходить:\n${friendLink(deps, friend)}\n\nИли просто перешли это:\n<i>Привет! Напоминаю про долг ${money(balance)} 🙂</i>`);
    }
    await deps.tg.send(friend.linkedUserId, `🔔 ${esc(userName(user))} напоминает: ты должен(а) <b>${money(balance)}</b>.`, {
      inline_keyboard: [[{ text: `💸 Я вернул(а) ${money(balance)}`, callback_data: `paid:${id}` }]],
    });
    return answer(`Напомнил ${friend.name}`);
  }
  if (action === 'del') {
    await answer();
    return edit(`🗑 Удалить ${esc(friend.name)} и всю историю?`, {
      inline_keyboard: [[{ text: '🗑 Да, удалить', callback_data: `del!:${id}` }, { text: '↩️ Нет', callback_data: `f:${id}` }]],
    });
  }
  if (action === 'del!') {
    await deps.store.removeFriend(id);
    await answer(`${friend.name} удалён(а)`);
    return edit(...await listView(user.id, deps));
  }
  return answer();
}

/** Друг нажал «я вернул» — спрашиваем владельца. */
async function paidAction(friend, user, answer, edit, deps) {
  if (friend.linkedUserId !== user.id) return answer('Это не твой долг', true);
  const balance = balanceOf(await deps.store.opsOf(friend.id));
  if (balance <= 0) return answer('Ты уже ничего не должен(а) 🎉', true);
  await deps.tg.send(friend.ownerId, `💸 ${esc(friend.name)} говорит, что вернул(а) <b>${money(balance)}</b>. Подтвердить?`, {
    inline_keyboard: [[
      { text: '✅ Да, вернул(а)', callback_data: `ok:${friend.id}:${balance}` },
      { text: '❌ Нет', callback_data: `nope:${friend.id}:${balance}` },
    ]],
  });
  await answer('Спросил — как подтвердит, напишу');
  return edit(`⏳ Спросил, подтвердит ли возврат ${money(balance)}. Как ответит — напишу.`);
}
