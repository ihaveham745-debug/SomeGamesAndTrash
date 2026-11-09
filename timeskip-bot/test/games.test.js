import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handValue, isBlackjack, settle } from '../webapp/lib/blackjack.js';
import { card, newDeck } from '../webapp/lib/cards.js';
import { PAYTABLE, evaluate } from '../webapp/lib/poker.js';
import { WHEEL, colorOf, payout, totalPayout } from '../webapp/lib/roulette.js';
import { SYMBOLS, multiplier, spin } from '../webapp/lib/slots.js';

const hand = (s) => s.split(' ').map(card);

test('колода: 52 разные карты, в шузе из 6 колод — 312', () => {
  assert.equal(new Set(newDeck().map((c) => c.rank + c.suit)).size, 52);
  assert.equal(newDeck(6).length, 312);
});

test('блэкджек: очки, мягкие тузы и расчёт', () => {
  assert.deepEqual(handValue(hand('A♠ 6♥')), { total: 17, soft: true });
  assert.deepEqual(handValue(hand('A♠ 6♥ 9♣')), { total: 16, soft: false });
  assert.equal(handValue(hand('A♠ A♥ A♣ 8♦')).total, 21);
  assert.equal(handValue(hand('K♠ Q♥ 5♣')).total, 25);
  assert.ok(isBlackjack(hand('A♠ K♥')));
  assert.ok(!isBlackjack(hand('7♠ 7♥ 7♣')));

  assert.deepEqual(settle(hand('A♠ K♥'), hand('9♠ 9♥'), 100), { result: 'blackjack', payout: 250 });
  assert.deepEqual(settle(hand('A♠ K♥'), hand('A♦ Q♣'), 100), { result: 'push', payout: 100 });
  assert.deepEqual(settle(hand('10♠ 9♥ 2♣'), hand('A♦ Q♣'), 100), { result: 'lose', payout: 0 });
  assert.deepEqual(settle(hand('K♠ Q♥ 5♣'), hand('K♦ 6♣ 9♥'), 100), { result: 'bust', payout: 0 });
  assert.deepEqual(settle(hand('K♠ 8♥'), hand('K♦ 6♣ 9♥'), 100), { result: 'win', payout: 200 });
  assert.deepEqual(settle(hand('K♠ 8♥'), hand('K♦ 8♣'), 200), { result: 'push', payout: 200 });
  assert.deepEqual(settle(hand('K♠ 7♥'), hand('K♦ 8♣'), 100), { result: 'lose', payout: 0 });
});

test('видеопокер: все комбинации', () => {
  const name = (s) => evaluate(hand(s))?.key ?? null;
  assert.equal(name('10♠ J♠ Q♠ K♠ A♠'), 'royal');
  assert.equal(name('9♥ 10♥ J♥ Q♥ K♥'), 'straightFlush');
  assert.equal(name('A♦ 2♦ 3♦ 4♦ 5♦'), 'straightFlush');
  assert.equal(name('7♠ 7♥ 7♦ 7♣ 2♠'), 'four');
  assert.equal(name('3♠ 3♥ 3♦ 9♣ 9♠'), 'fullHouse');
  assert.equal(name('2♣ 8♣ J♣ 4♣ K♣'), 'flush');
  assert.equal(name('A♠ 2♥ 3♦ 4♣ 5♠'), 'straight');
  assert.equal(name('10♠ J♥ Q♦ K♣ A♠'), 'straight');
  assert.equal(name('Q♠ K♥ A♦ 2♣ 3♠'), null);
  assert.equal(name('5♠ 5♥ 5♦ K♣ 2♠'), 'three');
  assert.equal(name('5♠ 5♥ 9♦ 9♣ 2♠'), 'twoPair');
  assert.equal(name('J♠ J♥ 3♦ 9♣ 2♠'), 'jacks');
  assert.equal(name('10♠ 10♥ 3♦ 9♣ 2♠'), null);
  assert.equal(PAYTABLE.length, 9);
});

test('рулетка: колесо, цвета и выплаты', () => {
  assert.equal(WHEEL.length, 37);
  assert.deepEqual([...WHEEL].sort((a, b) => a - b), Array.from({ length: 37 }, (_, i) => i));
  assert.equal(colorOf(0), 'green');
  assert.equal(colorOf(32), 'red');
  assert.equal(colorOf(15), 'black');
  assert.equal(payout('n17', 10, 17), 360);
  assert.equal(payout('n17', 10, 18), 0);
  assert.equal(payout('red', 10, 1), 20);
  assert.equal(payout('even', 10, 0), 0);
  assert.equal(payout('dozen3', 10, 36), 30);
  assert.equal(totalPayout({ red: 10, n0: 5, high: 20 }, 0), 180);
  // у каждой ставки преимущество казино одинаковое: 1/37
  for (const spot of ['red', 'odd', 'low', 'dozen2', 'n7']) {
    let back = 0;
    for (let n = 0; n <= 36; n++) back += payout(spot, 1, n);
    assert.equal(back, 36, spot);
  }
});

test('слоты: выплаты и средний возврат около 94%', () => {
  assert.equal(multiplier(['7️⃣', '7️⃣', '7️⃣']), 500);
  assert.equal(multiplier(['🍒', '🍋', '🍒']), 2);
  assert.equal(multiplier(['🍒', '🍋', '🍇']), 0);
  assert.equal(spin().length, 3);

  const W = SYMBOLS.reduce((s, x) => s + x.weight, 0);
  let rtp = 0;
  for (const a of SYMBOLS) for (const b of SYMBOLS) for (const c of SYMBOLS) {
    rtp += (a.weight * b.weight * c.weight / W ** 3) * multiplier([a.s, b.s, c.s]);
  }
  assert.ok(rtp > 0.9 && rtp < 1, `rtp ${rtp}`);
});
