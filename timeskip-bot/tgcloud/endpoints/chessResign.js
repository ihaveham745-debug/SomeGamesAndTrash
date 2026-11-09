// POST /api/chessResign { code } — сдаться (или отменить приглашение, пока соперника нет).

import { getGame, requireUser, resign, view } from '../lib/chessgames.js';

export default async function (input, ctx) {
  const user = requireUser(ctx);
  return view(await resign(await getGame(input?.code), user), user.id);
}
