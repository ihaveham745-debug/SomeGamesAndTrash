// lib/app — что бот делает на сообщения и кнопки. Без 'sdk': всё внешнее приходит в deps,
// поэтому логику проверяют тесты (test/bot.test.js).
//
// deps = {
//   store,                 — база (lib/store.js);
//   panel(cfg),            — клиент панели amnezia-wg-easy для { url, password } (lib/panel.js);
//   tg: { send(chatId, text, markup), sendFile(chatId, fileName, content, caption, markup),
//         edit(chatId, msgId, text, markup), answer(queryId, text, alert), remove(chatId, msgId),
//         setup(ownerId) },  — Telegram (handlers/*.js).
// }
//
// Кто есть кто: владелец — первый, кто нажал /start (он подключает сервер и пускает родных).
// Остальные нажимают /start → владельцу приходит запрос с кнопками «пустить» / «нет».
// Ключи: у каждого по одному на устройство; «пересоздать» — новый ключ, старый перестаёт работать.

import { PanelError, normalizeUrl } from './panel.js';

export const DEVICES = {
  phone: { icon: '📱', name: 'телефон' },
  pc: { icon: '💻', name: 'компьютер' },
  tablet: { icon: '📟', name: 'планшет' },
  tv: { icon: '📺', name: 'телевизор' },
};
const deviceLabel = (d) => `${DEVICES[d].icon} ${DEVICES[d].name}`;

export const BUTTONS = {
  keys: '🔑 Мои ключи',
  help: '❓ Как подключить',
  family: '👨‍👩‍👧 Семья',
  server: '🖥 Сервер',
};

export const COMMANDS = [
  { command: 'keys', description: '🔑 Мои ключи' },
  { command: 'help', description: '❓ Как подключить' },
];
export const OWNER_COMMANDS = [
  ...COMMANDS,
  { command: 'family', description: '👨‍👩‍👧 Семья: кто пользуется' },
  { command: 'server', description: '🖥 Сервер VPN' },
];

export const DESCRIPTION = '🔐 Семейный VPN (Amnezia). Выдаю ключи родным: на телефон, компьютер, планшет. Ключ можно пересоздать в один клик.';
export const SHORT_DESCRIPTION = '🔐 Ключи семейного VPN Amnezia';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function userName(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || (user?.username ? `@${user.username}` : `id ${user?.id}`);
}

const who = (m) => `${esc(m.name)}${m.username ? ` (@${esc(m.username)})` : ''}`;

