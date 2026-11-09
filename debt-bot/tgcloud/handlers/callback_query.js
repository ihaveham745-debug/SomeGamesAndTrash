// handlers/callback_query — нажатия кнопок (см. lib/app.js → handleCallback).

import { handleCallback } from '../lib/app.js';
import { makeDeps } from '../lib/telegram.js';

export default async function (query) {
  await handleCallback(query, await makeDeps());
}
