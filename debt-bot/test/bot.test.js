import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BUTTONS, handleCallback, handleMessage } from '../tgcloud/lib/app.js';
import { money, parseAmount, parseEntry, shortDate } from '../tgcloud/lib/money.js';

test('суммы', () => {
  assert.equal(parseAmount('500'), 50000);
  assert.equal(parseAmount('1 500,50'), 150050);
  assert.equal(parseAmount('2к'), 200000);
  assert.equal(parseAmount('1.5k'), 150000);
  assert.equal(parseAmount('300р'), 30000);
  assert.equal(parseAmount('0'), null);
  assert.equal(parseAmount('абв'), null);
  assert.equal(money(150050), '1 500,50 ₽');
  assert.equal(money(50000), '500 ₽');
  assert.equal(money(123456700), '1 234 567 ₽');
  assert.equal(shortDate(Date.parse('2026-11-09T23:30:00+09:00') / 1000), '09.11');
});

test('записи текстом', () => {
  assert.deepEqual(parseEntry('Петя 500'), { kind: 'lend', name: 'Петя', amount: 50000, note: '' });
  assert.deepEqual(parseEntry('Петя Иванов 1 500 кино'), { kind: 'lend', name: 'Петя Иванов', amount: 150000, note: 'кино' });
  assert.deepEqual(parseEntry('маша 2к на подарок'), { kind: 'lend', name: 'маша', amount: 200000, note: 'на подарок' });
  assert.deepEqual(parseEntry('Петя 500 ₽ пицца'), { kind: 'lend', name: 'Петя', amount: 50000, note: 'пицца' });
  assert.deepEqual(parseEntry('Петя +300'), { kind: 'lend', name: 'Петя', amount: 30000, note: '' });
  assert.deepEqual(parseEntry('Петя -200'), { kind: 'return', name: 'Петя', amount: 20000, note: '' });
  assert.deepEqual(parseEntry('Петя вернул 200'), { kind: 'return', name: 'Петя', amount: 20000, note: '' });
  assert.deepEqual(parseEntry('Петя вернул'), { kind: 'return', name: 'Петя', amount: null, note: '' });
  assert.equal(parseEntry('привет'), null);
  assert.equal(parseEntry('как дела'), null);
  assert.equal(parseEntry('500 Петя'), null);
});

// --- База в памяти и Telegram-заглушка ---

function setup() {
  const users = new Map();
  let friends = [];
  let ops = [];
  let nextId = 1;
  let tok = 0;
  const store = {
    getUser: async (id) => users.get(id) ?? null,
    putUser: async (u) => void users.set(u.userId, { pending: null, ...users.get(u.userId), ...u }),
    setPending: async (id, pending) => void (users.get(id).pending = pending),
    friend: async (id) => friends.find((f) => f.id === id) ?? null,
    friendByName: async (ownerId, key) => friends.find((f) => f.ownerId === ownerId && f.nameKey === key) ?? null,
    friendByToken: async (token) => friends.find((f) => f.token === token) ?? null,
    friendsOf: async (ownerId) => friends.filter((f) => f.ownerId === ownerId),
    linkedTo: async (userId) => friends.filter((f) => f.linkedUserId === userId),
    addFriend: async (f) => {
      const row = { id: nextId++, linkedUserId: null, ...f };
      friends.push(row);
      return { ...row };
    },
    linkFriend: async (id, userId) => void (friends.find((f) => f.id === id).linkedUserId = userId),
    removeFriend: async (id) => { friends = friends.filter((f) => f.id !== id); ops = ops.filter((o) => o.friendId !== id); },
    opsOf: async (friendId) => ops.filter((o) => o.friendId === friendId),
    opsOfOwner: async (ownerId) => ops.filter((o) => o.ownerId === ownerId),
    addOp: async (o) => void ops.push({ id: nextId++, ...o }),
    undoOp: async (friendId) => {
      const last = ops.filter((o) => o.friendId === friendId).at(-1);
      if (last) ops = ops.filter((o) => o !== last);
      return last ?? null;
    },
  };
  const out = [];
  const tg = {
    send: async (chatId, text, markup) => void out.push({ type: 'send', chatId, text, markup }),
    edit: async (chatId, msgId, text, markup) => void out.push({ type: 'edit', chatId, text, markup }),
    answer: async (id, text, alert) => void out.push({ type: 'answer', text, alert }),
  };
  const deps = { store, tg, botUsername: 'dolg_bot', now: () => Date.parse('2026-11-09T12:00:00+09:00') / 1000, token: () => `tok${++tok}` };
  const user = (id, first_name) => ({ id, first_name });
  const say = async (from, text) => {
    out.length = 0;
    await handleMessage({ message_id: 1, chat: { id: from.id, type: 'private' }, from, text }, deps);
    return out.slice();
  };
  const press = async (from, data) => {
    out.length = 0;
    await handleCallback({ id: 'q', from, data, message: { chat: { id: from.id }, message_id: 5 } }, deps);
    return out.slice();
  };
  return { store, user, say, press, ops: () => ops, friends: () => friends };
}

const buttons = (markup) => (markup?.inline_keyboard ?? []).flat().map((b) => b.callback_data);