function menu(isOwner) {
  return {
    keyboard: [
      [{ text: BUTTONS.keys }, { text: BUTTONS.help }],
      ...(isOwner ? [[{ text: BUTTONS.family }, { text: BUTTONS.server }]] : []),
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export const HELP_TEXT = [
  '❓ <b>Как подключить VPN</b>',
  '',
  '1. Поставь приложение <b>AmneziaVPN</b> — App Store, Google Play или amnezia.org (для компьютера).',
  `2. Здесь нажми «${BUTTONS.keys}» и выбери устройство — пришлю файл с ключом.`,
  '3. Открой файл в AmneziaVPN:',
  '   • телефон — нажми на файл → «Поделиться» / «Открыть в…» → AmneziaVPN;',
  '   • или в AmneziaVPN: «+» → «Файл с настройками» и выбери файл;',
  '   • или нажми «📋 Текстом», скопируй ключ и в AmneziaVPN: «+» → вставь.',
  '4. Включи VPN большой кнопкой.',
  '',
  '⚠️ Один ключ — одно устройство. Не пересылай ключ другим: если два устройства с одним ключом,',
  'интернет будет пропадать. Нужен ключ на ещё одно устройство — выбери его в «Мои ключи».',
  '',
  'Ключ потерялся или кто-то чужой его узнал — «🔄 Пересоздать»: старый перестанет работать.',
].join('\n');

const SERVER_HELP = [
  '🖥 <b>Подключить сервер</b>',
  '',
  'Ключи бот делает через веб-панель <b>amnezia-wg-easy</b> на твоём сервере. Пришли:',
  '<code>/server http://АДРЕС пароль</code>',
  '',
  'Например: <code>/server http://203.0.113.5 MyPass123</code>',
  'Сообщение с паролем я сразу удалю из чата.',
  '',
  '⚠️ Бот достаёт только до портов 80 и 443 — панель должна открываться по адресу без порта',
  '(в docker run: <code>-p 80:51821/tcp</code>).',
].join('\n');

function panelProblem(err) {
  if (!(err instanceof PanelError)) {
    console.error(err);
    return '😕 Что-то пошло не так. Попробуй ещё раз чуть позже.';
  }
  if (err.code === 'offline') return '📡 Сервер VPN не отвечает. Попробуй позже — или скажи владельцу.';
  if (err.code === 'password') return '🔒 Сервер VPN не пустил бота (сменился пароль панели?). Владельцу: /server';
  return `😕 Сервер VPN ответил ошибкой: ${esc(err.message)}`;
}

// --- Контекст: кто пишет ---

async function load(deps, user) {
  const [ownerId, member] = await Promise.all([deps.store.getSetting('owner'), deps.store.getMember(user.id)]);
  return { ownerId, member, isOwner: ownerId === user.id, ok: member?.status === 'ok' };
}

async function panelFor(deps) {
  const cfg = await deps.store.getSetting('panel');
  return cfg?.url ? deps.panel(cfg) : null;
}

// --- Сообщения ---

const COMMAND = /^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i;

export async function handleMessage(message, deps) {
  const chat = message.chat;
  const user = message.from;
  if (chat?.type !== 'private' || !user || user.is_bot) return; // в группах молчим — ключи только в личке
  const text = (message.text ?? '').trim();
  const m = COMMAND.exec(text);
  const cmd = m?.[1].toLowerCase();
  const args = m?.[2]?.trim() ?? '';
  const ctx = await load(deps, user);

  // Владельца ещё нет — первый /start забирает бота себе.
  if (!ctx.ownerId) {
    if (cmd !== 'start') return deps.tg.send(chat.id, 'Нажми /start');
    if (await deps.store.claimSetting('owner', user.id)) {
      await deps.store.putMember({ userId: user.id, name: userName(user), username: user.username ?? null, status: 'ok' });
      await deps.tg.setup?.(user.id);
      return deps.tg.send(chat.id, [
        `👋 <b>Привет, ${esc(userName(user))}!</b> Ты владелец этого бота: подключаешь сервер и пускаешь родных.`,
        '',
        SERVER_HELP,
        '',
        'Родные просто открывают бота и жмут /start — тебе придёт запрос с кнопками «пустить» / «нет».',
      ].join('\n'), menu(true));
    }
    return handleMessage(message, deps); // кто-то успел раньше — дальше как обычный человек
  }

  if (!ctx.ok) return stranger(message, ctx, deps);

  if (cmd === 'server' && ctx.isOwner) return serverCommand(message, args, deps);
  if (cmd === 'start') {
    return deps.tg.send(chat.id, `👋 ${esc(userName(user))}, тут твои ключи от семейного VPN.\n\nНажми «${BUTTONS.keys}». Как подключить — «${BUTTONS.help}».`, menu(ctx.isOwner));
  }
  if (cmd === 'keys' || text === BUTTONS.keys) return deps.tg.send(chat.id, ...keysView(await deps.store.keys(user.id)));
  if (cmd === 'help' || text === BUTTONS.help) return deps.tg.send(chat.id, HELP_TEXT, menu(ctx.isOwner));
  if (ctx.isOwner && (cmd === 'family' || text === BUTTONS.family)) return deps.tg.send(chat.id, ...await familyView(deps));
  if (ctx.isOwner && text === BUTTONS.server) return serverStatus(chat.id, deps);
  return deps.tg.send(chat.id, `Не понял 🙂 Нажми «${BUTTONS.keys}».`, menu(ctx.isOwner));
}

/** Человек не из семьи (или ещё ждёт): шлём владельцу запрос. */
async function stranger(message, ctx, deps) {
  const { chat, from: user } = message;
  if (ctx.member?.status === 'pending') return deps.tg.send(chat.id, '⏳ Запрос уже у владельца — как только пустит, я напишу.');
  const member = { userId: user.id, name: userName(user), username: user.username ?? null, status: 'pending' };
  await deps.store.putMember(member);
  await deps.tg.send(ctx.ownerId, `🙋 ${who(member)} просит ключ от VPN. Пустить?`, {
    inline_keyboard: [[{ text: '✅ Пустить', callback_data: `ok:${user.id}` }, { text: '❌ Нет', callback_data: `no:${user.id}` }]],
  });
  return deps.tg.send(chat.id, '👋 Привет! Это семейный VPN. Я спросил владельца — как только пустит, напишу сюда.');
}

// --- Сервер ---

async function serverCommand(message, args, deps) {
  const chatId = message.chat.id;
  if (!args) return serverStatus(chatId, deps);
  const [url, ...rest] = args.split(/\s+/);
  const password = rest.join(' ');
  // в сообщении пароль — убираем его из чата сразу
  await deps.tg.remove(chatId, message.message_id);
  if (!/^https?:\/\/[^\s/]+/i.test(url)) return deps.tg.send(chatId, `🤔 Адрес должен начинаться с http:// или https://\n\n${SERVER_HELP}`);
  const port = portOf(url);
  if (port !== null && port !== 80 && port !== 443) {
    return deps.tg.send(chatId, `🤔 Порт ${port} боту недоступен: Telegram пускает только на 80 и 443.\n\n${SERVER_HELP}`);
  }
  const cfg = { url: normalizeUrl(url), password };
  try {
    const list = await deps.panel(cfg).clients();
    await deps.store.setSetting('panel', cfg);
    return deps.tg.send(chatId, `✅ Сервер подключён: ${esc(cfg.url)}\nНа нём сейчас ключей: ${list.length}.\n\nТеперь жми «${BUTTONS.keys}» — и позови родных в бота.`);
  } catch (err) {
    return deps.tg.send(chatId, `${panelProblem(err)}\n\nНичего не сохранил. Проверь адрес и пароль.\n\n${SERVER_HELP}`);
  }
}

/** 'http://1.2.3.4:51821/x' → 51821; без порта — null. */
export function portOf(url) {
  const m = /^https?:\/\/(?:\[[^\]]+\]|[^/:\s]+):(\d+)/i.exec(url);
  return m ? Number(m[1]) : null;
}

async function serverStatus(chatId, deps) {
  const cfg = await deps.store.getSetting('panel');
  if (!cfg?.url) return deps.tg.send(chatId, SERVER_HELP);
  try {
    const list = await deps.panel(cfg).clients();
    const ours = await deps.store.allKeys();
    return deps.tg.send(chatId, `🖥 <b>Сервер</b>: ${esc(cfg.url)}\n✅ работает · ключей на сервере: ${list.length}, из них выдано ботом: ${ours.length}\n\nПоменять: <code>/server http://АДРЕС пароль</code>`);
  } catch (err) {
    return deps.tg.send(chatId, `🖥 <b>Сервер</b>: ${esc(cfg.url)}\n${panelProblem(err)}\n\nПоменять: <code>/server http://АДРЕС пароль</code>`);
  }
}

// --- Ключи ---

/** Список устройств с кнопками → [text, markup]. */
export function keysView(keys) {
  const has = new Set(keys.map((k) => k.device));
  const rows = Object.keys(DEVICES).map((d) => (has.has(d)
    ? [{ text: `${deviceLabel(d)} — получить`, callback_data: `get:${d}` }, { text: '🔄 Пересоздать', callback_data: `re:${d}` }]
    : [{ text: `➕ Ключ: ${deviceLabel(d)}`, callback_data: `add:${d}` }]));
  const text = has.size
    ? `🔑 <b>Твои ключи</b>: ${[...has].map(deviceLabel).join(', ')}\n\nНужен ключ ещё на одно устройство — выбери его ниже.`
    : '🔑 <b>Ключей пока нет.</b> Выбери устройство — пришлю ключ.';
  return [text, { inline_keyboard: rows }];
}

/** Имя клиента в панели: «Мама · телефон · k3f9» — хвост делает имя уникальным. */
function clientName(member, device) {
  return `${member.name.slice(0, 24)} · ${DEVICES[device].name} · ${Date.now().toString(36).slice(-4)}`;
}

async function sendKey(chatId, device, config, deps, fresh) {
  const caption = [
    `${fresh ? '✅ Новый ключ' : '🔑 Ключ'}: <b>${deviceLabel(device)}</b>`,
    'Открой файл в приложении AmneziaVPN. Не пересылай другим: один ключ — одно устройство.',
    `Подробно — «${BUTTONS.help}».`,
  ].join('\n');
  await deps.tg.sendFile(chatId, `amnezia-${device}.conf`, config, caption, {
    inline_keyboard: [[{ text: '📋 Текстом', callback_data: `txt:${device}` }]],
  });
}

// --- Кнопки ---

export async function handleCallback(query, deps) {
  const user = query.from;
  const chatId = query.message?.chat?.id;
  const msgId = query.message?.message_id;
  const [action, arg = ''] = String(query.data ?? '').split(':');
  const ctx = await load(deps, user);
  const answer = (text = '', alert = false) => deps.tg.answer(query.id, text, alert);
  const edit = (text, markup) => deps.tg.edit(chatId, msgId, text, markup);

  // Владелец: пустить / не пускать / убрать из семьи
  if (['ok', 'no', 'kick', 'kick!', 'fam'].includes(action)) {
    if (!ctx.isOwner) return answer('Это может только владелец', true);
    return ownerAction(action, Number(arg), { answer, edit, deps, ownerId: user.id });
  }

  if (!ctx.ok) return answer('Сначала нажми /start', true);
  if (!DEVICES[arg]) return answer();
  const device = arg;
  const panel = await panelFor(deps);
  if (!panel) {
    return answer(ctx.isOwner ? 'Сначала подключи сервер: /server' : 'Сервер VPN ещё не подключён — скажи владельцу', true);
  }
  const keys = await deps.store.keys(user.id);
  const key = keys.find((k) => k.device === device);

  try {
    if (action === 'add' || (action === 'get' && !key)) {
      if (key) return getKey(key);
      await answer('Делаю ключ…');
      const created = await panel.create(clientName(ctx.member, device));
      if (!(await deps.store.addKey({ userId: user.id, device, clientId: created.id, clientName: created.name }))) {
        await panel.remove(created.id); // нажали дважды — второй ключ не нужен
        return;
      }
      await edit(...keysView(await deps.store.keys(user.id)));
      return sendKey(chatId, device, await panel.config(created.id), deps, true);
    }
    if (!key) {
      await answer('Этого ключа уже нет', false);
      return edit(...keysView(keys));
    }
    if (action === 'get') return getKey(key);
    if (action === 'txt') {
      const config = await panel.config(key.clientId);
      await answer();
      return deps.tg.send(chatId, `📋 Ключ «${deviceLabel(device)}» текстом — нажми, чтобы скопировать, и вставь в AmneziaVPN («+»):\n\n<pre>${esc(config)}</pre>`);
    }
    if (action === 're') {
      await answer();
      return edit(`🔄 Пересоздать ключ «${deviceLabel(device)}»?\n\nСтарый ключ сразу перестанет работать — на этом устройстве нужно будет открыть новый.`, {
        inline_keyboard: [[{ text: '🔄 Да, пересоздать', callback_data: `re!:${device}` }, { text: '↩️ Нет', callback_data: `back:${device}` }]],
      });
    }
    if (action === 're!') {
      await answer('Пересоздаю…');
      const oldId = key.clientId;
      const created = await panel.create(clientName(ctx.member, device));
      if (!(await deps.store.replaceKey({ userId: user.id, device, oldClientId: oldId, clientId: created.id, clientName: created.name }))) {
        await panel.remove(created.id); // кто-то уже пересоздал
        return edit(...keysView(await deps.store.keys(user.id)));
      }
      await panel.remove(oldId);
      await edit(...keysView(await deps.store.keys(user.id)));
      return sendKey(chatId, device, await panel.config(created.id), deps, true);
    }
    if (action === 'back') {
      await answer();
      return edit(...keysView(keys));
    }
    return answer();
  } catch (err) {
    // на нажатие могли уже ответить («Делаю ключ…») — поэтому сообщением
    return deps.tg.send(chatId, panelProblem(err));
  }

  async function getKey(k) {
    try {
      const config = await panel.config(k.clientId);
      await answer();
      return sendKey(chatId, device, config, deps, false);
    } catch (err) {
      if (err.code !== 'missing') throw err;
      // ключ удалили в панели руками — забываем его, пусть сделают новый
      await deps.store.removeKey(user.id, device);
      await answer('Этот ключ удалён на сервере — сделай новый', true);
      return edit(...keysView(await deps.store.keys(user.id)));
    }
  }
}

// --- Владелец: семья ---

/** Семья с кнопками → [text, markup]. */
export async function familyView(deps) {
  const [all, keys, ownerId] = await Promise.all([deps.store.members(), deps.store.allKeys(), deps.store.getSetting('owner')]);
  const lines = ['👨‍👩‍👧 <b>Семья</b>', ''];
  const rows = [];
  for (const m of all) {
    const devices = keys.filter((k) => k.userId === m.userId).map((k) => DEVICES[k.device]?.icon ?? '🔑').join(' ');
    if (m.status === 'pending') {
      lines.push(`⏳ ${who(m)} — ждёт ответа`);
      rows.push([{ text: `✅ Пустить: ${m.name}`, callback_data: `ok:${m.userId}` }, { text: '❌', callback_data: `no:${m.userId}` }]);
    } else {
      lines.push(`${m.userId === ownerId ? '👑' : '•'} ${who(m)} — ${devices || 'ключей нет'}`);
      if (m.userId !== ownerId) rows.push([{ text: `🚫 Убрать: ${m.name}`, callback_data: `kick:${m.userId}` }]);
    }
  }
  if (all.length <= 1) lines.push('', 'Пока только ты. Перешли родным ссылку на бота — пусть нажмут /start.');
  return [lines.join('\n'), { inline_keyboard: rows }];
}

async function ownerAction(action, userId, { answer, edit, deps, ownerId }) {
  const member = await deps.store.getMember(userId);
  if (action === 'fam') {
    await answer();
    return edit(...await familyView(deps));
  }
  if (!member) {
    await answer('Этого человека уже нет в списке');
    return edit(...await familyView(deps));
  }
  if (action === 'ok') {
    await deps.store.putMember({ ...member, status: 'ok' });
    await answer(`${member.name} — пущен(а)`);
    await edit(`✅ ${who(member)} теперь в семье.`);
    return deps.tg.send(userId, `🎉 Владелец пустил тебя! Нажми «${BUTTONS.keys}» и выбери устройство. Как подключить — «${BUTTONS.help}».`, menu(false));
  }
  if (action === 'no') {
    if (member.status === 'ok') return answer('Уже в семье — убрать можно в «Семье»', true);
    await deps.store.removeMember(userId);
    await answer('Не пустил(а)');
    return edit(`❌ ${who(member)} — не пустил(а).`);
  }
  if (userId === ownerId) return answer('Себя убрать нельзя', true);
  if (action === 'kick') {
    await answer();
    return edit(`🚫 Убрать ${who(member)}? Все его/её ключи перестанут работать.`, {
      inline_keyboard: [[{ text: '🚫 Да, убрать', callback_data: `kick!:${userId}` }, { text: '↩️ Нет', callback_data: 'fam:0' }]],
    });
  }
  // kick! — удалить ключи с сервера и человека из семьи
  const keys = await deps.store.keys(userId);
  if (keys.length) {
    const panel = await panelFor(deps);
    try {
      for (const k of keys) {
        await panel?.remove(k.clientId);
        await deps.store.removeKey(userId, k.device);
      }
    } catch (err) {
      return answer(panelProblem(err).replace(/<[^>]+>/g, ''), true);
    }
  }
  await deps.store.removeMember(userId);
  await answer(`${member.name} — убран(а)`);
  await edit(...await familyView(deps));
  return deps.tg.send(userId, '🚫 Владелец закрыл тебе доступ к VPN.');
}
