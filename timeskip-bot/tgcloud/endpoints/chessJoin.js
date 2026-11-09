// POST /api/chessJoin { code } — открыть партию по приглашению (и сесть за свободный цвет).

import { getGame, joinGame, requireUser, view } from '../lib/chessgames.js';

export default async function (input, ctx) {
  const user = requireUser(ctx);
  return view(await joinGame(await getGame(input?.code), user), user.id);
}
