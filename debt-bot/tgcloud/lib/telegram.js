// lib/telegram — deps для lib/app.js на настоящем 'sdk'.
// Ошибки Telegram (друг заблокировал бота, сообщение не изменилось) не роняют обработку — только в лог.

import { BotApiError, api } from 'sdk';
import { COMMANDS, DESCRIPTION, SHORT_DESCRIPTION } from './app.js';
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
  edit: (chat_id, message_id, text, m) => quiet(api.editMessageText({ chat_id, message_id, text, parse_mode: 'HTML', ...markup(m) })),
  answer: (callback_query_id, text, show_alert) => quiet(api.answerCallbackQuery({ callback_query_id, ...(text && { text, show_alert: Boolean(show_alert) }) })),
  /** Профиль бота: команды и описание (на /start — не страшно, если упадёт). */
  setup: () => Promise.allSettled([
    api.setMyCommands({ commands: COMMANDS }),
    api.setMyDescription({ description: DESCRIPTION }),
    api.setMyShortDescription({ short_description: SHORT_DESCRIPTION }),
  ]),
};

/** 'k3J9xQ…' — 12 случайных символов для ссылки другу. */
function token() {
  const abc = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => abc[b % abc.length]).join('');
}

let username = null;

/** deps для одного обновления: имя бота (для ссылок) берём один раз. */
export async function makeDeps() {
  if (!username) username = (await api.getMe()).username;
  return { store, tg, botUsername: username, now: () => Math.floor(Date.now() / 1000), token };
}
