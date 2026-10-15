// POST /api/chessMove { code, uci, ply } — ход. ply — сколько ходов уже было (защита от двойного хода).

import { getGame, makeMove, requireUser, view } from '../lib/chessgames.js';

export default async function (input, ctx) {
  const user = requireUser(ctx);
  const game = await getGame(input?.code);
  return view(await makeMove(game, user, String(input?.uci ?? ''), Number(input?.ply)), user.id);
}
