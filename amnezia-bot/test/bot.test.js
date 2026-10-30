import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BUTTONS, handleCallback, handleMessage } from '../tgcloud/lib/app.js';
import { cookieHeader, panelClient } from '../tgcloud/lib/panel.js';

// --- Поддельная панель amnezia-wg-easy: тот же HTTP API, что у настоящей ---

function fakePanel(password = 'secret') {
  const clients = new Map();
  const sessions = new Set();
  let next = 1;
  const panel = { clients, sessions, online: true, calls: [] };
  const json = (status, body, headers = {}) => ({
    status, ok: status >= 200 && status < 300,
    headers: { get: (h) => headers[h.toLowerCase()] ?? null },
    json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  });
  panel.fetch = async (url, { method = 'GET', headers = {}, body } = {}) => {
    if (!panel.online) throw new Error('connect ECONNREFUSED');
    const path = new URL(url).pathname;
    panel.calls.push(`${method} ${path}`);
    if (method === 'POST' && path === '/api/session') {
      if (JSON.parse(body).password !== password) return json(401, { error: 'Incorrect Password' });
      const sid = `s${sessions.size + 1}`;
      sessions.add(sid);
      return json(200, { success: true }, { 'set-cookie': `connect.sid=${sid}; Path=/; HttpOnly` });
    }
    const sid = /connect\.sid=(\w+)/.exec(headers.Cookie ?? '')?.[1];
    if (!sessions.has(sid)) return json(401, { error: 'Not Logged In' });
    if (method === 'GET' && path === '/api/wireguard/client') return json(200, [...clients.values()]);
    if (method === 'POST' && path === '/api/wireguard/client') {
      const id = `id-${next++}`;
      clients.set(id, { id, name: JSON.parse(body).name, createdAt: new Date(Date.now() + next).toISOString() });
      return json(200, { success: true });
    }
    const m = /^\/api\/wireguard\/client\/([^/]+)(\/configuration)?$/.exec(path);
    if (m && method === 'DELETE') {
      clients.delete(m[1]);
      return json(200, { success: true });
    }
    if (m && m[2]) {
      if (!clients.has(m[1])) return json(500, 'Client Not Found');
      return json(200, `[Interface]\nPrivateKey = key-${m[1]}\nJc = 4\n\n[Peer]\nEndpoint = 203.0.113.5:51820\n`);
    }
    return json(404, 'Not Found');
  };
  return panel;
}

// --- База в памяти и Telegram-заглушка ---

function fakeStore() {
  const settings = new Map();
  const memberMap = new Map();
  let keys = [];
  return {
    settings, memberMap,
    get keysList() { return keys; },
    getSetting: async (k) => settings.get(k) ?? null,
    setSetting: async (k, v) => void settings.set(k, v),
    claimSetting: async (k, v) => (settings.has(k) ? false : (settings.set(k, v), true)),
    getMember: async (id) => memberMap.get(id) ?? null,
    members: async () => [...memberMap.values()],
    putMember: async (m) => void memberMap.set(m.userId, { ...m }),
    removeMember: async (id) => void memberMap.delete(id),
    keys: async (userId) => keys.filter((k) => k.userId === userId),
    allKeys: async () => keys,
    addKey: async (k) => (keys.some((x) => x.userId === k.userId && x.device === k.device) ? false : (keys.push({ ...k }), true)),
    replaceKey: async ({ userId, device, oldClientId, clientId, clientName }) => {
      const k = keys.find((x) => x.userId === userId && x.device === device && x.clientId === oldClientId);
      if (!k) return false;
      Object.assign(k, { clientId, clientName });
      return true;
    },
    removeKey: async (userId, device) => { keys = keys.filter((k) => !(k.userId === userId && k.device === device)); },
  };
}

function setup() {
  const panel = fakePanel();
  const store = fakeStore();
  const out = [];
  const tg = {
    send: async (chatId, text, markup) => void out.push({ type: 'send', chatId, text, markup }),
    sendFile: async (chatId, fileName, content, caption, markup) => void out.push({ type: 'file', chatId, fileName, content, caption, markup }),
    edit: async (chatId, msgId, text, markup) => void out.push({ type: 'edit', chatId, text, markup }),
    answer: async (id, text, alert) => void out.push({ type: 'answer', text, alert }),
    remove: async (chatId, msgId) => void out.push({ type: 'remove', chatId, msgId }),
    setup: async () => {},
  };
  const deps = { store, tg, panel: (cfg) => panelClient(cfg, panel.fetch) };
  const user = (id, first_name) => ({ id, first_name, username: first_name.toLowerCase() });
  const say = async (from, text) => {
    out.length = 0;
    await handleMessage({ message_id: 77, chat: { id: from.id, type: 'private' }, from, text }, deps);
    return out.slice();
  };
  const press = async (from, data) => {
    out.length = 0;
    await handleCallback({ id: 'q', from, data, message: { chat: { id: from.id }, message_id: 5 } }, deps);
    return out.slice();
  };
  return { panel, store, deps, out, user, say, press };
}

