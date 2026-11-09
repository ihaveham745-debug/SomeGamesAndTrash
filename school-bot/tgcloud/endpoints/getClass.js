// POST /api/getClass — класс, выбранный в личке с ботом (id лички = id пользователя).

import { prefs } from '../lib/prefs.js';

export default async function (input, ctx) {
  const id = ctx.initData?.user?.id;
  return { cls: id ? await prefs.get(id) : null };
}
