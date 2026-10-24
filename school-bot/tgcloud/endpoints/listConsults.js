// POST /api/listConsults — консультации для Mini App: общие (профмат «90+», «80+»),
// свои (видит только этот человек) и его еженедельные напоминания.

import { EndpointError } from 'sdk';
import { SHARED_CONSULTS, myConsult } from '../lib/consults.js';
import { myConsults, weeklyOf } from '../lib/consultStore.js';

export default async function (input, ctx) {
  const id = ctx.initData?.user?.id;
  if (!id) throw new EndpointError('открой приложение из чата с ботом', { code: 'NO_USER' });
  const [mine, weekly] = await Promise.all([myConsults(id), weeklyOf(id)]);
  return { shared: SHARED_CONSULTS, mine: mine.map(myConsult), weekly };
}
