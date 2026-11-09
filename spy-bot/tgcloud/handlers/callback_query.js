// handlers/callback_query — нажатия кнопок под сообщением игры (см. lib/bot.js → press).
// Роль показываем всплывающим окном — его видит только нажавший.

import { api, BotApiError } from 'sdk';
import { press, render } from '../lib/bot.js';
import { getGame, saveGame } from '../lib/store.js';

export default async function (query) {
  const chat = query.message?.chat;
  let answer = { text: 'эта игра уже закончилась. новая — /spy', show_alert: false };
  let edit = null;

  if (chat) {
    // До трёх попыток: если кто-то нажал одновременно, перечитываем игру и применяем заново.
    for (let attempt = 0; attempt < 3; attempt++) {
      const row = await getGame(chat.id);
      if (!row || row.msgId !== query.message.message_id) break;
      const res = press(row.state, query.data ?? '', query.from);
      if (res.state !== row.state && !(await saveGame(chat.id, row.version, res.state))) continue;
      answer = { text: res.alert ?? res.toast ?? '', show_alert: Boolean(res.alert) };
      if (res.state !== row.state) edit = render(res.state);
      break;
    }
  }

  try {
    await api.answerCallbackQuery({ callback_query_id: query.id, ...(answer.text && answer) });
  } catch (err) {
    if (!(err instanceof BotApiError)) throw err;
  }
  if (edit) {
    try {
      await api.editMessageText({ chat_id: chat.id, message_id: query.message.message_id, text: edit.text, parse_mode: 'HTML', reply_markup: edit.reply_markup });
    } catch (err) {
      if (!(err instanceof BotApiError) || !/not modified/i.test(err.description ?? '')) throw err;
    }
  }
}
