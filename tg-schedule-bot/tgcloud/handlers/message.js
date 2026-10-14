// handlers/message — платформа вызывает его на каждое входящее сообщение.

import { api } from 'sdk';
import { COMMANDS, DESCRIPTION, SHORT_DESCRIPTION, actionFor, replyTo } from '../lib/bot.js';

export default async function (message, ctx) {
  const reply = replyTo(message);
  if (!reply) return;

  if (actionFor(message.text) === 'start') {
    // Меню команд у кнопки «/» и описание бота — достаточно выставить один раз, повтор не вредит.
    const results = await Promise.allSettled([
      api.setMyCommands({ commands: COMMANDS }),
      api.setMyDescription({ description: DESCRIPTION }),
      api.setMyShortDescription({ short_description: SHORT_DESCRIPTION }),
    ]);
    for (const r of results) {
      if (r.status === 'rejected') console.warn('bot profile setup failed', r.reason?.description ?? r.reason);
    }
  }

  await api.sendMessage({
    chat_id: message.chat.id,
    text: reply.text,
    parse_mode: 'HTML',
    reply_markup: reply.reply_markup,
  });
}
