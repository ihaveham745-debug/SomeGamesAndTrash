import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  START_FEN, findMove, fromFen, legalMoves, outcome, perft, play, replay, san, toFen,
} from '../webapp/lib/chess.js';

// Эталонные числа позиций (chessprogramming.org/Perft_Results).
const PERFT = [
  [START_FEN, [20, 400, 8902, 197281]],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
];

test('генератор ходов: эталонные perft', () => {
  for (const [fen, counts] of PERFT) {
    const state = fromFen(fen);
    counts.forEach((n, i) => assert.equal(perft(state, i + 1), n, `${fen} depth ${i + 1}`));
  }
});

test('FEN туда-обратно', () => {
  for (const [fen] of PERFT) assert.equal(toFen(fromFen(fen)), fen);
});

test('мат, пат и ничьи', () => {
  const fools = replay(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
  assert.deepEqual(outcome(fools), { over: true, result: '0-1', reason: 'mate', winner: 'b' });
  assert.equal(outcome(fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).reason, 'stalemate');
  assert.equal(outcome(fromFen('8/8/4k3/8/8/2K5/8/8 w - - 0 1')).reason, 'material');
  assert.equal(outcome(fromFen('8/8/4k3/8/8/2KB4/8/8 w - - 0 1')).reason, 'material');
  assert.equal(outcome(fromFen('8/8/4k3/8/8/2KR4/8/8 w - - 0 1')).over, false);
  assert.equal(outcome(fromFen('8/8/4k3/8/8/2KR4/8/8 w - - 100 80')).reason, 'fifty');
  const rep = replay(['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']);
  assert.equal(outcome(rep).reason, 'repetition');
});

test('нелегальные ходы не проходят', () => {
  const s = fromFen();
  assert.equal(play(s, 'e2e5'), null);
  assert.equal(play(s, 'e7e5'), null); // не их очередь
  assert.equal(play(s, 'zz'), null);
  // связанный конь не ходит
  const pinned = fromFen('4k3/4r3/8/8/8/8/4N3/4K3 w - - 0 1');
  assert.equal(legalMoves(pinned).filter((m) => m.piece === 'N').length, 0);
  // рокировка через битое поле запрещена
  const s2 = fromFen('4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1');
  assert.equal(findMove(s2, 'e1g1'), null);
  assert.ok(findMove(fromFen('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1'), 'e1g1'));
});

test('запись ходов', () => {
  const s = fromFen();
  assert.equal(san(s, findMove(s, 'g1f3')), 'Nf3');
  assert.equal(san(s, findMove(s, 'g1f3'), true), 'Кf3');
  const s2 = fromFen('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  assert.equal(san(s2, findMove(s2, 'e1c1')), 'O-O-O');
  const s3 = fromFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
  assert.equal(san(s3, findMove(s3, 'a7a8q')), 'a8=Q+');
  const s4 = fromFen('4k3/8/8/8/8/8/K7/R6R w - - 0 1');
  assert.equal(san(s4, findMove(s4, 'a1d1')), 'Rad1');
  assert.equal(san(fools(), findMove(fools(), 'd8h4')), 'Qh4#');
});
const fools = () => replay(['f2f3', 'e7e5', 'g2g4']);

test('серверная копия правил совпадает с браузерной', () => {
  const a = readFileSync(new URL('../webapp/lib/chess.js', import.meta.url), 'utf8');
  let b;
  try {
    b = readFileSync(new URL('../tgcloud/lib/chess.js', import.meta.url), 'utf8');
  } catch {
    return; // копию кладёт deploy — до первого деплоя её нет
  }
  assert.equal(b, a, 'запусти npm run deploy (или scripts/sync-lib.mjs), чтобы обновить tgcloud/lib/chess.js');
});

test('бот: ставит мат в один ход, берёт висящего ферзя, думает недолго', async () => {
  const { bestMove } = await import('../webapp/lib/chessai.js');
  const { toUci } = await import('../webapp/lib/chess.js');
  // Мат ладьёй по последней горизонтали
  const mate = fromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
  for (const level of ['medium', 'hard']) assert.equal(toUci(bestMove(mate, level)), 'a1a8', level);
  // Ферзь чёрных висит
  const hanging = fromFen('rnb1kbnr/pppp1ppp/8/4p3/4P2q/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1');
  assert.equal(toUci(bestMove(hanging, 'medium')), 'f3h4');
  const t = Date.now();
  bestMove(fromFen(), 'hard');
  assert.ok(Date.now() - t < 2500, `hard думал ${Date.now() - t} мс`);
  // лёгкий бот всегда ходит легально
  let s = fromFen();
  for (let i = 0; i < 30 && !outcome(s).over; i++) s = play(s, toUci(bestMove(s, 'easy')));
  assert.ok(s);
});
