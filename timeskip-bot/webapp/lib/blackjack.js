// Блэкджек: 6 колод, дилер стоит на всех 17, блэкджек платит 3:2. Без сплита и страховки.

export function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 'A') {
      aces++;
      total += 11;
    } else {
      total += ['J', 'Q', 'K'].includes(c.rank) ? 10 : Number(c.rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export const isBlackjack = (cards) => cards.length === 2 && handValue(cards).total === 21;
export const isBust = (cards) => handValue(cards).total > 21;
export const dealerShouldHit = (cards) => handValue(cards).total < 17;

/**
 * Итог раздачи. bet — уже поставленное (с учётом удвоения).
 * payout — сколько вернуть игроку вместе со ставкой.
 */
export function settle(player, dealer, bet) {
  const p = handValue(player).total;
  const d = handValue(dealer).total;
  const pBJ = isBlackjack(player);
  const dBJ = isBlackjack(dealer);
  if (pBJ && dBJ) return { result: 'push', payout: bet };
  if (pBJ) return { result: 'blackjack', payout: bet * 2.5 };
  if (dBJ) return { result: 'lose', payout: 0 };
  if (p > 21) return { result: 'bust', payout: 0 };
  if (d > 21) return { result: 'win', payout: bet * 2 };
  if (p > d) return { result: 'win', payout: bet * 2 };
  if (p < d) return { result: 'lose', payout: 0 };
  return { result: 'push', payout: bet };
}
