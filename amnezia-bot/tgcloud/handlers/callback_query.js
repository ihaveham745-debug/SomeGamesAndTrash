// handlers/callback_query — нажатия кнопок под сообщениями (см. lib/app.js → handleCallback).

import { handleCallback } from '../lib/app.js';
import { deps } from '../lib/telegram.js';

export default async function (query) {
  await handleCallback(query, deps);
}
