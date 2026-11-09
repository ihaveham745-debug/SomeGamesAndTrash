// POST /api/chessCreate { color: 'w' | 'b' | 'random', kind: 'chess' | 'checkers' } — новая партия с другом, ждём соперника.

import { createGame, requireUser, view } from '../lib/chessgames.js';

export default async function (input, ctx) {
  const user = requireUser(ctx);
  return view(await createGame(user, input?.color, input?.kind ?? 'chess'), user.id);
}
