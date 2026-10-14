// handlers/callback_query — нажатия на кнопки под расписанием (◀️ ▶️, «Вся неделя» и т. п.).
// Новое сообщение не шлём — меняем текст того, под которым нажали.

import { api, BotApiError } from 'sdk';
import { viewFor } from '../lib/bot.js';

export default async function (query, ctx) {
  const view = viewFor(query.data);
  let notice;

  if (view && query.message) {
    try {
      await api.editMessageText({
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        text: view.text,
        parse_mode: 'HTML',
        reply_markup: view.reply_markup,
      });
    } catch (err) {
      if (err instanceof BotApiError && /not modified/i.test(err.description ?? '')) {
        notice = 'Уже актуально 👌';
      } else {
        console.error('editMessageText failed', err);
        notice = 'Не получилось обновить 😕 Запроси расписание заново';
      }
    }
  }

  // Без ответа у кнопки крутятся «часики».
  await api.answerCallbackQuery({ callback_query_id: query.id, ...(notice && { text: notice }) });
}
