// POST /api/chessList { kind } — мои онлайн-партии в шахматы или шашки, свежие сверху.

import { myGames, requireUser, view } from '../lib/chessgames.js';

export default async function (input, ctx) {
  const user = requireUser(ctx);
  const kind = input?.kind === 'checkers' ? 'checkers' : 'chess';
  return { games: (await myGames(user.id, kind)).map((g) => view(g, user.id)) };
}
