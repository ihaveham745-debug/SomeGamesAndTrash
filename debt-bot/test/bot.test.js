import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ApiError, apiCall } from '../tgcloud/lib/api.js';
import { BUTTONS, handleCallback, handleMessage } from '../tgcloud/lib/app.js';
import { DAY, debtOf } from '../tgcloud/lib/loans.js';
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
  const requests = [];
  let nextId = 1;
  let tok = 0;
  const store = {
    getUser: async (id) => users.get(id) ?? null,
    putUser: async (u) => void users.set(u.userId, { pending: null, ...users.get(u.userId), ...u }),
    setPending: async (id, pending) => void (users.get(id).pending = pending),
    setTerms: async (id, t) => void Object.assign(users.get(id), t),
    userByInvite: async (token) => [...users.values()].find((u) => u.inviteToken === token) ?? null,
    setInvite: async (id, token) => void (users.get(id).inviteToken = token),
    request: async (id) => { const r = requests.find((x) => x.id === id); return r ? { ...r } : null; },
    addRequest: async (r) => { const id = nextId++; requests.push({ id, ownerMsgId: null, ...r }); return id; },
    setRequestMsg: async (id, msgId) => void (requests.find((r) => r.id === id).ownerMsgId = msgId),
    closeRequest: async (id, status) => {
      const r = requests.find((x) => x.id === id && x.status === 'pending');
      if (r) r.status = status;
      return Boolean(r);
    },
    pendingTo: async (ownerId) => requests.filter((r) => r.ownerId === ownerId && r.status === 'pending'),
    pendingFrom: async (userId) => requests.filter((r) => r.userId === userId && r.status === 'pending'),
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
    send: async (chatId, text, markup) => { out.push({ type: 'send', chatId, text, markup }); return { message_id: 100 + out.length }; },
    edit: async (chatId, msgId, text, markup) => void out.push({ type: 'edit', chatId, text, markup }),
    answer: async (id, text, alert) => void out.push({ type: 'answer', text, alert }),
  };
  const clock = { now: Date.parse('2026-11-09T12:00:00+09:00') / 1000 };
  const deps = { store, tg, botUsername: 'dolg_bot', now: () => clock.now, token: () => `tok${++tok}` };
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
  const api = (from, name, input = {}) => { out.length = 0; return apiCall(name, input, from, deps); };
  return { store, user, say, press, clock, api, out, ops: () => ops, friends: () => friends };
}

const buttons = (markup) => (markup?.inline_keyboard ?? []).flat().map((b) => b.callback_data);

