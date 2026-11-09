// Бот для шашек: перебор с альфа-бета отсечением и углублением по времени.
// Оценка: шашки, дамки, продвижение вперёд, центр и «тыл» (последний ряд не отдаём даром).

import { colorOf, isKing, legalMoves, makeMove } from './checkers.js';

const MAN = 100;
const KING = 300;
const WIN = 100000;

export function evaluate(board) {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p) continue;
    const r = i >> 3;
    const c = i & 7;
    const white = colorOf(p) === 'w';
    let v;
    if (isKing(p)) v = KING;
    else {
      const advance = white ? 7 - r : r;
      v = MAN + advance * 4;
      if ((white && r === 7) || (!white && r === 0)) v += 8; // держим тыл
    }
    if (c >= 2 && c <= 5 && r >= 2 && r <= 5) v += 6; // центр
    score += white ? v : -v;
  }
  return score;
}

const sideEval = (state) => (state.turn === 'w' ? 1 : -1) * evaluate(state.board);

class Timeout extends Error {}

function negamax(state, depth, alpha, beta, ply, ctx) {
  ctx.tick();
  const moves = legalMoves(state);
  if (!moves.length) return -WIN + ply;
  // взятия досчитываем, даже если глубина кончилась
  if (depth <= 0 && !moves[0].captured.length) return sideEval(state);
  if (depth <= -6) return sideEval(state);
  moves.sort((a, b) => b.captured.length - a.captured.length || Number(b.promote) - Number(a.promote));
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
  easy: { depth: 2, ms: 300, noise: 70 },
  medium: { depth: 5, ms: 900, noise: 12 },
  hard: { depth: 10, ms: 1500, noise: 0 },
};

export function bestMove(state, level = 'medium', random = Math.random) {
  const cfg = LEVELS[level] ?? LEVELS.medium;
  const moves = legalMoves(state);
  if (moves.length <= 1) return moves[0] ?? null;
  const deadline = Date.now() + cfg.ms;
  let nodes = 0;
  const ctx = {
    tick() {
      nodes += 1;
      if ((nodes & 255) === 0 && Date.now() > deadline) throw new Timeout();
    },
  };
  let chosen = null;
  for (let depth = 1; depth <= cfg.depth; depth++) {
    try {
      let bestScore = -Infinity;
      let bestM = null;
      const ordered = chosen ? [chosen, ...moves.filter((m) => m !== chosen)] : moves;
      for (const m of ordered) {
        const noise = cfg.noise ? (random() - 0.5) * 2 * cfg.noise : 0;
        const score = -negamax(makeMove(state, m), depth - 1, -Infinity, cfg.noise ? Infinity : -bestScore, 1, ctx) + noise;
        if (score > bestScore) {
          bestScore = score;
          bestM = m;
        }
      }
      chosen = bestM;
      if (bestScore > WIN / 2) break;
    } catch (err) {
      if (!(err instanceof Timeout)) throw err;
      break;
    }
  }
  return chosen ?? moves[0];
}
