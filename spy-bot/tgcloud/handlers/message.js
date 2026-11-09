// handlers/message — команды: /spy (новая игра в группе), /rules, /stop, /start.

import { api, BotApiError } from 'sdk';
import {
  COMMANDS, DESCRIPTION, MINI_APP_URL, RULES, SHORT_DESCRIPTION, isActive, newLobby, press, render, userName,
} from '../lib/bot.js';
import { getGame, putGame, saveGame } from '../lib/store.js';

const STALE_SECONDS = 6 * 3600; // игра без движения 6 часов — считаем брошенной

const isGroup = (chat) => chat.type === 'group' || chat.type === 'supergroup';

export default async function (message) {
  const m = /^\/([a-z_]+)(?:@(\w+))?(?:\s+(.*))?$/is.exec((message.text ?? '').trim());
  const chat = message.chat;
  if (!m) {
    if (chat.type === 'private') await send(chat, 'жми /start — расскажу, как играть 🕵️');
    return;
  }
  const [, command, mention, arg = ''] = m;
  const me = await api.getMe();
  if (mention && mention.toLowerCase() !== me.username.toLowerCase()) return;
  const cmd = command.toLowerCase();

  if (cmd === 'start' && isGroup(chat)) return newGame(message);
  if (cmd === 'start') return welcome(chat, me.username);
  if (cmd === 'rules' || cmd === 'help') return send(chat, RULES);
  if (cmd === 'spy' || cmd === 'game') {
    if (isGroup(chat)) return newGame(message);
    return send(chat, '🕵️ в шпиона играют в группе: добавь меня в чат с друзьями и напиши там /spy.\nили играйте с одного телефона — в приложении.', welcomeKeyboard(me.username));
  }
  if (cmd === 'stop' && isGroup(chat)) return stopGame(message);
}

function send(chat, text, reply_markup, extra = {}) {
  return api.sendMessage({ chat_id: chat.id, text, parse_mode: 'HTML', ...(reply_markup && { reply_markup }), ...extra });
}

function welcomeKeyboard(username) {
  return {
    inline_keyboard: [
      [{ text: '📱 играть с одного телефона', web_app: { url: MINI_APP_URL } }],
      [{ text: '👥 добавить в группу', url: `https://t.me/${username}?startgroup=spy` }],
    ],
  };
}

async function welcome(chat, username) {
  await Promise.allSettled([
    api.setMyCommands({ commands: COMMANDS }),
    api.setChatMenuButton({ menu_button: { type: 'web_app', text: 'играть', web_app: { url: MINI_APP_URL } } }),
    api.setMyDescription({ description: DESCRIPTION }),
    api.setMyShortDescription({ short_description: SHORT_DESCRIPTION }),
  ]);
  await send(chat, [
    '🕵️ <b>Привет! Это игра «Шпион»</b>',
    '',
    'У всех игроков одно общее слово — кроме шпиона: у него другое слово той же темы,',
    'и он даже не знает, что он шпион. По вопросам вычисляйте, у кого слово не такое.',
    '',
    '👥 <b>в группе</b>: добавь меня в чат с друзьями и напиши /spy',
    '📱 <b>с одного телефона</b>: кнопка ниже — телефон передаёте по кругу',
    '',
    'правила — /rules',
  ].join('\n'), welcomeKeyboard(username));
}

async function newGame(message) {
  const chat = message.chat;
  const row = await getGame(chat.id);
  const updatedSec = row?.updated instanceof Date ? row.updated.getTime() / 1000 : Number(row?.updated ?? 0);
  const fresh = row && Date.now() / 1000 - updatedSec < STALE_SECONDS;
  if (row && isActive(row.state) && fresh) {
    try {
      await send(chat, '🕵️ в чате уже идёт игра — она здесь ↑ (отменить: /stop, может ведущий)', null, { reply_parameters: { message_id: row.msgId } });
      return;
    } catch (err) {
      if (!(err instanceof BotApiError)) throw err; // сообщение игры удалили — начнём новую
    }
  }
  const state = newLobby({ id: message.from.id, name: userName(message.from) });
  const { text, reply_markup } = render(state);
  const sent = await send(chat, text, reply_markup);
  await putGame(chat.id, sent.message_id, state);
}

async function stopGame(message) {
  const chat = message.chat;
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await getGame(chat.id);
    if (!row || !isActive(row.state)) return send(chat, 'сейчас игры нет. новая — /spy');
    const res = press(row.state, 'x', message.from);
    if (res.state === row.state) return send(chat, res.toast ?? 'не получилось');
    if (!(await saveGame(chat.id, row.version, res.state))) continue;
    const { text, reply_markup } = render(res.state);
    await api.editMessageText({ chat_id: chat.id, message_id: row.msgId, text, parse_mode: 'HTML', reply_markup }).catch(() => {});
    return send(chat, res.state.status === 'cancelled' ? 'игра отменена' : 'игра закончена — итоги в сообщении игры ↑');
  }
}
