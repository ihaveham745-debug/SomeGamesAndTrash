// POST /api/setClass {cls} — сменить класс в приложении; бот в личке тоже переключится.

import { EndpointError } from 'sdk';
import { isClass } from '../lib/schedule.js';
import { prefs } from '../lib/prefs.js';

export default async function (input, ctx) {
  const user = ctx.initData.user;
  if (!user) throw new EndpointError('открой приложение из чата с ботом', { code: 'NO_USER' });
  if (!isClass(input?.cls)) throw new EndpointError('неизвестный класс', { code: 'INVALID' });
  await prefs.set(user.id, input.cls);
  return { cls: input.cls };
}
