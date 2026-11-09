// handlers/message — сообщения в личке (см. lib/app.js → handleMessage).

import { handleMessage } from '../lib/app.js';
import { makeDeps } from '../lib/telegram.js';

export default async function (message) {
  await handleMessage(message, await makeDeps());
}