const buttons = (markup) => (markup?.inline_keyboard ?? []).flat().map((b) => b.callback_data);

test('cookieHeader: берём только имя=значение', () => {
  assert.equal(cookieHeader('connect.sid=abc; Path=/; HttpOnly'), 'connect.sid=abc');
  assert.equal(cookieHeader('a=1; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT, b=2; Path=/'), 'a=1; b=2');
  assert.equal(cookieHeader(null), '');
});

test('первый /start — владелец; сервер подключается командой, пароль удаляется из чата', async () => {
  const { say, store, panel, user } = setup();
  const mom = user(1, 'Мама');
  const r1 = await say(mom, '/start');
  assert.match(r1[0].text, /Ты владелец/);
  assert.equal(store.settings.get('owner'), 1);

  const bad = await say(mom, '/server http://203.0.113.5 wrong');
  assert.deepEqual(bad[0], { type: 'remove', chatId: 1, msgId: 77 });
  assert.match(bad[1].text, /не принял(а)? пароль|не пустил бота/);
  assert.equal(store.settings.get('panel'), undefined);

  panel.online = false;
  assert.match((await say(mom, '/server http://203.0.113.5 secret'))[1].text, /не отвечает/);
  panel.online = true;

  const ok = await say(mom, '/server http://203.0.113.5/ secret');
  assert.match(ok[1].text, /Сервер подключён: http:\/\/203\.0\.113\.5\n/);
  assert.deepEqual(store.settings.get('panel'), { url: 'http://203.0.113.5', password: 'secret' });
  // порт 51821 облако Telegram не пускает — сразу говорим об этом
  assert.match((await say(mom, '/server http://203.0.113.5:51821 secret'))[1].text, /Порт 51821 боту недоступен/);
  assert.deepEqual(store.settings.get('panel').url, 'http://203.0.113.5');
  assert.match((await say(mom, BUTTONS.server))[0].text, /работает · ключей на сервере: 0/);
});

test('родные: запрос владельцу, «пустить», «нет»', async () => {
  const { say, press, store, user } = setup();
  const mom = user(1, 'Мама');
  const son = user(2, 'Петя');
  const stranger = user(3, 'Чужой');
  await say(mom, '/start');

  const r = await say(son, '/start');
  const ask = r.find((x) => x.chatId === 1);
  assert.match(ask.text, /Петя \(@петя\) просит ключ/);
  assert.deepEqual(buttons(ask.markup), ['ok:2', 'no:2']);
  assert.match(r.find((x) => x.chatId === 2).text, /спросил владельца/);
  assert.match((await say(son, BUTTONS.keys))[0].text, /Запрос уже у владельца/);

  // не владелец пускать не может
  assert.equal((await press(son, 'ok:2'))[0].alert, true);
  assert.equal(store.memberMap.get(2).status, 'pending');

  const okRes = await press(mom, 'ok:2');
  assert.equal(store.memberMap.get(2).status, 'ok');
  assert.match(okRes.find((x) => x.chatId === 2).text, /пустил тебя/);

  await say(stranger, '/start');
  await press(mom, 'no:3');
  assert.equal(store.memberMap.has(3), false);
  assert.match((await press(stranger, 'add:phone'))[0].text, /Сначала нажми \/start/);
});

