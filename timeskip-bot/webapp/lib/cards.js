// Колода карт.

import { shuffle } from './random.js';

export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

/** Старшинство: 2 → 2, …, A → 14. */
export const rankValue = (rank) => RANKS.indexOf(rank) + 2;
export const isRed = (card) => card.suit === '♥' || card.suit === '♦';

export function newDeck(decks = 1) {
  const cards = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) for (const rank of RANKS) cards.push({ rank, suit });
  }
  return shuffle(cards);
}

/** 'A♠' → { rank: 'A', suit: '♠' } — для тестов. */
export function card(text) {
  return { rank: text.slice(0, -1), suit: text.slice(-1) };
}