test('дал, ещё дал, вернул часть, вернул всё', async () => {
  const { say, press, user, friends } = setup();
  const me = user(1, 'Маша');
  assert.match((await say(me, BUTTONS.list))[0].text, /Тетрадка пустая/);

  assert.match((await say(me, 'петя 500 пицца'))[0].text, /Записал: Петя — 500 ₽ \(пицца\)\n⏳ без процентов до 03\.01; не вернёт всё к этому дню — 61,9% годовых за весь срок\nВсего должен\(а\): <b>500 ₽<\/b>/);
  assert.equal(friends()[0].name, 'Петя');
  assert.match((await say(me, 'Петя 1 500'))[0].text, /Всего должен\(а\): <b>2 000 ₽<\/b>/);
  assert.match((await say(me, 'Вася 300'))[0].text, /Вася — 300 ₽/);

  const list = await say(me, BUTTONS.list);
  assert.match(list[0].text, /Тебе должны: 2 300 ₽<\/b>\n\n• Петя — 2 000 ₽\n• Вася — 300 ₽/);
  assert.deepEqual(buttons(list[0].markup), ['f:1', 'f:4', 'invite', 'terms']);

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
  assert.match(more.find((x) => x.chatId === 2).text, /Маша записал\(а\): ты взял\(а\) 200 ₽ \(кофе\)\.\n⏳ без процентов до 03\.01; не вернёт всё к этому дню — 61,9% годовых за весь срок\nТы должен\(а\): <b>700 ₽/);

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

test('старые займы (процент в день после срока): капает на остаток, возврат гасит сначала проценты', () => {
  const t0 = 1_800_000_000;
  const lend = (id, at, amount, days, rate = 100) => ({ id, kind: 'lend', amount, at, due: at + days * DAY, rate });
  const ret = (id, at, amount) => ({ id, kind: 'return', amount, at });
  // 1000 ₽ на 30 дней, потом 1% в день
  const ops = [lend(1, t0, 100000, 30)];
  assert.equal(debtOf(ops, t0 + 29 * DAY).total, 100000);
  const d = debtOf(ops, t0 + 40 * DAY); // 10 дней просрочки: 10 × 10 ₽
  assert.deepEqual([d.principal, d.interest, d.total, d.perDay], [100000, 10000, 110000, 1000]);
  // вернул 300 ₽ на 40-й день: 100 ₽ — проценты, 200 ₽ — долг; дальше 1% от 800 ₽
  ops.push(ret(2, t0 + 40 * DAY, 30000));
  const d2 = debtOf(ops, t0 + 50 * DAY);
  assert.deepEqual([d2.principal, d2.interest, d2.total], [80000, 8000, 88000]);
  // возврат посреди дня просрочки — долг остаётся в целых копейках
  const odd = [lend(1, t0, 150000, 30), ret(2, t0 + 40 * DAY + 3333, 50000)];
  const d3 = debtOf(odd, t0 + 41 * DAY + 777);
  assert.ok(Number.isInteger(d3.principal) && Number.isInteger(d3.total), JSON.stringify(d3));
  // без процентов — не капает никогда
  assert.equal(debtOf([lend(1, t0, 50000, 0, 0)], t0 + 400 * DAY).total, 50000);
  // переплата — минус, и зачитывается в следующий займ
  const over = [lend(1, t0, 10000, 30), ret(2, t0 + DAY, 15000)];
  assert.equal(debtOf(over, t0 + 2 * DAY).total, -5000);
  over.push(lend(3, t0 + 3 * DAY, 20000, 30));
  assert.equal(debtOf(over, t0 + 4 * DAY).total, 15000);
});

test('как у кредитки: вернул вовремя — 0%, не вернул — годовые за весь срок с первого дня', () => {
  const t0 = 1_800_000_000;
  const lend = (id, at, amount, days, apr = 3650) => ({ id, kind: 'lend', amount, at, due: at + days * DAY, apr }); // 36,5% = 0,1% в день
  const ret = (id, at, amount) => ({ id, kind: 'return', amount, at });
  // в льготном периоде процентов нет, но видно, сколько набежит, если не вернуть всё
  const d0 = debtOf([lend(1, t0, 100000, 30)], t0 + 10 * DAY);
  assert.deepEqual([d0.total, d0.perDay, d0.loans[0].risk], [100000, 0, 3000]);
  // вернул всё на 29-й день — 0%
  assert.equal(debtOf([lend(1, t0, 100000, 30), ret(2, t0 + 29 * DAY, 100000)], t0 + 100 * DAY).total, 0);
  // не вернул к 30-му дню — проценты за все 30 дней сразу, потом капают дальше
  const d1 = debtOf([lend(1, t0, 100000, 30)], t0 + 30 * DAY);
  assert.deepEqual([d1.interest, d1.perDay], [3000, 100]);
  assert.equal(debtOf([lend(1, t0, 100000, 30)], t0 + 40 * DAY).interest, 4000);
  // вернул половину в льготный период — проценты задним числом на фактический остаток
  const half = [lend(1, t0, 100000, 30), ret(2, t0 + 10 * DAY, 50000)];
  assert.equal(debtOf(half, t0 + 30 * DAY).interest, 1000 + 1000); // 10 дн. × 1000 ₽ + 20 дн. × 500 ₽, 0,1% в день
  // займы независимы: старый вернули вовремя, новый — нет
  const two = [lend(1, t0, 100000, 30), lend(2, t0 + 5 * DAY, 100000, 30), ret(3, t0 + 20 * DAY, 100000)];
  assert.equal(debtOf(two, t0 + 35 * DAY).interest, 3000); // только второй займ, 30 дн.
});

test('условия: /terms и на один займ', async () => {
  const { say, press, user, clock, ops } = setup();
  const me = user(1, 'Маша');
  assert.match((await say(me, '/terms'))[0].text, /до 55 дн\. без процентов, потом 61,9% годовых за весь срок/);
  assert.match((await say(me, '/terms 14 36,5'))[0].text, /до 14 дн\. без процентов, потом 36,5% годовых/);
  assert.match((await say(me, '/terms 999 1'))[0].text, /Не понял/);
  assert.match((await say(me, 'Петя 1000'))[0].text, /без процентов до 23\.11; не вернёт всё к этому дню — 36,5% годовых за весь срок/);
  assert.match((await say(me, 'Вася 1000 на неделю'))[0].text, /без процентов до 16\.11/);
  assert.match((await say(me, 'Коля 1000 до 25.11 кино'))[0].text, /Коля — 1 000 ₽ \(кино\)\n⏳ без процентов до 25\.11/);
  assert.match((await say(me, 'Лена 1000 без процентов'))[0].text, /⏳ без процентов\n/);
  assert.equal(ops().find((o) => o.friendId === 1).apr, 3650);

  // в льготный период — видно, сколько набежит
  const early = (await press(me, 'f:1')).find((x) => x.type === 'edit');
  assert.match(early.text, /без процентов до 23\.11 — не вернёт всё к этому дню, набежит 14 ₽ \(36,5% годовых\)/);

  // через 24 дня Петя не вернул: 0,1% в день × 24 дня с первого дня = 24 ₽
  clock.now += 24 * DAY;
  const card = (await press(me, 'f:1')).find((x) => x.type === 'edit');
  assert.match(card.text, /Должен\(а\): <b>1 024 ₽ \(в т\.ч\. проценты 24 ₽\)<\/b>/);
  assert.match(card.text, /капает 1 ₽ в день/);
  assert.match(card.text, /• 1 000 ₽ от 09\.11 — 36,5% годовых, набежало 24 ₽/);
  const list = (await say(me, BUTTONS.list))[0].text;
  assert.match(list, /из них проценты: 72 ₽/); // Петя, Вася, Коля — по 24 ₽ (по 24 дня), Лена — без процентов
  assert.match(list, /• Петя — 1 024 ₽ ⚠️ \+1 ₽\/день/);
  assert.match((await say(me, 'Петя вернул'))[0].text, /вернул\(а\) 1 024 ₽\n🎉 Долг закрыт!/);
});

test('приложение: дать, вернуть, условия, напомнить, «я вернул»', async () => {
  const { api, out, user, clock, say } = setup();
  const me = user(1, 'Маша');
  const petya = user(2, 'Петя');
  let st = await api(me, 'state');
  assert.deepEqual(st.terms, { graceDays: 55, apr: 6190 });
  assert.equal(st.friends.length, 0);

  st = await api(me, 'lend', { name: ' петя ', amount: 100000, note: 'кино', terms: { days: 14 } });
  assert.equal(st.friends[0].name, 'Петя');
  const op = st.friends[0].ops[0];
  assert.deepEqual([op.amount, op.note, op.due - op.at, op.apr], [100000, 'кино', 14 * DAY, 6190]);
  assert.equal(out.length, 0); // из приложения владельцу в чат не пишем
  assert.match(st.friends[0].link, /^https:\/\/t\.me\/dolg_bot\?start=f_tok2$/);

  // тот же друг по имени, «до даты», без процентов
  st = await api(me, 'lend', { name: 'Петя', amount: 5000, terms: { until: '25.11' } });
  st = await api(me, 'lend', { friendId: 1, amount: 5000, terms: { free: true } });
  assert.equal(st.friends.length, 1);
  assert.equal(st.friends[0].ops[2].apr, 0);
  await assert.rejects(api(me, 'lend', { name: 'Петя', amount: -5 }), ApiError);
  await assert.rejects(api(me, 'lend', { name: 'Петя', amount: 100, terms: { until: '31.02' } }), /Неверная дата/);

  st = await api(me, 'repay', { friendId: 1, amount: 10000 });
  assert.equal(debtOf(st.friends[0].ops, clock.now).total, 100000);

  st = await api(me, 'setTerms', { graceDays: 7, apr: 3650 });
  assert.deepEqual(st.terms, { graceDays: 7, apr: 3650 });
  await assert.rejects(api(me, 'setTerms', { graceDays: 7, apr: 200000 }), ApiError);

  // напомнить без подключения → ссылка; после подключения — сообщение другу
  assert.deepEqual(await api(me, 'nudge', { friendId: 1 }), { sent: false, link: 'https://t.me/dolg_bot?start=f_tok2' });
  await say(petya, '/start f_tok2');
  assert.deepEqual(await api(me, 'nudge', { friendId: 1 }), { sent: true });
  assert.match(out.find((x) => x.chatId === 2).text, /Маша напоминает: ты должен\(а\) <b>1 000 ₽/);

  // у Пети в приложении — «я должен»
  const pst = await api(petya, 'state');
  assert.equal(pst.mine[0].ownerName, 'Маша');
  assert.equal(debtOf(pst.mine[0].ops, clock.now).total, 100000);
  assert.deepEqual(await api(petya, 'paid', { friendId: 1 }), { asked: 100000 });
  assert.deepEqual(out.find((x) => x.chatId === 1).markup.inline_keyboard[0].map((b) => b.callback_data), ['ok:1:100000', 'nope:1:100000']);

  // чужое — нельзя
  await assert.rejects(api(petya, 'repay', { friendId: 1 }), /нет/);
  await assert.rejects(api(user(3, 'Вася'), 'paid', { friendId: 1 }), /не твой/);

  // вернул всё (amount не задан) → долг закрыт; undo; удалить
  st = await api(me, 'repay', { friendId: 1 });
  assert.equal(debtOf(st.friends[0].ops, clock.now).total, 0);
  st = await api(me, 'undo', { friendId: 1 });
  assert.equal(debtOf(st.friends[0].ops, clock.now).total, 100000);
  st = await api(me, 'removeFriend', { friendId: 1 });
  assert.equal(st.friends.length, 0);
  await assert.rejects(api(me, 'nope'), /Неизвестное/);

  // заявки в приложении: Петя (подключён) просит ещё, Маша видит и одобряет
  assert.match(st.inviteLink, /^https:\/\/t\.me\/dolg_bot\?start=r_tok1$/);
  st = await api(me, 'lend', { name: 'Петя', amount: 1000 });
  await say(petya, '/start f_tok' + (st.friends[0].link.split('f_tok')[1]));
  let pst2 = await api(petya, 'ask', { ownerId: 1, amount: 50000, note: 'кино', terms: { days: 7 } });
  assert.deepEqual(pst2.myRequests.map((r) => [r.ownerName, r.amount]), [['Маша', 50000]]);
  await assert.rejects(api(petya, 'ask', { ownerId: 1, amount: 100 }), /уже ждёт/);
  await assert.rejects(api(user(3, 'Вася'), 'ask', { ownerId: 1, amount: 100 }), /ссылку для заявок/);
  st = await api(me, 'state');
  assert.equal(st.requests.length, 1);
  assert.deepEqual([st.requests[0].name, st.requests[0].amount, st.requests[0].note, st.requests[0].terms], ['Петя', 50000, 'кино', { days: 7 }]);
  st = await api(me, 'decide', { requestId: st.requests[0].id, approve: true });
  assert.equal(st.requests.length, 0);
  assert.equal(debtOf(st.friends.find((f) => f.linked).ops, clock.now).total, 51000);
  await assert.rejects(api(me, 'decide', { requestId: 999, approve: true }), /Такой заявки нет/);
});

test('заявки: друг сам просит по ссылке, владелец одобряет или отказывает', async () => {
  const { say, press, user, out, ops, friends } = setup();
  const me = user(1, 'Маша');
  const petya = { id: 2, first_name: 'Петя', username: 'petya' };
  await say(me, 'Петя 300'); // в тетрадке уже есть другой Петя, не подключённый

  const inv = (await say(me, '/invite'))[0];
  const link = /https:\/\/t\.me\/dolg_bot\?start=r_(\w+)/.exec(inv.text);
  assert.ok(link, inv.text);
  assert.match((await say(me, `/start r_${link[1]}`))[0].text, /твоя ссылка для заявок/);

  // друг открывает ссылку → бот спрашивает сумму с условиями владельца
  assert.match((await say(petya, `/start r_${link[1]}`))[0].text, /тетрадка долгов Маша[\s\S]*до 55 дн\. без процентов, потом 61,9% годовых/);
  assert.match((await say(petya, 'дай денег'))[0].text, /Напиши сумму/);
  const sent = await say(petya, '1000 такси на 14 дней');
  const ask = sent.find((x) => x.chatId === 1);
  assert.match(ask.text, /Заявка<\/b>: Петя \(@petya\) просит в долг <b>1 000 ₽<\/b> \(такси\)\n⏳ без процентов до 23\.11/);
  assert.deepEqual(buttons(ask.markup), [`rqok:${ask.markup.inline_keyboard[0][0].callback_data.split(':')[1]}`, `rqno:${ask.markup.inline_keyboard[0][0].callback_data.split(':')[1]}`]);
  assert.match(sent.find((x) => x.chatId === 2).text, /Заявка на <b>1 000 ₽<\/b> отправлена Маша/);
  // вторую, пока первая ждёт, — нельзя
  await say(petya, `/start r_${link[1]}`);
  assert.match((await say(petya, '500'))[0].text, /уже ждёт ответа/);
  assert.match((await say(petya, '/mine'))[0].text, /⏳ Заявка Маша на 1 000 ₽ ждёт ответа/);

  // чужой не может одобрить
  const id = ask.markup.inline_keyboard[0][0].callback_data.split(':')[1];
  assert.equal((await press(user(3, 'Вася'), `rqok:${id}`))[0].alert, true);

  const ok = await press(me, `rqok:${id}`);
  assert.match(ok.find((x) => x.type === 'edit' && x.chatId === 1).text, /✅ Одобрено: Петя 2 — <b>1 000 ₽<\/b> \(такси\)/);
  assert.match(ok.find((x) => x.chatId === 2 && /одобрил/.test(x.text)).text, /Маша одобрил\(а\) заявку/);
  assert.match(ok.find((x) => x.chatId === 2 && /записал/.test(x.text)).text, /ты взял\(а\) 1 000 ₽ \(такси\)/);
  const newFriend = friends().find((f) => f.linkedUserId === 2);
  assert.equal(newFriend.name, 'Петя 2'); // имя не совпало с другим Петей
  const loan = ops().find((o) => o.friendId === newFriend.id);
  assert.deepEqual([loan.amount, loan.due - loan.at, loan.apr], [100000, 14 * DAY, 6190]);
  // повторное нажатие — уже ответили
  assert.match((await press(me, `rqok:${id}`)).find((x) => x.type === 'answer').text, /уже ответили/);

  // подключённый друг просит ещё — кнопкой из «я должен»; владелец отказывает
  const mine = (await say(petya, '/mine'))[0];
  assert.ok(buttons(mine.markup).includes('ask:1'));
  await press(petya, 'ask:1');
  const second = (await say(petya, '200')).find((x) => x.chatId === 1);
  const id2 = second.markup.inline_keyboard[0][1].callback_data.split(':')[1];
  assert.match(second.text, /Уже должен\(а\): 1 000 ₽/);
  const no = await press(me, `rqno:${id2}`);
  assert.match(no.find((x) => x.chatId === 2).text, /не одобрил\(а\) заявку на 200 ₽/);
  assert.equal(ops().filter((o) => o.friendId === newFriend.id).length, 1);
});
