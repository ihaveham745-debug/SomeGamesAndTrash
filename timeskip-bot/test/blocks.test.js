import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PIECES, SIZE, canPlace, dealPieces, emptyBoard, fitsAnywhere, fullLines, moveScore, newGame, play,
} from '../webapp/lib/blocks.js';

const piece = (id) => PIECES.find((p) => p.id === id);
/** Предсказуемый «случай»: всегда 0 → первая фигура (точка) цвета 1. */
const zero = () => 0;

test('фигуры: повороты без повторов, размеры посчитаны', () => {
  const keys = PIECES.map((p) => p.cells.join('|'));
  assert.equal(new Set(keys).size, PIECES.length);
  assert.equal(PIECES.filter((p) => p.id.startsWith('line5')).length, 2);
  assert.equal(PIECES.filter((p) => p.id.startsWith('square3')).length, 1);
  assert.equal(PIECES.filter((p) => p.id.startsWith('l4')).length, 8);
  assert.equal(PIECES.filter((p) => p.id.startsWith('t4')).length, 4);
  assert.equal(PIECES.filter((p) => p.id.startsWith('s4')).length, 4);
  const sq = piece('square3-0');
  assert.deepEqual([sq.rows, sq.cols, sq.cells.length], [3, 3, 9]);
});

test('ставить можно только на пустые клетки внутри поля', () => {
  const board = emptyBoard();
  const l5 = PIECES.find((p) => p.id.startsWith('line5') && p.cols === 5);
  assert.ok(canPlace(board, l5, 0, 3));
  assert.ok(!canPlace(board, l5, 0, 4));
  board[2] = 1;
  assert.ok(!canPlace(board, l5, 0, 0));
  assert.ok(fitsAnywhere(board, l5));
});

test('полный ряд и столбец сгорают за один ход, очки и комбо', () => {
  const s = newGame(zero);
  // ряд 0 заполнен, кроме (0,7); столбец 7 заполнен, кроме (0,7)
  for (let c = 0; c < 7; c++) s.board[c] = 2;
  for (let r = 1; r < SIZE; r++) s.board[r * SIZE + 7] = 3;
  s.tray = [{ piece: piece('dot-0'), color: 5 }, null, { piece: piece('dot-0'), color: 5 }];
  const next = play(s, 0, 0, 7, zero);
  assert.deepEqual(fullLines(next.board), { rows: [], cols: [] });
  assert.deepEqual([next.last.rows, next.last.cols], [[0], [7]]);
  assert.ok(next.board.every((x) => x === 0));
  assert.equal(next.last.cleared, true);
  // 1 клетка + 2 линии (10×3) × комбо 1 + бонус за чистое поле
  assert.equal(next.last.points, 1 + 30 + 300);
  assert.equal(next.combo, 1);
  assert.equal(next.tray[0], null);
});

test('комбо растёт при сжигании подряд и сбрасывается после 3 ходов без линий', () => {
  assert.equal(moveScore(4, 0, 5), 4);
  assert.equal(moveScore(4, 1, 1), 14);
  assert.equal(moveScore(4, 1, 3), 34);
  assert.equal(moveScore(5, 3, 2), 125);

  let s = newGame(zero);
  s = { ...s, combo: 2, sinceClear: 0, tray: [0, 1, 2].map(() => ({ piece: piece('dot-0'), color: 1 })) };
  s = play(s, 0, 4, 4, zero);
  s = play(s, 1, 6, 6, zero);
  assert.equal(s.combo, 2);
  s = play(s, 2, 2, 2, zero);
  assert.equal(s.combo, 0);
});

test('после трёх фигур выдаются новые; занятое поле — конец игры', () => {
  let s = newGame(zero);
  s = { ...s, tray: [{ piece: piece('dot-0'), color: 1 }, null, null] };
  s = play(s, 0, 3, 3, zero);
  assert.equal(s.tray.filter(Boolean).length, 3);
  assert.equal(play(s, 0, 3, 3, zero), null); // клетка занята

  // поле в шахматку: даже точка влезает, а 2×2 — нет
  const board = emptyBoard().map((_, i) => ((Math.floor(i / SIZE) + i) % 2 ? 1 : 0));
  const big = { piece: piece('square2-0'), color: 1 };
  const over = play({ ...newGame(zero), board, tray: [{ piece: piece('dot-0'), color: 1 }, big, big] }, 0, 0, 0, zero);
  assert.equal(over.over, true);
});

test('новый набор старается влезть', () => {
  const almostFull = emptyBoard().fill(1);
  almostFull[0] = 0;
  const set = dealPieces(almostFull);
  assert.equal(set.length, 3);
  assert.ok(set.some((s) => fitsAnywhere(almostFull, s.piece)));
});
