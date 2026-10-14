// handlers/message — платформа вызывает его на каждое входящее сообщение.

import { api } from 'sdk';
import { COMMANDS, KEYBOARD, actionFor, replyTo } from '../lib/bot.js';

export default async function (message, ctx) {
  const text = replyTo(message);
  if (!text) return;

  if (actionFor(message.text) === 'start') {
    // Меню команд у кнопки «/» — достаточно выставить один раз, повтор не вредит.
    try {
      await api.setMyCommands({ commands: COMMANDS });
    } catch (err) {
      console.warn('setMyCommands failed', err.description ?? err);
    }
  }

  await api.sendMessage({
    chat_id: message.chat.id,
    text,
    parse_mode: 'HTML',
    reply_markup: KEYBOARD,
  });
}
