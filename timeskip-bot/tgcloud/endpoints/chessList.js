// POST /api/chessList — мои онлайн-партии, свежие сверху.

import { myGames, requireUser, view } from '../lib/chessgames.js';

export default async function (input, ctx) {
  const user = requireUser(ctx);
  return { games: (await myGames(user.id)).map((g) => view(g, user.id)) };
}