test('ключи: выдать, получить ещё раз, текстом, пересоздать', async () => {
  const { say, press, store, panel, user } = setup();
  const mom = user(1, 'Мама');
  await say(mom, '/start');
  // без сервера ключ не сделать
  assert.match((await press(mom, 'add:phone'))[0].text, /подключи сервер/);
  await say(mom, '/server http://203.0.113.5 secret');

  const list = await say(mom, BUTTONS.keys);
  assert.match(list[0].text, /Ключей пока нет/);
  assert.deepEqual(buttons(list[0].markup), ['add:phone', 'add:pc', 'add:tablet', 'add:tv']);

  const add = await press(mom, 'add:phone');
  const file = add.find((x) => x.type === 'file');
  assert.equal(file.fileName, 'amnezia-phone.conf');
  assert.match(file.content, /\[Interface\]/);
  assert.match(file.caption, /Новый ключ/);
  assert.equal(panel.clients.size, 1);
  const [client] = panel.clients.values();
  assert.match(client.name, /^Мама · телефон · \w{4}$/);
  assert.deepEqual(buttons(add.find((x) => x.type === 'edit').markup).slice(0, 2), ['get:phone', 're:phone']);

  // повторное нажатие «добавить» не плодит ключи
  await press(mom, 'add:phone');
  assert.equal(panel.clients.size, 1);

  const again = await press(mom, 'get:phone');
  assert.equal(again.find((x) => x.type === 'file').content, file.content);
  assert.match((await press(mom, 'txt:phone')).find((x) => x.type === 'send').text, /<pre>\[Interface\]/);

  // пересоздать: сначала спрашиваем, потом новый ключ, старый удалён с сервера
  assert.deepEqual(buttons((await press(mom, 're:phone')).find((x) => x.type === 'edit').markup), ['re!:phone', 'back:phone']);
  const oldId = store.keysList[0].clientId;
  const re = await press(mom, 're!:phone');
  const newId = store.keysList[0].clientId;
  assert.notEqual(newId, oldId);
  assert.deepEqual([...panel.clients.keys()], [newId]);
  assert.match(re.find((x) => x.type === 'file').content, new RegExp(`key-${newId}`));
  // старая кнопка «да, пересоздать» второй раз ничего не ломает: пересоздаёт снова, без лишних клиентов
  await press(mom, 're!:phone');
  assert.equal(panel.clients.size, 1);
});

test('ключ удалили в панели руками — бот предлагает сделать новый', async () => {
  const { say, press, store, panel, user } = setup();
  const mom = user(1, 'Мама');
  await say(mom, '/start');
  await say(mom, '/server http://203.0.113.5 secret');
  await press(mom, 'add:pc');
  panel.clients.clear();
  const r = await press(mom, 'get:pc');
  assert.match(r.find((x) => x.type === 'answer').text, /удалён на сервере/);
  assert.equal(store.keysList.length, 0);
});

test('панель перезапустили (сессия пропала) — бот входит заново', async () => {
  const { say, press, panel, user } = setup();
  const mom = user(1, 'Мама');
  await say(mom, '/start');
  await say(mom, '/server http://203.0.113.5 secret');
  await press(mom, 'add:phone');
  panel.sessions.clear();
  const r = await press(mom, 'get:phone');
  assert.ok(r.some((x) => x.type === 'file'));
});

test('владелец убирает человека: его ключи удаляются с сервера', async () => {
  const { say, press, store, panel, user } = setup();
  const mom = user(1, 'Мама');
  const son = user(2, 'Петя');
  await say(mom, '/start');
  await say(mom, '/server http://203.0.113.5 secret');
  await say(son, '/start');
  await press(mom, 'ok:2');
  await press(son, 'add:phone');
  await press(son, 'add:pc');
  await press(mom, 'add:phone');
  assert.equal(panel.clients.size, 3);

  const fam = await say(mom, BUTTONS.family);
  assert.match(fam[0].text, /👑 Мама \(@мама\) — 📱/);
  assert.match(fam[0].text, /• Петя \(@петя\) — 📱 💻/);
  assert.deepEqual(buttons(fam[0].markup), ['kick:2']);
  // не владельцу «Семья» недоступна
  assert.doesNotMatch((await say(son, BUTTONS.family))[0].text, /Семья/);

  assert.deepEqual(buttons((await press(mom, 'kick:2')).find((x) => x.type === 'edit').markup), ['kick!:2', 'fam:0']);
  const kicked = await press(mom, 'kick!:2');
  assert.equal(panel.clients.size, 1);
  assert.equal(store.memberMap.has(2), false);
  assert.deepEqual(store.keysList.map((k) => k.userId), [1]);
  assert.match(kicked.find((x) => x.chatId === 2 && x.type === 'send').text, /закрыл тебе доступ/);
  assert.match((await press(son, 'get:phone'))[0].text, /Сначала нажми \/start/);
});

test('в группах бот молчит', async () => {
  const { deps, out } = setup();
  await handleMessage({ message_id: 1, chat: { id: -100, type: 'group' }, from: { id: 1, first_name: 'Мама' }, text: '/start' }, deps);
  assert.equal(out.length, 0);
});
