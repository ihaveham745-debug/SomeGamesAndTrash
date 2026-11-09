// Блоки (как Block Blast): поле 8×8, по три фигуры за раз. Ставишь фигуру —
// заполненные ряды и столбцы сгорают. Нет места ни для одной фигуры — конец игры.
// Без DOM: состояние → новое состояние, чтобы проверять тестами.

import { randInt } from './random.js';

export const SIZE = 8;
export const COLORS = 7; // цвета фигур: 1…7, 0 — пустая клетка
export const COMBO_WINDOW = 3; // комбо держится, пока сжигаешь линию хотя бы раз за 3 хода
const CLEAR_BOARD_BONUS = 300;

// --- Фигуры ---

function normalize(cells) {
  const minR = Math.min(...cells.map(([r]) => r));
  const minC = Math.min(...cells.map(([, c]) => c));
  return cells.map(([r, c]) => [r - minR, c - minC]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

const rotate = (cells) => normalize(cells.map(([r, c]) => [c, -r]));
const mirror = (cells) => normalize(cells.map(([r, c]) => [r, -c]));
const keyOf = (cells) => cells.map((p) => p.join(':')).join(',');

/** Все различные повороты (и при mirror — отражения) фигуры. */
function variants(cells, withMirror = false) {
  const out = new Map();
  let cur = normalize(cells);
  for (let i = 0; i < 4; i++) {
    out.set(keyOf(cur), cur);
    if (withMirror) {
      const m = mirror(cur);
      out.set(keyOf(m), m);
    }
    cur = rotate(cur);
  }
  return [...out.values()];
}

const line = (n) => Array.from({ length: n }, (_, i) => [0, i]);
const rect = (h, w) => Array.from({ length: h * w }, (_, i) => [Math.floor(i / w), i % w]);

// weight — как часто выпадает каждая ориентация.
const SHAPES = [
  { name: 'dot', cells: [[0, 0]], weight: 2 },
  { name: 'line2', cells: line(2), weight: 3 },
  { name: 'line3', cells: line(3), weight: 3 },
  { name: 'line4', cells: line(4), weight: 2 },
  { name: 'line5', cells: line(5), weight: 2 },
  { name: 'square2', cells: rect(2, 2), weight: 6 },
  { name: 'square3', cells: rect(3, 3), weight: 3 },
  { name: 'rect2x3', cells: rect(2, 3), weight: 2 },
  { name: 'corner3', cells: [[0, 0], [1, 0], [1, 1]], weight: 2 },
  { name: 'l4', cells: [[0, 0], [1, 0], [2, 0], [2, 1]], weight: 1, mirror: true },
  { name: 't4', cells: [[0, 0], [0, 1], [0, 2], [1, 1]], weight: 1 },
  { name: 's4', cells: [[0, 1], [0, 2], [1, 0], [1, 1]], weight: 1, mirror: true },
  { name: 'corner5', cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], weight: 1 },
];

export const PIECES = SHAPES.flatMap((s) => variants(s.cells, s.mirror).map((cells, i) => ({
  id: `${s.name}-${i}`,
  cells,
  rows: Math.max(...cells.map(([r]) => r)) + 1,
  cols: Math.max(...cells.map(([, c]) => c)) + 1,
  weight: s.weight,
})));

// --- Поле ---

export const emptyBoard = () => Array(SIZE * SIZE).fill(0);
const at = (r, c) => r * SIZE + c;

export function canPlace(board, piece, row, col) {
  return piece.cells.every(([r, c]) => {
    const rr = row + r;
    const cc = col + c;
    return rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && board[at(rr, cc)] === 0;
  });
}

export function fitsAnywhere(board, piece) {
  for (let r = 0; r <= SIZE - piece.rows; r++) {
    for (let c = 0; c <= SIZE - piece.cols; c++) if (canPlace(board, piece, r, c)) return true;
  }
  return false;
}

/** Какие ряды и столбцы заполнены целиком. */
export function fullLines(board) {
  const rows = [];
  const cols = [];
  for (let i = 0; i < SIZE; i++) {
    let row = true;
    let col = true;
    for (let j = 0; j < SIZE; j++) {
      if (!board[at(i, j)]) row = false;
      if (!board[at(j, i)]) col = false;
    }
    if (row) rows.push(i);
    if (col) cols.push(i);
  }
  return { rows, cols };
}

/** Очки за ход: клетки фигуры + линии (1, 3, 6, 10… ×10) с множителем комбо. */
export function moveScore(cells, lines, combo) {
  if (!lines) return cells;
  return cells + 10 * ((lines * (lines + 1)) / 2) * Math.max(1, combo);
}

// --- Игра ---

const randomColor = (rand) => 1 + rand(COLORS);

function randomPiece(rand) {
  const total = PIECES.reduce((s, p) => s + p.weight, 0);
  let x = rand(total);
  for (const p of PIECES) {
    if (x < p.weight) return p;
    x -= p.weight;
  }
  return PIECES.at(-1);
}

/**
 * Три новые фигуры. Хотя бы одна обязана влезать (если на поле вообще есть место),
 * иначе игра кончалась бы не по вине игрока.
 */
export function dealPieces(board, rand = randInt) {
  let set = [];
  for (let attempt = 0; attempt < 10; attempt++) {
    set = [0, 1, 2].map(() => ({ piece: randomPiece(rand), color: randomColor(rand) }));
    if (set.some((s) => fitsAnywhere(board, s.piece))) return set;
  }
  const fitting = PIECES.filter((p) => fitsAnywhere(board, p));
  if (fitting.length) set[rand(3)] = { piece: fitting[rand(fitting.length)], color: randomColor(rand) };
  return set;
}

export function newGame(rand = randInt) {
  const board = emptyBoard();
  return { board, tray: dealPieces(board, rand), score: 0, combo: 0, sinceClear: 0, moves: 0, over: false, last: null };
}

const isOver = (board, tray) => !tray.some((s) => s && fitsAnywhere(board, s.piece));

/**
 * Поставить фигуру из лотка (index 0…2) левым верхним углом в (row, col).
 * Возвращает новое состояние или null, если так поставить нельзя.
 * state.last — что случилось за ход: { placed, rows, cols, points, combo, cleared }.
 */
export function play(state, index, row, col, rand = randInt) {
  const slot = state.tray[index];
  if (state.over || !slot || !canPlace(state.board, slot.piece, row, col)) return null;

  const board = [...state.board];
  const placed = slot.piece.cells.map(([r, c]) => at(row + r, col + c));
  for (const i of placed) board[i] = slot.color;

  const { rows, cols } = fullLines(board);
  for (const r of rows) for (let c = 0; c < SIZE; c++) board[at(r, c)] = 0;
  for (const c of cols) for (let r = 0; r < SIZE; r++) board[at(r, c)] = 0;
  const lines = rows.length + cols.length;

  let { combo, sinceClear } = state;
  if (lines) {
    combo += 1;
    sinceClear = 0;
  } else {
    sinceClear += 1;
    if (sinceClear >= COMBO_WINDOW) combo = 0;
  }

  const cleared = lines > 0 && board.every((x) => x === 0);
  const points = moveScore(placed.length, lines, combo) + (cleared ? CLEAR_BOARD_BONUS : 0);

  let tray = state.tray.map((s, i) => (i === index ? null : s));
  if (tray.every((s) => s === null)) tray = dealPieces(board, rand);

  return {
    board,
    tray,
    score: state.score + points,
    combo,
    sinceClear,
    moves: state.moves + 1,
    over: isOver(board, tray),
    last: { placed, rows, cols, points, combo: lines ? combo : 0, cleared },
  };
}
