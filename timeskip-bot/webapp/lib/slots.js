// Слоты: 3 барабана, у каждого символа свой вес (чем ценнее, тем реже).
// Возврат в среднем ≈94% ставки — проверяется в test/games.test.js.

import { weighted } from './random.js';

export const SYMBOLS = [
  { s: '🍒', weight: 7, three: 10 },
  { s: '🍋', weight: 6, three: 15 },
  { s: '🍇', weight: 5, three: 20 },
  { s: '🔔', weight: 4, three: 30 },
  { s: '⭐', weight: 3, three: 60 },
  { s: '💎', weight: 2, three: 150 },
  { s: '7️⃣', weight: 1, three: 500 },
];

// Две вишни где угодно — возврат ×2.
export const TWO_CHERRIES = 2;

export const spin = () => [0, 1, 2].map(() => weighted(SYMBOLS).s);

/** Во сколько раз вернуть ставку: 0 — проигрыш. */
export function multiplier(reels) {
  if (reels[0] === reels[1] && reels[1] === reels[2]) return SYMBOLS.find((x) => x.s === reels[0]).three;
  if (reels.filter((s) => s === '🍒').length === 2) return TWO_CHERRIES;
  return 0;
}
