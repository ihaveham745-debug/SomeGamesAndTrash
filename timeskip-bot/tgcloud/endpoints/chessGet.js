// POST /api/chessGet { code } — состояние партии; приложение спрашивает раз в пару секунд.

import { getGame, requireUser, touch, view } from '../lib/chessgames.js';

export default async function (input, ctx) {
  const user = requireUser(ctx);
  return view(await touch(await getGame(input?.code), user.id), user.id);
}
