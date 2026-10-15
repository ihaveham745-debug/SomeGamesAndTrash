// handlers/message — платформа вызывает его на каждое входящее сообщение.

import { api } from 'sdk';
import {
  COMMANDS, DESCRIPTION, MENU_BUTTON, SHORT_DESCRIPTION, actionFor, commandMention, replyTo,
} from '../lib/bot.js';
import { store } from '../lib/notes.js';

export default async function (message, ctx) {
  const reply = await replyTo(message, Date.now(), store);
  if (!reply) return;

  // «/help@другой_бот» в группе — не нам (бот-админ получает все сообщения группы).
  const mention = commandMention(message.text);
  if (mention && mention !== (await api.getMe()).username.toLowerCase()) return;

  if (actionFor(message.text) === 'start') {
    // Меню команд, кнопка Mini App и описание бота — достаточно выставить один раз, повтор не вредит.
    const results = await Promise.allSettled([
      api.setMyCommands({ commands: COMMANDS }),
      api.setChatMenuButton({ menu_button: MENU_BUTTON }),
      api.setMyDescription({ description: DESCRIPTION }),
      api.setMyShortDescription({ short_description: SHORT_DESCRIPTION }),
    ]);
    for (const r of results) {
      if (r.status === 'rejected') console.warn('bot profile setup failed', r.reason?.description ?? r.reason);
    }
  }

  await api.sendMessage({
    chat_id: message.chat.id,
    // В группе с темами отвечаем в ту же тему, а не в «Общий».
    ...(message.is_topic_message && { message_thread_id: message.message_thread_id }),
    text: reply.text,
    parse_mode: 'HTML',
    reply_markup: reply.reply_markup,
  });
}