test('дал, ещё дал, вернул часть, вернул всё', async () => {
  const { say, press, user, friends } = setup();
  const me = user(1, 'Маша');
  assert.match((await say(me, BUTTONS.list))[0].text, /Тетрадка пустая/);

  assert.match((await say(me, 'петя 500 пицца'))[0].text, /Записал: Петя — 500 ₽ \(пицца\)\nВсего должен\(а\): <b>500 ₽<\/b>/);
  assert.equal(friends()[0].name, 'Петя');
  assert.match((await say(me, 'Петя 1 500'))[0].text, /Всего должен\(а\): <b>2 000 ₽<\/b>/);
  assert.match((await say(me, 'Вася 300'))[0].text, /Вася — 300 ₽/);

  const list = await say(me, BUTTONS.list);
  assert.match(list[0].text, /Тебе должны: 2 300 ₽<\/b>\n\n• Петя — 2 000 ₽\n• Вася — 300 ₽/);
  assert.deepEqual(buttons(list[0].markup), ['f:1', 'f:4']);

  assert.match((await say(me, 'петя вернул 700'))[0].text, /Петя вернул\(а\) 700 ₽\nВсего должен\(а\): <b>1 300 ₽/);

  // кнопка «вернул часть» → ждём сумму
  await press(me, 'part:1');
  assert.match((await say(me, '300'))[0].text, /вернул\(а\) 300 ₽\nВсего должен\(а\): <b>1 000 ₽/);
  // «дал ещё» с пометкой
  await press(me, 'more:1');
  assert.match((await say(me, '250 такси'))[0].text, /Петя — 250 ₽ \(такси\)/);

  const card = await press(me, 'f:1');
  const view = card.find((x) => x.type === 'edit');
  assert.match(view.text, /Должен\(а\): <b>1 250 ₽<\/b>/);
  assert.match(view.text, /09\.11 ➕ 500 ₽ · пицца/);
  assert.ok(buttons(view.markup).includes('all:1'));

  const all = await press(me, 'all:1');
  assert.match(all.find((x) => x.type === 'send').text, /вернул\(а\) 1 250 ₽\n🎉 Долг закрыт!/);
  assert.match((await say(me, 'Петя вернул'))[0].text, /ничего не должен/);
  assert.match((await say(me, 'Коля вернул 100'))[0].text, /нет «Коля»/);
  assert.match((await say(me, BUTTONS.list))[0].text, /Вернули всё: Петя/);

  // отменить последнее
  await press(me, 'undo:1');
  assert.match((await say(me, BUTTONS.list))[0].text, /• Петя — 1 250 ₽/);
});

test('друг подключается по ссылке, получает напоминание и жмёт «я вернул»', async () => {
  const { say, press, user, ops } = setup();
  const me = user(1, 'Маша');
  const petya = user(2, 'Петя');
  await say(me, 'Петя 500');

  // без подключения напомнить нельзя — даём ссылку
  const nudge0 = await press(me, 'nudge:1');
  assert.match(nudge0.find((x) => x.type === 'send').text, /не подключён\(а\)[\s\S]*https:\/\/t\.me\/dolg_bot\?start=f_tok1/);

  const link = await say(petya, '/start f_tok1');
  assert.match(link.find((x) => x.chatId === 1).text, /Петя подключился/);
  assert.match(link.at(-1).text, /Ты должен\(а\)<\/b>\n\n• Маша — 500 ₽/);
  // по чужой ссылке второй раз не подключиться
  assert.match((await say(user(3, 'Вася'), '/start f_tok1'))[0].text, /уже подключился другой/);
  assert.match((await say(me, '/start f_tok1'))[0].text, /перешли её ему/);

  // новая запись — друг узнаёт
  const more = await say(me, 'Петя 200 кофе');
  assert.match(more.find((x) => x.chatId === 2).text, /Маша записал\(а\): ты взял\(а\) 200 ₽ \(кофе\)\.\nТы должен\(а\): <b>700 ₽/);

  const nudge = await press(me, 'nudge:1');
  const msg = nudge.find((x) => x.chatId === 2 && x.type === 'send');
  assert.match(msg.text, /Маша напоминает: ты должен\(а\) <b>700 ₽/);
  assert.deepEqual(buttons(msg.markup), ['paid:1']);

  // чужой не может нажать «я вернул» и не видит тетрадку
  assert.equal((await press(user(3, 'Вася'), 'paid:1'))[0].alert, true);
  assert.equal((await press(petya, 'f:1'))[0].alert, true);

  const paid = await press(petya, 'paid:1');
  const ask = paid.find((x) => x.chatId === 1);
  assert.deepEqual(buttons(ask.markup), ['ok:1:70000', 'nope:1:70000']);
  const ok = await press(me, 'ok:1:70000');
  assert.match(ok.find((x) => x.chatId === 2).text, /отметил\(а\): ты вернул\(а\) 700 ₽\.\n🎉 Ты ничего не должен/);
  assert.equal(ops().at(-1).kind, 'return');
  assert.match((await say(petya, BUTTONS.mine))[0].text, /никому не должен/);
});

test('удалить друга', async () => {
  const { say, press, user, friends, ops } = setup();
  const me = user(1, 'Маша');
  await say(me, 'Петя 500');
  assert.deepEqual(buttons((await press(me, 'del:1')).find((x) => x.type === 'edit').markup), ['del!:1', 'f:1']);
  await press(me, 'del!:1');
  assert.equal(friends().length, 0);
  assert.equal(ops().length, 0);
});

test('в группах молчит, непонятное — подсказка', async () => {
  const { say, user } = setup();
  const r = await say(user(1, 'Маша'), 'привет');
  assert.match(r[0].text, /Не понял/);
});
