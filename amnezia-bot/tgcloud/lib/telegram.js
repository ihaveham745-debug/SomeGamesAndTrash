// lib/telegram — deps для lib/app.js: Telegram, база и панель на настоящем 'sdk'.
// Ошибки Telegram (человек заблокировал бота, сообщение не изменилось) не роняют обработку — только в лог.

import { BotApiError, InputFile, api, fetch } from 'sdk';
import { COMMANDS, DESCRIPTION, OWNER_COMMANDS, SHORT_DESCRIPTION } from './app.js';
import { panelClient } from './panel.js';
import { store } from './store.js';

async function quiet(promise) {
  try {
    return await promise;
  } catch (err) {
    if (!(err instanceof BotApiError)) throw err;
    if (!/not modified/i.test(err.description ?? '')) console.warn('Bot API:', err.description);
    return null;
  }
}

const markup = (m) => (m ? { reply_markup: m } : {});

export const tg = {
  send: (chat_id, text, m) => quiet(api.sendMessage({ chat_id, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...markup(m) })),
  sendFile: (chat_id, fileName, content, caption, m) => quiet(api.sendDocument({
    chat_id,
    document: new InputFile(new TextEncoder().encode(content), fileName, { type: 'text/plain' }),
    caption,
    parse_mode: 'HTML',
    ...markup(m),
  })),
  edit: (chat_id, message_id, text, m) => quiet(api.editMessageText({ chat_id, message_id, text, parse_mode: 'HTML', ...markup(m) })),
  answer: (callback_query_id, text, show_alert) => quiet(api.answerCallbackQuery({ callback_query_id, ...(text && { text, show_alert: Boolean(show_alert) }) })),
  remove: (chat_id, message_id) => quiet(api.deleteMessage({ chat_id, message_id })),
  setup: (ownerId) => Promise.allSettled([
    api.setMyCommands({ commands: COMMANDS }),
    api.setMyCommands({ commands: OWNER_COMMANDS, scope: { type: 'chat', chat_id: ownerId } }),
    api.setMyDescription({ description: DESCRIPTION }),
    api.setMyShortDescription({ short_description: SHORT_DESCRIPTION }),
  ]),
};

export const deps = { store, tg, panel: (cfg) => panelClient(cfg, fetch) };
