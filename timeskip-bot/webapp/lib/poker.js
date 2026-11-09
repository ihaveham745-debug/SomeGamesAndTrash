// Видеопокер «Jacks or Better»: 5 карт, оставляешь нужные, остальные меняешь один раз.

import { rankValue } from './cards.js';

// mult — сколько вернуть за 1 фишку ставки (вместе со ставкой).
export const PAYTABLE = [
  { key: 'royal', name: 'Роял-флеш', en: 'Royal Flush', mult: 800 },
  { key: 'straightFlush', name: 'Стрит-флеш', en: 'Straight Flush', mult: 50 },
  { key: 'four', name: 'Каре', en: 'Four of a Kind', mult: 25 },
  { key: 'fullHouse', name: 'Фулл-хаус', en: 'Full House', mult: 9 },
  { key: 'flush', name: 'Флеш', en: 'Flush', mult: 6 },
  { key: 'straight', name: 'Стрит', en: 'Straight', mult: 4 },
  { key: 'three', name: 'Тройка', en: 'Three of a Kind', mult: 3 },
  { key: 'twoPair', name: 'Две пары', en: 'Two Pair', mult: 2 },
  { key: 'jacks', name: 'Пара от валетов', en: 'Jacks or Better', mult: 1 },
];

const BY_KEY = Object.fromEntries(PAYTABLE.map((p) => [p.key, p]));

/** Комбинация из 5 карт или null, если ничего не выиграно. */
export function evaluate(hand) {
  const values = hand.map((c) => rankValue(c.rank)).sort((a, b) => a - b);
  const counts = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  const groups = Object.entries(counts).map(([v, n]) => ({ v: Number(v), n })).sort((a, b) => b.n - a.n || b.v - a.v);

  const flush = hand.every((c) => c.suit === hand[0].suit);
  const unique = groups.length === 5;
  const wheel = values.join() === '2,3,4,5,14'; // A-2-3-4-5
  const straight = unique && (values[4] - values[0] === 4 || wheel);

  let key = null;
  if (straight && flush) key = values[0] === 10 ? 'royal' : 'straightFlush';
  else if (groups[0].n === 4) key = 'four';
  else if (groups[0].n === 3 && groups[1].n === 2) key = 'fullHouse';
  else if (flush) key = 'flush';
  else if (straight) key = 'straight';
  else if (groups[0].n === 3) key = 'three';
  else if (groups[0].n === 2 && groups[1].n === 2) key = 'twoPair';
  else if (groups[0].n === 2 && groups[0].v >= 11) key = 'jacks';
  return key && BY_KEY[key];
}
