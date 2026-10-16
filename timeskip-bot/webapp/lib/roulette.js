// Европейская рулетка: одно зеро.

// Порядок чисел на колесе по часовой стрелке, начиная с зеро.
export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export function colorOf(n) {
  if (n === 0) return 'green';
  return RED.has(n) ? 'red' : 'black';
}

// Внешние ставки: какие числа выигрывают и во сколько раз возвращается ставка.
export const OUTSIDE = {
  red: { label: 'Красное', en: 'Red', wins: (n) => colorOf(n) === 'red', mult: 2 },
  black: { label: 'Чёрное', en: 'Black', wins: (n) => colorOf(n) === 'black', mult: 2 },
  even: { label: 'Чёт', en: 'Even', wins: (n) => n !== 0 && n % 2 === 0, mult: 2 },
  odd: { label: 'Нечет', en: 'Odd', wins: (n) => n % 2 === 1, mult: 2 },
  low: { label: '1–18', wins: (n) => n >= 1 && n <= 18, mult: 2 },
  high: { label: '19–36', wins: (n) => n >= 19, mult: 2 },
  dozen1: { label: '1–12', wins: (n) => n >= 1 && n <= 12, mult: 3 },
  dozen2: { label: '13–24', wins: (n) => n >= 13 && n <= 24, mult: 3 },
  dozen3: { label: '25–36', wins: (n) => n >= 25, mult: 3 },
};

/** Ставка: 'red', 'dozen2' … или 'n17' — на число (возврат ×36). */
export function payout(spot, amount, result) {
  if (spot.startsWith('n')) return Number(spot.slice(1)) === result ? amount * 36 : 0;
  const bet = OUTSIDE[spot];
  return bet && bet.wins(result) ? amount * bet.mult : 0;
}

/** Сумма выигрыша по всем ставкам { spot: amount }. */
export function totalPayout(bets, result) {
  return Object.entries(bets).reduce((sum, [spot, amount]) => sum + payout(spot, amount, result), 0);
}
