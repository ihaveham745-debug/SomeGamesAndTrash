// Бот-соперник в шахматах: перебор с альфа-бета отсечением, взятия досчитываются
// до тишины, оценка — материал и таблицы «где фигуре лучше стоять».
// Сила задаётся глубиной, временем и долей случайности.

import { inCheck, legalMoves, makeMove } from './chess.js';

const VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
const MATE = 100000;

// Таблицы позиций для белых, клетка 0 = a8 (у чёрных — зеркально).
const PST = {
  P: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  N: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  B: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  R: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  Q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  K: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
  // король в эндшпиле идёт в центр
  KE: [
    -50, -40, -30, -20, -20, -30, -40, -50,
    -30, -20, -10, 0, 0, -10, -20, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -30, 0, 0, 0, 0, -30, -30,
    -50, -30, -30, -30, -30, -30, -30, -50,
  ],
};

const mirror = (i) => (7 - (i >> 3)) * 8 + (i & 7);

/** Оценка с точки зрения белых, в сотых долях пешки. */
export function evaluate(board) {
  let heavy = 0;
  for (const p of board) if (p && 'QRqr'.includes(p)) heavy += VALUE[p.toUpperCase()];
  const endgame = heavy <= 1300;
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p) continue;
    const t = p.toUpperCase();
    const table = t === 'K' && endgame ? PST.KE : PST[t];
    if (p === t) score += VALUE[t] + table[i];
    else score -= VALUE[t] + table[mirror(i)];
  }
  return score;
}

const sideEval = (state) => (state.turn === 'w' ? 1 : -1) * evaluate(state.board);

/** Сначала выгодные взятия и превращения — так отсечение работает лучше. */
function orderScore(m, hint) {
  if (hint && m.from === hint.from && m.to === hint.to && m.promo === hint.promo) return 1e6;
  let s = 0;
  if (m.captured) s += 10 * VALUE[m.captured.toUpperCase()] - VALUE[m.piece.toUpperCase()] + 1000;
  if (m.promo) s += VALUE[m.promo.toUpperCase()];
  return s;
}

const order = (moves, hint) => moves.sort((a, b) => orderScore(b, hint) - orderScore(a, hint));

class Timeout extends Error {}

function quiesce(state, alpha, beta, ctx, qdepth) {
  ctx.tick();
  const stand = sideEval(state);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  if (qdepth <= 0) return alpha;
  const captures = order(legalMoves(state).filter((m) => m.captured || m.promo));
  for (const m of captures) {
    const score = -quiesce(makeMove(state, m), -beta, -alpha, ctx, qdepth - 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(state, depth, alpha, beta, ply, ctx) {
  ctx.tick();
  if (state.half >= 100) return 0;
  const moves = legalMoves(state);
  if (!moves.length) return inCheck(state) ? -MATE + ply : 0;
  if (depth <= 0) return quiesce(state, alpha, beta, ctx, 4);
  order(moves);
  let best = -Infinity;
  for (const m of moves) {
    const score = -negamax(makeMove(state, m), depth - 1, -beta, -alpha, ply + 1, ctx);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

export const LEVELS = {
  easy: { depth: 1, ms: 300, noise: 140 },
  medium: { depth: 3, ms: 900, noise: 25 },
  hard: { depth: 6, ms: 1500, noise: 0 },
};

/**
 * Лучший ход по мнению бота. level — 'easy' | 'medium' | 'hard'.
 * random — для тестов (по умолчанию Math.random).
 */
export function bestMove(state, level = 'medium', random = Math.random) {
  const cfg = LEVELS[level] ?? LEVELS.medium;
  const moves = legalMoves(state);
  if (!moves.length) return null;
  if (moves.length === 1) return moves[0];

  const deadline = Date.now() + cfg.ms;
  let nodes = 0;
  const ctx = {
    tick() {
      nodes += 1;
      if ((nodes & 511) === 0 && Date.now() > deadline) throw new Timeout();
    },
  };

  let chosen = null;
  let scored = [];
  for (let depth = 1; depth <= cfg.depth; depth++) {
    try {
      const results = [];
      let alpha = -Infinity;
      for (const m of order(moves, chosen)) {
        // Шум делает слабых ботов «человечнее»: иногда выбирают не лучший ход.
        const noise = cfg.noise ? (random() - 0.5) * 2 * cfg.noise : 0;
        // Без шума ищем с узким окном (быстрее), с шумом — честно оцениваем каждый ход.
        const score = -negamax(makeMove(state, m), depth - 1, -Infinity, cfg.noise ? Infinity : -alpha, 1, ctx) + noise;
        results.push({ m, score });
        if (score > alpha) alpha = score;
      }
      results.sort((a, b) => b.score - a.score);
      scored = results;
      chosen = results[0].m;
      if (results[0].score > MATE / 2) break; // нашли мат — дальше думать незачем
    } catch (err) {
      if (!(err instanceof Timeout)) throw err;
      break;
    }
  }
  return chosen ?? scored[0]?.m ?? moves[0];
}
