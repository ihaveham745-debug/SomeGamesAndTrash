// handlers/callback_query — нажатия на кнопки под сообщениями: выбор класса, ◀️ ▶️, «Вся неделя».
// Новое сообщение не шлём — меняем текст того, под которым нажали
// (кроме выбора класса: тогда ещё присылаем обычную клавиатуру внизу).

import { api, BotApiError } from 'sdk';
import { KEYBOARD, chosenText, viewFor } from '../lib/bot.js';
import { store } from '../lib/notes.js';
import { prefs } from '../lib/prefs.js';

export default async function (query, ctx) {
  const chat = query.message?.chat;
  const result = chat ? await viewFor(query.data, chat.id, Date.now(), store, prefs) : null;
  let notice;

  if (result) {
    try {
      await api.editMessageText({
        chat_id: chat.id,
        message_id: query.message.message_id,
        text: result.view.text,
        parse_mode: 'HTML',
        reply_markup: result.view.reply_markup,
      });
    } catch (err) {
      if (err instanceof BotApiError && /not modified/i.test(err.description ?? '')) {
        notice = 'Уже актуально 👌';
      } else {
        console.error('editMessageText failed', err);
        notice = 'Не получилось обновить 😕 Запроси расписание заново';
      }
    }
    if (result.chosen) {
      notice = 'Класс выбран ✅';
      await api.sendMessage({
        chat_id: chat.id,
        ...(query.message.is_topic_message && { message_thread_id: query.message.message_thread_id }),
        text: chosenText(result.chosen),
        parse_mode: 'HTML',
        reply_markup: KEYBOARD,
      }).catch((err) => console.warn('sendMessage failed', err.description ?? err));
    }
  }

  // Без ответа у кнопки крутятся «часики». Если нажатие уже устарело, Telegram откажет.
  try {
    await api.answerCallbackQuery({ callback_query_id: query.id, ...(notice && { text: notice }) });
  } catch (err) {
    if (!(err instanceof BotApiError)) throw err;
    console.warn('answerCallbackQuery failed', err.description);
  }
}
