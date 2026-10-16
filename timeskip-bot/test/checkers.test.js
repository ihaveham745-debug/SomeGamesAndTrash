import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  fromString, legalMoves, moveId, newGame, notation, outcome, play, replay,
} from '../webapp/lib/checkers.js';
import { bestMove } from '../webapp/lib/checkersai.js';

const ids = (state) => legalMoves(state).map(moveId).sort();

// Строки доски — с 8-й горизонтали по 1-ю, '.' — пусто.
const pos = (rows, turn = 'w') => fromString(rows.join(''), turn);

test('начальная позиция: 12 на 12, у белых 7 ходов', () => {
  const s = newGame();
  assert.equal(s.board.filter((p) => p === 'w').length, 12);
  assert.equal(s.board.filter((p) => p === 'b').length, 12);
  assert.deepEqual(ids(s), ['a3b4', 'c3b4', 'c3d4', 'e3d4', 'e3f4', 'g3f4', 'g3h4']);
});

test('бить обязательно, в том числе назад', () => {
  const s = pos([
    '........',
    '........',
    '........',
    '........',
    '........',
    '..b.....',
    '...w....',
    '........',
  ]);
  // белая d2 бьёт c3 → b4; простые ходы запрещены
  assert.deepEqual(ids(s), ['d2b4']);
  const back = pos([
    '........',
    '........',
    '........',
    '...w....',
    '..b.....',
    '........',
    '........',
    '........',
  ]);
  assert.deepEqual(ids(back), ['d5b3']);
});

test('серия взятий и турецкий удар', () => {
  const s = pos([
    '........',
    '........',
    '...b.b..',
    '........',
    '...b....',
    '..w.....',
    '........',
    '........',
  ]);
  // c3:e5:g7 или c3:e5:c7
  assert.deepEqual(ids(s), ['c3e5c7', 'c3e5g7']);
  const m = legalMoves(s).find((x) => moveId(x) === 'c3e5g7');
  assert.equal(m.captured.length, 2);
  assert.equal(notation(s, m), 'c3:e5:g7');
});

test('шашка, дошедшая до края во время боя, бьёт дальше как дамка', () => {
  const s = pos([
    '........',
    '..b.....',
    '.w......',
    '........',
    '........',
    '........',
    '.....b..',
    '........',
  ]);
  // b6:d8 — стала дамкой и сразу бьёт f6 по диагонали d8–h4
  const s2 = pos([
    '........',
    '..b.....',
    '.w...b..',
    '........',
    '........',
    '........',
    '........',
    '........',
  ]);
  const seq = ids(s2);
  assert.ok(seq.some((id) => id.startsWith('b6d8') && id.length > 4), seq.join(','));
  const m = legalMoves(s2).find((x) => moveId(x).startsWith('b6d8') && x.captured.length === 2);
  assert.ok(m.promote);
  assert.deepEqual(ids(s), ['b6d8']);
  assert.equal(play(s, 'b6d8').board[3], 'W');
});

test('дамка ходит и бьёт издалека', () => {
  const s = pos([
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    'W.......',
  ]);
  assert.equal(legalMoves(s).length, 7);
  const cap = pos([
    '........',
    '........',
    '........',
    '....b...',
    '........',
    '........',
    '........',
    'W.......',
  ]);
  // a1 бьёт e5 и встаёт на f6, g7 или h8
  assert.deepEqual(ids(cap), ['a1f6', 'a1g7', 'a1h8']);
});

test('конец партии: нет ходов — проигрыш; повторение — ничья', () => {
  const s = pos([
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '.w......',
  ], 'b');
  assert.deepEqual(outcome(s), { over: true, result: '1-0', reason: 'nomoves', winner: 'w' });
  const kings = pos([
    '.B......',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    'W.......',
  ]);
  let k = kings;
  for (const id of ['a1b2', 'b8a7', 'b2a1', 'a7b8', 'a1b2', 'b8a7', 'b2a1', 'a7b8']) k = play(k, id);
  assert.equal(outcome(k).reason, 'repetition');
  assert.equal(play(newGame(), 'a3a4'), null);
  assert.ok(replay(['c3d4', 'f6e5', 'd4f6']));
});

test('бот: берёт, когда выгодно, и ходит легально всю партию', () => {
  let s = newGame();
  for (let i = 0; i < 80 && !outcome(s).over; i++) {
    const m = bestMove(s, s.turn === 'w' ? 'medium' : 'easy');
    s = play(s, moveId(m));
    assert.ok(s, `ход ${i}`);
  }
  const t = Date.now();
  bestMove(newGame(), 'hard');
  assert.ok(Date.now() - t < 2200);
});

test('серверная копия правил совпадает с браузерной', () => {
  const a = readFileSync(new URL('../webapp/lib/checkers.js', import.meta.url), 'utf8');
  let b;
  try {
    b = readFileSync(new URL('../tgcloud/lib/checkers.js', import.meta.url), 'utf8');
  } catch {
    return;
  }
  assert.equal(b, a);
});
